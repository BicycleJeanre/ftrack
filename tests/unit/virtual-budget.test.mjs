import test from 'node:test';
import assert from 'node:assert/strict';
import { accountBehavior, validateVirtualBudgets, resolveVirtualBudgets } from '../../js/domain/calculations/virtual-budget.js';
import { resolveScenarioVirtualBudgets } from '../../js/domain/queries/resolve-scenario-virtual-budgets.js';

const accounts = [
  { id: 1, name: 'Main' },
  { id: 2, name: 'Running Costs', behavior: 'virtual' },
  { id: 3, name: 'Groceries', behavior: 'virtual' },
  { id: 4, name: 'Shop A' }, { id: 5, name: 'Shop B' }
];
const allocation = (updates = {}) => ({ id: 'running', virtualAccountId: 2, fundingAccountId: 1,
  startDate: '2026-10-25', endDate: '2026-11-24', mode: 'fixed', allowance: 2000,
  baselineAmount: 2000, closed: false, detailOccurrenceKeys: ['a', 'b'], ...updates });
const occurrence = (updates = {}) => ({ occurrenceKey: 'a', primaryAccountId: 2,
  secondaryAccountId: 4, scheduledDate: '2026-11-01', status: 'actual',
  transactionTypeId: 2, plannedAmount: 500, actualAmount: 500, ...updates });
const occurrences = [occurrence({ lineItems: [{ amount: 200 }, { amount: 300 }] }),
  occurrence({ occurrenceKey: 'b', secondaryAccountId: 5, plannedAmount: 150, actualAmount: 150 })];
const resolve = (allocations = [allocation()], rows = occurrences) => resolveVirtualBudgets({ accounts, allocations, occurrences: rows });

test('existing accounts default to Standard; unsupported behavior is not silently accepted', () => {
  assert.equal(accountBehavior(accounts[0]), 'standard');
  assert.throws(() => accountBehavior({ behavior: 'investment' }), /Unknown/);
  assert.deepEqual(resolveVirtualBudgets({ accounts, occurrences }), []);
});

test('2000 allowance and 650 actual keeps 1350 open without double counting line items', () => {
  const original = structuredClone({ accounts, occurrences });
  const [result] = resolve();
  assert.equal(result.actualSpending, 650);
  assert.equal(result.currentAllowance, 2000);
  assert.equal(result.remainingCommitments, 1350);
  assert.equal(result.forecastAmount, 2000);
  assert.equal(result.closed, false);
  assert.equal(result.baselineAmount, 2000);
  assert.equal(result.isFinancialPosting, false);
  assert.deepEqual({ accounts, occurrences }, original);
});

test('calculated allowance follows detail plans while actuals roll up independently', () => {
  const [result] = resolve([allocation({ mode: 'calculated' })], [
    occurrences[0], occurrence({ occurrenceKey: 'b', status: 'planned', plannedAmount: 700 })
  ]);
  assert.equal(result.currentAllowance, 1200);
  assert.equal(result.actualSpending, 500);
  assert.equal(result.remainingCommitments, 700);
  assert.equal(result.forecastAmount, 1200);
});

test('nested fixed and calculated budgets propagate leaves once through every ancestor', () => {
  const parent = allocation({ detailOccurrenceKeys: [], mode: 'calculated' });
  const child = allocation({ id: 'groceries', virtualAccountId: 3, fundingAccountId: 2 });
  const [top, nested] = resolve([parent, child], occurrences.map((row) => ({ ...row, primaryAccountId: 3 })));
  assert.equal(top.currentAllowance, 2000);
  assert.equal(top.actualSpending, 650);
  assert.equal(top.forecastAmount, 2000);
  assert.deepEqual(top.sourceOccurrenceKeys, nested.sourceOccurrenceKeys);
  assert.deepEqual(top.childAllocationIds, ['groceries']);
});

test('explicit future commitments are not hidden by a smaller fixed allowance', () => {
  const [result] = resolve(undefined, [occurrences[0],
    occurrence({ occurrenceKey: 'b', status: 'planned', plannedAmount: 2300 })]);
  assert.equal(result.overAllocated, 800);
  assert.equal(result.remainingCommitments, 2300);
  assert.equal(result.forecastAmount, 2800);
});

test('closing releases commitments; reopening preserves baseline and spending', () => {
  const [closed] = resolve([allocation({ closed: true })]);
  assert.equal(closed.remainingCommitments, 0);
  assert.equal(closed.forecastAmount, 650);
  assert.equal(closed.baselineAmount, 2000);
  assert.equal(resolve()[0].remainingCommitments, 1350);
});

test('refunds reduce spending, skipped sources do not consume allowance', () => {
  const [result] = resolve(undefined, [occurrences[0],
    occurrence({ occurrenceKey: 'b', transactionTypeId: 1, plannedAmount: 100, actualAmount: 100 })]);
  assert.equal(result.actualSpending, 400);
  assert.equal(result.remainingAllowance, 1600);
  const [skipped] = resolve(undefined, [occurrences[0], { ...occurrences[1], status: 'skipped' }]);
  assert.equal(skipped.actualSpending, 500);
  assert.equal(skipped.detailedPlannedSpending, 500);
  assert.equal(skipped.baselineAmount, 2000);
});

test('edits and removed line totals recompute rather than keeping stale parent actuals', () => {
  assert.equal(resolve()[0].actualSpending, 650);
  assert.equal(resolve(undefined, [{ ...occurrences[0], actualAmount: 200 }, occurrences[1]])[0].actualSpending, 350);
});

test('unlinked same-pair transactions and dates outside the bank window are not inferred', () => {
  const extra = occurrence({ occurrenceKey: 'other', actualAmount: 999 });
  assert.equal(resolve(undefined, [...occurrences, extra])[0].actualSpending, 650);
  assert.equal(resolve(undefined, occurrences.map((row) => ({ ...row, actualDate: '2026-12-03' })))[0].actualSpending, 650);
  assert.throws(() => resolve(undefined, [{ ...occurrences[0], scheduledDate: '2026-10-24' }, occurrences[1]]), /reporting window/);
});

test('rejects cycles, multiple funding parents, and unmatched nested windows', () => {
  const child = allocation({ id: 'child', virtualAccountId: 3, fundingAccountId: 2, detailOccurrenceKeys: [] });
  const codes = (rows) => validateVirtualBudgets({ accounts, allocations: rows }).map((issue) => issue.code);
  assert.ok(codes([allocation({ fundingAccountId: 3 }), child]).includes('allocation-cycle'));
  assert.ok(codes([allocation(), allocation({ id: 'duplicate' })]).includes('overlapping-allocation'));
  assert.ok(codes([child]).includes('missing-parent-allocation'));
});

test('rejects ambiguous details and invalid amounts instead of suppressing issues', () => {
  assert.throws(() => resolve([allocation({ detailOccurrenceKeys: ['a', 'a'] })]), /twice/);
  assert.throws(() => resolve([allocation({ detailOccurrenceKeys: ['missing'] })]), /Missing/);
  assert.throws(() => resolve(undefined, [...occurrences, occurrences[0]]), /unique/);
  assert.throws(() => resolve(undefined, [{ ...occurrences[0], actualAmount: NaN }, occurrences[1]]), /amounts/);
  assert.throws(() => resolve([allocation({ allowance: -1 })]), /nonnegative/);
});

test('cross-currency links and impossible dates are rejected', () => {
  const issues = validateVirtualBudgets({ accounts: accounts.map((row) => ({ ...row, currency: { id: row.id === 1 ? 1 : 2 } })),
    allocations: [allocation({ startDate: '2026-02-30' })] });
  assert.ok(issues.some((issue) => issue.code === 'currency-mismatch'));
  assert.ok(issues.some((issue) => issue.code === 'invalid-allocation-window'));
});

test('overspending never forecasts below recorded spending and zero activity does not close', () => {
  const [result] = resolve(undefined, occurrences.map((row) => ({ ...row, actualAmount: 1500 })));
  assert.equal(result.actualSpending, 3000);
  assert.equal(result.overspent, 1000);
  assert.equal(result.remainingAllowance, -1000);
  assert.equal(result.forecastAmount, 3000);
  const [empty] = resolve([allocation({ detailOccurrenceKeys: [] })], []);
  assert.equal(empty.closed, false);
  assert.equal(empty.actualSpending, 0);
  assert.equal(empty.remainingCommitments, 2000);
});

test('different periods retain independent allowances, baselines and closure', () => {
  const november = allocation({ detailOccurrenceKeys: [], closed: true });
  const december = allocation({ id: 'december', startDate: '2026-11-25', endDate: '2026-12-24',
    detailOccurrenceKeys: [], allowance: 2100, baselineAmount: null });
  const [past, future] = resolve([november, december], []);
  assert.equal(past.baselineAmount, 2000);
  assert.equal(past.forecastAmount, 0);
  assert.equal(future.currentAllowance, 2100);
  assert.equal(future.baselineAmount, null);
  assert.equal(future.remainingCommitments, 2100); // No automatic rollover.
});

test('three Virtual levels preserve a fixed ancestor limit without altering child budgets', () => {
  const deepAccounts = [...accounts, { id: 6, behavior: 'virtual' }];
  const rows = occurrences.map((row) => ({ ...row, primaryAccountId: 6 }));
  const allocations = [allocation({ detailOccurrenceKeys: [], allowance: 1000 }),
    allocation({ id: 'groceries', virtualAccountId: 3, fundingAccountId: 2, mode: 'calculated', detailOccurrenceKeys: [] }),
    allocation({ id: 'weekly', virtualAccountId: 6, fundingAccountId: 3, allowance: 2000 })];
  const results = resolveVirtualBudgets({ accounts: deepAccounts, allocations, occurrences: rows });
  assert.deepEqual(results.map((row) => row.actualSpending), [650, 650, 650]);
  assert.equal(results[0].overAllocated, 1000);
  assert.equal(results[0].currentAllowance, 1000);
  assert.equal(results[0].forecastAmount, 2000);
  assert.equal(results[1].currentAllowance, 2000);
  assert.equal(results[2].currentAllowance, 2000);
});

test('malformed imported records produce actionable configuration issues', () => {
  assert.equal(validateVirtualBudgets({ allocations: null })[0].code, 'invalid-budget-collections');
  assert.equal(validateVirtualBudgets({ accounts: [null] })[0].code, 'invalid-budget-record');
  assert.ok(validateVirtualBudgets({ accounts: [{ id: 1 }, { id: 1 }] }).some((issue) => issue.code === 'invalid-account-identity'));
});

test('shared scenario query consumes real canonical actual and planned occurrences', () => {
  const scenario = { accounts, transactions: [], transactionOccurrences: [
    { id: 10, origin: 'manual', status: 'actual', scheduledDate: '2026-11-01',
      actualDate: '2026-11-01', primaryAccountId: 2, secondaryAccountId: 4,
      transactionTypeId: 2, plannedAmount: 500, actualAmount: 500 },
    { id: 11, origin: 'manual', status: 'planned', scheduledDate: '2026-11-15',
      primaryAccountId: 2, secondaryAccountId: 5, transactionTypeId: 2, plannedAmount: 700 }
  ] };
  const original = structuredClone(scenario);
  const result = resolveScenarioVirtualBudgets({ scenario,
    allocations: [allocation({ detailOccurrenceKeys: ['occurrence:10', 'occurrence:11'] })],
    startDate: '2026-11-10', endDate: '2026-11-20' });
  assert.equal(result.budgets[0].actualSpending, 500); // Whole reporting period, not display slice.
  assert.equal(result.budgets[0].remainingCommitments, 1500);
  assert.equal(result.budgets[0].forecastAmount, 2000);
  assert.deepEqual(scenario, original);
  assert.equal(result.occurrences.length, 1); // Caller still receives its requested ordinary window.
});

test('scenario query with no allocations preserves canonical Standard behavior', () => {
  const scenario = { accounts, transactions: [], transactionOccurrences: [] };
  assert.deepEqual(resolveScenarioVirtualBudgets({ scenario, startDate: '2026-11-01', endDate: '2026-11-30' }),
    { occurrences: [], budgets: [], diagnostics: [] });
  assert.throws(() => resolveScenarioVirtualBudgets({ scenario, startDate: 'invalid', endDate: '2026-11-30' }), /startDate/);
});
