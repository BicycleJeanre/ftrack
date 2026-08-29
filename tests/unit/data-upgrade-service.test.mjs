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
const { prepareSafeAppDataRepairs } = await import('../../js/app/services/data-repair-service.js');
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

test('data checker routes legacy Budget preferences to General without changing plan items', () => {
  const source = analyzeAppDataUpgrade(legacyApp(), { now: MIGRATED_AT }).data;
  source.uiState.lastWorkflowId = 'budget';
  const occurrences = JSON.stringify(source.scenarios[0].transactionOccurrences);

  const result = analyzeAppDataUpgrade(source, { sourceKind: 'browser' });

  assert.equal(result.isValid, true);
  assert.equal(result.changed, true);
  assert.equal(result.data.uiState.lastWorkflowId, 'general');
  assert.equal(JSON.stringify(result.data.scenarios[0].transactionOccurrences), occurrences);
  assert.ok(result.changes.some((entry) => (
    entry.path === 'uiState.lastWorkflowId' && entry.after === 'general'
  )));
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

test('safe repair preview resolves numeric strings without changing the source', () => {
  const source = analyzeAppDataUpgrade(legacyApp(), { now: MIGRATED_AT }).data;
  source.scenarios[0].accounts[0].id = '1';
  source.scenarios[0].accounts[0].type = '1';
  source.scenarios[0].accounts[0].startingBalance = '1250.50';
  source.scenarios[0].accounts[1].currency = null;
  source.scenarios[0].transactions[0].description = '';
  source.scenarios[0].transactions[0].recurrence = {
    recurrenceType: 7,
    startDate: '2026-04-23',
    endDate: null,
    interval: '1',
    month: null,
    dayOfYear: null
  };
  const original = JSON.stringify(source);

  const checked = analyzeAppDataUpgrade(source, { sourceKind: 'browser' });
  assert.equal(checked.isValid, false);
  assert.equal(checked.repairProposal.available, true);
  assert.ok(checked.repairProposal.resolvesIssueCount >= 3);
  assert.equal(JSON.stringify(source), original);

  const repaired = analyzeAppDataUpgrade(source, {
    sourceKind: 'browser',
    applySafeRepairs: true
  });
  assert.equal(repaired.repairApplied, true);
  assert.equal(repaired.isValid, true, JSON.stringify(repaired.validation));
  assert.equal(repaired.data.scenarios[0].accounts[0].id, 1);
  assert.equal(repaired.data.scenarios[0].accounts[0].type, 1);
  assert.equal(repaired.data.scenarios[0].accounts[0].startingBalance, 1250.5);
  assert.equal(repaired.data.scenarios[0].accounts[1].currency, 1);
  assert.equal(repaired.data.scenarios[0].transactions[0].description, 'Checking → Expense');
  assert.equal(repaired.data.scenarios[0].transactions[0].recurrence.interval, 1);
  assert.equal(repaired.data.scenarios[0].transactions[0].recurrence.month, 4);
  assert.equal(repaired.data.scenarios[0].transactions[0].recurrence.dayOfYear, 23);
  assert.ok(repaired.changes.some((entry) =>
    entry.path === 'scenarios[0].accounts[0].startingBalance'
  ));
});

test('safe repairs never rewrite retained migration recovery records', () => {
  const source = analyzeAppDataUpgrade(legacyApp(), { now: MIGRATED_AT }).data;
  source.scenarios[0].accounts[0].startingBalance = '10';
  source.migrationReport.scenarios[0].issues = [{
    severity: 'warning',
    code: 'retained-test',
    message: 'Retained source record',
    recoveryRecord: { startingBalance: '999' }
  }];

  const result = prepareSafeAppDataRepairs(source);
  assert.equal(result.data.scenarios[0].accounts[0].startingBalance, 10);
  assert.equal(
    result.data.migrationReport.scenarios[0].issues[0].recoveryRecord.startingBalance,
    '999'
  );
});

test('ambiguous migrated occurrences are relinked only to proven recurring dates', () => {
  const source = analyzeAppDataUpgrade(legacyApp(), { now: MIGRATED_AT }).data;
  source.scenarios[0].transactionOccurrences[0].sourceTransactionId = null;
  source.scenarios[0].transactionOccurrences[0].occurrenceKey = 'occurrence:100';
  source.migrationReport.scenarios[0].issues = [{
    severity: 'warning',
    code: 'ambiguous-recurring-occurrence',
    message: 'Preserved as a manual occurrence',
    action: 'converted-to-manual',
    recoveryRecord: {
      id: 100,
      sourceTransactionId: 10,
      occurrenceDate: '2026-01-15',
      amount: 100
    }
  }];
  source.migrationReport.summary.warningCount = 1;
  source.migrationReport.summary.recoveryRecordCount = 1;
  const original = JSON.stringify(source);

  const checked = analyzeAppDataUpgrade(source, { sourceKind: 'browser' });
  assert.equal(checked.isValid, true);
  assert.equal(checked.migrationResolutionProposal.available, true);
  assert.equal(checked.migrationResolutionProposal.resolvableCount, 1);

  const resolved = analyzeAppDataUpgrade(source, {
    sourceKind: 'browser',
    applyMigrationResolutions: true
  });
  assert.equal(resolved.migrationResolutionApplied, true);
  assert.equal(resolved.isValid, true);
  assert.equal(resolved.data.migrationReport, undefined);
  assert.equal(resolved.data.scenarios[0].transactionOccurrences.length, 1);
  assert.equal(resolved.data.scenarios[0].transactionOccurrences[0].sourceTransactionId, 10);
  assert.equal(
    resolved.data.scenarios[0].transactionOccurrences[0].occurrenceKey,
    'tx:10|date:2026-01-15|role:none'
  );
  assert.equal(JSON.stringify(source), original);
  assert.ok(resolved.report.resolvedMigrationReport);
  assert.equal(resolved.report.migrationResolutions.length, 1);
});

test('ambiguous occurrences remain unresolved when their dates do not match the rule', () => {
  const source = analyzeAppDataUpgrade(legacyApp(), { now: MIGRATED_AT }).data;
  const occurrence = source.scenarios[0].transactionOccurrences[0];
  occurrence.sourceTransactionId = null;
  occurrence.occurrenceKey = 'occurrence:100';
  occurrence.scheduledDate = '2026-01-16';
  source.migrationReport.scenarios[0].issues = [{
    severity: 'warning',
    code: 'ambiguous-recurring-occurrence',
    message: 'Preserved as a manual occurrence',
    action: 'converted-to-manual',
    sourceId: 100,
    recoveryRecord: { id: 100, sourceTransactionId: 10, occurrenceDate: '2026-01-16' }
  }];
  source.migrationReport.summary.warningCount = 1;
  source.migrationReport.summary.recoveryRecordCount = 1;

  const checked = analyzeAppDataUpgrade(source, { sourceKind: 'browser' });
  assert.equal(checked.migrationResolutionProposal.available, false);
  assert.equal(checked.migrationResolutionProposal.unresolvedCount, 1);
  assert.match(
    checked.migrationResolutionProposal.unresolved[0].reason,
    /not generated by the recurring rule/
  );
  assert.equal(checked.data.migrationReport.scenarios[0].issues.length, 1);
  assert.equal(checked.data.scenarios[0].transactionOccurrences[0].sourceTransactionId, null);
});

test('review decisions confirm manual, link recurring, and remove recovered transactions', () => {
  const source = analyzeAppDataUpgrade(legacyApp(), { now: MIGRATED_AT }).data;
  const scenario = source.scenarios[0];
  const template = scenario.transactionOccurrences[0];
  scenario.transactionOccurrences = [
    { ...template, id: 201, sourceTransactionId: null, occurrenceKey: 'occurrence:201', scheduledDate: '2026-01-15' },
    { ...template, id: 202, sourceTransactionId: null, occurrenceKey: 'occurrence:202', scheduledDate: '2026-02-15' },
    { ...template, id: 203, sourceTransactionId: null, occurrenceKey: 'occurrence:203', scheduledDate: '2026-03-15' }
  ];
  source.migrationReport = {
    fromSchemaVersion: 43,
    toSchemaVersion: 44,
    migratedAt: MIGRATED_AT,
    summary: { warningCount: 3, recoveryRecordCount: 3 },
    scenarios: [{
      scenarioId: scenario.id,
      scenarioIndex: 0,
      issues: scenario.transactionOccurrences.map((occurrence, index) => ({
        severity: 'warning',
        code: index === 1 ? 'orphan-source-transaction' : 'ambiguous-recurring-occurrence',
        message: 'Preserved as a manual occurrence.',
        action: 'converted-to-manual',
        sourceId: occurrence.id,
        recoveryRecord: { id: occurrence.id, sourceTransactionId: 10 }
      }))
    }]
  };
  const original = JSON.stringify(source);

  const reviewed = analyzeAppDataUpgrade(source, {
    sourceKind: 'browser',
    now: '2026-08-29T12:00:00.000Z',
    recoveryDecisions: [
      { key: '0:0', action: 'link', ruleId: 10, scheduledDate: '2026-01-15' },
      { key: '0:1', action: 'confirm-manual' },
      { key: '0:2', action: 'remove' }
    ]
  });

  assert.equal(reviewed.isValid, true, JSON.stringify(reviewed.validation));
  assert.equal(reviewed.recoveryDecisionsApplied, true);
  assert.equal(reviewed.warnings.length, 0);
  assert.equal(reviewed.data.migrationReport.summary.warningCount, 0);
  assert.equal(reviewed.data.migrationReport.summary.recoveryRecordCount, 0);
  assert.equal(reviewed.data.migrationReport.summary.resolvedRecoveryRecordCount, 3);
  assert.equal(reviewed.data.migrationReport.resolutionHistory.length, 3);
  assert.equal(reviewed.data.scenarios[0].transactionOccurrences.length, 2);
  const linked = reviewed.data.scenarios[0].transactionOccurrences.find((entry) => entry.id === 201);
  const manual = reviewed.data.scenarios[0].transactionOccurrences.find((entry) => entry.id === 202);
  assert.equal(linked.sourceTransactionId, 10);
  assert.equal(linked.occurrenceKey, 'tx:10|date:2026-01-15|role:none');
  assert.equal(manual.sourceTransactionId, null);
  assert.equal(manual.occurrenceKey, 'occurrence:202');
  assert.equal(reviewed.data.scenarios[0].transactionOccurrences.some((entry) => entry.id === 203), false);
  assert.equal(reviewed.report.recoveryDecisions.length, 3);
  assert.equal(JSON.stringify(source), original);
});
