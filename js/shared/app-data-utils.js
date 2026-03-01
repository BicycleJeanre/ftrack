// app-data-utils.js
// Shared helpers for persisting schemaVersion 43 app data.

import { DEFAULT_WORKFLOW_ID, getWorkflowById } from './workflow-registry.js';
import { formatDateOnly } from './date-utils.js';

export const CURRENT_SCHEMA_VERSION = 43;
export const DEFAULT_PERIOD_TYPE_ID = 3; // Month

export class SchemaVersionError extends Error {
  constructor({ expected, actual, message } = {}) {
    const expectedLabel = expected == null ? String(CURRENT_SCHEMA_VERSION) : String(expected);
    const actualLabel = actual == null ? 'missing' : String(actual);
    super(message || `Unsupported schemaVersion ${actualLabel}. Expected schemaVersion ${expectedLabel}.`);
    this.name = 'SchemaVersionError';
    this.expected = expected ?? CURRENT_SCHEMA_VERSION;
    this.actual = actual ?? null;
  }
}

export function assertSchemaVersion43(rawAppData) {
  const actual = rawAppData && typeof rawAppData === 'object' ? rawAppData.schemaVersion : null;
  if (actual !== CURRENT_SCHEMA_VERSION) {
    throw new SchemaVersionError({
      expected: CURRENT_SCHEMA_VERSION,
      actual,
      message:
        `Unsupported schemaVersion ${actual == null ? 'missing' : actual}. ` +
        `This build requires schemaVersion ${CURRENT_SCHEMA_VERSION}. ` +
        'Run the standalone migration tool (QC-only) to convert legacy data to schemaVersion 43.'
    });
  }
}

export function mapPeriodTypeNameToId(name) {
  if (!name) return null;
  const normalized = String(name).trim().toLowerCase();
  if (normalized === 'day' || normalized === 'daily') return 1;
  if (normalized === 'week' || normalized === 'weekly') return 2;
  if (normalized === 'month' || normalized === 'monthly') return 3;
  if (normalized === 'quarter' || normalized === 'quarterly') return 4;
  if (normalized === 'year' || normalized === 'yearly') return 5;
  return null;
}

export function getScenarioLineageRootId(scenario) {
  const ancestors = scenario?.lineage?.ancestorScenarioIds;
  const firstAncestor = Array.isArray(ancestors) && ancestors.length ? Number(ancestors[0]) : null;
  if (Number.isFinite(firstAncestor) && firstAncestor > 0) return firstAncestor;

  const id = Number(scenario?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function getNextScenarioVersion({ sourceScenario, scenarios }) {
  const list = Array.isArray(scenarios) ? scenarios : [];
  const rootId = getScenarioLineageRootId(sourceScenario);

  const fallback = Number(sourceScenario?.version) || 1;
  if (!rootId) return fallback + 1;

  const maxVersion = list.reduce((max, scenario) => {
    if (!scenario) return max;
    const scenarioRoot = getScenarioLineageRootId(scenario);
    if (scenarioRoot !== rootId) return max;
    const version = Number(scenario.version) || 1;
    return version > max ? version : max;
  }, fallback);

  return maxVersion + 1;
}

export function getDefaultProjectionWindowDates(now = new Date()) {
  const year = now.getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  return {
    startDate: formatDateOnly(start),
    endDate: formatDateOnly(end)
  };
}

/**
 * Return the next available integer ID for a collection of objects with an `id` field.
 * Guarantees a monotonically increasing, gap-free ID without spreads on large arrays.
 * @param {Array<{id?: number}>} collection
 * @returns {number}
 */
export function allocateNextId(collection) {
  if (!Array.isArray(collection) || collection.length === 0) return 1;
  const max = collection.reduce((m, item) => {
    const id = Number(item.id);
    return Number.isFinite(id) && id > m ? id : m;
  }, 0);
  return max + 1;
}

export function createDefaultUiState(overrides = {}) {
  const safeWorkflowId = getWorkflowById(overrides.lastWorkflowId)?.id || DEFAULT_WORKFLOW_ID;

  return {
    lastWorkflowId: safeWorkflowId,
    lastScenarioId: null,
    lastScenarioVersion: null,
    viewPeriodTypeIds: {
      transactions: DEFAULT_PERIOD_TYPE_ID,
      budgets: DEFAULT_PERIOD_TYPE_ID,
      projections: DEFAULT_PERIOD_TYPE_ID,
      ...(overrides.viewPeriodTypeIds || {})
    },
    accordionStates: overrides.accordionStates && typeof overrides.accordionStates === 'object' ? overrides.accordionStates : {},
    ...overrides,
    lastWorkflowId: safeWorkflowId
  };
}

export function normalizeUiState(raw) {
  const base = raw && typeof raw === 'object' ? raw : {};
  const workflowId = getWorkflowById(base.lastWorkflowId)?.id || DEFAULT_WORKFLOW_ID;

  const view = base.viewPeriodTypeIds && typeof base.viewPeriodTypeIds === 'object' ? base.viewPeriodTypeIds : {};
  const cleanPeriod = (value) => {
    if (value === null) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const rawAccordion = base.accordionStates && typeof base.accordionStates === 'object' ? base.accordionStates : {};
  const accordionStates = Object.fromEntries(
    Object.entries(rawAccordion).filter(([, v]) => typeof v === 'boolean')
  );

  return {
    lastWorkflowId: workflowId,
    lastScenarioId: base.lastScenarioId == null ? null : Number(base.lastScenarioId),
    lastScenarioVersion: base.lastScenarioVersion == null ? null : Number(base.lastScenarioVersion),
    viewPeriodTypeIds: {
      transactions: cleanPeriod(view.transactions) ?? DEFAULT_PERIOD_TYPE_ID,
      budgets: cleanPeriod(view.budgets) ?? DEFAULT_PERIOD_TYPE_ID,
      projections: cleanPeriod(view.projections) ?? DEFAULT_PERIOD_TYPE_ID
    },
    accordionStates
  };
}

export function createDefaultAppData(overrides = {}) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    scenarios: [],
    uiState: createDefaultUiState(),
    ...overrides
  };
}

function normalizeProjectionConfig(rawConfig) {
  const defaults = getDefaultProjectionWindowDates();
  const base = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};

  const periodTypeIdRaw = base.periodTypeId ?? base.projectionPeriod ?? null;
  const periodTypeId =
    typeof periodTypeIdRaw === 'number'
      ? periodTypeIdRaw
      : (typeof periodTypeIdRaw === 'object' ? Number(periodTypeIdRaw?.id) : mapPeriodTypeNameToId(periodTypeIdRaw)) ||
        DEFAULT_PERIOD_TYPE_ID;

  const source = base.source === 'budget' ? 'budget' : 'transactions';

  return {
    startDate: typeof base.startDate === 'string' && base.startDate ? base.startDate : defaults.startDate,
    endDate: typeof base.endDate === 'string' && base.endDate ? base.endDate : defaults.endDate,
    periodTypeId: Number.isFinite(Number(periodTypeId)) ? Number(periodTypeId) : DEFAULT_PERIOD_TYPE_ID,
    source
  };
}

function normalizeBudgetWindowConfig(rawConfig) {
  const base = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};

  return {
    startDate: typeof base.startDate === 'string' && base.startDate ? base.startDate : null,
    endDate: typeof base.endDate === 'string' && base.endDate ? base.endDate : null
  };
}

export function normalizeScenario(rawScenario) {
  const base = rawScenario && typeof rawScenario === 'object' ? rawScenario : {};

  const id = Number(base.id) || 0;
  const version = Number(base.version) || 1;

  const name = typeof base.name === 'string' && base.name ? base.name : 'Unnamed Scenario';
  const description =
    base.description === null || typeof base.description === 'string' ? base.description : String(base.description || '');

  const accounts = Array.isArray(base.accounts) ? base.accounts : [];
  const transactions = Array.isArray(base.transactions) ? base.transactions : [];
  const budgets = Array.isArray(base.budgets) ? base.budgets : [];

  const projectionConfig = normalizeProjectionConfig(base.projection?.config);
  const rows = Array.isArray(base.projection?.rows) ? base.projection.rows : [];

  const projection =
    projectionConfig && projectionConfig.startDate && projectionConfig.endDate
      ? {
          config: projectionConfig,
          ...(rows.length ? { rows } : {}),
          generatedAt: base.projection?.generatedAt ?? null
        }
      : null;

  const budgetWindowConfig = normalizeBudgetWindowConfig(base.budgetWindow?.config);
  const budgetWindow =
    budgetWindowConfig && (budgetWindowConfig.startDate || budgetWindowConfig.endDate)
      ? { config: budgetWindowConfig }
      : null;

  const planning = base.planning && typeof base.planning === 'object' ? base.planning : {};
  const cleanWindow = (rawWindow, fallback) => {
    const w = rawWindow && typeof rawWindow === 'object' ? rawWindow : {};
    return {
      startDate: typeof w.startDate === 'string' ? w.startDate : fallback.startDate,
      endDate: typeof w.endDate === 'string' ? w.endDate : fallback.endDate
    };
  };
  const defaultWindow = projectionConfig || getDefaultProjectionWindowDates();

  // Planning windows: defaults to projection window, but can be overridden per goal solver
  // These do NOT affect projection generation; projections always use scenario.projection.config
  // Planning windows are only used by Generate Plan and Advanced Goal Solver for their respective horizons
  const nextPlanning = {
    generatePlan: cleanWindow(planning.generatePlan, defaultWindow),
    advancedGoalSolver: cleanWindow(planning.advancedGoalSolver, defaultWindow),
    ...(planning.goalWorkshopMode === 'simple' || planning.goalWorkshopMode === 'advanced'
      ? { goalWorkshopMode: planning.goalWorkshopMode }
      : {})
  };

  const lineage = base.lineage && typeof base.lineage === 'object' ? base.lineage : null;

  return {
    ...base,
    id,
    version,
    name,
    description,
    lineage,
    accounts,
    transactions,
    budgets,
    budgetWindow,
    projection,
    planning: nextPlanning
  };
}

export function getScenarioProjectionRows(scenario) {
  return scenario?.projection?.rows || [];
}

export function getScenarioBudgetWindowConfig(scenario) {
  return scenario?.budgetWindow?.config || null;
}

export function setScenarioBudgetWindowConfig(scenario, config) {
  if (!scenario) return;
  if (!scenario.budgetWindow) {
    scenario.budgetWindow = {};
  }
  scenario.budgetWindow.config = config;
}

export function sanitizeScenarioForWrite(rawScenario) {
  const scenario = normalizeScenario(rawScenario);

  // Validate: if budgets exist, budgetWindow.config must be present with startDate and endDate
  if (scenario.budgets && scenario.budgets.length > 0) {
    const budgetConfig = scenario.budgetWindow?.config;
    if (!budgetConfig || !budgetConfig.startDate || !budgetConfig.endDate) {
      throw new Error(
        `Scenario "${scenario.name}" has budgets but is missing required budgetWindow configuration. ` +
        `budgetWindow.config must have both startDate and endDate.`
      );
    }
  }

  const next = {
    id: scenario.id,
    version: scenario.version,
    name: scenario.name,
    description: scenario.description ?? null,
    ...(scenario.lineage !== undefined ? { lineage: scenario.lineage } : {}),
    accounts: scenario.accounts || [],
    ...(scenario.transactions ? { transactions: scenario.transactions } : {}),
    ...(scenario.budgets ? { budgets: scenario.budgets } : {}),
    ...(scenario.budgetWindow !== undefined ? { budgetWindow: scenario.budgetWindow } : {}),
    ...(scenario.projection !== undefined ? { projection: scenario.projection } : {}),
    ...(scenario.planning ? { planning: scenario.planning } : {})
  };

  if (scenario.advancedGoalSettings !== undefined) next.advancedGoalSettings = scenario.advancedGoalSettings;
  if (scenario.fundSettings !== undefined) next.fundSettings = scenario.fundSettings;

  return next;
}

export function sanitizeAppDataForWrite(rawAppData) {
  const normalized = normalizeAppData(rawAppData);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    scenarios: (normalized.scenarios || []).map(sanitizeScenarioForWrite),
    uiState: normalizeUiState(normalized.uiState)
  };
}

export function normalizeAppData(raw) {
  const base = raw && typeof raw === 'object' ? raw : {};
  const scenarios = Array.isArray(base.scenarios) ? base.scenarios : [];
  const uiState = normalizeUiState(base.uiState);

  return {
    schemaVersion: typeof base.schemaVersion === 'number' ? base.schemaVersion : CURRENT_SCHEMA_VERSION,
    scenarios: scenarios.map(normalizeScenario),
    uiState
  };
}
