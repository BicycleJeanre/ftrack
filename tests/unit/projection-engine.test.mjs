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

function buildSplitProjectionScenario() {
  return {
    id: 2,
    accounts: [
      {
        id: 1,
        name: 'Operating Account',
        type: { id: 1, name: 'Asset' },
        startingBalance: 0
      },
      {
        id: 2,
        name: 'Loan Account',
        type: { id: 1, name: 'Asset' },
        startingBalance: 0
      },
      {
        id: 3,
        name: 'Insurance Expense',
        type: { id: 5, name: 'Expense' },
        startingBalance: 0
      }
    ],
    splitTransactionSets: [
      {
        id: 'split-1',
        payingAccountId: 1,
        totalAmount: 750,
        components: [
          {
            role: 'principal',
            accountId: 2,
            transactionTypeId: 2,
            value: 500
          },
          {
            role: 'insurance',
            accountId: 3,
            transactionTypeId: 2,
            value: 250
          }
        ]
      }
    ],
    transactions: [
      {
        id: 201,
        primaryAccountId: 1,
        secondaryAccountId: 2,
        transactionTypeId: 2,
        amount: 500,
        effectiveDate: '2026-01-10',
        transactionGroupId: 'split-1',
        transactionGroupRole: 'principal',
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

function buildResolvedPlanScenario({
  transactionAmount = 100,
  transactionDate = '2026-01-05',
  budgets = []
} = {}) {
  return {
    id: 3,
    accounts: [
      {
        id: 1,
        name: 'Operating Account',
        type: { id: 1, name: 'Asset' },
        startingBalance: 1000
      },
      {
        id: 2,
        name: 'Operating Expense',
        type: { id: 5, name: 'Expense' },
        startingBalance: 0
      }
    ],
    transactions: [
      {
        id: 301,
        primaryAccountId: 1,
        secondaryAccountId: 2,
        transactionTypeId: 2,
        amount: transactionAmount,
        effectiveDate: transactionDate,
        description: 'Planned operating cost',
        status: { name: 'planned', actualAmount: null, actualDate: null }
      }
    ],
    budgets,
    projection: {
      config: {
        startDate: '2026-01-01',
        endDate: '2026-01-10',
        periodTypeId: 1,
        source: 'transactions'
      }
    }
  };
}

function buildBudgetOccurrence({
  id = 401,
  sourceTransactionId = 301,
  amount = 100,
  occurrenceDate = '2026-01-05',
  status = { name: 'planned', actualAmount: null, actualDate: null },
  description = 'Resolved operating cost'
} = {}) {
  return {
    id,
    sourceTransactionId,
    primaryAccountId: 1,
    secondaryAccountId: 2,
    transactionTypeId: 2,
    amount,
    description,
    occurrenceDate,
    status
  };
}

function projectionRow(rows, accountId, date) {
  return rows.find((row) => Number(row.accountId) === Number(accountId) && row.date === date);
}

test('projection rows classify account flows by account-row direction', async () => {
  const rows = await generateProjectionsForScenario(buildProjectionScenario(), {}, lookupData);
  const operatingRow = rows.find((row) => row.accountId === 1);
  const incomeRow = rows.find((row) => row.accountId === 2);
  const expenseRow = rows.find((row) => row.accountId === 3);

  assert.equal(operatingRow.income, 0);
  assert.equal(operatingRow.capitalIn, 0);
  assert.equal(operatingRow.expenses, 1250);
  assert.equal(operatingRow.capitalOut, 1250);
  assert.equal(operatingRow.balance, -1250);

  assert.equal(incomeRow.income, 1000);
  assert.equal(incomeRow.capitalIn, 1000);
  assert.equal(incomeRow.expenses, 0);
  assert.equal(incomeRow.capitalOut, 0);
  assert.equal(incomeRow.balance, 1000);

  assert.equal(expenseRow.income, 250);
  assert.equal(expenseRow.capitalIn, 250);
  assert.equal(expenseRow.expenses, 0);
  assert.equal(expenseRow.capitalOut, 0);
  assert.equal(expenseRow.balance, 250);
});

test('projection rows include split-set components hidden behind the paying account row', async () => {
  const rows = await generateProjectionsForScenario(buildSplitProjectionScenario(), {}, lookupData);
  const operatingRow = rows.find((row) => row.accountId === 1);
  const loanRow = rows.find((row) => row.accountId === 2);
  const insuranceRow = rows.find((row) => row.accountId === 3);

  assert.equal(operatingRow.expenses, 750);
  assert.equal(operatingRow.capitalOut, 750);
  assert.equal(operatingRow.netChange, -750);
  assert.equal(operatingRow.balance, -750);

  assert.equal(loanRow.income, 500);
  assert.equal(loanRow.capitalIn, 500);
  assert.equal(loanRow.balance, 500);

  assert.equal(insuranceRow.income, 250);
  assert.equal(insuranceRow.capitalIn, 250);
  assert.equal(insuranceRow.balance, 250);
});

test('projection rows exclude recurring templates that start after the projection window', async () => {
  const scenario = buildProjectionScenario();
  scenario.transactions.push(
    {
      id: 103,
      primaryAccountId: 1,
      secondaryAccountId: 3,
      transactionTypeId: 2,
      amount: 3600,
      effectiveDate: '2026-01-01',
      recurrence: {
        recurrenceType: { id: 4, name: 'Monthly - Day of Month' },
        startDate: '2029-06-01',
        endDate: null,
        interval: 1,
        dayOfMonth: 1
      },
      status: { name: 'planned' }
    },
    {
      id: 104,
      primaryAccountId: 1,
      secondaryAccountId: 3,
      transactionTypeId: 2,
      amount: 470,
      effectiveDate: '2026-01-01',
      recurrence: {
        recurrenceType: { id: 4, name: 'Monthly - Day of Month' },
        startDate: '2029-06-01',
        endDate: null,
        interval: 1,
        dayOfMonth: 1
      },
      status: { name: 'planned' }
    }
  );

  const rows = await generateProjectionsForScenario(scenario, {}, lookupData);
  const operatingRow = rows.find((row) => row.accountId === 1);

  assert.equal(operatingRow.expenses, 1250);
  assert.equal(operatingRow.capitalOut, 1250);
  assert.equal(operatingRow.netChange, -1250);
  assert.equal(operatingRow.balance, -1250);
});

test('transaction and budget projection source options resolve to the same current plan', async () => {
  const scenario = buildResolvedPlanScenario({
    budgets: [buildBudgetOccurrence({ amount: 125 })]
  });

  const transactionSourceRows = await generateProjectionsForScenario(
    scenario,
    { source: 'transactions' },
    lookupData
  );
  const budgetSourceRows = await generateProjectionsForScenario(
    scenario,
    { source: 'budget' },
    lookupData
  );

  assert.deepEqual(budgetSourceRows, transactionSourceRows);
  assert.equal(projectionRow(transactionSourceRows, 1, '2026-01-05').expenses, 125);
  assert.equal(projectionRow(transactionSourceRows, 1, '2026-01-10').balance, 875);
});

test('matched actual replaces its planned occurrence and uses actual date and amount', async () => {
  const scenario = buildResolvedPlanScenario({
    budgets: [
      buildBudgetOccurrence({
        status: {
          name: 'actual',
          actualAmount: 120,
          actualDate: '2026-01-06'
        }
      })
    ]
  });

  const rows = await generateProjectionsForScenario(scenario, {}, lookupData);

  assert.equal(projectionRow(rows, 1, '2026-01-05').expenses, 0);
  assert.equal(projectionRow(rows, 1, '2026-01-05').balance, 1000);
  assert.equal(projectionRow(rows, 1, '2026-01-06').expenses, 120);
  assert.equal(projectionRow(rows, 1, '2026-01-06').balance, 880);
  assert.equal(projectionRow(rows, 2, '2026-01-06').income, 120);
  assert.equal(projectionRow(rows, 1, '2026-01-10').balance, 880);
});

test('an explicit zero actual amount suppresses the matching planned movement', async () => {
  const scenario = buildResolvedPlanScenario({
    budgets: [
      buildBudgetOccurrence({
        status: {
          name: 'actual',
          actualAmount: 0,
          actualDate: '2026-01-05'
        }
      })
    ]
  });

  const rows = await generateProjectionsForScenario(scenario, {}, lookupData);

  assert.equal(projectionRow(rows, 1, '2026-01-05').expenses, 0);
  assert.equal(projectionRow(rows, 1, '2026-01-10').balance, 1000);
  assert.equal(projectionRow(rows, 2, '2026-01-10').balance, 0);
});

test('manual unplanned actual is included on its actual date', async () => {
  const scenario = buildResolvedPlanScenario({
    transactionAmount: 0,
    budgets: [
      buildBudgetOccurrence({
        sourceTransactionId: null,
        amount: 40,
        occurrenceDate: '2026-01-07',
        description: 'Unexpected operating cost',
        status: {
          name: 'actual',
          actualAmount: 55,
          actualDate: '2026-01-08'
        }
      })
    ]
  });
  scenario.transactions = [];

  const rows = await generateProjectionsForScenario(scenario, {}, lookupData);

  assert.equal(projectionRow(rows, 1, '2026-01-07').expenses, 0);
  assert.equal(projectionRow(rows, 1, '2026-01-08').expenses, 55);
  assert.equal(projectionRow(rows, 1, '2026-01-10').balance, 945);
  assert.equal(projectionRow(rows, 2, '2026-01-10').balance, 55);
});

test('skipped occurrence is excluded from projections', async () => {
  const scenario = buildResolvedPlanScenario({
    transactionAmount: 75,
    budgets: [
      buildBudgetOccurrence({
        amount: 75,
        status: {
          name: 'skipped',
          actualAmount: null,
          actualDate: null
        }
      })
    ]
  });

  const rows = await generateProjectionsForScenario(scenario, {}, lookupData);

  assert.equal(projectionRow(rows, 1, '2026-01-05').expenses, 0);
  assert.equal(projectionRow(rows, 1, '2026-01-10').balance, 1000);
  assert.equal(projectionRow(rows, 2, '2026-01-10').balance, 0);
});

test('edited occurrence amounts keep capital and interest buckets reconciled', async () => {
  const scenario = buildResolvedPlanScenario({
    transactionAmount: 900,
    budgets: [{
      ...buildBudgetOccurrence({ amount: 1000 }),
      plannedAmount: 1000,
      capitalAmount: 800,
      interestAmount: 100,
      transactionGroupRole: 'principal'
    }]
  });
  scenario.transactions[0].transactionGroupRole = 'principal';

  const rows = await generateProjectionsForScenario(scenario, {}, lookupData);
  const payer = projectionRow(rows, 1, '2026-01-05');
  const destination = projectionRow(rows, 2, '2026-01-05');

  assert.equal(payer.expenses, 1000);
  assert.equal(payer.capitalOut, 900);
  assert.equal(payer.interestOut, 100);
  assert.equal(payer.capitalOut + payer.interestOut, payer.expenses);
  assert.equal(destination.income, 1000);
  assert.equal(destination.capitalIn, 900);
  assert.equal(destination.interestIn, 100);
  assert.equal(destination.capitalIn + destination.interestIn, destination.income);
});

test('explicit as-of date moves an overdue open occurrence to forecast timing', async () => {
  const scenario = buildResolvedPlanScenario({
    transactionAmount: 100,
    transactionDate: '2026-01-03'
  });

  const rows = await generateProjectionsForScenario(
    scenario,
    { asOfDate: '2026-01-06' },
    lookupData
  );
  scenario.projection.config.asOfDate = '2026-01-06';
  const regeneratedRows = await generateProjectionsForScenario(
    scenario,
    {},
    lookupData
  );

  assert.deepEqual(regeneratedRows, rows);
  assert.equal(projectionRow(rows, 1, '2026-01-03').expenses, 0);
  assert.equal(projectionRow(rows, 1, '2026-01-05').balance, 1000);
  assert.equal(projectionRow(rows, 1, '2026-01-06').expenses, 100);
  assert.equal(projectionRow(rows, 1, '2026-01-06').balance, 900);
});
