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

const dispatchedEvents = [];
globalThis.localStorage = new MemoryStorage();
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};
globalThis.document = {
  dispatchEvent(event) {
    dispatchedEvents.push(event);
    return true;
  }
};

const DataStore = await import('../../js/app/services/storage-service.js');
const OccurrenceManager = await import('../../js/app/managers/occurrence-manager.js');
const TransactionManager = await import('../../js/app/managers/transaction-manager.js');
const { resolveScenarioOccurrences } = await import(
  '../../js/domain/queries/resolve-scenario-occurrences.js'
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function monthlyRule(overrides = {}) {
  return {
    id: 10,
    seriesRootId: null,
    supersedesTransactionId: null,
    primaryAccountId: 1,
    secondaryAccountId: 2,
    transactionTypeId: 2,
    amount: 100,
    effectiveDate: '2026-01-15',
    activeFrom: '2026-01-15',
    activeTo: '2026-04-30',
    description: 'Monthly service',
    recurrence: {
      recurrenceType: { id: 4, name: 'Monthly - Day of Month' },
      startDate: '2026-01-15',
      endDate: '2026-04-30',
      interval: 1,
      dayOfMonth: 15
    },
    periodicChange: null,
    transactionGroupId: null,
    transactionGroupRole: null,
    transactionGroupAccountGroupId: null,
    tags: [],
    ...overrides
  };
}

function baseData(overrides = {}) {
  const scenario = {
    id: 1,
    version: 1,
    name: 'Occurrence Commands',
    description: null,
    lineage: null,
    accounts: [
      { id: 1, name: 'Checking', type: 1, currency: 1, startingBalance: 1000 },
      { id: 2, name: 'Expense', type: 5, currency: 1, startingBalance: 0 },
      { id: 3, name: 'Savings', type: 1, currency: 1, startingBalance: 500 }
    ],
    accountGroups: [],
    splitTransactionSets: [],
    transactions: [monthlyRule()],
    transactionOccurrences: [],
    baselinePeriods: [],
    projection: {
      config: {
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        periodTypeId: 3
      },
      rows: [{ id: 1, accountId: 1, date: '2026-01-31', balance: 900 }],
      generatedAt: '2026-01-01T00:00:00.000Z',
      stale: false,
      staleAt: null,
      staleReason: null
    },
    planning: null,
    ...overrides.scenario
  };
  return {
    schemaVersion: 44,
    scenarios: [scenario],
    uiState: {},
    ...overrides.app
  };
}

function splitData() {
  const recurrence = {
    recurrenceType: { id: 4, name: 'Monthly - Day of Month' },
    startDate: '2026-01-15',
    endDate: '2026-04-30',
    interval: 1,
    dayOfMonth: 15
  };
  return baseData({
    scenario: {
      transactions: [
        monthlyRule({
          id: 10,
          amount: 80,
          transactionGroupId: 'payment',
          transactionGroupRole: 'principal'
        }),
        monthlyRule({
          id: 11,
          amount: 20,
          description: 'Interest',
          transactionGroupId: 'payment',
          transactionGroupRole: 'interest'
        })
      ],
      splitTransactionSets: [{
        id: 'payment',
        description: 'Split payment',
        payingAccountId: 1,
        effectiveDate: '2026-01-15',
        strategy: 'manual',
        targetAccountId: 2,
        interestSource: 'manual',
        customRate: null,
        totalAmount: 100,
        recurrence,
        tags: [],
        components: [
          {
            role: 'principal',
            accountId: 2,
            transactionTypeId: 2,
            description: 'Principal',
            recurrence,
            periodicChange: null,
            amountMode: 'fixed',
            value: 80,
            order: 0
          },
          {
            role: 'interest',
            accountId: 3,
            transactionTypeId: 2,
            description: 'Interest',
            recurrence,
            periodicChange: null,
            amountMode: 'fixed',
            value: 20,
            order: 1
          }
        ]
      }]
    }
  });
}

async function seed(data = baseData()) {
  localStorage.clear();
  dispatchedEvents.length = 0;
  await DataStore.write(clone(data));
}

async function scenario() {
  return (await DataStore.read()).scenarios[0];
}

function resolveWindow(currentScenario, startDate, endDate) {
  return resolveScenarioOccurrences({
    scenario: currentScenario,
    startDate,
    endDate
  }).occurrences;
}

test.beforeEach(async () => {
  await seed();
});

test('updateOccurrenceOnly materializes one override and emits one persisted plan-change event', async () => {
  const key = 'tx:10|date:2026-02-15|role:none';
  await OccurrenceManager.updateOccurrenceOnly(1, key, {
    plannedAmount: 125,
    description: 'February service'
  });

  const current = await scenario();
  assert.equal(current.transactionOccurrences.length, 1);
  assert.equal(current.transactionOccurrences[0].occurrenceKey, key);
  assert.equal(current.transactionOccurrences[0].plannedAmount, 125);
  assert.equal(current.transactionOccurrences[0].description, 'February service');
  assert.equal(current.projection.stale, true);
  assert.match(current.projection.staleReason, /Occurrence plan changed/);
  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].type, 'forecast:planChanged');
  assert.deepEqual(dispatchedEvents[0].detail, { scenarioId: 1 });

  const amounts = resolveWindow(current, '2026-01-01', '2026-03-31')
    .map((occurrence) => occurrence.plannedAmount);
  assert.deepEqual(amounts, [100, 125, 100]);
});

test('rescheduleOccurrence keeps immutable occurrence identity and changes only planned timing', async () => {
  const key = 'tx:10|date:2026-02-15|role:none';
  await OccurrenceManager.rescheduleOccurrence(1, key, '2026-02-20');

  const current = await scenario();
  const [stored] = current.transactionOccurrences;
  assert.equal(stored.occurrenceKey, key);
  assert.equal(stored.scheduledDate, '2026-02-15');
  assert.equal(stored.plannedDate, '2026-02-20');
  const [resolved] = resolveWindow(current, '2026-02-01', '2026-02-28');
  assert.equal(resolved.effectiveDate, '2026-02-20');
});

test('markSkipped stores the comparison plan and suppresses forecast inclusion', async () => {
  const key = 'tx:10|date:2026-02-15|role:none';
  await OccurrenceManager.markSkipped(1, key);

  const current = await scenario();
  const [stored] = current.transactionOccurrences;
  assert.equal(stored.status, 'skipped');
  assert.equal(stored.plannedAmount, 100);
  assert.equal(stored.baselineAmount, 100);
  const [resolved] = resolveWindow(current, '2026-02-01', '2026-02-28');
  assert.equal(resolved.status, 'skipped');
  assert.equal(resolved.isIncludedInForecast, false);
});

test('updateOccurrenceOnly can restore a skipped occurrence without losing its baseline', async () => {
  const key = 'tx:10|date:2026-02-15|role:none';
  await OccurrenceManager.markSkipped(1, key);
  await OccurrenceManager.updateOccurrenceOnly(1, key, { status: 'planned' });

  const current = await scenario();
  const [stored] = current.transactionOccurrences;
  assert.equal(stored.status, 'planned');
  assert.equal(stored.baselineAmount, 100);
  assert.equal(stored.plannedAmount, 100);
  assert.equal(stored.actualAmount, null);
  const [resolved] = resolveWindow(current, '2026-02-01', '2026-02-28');
  assert.equal(resolved.status, 'planned');
  assert.equal(resolved.isIncludedInForecast, true);
});

test('markActual automatically freezes the period before storing actual amount and date', async () => {
  const key = 'tx:10|date:2026-02-15|role:none';
  await OccurrenceManager.markActual(1, key, {
    actualAmount: 120,
    actualDate: '2026-02-17',
    period: {
      periodTypeId: 3,
      startDate: '2026-02-01',
      endDate: '2026-02-28'
    }
  });

  const current = await scenario();
  assert.deepEqual(
    current.baselinePeriods.map(({ periodTypeId, startDate, endDate }) => ({
      periodTypeId,
      startDate,
      endDate
    })),
    [{ periodTypeId: 3, startDate: '2026-02-01', endDate: '2026-02-28' }]
  );
  const stored = current.transactionOccurrences.find(
    (occurrence) => occurrence.occurrenceKey === key
  );
  assert.equal(stored.baselineAmount, 100);
  assert.equal(stored.plannedAmount, 100);
  assert.equal(stored.actualAmount, 120);
  assert.equal(stored.actualDate, '2026-02-17');
  assert.equal(stored.status, 'actual');

  const [resolved] = resolveWindow(current, '2026-02-01', '2026-02-28');
  assert.equal(resolved.status, 'actual');
  assert.equal(resolved.forecastAmount, 120);
  assert.equal(resolved.effectiveDate, '2026-02-17');
});

test('markActual snapshots nullable movement and rule metadata before direct rule edits', async () => {
  await seed(baseData({
    scenario: {
      transactions: [monthlyRule({
        secondaryAccountId: null,
        description: 'Original',
        tags: ['original'],
        periodicChange: { value: 5, changeMode: 1, changeType: 1 }
      })]
    }
  }));
  const key = 'tx:10|date:2026-01-15|role:none';
  await OccurrenceManager.markActual(1, key, {
    actualAmount: 105,
    actualDate: '2026-01-16',
    period: {
      periodTypeId: 3,
      startDate: '2026-01-01',
      endDate: '2026-01-31'
    }
  });

  const current = await scenario();
  await TransactionManager.saveAll(1, [{
    ...current.transactions[0],
    secondaryAccountId: 3,
    transactionTypeId: 1,
    description: 'Changed',
    tags: ['changed'],
    recurrence: {
      ...current.transactions[0].recurrence,
      interval: 2
    },
    periodicChange: null
  }]);

  const persisted = await scenario();
  const stored = persisted.transactionOccurrences.find(
    (occurrence) => occurrence.occurrenceKey === key
  );
  assert.equal(stored.actualSnapshotVersion, 1);
  assert.equal(stored.secondaryAccountId, null);
  assert.equal(stored.description, 'Original');
  assert.deepEqual(stored.tags, ['original']);

  const [resolved] = resolveWindow(persisted, '2026-01-01', '2026-01-31');
  assert.equal(resolved.status, 'actual');
  assert.equal(resolved.secondaryAccountId, null);
  assert.equal(resolved.transactionTypeId, 2);
  assert.equal(resolved.description, 'Original');
  assert.deepEqual(resolved.tags, ['original']);
  assert.equal(resolved.recurrence.interval, 1);
  assert.deepEqual(resolved.periodicChange, {
    value: 5,
    changeMode: 1,
    changeType: 1
  });
});

test('freezePeriodBaseline is idempotent and lets later rule changes inherit current plan without baseline drift', async () => {
  await OccurrenceManager.freezePeriodBaseline(1, {
    periodTypeId: 3,
    startDate: '2026-02-01',
    endDate: '2026-02-28'
  });
  await OccurrenceManager.freezePeriodBaseline(1, {
    periodTypeId: 3,
    startDate: '2026-02-01',
    endDate: '2026-02-28'
  });

  let current = await scenario();
  assert.equal(current.baselinePeriods.length, 1);
  assert.equal(current.transactionOccurrences.length, 1);
  assert.equal(current.transactionOccurrences[0].baselineAmount, 100);
  assert.equal(current.transactionOccurrences[0].isOverride, false);

  current.transactions[0].amount = 140;
  await TransactionManager.saveAll(1, current.transactions);
  current = await scenario();
  const [resolved] = resolveWindow(current, '2026-02-01', '2026-02-28');
  assert.equal(resolved.baselineAmount, 100);
  assert.equal(resolved.plannedAmount, 140);
});

test('frozen baseline movement remains immutable when the current series direction changes', async () => {
  await OccurrenceManager.freezePeriodBaseline(1, {
    periodTypeId: 3,
    startDate: '2026-01-01',
    endDate: '2026-01-31'
  });
  const key = 'tx:10|date:2026-01-15|role:none';
  await OccurrenceManager.updateEntireSeries(1, key, {
    primaryAccountId: 3,
    secondaryAccountId: 1,
    transactionTypeId: 1
  });

  const current = await scenario();
  const [stored] = current.transactionOccurrences;
  assert.equal(stored.baselineSnapshotVersion, 1);
  assert.equal(stored.baselinePrimaryAccountId, 1);
  assert.equal(stored.baselineSecondaryAccountId, 2);
  assert.equal(stored.baselineTransactionTypeId, 2);

  const [resolved] = resolveWindow(current, '2026-01-01', '2026-01-31');
  assert.equal(resolved.baselineTransactionTypeId, 2);
  assert.equal(resolved.transactionTypeId, 1);
  assert.equal(resolved.baselinePrimaryAccountId, 1);
  assert.equal(resolved.primaryAccountId, 3);
});

test('createManualOccurrence creates planned and unplanned-actual rows with stable keys', async () => {
  const plannedResult = await OccurrenceManager.createManualOccurrence(1, {
    scheduledDate: '2026-02-10',
    plannedAmount: 45,
    status: 'planned',
    primaryAccountId: 1,
    secondaryAccountId: 2,
    transactionTypeId: 2,
    description: 'Extra fee'
  });
  assert.match(plannedResult.occurrence.occurrenceKey, /^occurrence:\d+$/);

  const actualResult = await OccurrenceManager.createManualOccurrence(1, {
    scheduledDate: '2026-02-12',
    actualDate: '2026-02-12',
    actualAmount: 55,
    status: 'actual',
    primaryAccountId: 1,
    secondaryAccountId: 2,
    transactionTypeId: 2,
    description: 'Unexpected repair',
    baselinePeriod: {
      periodTypeId: 3,
      startDate: '2026-02-01',
      endDate: '2026-02-28'
    }
  });

  const current = await scenario();
  const actual = current.transactionOccurrences.find(
    (occurrence) => occurrence.occurrenceKey === actualResult.occurrence.occurrenceKey
  );
  assert.equal(actual.sourceTransactionId, null);
  assert.equal(actual.baselineAmount, 0);
  assert.equal(actual.plannedAmount, 0);
  assert.equal(actual.actualAmount, 55);
  assert.equal(actual.status, 'actual');
  const resolvedActual = resolveWindow(current, '2026-02-01', '2026-02-28')
    .find((occurrence) => occurrence.occurrenceKey === actual.occurrenceKey);
  assert.equal(resolvedActual.isUnplannedActual, true);
});

test('promoteOccurrenceToRecurring preserves the manual occurrence and starts on the next recurrence date', async () => {
  const created = await OccurrenceManager.createManualOccurrence(1, {
    scheduledDate: '2026-01-20',
    actualDate: '2026-01-20',
    actualAmount: 60,
    status: 'actual',
    primaryAccountId: 1,
    secondaryAccountId: 2,
    transactionTypeId: 2,
    description: 'Learned monthly cost'
  });
  await OccurrenceManager.promoteOccurrenceToRecurring(
    1,
    created.occurrence.occurrenceKey,
    {
      recurrence: {
        recurrenceType: { id: 4, name: 'Monthly - Day of Month' },
        startDate: '2026-01-20',
        endDate: null,
        interval: 1,
        dayOfMonth: 20
      }
    }
  );

  const current = await scenario();
  const promoted = current.transactions.find(
    (rule) => rule.promotedFromOccurrenceKey === created.occurrence.occurrenceKey
  );
  assert.ok(promoted);
  assert.equal(promoted.amount, 60);
  assert.equal(promoted.effectiveDate, '2026-02-20');
  assert.equal(promoted.recurrence.startDate, '2026-02-20');
  assert.equal(promoted.seriesRootId, promoted.id);
  assert.ok(
    current.transactionOccurrences.some(
      (occurrence) => occurrence.occurrenceKey === created.occurrence.occurrenceKey
    )
  );

  await assert.rejects(
    () => OccurrenceManager.promoteOccurrenceToRecurring(
      1,
      created.occurrence.occurrenceKey,
      {
        recurrence: {
          recurrenceType: { id: 4, name: 'Monthly - Day of Month' },
          startDate: '2026-01-20',
          endDate: null,
          interval: 1,
          dayOfMonth: 20
        }
      }
    ),
    (error) => error?.code === 'occurrence-already-promoted'
  );
});

test('rules introduced after a period freeze keep a zero baseline inside that period', async () => {
  const created = await OccurrenceManager.createManualOccurrence(1, {
    scheduledDate: '2026-01-05',
    actualDate: '2026-01-05',
    actualAmount: 20,
    status: 'actual',
    primaryAccountId: 1,
    secondaryAccountId: 2,
    transactionTypeId: 2,
    description: 'Learned daily cost'
  });
  await OccurrenceManager.promoteOccurrenceToRecurring(
    1,
    created.occurrence.occurrenceKey,
    {
      recurrence: {
        recurrenceType: { id: 2, name: 'Daily' },
        startDate: '2026-01-05',
        endDate: '2026-01-08',
        interval: 1
      }
    }
  );

  const current = await scenario();
  const promoted = current.transactions.find(
    (rule) => rule.promotedFromOccurrenceKey === created.occurrence.occurrenceKey
  );
  const introduced = resolveWindow(current, '2026-01-06', '2026-01-08')
    .filter((occurrence) => Number(occurrence.sourceTransactionId) === Number(promoted.id));
  assert.equal(introduced.length, 3);
  assert.deepEqual(
    introduced.map((occurrence) => occurrence.baselineAmount),
    [0, 0, 0]
  );
});

for (const [label, command] of [
  ['this-and-future', OccurrenceManager.updateThisAndFuture],
  ['entire-series', OccurrenceManager.updateEntireSeries]
]) {
  test(`${label} series edits do not regenerate a plan over a future actual`, async () => {
    await seed(baseData({
      scenario: {
        transactionOccurrences: [{
          id: 1,
          sourceTransactionId: 10,
          occurrenceKey: 'tx:10|date:2026-04-15|role:none',
          scheduledDate: '2026-04-15',
          plannedDate: null,
          actualDate: '2026-04-16',
          baselineAmount: 100,
          plannedAmount: 100,
          actualAmount: 107,
          status: 'actual',
          origin: 'generated',
          isOverride: true
        }]
      }
    }));

    await command(
      1,
      'tx:10|date:2026-02-15|role:none',
      { amount: 150 }
    );

    const current = await scenario();
    const april = resolveWindow(current, '2026-04-01', '2026-04-30');
    assert.equal(april.length, 1);
    assert.equal(april[0].status, 'actual');
    assert.equal(april[0].sourceTransactionId, 10);
    assert.equal(april[0].actualAmount, 107);
    assert.equal(april[0].forecastAmount, 107);
  });
}

test('updateThisAndFuture segments the rule, preserves past actuals, and retargets unresolved overrides', async () => {
  await seed(baseData({
    scenario: {
      transactionOccurrences: [
        {
          id: 1,
          sourceTransactionId: 10,
          occurrenceKey: 'tx:10|date:2026-01-15|role:none',
          scheduledDate: '2026-01-15',
          plannedDate: null,
          actualDate: '2026-01-16',
          baselineAmount: 100,
          plannedAmount: 100,
          actualAmount: 105,
          status: 'actual',
          origin: 'generated',
          isOverride: true
        },
        {
          id: 2,
          sourceTransactionId: 10,
          occurrenceKey: 'tx:10|date:2026-03-15|role:none',
          scheduledDate: '2026-03-15',
          plannedDate: null,
          actualDate: null,
          baselineAmount: null,
          plannedAmount: 115,
          actualAmount: null,
          status: 'planned',
          origin: 'generated',
          isOverride: true
        }
      ]
    }
  }));

  const result = await OccurrenceManager.updateThisAndFuture(
    1,
    'tx:10|date:2026-02-15|role:none',
    { amount: 150, description: 'Repriced service' }
  );

  const current = await scenario();
  assert.equal(current.transactions.length, 2);
  const oldRule = current.transactions.find((rule) => rule.id === 10);
  const newRule = current.transactions.find((rule) => rule.id !== 10);
  assert.equal(oldRule.recurrence.endDate, '2026-02-14');
  assert.equal(newRule.recurrence.startDate, '2026-02-15');
  assert.equal(newRule.amount, 150);
  assert.equal(newRule.seriesRootId, 10);
  assert.equal(newRule.supersedesTransactionId, 10);
  assert.deepEqual(result.createdTransactionIds, [newRule.id]);

  const pastActual = current.transactionOccurrences.find((item) => item.id === 1);
  const futureOverride = current.transactionOccurrences.find((item) => item.id === 2);
  assert.equal(pastActual.sourceTransactionId, 10);
  assert.equal(futureOverride.sourceTransactionId, newRule.id);
  assert.equal(
    futureOverride.occurrenceKey,
    `tx:${newRule.id}|date:2026-03-15|role:none`
  );
  assert.equal(futureOverride.plannedAmount, 115);

  const amounts = resolveWindow(current, '2026-01-01', '2026-03-31')
    .map((occurrence) => [occurrence.status, occurrence.plannedAmount, occurrence.actualAmount]);
  assert.deepEqual(amounts, [
    ['actual', 100, 105],
    ['planned', 150, null],
    ['planned', 115, null]
  ]);
});

test('updateEntireSeries protects past rules and changes current and future unresolved segments', async () => {
  await OccurrenceManager.updateEntireSeries(
    1,
    'tx:10|date:2026-02-15|role:none',
    { amount: 175 }
  );
  const current = await scenario();
  const oldRule = current.transactions.find((rule) => rule.id === 10);
  const newRule = current.transactions.find((rule) => rule.id !== 10);
  assert.equal(oldRule.amount, 100);
  assert.equal(oldRule.recurrence.endDate, '2026-02-14');
  assert.equal(newRule.amount, 175);
  const amounts = resolveWindow(current, '2026-01-01', '2026-03-31')
    .map((occurrence) => occurrence.plannedAmount);
  assert.deepEqual(amounts, [100, 175, 175]);
});

test('this-and-future changes keep split components bounded and update the replacement component', async () => {
  const recurrence = {
    recurrenceType: { id: 4, name: 'Monthly - Day of Month' },
    startDate: '2026-01-15',
    endDate: '2026-04-30',
    interval: 1,
    dayOfMonth: 15
  };
  await seed(baseData({
    scenario: {
      transactions: [
        monthlyRule({
          id: 10,
          amount: 80,
          transactionGroupId: 'payment',
          transactionGroupRole: 'principal'
        }),
        monthlyRule({
          id: 11,
          amount: 20,
          description: 'Interest',
          transactionGroupId: 'payment',
          transactionGroupRole: 'interest'
        })
      ],
      splitTransactionSets: [{
        id: 'payment',
        description: 'Split payment',
        payingAccountId: 1,
        effectiveDate: '2026-01-15',
        strategy: 'manual',
        targetAccountId: 2,
        interestSource: 'manual',
        customRate: null,
        totalAmount: 100,
        recurrence,
        tags: [],
        components: [
          {
            role: 'principal',
            accountId: 2,
            transactionTypeId: 2,
            description: 'Principal',
            recurrence,
            periodicChange: null,
            amountMode: 'fixed',
            value: 80,
            order: 0
          },
          {
            role: 'interest',
            accountId: 3,
            transactionTypeId: 2,
            description: 'Interest',
            recurrence,
            periodicChange: null,
            amountMode: 'fixed',
            value: 20,
            order: 1
          }
        ]
      }]
    }
  }));

  await OccurrenceManager.updateThisAndFuture(
    1,
    'tx:10|date:2026-02-15|role:principal',
    { amount: 90 }
  );

  const current = await scenario();
  assert.equal(current.splitTransactionSets.length, 2);
  const oldSet = current.splitTransactionSets.find((set) => set.id === 'payment');
  const newSet = current.splitTransactionSets.find((set) => set.id !== 'payment');
  assert.equal(oldSet.recurrence.endDate, '2026-02-14');
  assert.ok(oldSet.components.every(
    (component) => component.recurrence.endDate === '2026-02-14'
  ));
  assert.equal(newSet.recurrence.startDate, '2026-02-15');
  assert.ok(newSet.components.every(
    (component) => component.recurrence.startDate === '2026-02-15'
  ));
  assert.equal(
    newSet.components.find((component) => component.role === 'principal').value,
    90
  );
  assert.equal(newSet.totalAmount, 110);
});

test('updateSplitSeries atomically segments all roles and preserves past actual history', async () => {
  await seed(splitData());
  await OccurrenceManager.markActual(
    1,
    'tx:10|date:2026-01-15|role:principal',
    {
      actualAmount: 82,
      actualDate: '2026-01-16',
      period: {
        periodTypeId: 3,
        startDate: '2026-01-01',
        endDate: '2026-01-31'
      }
    }
  );
  dispatchedEvents.length = 0;

  const result = await OccurrenceManager.updateSplitSeries(
    1,
    'tx:10|date:2026-02-15|role:principal',
    {
      scope: 'future',
      setUpdates: {
        description: 'Rebalanced payment',
        strategy: 'manual',
        payingAccountId: 1,
        targetAccountId: 2,
        totalAmount: 100,
        interestSource: 'manual',
        tags: ['rebalanced']
      },
      componentUpdates: [
        {
          role: 'principal',
          amount: 90,
          secondaryAccountId: 2,
          transactionTypeId: 2,
          description: 'Principal'
        },
        {
          role: 'interest',
          amount: 10,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          description: 'Interest'
        }
      ]
    }
  );

  const current = await scenario();
  assert.equal(result.scope, 'future');
  assert.equal(result.createdTransactionIds.length, 2);
  assert.equal(current.splitTransactionSets.length, 2);
  const replacement = current.splitTransactionSets.find(
    (set) => set.id !== 'payment'
  );
  assert.ok(replacement);
  assert.equal(replacement.description, 'Rebalanced payment');
  assert.equal(replacement.totalAmount, 100);
  assert.deepEqual(replacement.tags, ['rebalanced']);
  assert.equal(
    replacement.components.find((component) => component.role === 'principal').value,
    90
  );
  assert.equal(
    replacement.components.find((component) => component.role === 'interest').value,
    10
  );

  const replacementRules = current.transactions.filter(
    (rule) => rule.transactionGroupId === replacement.id
  );
  assert.equal(
    replacementRules.find((rule) => rule.transactionGroupRole === 'principal').amount,
    90
  );
  assert.equal(
    replacementRules.find((rule) => rule.transactionGroupRole === 'interest').amount,
    10
  );
  const pastActual = current.transactionOccurrences.find(
    (occurrence) =>
      occurrence.occurrenceKey === 'tx:10|date:2026-01-15|role:principal'
  );
  assert.equal(pastActual.status, 'actual');
  assert.equal(pastActual.actualAmount, 82);
  assert.equal(pastActual.sourceTransactionId, 10);
  assert.equal(dispatchedEvents.length, 1);
});

test('updateSplitSeries entire-series scope updates later split segments without rewriting the past', async () => {
  await seed(splitData());
  await OccurrenceManager.updateThisAndFuture(
    1,
    'tx:10|date:2026-03-15|role:principal',
    { amount: 85 }
  );

  await OccurrenceManager.updateSplitSeries(
    1,
    'tx:10|date:2026-02-15|role:principal',
    {
      scope: 'series',
      setUpdates: {
        strategy: 'manual',
        payingAccountId: 1,
        targetAccountId: 2,
        totalAmount: 100,
        interestSource: 'manual'
      },
      componentUpdates: [
        {
          role: 'principal',
          amount: 92,
          secondaryAccountId: 2,
          transactionTypeId: 2,
          description: 'Principal'
        },
        {
          role: 'interest',
          amount: 8,
          secondaryAccountId: 3,
          transactionTypeId: 2,
          description: 'Interest'
        }
      ]
    }
  );

  const current = await scenario();
  const futureSets = current.splitTransactionSets.filter(
    (set) => (set.activeFrom || set.recurrence?.startDate) >= '2026-02-15'
  );
  assert.equal(futureSets.length, 2);
  futureSets.forEach((set) => {
    assert.equal(
      set.components.find((component) => component.role === 'principal').value,
      92
    );
    assert.equal(
      set.components.find((component) => component.role === 'interest').value,
      8
    );
  });
  const pastSet = current.splitTransactionSets.find((set) => set.id === 'payment');
  assert.equal(
    pastSet.components.find((component) => component.role === 'principal').value,
    80
  );
  assert.equal(
    pastSet.components.find((component) => component.role === 'interest').value,
    20
  );
});

test('endSeries truncates a recurring rule before the boundary and preserves past actuals', async () => {
  await OccurrenceManager.markActual(
    1,
    'tx:10|date:2026-01-15|role:none',
    {
      actualAmount: 105,
      actualDate: '2026-01-16',
      period: {
        periodTypeId: 3,
        startDate: '2026-01-01',
        endDate: '2026-01-31'
      }
    }
  );
  await OccurrenceManager.updateOccurrenceOnly(
    1,
    'tx:10|date:2026-03-15|role:none',
    { plannedAmount: 115 }
  );
  dispatchedEvents.length = 0;

  const result = await OccurrenceManager.endSeries(
    1,
    'tx:10|date:2026-02-15|role:none'
  );

  const current = await scenario();
  assert.equal(result.boundary, '2026-02-15');
  assert.equal(result.endedOn, '2026-02-14');
  assert.equal(current.transactions.length, 1);
  assert.equal(current.transactions[0].activeTo, '2026-02-14');
  assert.equal(current.transactions[0].recurrence.endDate, '2026-02-14');
  assert.deepEqual(result.removedOccurrenceKeys, [
    'tx:10|date:2026-03-15|role:none'
  ]);
  assert.equal(current.transactionOccurrences.length, 1);
  assert.equal(current.transactionOccurrences[0].status, 'actual');
  assert.equal(current.transactionOccurrences[0].actualAmount, 105);
  assert.deepEqual(
    resolveWindow(current, '2026-01-01', '2026-04-30').map(
      (occurrence) => [
        occurrence.scheduledDate,
        occurrence.status,
        occurrence.actualAmount
      ]
    ),
    [['2026-01-15', 'actual', 105]]
  );
  assert.equal(current.projection.stale, true);
  assert.match(current.projection.staleReason, /Recurring series ended/);
  assert.equal(dispatchedEvents.length, 1);
});

test('endSeries removes a never-started rule and its unresolved occurrence overrides', async () => {
  await OccurrenceManager.updateOccurrenceOnly(
    1,
    'tx:10|date:2026-02-15|role:none',
    { plannedAmount: 125 }
  );
  const result = await OccurrenceManager.endSeries(
    1,
    'tx:10|date:2026-01-15|role:none'
  );

  const current = await scenario();
  assert.deepEqual(result.removedTransactionIds, [10]);
  assert.equal(current.transactions.length, 0);
  assert.equal(current.transactionOccurrences.length, 0);
  assert.deepEqual(
    resolveWindow(current, '2026-01-01', '2026-04-30'),
    []
  );
});

test('endSeries truncates every split role and split-set component atomically', async () => {
  await seed(splitData());
  await OccurrenceManager.markActual(
    1,
    'tx:10|date:2026-01-15|role:principal',
    {
      actualAmount: 82,
      actualDate: '2026-01-16',
      period: {
        periodTypeId: 3,
        startDate: '2026-01-01',
        endDate: '2026-01-31'
      }
    }
  );
  dispatchedEvents.length = 0;

  const result = await OccurrenceManager.endSeries(
    1,
    'tx:10|date:2026-02-15|role:principal'
  );

  const current = await scenario();
  assert.deepEqual(
    result.affectedTransactionIds.sort((a, b) => a - b),
    [10, 11]
  );
  assert.deepEqual(result.affectedTransactionGroupIds, ['payment']);
  assert.ok(current.transactions.every(
    (rule) =>
      rule.activeTo === '2026-02-14' &&
      rule.recurrence.endDate === '2026-02-14'
  ));
  assert.equal(current.splitTransactionSets.length, 1);
  assert.equal(current.splitTransactionSets[0].activeTo, '2026-02-14');
  assert.equal(
    current.splitTransactionSets[0].recurrence.endDate,
    '2026-02-14'
  );
  assert.ok(current.splitTransactionSets[0].components.every(
    (component) => component.recurrence.endDate === '2026-02-14'
  ));
  const resolved = resolveWindow(current, '2026-01-01', '2026-04-30');
  assert.equal(resolved.length, 2);
  assert.ok(resolved.every(
    (occurrence) => occurrence.scheduledDate === '2026-01-15'
  ));
  assert.equal(
    resolved.find(
      (occurrence) => occurrence.transactionGroupRole === 'principal'
    ).actualAmount,
    82
  );
  assert.equal(dispatchedEvents.length, 1);
});

test('endSeries removes later split segments while retaining the bounded historical segment', async () => {
  await seed(splitData());
  await OccurrenceManager.markActual(
    1,
    'tx:10|date:2026-01-15|role:principal',
    {
      actualAmount: 82,
      actualDate: '2026-01-16',
      period: {
        periodTypeId: 3,
        startDate: '2026-01-01',
        endDate: '2026-01-31'
      }
    }
  );
  const segmented = await OccurrenceManager.updateThisAndFuture(
    1,
    'tx:10|date:2026-03-15|role:principal',
    { amount: 85 }
  );
  const beforeEnd = await scenario();
  const laterSet = beforeEnd.splitTransactionSets.find(
    (set) => set.id !== 'payment'
  );
  assert.ok(laterSet);
  dispatchedEvents.length = 0;

  const result = await OccurrenceManager.endSeries(
    1,
    'tx:10|date:2026-02-15|role:principal'
  );

  const current = await scenario();
  assert.deepEqual(
    result.removedTransactionIds.sort((a, b) => a - b),
    [...segmented.createdTransactionIds].sort((a, b) => a - b)
  );
  assert.deepEqual(result.removedTransactionGroupIds, [laterSet.id]);
  assert.deepEqual(
    current.transactions.map((rule) => rule.id).sort((a, b) => a - b),
    [10, 11]
  );
  assert.ok(current.transactions.every(
    (rule) => (
      rule.transactionGroupId === 'payment' &&
      rule.recurrence.endDate === '2026-02-14'
    )
  ));
  assert.deepEqual(
    current.splitTransactionSets.map((set) => set.id),
    ['payment']
  );
  assert.equal(
    current.splitTransactionSets[0].recurrence.endDate,
    '2026-02-14'
  );
  const actual = current.transactionOccurrences.find(
    (occurrence) =>
      occurrence.occurrenceKey ===
        'tx:10|date:2026-01-15|role:principal'
  );
  assert.equal(actual.status, 'actual');
  assert.equal(actual.actualAmount, 82);
  assert.equal(actual.baselineAmount, 80);
  assert.ok(resolveWindow(current, '2026-02-01', '2026-04-30').every(
    (occurrence) => occurrence.status !== 'planned'
  ));
  assert.equal(dispatchedEvents.length, 1);
});

test('endSeries rejects a boundary before protected future history without partial writes', async () => {
  await seed(baseData({
    scenario: {
      transactionOccurrences: [{
        id: 1,
        sourceTransactionId: 10,
        occurrenceKey: 'tx:10|date:2026-04-15|role:none',
        scheduledDate: '2026-04-15',
        plannedDate: null,
        actualDate: '2026-04-16',
        baselineAmount: 100,
        plannedAmount: 100,
        actualAmount: 107,
        status: 'actual',
        origin: 'generated',
        isOverride: true,
        actualSnapshotVersion: 1
      }]
    }
  }));
  const before = await scenario();
  dispatchedEvents.length = 0;

  await assert.rejects(
    () => OccurrenceManager.endSeries(
      1,
      'tx:10|date:2026-02-15|role:none'
    ),
    (error) => (
      error?.code === 'series-history-conflict' &&
      error?.details?.occurrenceKeys?.[0] ===
        'tx:10|date:2026-04-15|role:none'
    )
  );

  assert.deepEqual(await scenario(), before);
  assert.equal(dispatchedEvents.length, 0);
});

test('series commands reject a boundary that would rewrite actual history', async () => {
  await OccurrenceManager.markActual(1, 'tx:10|date:2026-02-15|role:none', {
    actualAmount: 100,
    actualDate: '2026-02-15'
  });
  await assert.rejects(
    () => OccurrenceManager.updateThisAndFuture(
      1,
      'tx:10|date:2026-02-15|role:none',
      { amount: 200 }
    ),
    (error) => error?.code === 'actual-history-protected'
  );
});

test('TransactionManager preserves series metadata, marks projection stale, and emits after save', async () => {
  const current = await scenario();
  const next = {
    ...current.transactions[0],
    seriesRootId: 10,
    supersedesTransactionId: 9,
    activeFrom: '2026-01-15',
    activeTo: '2026-04-30',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z'
  };
  dispatchedEvents.length = 0;
  await TransactionManager.saveAll(1, [next]);

  const saved = await scenario();
  assert.equal(saved.transactions[0].seriesRootId, 10);
  assert.equal(saved.transactions[0].supersedesTransactionId, 9);
  assert.equal(saved.transactions[0].activeFrom, '2026-01-15');
  assert.equal(saved.transactions[0].activeTo, '2026-04-30');
  assert.equal(saved.projection.stale, true);
  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].type, 'forecast:planChanged');
});
