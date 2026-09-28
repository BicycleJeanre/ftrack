import test from 'node:test';
import assert from 'node:assert/strict';

const { buildRecurringRulesDetailRows } = await import(
  '../../js/ui/components/grids/transactions-grid.js'
);
const { calculateCapitalInterestTotals } = await import(
  '../../js/ui/transforms/data-aggregators.js'
);

const accounts = [
  { id: 1, name: 'Checking', type: { id: 1, name: 'Asset' } },
  { id: 2, name: 'Loan', type: { id: 2, name: 'Liability' } },
  { id: 3, name: 'Interest Expense', type: { id: 5, name: 'Expense' } }
];

function monthlyRecurrence(startDate = '2099-01-15', endDate = '2099-03-15') {
  return {
    recurrenceType: { id: 4, name: 'Monthly - Day of Month' },
    startDate,
    endDate,
    interval: 1,
    dayOfMonth: 15
  };
}

function plannedRule(overrides = {}) {
  return {
    id: 10,
    primaryAccountId: 1,
    secondaryAccountId: 2,
    transactionTypeId: 2,
    amount: 800,
    effectiveDate: '2099-01-15',
    activeFrom: '2099-01-15',
    activeTo: '2099-03-15',
    description: 'Loan payment',
    recurrence: monthlyRecurrence(),
    periodicChange: null,
    transactionGroupId: null,
    transactionGroupRole: null,
    transactionGroupAccountGroupId: null,
    status: { name: 'planned' },
    tags: [],
    ...overrides
  };
}

function scenarioWith({
  transactions,
  splitTransactionSets = [],
  transactionOccurrences = []
}) {
  return {
    id: 1,
    accounts,
    transactions,
    splitTransactionSets,
    transactionOccurrences,
    baselinePeriods: [],
    projection: {
      config: {
        startDate: '2099-01-01',
        endDate: '2099-12-31'
      }
    }
  };
}

function totalsFor(rows) {
  return calculateCapitalInterestTotals(rows, {
    amountField: 'plannedAmount',
    typeField: 'transactionType',
    typeNameField: 'transactionTypeName',
    typeIdField: 'transactionTypeId',
    capitalField: 'capitalAmount',
    interestField: 'interestAmount',
    roleField: 'transactionGroupRole'
  });
}

test('recurring detail collapses a split set after account-perspective filtering', async () => {
  const recurrence = monthlyRecurrence();
  const transactions = [
    plannedRule({
      transactionGroupId: 'split-1',
      transactionGroupRole: 'principal',
      transactionGroupAccountGroupId: 10
    }),
    plannedRule({
      id: 11,
      secondaryAccountId: 3,
      amount: 200,
      description: 'Loan interest',
      transactionGroupId: 'split-1',
      transactionGroupRole: 'interest',
      transactionGroupAccountGroupId: 20
    })
  ];
  const splitTransactionSets = [
    {
      id: 'split-1',
      payingAccountId: 1,
      targetAccountId: 2,
      totalAmount: 1000,
      recurrence,
      components: [
        {
          role: 'principal',
          accountId: 2,
          transactionTypeId: 2,
          value: 800,
          accountGroupId: 10,
          recurrence
        },
        {
          role: 'interest',
          accountId: 3,
          transactionTypeId: 2,
          value: 200,
          accountGroupId: 20,
          recurrence
        }
      ]
    }
  ];
  const scenario = scenarioWith({ transactions, splitTransactionSets });

  const unfilteredRows = await buildRecurringRulesDetailRows({
    transactions,
    accounts,
    scenario
  });
  assert.equal(unfilteredRows.length, 1);
  assert.equal(unfilteredRows[0].amount, 1000);
  assert.equal(unfilteredRows[0].capitalAmount, 800);
  assert.equal(unfilteredRows[0].interestAmount, 200);
  assert.equal(totalsFor(unfilteredRows).moneyOut, 1000);

  const rows = await buildRecurringRulesDetailRows({
    transactions,
    accounts,
    scenario,
    filterAccountId: 3
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'split:split-1');
  assert.equal(rows[0].transactionTypeName, 'Money In');
  assert.equal(rows[0].primaryAccountId, 3);
  assert.equal(rows[0].secondaryAccountId, 1);
  assert.equal(rows[0].fromAccountName, 'Checking');
  assert.equal(rows[0].toAccountName, 'Interest Expense');
  assert.equal(rows[0].amount, 200);
  assert.equal(rows[0].plannedAmount, 200);
  assert.equal(rows[0].sourceTransactionId, 10);
  assert.equal(rows[0].originalTransactionId, 10);
  assert.equal(rows[0]._scenarioId, 1);
  assert.equal(rows[0]._isRecurringLogicalRow, true);
  assert.equal(rows[0]._sourceRule.id, 10);

  const totals = totalsFor(rows);
  assert.equal(totals.moneyIn, 200);
  assert.equal(totals.moneyOut, 0);
  assert.equal(totals.capitalIn, 0);
  assert.equal(totals.interestIn, 200);
});

test('recurring detail applies role filters before collapsing split sets', async () => {
  const transactions = [
    plannedRule({
      transactionGroupId: 'split-1',
      transactionGroupRole: 'principal'
    }),
    plannedRule({
      id: 11,
      secondaryAccountId: 3,
      amount: 200,
      transactionGroupId: 'split-1',
      transactionGroupRole: 'interest'
    })
  ];
  const splitTransactionSets = [
    {
      id: 'split-1',
      payingAccountId: 1,
      totalAmount: 1000,
      recurrence: monthlyRecurrence(),
      components: [
        { role: 'principal', accountId: 2, value: 800 },
        { role: 'interest', accountId: 3, value: 200 }
      ]
    }
  ];
  const scenario = scenarioWith({ transactions, splitTransactionSets });

  const rows = await buildRecurringRulesDetailRows({
    transactions,
    accounts,
    scenario,
    splitRoleFilter: 'interest'
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].transactionTypeName, 'Money Out');
  assert.equal(rows[0].fromAccountName, 'Checking');
  assert.equal(rows[0].toAccountName, 'Interest Expense');
  assert.equal(rows[0].amount, 200);
  assert.equal(rows[0].transactionGroupRole, 'interest');
  assert.equal(totalsFor(rows).moneyOut, 200);
});

test('recurring detail reports the next unresolved occurrence', async () => {
  const rule = plannedRule({
    id: 20,
    amount: 100,
    transactionGroupId: null,
    transactionGroupRole: null
  });
  const transactions = [rule];
  const scenario = scenarioWith({
    transactions,
    transactionOccurrences: [
      {
        id: 100,
        sourceTransactionId: 20,
        occurrenceKey: 'tx:20|date:2099-01-15|role:none',
        occurrenceDate: '2099-01-15',
        scheduledDate: '2099-01-15',
        plannedDate: '2099-01-15',
        primaryAccountId: 1,
        secondaryAccountId: 2,
        transactionTypeId: 2,
        plannedAmount: 100,
        status: { name: 'skipped' },
        origin: 'generated',
        isOverride: true
      }
    ]
  });

  const rows = await buildRecurringRulesDetailRows({
    transactions,
    accounts,
    scenario
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].nextOccurrence, '2099-02-15');
});
