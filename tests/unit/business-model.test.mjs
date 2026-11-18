import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildBusinessModelPlan, evaluateBusinessBreakEven, evaluateBusinessOperatingWindow,
  getBusinessModelTestCases, getBusinessOperatingMonths, isBetterBusinessTestCase
} from '../../js/domain/calculations/business-model.js';
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

test('operating break-even uses scheduled payments, excludes startup and funding, and can include repayments', () => {
  const plan = buildBusinessModelPlan(scenario, { ...model, flows: [
    ...model.flows,
    { name: 'Loan repayment', kind: 'repayment', model: 'fixed', rate: '200' }
  ] });
  const months = getBusinessOperatingMonths(plan);
  assert.deepEqual(months, ['2027-01', '2027-02', '2027-03']);
  // Revenue collected later belongs to the payment month, not the activity month.
  assert.equal(evaluateBusinessOperatingWindow(plan, { months: months.slice(0, 1) }).net, -95);
  assert.equal(evaluateBusinessOperatingWindow(plan, { months }).net, 425);
  assert.equal(evaluateBusinessOperatingWindow(plan, { months, includeRepayments: true }).net, -175);
  assert.deepEqual(evaluateBusinessOperatingWindow({ totals: new Map([
    [months[0], { revenue: 0.1 + 0.2, cost: 0.3 }]
  ]) }, { months }).met, true);
});

test('windows without counted payments do not break even, while equal receipts and costs do', () => {
  const plan = buildBusinessModelPlan(scenario, { ...model, flows: [
    { name: 'Delayed receipts', kind: 'revenue', frequency: 'once', rate: '100', delay: '1' },
    { name: 'Delayed costs', kind: 'cost', frequency: 'once', rate: '100', delay: '1' },
    { name: 'Funding only', kind: 'funding', frequency: 'once', rate: '500' },
    { name: 'Repayment', kind: 'repayment', frequency: 'once', rate: '50' }
  ] });
  const january = { months: ['2027-01'] };
  const inactive = evaluateBusinessOperatingWindow(plan, january);
  assert.deepEqual([inactive.net, inactive.inactive, inactive.met], [0, true, false]);
  const withRepayment = evaluateBusinessOperatingWindow(plan, { ...january, includeRepayments: true });
  assert.deepEqual([withRepayment.net, withRepayment.inactive, withRepayment.met], [-50, false, false]);
  const balanced = evaluateBusinessOperatingWindow(plan, { months: ['2027-02'] });
  assert.deepEqual([balanced.net, balanced.inactive, balanced.met], [0, false, true]);
});

test('other operating amounts exclude direct and indirect test-dependent flows, using the payment month', () => {
  const plan = buildBusinessModelPlan(scenario, { ...model, flows: [...model.flows,
    { name: 'Fixed rent', kind: 'cost', model: 'fixed', rate: '25', delay: '1' }
  ] }, [{ id: 'clients', value: 8 }]);
  assert.deepEqual(evaluateBusinessOperatingWindow(plan, { months: ['2027-02'] }), {
    net: 190, inactive: false, met: true, revenue: 850, cost: 660, otherRevenue: 50, otherCost: 25, repayments: 0
  });
});

test('optimization respects priority, rejects nonpassing and unavailable cases, and breaks ties deterministically', () => {
  const clients = { variable: 'clients', start: 1, end: 2, objective: 'minimize' };
  const fee = { variable: 'fee', start: 50, end: 100, step: 50, objective: 'maximize' };
  const optimize = (ranges, rejectHighFee = false) => {
    const cases = getBusinessModelTestCases({ ...model, testRanges: ranges });
    let best = null;
    for (const [index, entry] of [...cases].entries()) {
      const values = Object.fromEntries(entry.map(({ id, value }) => [id, value]));
      const net = values.clients === 1 && values.fee === 100 ? -10 : values.fee * values.clients;
      const candidate = { index, net, met: net >= 0 && !(rejectHighFee && values.fee === 100) };
      if (isBetterBusinessTestCase(candidate, best, cases)) best = candidate;
    }
    return best;
  };
  assert.deepEqual(optimize([clients, fee]), { index: 0, net: 50, met: true });
  assert.deepEqual(optimize([fee, clients]), { index: 3, net: 200, met: true });
  assert.equal(optimize([fee, clients], true).index, 0);
  const cases = getBusinessModelTestCases({ ...model, testRanges: [clients, { ...fee, objective: 'none' }] });
  const low = { index: 0, net: 20, met: true };
  const high = { index: 1, net: 30, met: true };
  assert.equal(isBetterBusinessTestCase(high, low, cases), true);
  assert.equal(isBetterBusinessTestCase(low, { ...high, net: 20 }, cases), true);
  assert.equal(isBetterBusinessTestCase({ ...high, index: 3 }, low, cases), false);
});

test('operating windows contain only complete calendar months, including across year boundaries', () => {
  assert.deepEqual(getBusinessOperatingMonths({ startDate: '2026-11-25', endDate: '2027-03-01' }),
    ['2026-12', '2027-01', '2027-02']);
  assert.deepEqual(getBusinessOperatingMonths({ startDate: '2028-02-01', endDate: '2028-02-29' }), ['2028-02']);
  assert.deepEqual(getBusinessOperatingMonths({ startDate: '2028-02-01', endDate: '2028-02-28' }), []);
});

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
  assert.deepEqual(Array.from(cases, ([entry]) => entry.value), [7, 8]);
  const [seven, eight] = Array.from(cases, entry => buildBusinessModelPlan(scenario, model, entry));
  assert.equal(seven.totals.get('2027-02').revenue, 750);
  assert.equal(eight.totals.get('2027-02').revenue, 850);
  assert.ok(seven.totals.get('2027-02').revenue - seven.totals.get('2027-02').cost >
    eight.totals.get('2027-02').revenue - eight.totals.get('2027-02').cost);
});

test('multiple ranges run as a Cartesian product and replace both monthly drivers', () => {
  const testRanges = [
    { variable: 'clients', start: 7, end: 8 },
    { variable: 'fee', start: 100, end: 150, step: 50 }
  ];
  const cases = getBusinessModelTestCases({ ...model, testRanges });
  assert.deepEqual(Array.from(cases, entries => entries.map(entry => entry.value)), [[7, 100], [7, 150], [8, 100], [8, 150]]);
  const plan = buildBusinessModelPlan(scenario, model, cases.at(3));
  assert.equal(plan.totals.get('2027-02').revenue, 1250);
  const large = getBusinessModelTestCases({ ...model, testRanges: [
    { ...testRanges[0], start: 0, end: 1_000_000 }, { ...testRanges[1], start: 50, end: 150, step: 5 }
  ] });
  assert.equal(large.length, 21_000_021);
  assert.deepEqual(large.at(large.length - 1).map(entry => entry.value), [1_000_000, 150]);
  assert.equal(large.valueAt(21, 0), 1);
  assert.equal(large.valueAt(21, 1), 50);
  assert.throws(() => getBusinessModelTestCases({ ...model, testRanges: [testRanges[0], testRanges[0]] }), /only one range/);
});

test('break-even can use a specific account and distinguish ending from intervening monthly shortfalls', async () => {
  const plan = buildBusinessModelPlan(scenario, { ...model, breakEven: { mode: 'ending', accountId: 1, threshold: 1425 } });
  const preview = await generateProjectionsForScenario({
    ...scenario, transactions: [...scenario.transactions, ...plan.rules]
  }, {}, lookup);
  const ending = evaluateBusinessBreakEven(plan.breakEven, preview);
  assert.equal(ending.status, 'met'); // Exactly at the threshold also qualifies.
  assert.equal(ending.balance, 1425);
  const lowest = evaluateBusinessBreakEven({ ...plan.breakEven, mode: 'lowest' }, preview);
  assert.deepEqual(lowest, { status: 'missed', balance: 720, date: '2027-02-01', shortfall: 705 });
  assert.equal(evaluateBusinessBreakEven({ ...plan.breakEven, accountId: 2 }, preview).balance, 1900);
  assert.deepEqual(evaluateBusinessBreakEven({ ...plan.breakEven, accountId: 5 }, preview), { status: 'unavailable' });
  assert.equal(buildBusinessModelPlan(scenario, { ...model, breakEven: { mode: 'ending' } }).breakEven.threshold, 0);
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

test('drafts survive normalization and invalid references fail clearly', () => {
  const stored = sanitizeScenarioForWrite({ ...scenario, name: 'Business',
    planning: { workshopStrategy: 'business', businessModel: { ...model, sweep: { ...model.sweep, objective: 'minimize' } } } });
  assert.equal(stored.planning.workshopStrategy, 'business');
  assert.equal(stored.planning.businessModel.variables[0].overrides, '2027-02=8');
  assert.equal(stored.planning.businessModel.testRanges[0].variable, 'clients');
  assert.equal(stored.planning.businessModel.testRanges[0].objective, 'minimize');
  assert.throws(() => buildBusinessModelPlan(scenario, { ...model, variables: [] }), /existing variable/);
  assert.equal(getBusinessModelTestCases({ ...model, sweep: { variable: 'clients', start: 0, end: 100 } }).length, 101);
});
