// Atomic application commands for transaction occurrences and recurring series.

import * as DataStore from '../services/storage-service.js';
import { allocateNextId } from '../../shared/app-data-utils.js';
import { formatDateOnly, parseDateOnly } from '../../shared/date-utils.js';
import { generateRecurrenceDates } from '../../domain/calculations/recurrence-calculations.js';
import {
  createLinkedOccurrenceKey,
  resolveScenarioOccurrences
} from '../../domain/queries/resolve-scenario-occurrences.js';
import {
  dispatchPlanChanged,
  markProjectionStale
} from './projection-freshness.js';

const VALID_STATUSES = new Set(['planned', 'actual', 'skipped']);
const VALID_ORIGINS = new Set(['generated', 'manual', 'migrated']);
const VALID_SPLIT_STRATEGIES = new Set(['auto_rate', 'top_down', 'manual']);
const VALID_INTEREST_SOURCES = new Set(['account_rate', 'custom_rate', 'manual', 'none']);
const OCCURRENCE_PLAN_FIELDS = new Set([
  'status',
  'plannedAmount',
  'plannedDate',
  'primaryAccountId',
  'secondaryAccountId',
  'transactionTypeId',
  'description',
  'tags',
  'transactionGroupId',
  'transactionGroupRole',
  'transactionGroupAccountGroupId',
  'capitalAmount',
  'interestAmount'
]);
const RULE_CHANGE_FIELDS = new Set([
  'amount',
  'plannedAmount',
  'plannedDate',
  'primaryAccountId',
  'secondaryAccountId',
  'transactionTypeId',
  'description',
  'tags',
  'periodicChange',
  'recurrence'
]);

export class OccurrenceCommandError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'OccurrenceCommandError';
    this.code = code;
    this.details = details;
  }
}

function hasOwn(value, field) {
  return Boolean(value && Object.prototype.hasOwnProperty.call(value, field));
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, clonePlain(child)])
  );
}

function snapshotOccurrenceMetadata(occurrence) {
  return {
    primaryAccountId: occurrence?.primaryAccountId ?? null,
    secondaryAccountId: occurrence?.secondaryAccountId ?? null,
    transactionTypeId: occurrence?.transactionTypeId ?? null,
    description: occurrence?.description ?? '',
    tags: Array.isArray(occurrence?.tags) ? [...occurrence.tags] : [],
    transactionGroupId: occurrence?.transactionGroupId ?? null,
    transactionGroupRole: occurrence?.transactionGroupRole ?? null,
    transactionGroupAccountGroupId:
      occurrence?.transactionGroupAccountGroupId ?? null,
    capitalAmount: occurrence?.capitalAmount ?? null,
    interestAmount: occurrence?.interestAmount ?? null,
    recurrence: clonePlain(occurrence?.recurrence ?? null),
    recurrenceDescription: occurrence?.recurrenceDescription ?? '',
    periodicChange: clonePlain(occurrence?.periodicChange ?? null),
    actualSnapshotVersion: 1
  };
}

function snapshotBaselineMetadata(occurrence) {
  return {
    baselinePrimaryAccountId: occurrence?.primaryAccountId ?? null,
    baselineSecondaryAccountId: occurrence?.secondaryAccountId ?? null,
    baselineTransactionTypeId: occurrence?.transactionTypeId ?? null,
    baselineSnapshotVersion: 1
  };
}

function statusName(value) {
  const raw = typeof value?.status === 'object' ? value.status?.name : value?.status;
  const normalized = String(raw || 'planned').trim().toLowerCase();
  return VALID_STATUSES.has(normalized) ? normalized : 'planned';
}

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDate(value, field = 'date', { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new OccurrenceCommandError(
      'invalid-date',
      `${field} must be a valid YYYY-MM-DD date.`,
      { field, value }
    );
  }
  const parsed = parseDateOnly(value);
  if (!parsed || Number.isNaN(parsed.valueOf()) || formatDateOnly(parsed) !== value) {
    throw new OccurrenceCommandError(
      'invalid-date',
      `${field} must be a valid YYYY-MM-DD date.`,
      { field, value }
    );
  }
  return value;
}

function absoluteAmount(value, field, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new OccurrenceCommandError(
      'invalid-amount',
      `${field} must be a finite number.`,
      { field, value }
    );
  }
  return Math.abs(number);
}

function positiveId(value, field, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    throw new OccurrenceCommandError(
      'invalid-id',
      `${field} must be a positive numeric ID.`,
      { field, value }
    );
  }
  return id;
}

function addDays(dateKey, amount) {
  const date = parseDateOnly(normalizeDate(dateKey));
  date.setDate(date.getDate() + amount);
  return formatDateOnly(date);
}

function addYears(dateKey, amount) {
  const date = parseDateOnly(normalizeDate(dateKey));
  date.setFullYear(date.getFullYear() + amount);
  return formatDateOnly(date);
}

function defaultMonthPeriod(dateKey) {
  const date = parseDateOnly(normalizeDate(dateKey));
  return {
    periodTypeId: 3,
    startDate: formatDateOnly(new Date(date.getFullYear(), date.getMonth(), 1)),
    endDate: formatDateOnly(new Date(date.getFullYear(), date.getMonth() + 1, 0))
  };
}

function normalizePeriod(period, fallbackDate = null) {
  const source = period || (fallbackDate ? defaultMonthPeriod(fallbackDate) : null);
  if (!source) {
    throw new OccurrenceCommandError(
      'baseline-period-required',
      'A baseline period with startDate and endDate is required.'
    );
  }
  const startDate = normalizeDate(source.startDate, 'period.startDate');
  const endDate = normalizeDate(source.endDate, 'period.endDate');
  if (startDate > endDate) {
    throw new OccurrenceCommandError(
      'invalid-period',
      'period.startDate must be on or before period.endDate.'
    );
  }
  const periodTypeId = Number(source.periodTypeId ?? 3);
  if (
    !Number.isInteger(periodTypeId) ||
    periodTypeId < 1 ||
    periodTypeId > 5
  ) {
    throw new OccurrenceCommandError(
      'invalid-period',
      'period.periodTypeId must be an integer from 1 through 5.'
    );
  }
  return { periodTypeId, startDate, endDate };
}

function periodIdentity(period) {
  return `${period.periodTypeId}|${period.startDate}|${period.endDate}`;
}

function isDateInPeriod(dateKey, period) {
  return Boolean(dateKey && dateKey >= period.startDate && dateKey <= period.endDate);
}

function findScenarioOrThrow(data, scenarioId) {
  const scenario = (data?.scenarios || []).find(
    (candidate) => Number(candidate?.id) === Number(scenarioId)
  );
  if (!scenario) {
    throw new OccurrenceCommandError(
      'scenario-not-found',
      `Scenario ${scenarioId} not found.`,
      { scenarioId }
    );
  }
  if (!Array.isArray(scenario.transactions)) scenario.transactions = [];
  if (!Array.isArray(scenario.transactionOccurrences)) scenario.transactionOccurrences = [];
  if (!Array.isArray(scenario.baselinePeriods)) scenario.baselinePeriods = [];
  return scenario;
}

function parseLinkedOccurrenceKey(occurrenceKey) {
  const match = /^tx:([^|]+)\|date:(\d{4}-\d{2}-\d{2})\|role:(.*)$/.exec(
    String(occurrenceKey || '')
  );
  if (!match) return null;
  return {
    sourceTransactionId: Number(match[1]) || match[1],
    scheduledDate: match[2],
    transactionGroupRole: match[3] === 'none' ? null : match[3]
  };
}

function findStoredOccurrenceIndex(scenario, occurrenceKey) {
  const matches = [];
  scenario.transactionOccurrences.forEach((occurrence, index) => {
    if (String(occurrence?.occurrenceKey || '') === String(occurrenceKey || '')) {
      matches.push(index);
    }
  });
  if (matches.length > 1) {
    throw new OccurrenceCommandError(
      'occurrence-conflict',
      `Multiple stored occurrences use ${occurrenceKey}. Repair the duplicate before editing.`,
      { occurrenceKey, sourceOccurrenceIds: matches.map((index) => scenario.transactionOccurrences[index]?.id) }
    );
  }
  return matches[0] ?? -1;
}

function fallbackOccurrenceFromStored(scenario, storedOccurrence) {
  const source = (scenario.transactions || []).find(
    (transaction) =>
      Number(transaction?.id) === Number(storedOccurrence?.sourceTransactionId)
  ) || null;
  const plannedAmount = storedOccurrence?.plannedAmount === null ||
    storedOccurrence?.plannedAmount === undefined
    ? Math.abs(Number(source?.amount || 0))
    : Math.abs(Number(storedOccurrence.plannedAmount || 0));
  const status = statusName(storedOccurrence);
  const usesActualSnapshot =
    status === 'actual' &&
    Number(storedOccurrence?.actualSnapshotVersion) === 1;
  const storedOrSource = (field, fallback = null) => (
    usesActualSnapshot
      ? (storedOccurrence?.[field] ?? fallback)
      : (storedOccurrence?.[field] ?? source?.[field] ?? fallback)
  );
  const scheduledDate = storedOccurrence?.scheduledDate;
  return {
    id: storedOccurrence?.occurrenceKey,
    occurrenceKey: storedOccurrence?.occurrenceKey,
    sourceTransactionId: storedOccurrence?.sourceTransactionId ?? null,
    sourceOccurrenceId: storedOccurrence?.id ?? null,
    sourceOccurrenceIds: storedOccurrence?.id == null ? [] : [storedOccurrence.id],
    origin: storedOccurrence?.origin || (source ? 'generated' : 'manual'),
    primaryAccountId: storedOrSource('primaryAccountId'),
    secondaryAccountId: storedOrSource('secondaryAccountId'),
    transactionTypeId: storedOrSource('transactionTypeId'),
    transactionGroupId: storedOrSource('transactionGroupId'),
    transactionGroupRole: storedOrSource('transactionGroupRole'),
    transactionGroupAccountGroupId: storedOrSource('transactionGroupAccountGroupId'),
    capitalAmount: storedOrSource('capitalAmount'),
    interestAmount: storedOrSource('interestAmount'),
    description: storedOrSource('description', ''),
    tags: clonePlain(storedOrSource('tags', [])),
    recurrence: clonePlain(storedOrSource('recurrence')),
    recurrenceDescription: storedOrSource('recurrenceDescription', ''),
    periodicChange: clonePlain(storedOrSource('periodicChange')),
    scheduledDate,
    plannedDate: storedOccurrence?.plannedDate ?? null,
    actualDate: storedOccurrence?.actualDate ?? null,
    baselineAmount:
      storedOccurrence?.baselineAmount === null ||
      storedOccurrence?.baselineAmount === undefined
        ? plannedAmount
        : Math.abs(Number(storedOccurrence.baselineAmount || 0)),
    baselinePrimaryAccountId:
      Number(storedOccurrence?.baselineSnapshotVersion) === 1
        ? (storedOccurrence?.baselinePrimaryAccountId ?? null)
        : storedOrSource('primaryAccountId'),
    baselineSecondaryAccountId:
      Number(storedOccurrence?.baselineSnapshotVersion) === 1
        ? (storedOccurrence?.baselineSecondaryAccountId ?? null)
        : storedOrSource('secondaryAccountId'),
    baselineTransactionTypeId:
      Number(storedOccurrence?.baselineSnapshotVersion) === 1
        ? (storedOccurrence?.baselineTransactionTypeId ?? null)
        : storedOrSource('transactionTypeId'),
    baselineSnapshotVersion:
      Number(storedOccurrence?.baselineSnapshotVersion) === 1 ? 1 : null,
    actualSnapshotVersion:
      Number(storedOccurrence?.actualSnapshotVersion) === 1 ? 1 : null,
    baselineState:
      storedOccurrence?.baselineAmount === null ||
      storedOccurrence?.baselineAmount === undefined
        ? 'derived'
        : 'stored',
    plannedAmount,
    actualAmount:
      storedOccurrence?.actualAmount === null ||
      storedOccurrence?.actualAmount === undefined
        ? null
        : Math.abs(Number(storedOccurrence.actualAmount || 0)),
    status,
    isUnplannedActual:
      status === 'actual' &&
      !source &&
      Number(storedOccurrence?.baselineAmount || 0) === 0 &&
      Number(storedOccurrence?.plannedAmount || 0) === 0
  };
}

function resolveOccurrenceOrThrow(scenario, occurrenceKey) {
  if (!occurrenceKey) {
    throw new OccurrenceCommandError(
      'occurrence-key-required',
      'occurrenceKey is required.'
    );
  }
  const storedIndex = findStoredOccurrenceIndex(scenario, occurrenceKey);
  const storedOccurrence =
    storedIndex >= 0 ? scenario.transactionOccurrences[storedIndex] : null;
  const parsedKey = parseLinkedOccurrenceKey(occurrenceKey);
  const scheduledDate =
    storedOccurrence?.scheduledDate || parsedKey?.scheduledDate || null;
  if (!scheduledDate) {
    throw new OccurrenceCommandError(
      'occurrence-not-found',
      `Occurrence ${occurrenceKey} was not found.`,
      { occurrenceKey }
    );
  }

  const { occurrences, diagnostics } = resolveScenarioOccurrences({
    scenario,
    startDate: scheduledDate,
    endDate: scheduledDate
  });
  const conflicts = diagnostics.filter(
    (diagnostic) => String(diagnostic?.occurrenceKey || '') === String(occurrenceKey)
  );
  if (conflicts.length) {
    throw new OccurrenceCommandError(
      'occurrence-conflict',
      `Occurrence ${occurrenceKey} cannot be edited until its resolver diagnostics are repaired.`,
      { occurrenceKey, diagnostics: conflicts }
    );
  }

  const resolved = occurrences.find(
    (occurrence) => String(occurrence?.occurrenceKey || '') === String(occurrenceKey)
  );
  if (resolved) {
    return { occurrence: resolved, storedIndex, storedOccurrence };
  }
  if (storedOccurrence) {
    return {
      occurrence: fallbackOccurrenceFromStored(scenario, storedOccurrence),
      storedIndex,
      storedOccurrence
    };
  }
  throw new OccurrenceCommandError(
    'occurrence-not-found',
    `Occurrence ${occurrenceKey} was not found.`,
    { occurrenceKey }
  );
}

function validateMovement(scenario, movement) {
  const primaryAccountId = positiveId(
    movement.primaryAccountId,
    'primaryAccountId'
  );
  const secondaryAccountId = positiveId(
    movement.secondaryAccountId,
    'secondaryAccountId',
    { nullable: true }
  );
  const transactionTypeId = Number(movement.transactionTypeId);
  if (transactionTypeId !== 1 && transactionTypeId !== 2) {
    throw new OccurrenceCommandError(
      'invalid-transaction-type',
      'transactionTypeId must be 1 (Money In) or 2 (Money Out).'
    );
  }

  const accountIds = new Set(
    (scenario.accounts || []).map((account) => Number(account?.id)).filter(Boolean)
  );
  if (accountIds.size && !accountIds.has(primaryAccountId)) {
    throw new OccurrenceCommandError(
      'account-not-found',
      `Primary account ${primaryAccountId} was not found.`
    );
  }
  if (accountIds.size && secondaryAccountId && !accountIds.has(secondaryAccountId)) {
    throw new OccurrenceCommandError(
      'account-not-found',
      `Secondary account ${secondaryAccountId} was not found.`
    );
  }
  return { primaryAccountId, secondaryAccountId, transactionTypeId };
}

function createOccurrenceSkeleton(scenario, occurrence, timestamp) {
  const sourceTransactionId =
    occurrence?.sourceTransactionId === null ||
    occurrence?.sourceTransactionId === undefined
      ? null
      : positiveId(occurrence.sourceTransactionId, 'sourceTransactionId');
  const id = allocateNextId(scenario.transactionOccurrences);
  return {
    id,
    sourceTransactionId,
    occurrenceKey: String(occurrence?.occurrenceKey || `occurrence:${id}`),
    scheduledDate: normalizeDate(occurrence?.scheduledDate, 'scheduledDate'),
    plannedDate: null,
    actualDate: null,
    baselineAmount: null,
    baselinePrimaryAccountId: null,
    baselineSecondaryAccountId: null,
    baselineTransactionTypeId: null,
    baselineSnapshotVersion: null,
    plannedAmount: null,
    actualAmount: null,
    status: VALID_STATUSES.has(occurrence?.status) ? occurrence.status : 'planned',
    origin: VALID_ORIGINS.has(occurrence?.origin)
      ? occurrence.origin
      : (sourceTransactionId ? 'generated' : 'manual'),
    actualSnapshotVersion: null,
    primaryAccountId: null,
    secondaryAccountId: null,
    transactionTypeId: null,
    description: null,
    tags: null,
    transactionGroupId: null,
    transactionGroupRole: occurrence?.transactionGroupRole ?? null,
    transactionGroupAccountGroupId: null,
    capitalAmount: null,
    interestAmount: null,
    isOverride: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function upsertOccurrence(
  scenario,
  occurrence,
  patch,
  timestamp,
  { isOverride = true } = {}
) {
  let index = findStoredOccurrenceIndex(scenario, occurrence.occurrenceKey);
  const current =
    index >= 0
      ? scenario.transactionOccurrences[index]
      : createOccurrenceSkeleton(scenario, occurrence, timestamp);
  const next = {
    ...current,
    ...clonePlain(patch),
    id: current.id,
    sourceTransactionId:
      patch?.sourceTransactionId !== undefined
        ? patch.sourceTransactionId
        : current.sourceTransactionId,
    occurrenceKey: current.occurrenceKey,
    scheduledDate: current.scheduledDate,
    isOverride:
      typeof patch?.isOverride === 'boolean'
        ? patch.isOverride
        : (typeof current.isOverride === 'boolean' ? current.isOverride || isOverride : isOverride),
    createdAt: current.createdAt || timestamp,
    updatedAt: timestamp
  };

  if (index >= 0) {
    scenario.transactionOccurrences[index] = next;
  } else {
    scenario.transactionOccurrences.push(next);
    index = scenario.transactionOccurrences.length - 1;
  }
  return { record: next, index };
}

function markerContainsDate(scenario, dateKey) {
  return Boolean(findBaselinePeriodContainingDate(scenario, dateKey));
}

function findBaselinePeriodContainingDate(scenario, dateKey) {
  return (scenario.baselinePeriods || []).find(
    (period) => dateKey >= period.startDate && dateKey <= period.endDate
  ) || null;
}

function freezePeriodInScenario(scenario, rawPeriod, timestamp) {
  const period = normalizePeriod(rawPeriod);
  const identity = periodIdentity(period);
  const existingMarker = scenario.baselinePeriods.find(
    (candidate) => periodIdentity(normalizePeriod(candidate)) === identity
  );
  if (existingMarker) {
    return { period: existingMarker, affectedOccurrenceKeys: [] };
  }

  const { occurrences, diagnostics } = resolveScenarioOccurrences({
    scenario,
    startDate: period.startDate,
    endDate: period.endDate
  });
  if (diagnostics.length) {
    throw new OccurrenceCommandError(
      'baseline-resolution-conflict',
      'The period baseline cannot be frozen until occurrence diagnostics are repaired.',
      { period, diagnostics }
    );
  }

  const affectedOccurrenceKeys = [];
  occurrences.forEach((occurrence) => {
    const storedIndex = findStoredOccurrenceIndex(scenario, occurrence.occurrenceKey);
    const current =
      storedIndex >= 0 ? scenario.transactionOccurrences[storedIndex] : null;
    if (current?.baselineAmount !== null && current?.baselineAmount !== undefined) {
      return;
    }

    const baselineAmount = occurrence.isUnplannedActual
      ? 0
      : absoluteAmount(occurrence.plannedAmount, 'plannedAmount');
    const patch = {
      baselineAmount,
      ...snapshotBaselineMetadata(occurrence),
      ...(occurrence.status === 'actual'
        ? {
          ...snapshotOccurrenceMetadata(occurrence),
          plannedAmount: absoluteAmount(occurrence.plannedAmount, 'plannedAmount'),
          actualAmount: absoluteAmount(occurrence.actualAmount, 'actualAmount'),
          actualDate: normalizeDate(occurrence.actualDate, 'actualDate'),
          status: 'actual'
        }
        : {}),
      ...(occurrence.status === 'skipped'
        ? {
          plannedAmount: absoluteAmount(occurrence.plannedAmount, 'plannedAmount'),
          status: 'skipped'
        }
        : {}),
      isOverride: current
        ? current.isOverride !== false
        : occurrence.status !== 'planned'
    };
    upsertOccurrence(
      scenario,
      occurrence,
      patch,
      timestamp,
      { isOverride: occurrence.status !== 'planned' }
    );
    affectedOccurrenceKeys.push(occurrence.occurrenceKey);
  });

  const marker = {
    periodTypeId: period.periodTypeId,
    startDate: period.startDate,
    endDate: period.endDate,
    frozenAt: timestamp
  };
  scenario.baselinePeriods.push(marker);
  return { period: marker, affectedOccurrenceKeys };
}

function normalizeOccurrencePlanPatch(updates = {}) {
  const patch = {};
  Object.keys(updates || {}).forEach((field) => {
    if (!OCCURRENCE_PLAN_FIELDS.has(field)) {
      throw new OccurrenceCommandError(
        'unsupported-occurrence-change',
        `${field} cannot be changed by updateOccurrenceOnly.`,
        { field }
      );
    }
  });

  if (hasOwn(updates, 'plannedAmount')) {
    patch.plannedAmount = absoluteAmount(
      updates.plannedAmount,
      'plannedAmount',
      { nullable: true }
    );
  }
  if (hasOwn(updates, 'status')) {
    const status = String(updates.status || '').trim().toLowerCase();
    if (status !== 'planned') {
      throw new OccurrenceCommandError(
        'invalid-status-transition',
        'updateOccurrenceOnly can only restore an occurrence to planned.'
      );
    }
    patch.status = 'planned';
    patch.actualAmount = null;
    patch.actualDate = null;
  }
  if (hasOwn(updates, 'plannedDate')) {
    patch.plannedDate = normalizeDate(
      updates.plannedDate,
      'plannedDate',
      { nullable: true }
    );
  }
  if (hasOwn(updates, 'primaryAccountId')) {
    patch.primaryAccountId = positiveId(
      updates.primaryAccountId,
      'primaryAccountId',
      { nullable: true }
    );
  }
  if (hasOwn(updates, 'secondaryAccountId')) {
    patch.secondaryAccountId = positiveId(
      updates.secondaryAccountId,
      'secondaryAccountId',
      { nullable: true }
    );
  }
  if (hasOwn(updates, 'transactionTypeId')) {
    const id = Number(updates.transactionTypeId);
    if (id !== 1 && id !== 2) {
      throw new OccurrenceCommandError(
        'invalid-transaction-type',
        'transactionTypeId must be 1 or 2.'
      );
    }
    patch.transactionTypeId = id;
  }
  if (hasOwn(updates, 'description')) {
    patch.description =
      updates.description === null ? null : String(updates.description || '').trim();
  }
  if (hasOwn(updates, 'tags')) {
    if (updates.tags !== null && !Array.isArray(updates.tags)) {
      throw new OccurrenceCommandError('invalid-tags', 'tags must be an array or null.');
    }
    patch.tags = updates.tags === null ? null : [...updates.tags];
  }
  if (hasOwn(updates, 'transactionGroupId')) {
    patch.transactionGroupId = updates.transactionGroupId ?? null;
  }
  if (hasOwn(updates, 'transactionGroupRole')) {
    patch.transactionGroupRole =
      updates.transactionGroupRole === null
        ? null
        : normalizeRole(updates.transactionGroupRole) || null;
  }
  if (hasOwn(updates, 'transactionGroupAccountGroupId')) {
    patch.transactionGroupAccountGroupId = positiveId(
      updates.transactionGroupAccountGroupId,
      'transactionGroupAccountGroupId',
      { nullable: true }
    );
  }
  if (hasOwn(updates, 'capitalAmount')) {
    patch.capitalAmount = absoluteAmount(
      updates.capitalAmount,
      'capitalAmount',
      { nullable: true }
    );
  }
  if (hasOwn(updates, 'interestAmount')) {
    patch.interestAmount = absoluteAmount(
      updates.interestAmount,
      'interestAmount',
      { nullable: true }
    );
  }
  return patch;
}

function normalizeRuleUpdates(updates = {}) {
  Object.keys(updates || {}).forEach((field) => {
    if (!RULE_CHANGE_FIELDS.has(field)) {
      throw new OccurrenceCommandError(
        'unsupported-series-change',
        `${field} cannot be changed by a series command.`,
        { field }
      );
    }
  });
  const patch = clonePlain(updates || {});
  if (!hasOwn(patch, 'amount') && hasOwn(patch, 'plannedAmount')) {
    patch.amount = patch.plannedAmount;
  }
  // plannedDate is an occurrence-only timing override. A series revision keeps
  // its immutable split boundary and derives future timing from recurrence.
  delete patch.plannedAmount;
  delete patch.plannedDate;
  if (hasOwn(patch, 'amount')) {
    patch.amount = absoluteAmount(patch.amount, 'amount');
  }
  if (hasOwn(patch, 'primaryAccountId')) {
    patch.primaryAccountId = positiveId(patch.primaryAccountId, 'primaryAccountId');
  }
  if (hasOwn(patch, 'secondaryAccountId')) {
    patch.secondaryAccountId = positiveId(
      patch.secondaryAccountId,
      'secondaryAccountId',
      { nullable: true }
    );
  }
  if (hasOwn(patch, 'transactionTypeId')) {
    const id = Number(patch.transactionTypeId);
    if (id !== 1 && id !== 2) {
      throw new OccurrenceCommandError(
        'invalid-transaction-type',
        'transactionTypeId must be 1 or 2.'
      );
    }
    patch.transactionTypeId = id;
  }
  if (hasOwn(patch, 'description')) {
    patch.description = String(patch.description || '').trim();
  }
  if (hasOwn(patch, 'tags')) {
    if (!Array.isArray(patch.tags)) {
      throw new OccurrenceCommandError('invalid-tags', 'tags must be an array.');
    }
    patch.tags = [...patch.tags];
  }
  return patch;
}

function normalizeSplitSetUpdates(updates = {}) {
  const allowed = new Set([
    'description',
    'strategy',
    'payingAccountId',
    'targetAccountId',
    'totalAmount',
    'recurrence',
    'tags',
    'interestSource',
    'customRate'
  ]);
  Object.keys(updates || {}).forEach((field) => {
    if (!allowed.has(field)) {
      throw new OccurrenceCommandError(
        'unsupported-split-set-change',
        `${field} cannot be changed by updateSplitSeries.`,
        { field }
      );
    }
  });
  const patch = clonePlain(updates || {});
  if (hasOwn(patch, 'description')) {
    patch.description = String(patch.description || '').trim();
  }
  if (hasOwn(patch, 'strategy')) {
    const strategy = String(patch.strategy || '').trim();
    if (!VALID_SPLIT_STRATEGIES.has(strategy)) {
      throw new OccurrenceCommandError(
        'invalid-split-strategy',
        'Split strategy must be auto_rate, top_down, or manual.'
      );
    }
    patch.strategy = strategy;
  }
  for (const field of ['payingAccountId', 'targetAccountId']) {
    if (hasOwn(patch, field)) {
      patch[field] = positiveId(patch[field], field, { nullable: true });
    }
  }
  if (hasOwn(patch, 'totalAmount')) {
    patch.totalAmount = absoluteAmount(patch.totalAmount, 'totalAmount');
  }
  if (hasOwn(patch, 'tags')) {
    if (!Array.isArray(patch.tags)) {
      throw new OccurrenceCommandError('invalid-tags', 'tags must be an array.');
    }
    patch.tags = [...patch.tags];
  }
  if (hasOwn(patch, 'interestSource')) {
    const source = String(patch.interestSource || '').trim();
    if (!VALID_INTEREST_SOURCES.has(source)) {
      throw new OccurrenceCommandError(
        'invalid-interest-source',
        'interestSource must be account_rate, custom_rate, manual, or none.'
      );
    }
    patch.interestSource = source;
  }
  if (hasOwn(patch, 'customRate')) {
    patch.customRate = absoluteAmount(
      patch.customRate,
      'customRate',
      { nullable: true }
    );
  }
  return patch;
}

function normalizeSplitComponentUpdates(componentUpdates = []) {
  if (!Array.isArray(componentUpdates) || !componentUpdates.length) {
    throw new OccurrenceCommandError(
      'split-component-updates-required',
      'At least one split component update is required.'
    );
  }
  const updatesByRole = new Map();
  componentUpdates.forEach((entry, index) => {
    const role = normalizeRole(entry?.role);
    if (!role) {
      throw new OccurrenceCommandError(
        'split-component-role-required',
        `componentUpdates[${index}].role is required.`
      );
    }
    if (updatesByRole.has(role)) {
      throw new OccurrenceCommandError(
        'duplicate-split-component-role',
        `Split component role ${role} was provided more than once.`
      );
    }
    const rawUpdates = { ...(entry || {}) };
    delete rawUpdates.role;
    updatesByRole.set(role, normalizeRuleUpdates(rawUpdates));
  });
  return updatesByRole;
}

function recurrenceTypeId(recurrence) {
  const raw = recurrence?.recurrenceType ?? recurrence?.recurrenceTypeId;
  return Number(typeof raw === 'object' ? raw?.id : raw);
}

function isRecurringRule(rule) {
  const typeId = recurrenceTypeId(rule?.recurrence);
  return Boolean(typeId && typeId !== 1);
}

function ruleStartDate(rule) {
  return (
    rule?.activeFrom ||
    rule?.recurrence?.startDate ||
    rule?.effectiveDate ||
    null
  );
}

function applyRulePatch(rule, rawUpdates, timestamp, { startDate = null, endDate } = {}) {
  const updates = normalizeRuleUpdates(rawUpdates);
  const next = { ...rule, ...updates };
  const baseRecurrence = clonePlain(updates.recurrence || rule.recurrence || null);
  if (baseRecurrence) {
    if (startDate) baseRecurrence.startDate = startDate;
    if (endDate !== undefined) baseRecurrence.endDate = endDate;
    next.recurrence = baseRecurrence;
  }
  if (startDate) {
    next.effectiveDate = startDate;
    next.activeFrom = startDate;
  }
  if (endDate !== undefined) next.activeTo = endDate;
  next.updatedAt = timestamp;
  return next;
}

function makeUniqueGroupId(scenario, oldGroupId, seedId) {
  const used = new Set(
    (scenario.splitTransactionSets || []).map((set) => String(set?.id || ''))
  );
  let candidate = `${oldGroupId}:segment:${seedId}`;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${oldGroupId}:segment:${seedId}:${suffix++}`;
  }
  return candidate;
}

function splitSeriesAtOccurrence(
  scenario,
  occurrence,
  rawUpdates,
  timestamp
) {
  const sourceId = Number(occurrence?.sourceTransactionId);
  const sourceIndex = scenario.transactions.findIndex(
    (transaction) => Number(transaction?.id) === sourceId
  );
  if (sourceIndex === -1) {
    throw new OccurrenceCommandError(
      'linked-rule-not-found',
      `Source transaction ${occurrence?.sourceTransactionId} was not found.`
    );
  }
  const sourceRule = scenario.transactions[sourceIndex];
  if (!isRecurringRule(sourceRule)) {
    throw new OccurrenceCommandError(
      'recurring-rule-required',
      'This command requires an occurrence generated by a recurring rule.'
    );
  }
  if (occurrence.status !== 'planned') {
    throw new OccurrenceCommandError(
      'actual-history-protected',
      'Series edits can only start from an unresolved planned occurrence.'
    );
  }
  const boundary = normalizeDate(occurrence.scheduledDate, 'scheduledDate');
  const sourceGroupId = String(sourceRule?.transactionGroupId || '').trim();
  const groupRules = sourceGroupId
    ? scenario.transactions.filter(
      (transaction) =>
        String(transaction?.transactionGroupId || '').trim() === sourceGroupId &&
        statusName(transaction) === 'planned'
    )
    : [sourceRule];

  const sourceStart = normalizeDate(ruleStartDate(sourceRule), 'rule startDate');
  const sourceEnd = sourceRule?.activeTo || sourceRule?.recurrence?.endDate || null;
  if (boundary < sourceStart || (sourceEnd && boundary > sourceEnd)) {
    throw new OccurrenceCommandError(
      'occurrence-outside-series-segment',
      'The selected occurrence is outside its linked rule segment.'
    );
  }
  const updates = normalizeRuleUpdates(rawUpdates);
  const sourceRole = normalizeRole(sourceRule.transactionGroupRole);

  if (sourceStart >= boundary) {
    groupRules.forEach((rule) => {
      const index = scenario.transactions.findIndex(
        (candidate) => Number(candidate.id) === Number(rule.id)
      );
      const roleMatches =
        !sourceGroupId ||
        normalizeRole(rule.transactionGroupRole) === sourceRole;
      const rolePatch = roleMatches
        ? updates
        : (hasOwn(updates, 'recurrence') ? { recurrence: updates.recurrence } : {});
      scenario.transactions[index] = applyRulePatch(
        rule,
        rolePatch,
        timestamp,
        {
          startDate: ruleStartDate(rule),
          endDate: rule?.recurrence?.endDate ?? rule?.activeTo ?? null
        }
      );
    });
    return {
      occurrenceKey: occurrence.occurrenceKey,
      createdTransactionIds: [],
      newSourceIdsByOldId: new Map(),
      seriesRootId: Number(sourceRule.seriesRootId || sourceRule.id)
    };
  }

  const oldEndDate = addDays(boundary, -1);
  let nextTransactionId = allocateNextId(scenario.transactions);
  const rootId = Number(sourceRule.seriesRootId || sourceRule.id);
  const newSourceIdsByOldId = new Map();
  const createdRules = [];
  const newGroupId = sourceGroupId
    ? makeUniqueGroupId(scenario, sourceGroupId, nextTransactionId)
    : null;

  groupRules.forEach((rule) => {
    const index = scenario.transactions.findIndex(
      (candidate) => Number(candidate.id) === Number(rule.id)
    );
    const originalEnd = rule?.recurrence?.endDate ?? rule?.activeTo ?? null;
    const boundedEnd = originalEnd && originalEnd < oldEndDate
      ? originalEnd
      : oldEndDate;
    scenario.transactions[index] = applyRulePatch(
      {
        ...rule,
        seriesRootId: Number(rule.seriesRootId || rootId)
      },
      {},
      timestamp,
      { endDate: boundedEnd }
    );

    const newId = nextTransactionId++;
    const roleMatches =
      !sourceGroupId ||
      normalizeRole(rule.transactionGroupRole) === sourceRole;
    const rolePatch = roleMatches
      ? updates
      : (hasOwn(updates, 'recurrence') ? { recurrence: updates.recurrence } : {});
    let nextRule = applyRulePatch(
      {
        ...clonePlain(rule),
        id: newId,
        transactionGroupId: newGroupId || rule.transactionGroupId || null,
        seriesRootId: Number(rule.seriesRootId || rootId),
        supersedesTransactionId: Number(rule.id),
        status: { name: 'planned', actualAmount: null, actualDate: null },
        createdAt: timestamp,
        updatedAt: timestamp
      },
      rolePatch,
      timestamp,
      {
        startDate: boundary,
        endDate: hasOwn(rolePatch, 'recurrence')
          ? (rolePatch.recurrence?.endDate ?? originalEnd)
          : originalEnd
      }
    );
    if (!isRecurringRule(nextRule)) {
      throw new OccurrenceCommandError(
        'recurring-rule-required',
        'A this-and-future change must keep the replacement rule recurring.'
      );
    }
    createdRules.push(nextRule);
    newSourceIdsByOldId.set(Number(rule.id), newId);
  });
  scenario.transactions.push(...createdRules);

  if (sourceGroupId && Array.isArray(scenario.splitTransactionSets)) {
    const setIndex = scenario.splitTransactionSets.findIndex(
      (set) => String(set?.id || '') === sourceGroupId
    );
    if (setIndex >= 0) {
      const oldSet = scenario.splitTransactionSets[setIndex];
      const oldSetEnd = oldSet?.recurrence?.endDate ?? oldSet?.activeTo ?? null;
      const boundComponentRecurrence = (component, startDate, endDate) => {
        const sourceRecurrence =
          hasOwn(updates, 'recurrence')
            ? updates.recurrence
            : component?.recurrence;
        return sourceRecurrence
          ? {
            ...clonePlain(sourceRecurrence),
            ...(startDate ? { startDate } : {}),
            endDate
          }
          : sourceRecurrence;
      };
      scenario.splitTransactionSets[setIndex] = {
        ...clonePlain(oldSet),
        recurrence: oldSet?.recurrence
          ? { ...clonePlain(oldSet.recurrence), endDate: oldEndDate }
          : oldSet?.recurrence,
        components: (oldSet.components || []).map((component) => ({
          ...clonePlain(component),
          recurrence: component?.recurrence
            ? {
              ...clonePlain(component.recurrence),
              endDate: oldEndDate
            }
            : component?.recurrence
        })),
        seriesRootId: oldSet.seriesRootId || sourceGroupId,
        activeTo: oldEndDate,
        updatedAt: timestamp
      };
      const nextComponents = (oldSet.components || []).map((component) => {
        const roleMatches = normalizeRole(component?.role) === sourceRole;
        const nextComponent = {
          ...clonePlain(component),
          recurrence: boundComponentRecurrence(
            component,
            boundary,
            component?.recurrence?.endDate ?? oldSetEnd
          )
        };
        if (!roleMatches) return nextComponent;
        if (hasOwn(updates, 'amount')) {
          nextComponent.value = updates.amount;
          if (hasOwn(nextComponent, 'amount')) nextComponent.amount = updates.amount;
        }
        if (hasOwn(updates, 'secondaryAccountId')) {
          nextComponent.accountId = updates.secondaryAccountId;
          if (hasOwn(nextComponent, 'secondaryAccountId')) {
            nextComponent.secondaryAccountId = updates.secondaryAccountId;
          }
        }
        if (hasOwn(updates, 'transactionTypeId')) {
          nextComponent.transactionTypeId = updates.transactionTypeId;
        }
        if (hasOwn(updates, 'description')) {
          nextComponent.description = updates.description;
        }
        if (hasOwn(updates, 'periodicChange')) {
          nextComponent.periodicChange = clonePlain(updates.periodicChange);
        }
        return nextComponent;
      });
      const nextSet = {
        ...clonePlain(oldSet),
        id: newGroupId,
        recurrence: (updates.recurrence || oldSet?.recurrence)
          ? {
            ...clonePlain(updates.recurrence || oldSet.recurrence),
            startDate: boundary,
            endDate: updates.recurrence?.endDate ?? oldSetEnd
          }
          : oldSet?.recurrence,
        components: nextComponents,
        seriesRootId: oldSet.seriesRootId || sourceGroupId,
        supersedesTransactionGroupId: sourceGroupId,
        activeFrom: boundary,
        activeTo: oldSetEnd,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      if (hasOwn(updates, 'primaryAccountId')) {
        nextSet.payingAccountId = updates.primaryAccountId;
      }
      nextSet.totalAmount = nextComponents.reduce(
        (sum, component) => sum + Math.abs(Number(component?.value ?? component?.amount ?? 0)),
        0
      );
      scenario.splitTransactionSets.push(nextSet);
    }
  }

  scenario.transactionOccurrences = scenario.transactionOccurrences.map((storedOccurrence) => {
    const newSourceId = newSourceIdsByOldId.get(
      Number(storedOccurrence?.sourceTransactionId)
    );
    if (
      !newSourceId ||
      storedOccurrence?.scheduledDate < boundary ||
      statusName(storedOccurrence) === 'actual'
    ) {
      return storedOccurrence;
    }
    const nextRole = normalizeRole(storedOccurrence?.transactionGroupRole);
    return {
      ...storedOccurrence,
      sourceTransactionId: newSourceId,
      occurrenceKey: createLinkedOccurrenceKey(
        newSourceId,
        storedOccurrence.scheduledDate,
        nextRole
      ),
      transactionGroupId: newGroupId || storedOccurrence.transactionGroupId || null,
      updatedAt: timestamp
    };
  });

  const newSourceId = newSourceIdsByOldId.get(sourceId);
  return {
    occurrenceKey: createLinkedOccurrenceKey(
      newSourceId,
      boundary,
      occurrence.transactionGroupRole
    ),
    createdTransactionIds: createdRules.map((rule) => rule.id),
    newSourceIdsByOldId,
    seriesRootId: rootId
  };
}

function applyChangesToFutureSegments(
  scenario,
  seriesRootId,
  boundary,
  changes,
  excludedIds,
  timestamp,
  targetRole = null
) {
  const excluded = new Set(excludedIds.map(Number));
  const normalizedTargetRole = normalizeRole(targetRole);
  const affectedGroupIds = new Set();
  scenario.transactions = scenario.transactions.map((rule) => {
    if (excluded.has(Number(rule.id))) return rule;
    const root = Number(rule.seriesRootId || rule.id);
    const start = ruleStartDate(rule);
    if (root !== Number(seriesRootId) || !start || start < boundary) return rule;
    const groupId = String(rule?.transactionGroupId || '').trim();
    if (groupId) affectedGroupIds.add(groupId);
    const roleMatches =
      !groupId ||
      normalizeRole(rule?.transactionGroupRole) === normalizedTargetRole;
    const ruleChanges = roleMatches
      ? changes
      : (hasOwn(changes, 'recurrence') ? { recurrence: changes.recurrence } : {});
    const end = rule?.recurrence?.endDate ?? rule?.activeTo ?? null;
    return applyRulePatch(rule, ruleChanges, timestamp, {
      startDate: start,
      endDate: end
    });
  });

  if (!affectedGroupIds.size || !Array.isArray(scenario.splitTransactionSets)) return;
  scenario.splitTransactionSets = scenario.splitTransactionSets.map((set) => {
    const groupId = String(set?.id || '').trim();
    if (!affectedGroupIds.has(groupId)) return set;
    const setStart = set?.activeFrom || set?.recurrence?.startDate || set?.effectiveDate || boundary;
    const setEnd = set?.activeTo || set?.recurrence?.endDate || null;
    const components = (set.components || []).map((component) => {
      const roleMatches =
        normalizeRole(component?.role) === normalizedTargetRole;
      const next = {
        ...clonePlain(component),
        recurrence: hasOwn(changes, 'recurrence')
          ? {
            ...clonePlain(changes.recurrence),
            startDate: component?.recurrence?.startDate || setStart,
            endDate: component?.recurrence?.endDate ?? setEnd
          }
          : clonePlain(component?.recurrence || null)
      };
      if (!roleMatches) return next;
      if (hasOwn(changes, 'amount')) {
        next.value = changes.amount;
        if (hasOwn(next, 'amount')) next.amount = changes.amount;
      }
      if (hasOwn(changes, 'secondaryAccountId')) {
        next.accountId = changes.secondaryAccountId;
        if (hasOwn(next, 'secondaryAccountId')) {
          next.secondaryAccountId = changes.secondaryAccountId;
        }
      }
      if (hasOwn(changes, 'transactionTypeId')) {
        next.transactionTypeId = changes.transactionTypeId;
      }
      if (hasOwn(changes, 'description')) next.description = changes.description;
      if (hasOwn(changes, 'periodicChange')) {
        next.periodicChange = clonePlain(changes.periodicChange);
      }
      return next;
    });
    const nextSet = {
      ...clonePlain(set),
      components,
      recurrence: hasOwn(changes, 'recurrence')
        ? {
          ...clonePlain(changes.recurrence),
          startDate: set?.recurrence?.startDate || setStart,
          endDate: set?.recurrence?.endDate ?? setEnd
        }
        : clonePlain(set?.recurrence || null),
      totalAmount: components.reduce(
        (sum, component) => sum + Math.abs(Number(component?.value ?? component?.amount ?? 0)),
        0
      ),
      updatedAt: timestamp
    };
    if (hasOwn(changes, 'primaryAccountId')) {
      nextSet.payingAccountId = changes.primaryAccountId;
    }
    return nextSet;
  });
}

function applySplitComponentPatch(component, updates, {
  sharedRecurrence = null,
  segmentStart = null,
  segmentEnd = null
} = {}) {
  const next = { ...clonePlain(component) };
  if (hasOwn(updates, 'amount')) {
    next.value = updates.amount;
    if (hasOwn(next, 'amount')) next.amount = updates.amount;
  }
  if (hasOwn(updates, 'secondaryAccountId')) {
    next.accountId = updates.secondaryAccountId;
    if (hasOwn(next, 'secondaryAccountId')) {
      next.secondaryAccountId = updates.secondaryAccountId;
    }
  }
  if (hasOwn(updates, 'transactionTypeId')) {
    next.transactionTypeId = updates.transactionTypeId;
  }
  if (hasOwn(updates, 'description')) next.description = updates.description;
  if (hasOwn(updates, 'periodicChange')) {
    next.periodicChange = clonePlain(updates.periodicChange);
  }

  const recurrence = sharedRecurrence || updates.recurrence || null;
  if (recurrence) {
    next.recurrence = {
      ...clonePlain(recurrence),
      startDate:
        next?.recurrence?.startDate ||
        segmentStart ||
        recurrence?.startDate ||
        null,
      endDate:
        next?.recurrence?.endDate ??
        segmentEnd ??
        recurrence?.endDate ??
        null
    };
  }
  return next;
}

function applySplitUpdatesToGroups(
  scenario,
  groupIds,
  updatesByRole,
  setUpdates,
  timestamp
) {
  const affectedGroupIds = new Set(groupIds);
  const sharedRecurrence = setUpdates?.recurrence || null;
  const payingAccountId = hasOwn(setUpdates, 'payingAccountId')
    ? setUpdates.payingAccountId
    : null;

  scenario.transactions = (scenario.transactions || []).map((rule) => {
    const groupId = String(rule?.transactionGroupId || '').trim();
    if (!affectedGroupIds.has(groupId)) return rule;
    const role = normalizeRole(rule?.transactionGroupRole);
    const roleUpdates = updatesByRole.get(role) || {};
    const sharedUpdates = {
      ...(payingAccountId ? { primaryAccountId: payingAccountId } : {}),
      ...(sharedRecurrence ? { recurrence: sharedRecurrence } : {}),
      ...(hasOwn(setUpdates, 'tags') ? { tags: setUpdates.tags } : {})
    };
    if (!Object.keys(roleUpdates).length && !Object.keys(sharedUpdates).length) {
      return rule;
    }
    return applyRulePatch(
      rule,
      { ...roleUpdates, ...sharedUpdates },
      timestamp,
      {
        startDate: ruleStartDate(rule),
        endDate: rule?.recurrence?.endDate ?? rule?.activeTo ?? null
      }
    );
  });

  scenario.splitTransactionSets = (scenario.splitTransactionSets || []).map((set) => {
    const groupId = String(set?.id || '').trim();
    if (!affectedGroupIds.has(groupId)) return set;
    const segmentStart =
      set?.activeFrom ||
      set?.recurrence?.startDate ||
      set?.effectiveDate ||
      null;
    const segmentEnd = set?.activeTo ?? set?.recurrence?.endDate ?? null;
    const components = (set.components || []).map((component) => {
      const role = normalizeRole(component?.role);
      const roleUpdates = updatesByRole.get(role) || {};
      return applySplitComponentPatch(component, roleUpdates, {
        sharedRecurrence,
        segmentStart,
        segmentEnd
      });
    });
    const componentTotal = components.reduce(
      (sum, component) =>
        sum + Math.abs(Number(component?.value ?? component?.amount ?? 0)),
      0
    );
    const next = {
      ...clonePlain(set),
      ...clonePlain(setUpdates),
      id: set.id,
      components,
      totalAmount: hasOwn(setUpdates, 'totalAmount')
        ? setUpdates.totalAmount
        : componentTotal,
      createdAt: set.createdAt || timestamp,
      updatedAt: timestamp
    };
    if (sharedRecurrence) {
      next.recurrence = {
        ...clonePlain(sharedRecurrence),
        startDate:
          set?.recurrence?.startDate ||
          segmentStart ||
          sharedRecurrence?.startDate ||
          null,
        endDate:
          set?.recurrence?.endDate ??
          segmentEnd ??
          sharedRecurrence?.endDate ??
          null
      };
    }
    return next;
  });
}

function nextRecurrenceDate(recurrence, afterDate) {
  const normalizedAfter = normalizeDate(afterDate, 'afterDate');
  const start = addDays(normalizedAfter, 1);
  const end = addYears(normalizedAfter, 20);
  const anchored = {
    ...clonePlain(recurrence),
    startDate: recurrence?.startDate || normalizedAfter
  };
  return generateRecurrenceDates(
    anchored,
    parseDateOnly(start),
    parseDateOnly(end)
  )
    .map(formatDateOnly)
    .find((date) => date > normalizedAfter) || null;
}

function hasProtectedOccurrenceEvidence(occurrence) {
  const status = statusName(occurrence);
  return (
    status === 'actual' ||
    status === 'skipped' ||
    Number(occurrence?.actualSnapshotVersion) === 1 ||
    Number(occurrence?.baselineSnapshotVersion) === 1 ||
    (
      occurrence?.baselineAmount !== null &&
      occurrence?.baselineAmount !== undefined &&
      occurrence?.baselineAmount !== ''
    )
  );
}

function collectSplitGroupLineageIds(scenario, sourceGroupId) {
  const normalizedSourceGroupId = String(sourceGroupId || '').trim();
  if (!normalizedSourceGroupId) return new Set();

  const sets = Array.isArray(scenario?.splitTransactionSets)
    ? scenario.splitTransactionSets
    : [];
  const sourceSet = sets.find(
    (set) => String(set?.id || '').trim() === normalizedSourceGroupId
  ) || null;
  const rootGroupId = String(
    sourceSet?.seriesRootId || normalizedSourceGroupId
  ).trim();
  const groupIds = new Set([normalizedSourceGroupId, rootGroupId]);

  let changed = true;
  while (changed) {
    changed = false;
    sets.forEach((set) => {
      const id = String(set?.id || '').trim();
      const root = String(set?.seriesRootId || '').trim();
      const supersedes = String(set?.supersedesTransactionGroupId || '').trim();
      if (
        !id ||
        !(
          groupIds.has(id) ||
          (root && groupIds.has(root)) ||
          (supersedes && groupIds.has(supersedes))
        )
      ) {
        return;
      }
      for (const candidate of [id, root, supersedes]) {
        if (candidate && !groupIds.has(candidate)) {
          groupIds.add(candidate);
          changed = true;
        }
      }
    });
  }
  return groupIds;
}

function boundRecurringRuleBefore(rule, boundary, timestamp) {
  const segmentStart = normalizeDate(ruleStartDate(rule), 'rule startDate');
  if (segmentStart >= boundary) return null;

  const currentEnd = rule?.activeTo || rule?.recurrence?.endDate || null;
  if (currentEnd && currentEnd < boundary) return rule;
  return applyRulePatch(
    rule,
    {},
    timestamp,
    { endDate: addDays(boundary, -1) }
  );
}

function boundSplitSetBefore(set, boundary, timestamp) {
  const segmentStart = normalizeDate(
    set?.activeFrom || set?.recurrence?.startDate || set?.effectiveDate,
    'split set startDate'
  );
  if (segmentStart >= boundary) return null;

  const currentEnd = set?.activeTo || set?.recurrence?.endDate || null;
  if (currentEnd && currentEnd < boundary) return set;
  const endDate = addDays(boundary, -1);
  return {
    ...clonePlain(set),
    recurrence: set?.recurrence
      ? { ...clonePlain(set.recurrence), endDate }
      : set?.recurrence,
    components: (set?.components || []).map((component) => ({
      ...clonePlain(component),
      recurrence: component?.recurrence
        ? { ...clonePlain(component.recurrence), endDate }
        : component?.recurrence
    })),
    activeTo: endDate,
    updatedAt: timestamp
  };
}

async function runCommand(scenarioId, reason, mutate) {
  const timestamp = new Date().toISOString();
  let metadata = {};
  const data = await DataStore.transaction(async (appData) => {
    const scenario = findScenarioOrThrow(appData, scenarioId);
    metadata = (await mutate(scenario, timestamp)) || {};
    markProjectionStale(scenario, reason, timestamp);
    return appData;
  });
  dispatchPlanChanged(scenarioId);

  const scenario = findScenarioOrThrow(data, scenarioId);
  const occurrence = metadata.occurrenceKey
    ? scenario.transactionOccurrences.find(
      (candidate) => candidate.occurrenceKey === metadata.occurrenceKey
    ) || null
    : null;
  return {
    data,
    scenario,
    ...(occurrence ? { occurrence } : {}),
    ...metadata
  };
}

export async function updateOccurrenceOnly(
  scenarioId,
  occurrenceKey,
  updates = {}
) {
  return runCommand(
    scenarioId,
    'Occurrence plan changed',
    (scenario, timestamp) => {
      const { occurrence, storedOccurrence } = resolveOccurrenceOrThrow(
        scenario,
        occurrenceKey
      );
      if (occurrence.status === 'actual') {
        throw new OccurrenceCommandError(
          'invalid-status-transition',
          'Actual history can only be changed through markActual.'
        );
      }
      const patch = normalizeOccurrencePlanPatch(updates);
      if (
        markerContainsDate(scenario, occurrence.scheduledDate) &&
        (storedOccurrence?.baselineAmount === null ||
          storedOccurrence?.baselineAmount === undefined)
      ) {
        patch.baselineAmount = storedOccurrence ? occurrence.plannedAmount : 0;
        Object.assign(patch, snapshotBaselineMetadata(occurrence));
      }
      if (!hasOwn(patch, 'status')) patch.status = occurrence.status;
      patch.isOverride = true;
      upsertOccurrence(scenario, occurrence, patch, timestamp, { isOverride: true });
      return { occurrenceKey };
    }
  );
}

export async function updateThisAndFuture(
  scenarioId,
  occurrenceKey,
  updates = {},
  _options = {}
) {
  return runCommand(
    scenarioId,
    'Recurring series changed from an occurrence forward',
    (scenario, timestamp) => {
      const { occurrence } = resolveOccurrenceOrThrow(scenario, occurrenceKey);
      const result = splitSeriesAtOccurrence(
        scenario,
        occurrence,
        updates,
        timestamp
      );
      return {
        occurrenceKey: result.occurrenceKey,
        affectedOccurrenceKeys: [occurrenceKey, result.occurrenceKey],
        createdTransactionIds: result.createdTransactionIds
      };
    }
  );
}

export async function updateEntireSeries(
  scenarioId,
  occurrenceKey,
  updates = {},
  _options = {}
) {
  return runCommand(
    scenarioId,
    'Current and future recurring series segments changed',
    (scenario, timestamp) => {
      const { occurrence } = resolveOccurrenceOrThrow(scenario, occurrenceKey);
      const boundary = occurrence.scheduledDate;
      const result = splitSeriesAtOccurrence(
        scenario,
        occurrence,
        updates,
        timestamp
      );
      applyChangesToFutureSegments(
        scenario,
        result.seriesRootId,
        boundary,
        normalizeRuleUpdates(updates),
        result.createdTransactionIds,
        timestamp,
        occurrence.transactionGroupRole
      );
      return {
        occurrenceKey: result.occurrenceKey,
        affectedOccurrenceKeys: [occurrenceKey, result.occurrenceKey],
        createdTransactionIds: result.createdTransactionIds
      };
    }
  );
}

export async function endSeries(scenarioId, occurrenceKey) {
  return runCommand(
    scenarioId,
    'Recurring series ended',
    (scenario, timestamp) => {
      const { occurrence } = resolveOccurrenceOrThrow(scenario, occurrenceKey);
      const sourceRule = (scenario.transactions || []).find(
        (rule) => Number(rule?.id) === Number(occurrence?.sourceTransactionId)
      ) || null;
      if (!sourceRule || !isRecurringRule(sourceRule)) {
        throw new OccurrenceCommandError(
          'recurring-rule-required',
          'End Series requires an occurrence generated by a recurring rule.'
        );
      }
      if (occurrence.status !== 'planned') {
        throw new OccurrenceCommandError(
          'actual-history-protected',
          'End Series must start from an unresolved planned occurrence.'
        );
      }

      const boundary = normalizeDate(
        occurrence.scheduledDate,
        'scheduledDate'
      );
      const sourceGroupId = String(sourceRule?.transactionGroupId || '').trim();
      const affectedGroupIds = sourceGroupId
        ? collectSplitGroupLineageIds(scenario, sourceGroupId)
        : new Set();
      const rootId = Number(sourceRule?.seriesRootId || sourceRule?.id);
      const affectedRules = (scenario.transactions || []).filter((rule) => {
        if (sourceGroupId) {
          return affectedGroupIds.has(
            String(rule?.transactionGroupId || '').trim()
          );
        }
        return Number(rule?.seriesRootId || rule?.id) === rootId;
      });
      const affectedSourceIds = new Set(
        affectedRules.map((rule) => Number(rule?.id))
      );

      const protectedFuture = (scenario.transactionOccurrences || []).filter(
        (storedOccurrence) => (
          affectedSourceIds.has(Number(storedOccurrence?.sourceTransactionId)) &&
          storedOccurrence?.scheduledDate >= boundary &&
          hasProtectedOccurrenceEvidence(storedOccurrence)
        )
      );
      if (protectedFuture.length) {
        throw new OccurrenceCommandError(
          'series-history-conflict',
          'The series cannot end before actual, skipped, or frozen occurrence history.',
          {
            boundary,
            occurrenceKeys: protectedFuture.map(
              (storedOccurrence) => storedOccurrence?.occurrenceKey
            )
          }
        );
      }

      const removedTransactionIds = [];
      scenario.transactions = (scenario.transactions || []).flatMap((rule) => {
        if (!affectedSourceIds.has(Number(rule?.id))) return [rule];
        const bounded = boundRecurringRuleBefore(rule, boundary, timestamp);
        if (!bounded) {
          removedTransactionIds.push(Number(rule.id));
          return [];
        }
        return [bounded];
      });

      const removedTransactionGroupIds = [];
      if (sourceGroupId) {
        scenario.splitTransactionSets = (
          scenario.splitTransactionSets || []
        ).flatMap((set) => {
          const groupId = String(set?.id || '').trim();
          if (!affectedGroupIds.has(groupId)) return [set];
          const bounded = boundSplitSetBefore(set, boundary, timestamp);
          if (!bounded) {
            removedTransactionGroupIds.push(groupId);
            return [];
          }
          return [bounded];
        });
      }

      const removedOccurrenceKeys = [];
      scenario.transactionOccurrences = (
        scenario.transactionOccurrences || []
      ).filter((storedOccurrence) => {
        const remove = (
          affectedSourceIds.has(Number(storedOccurrence?.sourceTransactionId)) &&
          storedOccurrence?.scheduledDate >= boundary
        );
        if (remove) {
          removedOccurrenceKeys.push(storedOccurrence?.occurrenceKey);
        }
        return !remove;
      });

      return {
        occurrenceKey,
        boundary,
        endedOn: addDays(boundary, -1),
        affectedTransactionIds: [...affectedSourceIds],
        affectedTransactionGroupIds: [...affectedGroupIds],
        removedTransactionIds,
        removedTransactionGroupIds,
        removedOccurrenceKeys
      };
    }
  );
}

export async function updateSplitSeries(
  scenarioId,
  occurrenceKey,
  {
    scope = 'future',
    setUpdates = {},
    componentUpdates = []
  } = {}
) {
  const normalizedScope = String(scope || '').trim().toLowerCase();
  if (normalizedScope !== 'future' && normalizedScope !== 'series') {
    throw new OccurrenceCommandError(
      'invalid-series-scope',
      'Split series scope must be future or series.'
    );
  }
  const normalizedSetUpdates = normalizeSplitSetUpdates(setUpdates);
  const updatesByRole = normalizeSplitComponentUpdates(componentUpdates);

  return runCommand(
    scenarioId,
    normalizedScope === 'series'
      ? 'Entire recurring split series changed'
      : 'Recurring split series changed from an occurrence forward',
    (scenario, timestamp) => {
      const { occurrence } = resolveOccurrenceOrThrow(scenario, occurrenceKey);
      const sourceRule = (scenario.transactions || []).find(
        (rule) => Number(rule?.id) === Number(occurrence?.sourceTransactionId)
      ) || null;
      const sourceGroupId = String(sourceRule?.transactionGroupId || '').trim();
      if (!sourceGroupId || !sourceRule || !isRecurringRule(sourceRule)) {
        throw new OccurrenceCommandError(
          'recurring-split-required',
          'updateSplitSeries requires a planned recurring split occurrence.'
        );
      }
      if (occurrence.status !== 'planned') {
        throw new OccurrenceCommandError(
          'actual-history-protected',
          'Split series edits can only start from an unresolved planned occurrence.'
        );
      }
      const sourceSet = (scenario.splitTransactionSets || []).find(
        (set) => String(set?.id || '').trim() === sourceGroupId
      );
      if (!sourceSet) {
        throw new OccurrenceCommandError(
          'split-set-not-found',
          `Split transaction set ${sourceGroupId} was not found.`
        );
      }

      const targetRole = normalizeRole(occurrence.transactionGroupRole);
      const targetRoleUpdates = updatesByRole.get(targetRole) || {};
      const boundaryUpdates = {
        ...targetRoleUpdates,
        ...(hasOwn(normalizedSetUpdates, 'payingAccountId')
          ? { primaryAccountId: normalizedSetUpdates.payingAccountId }
          : {}),
        ...(hasOwn(normalizedSetUpdates, 'recurrence')
          ? { recurrence: normalizedSetUpdates.recurrence }
          : {}),
        ...(hasOwn(normalizedSetUpdates, 'tags')
          ? { tags: normalizedSetUpdates.tags }
          : {})
      };
      const result = splitSeriesAtOccurrence(
        scenario,
        occurrence,
        boundaryUpdates,
        timestamp
      );
      const replacementKey = parseLinkedOccurrenceKey(result.occurrenceKey);
      const replacementRule = (scenario.transactions || []).find(
        (rule) =>
          Number(rule?.id) === Number(replacementKey?.sourceTransactionId)
      ) || null;
      const replacementGroupId = String(
        replacementRule?.transactionGroupId || ''
      ).trim();
      if (!replacementGroupId) {
        throw new OccurrenceCommandError(
          'split-set-not-found',
          'The replacement split transaction set could not be resolved.'
        );
      }

      const replacementSet = (scenario.splitTransactionSets || []).find(
        (set) => String(set?.id || '').trim() === replacementGroupId
      ) || null;
      const availableRoles = new Set(
        (replacementSet?.components || []).map((component) =>
          normalizeRole(component?.role)
        )
      );
      const missingRoles = [...updatesByRole.keys()].filter(
        (role) => !availableRoles.has(role)
      );
      if (missingRoles.length) {
        throw new OccurrenceCommandError(
          'split-component-not-found',
          `Split component role${missingRoles.length === 1 ? '' : 's'} ` +
          `${missingRoles.join(', ')} were not found.`,
          { roles: missingRoles }
        );
      }

      const affectedGroupIds = new Set([replacementGroupId]);
      if (normalizedScope === 'series') {
        (scenario.transactions || []).forEach((rule) => {
          const rootId = Number(rule?.seriesRootId || rule?.id);
          const startDate = ruleStartDate(rule);
          const groupId = String(rule?.transactionGroupId || '').trim();
          if (
            rootId === Number(result.seriesRootId) &&
            startDate &&
            startDate >= occurrence.scheduledDate &&
            groupId
          ) {
            affectedGroupIds.add(groupId);
          }
        });
      }

      applySplitUpdatesToGroups(
        scenario,
        affectedGroupIds,
        updatesByRole,
        normalizedSetUpdates,
        timestamp
      );
      return {
        occurrenceKey: result.occurrenceKey,
        affectedOccurrenceKeys: [occurrenceKey, result.occurrenceKey],
        affectedTransactionGroupIds: [...affectedGroupIds],
        createdTransactionIds: result.createdTransactionIds,
        scope: normalizedScope
      };
    }
  );
}

export async function markActual(
  scenarioId,
  occurrenceKey,
  {
    actualAmount,
    actualDate,
    period = null
  } = {}
) {
  return runCommand(
    scenarioId,
    'Occurrence marked actual',
    (scenario, timestamp) => {
      let target = resolveOccurrenceOrThrow(scenario, occurrenceKey).occurrence;
      if (target.status === 'skipped') {
        throw new OccurrenceCommandError(
          'invalid-status-transition',
          'A skipped occurrence must be restored before it can be marked actual.'
        );
      }
      const baselinePeriod = normalizePeriod(
        period || findBaselinePeriodContainingDate(scenario, target.scheduledDate),
        target.scheduledDate
      );
      if (!isDateInPeriod(target.scheduledDate, baselinePeriod)) {
        throw new OccurrenceCommandError(
          'invalid-period',
          'The baseline period must contain the occurrence scheduled date.'
        );
      }
      freezePeriodInScenario(scenario, baselinePeriod, timestamp);
      target = resolveOccurrenceOrThrow(scenario, occurrenceKey).occurrence;

      const resolvedActualAmount =
        actualAmount === null || actualAmount === undefined || actualAmount === ''
          ? absoluteAmount(target.plannedAmount, 'plannedAmount')
          : absoluteAmount(actualAmount, 'actualAmount');
      const resolvedActualDate = actualDate
        ? normalizeDate(actualDate, 'actualDate')
        : (target.plannedDate || target.scheduledDate);
      const baselineAmount =
        markerContainsDate(scenario, target.scheduledDate) &&
        target.baselineState !== 'stored'
          ? 0
          : target.baselineAmount === null || target.baselineAmount === undefined
          ? absoluteAmount(target.plannedAmount, 'plannedAmount')
          : absoluteAmount(target.baselineAmount, 'baselineAmount');

      upsertOccurrence(
        scenario,
        target,
        {
          ...snapshotOccurrenceMetadata(target),
          plannedAmount: absoluteAmount(target.plannedAmount, 'plannedAmount'),
          baselineAmount,
          actualAmount: resolvedActualAmount,
          actualDate: resolvedActualDate,
          status: 'actual',
          isOverride: true
        },
        timestamp,
        { isOverride: true }
      );
      return { occurrenceKey, baselinePeriod };
    }
  );
}

export async function markSkipped(scenarioId, occurrenceKey) {
  return runCommand(
    scenarioId,
    'Occurrence marked skipped',
    (scenario, timestamp) => {
      const { occurrence } = resolveOccurrenceOrThrow(scenario, occurrenceKey);
      if (occurrence.status === 'actual') {
        throw new OccurrenceCommandError(
          'actual-history-protected',
          'An actual occurrence cannot be marked skipped.'
        );
      }
      upsertOccurrence(
        scenario,
        occurrence,
        {
          ...snapshotBaselineMetadata(occurrence),
          plannedAmount: absoluteAmount(occurrence.plannedAmount, 'plannedAmount'),
          baselineAmount:
            markerContainsDate(scenario, occurrence.scheduledDate) &&
            occurrence.baselineState !== 'stored'
              ? 0
              : absoluteAmount(
                occurrence.baselineAmount ?? occurrence.plannedAmount,
                'baselineAmount'
              ),
          actualAmount: null,
          actualDate: null,
          status: 'skipped',
          isOverride: true
        },
        timestamp,
        { isOverride: true }
      );
      return { occurrenceKey };
    }
  );
}

export async function rescheduleOccurrence(
  scenarioId,
  occurrenceKey,
  plannedDate
) {
  return updateOccurrenceOnly(scenarioId, occurrenceKey, {
    plannedDate: normalizeDate(plannedDate, 'plannedDate', { nullable: true })
  });
}

export async function createManualOccurrence(scenarioId, payload = {}) {
  return runCommand(
    scenarioId,
    'Manual occurrence created',
    (scenario, timestamp) => {
      const status = String(payload.status || 'planned').trim().toLowerCase();
      if (!VALID_STATUSES.has(status) || status === 'skipped') {
        throw new OccurrenceCommandError(
          'invalid-status',
          'A manual occurrence must be created as planned or actual.'
        );
      }
      const scheduledDate = normalizeDate(
        payload.scheduledDate ||
          payload.occurrenceDate ||
          payload.date ||
          payload.plannedDate ||
          payload.actualDate,
        'scheduledDate'
      );
      const movement = validateMovement(scenario, payload);
      const id = allocateNextId(scenario.transactionOccurrences);
      const occurrenceKey = `occurrence:${id}`;
      let baselineAmount = null;
      let plannedAmount;
      let actualAmount = null;
      let actualDate = null;

      if (status === 'actual') {
        const baselinePeriod = normalizePeriod(
          payload.baselinePeriod ||
            findBaselinePeriodContainingDate(scenario, scheduledDate),
          scheduledDate
        );
        freezePeriodInScenario(scenario, baselinePeriod, timestamp);
        plannedAmount = 0;
        baselineAmount = 0;
        actualAmount = absoluteAmount(
          payload.actualAmount ?? payload.amount ?? payload.plannedAmount,
          'actualAmount'
        );
        actualDate = normalizeDate(
          payload.actualDate || scheduledDate,
          'actualDate'
        );
      } else {
        plannedAmount = absoluteAmount(
          payload.plannedAmount ?? payload.amount,
          'plannedAmount'
        );
        if (markerContainsDate(scenario, scheduledDate)) baselineAmount = 0;
      }

      const record = {
        id,
        sourceTransactionId: null,
        occurrenceKey,
        scheduledDate,
        plannedDate:
          status === 'planned'
            ? normalizeDate(payload.plannedDate, 'plannedDate', { nullable: true })
            : null,
        actualDate,
        baselineAmount,
        plannedAmount,
        actualAmount,
        status,
        origin: 'manual',
        actualSnapshotVersion: status === 'actual' ? 1 : null,
        baselinePrimaryAccountId:
          baselineAmount === null ? null : movement.primaryAccountId,
        baselineSecondaryAccountId:
          baselineAmount === null ? null : movement.secondaryAccountId,
        baselineTransactionTypeId:
          baselineAmount === null ? null : movement.transactionTypeId,
        baselineSnapshotVersion: baselineAmount === null ? null : 1,
        primaryAccountId: movement.primaryAccountId,
        secondaryAccountId: movement.secondaryAccountId,
        transactionTypeId: movement.transactionTypeId,
        description: String(payload.description || '').trim(),
        tags: Array.isArray(payload.tags) ? [...payload.tags] : [],
        transactionGroupId: payload.transactionGroupId ?? null,
        transactionGroupRole:
          normalizeRole(payload.transactionGroupRole) || null,
        transactionGroupAccountGroupId: positiveId(
          payload.transactionGroupAccountGroupId,
          'transactionGroupAccountGroupId',
          { nullable: true }
        ),
        capitalAmount: absoluteAmount(
          payload.capitalAmount,
          'capitalAmount',
          { nullable: true }
        ),
        interestAmount: absoluteAmount(
          payload.interestAmount,
          'interestAmount',
          { nullable: true }
        ),
        isOverride: true,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      scenario.transactionOccurrences.push(record);
      return { occurrenceKey };
    }
  );
}

export async function promoteOccurrenceToRecurring(
  scenarioId,
  occurrenceKey,
  {
    recurrence,
    firstOccurrenceDate = null,
    ruleUpdates = {}
  } = {}
) {
  return runCommand(
    scenarioId,
    'Manual occurrence promoted to a recurring rule',
    (scenario, timestamp) => {
      const { occurrence } = resolveOccurrenceOrThrow(scenario, occurrenceKey);
      if (occurrence.sourceTransactionId !== null &&
          occurrence.sourceTransactionId !== undefined) {
        throw new OccurrenceCommandError(
          'manual-occurrence-required',
          'Only a manual occurrence can be promoted to a recurring rule.'
        );
      }
      const existingPromotedRule = (scenario.transactions || []).find(
        (transaction) =>
          String(transaction?.promotedFromOccurrenceKey || '') === String(occurrenceKey)
      );
      if (existingPromotedRule) {
        throw new OccurrenceCommandError(
          'occurrence-already-promoted',
          'This item already has a recurring rule.',
          { transactionId: existingPromotedRule.id }
        );
      }
      if (!recurrence || recurrenceTypeId(recurrence) === 1) {
        throw new OccurrenceCommandError(
          'recurring-rule-required',
          'Choose a recurring pattern before promoting the occurrence.'
        );
      }
      if (occurrence.transactionGroupId) {
        throw new OccurrenceCommandError(
          'split-promotion-not-supported',
          'Promote split movements from the recurring split editor.'
        );
      }

      const afterDate =
        occurrence.actualDate ||
        occurrence.plannedDate ||
        occurrence.scheduledDate;
      const nextDate = firstOccurrenceDate
        ? normalizeDate(firstOccurrenceDate, 'firstOccurrenceDate')
        : nextRecurrenceDate(recurrence, afterDate);
      if (!nextDate || nextDate <= afterDate) {
        throw new OccurrenceCommandError(
          'future-recurrence-required',
          'The recurring rule must start on the next occurrence after the current item.'
        );
      }

      const normalizedRecurrence = {
        ...clonePlain(recurrence),
        startDate: nextDate
      };
      if (
        normalizedRecurrence.endDate &&
        normalizeDate(normalizedRecurrence.endDate, 'recurrence.endDate') < nextDate
      ) {
        throw new OccurrenceCommandError(
          'invalid-recurrence',
          'The recurrence end date must be on or after its first occurrence.'
        );
      }

      const updates = normalizeRuleUpdates(ruleUpdates);
      delete updates.recurrence;
      const id = allocateNextId(scenario.transactions);
      const amount = hasOwn(updates, 'amount')
        ? updates.amount
        : absoluteAmount(
          occurrence.status === 'actual'
            ? occurrence.actualAmount
            : occurrence.plannedAmount,
          'amount'
        );
      const movement = validateMovement(scenario, {
        primaryAccountId: updates.primaryAccountId ?? occurrence.primaryAccountId,
        secondaryAccountId:
          hasOwn(updates, 'secondaryAccountId')
            ? updates.secondaryAccountId
            : occurrence.secondaryAccountId,
        transactionTypeId: updates.transactionTypeId ?? occurrence.transactionTypeId
      });
      const rule = {
        id,
        primaryAccountId: movement.primaryAccountId,
        secondaryAccountId: movement.secondaryAccountId,
        transactionTypeId: movement.transactionTypeId,
        amount,
        effectiveDate: nextDate,
        description:
          hasOwn(updates, 'description')
            ? updates.description
            : String(occurrence.description || '').trim(),
        recurrence: normalizedRecurrence,
        periodicChange:
          hasOwn(updates, 'periodicChange')
            ? clonePlain(updates.periodicChange)
            : clonePlain(occurrence.periodicChange || null),
        status: { name: 'planned', actualAmount: null, actualDate: null },
        tags:
          hasOwn(updates, 'tags')
            ? [...updates.tags]
            : (Array.isArray(occurrence.tags) ? [...occurrence.tags] : []),
        transactionGroupId: null,
        transactionGroupRole: null,
        transactionGroupAccountGroupId: null,
        seriesRootId: id,
        supersedesTransactionId: null,
        activeFrom: nextDate,
        activeTo: normalizedRecurrence.endDate || null,
        promotedFromOccurrenceKey: occurrenceKey,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      scenario.transactions.push(rule);
      return {
        occurrenceKey,
        createdTransactionIds: [id]
      };
    }
  );
}

export async function freezePeriodBaseline(scenarioId, rawPeriod) {
  return runCommand(
    scenarioId,
    'Period baseline frozen',
    (scenario, timestamp) => {
      const result = freezePeriodInScenario(scenario, rawPeriod, timestamp);
      return {
        baselinePeriod: result.period,
        affectedOccurrenceKeys: result.affectedOccurrenceKeys
      };
    }
  );
}
