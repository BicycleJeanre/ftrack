import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() {
    this.items = new Map();
  }

  getItem(key) {
    return this.items.has(key) ? this.items.get(key) : null;
  }

  setItem(key, value) {
    this.items.set(key, String(value));
  }

  removeItem(key) {
    this.items.delete(key);
  }

  clear() {
    this.items.clear();
  }
}

globalThis.localStorage = new MemoryStorage();

const DataStore = await import('../../js/app/services/storage-service.js');
const AccountManager = await import('../../js/app/managers/account-manager.js');
const BudgetManager = await import('../../js/app/managers/budget-manager.js');
const ScenarioManager = await import('../../js/app/managers/scenario-manager.js');
const TransactionManager = await import('../../js/app/managers/transaction-manager.js');
const { resolveScenarioOccurrences } = await import(
  '../../js/domain/queries/resolve-scenario-occurrences.js'
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeAccount(overrides = {}) {
  return {
    id: 1,
    name: 'Checking',
    type: 1,
    currency: 1,
    startingBalance: 1000,
    openDate: '2026-01-01',
    periodicChange: null,
    goalAmount: null,
    goalDate: null,
    ...overrides
  };
}

function baseAppData(overrides = {}) {
  const scenario = {
    id: 1,
    version: 1,
    name: 'Base Scenario',
    description: null,
    lineage: null,
    accounts: [
      makeAccount({ id: 1, name: 'Checking' }),
      makeAccount({ id: 2, name: 'Savings', startingBalance: 500 }),
      makeAccount({ id: 3, name: 'Expense', type: 5, startingBalance: 0 })
    ],
    accountGroups: [],
    splitTransactionSets: [],
    transactions: [
      {
        id: 10,
        primaryAccountId: 1,
        secondaryAccountId: 3,
        transactionTypeId: 2,
        amount: 25,
        effectiveDate: '2026-01-15',
        description: 'Groceries',
        recurrence: null,
        periodicChange: null,
        status: { name: 'planned', actualAmount: null, actualDate: null },
        tags: []
      },
      {
        id: 11,
        primaryAccountId: 2,
        secondaryAccountId: 3,
        transactionTypeId: 2,
        amount: 15,
        effectiveDate: '2026-01-16',
        description: 'Savings fee',
        recurrence: null,
        periodicChange: null,
        status: { name: 'planned', actualAmount: null, actualDate: null },
        tags: []
      }
    ],
    budgets: [],
    budgetWindow: {
      config: {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        periodTypeId: 3
      }
    },
    projection: {
      config: {
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        periodTypeId: 3,
        source: 'transactions'
      },
      rows: [
        { id: 1, accountId: 1, date: '2026-01-31', balance: 975, netChange: -25 }
      ],
      generatedAt: '2026-01-31T00:00:00.000Z'
    },
    planning: null,
    ...overrides.scenario
  };

  return {
    schemaVersion: 43,
    uiState: {},
    scenarios: [scenario],
    ...overrides.app
  };
}

async function seed(data = baseAppData()) {
  globalThis.localStorage.clear();
  await DataStore.write(clone(data));
}

test.beforeEach(async () => {
  await seed();
});

test('account removal cascades only transactions that reference the removed account', async () => {
  await AccountManager.remove(1, 1);
  const data = await DataStore.read();
  const scenario = data.scenarios[0];

  assert.deepEqual(scenario.accounts.map((account) => account.id), [2, 3]);
  assert.deepEqual(scenario.transactions.map((transaction) => transaction.id), [11]);
});

test('transaction save normalizes IDs, absolute amounts, statuses, and tags', async () => {
  await TransactionManager.saveAll(1, [
    {
      id: 0,
      primaryAccountId: 1,
      secondaryAccountId: 3,
      transactionTypeId: 2,
      amount: -44.5,
      effectiveDate: '2026-02-01',
      description: 'Normalized outflow',
      status: 'actual',
      actualAmount: -40,
      actualDate: '2026-02-02',
      tags: ['unit']
    }
  ]);

  const [transaction] = (await DataStore.read()).scenarios[0].transactions;
  assert.equal(transaction.id, 1);
  assert.equal(transaction.amount, 44.5);
  assert.deepEqual(transaction.status, {
    name: 'actual',
    actualAmount: 40,
    actualDate: '2026-02-02'
  });
  assert.deepEqual(transaction.tags, ['unit']);
});

test('budget save strips UI-only fields and fills actual status defaults', async () => {
  await BudgetManager.saveAll(1, [
    {
      id: 0,
      sourceTransactionId: 10,
      primaryAccountId: 1,
      secondaryAccountId: 3,
      primaryAccount: { id: 1, name: 'Checking' },
      transactionType: { id: 2, name: 'Money Out' },
      primaryAccountName: 'Checking',
      plannedAmount: 99,
      actualAmount: 101,
      amount: -99,
      description: 'Actualized budget',
      recurrenceDescription: 'One time',
      occurrenceDate: '2026-01-15',
      status: { name: 'actual', actualAmount: null, actualDate: null },
      tags: ['budget']
    }
  ]);

  const [budget] = (await DataStore.read()).scenarios[0].budgets;
  assert.equal(budget.id, 1);
  assert.equal(budget.amount, 99);
  assert.equal(budget.plannedAmount, 99);
  assert.equal(budget.baselineAmount, 99);
  assert.equal(budget.scheduledDate, '2026-01-15');
  assert.equal(budget.plannedDate, null);
  assert.equal(budget.origin, 'generated');
  assert.deepEqual(budget.status, {
    name: 'actual',
    actualAmount: 99,
    actualDate: '2026-01-15'
  });
  assert.equal(Object.hasOwn(budget, 'primaryAccount'), false);
  assert.equal(Object.hasOwn(budget, 'transactionType'), false);
  assert.equal(Object.hasOwn(budget, 'primaryAccountName'), false);
  assert.equal(Object.hasOwn(budget, 'actualAmount'), false);
});

test('budget save preserves compatibility occurrence identity, baseline, reschedule, and split fields', async () => {
  await BudgetManager.saveAll(1, [
    {
      id: 0,
      sourceTransactionId: null,
      primaryAccountId: 1,
      secondaryAccountId: 3,
      transactionGroupId: 'split-manual',
      transactionGroupRole: 'interest',
      transactionGroupAccountGroupId: 12,
      transactionTypeId: 2,
      amount: 55,
      plannedAmount: 0,
      baselineAmount: 0,
      capitalAmount: 0,
      interestAmount: 55,
      description: 'Unexpected charge',
      occurrenceDate: '2026-01-15',
      occurrenceKey: 'budget:1',
      scheduledDate: '2026-01-15',
      plannedDate: '2026-01-16',
      origin: 'manual',
      status: { name: 'actual', actualAmount: 55, actualDate: '2026-01-16' },
      tags: ['manual']
    }
  ]);

  const [budget] = (await DataStore.read()).scenarios[0].budgets;
  assert.equal(budget.occurrenceKey, 'budget:1');
  assert.equal(budget.scheduledDate, '2026-01-15');
  assert.equal(budget.plannedDate, '2026-01-16');
  assert.equal(budget.plannedAmount, 0);
  assert.equal(budget.baselineAmount, 0);
  assert.equal(budget.origin, 'manual');
  assert.equal(budget.transactionGroupAccountGroupId, 12);
  assert.equal(budget.capitalAmount, 0);
  assert.equal(budget.interestAmount, 55);
});

test('legacy budget amount and date edits stay synchronized with resolved plan fields', async () => {
  const occurrenceKey = 'tx:10|date:2026-01-15|role:none';
  await seed(baseAppData({
    scenario: {
      budgets: [
        {
          id: 50,
          sourceTransactionId: 10,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 100,
          plannedAmount: 100,
          baselineAmount: null,
          description: 'Editable plan',
          occurrenceDate: '2026-01-15',
          occurrenceKey,
          scheduledDate: '2026-01-15',
          plannedDate: null,
          origin: 'generated',
          status: { name: 'planned', actualAmount: null, actualDate: null },
          tags: []
        }
      ]
    }
  }));

  const [existing] = (await DataStore.read()).scenarios[0].budgets;
  await BudgetManager.saveAll(1, [{
    ...existing,
    amount: 120,
    occurrenceDate: '2026-01-20'
  }]);

  const scenario = (await DataStore.read()).scenarios[0];
  const [saved] = scenario.budgets;
  assert.equal(saved.amount, 120);
  assert.equal(saved.plannedAmount, 120);
  assert.equal(saved.occurrenceKey, occurrenceKey);
  assert.equal(saved.scheduledDate, '2026-01-15');
  assert.equal(saved.plannedDate, '2026-01-20');
  assert.equal(saved.isOverride, true);

  const { occurrences } = resolveScenarioOccurrences({
    scenario,
    startDate: '2026-01-01',
    endDate: '2026-01-31'
  });
  const matching = occurrences.filter((occurrence) => occurrence.sourceTransactionId === 10);
  assert.equal(matching.length, 1);
  assert.equal(matching[0].plannedAmount, 120);
  assert.equal(matching[0].scheduledDate, '2026-01-15');
  assert.equal(matching[0].effectiveDate, '2026-01-20');
});

test('budget regeneration uses stable scheduled identity to suppress a rescheduled actual duplicate', async () => {
  const occurrenceKey = 'tx:10|date:2026-01-15|role:none';
  await seed(baseAppData({
    scenario: {
      transactions: [
        {
          id: 10,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 100,
          effectiveDate: '2026-01-15',
          description: 'Source plan',
          recurrence: null,
          periodicChange: null,
          status: { name: 'planned', actualAmount: null, actualDate: null },
          tags: []
        }
      ],
      budgets: [
        {
          id: 60,
          sourceTransactionId: 10,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 100,
          plannedAmount: 100,
          baselineAmount: 100,
          description: 'Rescheduled actual',
          occurrenceDate: '2026-01-20',
          occurrenceKey,
          scheduledDate: '2026-01-15',
          plannedDate: '2026-01-20',
          origin: 'generated',
          status: { name: 'actual', actualAmount: 105, actualDate: '2026-01-20' },
          tags: []
        }
      ]
    }
  }));

  await BudgetManager.createFromProjections(1);

  const matching = (await DataStore.read()).scenarios[0].budgets.filter(
    (budget) => budget.occurrenceKey === occurrenceKey
  );
  assert.equal(matching.length, 1);
  assert.equal(matching[0].id, 60);
  assert.equal(matching[0].status.name, 'actual');
  assert.equal(matching[0].actualAmount, undefined);
  assert.equal(matching[0].status.actualAmount, 105);
});

test('budget regeneration preserves history and actuals while replacing current planned rows', async () => {
  await seed(baseAppData({
    scenario: {
      transactions: [
        {
          id: 10,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 75,
          effectiveDate: '2026-02-15',
          description: 'Current source plan',
          recurrence: null,
          periodicChange: null,
          status: { name: 'planned', actualAmount: null, actualDate: null },
          tags: []
        },
        {
          id: 12,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 90,
          effectiveDate: '2026-02-20',
          description: 'Already actual',
          recurrence: null,
          periodicChange: null,
          status: { name: 'planned', actualAmount: null, actualDate: null },
          tags: []
        }
      ],
      budgets: [
        {
          id: 101,
          sourceTransactionId: 10,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 60,
          description: 'Historical override',
          recurrenceDescription: 'One time',
          occurrenceDate: '2026-01-15',
          periodicChange: null,
          status: { name: 'planned', actualAmount: null, actualDate: null },
          tags: []
        },
        {
          id: 102,
          sourceTransactionId: 10,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 65,
          description: 'Stale current override',
          recurrenceDescription: 'One time',
          occurrenceDate: '2026-02-15',
          periodicChange: null,
          status: { name: 'planned', actualAmount: null, actualDate: null },
          tags: []
        },
        {
          id: 103,
          sourceTransactionId: 12,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 90,
          description: 'Actualized source',
          recurrenceDescription: 'One time',
          occurrenceDate: '2026-02-20',
          periodicChange: null,
          status: { name: 'actual', actualAmount: 92, actualDate: '2026-02-21' },
          tags: []
        }
      ],
      budgetWindow: {
        config: {
          startDate: '2026-02-01',
          endDate: '2026-02-28',
          periodTypeId: 3
        }
      }
    }
  }));

  await BudgetManager.createFromProjections(1);

  const budgets = (await DataStore.read()).scenarios[0].budgets;
  const historical = budgets.find((budget) => budget.id === 101);
  const regenerated = budgets.find(
    (budget) => budget.sourceTransactionId === 10 && budget.occurrenceDate === '2026-02-15'
  );
  const actual = budgets.find((budget) => budget.id === 103);
  const actualMatches = budgets.filter(
    (budget) => budget.sourceTransactionId === 12 && budget.occurrenceDate === '2026-02-20'
  );

  assert.equal(historical.amount, 60);
  assert.equal(historical.description, 'Historical override');
  assert.equal(regenerated.amount, 75);
  assert.equal(regenerated.description, 'Current source plan');
  assert.notEqual(regenerated.id, 102);
  assert.deepEqual(actual.status, {
    name: 'actual',
    actualAmount: 92,
    actualDate: '2026-02-21'
  });
  assert.equal(actualMatches.length, 1);
  assert.equal(actualMatches[0].status.name, 'actual');
});

test('budget regeneration preserves active-window overrides and refreshes compatibility snapshots', async () => {
  const overrideKey = 'tx:10|date:2026-01-15|role:none';
  const snapshotKey = 'tx:11|date:2026-01-16|role:none';
  await seed(baseAppData({
    scenario: {
      budgets: [
        {
          id: 401,
          sourceTransactionId: 10,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 40,
          plannedAmount: 40,
          baselineAmount: 25,
          description: 'Explicit occurrence override',
          recurrenceDescription: 'One time',
          occurrenceDate: '2026-01-20',
          occurrenceKey: overrideKey,
          scheduledDate: '2026-01-15',
          plannedDate: '2026-01-20',
          origin: 'generated',
          isOverride: true,
          periodicChange: null,
          status: { name: 'planned', actualAmount: null, actualDate: null },
          tags: []
        },
        {
          id: 402,
          sourceTransactionId: 11,
          primaryAccountId: 2,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 5,
          plannedAmount: 5,
          baselineAmount: null,
          description: 'Replaceable generated snapshot',
          recurrenceDescription: 'One time',
          occurrenceDate: '2026-01-16',
          occurrenceKey: snapshotKey,
          scheduledDate: '2026-01-16',
          plannedDate: null,
          origin: 'generated',
          isOverride: false,
          periodicChange: null,
          status: { name: 'planned', actualAmount: null, actualDate: null },
          tags: []
        }
      ]
    }
  }));

  await BudgetManager.createFromProjections(1);

  const budgets = (await DataStore.read()).scenarios[0].budgets;
  const overridden = budgets.filter((budget) => budget.occurrenceKey === overrideKey);
  const refreshed = budgets.filter((budget) => budget.occurrenceKey === snapshotKey);

  assert.equal(overridden.length, 1);
  assert.equal(overridden[0].id, 401);
  assert.equal(overridden[0].amount, 40);
  assert.equal(overridden[0].occurrenceDate, '2026-01-20');
  assert.equal(overridden[0].isOverride, true);

  assert.equal(refreshed.length, 1);
  assert.equal(refreshed[0].amount, 15);
  assert.equal(refreshed[0].description, 'Savings fee');
  assert.equal(refreshed[0].isOverride, false);
});

test('budget regeneration preserves explicit linked overrides outside the active window', async () => {
  const januaryKey = 'tx:10|date:2026-01-15|role:none';
  const februaryKey = 'tx:10|date:2026-02-15|role:none';
  await seed(baseAppData({
    scenario: {
      transactions: [
        {
          id: 10,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 100,
          effectiveDate: '2026-01-15',
          description: 'Monthly source plan',
          recurrence: {
            recurrenceType: 4,
            startDate: '2026-01-15',
            endDate: null,
            interval: 1,
            dayOfMonth: 15
          },
          periodicChange: null,
          status: { name: 'planned', actualAmount: null, actualDate: null },
          tags: []
        }
      ],
      budgets: [
        {
          id: 501,
          sourceTransactionId: 10,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 175,
          plannedAmount: 175,
          baselineAmount: 100,
          description: 'Future explicit override',
          recurrenceDescription: 'Monthly',
          occurrenceDate: '2026-02-15',
          occurrenceKey: februaryKey,
          scheduledDate: '2026-02-15',
          plannedDate: null,
          origin: 'generated',
          isOverride: true,
          periodicChange: null,
          status: { name: 'planned', actualAmount: null, actualDate: null },
          tags: []
        }
      ],
      budgetWindow: {
        config: {
          startDate: '2026-01-01',
          endDate: '2026-01-31',
          periodTypeId: 3
        }
      }
    }
  }));

  await BudgetManager.createFromProjections(1);

  const budgets = (await DataStore.read()).scenarios[0].budgets;
  const january = budgets.filter((budget) => budget.occurrenceKey === januaryKey);
  const february = budgets.filter((budget) => budget.occurrenceKey === februaryKey);

  assert.equal(january.length, 1);
  assert.equal(january[0].plannedAmount, 100);
  assert.equal(january[0].isOverride, false);
  assert.equal(february.length, 1);
  assert.equal(february[0].id, 501);
  assert.equal(february[0].plannedAmount, 175);
  assert.equal(february[0].isOverride, true);
});

test('budget regeneration snapshots the resolved periodic-change amount', async () => {
  await seed(baseAppData({
    scenario: {
      transactions: [
        {
          id: 10,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 100,
          effectiveDate: '2026-01-15',
          description: 'Escalating monthly cost',
          recurrence: {
            recurrenceType: 4,
            startDate: '2026-01-15',
            endDate: null,
            interval: 1,
            dayOfMonth: 15
          },
          periodicChange: {
            value: 10,
            changeMode: 2,
            changeType: 1,
            period: 5
          },
          status: { name: 'planned', actualAmount: null, actualDate: null },
          tags: []
        }
      ],
      budgetWindow: {
        config: {
          startDate: '2027-01-01',
          endDate: '2027-01-31',
          periodTypeId: 3
        }
      }
    }
  }));

  await BudgetManager.createFromProjections(1);

  const [budget] = (await DataStore.read()).scenarios[0].budgets;
  assert.equal(budget.occurrenceDate, '2027-01-15');
  assert.ok(budget.amount > 109.9 && budget.amount < 110.1);
  assert.equal(budget.amount, budget.plannedAmount);
});

test('untouched generated budgets do not pin later transaction-rule changes', async () => {
  await seed(baseAppData({
    scenario: {
      transactions: [
        {
          id: 10,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 100,
          effectiveDate: '2026-01-15',
          description: 'Original rule',
          recurrence: null,
          periodicChange: null,
          status: { name: 'planned', actualAmount: null, actualDate: null },
          tags: []
        }
      ]
    }
  }));

  await BudgetManager.createFromProjections(1);
  let scenario = (await DataStore.read()).scenarios[0];
  assert.equal(scenario.budgets[0].isOverride, false);

  await TransactionManager.saveAll(1, [{
    ...scenario.transactions[0],
    amount: 140,
    description: 'Updated rule'
  }]);

  scenario = (await DataStore.read()).scenarios[0];
  const { occurrences } = resolveScenarioOccurrences({
    scenario,
    startDate: '2026-01-01',
    endDate: '2026-01-31'
  });

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].plannedAmount, 140);
  assert.equal(occurrences[0].description, 'Updated rule');
  assert.equal(occurrences[0].hasPlanOverride, false);
});

test('budget regeneration drops a historical planned duplicate when a matching actual exists', async () => {
  await seed(baseAppData({
    scenario: {
      transactions: [
        {
          id: 10,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 25,
          effectiveDate: '2026-01-15',
          description: 'Historical source',
          recurrence: null,
          periodicChange: null,
          status: { name: 'planned', actualAmount: null, actualDate: null },
          tags: []
        },
        {
          id: 11,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 30,
          effectiveDate: '2026-02-16',
          description: 'Current source',
          recurrence: null,
          periodicChange: null,
          status: { name: 'planned', actualAmount: null, actualDate: null },
          tags: []
        }
      ],
      budgets: [
        {
          id: 201,
          sourceTransactionId: 10,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 25,
          description: 'Historical planned duplicate',
          recurrenceDescription: 'One time',
          occurrenceDate: '2026-01-15',
          periodicChange: null,
          status: { name: 'planned', actualAmount: null, actualDate: null },
          tags: []
        },
        {
          id: 202,
          sourceTransactionId: 10,
          primaryAccountId: 1,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          amount: 25,
          description: 'Historical actual',
          recurrenceDescription: 'One time',
          occurrenceDate: '2026-01-15',
          periodicChange: null,
          status: { name: 'actual', actualAmount: 27, actualDate: '2026-01-16' },
          tags: []
        }
      ],
      budgetWindow: {
        config: {
          startDate: '2026-02-01',
          endDate: '2026-02-28',
          periodTypeId: 3
        }
      }
    }
  }));

  await BudgetManager.createFromProjections(1);

  const matchingHistory = (await DataStore.read()).scenarios[0].budgets.filter(
    (budget) => budget.sourceTransactionId === 10 && budget.occurrenceDate === '2026-01-15'
  );

  assert.equal(matchingHistory.length, 1);
  assert.equal(matchingHistory[0].id, 202);
  assert.equal(matchingHistory[0].status.name, 'actual');
});

test('scenario duplication preserves source data but clears generated projection rows', async () => {
  await ScenarioManager.duplicate(1, 'Duplicate Scenario');
  const data = await DataStore.read();
  const duplicate = data.scenarios.find((scenario) => scenario.name === 'Duplicate Scenario');

  assert.ok(duplicate);
  assert.equal(duplicate.id, 2);
  assert.equal(duplicate.version, 2);
  assert.deepEqual(duplicate.lineage, {
    duplicatedFromScenarioId: 1,
    ancestorScenarioIds: [1]
  });
  assert.deepEqual(duplicate.projection.rows || [], []);
  assert.equal(duplicate.projection.generatedAt, null);
  assert.equal(duplicate.accounts.length, 3);
  assert.equal(duplicate.transactions.length, 2);
});

test('account group manager rejects duplicate names and unknown memberships', async () => {
  await ScenarioManager.createAccountGroup(1, { name: 'Household', accountIds: [1] });

  await assert.rejects(
    () => ScenarioManager.createAccountGroup(1, { name: 'household', accountIds: [2] }),
    /Duplicate account group name/
  );

  await assert.rejects(
    () => ScenarioManager.setAccountGroupMemberships(1, 1, [999]),
    /Unknown account group/
  );

  await ScenarioManager.setAccountGroupMemberships(1, 2, [1]);
  const [group] = (await DataStore.read()).scenarios[0].accountGroups;
  assert.deepEqual(group.accountIds.sort((a, b) => a - b), [1, 2]);
});
