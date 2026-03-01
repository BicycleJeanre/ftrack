// migration-utils.js
// Browser-safe migration helpers for upgrading legacy app data to the current schema version.
// Used at runtime by storage-service (on startup) and data-service (on import).

import {
  CURRENT_SCHEMA_VERSION,
  createDefaultUiState,
  getDefaultProjectionWindowDates,
  mapPeriodTypeNameToId,
  sanitizeScenarioForWrite
} from './app-data-utils.js';
import {
  DEFAULT_WORKFLOW_ID,
  getWorkflowById,
  getWorkflowIdFromLegacyScenarioTypeId
} from './workflow-registry.js';

function safeNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function coercePeriodTypeId(value) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const id = safeNumber(value.id, null);
    return id != null ? id : null;
  }
  if (typeof value === 'string') {
    const mapped = mapPeriodTypeNameToId(value);
    return mapped != null ? mapped : null;
  }
  return null;
}

function migrateScenario(legacyScenario) {
  const s = legacyScenario && typeof legacyScenario === 'object' ? legacyScenario : {};

  const defaults = getDefaultProjectionWindowDates();

  const startDate =
    (s?.projection?.config && typeof s.projection.config === 'object' ? s.projection.config.startDate : null) ||
    s.startDate ||
    defaults.startDate;
  const endDate =
    (s?.projection?.config && typeof s.projection.config === 'object' ? s.projection.config.endDate : null) ||
    s.endDate ||
    defaults.endDate;

  const periodTypeIdRaw =
    (s?.projection?.config && typeof s.projection.config === 'object' ? s.projection.config.periodTypeId : null) ??
    s.projectionPeriod ??
    null;
  const periodTypeId = coercePeriodTypeId(periodTypeIdRaw) || 3;

  const sourceRaw =
    (s?.projection?.config && typeof s.projection.config === 'object' ? s.projection.config.source : null) || null;
  const source = sourceRaw === 'budget' ? 'budget' : 'transactions';

  const rows = Array.isArray(s?.projection?.rows)
    ? s.projection.rows
    : (Array.isArray(s?.projections) ? s.projections : []);

  const migrated = {
    id: safeNumber(s.id, 0) || 0,
    version: safeNumber(s.version, 1) || 1,
    name: typeof s.name === 'string' && s.name ? s.name : 'Unnamed Scenario',
    description: s.description === null || typeof s.description === 'string' ? s.description : null,
    lineage: s.lineage && typeof s.lineage === 'object' ? s.lineage : null,
    accounts: Array.isArray(s.accounts) ? s.accounts : [],
    transactions: Array.isArray(s.transactions) ? s.transactions : [],
    budgets: Array.isArray(s.budgets) ? s.budgets : [],
    projection: {
      config: {
        startDate: String(startDate),
        endDate: String(endDate),
        periodTypeId,
        source
      },
      ...(rows.length ? { rows } : {}),
      generatedAt: s?.projection?.generatedAt ?? null
    },
    planning: {
      generatePlan: { startDate: String(startDate), endDate: String(endDate) },
      advancedGoalSolver: { startDate: String(startDate), endDate: String(endDate) }
    }
  };

  // Carry forward budgetWindow or derive from projection dates when budgets are present.
  const existingBudgetWindowConfig =
    s?.budgetWindow?.config && typeof s.budgetWindow.config === 'object'
      ? s.budgetWindow.config
      : null;

  if (existingBudgetWindowConfig || migrated.budgets.length > 0) {
    migrated.budgetWindow = {
      config: {
        startDate: existingBudgetWindowConfig?.startDate || startDate,
        endDate: existingBudgetWindowConfig?.endDate || endDate,
        periodTypeId: existingBudgetWindowConfig?.periodTypeId ?? periodTypeId
      }
    };
  }

  if (s.advancedGoalSettings !== undefined) migrated.advancedGoalSettings = s.advancedGoalSettings;
  if (s.fundSettings !== undefined) migrated.fundSettings = s.fundSettings;

  return sanitizeScenarioForWrite(migrated);
}

function inferLastWorkflowId(legacy, scenarios) {
  const uiState = legacy?.uiState && typeof legacy.uiState === 'object' ? legacy.uiState : {};
  const fromUi = uiState.lastWorkflowId;
  const validFromUi = getWorkflowById(fromUi)?.id || null;
  if (validFromUi) return validFromUi;

  const lastScenarioId = safeNumber(uiState.lastScenarioId, null);
  const lastScenario = lastScenarioId != null ? scenarios.find((s) => safeNumber(s?.id, null) === lastScenarioId) : null;
  const legacyType = lastScenario?.type ?? legacy?.scenarioType ?? null;
  const fromType = getWorkflowIdFromLegacyScenarioTypeId(legacyType);
  if (fromType) return fromType;

  const firstScenario = scenarios[0] || null;
  const fromFirst = getWorkflowIdFromLegacyScenarioTypeId(firstScenario?.type ?? null);
  return fromFirst || DEFAULT_WORKFLOW_ID;
}

/**
 * Migrate legacy app data to the current schema version.
 * Safe to call in the browser — no Node.js APIs used.
 * @param {Object} legacy - Parsed JSON from localStorage or an imported file
 * @returns {Object} - Valid schemaVersion 43 app data
 */
export function migrateAppData(legacy) {
  const legacyScenarios = Array.isArray(legacy?.scenarios) ? legacy.scenarios : [];
  const scenarios = legacyScenarios.map((s) => migrateScenario(s));

  const lastWorkflowId = inferLastWorkflowId(legacy, legacyScenarios);

  const legacyUiState = legacy?.uiState && typeof legacy.uiState === 'object' ? legacy.uiState : {};
  const lastScenarioId = safeNumber(legacyUiState.lastScenarioId, null);
  const lastScenarioVersion = safeNumber(legacyUiState.lastScenarioVersion, null);

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    scenarios,
    uiState: createDefaultUiState({
      lastWorkflowId,
      lastScenarioId: lastScenarioId != null ? lastScenarioId : null,
      lastScenarioVersion: lastScenarioVersion != null ? lastScenarioVersion : null,
      viewPeriodTypeIds: legacyUiState.viewPeriodTypeIds || undefined
    })
  };
}
