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
  assert.deepEqual(budget.status, {
    name: 'actual',
    actualAmount: 99,
    actualDate: '2026-01-15'
  });
  assert.equal(Object.hasOwn(budget, 'primaryAccount'), false);
  assert.equal(Object.hasOwn(budget, 'transactionType'), false);
  assert.equal(Object.hasOwn(budget, 'primaryAccountName'), false);
  assert.equal(Object.hasOwn(budget, 'plannedAmount'), false);
  assert.equal(Object.hasOwn(budget, 'actualAmount'), false);
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
