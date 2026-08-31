// app-data-utils.js
// Shared helpers for persisting schemaVersion 44 app data.

import { DEFAULT_WORKFLOW_ID, getWorkflowById } from './workflow-registry.js';
import { formatDateOnly, parseDateOnly } from './date-utils.js';

export const CURRENT_SCHEMA_VERSION = 44;
export const DEFAULT_PERIOD_TYPE_ID = 3; // Month
const VALID_OCCURRENCE_STATUSES = new Set(['planned', 'actual', 'skipped']);
const VALID_OCCURRENCE_ORIGINS = new Set(['generated', 'manual', 'migrated']);

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

export function assertCurrentSchemaVersion(rawAppData) {
  const actual = rawAppData && typeof rawAppData === 'object' ? rawAppData.schemaVersion : null;
  if (actual !== CURRENT_SCHEMA_VERSION) {
    throw new SchemaVersionError({
      expected: CURRENT_SCHEMA_VERSION,
      actual,
      message:
        `Unsupported schemaVersion ${actual == null ? 'missing' : actual}. ` +
        `This build requires schemaVersion ${CURRENT_SCHEMA_VERSION}.`
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
      planActuals: DEFAULT_PERIOD_TYPE_ID,
      projections: DEFAULT_PERIOD_TYPE_ID,
      ...(overrides.viewPeriodTypeIds || {})
    },
    planActualsWorkspaceByScenario:
      overrides.planActualsWorkspaceByScenario &&
      typeof overrides.planActualsWorkspaceByScenario === 'object'
        ? overrides.planActualsWorkspaceByScenario
        : {},
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

  const rawWorkspaces = base.planActualsWorkspaceByScenario &&
    typeof base.planActualsWorkspaceByScenario === 'object'
      ? base.planActualsWorkspaceByScenario
      : {};
  const periodViews = new Set(['period', 'recurring']);
  const periodGroups = new Set(['', 'status', 'movement', 'repeat']);
  const periodStatuses = new Set(['', 'planned', 'actual']);
  const recurringGroups = new Set([
    '',
    'transactionTypeName',
    'primaryAccountName',
    'secondaryAccountName',
    'transactionGroupId',
    'transactionGroupRole',
    'transactionGroupAccountGroupLabel'
  ]);
  const cleanOptionalString = (value) => {
    if (value === null || value === undefined || value === '') return null;
    return String(value).slice(0, 200);
  };
  const cleanOptionalId = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  };
  const planActualsWorkspaceByScenario = Object.fromEntries(
    Object.entries(rawWorkspaces)
      .filter(([scenarioId, workspace]) => (
        Number.isFinite(Number(scenarioId)) && Number(scenarioId) > 0 &&
        workspace && typeof workspace === 'object'
      ))
      .map(([scenarioId, workspace]) => {
        const periodTypeId = Number(workspace.periodTypeId);
        const periodGroup = String(workspace.groupBy || '');
        const periodStatus = String(workspace.statusFilter || '');
        const recurringGroup = String(workspace.recurringGroupBy || '');
        const rawViews = workspace.viewByContext && typeof workspace.viewByContext === 'object'
          ? workspace.viewByContext
          : {};
        const viewByContext = Object.fromEntries(
          Object.entries(rawViews)
            .filter(([contextKey, view]) => (
              contextKey && contextKey.length <= 100 && periodViews.has(String(view))
            ))
            .map(([contextKey, view]) => [contextKey, String(view)])
        );
        if (!viewByContext.general && periodViews.has(String(workspace.view || ''))) {
          viewByContext.general = String(workspace.view);
        }
        return [String(Number(scenarioId)), {
          viewByContext,
          periodTypeId:
            Number.isInteger(periodTypeId) && periodTypeId >= 1 && periodTypeId <= 5
              ? periodTypeId
              : DEFAULT_PERIOD_TYPE_ID,
          periodId: cleanOptionalString(workspace.periodId),
          accountId: cleanOptionalId(workspace.accountId),
          statusFilter: periodStatuses.has(periodStatus) ? periodStatus : '',
          groupBy: periodGroups.has(periodGroup) ? periodGroup : '',
          recurringAccountId: cleanOptionalId(workspace.recurringAccountId),
          recurringGroupBy: recurringGroups.has(recurringGroup) ? recurringGroup : '',
          recurringSplitGroupId: cleanOptionalString(workspace.recurringSplitGroupId),
          recurringSplitRole: cleanOptionalString(workspace.recurringSplitRole),
          recurringSplitAccountGroupId: cleanOptionalId(
            workspace.recurringSplitAccountGroupId
          )
        }];
      })
  );

  return {
    lastWorkflowId: workflowId,
    lastScenarioId: base.lastScenarioId == null ? null : Number(base.lastScenarioId),
    lastScenarioVersion: base.lastScenarioVersion == null ? null : Number(base.lastScenarioVersion),
    viewPeriodTypeIds: {
      transactions: cleanPeriod(view.transactions) ?? DEFAULT_PERIOD_TYPE_ID,
      planActuals:
        cleanPeriod(view.planActuals) ??
        cleanPeriod(view.budgets) ??
        DEFAULT_PERIOD_TYPE_ID,
      projections: cleanPeriod(view.projections) ?? DEFAULT_PERIOD_TYPE_ID
    },
    planActualsWorkspaceByScenario,
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

export function normalizeDateOnlyString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const parsed = parseDateOnly(value);
  if (!(parsed instanceof Date) || Number.isNaN(parsed.valueOf())) return null;

  const normalized = [
    String(parsed.getFullYear()).padStart(4, '0'),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0')
  ].join('-');

  return normalized === value ? value : null;
}

export function normalizeProjectionConfig(rawConfig) {
  const defaults = getDefaultProjectionWindowDates();
  const base = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};

  const periodTypeIdRaw = base.periodTypeId ?? base.projectionPeriod ?? null;
  const periodTypeId =
    typeof periodTypeIdRaw === 'number'
      ? periodTypeIdRaw
      : (typeof periodTypeIdRaw === 'object' ? Number(periodTypeIdRaw?.id) : mapPeriodTypeNameToId(periodTypeIdRaw)) ||
        DEFAULT_PERIOD_TYPE_ID;

  let startDate = normalizeDateOnlyString(base.startDate) || defaults.startDate;
  let endDate = normalizeDateOnlyString(base.endDate) || defaults.endDate;

  if (startDate > endDate) {
    startDate = defaults.startDate;
    endDate = defaults.endDate;
  }

  const asOfDate = normalizeDateOnlyString(base.asOfDate);
  const openCommitmentStartDate = normalizeDateOnlyString(base.openCommitmentStartDate);

  return {
    startDate,
    endDate,
    periodTypeId: Number.isFinite(Number(periodTypeId)) ? Number(periodTypeId) : DEFAULT_PERIOD_TYPE_ID,
    ...(asOfDate ? { asOfDate } : {}),
    ...(openCommitmentStartDate && openCommitmentStartDate <= startDate
      ? { openCommitmentStartDate }
      : {})
  };
}

function optionalId(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.abs(number) : null;
}

function optionalText(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

export function normalizeTransactionRule(rawTransaction) {
  const transaction = rawTransaction && typeof rawTransaction === 'object' ? rawTransaction : {};
  const transactionTypeId = Number(transaction.transactionTypeId) === 1 ? 1 : 2;

  return {
    id: Number(transaction.id) || 0,
    seriesRootId: optionalId(transaction.seriesRootId),
    supersedesTransactionId: optionalId(transaction.supersedesTransactionId),
    promotedFromOccurrenceKey: optionalText(transaction.promotedFromOccurrenceKey),
    primaryAccountId: optionalId(transaction.primaryAccountId),
    secondaryAccountId: optionalId(transaction.secondaryAccountId),
    transactionTypeId,
    amount: Math.abs(Number(transaction.amount) || 0),
    description: String(transaction.description || ''),
    recurrence: transaction.recurrence && typeof transaction.recurrence === 'object'
      ? transaction.recurrence
      : null,
    periodicChange: transaction.periodicChange && typeof transaction.periodicChange === 'object'
      ? transaction.periodicChange
      : null,
    effectiveDate: normalizeDateOnlyString(transaction.effectiveDate),
    activeFrom: normalizeDateOnlyString(transaction.activeFrom),
    activeTo: normalizeDateOnlyString(transaction.activeTo),
    transactionGroupId: transaction.transactionGroupId ?? null,
    transactionGroupRole: optionalText(transaction.transactionGroupRole),
    transactionGroupAccountGroupId: optionalId(transaction.transactionGroupAccountGroupId),
    capitalAmount: optionalAmount(transaction.capitalAmount),
    interestAmount: optionalAmount(transaction.interestAmount),
    tags: Array.isArray(transaction.tags) ? [...transaction.tags] : [],
    createdAt: optionalText(transaction.createdAt),
    updatedAt: optionalText(transaction.updatedAt)
  };
}

export function normalizeTransactionOccurrence(rawOccurrence) {
  const occurrence = rawOccurrence && typeof rawOccurrence === 'object' ? rawOccurrence : {};
  const rawStatus = String(occurrence.status || '').trim().toLowerCase();
  const rawOrigin = String(occurrence.origin || '').trim().toLowerCase();

  return {
    id: Number(occurrence.id) || 0,
    sourceTransactionId: optionalId(occurrence.sourceTransactionId),
    occurrenceKey: String(occurrence.occurrenceKey || '').trim(),
    scheduledDate: normalizeDateOnlyString(occurrence.scheduledDate),
    plannedDate: normalizeDateOnlyString(occurrence.plannedDate),
    actualDate: normalizeDateOnlyString(occurrence.actualDate),
    baselineAmount: optionalAmount(occurrence.baselineAmount),
    baselinePrimaryAccountId: optionalId(occurrence.baselinePrimaryAccountId),
    baselineSecondaryAccountId: optionalId(occurrence.baselineSecondaryAccountId),
    baselineTransactionTypeId:
      Number(occurrence.baselineTransactionTypeId) === 1
        ? 1
        : (Number(occurrence.baselineTransactionTypeId) === 2 ? 2 : null),
    baselineSnapshotVersion:
      Number(occurrence.baselineSnapshotVersion) === 1 ? 1 : null,
    plannedAmount: optionalAmount(occurrence.plannedAmount),
    actualAmount: optionalAmount(occurrence.actualAmount),
    status: VALID_OCCURRENCE_STATUSES.has(rawStatus) ? rawStatus : 'planned',
    origin: VALID_OCCURRENCE_ORIGINS.has(rawOrigin) ? rawOrigin : 'manual',
    actualSnapshotVersion:
      Number(occurrence.actualSnapshotVersion) === 1 ? 1 : null,
    isOverride:
      typeof occurrence.isOverride === 'boolean'
        ? occurrence.isOverride
        : null,
    primaryAccountId: optionalId(occurrence.primaryAccountId),
    secondaryAccountId: optionalId(occurrence.secondaryAccountId),
    transactionTypeId:
      Number(occurrence.transactionTypeId) === 1
        ? 1
        : (Number(occurrence.transactionTypeId) === 2 ? 2 : null),
    description: optionalText(occurrence.description),
    tags: Array.isArray(occurrence.tags) ? [...occurrence.tags] : null,
    transactionGroupId: occurrence.transactionGroupId ?? null,
    transactionGroupRole: optionalText(occurrence.transactionGroupRole),
    transactionGroupAccountGroupId: optionalId(occurrence.transactionGroupAccountGroupId),
    capitalAmount: optionalAmount(occurrence.capitalAmount),
    interestAmount: optionalAmount(occurrence.interestAmount),
    recurrence:
      occurrence.recurrence && typeof occurrence.recurrence === 'object'
        ? occurrence.recurrence
        : null,
    recurrenceDescription: optionalText(occurrence.recurrenceDescription),
    periodicChange:
      occurrence.periodicChange && typeof occurrence.periodicChange === 'object'
        ? occurrence.periodicChange
        : null,
    createdAt: optionalText(occurrence.createdAt),
    updatedAt: optionalText(occurrence.updatedAt)
  };
}

function materializeOccurrenceSnapshots(occurrence, transactions) {
  const source = occurrence?.sourceTransactionId == null
    ? null
    : transactions.find(
      (transaction) =>
        Number(transaction?.id) === Number(occurrence.sourceTransactionId)
    ) || null;
  let next = { ...occurrence };

  if (next.status === 'actual' && next.actualSnapshotVersion !== 1) {
    const fallback = (field, emptyValue = null) => (
      next[field] !== null && next[field] !== undefined
        ? next[field]
        : (source?.[field] !== null && source?.[field] !== undefined
          ? source[field]
          : emptyValue)
    );
    next = {
      ...next,
      primaryAccountId: fallback('primaryAccountId'),
      secondaryAccountId: fallback('secondaryAccountId'),
      transactionTypeId: fallback('transactionTypeId'),
      description: fallback('description', ''),
      tags: Array.isArray(next.tags)
        ? [...next.tags]
        : (Array.isArray(source?.tags) ? [...source.tags] : []),
      transactionGroupId: fallback('transactionGroupId'),
      transactionGroupRole: fallback('transactionGroupRole'),
      transactionGroupAccountGroupId: fallback('transactionGroupAccountGroupId'),
      capitalAmount: fallback('capitalAmount'),
      interestAmount: fallback('interestAmount'),
      recurrence:
        next.recurrence !== null && next.recurrence !== undefined
          ? next.recurrence
          : (source?.recurrence ?? null),
      recurrenceDescription: fallback('recurrenceDescription', ''),
      periodicChange:
        next.periodicChange !== null && next.periodicChange !== undefined
          ? next.periodicChange
          : (source?.periodicChange ?? null),
      actualSnapshotVersion: 1
    };
  }

  if (
    next.baselineAmount !== null &&
    next.baselineAmount !== undefined &&
    next.baselineSnapshotVersion !== 1
  ) {
    next = {
      ...next,
      baselinePrimaryAccountId:
        next.baselinePrimaryAccountId ?? next.primaryAccountId ?? source?.primaryAccountId ?? null,
      baselineSecondaryAccountId:
        next.baselineSecondaryAccountId ?? next.secondaryAccountId ?? source?.secondaryAccountId ?? null,
      baselineTransactionTypeId:
        next.baselineTransactionTypeId ?? next.transactionTypeId ?? source?.transactionTypeId ?? null,
      baselineSnapshotVersion: 1
    };
  }

  return next;
}

export function normalizeBaselinePeriod(rawPeriod) {
  const period = rawPeriod && typeof rawPeriod === 'object' ? rawPeriod : {};
  const periodTypeId = Number(period.periodTypeId);
  const startDate = normalizeDateOnlyString(period.startDate);
  const endDate = normalizeDateOnlyString(period.endDate);

  return {
    periodTypeId:
      Number.isFinite(periodTypeId) && periodTypeId >= 1 && periodTypeId <= 5
        ? periodTypeId
        : DEFAULT_PERIOD_TYPE_ID,
    startDate,
    endDate,
    frozenAt: optionalText(period.frozenAt)
  };
}

function deriveSplitTransactionSets(transactions = []) {
  const grouped = new Map();
  (Array.isArray(transactions) ? transactions : []).forEach((txn) => {
    const groupId = String(txn?.transactionGroupId || '').trim();
    if (!groupId) return;
    if (!grouped.has(groupId)) grouped.set(groupId, []);
    grouped.get(groupId).push(txn);
  });

  return Array.from(grouped.entries()).map(([groupId, groupTransactions]) => {
    const first = groupTransactions[0] || {};
    const components = groupTransactions
      .map((txn, index) => {
        const role = String(txn?.transactionGroupRole || '').trim().toLowerCase() || `adhoc_${index + 1}`;
        const accountId = Number(txn?.secondaryAccountId || 0) || null;
        const value = Math.abs(Number(txn?.amount || 0));
        if (!accountId || value <= 0) return null;
        const amountMode = role === 'principal' ? 'remainder' : (role === 'interest' ? 'derived' : 'fixed');
        return {
          role,
          accountId,
          transactionTypeId: Number(txn?.transactionTypeId || 2) === 1 ? 1 : 2,
          accountGroupId: Number(txn?.transactionGroupAccountGroupId || 0) || null,
          description: String(txn?.description || '').trim(),
          recurrence: txn?.recurrence || null,
          periodicChange: txn?.periodicChange || null,
          amountMode,
          value,
          order: index
        };
      })
      .filter(Boolean);

    const totalAmount = components.reduce((sum, component) => sum + Number(component?.value || 0), 0);
    const principalComponent = components.find((component) => component.role === 'principal') || null;

    return {
      id: groupId,
      description: String(first?.description || '').trim(),
      payingAccountId: Number(first?.primaryAccountId || 0) || null,
      effectiveDate: first?.effectiveDate || null,
      strategy: 'manual',
      targetAccountId: Number(principalComponent?.accountId || 0) || null,
      interestSource: 'none',
      customRate: null,
      totalAmount,
      components,
      recurrence: null,
      tags: []
    };
  });
}

export function normalizeScenario(rawScenario) {
  const base = rawScenario && typeof rawScenario === 'object' ? rawScenario : {};

  const id = Number(base.id) || 0;
  const version = Number(base.version) || 1;

  const name = typeof base.name === 'string' && base.name ? base.name : 'Unnamed Scenario';
  const description =
    base.description === null || typeof base.description === 'string' ? base.description : String(base.description || '');

  const accounts = Array.isArray(base.accounts) ? base.accounts : [];
  const accountGroups = Array.isArray(base.accountGroups) ? base.accountGroups : [];
  const transactions = Array.isArray(base.transactions)
    ? base.transactions.map(normalizeTransactionRule)
    : [];
  const splitTransactionSetsRaw = Array.isArray(base.splitTransactionSets) ? base.splitTransactionSets : [];
  const splitTransactionSets = splitTransactionSetsRaw.length
    ? splitTransactionSetsRaw
    : deriveSplitTransactionSets(transactions);
  const transactionOccurrences = Array.isArray(base.transactionOccurrences)
    ? base.transactionOccurrences
      .map(normalizeTransactionOccurrence)
      .map((occurrence) => materializeOccurrenceSnapshots(occurrence, transactions))
    : [];
  const baselinePeriods = Array.isArray(base.baselinePeriods)
    ? base.baselinePeriods.map(normalizeBaselinePeriod)
    : [];

  const projectionConfig = normalizeProjectionConfig(base.projection?.config);
  const rows = Array.isArray(base.projection?.rows) ? base.projection.rows : [];
  const generatedAt =
    typeof base.projection?.generatedAt === 'string'
      ? base.projection.generatedAt
      : null;
  const stale = base.projection?.stale === true;
  const staleAt =
    typeof base.projection?.staleAt === 'string'
      ? base.projection.staleAt
      : null;
  const staleReason =
    typeof base.projection?.staleReason === 'string' && base.projection.staleReason.trim()
      ? base.projection.staleReason.trim()
      : null;

  const projection =
    projectionConfig && projectionConfig.startDate && projectionConfig.endDate
      ? {
          config: projectionConfig,
          rows,
          generatedAt,
          stale,
          staleAt: stale ? staleAt : null,
          staleReason: stale ? staleReason : null
        }
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

  const normalized = {
    id,
    version,
    name,
    description,
    lineage,
    accounts,
    accountGroups,
    splitTransactionSets,
    transactions,
    transactionOccurrences,
    baselinePeriods,
    projection,
    planning: nextPlanning
  };

  if (base.advancedGoalSettings !== undefined) normalized.advancedGoalSettings = base.advancedGoalSettings;
  if (base.fundSettings !== undefined) normalized.fundSettings = base.fundSettings;
  return normalized;
}

export function getScenarioProjectionRows(scenario) {
  return scenario?.projection?.rows || [];
}

export function sanitizeScenarioForWrite(rawScenario) {
  const scenario = normalizeScenario(rawScenario);

  const next = {
    id: scenario.id,
    version: scenario.version,
    name: scenario.name,
    description: scenario.description ?? null,
    ...(scenario.lineage !== undefined ? { lineage: scenario.lineage } : {}),
    accounts: scenario.accounts || [],
    accountGroups: scenario.accountGroups || [],
    splitTransactionSets: scenario.splitTransactionSets || [],
    transactions: scenario.transactions || [],
    transactionOccurrences: scenario.transactionOccurrences || [],
    baselinePeriods: scenario.baselinePeriods || [],
    ...(scenario.projection !== undefined ? { projection: scenario.projection } : {}),
    ...(scenario.planning ? { planning: scenario.planning } : {})
  };

  if (scenario.advancedGoalSettings !== undefined) next.advancedGoalSettings = scenario.advancedGoalSettings;
  if (scenario.fundSettings !== undefined) next.fundSettings = scenario.fundSettings;

  return next;
}

export function sanitizeAppDataForWrite(rawAppData) {
  const normalized = normalizeAppData(rawAppData);
  const next = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    scenarios: (normalized.scenarios || []).map(sanitizeScenarioForWrite),
    uiState: normalizeUiState(normalized.uiState)
  };
  if (normalized.migrationReport !== undefined && normalized.migrationReport !== null) {
    next.migrationReport = normalized.migrationReport;
  }
  return next;
}

export function normalizeAppData(raw) {
  const base = raw && typeof raw === 'object' ? raw : {};
  const scenarios = Array.isArray(base.scenarios) ? base.scenarios : [];
  const uiState = normalizeUiState(base.uiState);

  return {
    schemaVersion: typeof base.schemaVersion === 'number' ? base.schemaVersion : CURRENT_SCHEMA_VERSION,
    scenarios: scenarios.map(normalizeScenario),
    uiState,
    ...(base.migrationReport && typeof base.migrationReport === 'object'
      ? { migrationReport: base.migrationReport }
      : {})
  };
}
