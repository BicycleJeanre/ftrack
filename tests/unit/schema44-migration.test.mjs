import test from 'node:test';
import assert from 'node:assert/strict';

const { migrateAppData } = await import('../../js/shared/migration-utils.js');
const {
  CURRENT_SCHEMA_VERSION,
  sanitizeAppDataForWrite
} = await import('../../js/shared/app-data-utils.js');
const { validateAppData } = await import('../../js/app/services/validation-service.js');
const { resolveScenarioOccurrences } = await import(
  '../../js/domain/queries/resolve-scenario-occurrences.js'
);

const MIGRATED_AT = '2026-08-02T10:00:00.000Z';

function account(id, name, type = 1) {
  return {
    id,
    name,
    type,
    currency: 1,
    startingBalance: 0,
    openDate: '2026-01-01'
  };
}

function plannedRule(overrides = {}) {
  return {
    id: 10,
    primaryAccountId: 1,
    secondaryAccountId: 2,
    transactionTypeId: 2,
    amount: 100,
    description: 'Monthly plan',
    recurrence: {
      recurrenceType: 4,
      startDate: '2026-01-15',
      endDate: null,
      interval: 1,
      dayOfMonth: 15
    },
    periodicChange: null,
    status: { name: 'planned', actualAmount: null, actualDate: null },
    tags: [],
    ...overrides
  };
}

function budget(overrides = {}) {
  return {
    id: 100,
    sourceTransactionId: 10,
    primaryAccountId: 1,
    secondaryAccountId: 2,
    transactionTypeId: 2,
    amount: 100,
    plannedAmount: 100,
    baselineAmount: null,
    description: 'Monthly plan',
    occurrenceDate: '2026-01-15',
    scheduledDate: '2026-01-15',
    plannedDate: null,
    occurrenceKey: 'tx:10|date:2026-01-15|role:none',
    origin: 'generated',
    isOverride: false,
    status: { name: 'planned', actualAmount: null, actualDate: null },
    tags: [],
    ...overrides
  };
}

function legacyApp(overrides = {}) {
  const scenario = {
    id: 1,
    version: 1,
    name: 'Migration fixture',
    description: null,
    accounts: [
      account(1, 'Cash'),
      account(2, 'Expense', 5)
    ],
    accountGroups: [],
    splitTransactionSets: [],
    transactions: [plannedRule()],
    budgets: [budget()],
    budgetWindow: {
      config: {
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        periodTypeId: 3
      }
    },
    projection: {
      config: {
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        periodTypeId: 3,
        source: 'budget'
      },
      rows: [{ id: 1, accountId: 1, date: '2026-01-31', balance: -100 }],
      generatedAt: '2026-01-31T00:00:00.000Z'
    },
    planning: null,
    ...overrides.scenario
  };

  return {
    schemaVersion: 43,
    scenarios: [scenario],
    uiState: {
      lastWorkflowId: 'budget',
      lastScenarioId: 1,
      lastScenarioVersion: 1,
      viewPeriodTypeIds: {
        transactions: 2,
        budgets: 4,
        projections: 5
      },
      accordionStates: {}
    },
    ...overrides.root
  };
}

test('schema 43 migrates to the exact schema 44 planning collections', () => {
  const migrated = migrateAppData(legacyApp(), { now: MIGRATED_AT });
  const scenario = migrated.scenarios[0];

  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(Object.hasOwn(scenario, 'budgets'), false);
  assert.equal(Object.hasOwn(scenario, 'budgetWindow'), false);
  assert.deepEqual(scenario.baselinePeriods, []);
  assert.equal(scenario.transactionOccurrences.length, 1);
  assert.equal(scenario.transactions[0].status, undefined);
  assert.equal(scenario.transactionOccurrences[0].status, 'planned');
  assert.equal(scenario.transactionOccurrences[0].isOverride, false);
  assert.equal(scenario.transactionOccurrences[0].plannedAmount, null);
  assert.equal(scenario.projection.config.source, undefined);
  assert.deepEqual(scenario.projection.rows, []);
  assert.equal(scenario.projection.generatedAt, null);
  assert.equal(scenario.projection.stale, true);
  assert.equal(scenario.projection.staleAt, MIGRATED_AT);
  assert.equal(scenario.projection.staleReason, 'schema-migration');
  assert.equal(migrated.uiState.viewPeriodTypeIds.planActuals, 4);
  assert.equal(migrated.uiState.viewPeriodTypeIds.budgets, undefined);
  assert.equal(migrated.migrationReport.summary.projectionRowsCleared, 1);
  assert.equal(validateAppData(migrated).isValid, true);
});

test('legacy actual transactions replace matching linked plan rows during migration', () => {
  const actual = plannedRule({
    id: 20,
    recurrence: null,
    effectiveDate: '2026-01-20',
    status: {
      name: 'actual',
      actualAmount: 125,
      actualDate: '2026-01-21'
    }
  });
  const linkedPlan = budget({
    id: 200,
    sourceTransactionId: 20,
    scheduledDate: '2026-01-20',
    occurrenceDate: '2026-01-20',
    occurrenceKey: 'tx:20|date:2026-01-20|role:none'
  });
  const migrated = migrateAppData(
    legacyApp({
      scenario: {
        transactions: [actual],
        budgets: [linkedPlan]
      }
    }),
    { now: MIGRATED_AT }
  );

  assert.equal(migrated.scenarios[0].transactions.length, 0);
  assert.equal(migrated.scenarios[0].transactionOccurrences.length, 1);
  const occurrence = migrated.scenarios[0].transactionOccurrences[0];
  assert.equal(occurrence.sourceTransactionId, null);
  assert.equal(occurrence.occurrenceKey, 'occurrence:200');
  assert.equal(occurrence.status, 'actual');
  assert.equal(occurrence.actualAmount, 125);
  assert.equal(occurrence.actualDate, '2026-01-21');
  assert.equal(occurrence.plannedAmount, 100);
});

test('actual transactions use explicit source identity and replace the linked plan once', () => {
  const actual = plannedRule({
    id: 20,
    sourceTransactionId: 10,
    recurrence: null,
    effectiveDate: '2026-01-15',
    description: 'Recorded monthly plan',
    status: {
      name: 'actual',
      actualAmount: 110,
      actualDate: '2026-01-16'
    }
  });
  const migrated = migrateAppData(
    legacyApp({
      scenario: {
        transactions: [plannedRule(), actual],
        budgets: [budget({ baselineAmount: 100 })]
      }
    }),
    { now: MIGRATED_AT }
  );
  const scenario = migrated.scenarios[0];

  assert.equal(scenario.transactions.length, 1);
  assert.equal(scenario.transactionOccurrences.length, 1);
  const [occurrence] = scenario.transactionOccurrences;
  assert.equal(occurrence.sourceTransactionId, 10);
  assert.equal(occurrence.occurrenceKey, 'tx:10|date:2026-01-15|role:none');
  assert.equal(occurrence.status, 'actual');
  assert.equal(occurrence.actualAmount, 110);
  assert.equal(occurrence.actualDate, '2026-01-16');
  assert.equal(occurrence.actualSnapshotVersion, 1);
  assert.equal(occurrence.baselineSnapshotVersion, 1);

  const resolved = resolveScenarioOccurrences({
    scenario,
    startDate: '2026-01-01',
    endDate: '2026-01-31'
  }).occurrences;
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].status, 'actual');
  assert.equal(resolved[0].forecastAmount, 110);
  assert.equal(validateAppData(migrated).isValid, true);
});

test('migration preserves future overrides plus manual planned and actual rows', () => {
  const migrated = migrateAppData(
    legacyApp({
      scenario: {
        budgets: [
          budget({
            id: 201,
            scheduledDate: '2026-02-15',
            occurrenceDate: '2026-02-20',
            plannedDate: '2026-02-20',
            occurrenceKey: 'tx:10|date:2026-02-15|role:none',
            plannedAmount: 135,
            amount: 135,
            description: 'Adjusted February plan',
            isOverride: true
          }),
          budget({
            id: 202,
            baselineAmount: 100,
            status: {
              name: 'actual',
              actualAmount: 112,
              actualDate: '2026-01-16'
            }
          }),
          budget({
            id: 203,
            sourceTransactionId: null,
            occurrenceKey: null,
            scheduledDate: '2026-03-05',
            occurrenceDate: '2026-03-05',
            plannedAmount: 45,
            amount: 45,
            description: 'Manual planned item',
            isOverride: true
          }),
          budget({
            id: 204,
            sourceTransactionId: null,
            occurrenceKey: null,
            scheduledDate: '2026-03-07',
            occurrenceDate: '2026-03-07',
            baselineAmount: 0,
            plannedAmount: 0,
            amount: 0,
            description: 'Manual actual item',
            isOverride: true,
            status: {
              name: 'actual',
              actualAmount: 75,
              actualDate: '2026-03-07'
            }
          })
        ]
      }
    }),
    { now: MIGRATED_AT }
  );
  const occurrences = migrated.scenarios[0].transactionOccurrences;

  const futureOverride = occurrences.find((occurrence) => occurrence.id === 201);
  assert.equal(futureOverride.sourceTransactionId, 10);
  assert.equal(futureOverride.scheduledDate, '2026-02-15');
  assert.equal(futureOverride.plannedDate, '2026-02-20');
  assert.equal(futureOverride.plannedAmount, 135);
  assert.equal(futureOverride.isOverride, true);

  const linkedActual = occurrences.find((occurrence) => occurrence.id === 202);
  assert.equal(linkedActual.status, 'actual');
  assert.equal(linkedActual.actualAmount, 112);
  assert.equal(linkedActual.actualSnapshotVersion, 1);

  const manualPlan = occurrences.find((occurrence) => occurrence.id === 203);
  assert.equal(manualPlan.sourceTransactionId, null);
  assert.equal(manualPlan.occurrenceKey, 'occurrence:203');
  assert.equal(manualPlan.status, 'planned');
  assert.equal(manualPlan.plannedAmount, 45);

  const manualActual = occurrences.find((occurrence) => occurrence.id === 204);
  assert.equal(manualActual.sourceTransactionId, null);
  assert.equal(manualActual.occurrenceKey, 'occurrence:204');
  assert.equal(manualActual.status, 'actual');
  assert.equal(manualActual.baselineAmount, 0);
  assert.equal(manualActual.actualAmount, 75);
  assert.equal(manualActual.actualSnapshotVersion, 1);
  assert.equal(validateAppData(migrated).isValid, true);
});

test('migration reports a separate actual transaction that conflicts with an actual occurrence', () => {
  const actualTransaction = plannedRule({
    id: 20,
    sourceTransactionId: 10,
    recurrence: null,
    effectiveDate: '2026-01-15',
    status: {
      name: 'actual',
      actualAmount: 125,
      actualDate: '2026-01-17'
    }
  });
  const migrated = migrateAppData(
    legacyApp({
      scenario: {
        transactions: [plannedRule(), actualTransaction],
        budgets: [budget({
          baselineAmount: 100,
          status: {
            name: 'actual',
            actualAmount: 112,
            actualDate: '2026-01-16'
          }
        })]
      }
    }),
    { now: MIGRATED_AT }
  );

  const [occurrence] = migrated.scenarios[0].transactionOccurrences;
  assert.equal(occurrence.status, 'actual');
  assert.equal(occurrence.actualAmount, 112);
  assert.equal(occurrence.actualDate, '2026-01-16');
  const conflict = migrated.migrationReport.scenarios[0].issues.find(
    (issue) => issue.code === 'conflicting-actual-occurrence'
  );
  assert.ok(conflict);
  assert.equal(conflict.sourceCollection, 'transactions');
  assert.equal(conflict.sourceId, 20);
  assert.equal(conflict.recoveryRecord.status.actualAmount, 125);
});

test('migration keeps split component roles as distinct occurrence identities', () => {
  const recurrence = plannedRule().recurrence;
  const migrated = migrateAppData(
    legacyApp({
      scenario: {
        accounts: [
          account(1, 'Cash'),
          account(2, 'Principal', 5),
          account(3, 'Interest', 5)
        ],
        transactions: [
          plannedRule({
            id: 10,
            amount: 80,
            transactionGroupId: 'payment',
            transactionGroupRole: 'principal'
          }),
          plannedRule({
            id: 11,
            secondaryAccountId: 3,
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
          targetAccountId: 2,
          totalAmount: 100,
          strategy: 'manual',
          interestSource: 'manual',
          recurrence,
          components: [
            { role: 'principal', accountId: 2, transactionTypeId: 2, value: 80 },
            { role: 'interest', accountId: 3, transactionTypeId: 2, value: 20 }
          ]
        }],
        budgets: [
          budget({
            id: 301,
            sourceTransactionId: 10,
            transactionGroupId: 'payment',
            transactionGroupRole: 'principal',
            plannedAmount: 80,
            amount: 80,
            occurrenceKey: 'tx:10|date:2026-01-15|role:principal'
          }),
          budget({
            id: 302,
            sourceTransactionId: 11,
            secondaryAccountId: 3,
            transactionGroupId: 'payment',
            transactionGroupRole: 'interest',
            plannedAmount: 20,
            amount: 20,
            occurrenceKey: 'tx:11|date:2026-01-15|role:interest'
          })
        ]
      }
    }),
    { now: MIGRATED_AT }
  );

  const occurrences = migrated.scenarios[0].transactionOccurrences;
  assert.equal(occurrences.length, 2);
  assert.deepEqual(
    occurrences.map((occurrence) => occurrence.occurrenceKey).sort(),
    [
      'tx:10|date:2026-01-15|role:principal',
      'tx:11|date:2026-01-15|role:interest'
    ]
  );
  assert.equal(validateAppData(migrated).isValid, true);
});

test('orphaned, ambiguous, invalid, and duplicate rows remain recoverable in migrationReport', () => {
  const migrated = migrateAppData(
    legacyApp({
      scenario: {
        transactions: [plannedRule()],
        budgets: [
          budget({
            id: 101,
            sourceTransactionId: 999,
            occurrenceKey: null
          }),
          budget({
            id: 102,
            scheduledDate: null,
            occurrenceKey: null,
            occurrenceDate: '2026-02-18'
          }),
          budget({
            id: 103,
            scheduledDate: 'not-a-date',
            occurrenceDate: 'not-a-date',
            occurrenceKey: null
          }),
          budget({
            id: 104,
            status: {
              name: 'actual',
              actualAmount: 110,
              actualDate: '2026-01-16'
            }
          }),
          budget({
            id: 105,
            status: {
              name: 'actual',
              actualAmount: 120,
              actualDate: '2026-01-17'
            }
          })
        ]
      }
    }),
    { now: MIGRATED_AT }
  );

  const report = migrated.migrationReport;
  const codes = report.scenarios[0].issues.map((entry) => entry.code);
  assert.ok(codes.includes('orphan-source-transaction'));
  assert.ok(codes.includes('ambiguous-recurring-occurrence'));
  assert.ok(codes.includes('invalid-occurrence-date'));
  assert.ok(codes.includes('unmigrated-occurrence-date'));
  assert.ok(codes.includes('duplicate-occurrence'));
  assert.ok(report.summary.recoveryRecordCount >= 5);
  assert.ok(
    report.scenarios[0].issues
      .filter((entry) => entry.recoveryRecord)
      .every((entry) => typeof entry.recoveryRecord === 'object')
  );

  const orphan = migrated.scenarios[0].transactionOccurrences.find(
    (occurrence) => occurrence.id === 101
  );
  const ambiguous = migrated.scenarios[0].transactionOccurrences.find(
    (occurrence) => occurrence.id === 102
  );
  assert.equal(orphan.sourceTransactionId, null);
  assert.equal(orphan.occurrenceKey, 'occurrence:101');
  assert.equal(ambiguous.sourceTransactionId, null);
  assert.equal(ambiguous.occurrenceKey, 'occurrence:102');

  const selectedDuplicate = migrated.scenarios[0].transactionOccurrences.find(
    (occurrence) => occurrence.occurrenceKey === 'tx:10|date:2026-01-15|role:none'
  );
  assert.equal(selectedDuplicate.id, 105);
  assert.equal(selectedDuplicate.actualAmount, 120);
});

test('schema 44 sanitation retains migration reports and clean-schema metadata', () => {
  const migrated = migrateAppData(legacyApp(), { now: MIGRATED_AT });
  migrated.scenarios[0].baselinePeriods.push({
    periodTypeId: 3,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    frozenAt: MIGRATED_AT
  });
  migrated.scenarios[0].transactions[0].promotedFromOccurrenceKey = 'occurrence:55';

  const roundTripped = sanitizeAppDataForWrite(
    JSON.parse(JSON.stringify(migrated))
  );

  assert.deepEqual(roundTripped, migrated);
  assert.equal(
    roundTripped.scenarios[0].transactions[0].promotedFromOccurrenceKey,
    'occurrence:55'
  );
  assert.equal(roundTripped.migrationReport.toSchemaVersion, 44);
});

test('future schema versions are never downgraded', () => {
  assert.throws(
    () => migrateAppData({ schemaVersion: 45, scenarios: [], uiState: {} }),
    /Cannot migrate future schemaVersion 45/
  );
});
