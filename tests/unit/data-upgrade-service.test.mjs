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

const {
  analyzeAppDataUpgrade,
  browserDataNeedsUpgradeReview,
  readRawBrowserData
} = await import('../../js/app/services/data-upgrade-service.js');
const { STORAGE_KEY } = await import('../../js/app/services/storage-service.js');

const MIGRATED_AT = '2026-08-03T08:00:00.000Z';

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

function legacyApp() {
  return {
    schemaVersion: 43,
    scenarios: [
      {
        id: 1,
        version: 1,
        name: 'Legacy upgrade fixture',
        description: null,
        accounts: [
          account(1, 'Checking'),
          account(2, 'Expense', 5)
        ],
        accountGroups: [],
        splitTransactionSets: [],
        transactions: [
          {
            id: 10,
            primaryAccountId: 1,
            secondaryAccountId: 2,
            transactionTypeId: 2,
            amount: 100,
            description: 'Monthly cost',
            recurrence: {
              recurrenceType: 4,
              startDate: '2026-01-15',
              endDate: null,
              interval: 1,
              dayOfMonth: 15
            },
            periodicChange: null,
            status: {
              name: 'planned',
              actualAmount: null,
              actualDate: null
            },
            tags: []
          }
        ],
        budgets: [
          {
            id: 100,
            sourceTransactionId: 10,
            primaryAccountId: 1,
            secondaryAccountId: 2,
            transactionTypeId: 2,
            amount: 100,
            plannedAmount: 100,
            baselineAmount: null,
            description: 'Monthly cost',
            occurrenceDate: '2026-01-15',
            scheduledDate: '2026-01-15',
            occurrenceKey: 'tx:10|date:2026-01-15|role:none',
            origin: 'generated',
            isOverride: false,
            status: {
              name: 'planned',
              actualAmount: null,
              actualDate: null
            },
            tags: []
          }
        ],
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
          rows: [{ accountId: 1, date: '2026-01-31', balance: -100 }],
          generatedAt: '2026-01-31T00:00:00.000Z'
        },
        planning: null
      }
    ],
    uiState: {
      lastWorkflowId: 'budget',
      lastScenarioId: 1,
      lastScenarioVersion: 1,
      viewPeriodTypeIds: {
        transactions: 3,
        budgets: 3,
        projections: 3
      },
      accordionStates: {}
    }
  };
}

function currentAppWithInvalidReference() {
  const data = analyzeAppDataUpgrade(legacyApp(), { now: MIGRATED_AT }).data;
  data.scenarios[0].transactions[0].primaryAccountId = 999;
  return data;
}

test.beforeEach(() => {
  globalThis.localStorage.clear();
});

test('legacy data is upgraded, validated, and returned with a structured change report', () => {
  const result = analyzeAppDataUpgrade(legacyApp(), {
    sourceLabel: 'legacy.json',
    sourceKind: 'file',
    now: MIGRATED_AT
  });

  assert.equal(result.isValid, true);
  assert.equal(result.canApply, true);
  assert.equal(result.migrated, true);
  assert.equal(result.fromSchemaVersion, 43);
  assert.equal(result.toSchemaVersion, 44);
  assert.equal(result.data.schemaVersion, 44);
  assert.equal(result.validation.totalIssues, 0);
  assert.ok(result.changes.some((entry) => entry.path === 'schemaVersion'));
  assert.ok(result.changes.some((entry) => entry.path === 'scenarios[0].budgets'));
  assert.ok(result.changes.some((entry) => entry.path === 'scenarios[0].transactionOccurrences'));
  assert.equal(result.report.validationPassed, true);
  assert.ok(result.report.summary.fieldsAdded > 0);
  assert.ok(result.report.summary.fieldsRemoved > 0);
});

test('current-schema data is still validated and invalid references block apply', () => {
  const result = analyzeAppDataUpgrade(currentAppWithInvalidReference(), {
    sourceLabel: 'invalid-current.json',
    sourceKind: 'file'
  });

  assert.equal(result.migrated, false);
  assert.equal(result.isValid, false);
  assert.equal(result.canApply, false);
  assert.ok(result.validation.totalIssues > 0);
  assert.ok(
    result.validation.scenarios[0].issues.some((entry) =>
      entry.path.includes('primaryAccountId')
    )
  );
});

test('malformed JSON and future schemas return downloadable failure reports', () => {
  const malformed = analyzeAppDataUpgrade('{not json', {
    sourceLabel: 'broken.json'
  });
  assert.equal(malformed.isValid, false);
  assert.equal(malformed.data, null);
  assert.match(malformed.validation.rootIssues[0].message, /Invalid JSON/);

  const future = analyzeAppDataUpgrade({
    schemaVersion: 45,
    scenarios: [],
    uiState: {}
  });
  assert.equal(future.isValid, false);
  assert.match(future.validation.rootIssues[0].message, /cannot be downgraded/i);
});

test('raw browser data can be selected without mutating localStorage', () => {
  const original = JSON.stringify(legacyApp());
  globalThis.localStorage.setItem(STORAGE_KEY, original);

  assert.equal(browserDataNeedsUpgradeReview(), true);
  const source = readRawBrowserData();
  const result = analyzeAppDataUpgrade(source.rawText, {
    sourceLabel: source.sourceLabel,
    sourceKind: source.sourceKind,
    now: MIGRATED_AT
  });

  assert.equal(result.isValid, true);
  assert.equal(result.sourceKind, 'browser');
  assert.equal(globalThis.localStorage.getItem(STORAGE_KEY), original);
});
