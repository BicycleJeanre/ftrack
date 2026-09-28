import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { generateProjectionsForScenario } from '../../js/domain/calculations/projection-engine.js';

const lookupData = JSON.parse(
  readFileSync(new URL('../../assets/lookup-data.json', import.meta.url), 'utf8')
);

function account(id, name, startingBalance, periodicChange = null) {
  return {
    id,
    name,
    type: 1,
    currency: 1,
    startingBalance,
    periodicChange,
    periodicChangeSchedule: []
  };
}

function scenario({ startDate, endDate, accounts, transactions = [] }) {
  return {
    id: 1,
    accounts,
    transactions,
    transactionOccurrences: [],
    splitTransactionSets: [],
    projection: { config: { startDate, endDate, periodTypeId: 3 } }
  };
}

test('monthly interest posting day is applied chronologically before later transactions', async () => {
  const data = scenario({
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    accounts: [
      account(1, 'Savings', 1000, {
        value: 12,
        changeMode: 1,
        changeType: 2,
        postingDayOfMonth: 15
      }),
      account(2, 'Checking', 5000)
    ],
    transactions: [{
      id: 10,
      primaryAccountId: 1,
      secondaryAccountId: 2,
      transactionTypeId: 1,
      amount: 1200,
      effectiveDate: '2026-01-20',
      description: 'Transfer after interest posting',
      recurrence: null,
      periodicChange: null,
      tags: []
    }]
  });

  const projections = await generateProjectionsForScenario(data, {}, lookupData);
  const savings = projections.find((projection) => Number(projection.accountId) === 1);

  assert.equal(savings.balance, 2210);
  assert.equal(savings.interestIn, 10);
});

test('posting days beyond month length clamp to month end', async () => {
  const data = scenario({
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    accounts: [
      account(1, 'Savings', 1000, {
        value: 12,
        changeMode: 1,
        changeType: 2,
        postingDayOfMonth: 31
      })
    ]
  });

  const projections = await generateProjectionsForScenario(data, {}, lookupData);
  assert.equal(projections[0].balance, 1010);
  assert.equal(projections[0].interestIn, 10);
});
