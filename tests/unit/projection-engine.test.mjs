import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || { location: { href: 'http://localhost/' } };

const { generateProjectionsForScenario } = await import('../../js/domain/calculations/projection-engine.js');

const lookupData = {
  periodTypes: [
    { id: 1, name: 'Day' },
    { id: 2, name: 'Week' },
    { id: 3, name: 'Month' }
  ],
  accountTypes: [
    { id: 1, name: 'Asset' },
    { id: 4, name: 'Income' },
    { id: 5, name: 'Expense' }
  ]
};

function buildProjectionScenario() {
  return {
    id: 1,
    accounts: [
      {
        id: 1,
        name: 'Operating Account',
        type: { id: 4, name: 'Income' },
        startingBalance: 0
      },
      {
        id: 2,
        name: 'Sales Income',
        type: { id: 4, name: 'Income' },
        startingBalance: 0
      },
      {
        id: 3,
        name: 'Supplies Expense',
        type: { id: 5, name: 'Expense' },
        startingBalance: 0
      }
    ],
    transactions: [
      {
        id: 101,
        primaryAccountId: 2,
        secondaryAccountId: 1,
        transactionTypeId: 1,
        amount: 1000,
        effectiveDate: '2026-01-05',
        status: { name: 'planned' }
      },
      {
        id: 102,
        primaryAccountId: 1,
        secondaryAccountId: 3,
        transactionTypeId: 2,
        amount: 250,
        effectiveDate: '2026-01-10',
        status: { name: 'planned' }
      }
    ],
    budgets: [],
    projection: {
      config: {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        periodTypeId: 3,
        source: 'transactions'
      }
    }
  };
}

test('projection rows classify account flows by transaction direction', async () => {
  const rows = await generateProjectionsForScenario(buildProjectionScenario(), {}, lookupData);
  const operatingRow = rows.find((row) => row.accountId === 1);
  const incomeRow = rows.find((row) => row.accountId === 2);
  const expenseRow = rows.find((row) => row.accountId === 3);

  assert.equal(operatingRow.income, 1000);
  assert.equal(operatingRow.capitalIn, 1000);
  assert.equal(operatingRow.expenses, 250);
  assert.equal(operatingRow.capitalOut, 250);
  assert.equal(operatingRow.balance, -1250);

  assert.equal(incomeRow.income, 1000);
  assert.equal(incomeRow.capitalIn, 1000);
  assert.equal(incomeRow.expenses, 0);
  assert.equal(incomeRow.capitalOut, 0);
  assert.equal(incomeRow.balance, 1000);

  assert.equal(expenseRow.income, 0);
  assert.equal(expenseRow.capitalIn, 0);
  assert.equal(expenseRow.expenses, 250);
  assert.equal(expenseRow.capitalOut, 250);
  assert.equal(expenseRow.balance, 250);
});
