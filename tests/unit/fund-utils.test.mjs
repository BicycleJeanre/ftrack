import test from 'node:test';
import assert from 'node:assert/strict';

const {
  computeContributionRedemptionTotals,
  computeInvestorFlows
} = await import('../../js/domain/utils/fund-utils.js');

const accounts = [
  {
    id: 1,
    name: 'Fund cash',
    type: { id: 1, name: 'Asset' },
    startingBalance: 0,
    openDate: '2026-01-01'
  },
  {
    id: 2,
    name: 'Investor A',
    type: { id: 3, name: 'Equity' },
    startingBalance: 0,
    openDate: '2026-01-01'
  }
];

function makeScenario({ transactions = [], transactionOccurrences = [] } = {}) {
  return {
    id: 1,
    accounts,
    transactions,
    transactionOccurrences,
    splitTransactionSets: [],
    projection: {
      config: {
        startDate: '2026-01-01',
        endDate: '2026-01-31'
      }
    }
  };
}

function makeContributionRule(overrides = {}) {
  return {
    id: 10,
    primaryAccountId: 1,
    secondaryAccountId: 2,
    transactionTypeId: 1,
    amount: 100,
    effectiveDate: '2026-01-15',
    description: 'Investor contribution',
    recurrence: null,
    periodicChange: null,
    status: { name: 'planned', actualAmount: null, actualDate: null },
    ...overrides
  };
}

function makeLinkedBudget(overrides = {}) {
  return {
    id: 100,
    sourceTransactionId: 10,
    occurrenceKey: 'tx:10|date:2026-01-15|role:none',
    scheduledDate: '2026-01-15',
    occurrenceDate: '2026-01-15',
    primaryAccountId: 1,
    secondaryAccountId: 2,
    transactionTypeId: 1,
    amount: 100,
    plannedAmount: 100,
    baselineAmount: 100,
    status: { name: 'planned', actualAmount: null, actualDate: null },
    ...overrides
  };
}

test('a matched actual replaces the planned investor flow instead of being added to it', () => {
  const scenario = makeScenario({
    transactions: [makeContributionRule()],
    transactionOccurrences: [
      makeLinkedBudget({
        status: {
          name: 'actual',
          actualAmount: 130,
          actualDate: '2026-01-17'
        }
      })
    ]
  });

  const flows = computeInvestorFlows({ scenario, accounts });

  assert.deepEqual(flows[2], {
    contributions: 130,
    redemptions: 0
  });
  assert.deepEqual(
    computeContributionRedemptionTotals({ scenario, accounts }),
    { contributions: 130, redemptions: 0, net: 130 }
  );
});

test('a skipped investor flow is excluded from fund totals', () => {
  const scenario = makeScenario({
    transactions: [makeContributionRule()],
    transactionOccurrences: [
      makeLinkedBudget({
        status: {
          name: 'skipped',
          actualAmount: null,
          actualDate: null
        }
      })
    ]
  });

  assert.deepEqual(computeInvestorFlows({ scenario, accounts })[2], {
    contributions: 0,
    redemptions: 0
  });
  assert.deepEqual(
    computeContributionRedemptionTotals({ scenario, accounts }),
    { contributions: 0, redemptions: 0, net: 0 }
  );
});

test('source-less manual actual Equity-to-Asset flows are included as contributions and redemptions', () => {
  const scenario = makeScenario({
    transactionOccurrences: [
      {
        id: 201,
        sourceTransactionId: null,
        origin: 'manual',
        occurrenceDate: '2026-01-18',
        primaryAccountId: 1,
        secondaryAccountId: 2,
        transactionTypeId: 1,
        amount: 75,
        plannedAmount: 0,
        baselineAmount: 0,
        status: {
          name: 'actual',
          actualAmount: 75,
          actualDate: '2026-01-18'
        }
      },
      {
        id: 202,
        sourceTransactionId: null,
        origin: 'manual',
        occurrenceDate: '2026-01-22',
        primaryAccountId: 1,
        secondaryAccountId: 2,
        transactionTypeId: 2,
        amount: 25,
        plannedAmount: 0,
        baselineAmount: 0,
        status: {
          name: 'actual',
          actualAmount: 25,
          actualDate: '2026-01-22'
        }
      }
    ]
  });

  assert.deepEqual(computeInvestorFlows({ scenario, accounts })[2], {
    contributions: 75,
    redemptions: 25
  });
  assert.deepEqual(
    computeContributionRedemptionTotals({ scenario, accounts }),
    { contributions: 75, redemptions: 25, net: 50 }
  );
});

test('configured as-of and history boundaries carry older open investor commitments forward', () => {
  const scenario = makeScenario({
    transactions: [makeContributionRule()]
  });
  scenario.projection.config = {
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    asOfDate: '2026-02-10',
    openCommitmentStartDate: '2026-01-01'
  };

  assert.deepEqual(computeInvestorFlows({ scenario, accounts })[2], {
    contributions: 100,
    redemptions: 0
  });
});
