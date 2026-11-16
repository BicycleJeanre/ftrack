import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBusinessModelPlan, getBusinessModelTestCases } from '../../js/domain/calculations/business-model.js';
import { generateProjectionsForScenario } from '../../js/domain/calculations/projection-engine.js';
import { sanitizeScenarioForWrite } from '../../js/shared/app-data-utils.js';

const lookup = JSON.parse(readFileSync(new URL('../../assets/lookup-data.json', import.meta.url), 'utf8'));
const scenario = {
  id: 1,
  timeframe: { startDate: '2027-01-01', endDate: '2027-03-31', periodTypeId: 3 },
  accounts: [{ id: 1, name: 'Business cash', startingBalance: 1000 },
    { id: 2, name: 'Owner cash', startingBalance: 2000 }],
  transactions: [{ id: 77, primaryAccountId: 1, transactionTypeId: 1, amount: 30, effectiveDate: '2027-01-12' }],
  transactionOccurrences: [{ id: 84, origin: 'manual', status: 'actual',
    scheduledDate: '2027-01-15', actualDate: '2027-01-15', actualAmount: 70,
    primaryAccountId: 1, transactionTypeId: 1 }]
};
const model = {
  cashAccountId: 1, ownerAccountId: 2, minimumCash: '100',
  variables: [{ id: 'clients', name: 'Customers', value: '4', overrides: '2027-02=8' },
    { id: 'fee', name: 'Monthly fee', value: '100' }],
  flows: [
    { name: 'Recurring fees', kind: 'revenue', model: 'volume', quantity: 'clients', rateVariable: 'fee', delay: '1' },
    { name: 'Walk-in sales', kind: 'revenue', model: 'fixed', rate: '50' },
    { name: 'Payroll', kind: 'cost', model: 'stepped', quantity: 'clients', rate: '100', threshold: '8', secondRate: '450' },
    { name: 'Commission', kind: 'cost', model: 'revenueShare', rate: '10' },
    { name: 'Setup purchase', kind: 'investment', frequency: 'once', rate: '200' },
    { name: 'Owner contribution', kind: 'funding', frequency: 'once', counterpartyId: '2', rate: '100' }
  ],
  sweep: { variable: 'clients', start: '7', end: '8', step: '1' }
};

test('mixed business plan uses actuals and existing plan rules via the projection engine without writing', async () => {
  const snapshot = structuredClone(scenario);
  const plan = buildBusinessModelPlan(scenario, model);
  assert.equal(plan.deferredCount, 1);
  assert.deepEqual([...plan.totals], [
    ['2027-02', { revenue: 450, cost: 635 }],
    ['2027-01', { revenue: 50, cost: 145 }],
    ['2027-03', { revenue: 850, cost: 145 }]
  ]);
  const candidate = { ...scenario, transactions: [...scenario.transactions, ...plan.rules] };
  const preview = await generateProjectionsForScenario(candidate, {}, lookup);
  const baseline = await generateProjectionsForScenario(scenario, {}, lookup);
  const balances = (rows, id) => rows.filter(row => row.accountId === id).map(row => row.balance);
  assert.deepEqual(balances(baseline, 1), [1100, 1100, 1100]);
  assert.deepEqual(balances(preview, 1), [905, 720, 1425]);
  assert.deepEqual(balances(preview, 2), [1900, 1900, 1900]);
  assert.equal(plan.rules.find(rule => rule.description === 'Walk-in sales').recurrence.endDate, '2027-03-01');
  assert.ok(plan.rules.every(rule => rule.id > 84));
  assert.deepEqual(scenario, snapshot);
});

test('a sweep replaces the selected variable across months and captures non-monotonic salary thresholds', () => {
  const cases = getBusinessModelTestCases(model);
  assert.deepEqual(cases.map(entry => entry.value), [7, 8]);
  const [seven, eight] = cases.map(entry => buildBusinessModelPlan(scenario, model, entry));
  assert.equal(seven.totals.get('2027-02').revenue, 750);
  assert.equal(eight.totals.get('2027-02').revenue, 850);
  assert.ok(seven.totals.get('2027-02').revenue - seven.totals.get('2027-02').cost >
    eight.totals.get('2027-02').revenue - eight.totals.get('2027-02').cost);
});

test('occupancy, commission on volume, and tiered usage compile to normal monthly rules', () => {
  const plan = buildBusinessModelPlan(scenario, {
    cashAccountId: '1',
    variables: [{ id: 'units', name: 'Units', value: 100 }, { id: 'occ', name: 'Occupancy', value: 35 }],
    flows: [
      { kind: 'revenue', model: 'occupancy', name: 'Room bookings', quantity: 'units', occupancy: 'occ', rate: 200 },
      { kind: 'revenue', model: 'share', name: 'Marketplace', quantity: 'units', rate: 10 },
      { kind: 'revenue', model: 'tiered', name: 'Usage', quantity: 'units', rate: 2, threshold: 60, secondRate: 1, minimum: 175 }
    ]
  });
  assert.deepEqual(plan.rules.map(rule => rule.amount), [7000, 10, 175]);
});

test('payments on the 31st clamp independently of later months; partial scenario end is respected', () => {
  const plan = buildBusinessModelPlan({ ...scenario, timeframe: { ...scenario.timeframe, endDate: '2027-03-30' } }, {
    cashAccountId: '1',
    flows: [{ name: 'Month end', rate: 900, startDate: '2027-01-31', delay: 1 }]
  });
  assert.deepEqual(plan.rules.map(rule => rule.effectiveDate), ['2027-02-28']);
  assert.equal(plan.deferredCount, 1);
});

test('drafts survive normalization and invalid references and unbounded sweeps fail clearly', () => {
  const stored = sanitizeScenarioForWrite({ ...scenario, name: 'Business',
    planning: { workshopStrategy: 'business', businessModel: model } });
  assert.equal(stored.planning.workshopStrategy, 'business');
  assert.equal(stored.planning.businessModel.variables[0].overrides, '2027-02=8');
  assert.throws(() => buildBusinessModelPlan(scenario, { ...model, variables: [] }), /existing variable/);
  assert.throws(() => getBusinessModelTestCases({ ...model, sweep: { variable: 'clients', start: 0, end: 100 } }), /up to 30/);
});
