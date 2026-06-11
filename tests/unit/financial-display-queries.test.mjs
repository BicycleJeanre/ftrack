import test from 'node:test';
import assert from 'node:assert/strict';

const { findPeriodById, findPeriodIndexById, filterByDateRange } = await import('../../js/shared/period-window-utils.js');
const {
  buildFinancialEntryDisplayRows,
  buildTransactionDisplayRows,
  collectSplitFilterOptions
} = await import('../../js/ui/queries/financial-entry-display-rows.js');

const accounts = [
  { id: 1, name: 'Checking', type: { id: 1, name: 'Asset' } },
  { id: 2, name: 'Loan', type: { id: 2, name: 'Liability' } },
  { id: 3, name: 'Interest Expense', type: { id: 5, name: 'Expense' } }
];

test('period helpers normalize ids and filter date ranges', () => {
  const periods = [
    { id: 1, label: 'Jan', startDate: '2026-01-01', endDate: '2026-01-31' },
    { id: '2', label: 'Feb', startDate: '2026-02-01', endDate: '2026-02-28' }
  ];

  assert.equal(findPeriodById(periods, '1')?.label, 'Jan');
  assert.equal(findPeriodIndexById(periods, 2), 1);
  assert.deepEqual(
    filterByDateRange([
      { id: 1, effectiveDate: '2026-01-15' },
      { id: 2, effectiveDate: '2026-02-15' }
    ], { startKey: '2026-01-01', endKey: '2026-01-31' }).map((row) => row.id),
    [1]
  );
});

test('transaction display rows collapse split interest by default', () => {
  const transactions = [
    {
      id: 10,
      primaryAccountId: 1,
      secondaryAccountId: 2,
      transactionTypeId: 2,
      amount: 800,
      transactionGroupId: 'split-1',
      transactionGroupRole: 'principal',
      status: { name: 'planned' }
    },
    {
      id: 11,
      primaryAccountId: 1,
      secondaryAccountId: 3,
      transactionTypeId: 2,
      amount: 200,
      transactionGroupId: 'split-1',
      transactionGroupRole: 'interest',
      status: { name: 'planned' }
    }
  ];
  const splitSets = [
    {
      id: 'split-1',
      payingAccountId: 1,
      totalAmount: 1000,
      components: [
        { role: 'principal', accountId: 2, value: 800 },
        { role: 'interest', accountId: 3, value: 200 }
      ]
    }
  ];

  const { displayRows } = buildTransactionDisplayRows({ transactions, accounts, splitSets });

  assert.equal(displayRows.length, 1);
  assert.equal(displayRows[0].transactionGroupRole, 'principal');
  assert.equal(displayRows[0].plannedAmount, -1000);
  assert.equal(displayRows[0].capitalAmount, 800);
  assert.equal(displayRows[0].interestAmount, 200);
});

test('transaction display rows preserve interest account scoped view', () => {
  const transactions = [
    {
      id: 10,
      primaryAccountId: 1,
      secondaryAccountId: 2,
      transactionTypeId: 2,
      amount: 800,
      transactionGroupId: 'split-1',
      transactionGroupRole: 'principal',
      status: { name: 'planned' }
    },
    {
      id: 11,
      primaryAccountId: 1,
      secondaryAccountId: 3,
      transactionTypeId: 2,
      amount: 200,
      transactionGroupId: 'split-1',
      transactionGroupRole: 'interest',
      status: { name: 'planned' }
    }
  ];
  const splitSets = [
    {
      id: 'split-1',
      payingAccountId: 1,
      totalAmount: 1000,
      components: [
        { role: 'principal', accountId: 2, value: 800 },
        { role: 'interest', accountId: 3, value: 200 }
      ]
    }
  ];

  const { displayRows } = buildTransactionDisplayRows({
    transactions,
    accounts,
    splitSets,
    filterAccountId: 3
  });

  assert.deepEqual(displayRows.map((row) => row.transactionGroupRole), ['interest']);
  assert.equal(displayRows[0].perspectiveAccountId, 3);
  assert.equal(displayRows[0].plannedAmount, 200);
});

test('budget-like entries use shared perspective row logic', () => {
  const budgetEntries = [
    {
      id: 20,
      primaryAccountId: 1,
      secondaryAccountId: 2,
      transactionTypeId: 2,
      amount: 500,
      status: { name: 'planned' }
    }
  ];

  const normalizeBudget = (entry) => ({
    ...entry,
    plannedAmount: entry.amount,
    _budgetId: entry.id
  });

  const unscoped = buildFinancialEntryDisplayRows({
    entries: budgetEntries,
    accounts,
    normalizeEntry: normalizeBudget
  });
  assert.equal(unscoped.displayRows.length, 1);
  assert.equal(unscoped.displayRows[0].perspectiveAccountId, 1);
  assert.equal(unscoped.displayRows[0].plannedAmount, -500);

  const scoped = buildFinancialEntryDisplayRows({
    entries: budgetEntries,
    accounts,
    normalizeEntry: normalizeBudget,
    filterAccountId: 2
  });
  assert.equal(scoped.displayRows.length, 1);
  assert.equal(scoped.displayRows[0].perspectiveAccountId, 2);
  assert.equal(scoped.displayRows[0].plannedAmount, 500);
});

test('split filter options are collected in sorted stable order', () => {
  assert.deepEqual(
    collectSplitFilterOptions([
      { transactionGroupId: 'b', transactionGroupRole: 'interest', transactionGroupAccountGroupId: 2 },
      { transactionGroupId: 'a', transactionGroupRole: 'principal', transactionGroupAccountGroupId: 1 },
      { transactionGroupId: 'a', transactionGroupRole: 'principal', transactionGroupAccountGroupId: 1 }
    ]),
    {
      groupIds: ['a', 'b'],
      roles: ['interest', 'principal'],
      accountGroupIds: [1, 2]
    }
  );
});
