/**
 * In-app data upgrade analysis.
 *
 * The service never writes data. It parses a selected source, upgrades it in
 * memory, validates the exact current-schema result, and returns both the
 * candidate data and a structured before/after report.
 */

import {
  CURRENT_SCHEMA_VERSION,
  sanitizeAppDataForWrite
} from '../../shared/app-data-utils.js';
import { migrateAppData } from '../../shared/migration-utils.js';
import { validateAppData } from './validation-service.js';
import { STORAGE_KEY } from './storage-service.js';
import { prepareSafeAppDataRepairs } from './data-repair-service.js?v=20260829-general-workflow-8';
import {
  listMigrationRecoveryReviewItems,
  prepareMigrationRecoveryDecisions,
  prepareMigrationRecoveryResolutions
} from './migration-recovery-service.js?v=20260829-general-workflow-8';

const MAX_UI_CHANGES = 250;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sourceVersionOf(data) {
  const numeric = Number(data?.schemaVersion);
  return Number.isFinite(numeric) ? numeric : null;
}

function summarizeValue(value) {
  if (Array.isArray(value)) return `[${value.length} item${value.length === 1 ? '' : 's'}]`;
  if (isObject(value)) {
    const keys = Object.keys(value);
    return `{${keys.length} field${keys.length === 1 ? '' : 's'}}`;
  }
  if (typeof value === 'string' && value.length > 160) {
    return `${value.slice(0, 157)}…`;
  }
  return value;
}

function changeCategory(path) {
  if (path === 'schemaVersion' || path === 'migrationReport') return 'Schema and root data';
  if (path.startsWith('uiState')) return 'Interface preferences';
  if (path.includes('.accounts')) return 'Accounts';
  if (path.includes('.transactionOccurrences')) return 'Occurrences and actuals';
  if (path.includes('.transactions')) return 'Recurring rules';
  if (path.includes('.baselinePeriods')) return 'Baselines';
  if (path.includes('.projection')) return 'Projections';
  if (path.includes('.planning')) return 'Planning and goals';
  if (path.startsWith('scenarios')) return 'Scenario configuration';
  return 'Schema and root data';
}

function changeReason(path, action) {
  if (path === 'schemaVersion') return 'Updated to the current FTrack schema version.';
  if (path === 'uiState.lastWorkflowId') return 'Routed the retired Budget workflow preference to General.';
  if (path.endsWith('.budgets')) return 'Legacy budgets were replaced by unified plan occurrences.';
  if (path.endsWith('.budgetWindow')) return 'Legacy budget dates were moved into current planning and projection configuration.';
  if (path.includes('.transactionOccurrences')) return 'Unified period occurrences store planned, actual, skipped, and baseline-linked activity.';
  if (path.match(/\.transactions\[\d+\]\.status$/)) return 'Rule status moved to resolved occurrences in the unified plan model.';
  if (path.endsWith('.projection.config.source')) return 'Projection source selection is no longer stored; projections use the unified plan.';
  if (path.endsWith('.projection.rows')) return 'Projection rows were cleared so they can be regenerated from the upgraded plan.';
  if (path.includes('viewPeriodTypeIds.budgets')) return 'The legacy Budget view preference was replaced by Plan & Actuals.';
  if (path.includes('viewPeriodTypeIds.planActuals')) return 'Added the Plan & Actuals period-view preference.';
  if (path.startsWith('migrationReport')) return 'Recorded the durable migration and recovery audit.';
  if (action === 'added') return 'Added a current-schema field or default.';
  if (action === 'removed') return 'Removed a field that is not valid in the current schema.';
  return 'Normalized the value to the current schema contract.';
}

function collectChanges(before, after) {
  const changes = [];

  function record(path, action, beforeValue, afterValue) {
    changes.push({
      category: changeCategory(path),
      path: path || '(root)',
      action,
      before: summarizeValue(beforeValue),
      after: summarizeValue(afterValue),
      reason: changeReason(path, action)
    });
  }

  function walk(left, right, path) {
    if (Object.is(left, right)) return;

    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) {
        record(`${path}.length`, 'changed', left.length, right.length);
      }
      const length = Math.max(left.length, right.length);
      for (let index = 0; index < length; index += 1) {
        const nextPath = `${path}[${index}]`;
        if (index >= left.length) {
          record(nextPath, 'added', undefined, right[index]);
        } else if (index >= right.length) {
          record(nextPath, 'removed', left[index], undefined);
        } else {
          walk(left[index], right[index], nextPath);
        }
      }
      return;
    }

    if (isObject(left) && isObject(right)) {
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      for (const key of [...keys].sort()) {
        const nextPath = path ? `${path}.${key}` : key;
        const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
        const hasRight = Object.prototype.hasOwnProperty.call(right, key);
        if (!hasLeft) {
          record(nextPath, 'added', undefined, right[key]);
        } else if (!hasRight) {
          record(nextPath, 'removed', left[key], undefined);
        } else {
          walk(left[key], right[key], nextPath);
        }
      }
      return;
    }

    record(path, 'changed', left, right);
  }

  walk(before, after, '');
  return changes;
}

function flattenMigrationWarnings(migrationReport) {
  const warnings = [];
  for (const scenario of migrationReport?.scenarios || []) {
    for (const entry of scenario?.issues || []) {
      warnings.push({
        scenarioId: scenario.scenarioId ?? null,
        scenarioIndex: scenario.scenarioIndex,
        severity: entry.severity || 'warning',
        code: entry.code || 'migration-warning',
        message: entry.message || 'Migration warning',
        action: entry.action || null,
        sourceCollection: entry.sourceCollection || null,
        sourceIndex: entry.sourceIndex ?? null,
        sourceId: entry.sourceId ?? null,
        hasRecoveryRecord: Boolean(entry.recoveryRecord)
      });
    }
  }
  return warnings;
}

function countChangeActions(changes) {
  return changes.reduce((summary, change) => {
    summary[change.action] = (summary[change.action] || 0) + 1;
    return summary;
  }, { added: 0, changed: 0, removed: 0 });
}

function invalidAnalysis({
  sourceLabel,
  sourceKind,
  fromSchemaVersion = null,
  message,
  path = '(source)'
}) {
  const validation = {
    isValid: false,
    totalIssues: 1,
    scenarioCount: 0,
    rootIssues: [{ path, message }],
    scenarios: []
  };
  return {
    isValid: false,
    canApply: false,
    migrated: false,
    changed: false,
    fromSchemaVersion,
    toSchemaVersion: CURRENT_SCHEMA_VERSION,
    sourceLabel,
    sourceKind,
    data: null,
    migrationReport: null,
    validation,
    changes: [],
    visibleChanges: [],
    warnings: [],
    report: {
      sourceLabel,
      sourceKind,
      fromSchemaVersion,
      toSchemaVersion: CURRENT_SCHEMA_VERSION,
      migrated: false,
      validationPassed: false,
      summary: {
        fieldsAdded: 0,
        fieldsChanged: 0,
        fieldsRemoved: 0,
        migrationWarnings: 0,
        recoveryRecords: 0,
        validationIssues: 1
      },
      changes: [],
      warnings: [],
      validation
    }
  };
}

/**
 * Analyze and prepare app data without writing it.
 *
 * @param {string|Object} source JSON text or parsed app data
 * @param {{sourceLabel?: string, sourceKind?: string, now?: string}} options
 */
export function analyzeAppDataUpgrade(source, {
  sourceLabel = 'Selected data',
  sourceKind = 'file',
  now,
  applySafeRepairs = false,
  applyMigrationResolutions = false,
  recoveryDecisions = []
} = {}) {
  let original;
  try {
    original = typeof source === 'string' ? JSON.parse(source) : cloneJson(source);
  } catch (error) {
    return invalidAnalysis({
      sourceLabel,
      sourceKind,
      message: `Invalid JSON: ${error.message}`
    });
  }

  const fromSchemaVersion = sourceVersionOf(original);
  if (!isObject(original)) {
    return invalidAnalysis({
      sourceLabel,
      sourceKind,
      fromSchemaVersion,
      message: 'The selected data must contain a JSON object.'
    });
  }
  if (!Array.isArray(original.scenarios)) {
    return invalidAnalysis({
      sourceLabel,
      sourceKind,
      fromSchemaVersion,
      path: 'scenarios',
      message: 'The selected data is missing the required scenarios array.'
    });
  }
  if (fromSchemaVersion !== null && fromSchemaVersion > CURRENT_SCHEMA_VERSION) {
    return invalidAnalysis({
      sourceLabel,
      sourceKind,
      fromSchemaVersion,
      path: 'schemaVersion',
      message: `Future schemaVersion ${fromSchemaVersion} cannot be downgraded to ${CURRENT_SCHEMA_VERSION}.`
    });
  }

  let candidate;
  try {
    candidate = original.schemaVersion === CURRENT_SCHEMA_VERSION
      ? sanitizeAppDataForWrite(original)
      : migrateAppData(original, now ? { now } : undefined);
    candidate = sanitizeAppDataForWrite(candidate);
    candidate = JSON.parse(JSON.stringify(candidate));
  } catch (error) {
    return invalidAnalysis({
      sourceLabel,
      sourceKind,
      fromSchemaVersion,
      message: `Upgrade failed: ${error.message}`
    });
  }

  const initialValidation = validateAppData(candidate);
  const safeRepair = prepareSafeAppDataRepairs(candidate);
  const proposedValidation = safeRepair.repairs.length
    ? validateAppData(safeRepair.data)
    : initialValidation;
  const repairProposal = {
    available: safeRepair.repairs.length > 0 && proposedValidation.totalIssues < initialValidation.totalIssues,
    repairCount: safeRepair.repairs.length,
    resolvesIssueCount: Math.max(0, initialValidation.totalIssues - proposedValidation.totalIssues),
    remainingIssueCount: proposedValidation.totalIssues,
    repairs: safeRepair.repairs
  };
  if (applySafeRepairs && repairProposal.available) {
    candidate = safeRepair.data;
  }

  const manualRecovery = recoveryDecisions.length
    ? prepareMigrationRecoveryDecisions(candidate, recoveryDecisions, { resolvedAt: now })
    : { data: candidate, resolutions: [] };
  candidate = manualRecovery.data;

  let validation = recoveryDecisions.length
    ? validateAppData(candidate)
    : (applySafeRepairs && repairProposal.available ? proposedValidation : initialValidation);
  const migrationRecovery = prepareMigrationRecoveryResolutions(candidate);
  const migrationResolutionProposal = {
    available: validation.isValid && migrationRecovery.resolutions.length > 0,
    resolvableCount: migrationRecovery.resolutions.length,
    unresolvedCount: migrationRecovery.unresolved.length,
    resolutions: migrationRecovery.resolutions,
    unresolved: migrationRecovery.unresolved
  };
  const migrationResolutionApplied = Boolean(
    applyMigrationResolutions && migrationResolutionProposal.available
  );
  if (migrationResolutionApplied) {
    candidate = migrationRecovery.data;
    validation = validateAppData(candidate);
  }
  const recoveryReviewItems = listMigrationRecoveryReviewItems(candidate);

  const changes = collectChanges(original, candidate);
  const actions = countChangeActions(changes);
  const warnings = flattenMigrationWarnings(candidate.migrationReport);
  const migrated = fromSchemaVersion !== CURRENT_SCHEMA_VERSION;
  const recoveryRecords = Number(candidate.migrationReport?.summary?.recoveryRecordCount || 0);
  const report = {
    sourceLabel,
    sourceKind,
    fromSchemaVersion,
    toSchemaVersion: CURRENT_SCHEMA_VERSION,
    migrated,
    repairApplied: Boolean(applySafeRepairs && repairProposal.available),
    repairProposal,
    migrationResolutionApplied,
    migrationResolutionProposal,
    recoveryDecisionsApplied: manualRecovery.resolutions.length > 0,
    validationPassed: validation.isValid,
    summary: {
      fieldsAdded: actions.added,
      fieldsChanged: actions.changed,
      fieldsRemoved: actions.removed,
      migrationWarnings: warnings.length,
      recoveryRecords,
      validationIssues: validation.totalIssues
    },
    migrationSummary: candidate.migrationReport?.summary || null,
    resolvedMigrationReport: migrationResolutionApplied
      ? migrationRecovery.originalMigrationReport
      : null,
    migrationResolutions: migrationResolutionApplied
      ? migrationRecovery.resolutions
      : [],
    recoveryDecisions: manualRecovery.resolutions,
    repairs: applySafeRepairs ? safeRepair.repairs : [],
    changes,
    warnings,
    validation
  };

  return {
    isValid: validation.isValid,
    canApply: validation.isValid,
    migrated,
    repairApplied: Boolean(applySafeRepairs && repairProposal.available),
    repairProposal,
    migrationResolutionApplied,
    migrationResolutionProposal,
    recoveryDecisionsApplied: manualRecovery.resolutions.length > 0,
    recoveryReviewItems,
    changed: changes.length > 0,
    fromSchemaVersion,
    toSchemaVersion: CURRENT_SCHEMA_VERSION,
    sourceLabel,
    sourceKind,
    data: candidate,
    migrationReport: candidate.migrationReport || null,
    validation,
    changes,
    visibleChanges: changes.slice(0, MAX_UI_CHANGES),
    warnings,
    report
  };
}

export function readRawBrowserData() {
  const rawText = globalThis.localStorage?.getItem(STORAGE_KEY);
  if (rawText === null || rawText === undefined) return null;
  return {
    sourceKind: 'browser',
    sourceLabel: 'Current browser data',
    rawText
  };
}

export function browserDataNeedsUpgradeReview() {
  const source = readRawBrowserData();
  if (!source) return false;
  try {
    const parsed = JSON.parse(source.rawText);
    return parsed?.schemaVersion !== CURRENT_SCHEMA_VERSION;
  } catch {
    return true;
  }
}

export { CURRENT_SCHEMA_VERSION, MAX_UI_CHANGES };
