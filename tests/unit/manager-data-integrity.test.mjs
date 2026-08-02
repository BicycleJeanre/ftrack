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
const ScenarioManager = await import('../../js/app/managers/scenario-manager.js');
const TransactionManager = await import('../../js/app/managers/transaction-manager.js');
const OccurrenceManager = await import('../../js/app/managers/occurrence-manager.js');
const DataService = await import('../../js/app/services/data-service.js');
const { validateAppData } = await import('../../js/app/services/validation-service.js');

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
        tags: []
      }
    ],
    transactionOccurrences: [],
    baselinePeriods: [],
    projection: {
      config: {
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        periodTypeId: 3
      },
      rows: [
        { id: 1, accountId: 1, date: '2026-01-31', balance: 975, netChange: -25 }
      ],
      generatedAt: '2026-01-31T00:00:00.000Z',
      stale: false,
      staleAt: null,
      staleReason: null
    },
    planning: null,
    ...overrides.scenario
  };

  return {
    schemaVersion: 44,
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

test('account removal cascades only rules that reference the removed account', async () => {
  await AccountManager.remove(1, 1);
  const scenario = (await DataStore.read()).scenarios[0];

  assert.deepEqual(scenario.accounts.map((account) => account.id), [2, 3]);
  assert.deepEqual(scenario.transactions.map((transaction) => transaction.id), [11]);
  assert.equal(validateAppData(await DataStore.read()).isValid, true);
});

test('account removal rejects immutable occurrence history atomically', async () => {
  await OccurrenceManager.createManualOccurrence(1, {
    scheduledDate: '2026-01-12',
    actualDate: '2026-01-12',
    actualAmount: 30,
    status: 'actual',
    primaryAccountId: 1,
    secondaryAccountId: 3,
    transactionTypeId: 2,
    description: 'Recorded repair'
  });
  const before = globalThis.localStorage.getItem('ftrack:app-data');

  await assert.rejects(
    () => AccountManager.remove(1, 1),
    (error) => error?.code === 'account-history-protected'
  );
  assert.equal(globalThis.localStorage.getItem('ftrack:app-data'), before);
});

test('transaction deletion rejects historical rows and cascades unfrozen plan overrides', async () => {
  await OccurrenceManager.markActual(
    1,
    'tx:10|date:2026-01-15|role:none',
    {
      actualAmount: 27,
      actualDate: '2026-01-15',
      period: {
        periodTypeId: 3,
        startDate: '2026-01-01',
        endDate: '2026-01-31'
      }
    }
  );
  let current = (await DataStore.read()).scenarios[0];
  const before = globalThis.localStorage.getItem('ftrack:app-data');
  await assert.rejects(
    () => TransactionManager.saveAll(
      1,
      current.transactions.filter((transaction) => transaction.id !== 10)
    ),
    (error) => error?.code === 'rule-history-protected'
  );
  assert.equal(globalThis.localStorage.getItem('ftrack:app-data'), before);

  await seed();
  await OccurrenceManager.updateOccurrenceOnly(
    1,
    'tx:10|date:2026-01-15|role:none',
    { plannedAmount: 31 }
  );
  current = (await DataStore.read()).scenarios[0];
  await TransactionManager.saveAll(
    1,
    current.transactions.filter((transaction) => transaction.id !== 10)
  );
  current = (await DataStore.read()).scenarios[0];
  assert.equal(current.transactions.some((transaction) => transaction.id === 10), false);
  assert.equal(
    current.transactionOccurrences.some(
      (occurrence) => Number(occurrence.sourceTransactionId) === 10
    ),
    false
  );
  assert.equal(validateAppData(await DataStore.read()).isValid, true);
});

test('transaction save normalizes rule fields, preserves series metadata, and marks projections stale', async () => {
  await TransactionManager.saveAll(1, [
    {
      id: 0,
      primaryAccountId: 1,
      secondaryAccountId: 3,
      transactionTypeId: 2,
      amount: -44.5,
      effectiveDate: '2026-02-01',
      description: 'Normalized outflow',
      seriesRootId: 91,
      supersedesTransactionId: 90,
      activeFrom: '2026-02-01',
      activeTo: '2026-06-30',
      tags: ['unit']
    }
  ]);

  const scenario = (await DataStore.read()).scenarios[0];
  const [transaction] = scenario.transactions;

  assert.equal(transaction.id, 1);
  assert.equal(transaction.amount, 44.5);
  assert.equal(transaction.seriesRootId, 91);
  assert.equal(transaction.supersedesTransactionId, 90);
  assert.equal(transaction.activeFrom, '2026-02-01');
  assert.equal(transaction.activeTo, '2026-06-30');
  assert.deepEqual(transaction.tags, ['unit']);
  assert.equal(Object.hasOwn(transaction, 'status'), false);
  assert.equal(scenario.projection.stale, true);
  assert.match(scenario.projection.staleReason, /Transaction rules changed/);
});

test('scenario duplication preserves plan data and clears generated projection rows', async () => {
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
  assert.deepEqual(duplicate.projection.rows, []);
  assert.equal(duplicate.projection.generatedAt, null);
  assert.equal(duplicate.accounts.length, 3);
  assert.equal(duplicate.transactions.length, 2);
  assert.deepEqual(duplicate.transactionOccurrences, []);
});

test('projection saves cannot overwrite a newer stale plan revision', async () => {
  const staleAt = '2026-02-01T00:00:00.000Z';
  await seed(baseAppData({
    scenario: {
      projection: {
        config: {
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          periodTypeId: 3
        },
        rows: [{ id: 1, accountId: 1, date: '2026-01-31', balance: 975 }],
        generatedAt: '2026-01-31T00:00:00.000Z',
        stale: true,
        staleAt,
        staleReason: 'Newer edit'
      }
    }
  }));

  const staleSave = await DataService.saveProjectionBundle(1, {
    rows: [{ id: 2, accountId: 1, date: '2026-02-28', balance: 900 }],
    generatedAt: '2026-02-02T00:00:00.000Z',
    expectedStaleAt: '2026-01-31T23:59:59.000Z'
  });
  assert.equal(staleSave, false);
  let projection = (await DataStore.read()).scenarios[0].projection;
  assert.equal(projection.stale, true);
  assert.equal(projection.staleAt, staleAt);
  assert.equal(projection.rows[0].id, 1);

  const currentSave = await DataService.saveProjectionBundle(1, {
    rows: [{ id: 2, accountId: 1, date: '2026-02-28', balance: 900 }],
    generatedAt: '2026-02-02T00:00:00.000Z',
    expectedStaleAt: staleAt
  });
  assert.equal(currentSave, true);
  projection = (await DataStore.read()).scenarios[0].projection;
  assert.equal(projection.stale, false);
  assert.equal(projection.staleAt, null);
  assert.equal(projection.rows[0].id, 2);
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
