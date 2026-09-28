import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.items = new Map(); }
  getItem(key) { return this.items.has(key) ? this.items.get(key) : null; }
  setItem(key, value) { this.items.set(key, String(value)); }
  removeItem(key) { this.items.delete(key); }
}

globalThis.localStorage = new MemoryStorage();

const DataStore = await import('../../js/app/services/storage-service.js');
const PeriodVariantManager = await import(
  '../../js/app/managers/period-variant-manager.js'
);
const { CURRENT_SCHEMA_VERSION } = await import(
  '../../js/shared/app-data-utils.js'
);

function baseData() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    scenarios: [{
      id: 1,
      version: 1,
      name: 'What-if test',
      accounts: [],
      accountGroups: [],
      splitTransactionSets: [],
      transactions: [{ id: 10, amount: 100 }],
      transactionOccurrences: [],
      baselinePeriods: [],
      planning: {
        generatePlan: { startDate: '2026-01-01', endDate: '2026-12-31' },
        advancedGoalSolver: { startDate: '2026-01-01', endDate: '2026-12-31' },
        periodVariants: []
      }
    }],
    uiState: {}
  };
}

test('period what-if snapshots isolate edits, skips, and additions from Base', async () => {
  await DataStore.write(baseData());
  const created = await PeriodVariantManager.create(1, {
    name: 'Lower spending',
    periodType: 'Month',
    periodId: '2026-09',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    occurrences: [{
      id: 1,
      occurrenceKey: 'tx:10|date:2026-09-15|role:none',
      scheduledDate: '2026-09-15',
      effectiveDate: '2026-09-15',
      status: 'planned',
      plannedAmount: 100,
      description: 'Shop'
    }]
  });

  const variantId = created.variant.id;
  await PeriodVariantManager.updateOccurrence(
    1,
    variantId,
    'tx:10|date:2026-09-15|role:none',
    { plannedAmount: 75, status: 'skipped' }
  );
  await PeriodVariantManager.createOccurrence(1, variantId, {
    scheduledDate: '2026-09-20',
    plannedDate: '2026-09-20',
    plannedAmount: 25,
    description: 'What-if only'
  });

  const data = await DataStore.read();
  const scenario = data.scenarios[0];
  const variant = scenario.planning.periodVariants[0];
  assert.equal(variant.name, 'Lower spending');
  assert.equal(variant.occurrences[0].plannedAmount, 75);
  assert.equal(variant.occurrences[0].status, 'skipped');
  assert.equal(variant.occurrences[1].description, 'What-if only');
  assert.equal(scenario.transactions.length, 1);
  assert.equal(scenario.transactions[0].id, 10);
  assert.equal(scenario.transactions[0].amount, 100);
  assert.deepEqual(scenario.transactionOccurrences, []);
});

test('actual rows in a what-if snapshot are protected', async () => {
  await DataStore.write(baseData());
  const created = await PeriodVariantManager.create(1, {
    name: 'History comparison',
    periodType: 'Month',
    periodId: '2026-09',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    occurrences: [{
      occurrenceKey: 'actual-1',
      scheduledDate: '2026-09-01',
      effectiveDate: '2026-09-01',
      status: 'actual',
      plannedAmount: 100,
      actualAmount: 110
    }]
  });

  await assert.rejects(
    PeriodVariantManager.updateOccurrence(
      1,
      created.variant.id,
      'actual-1',
      { plannedAmount: 1 }
    ),
    /Actual history is read-only/
  );
});
