// resolve-scenario-occurrences.js
// Canonical query for schemaVersion 44 planning rules and stored transaction
// occurrences. This module is pure: it never mutates scenario data.

import { calculatePeriodicChange } from '../calculations/calculation-engine.js';
import { expandPeriodicChangeForCalculation } from '../calculations/periodic-change-utils.js';
import { expandTransactions } from '../calculations/transaction-expander.js';
import { parseDateOnly } from '../../shared/date-utils.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAYS_PER_YEAR = 365.25;
const VALID_STATUSES = new Set(['planned', 'actual', 'skipped']);

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

function statusName(entry, fallback = 'planned') {
  const raw = typeof entry?.status === 'object' ? entry?.status?.name : entry?.status;
  const normalized = String(raw || fallback).trim().toLowerCase();
  return VALID_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSourceId(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value).trim() || null;
}

function isOneTimeRecurrence(recurrence) {
  if (!recurrence) return true;
  const rawType = recurrence?.recurrenceType ?? recurrence?.recurrenceTypeId ?? null;
  const typeId = typeof rawType === 'object' ? Number(rawType?.id) : Number(rawType);
  return typeId === 1;
}

function toLocalDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) return null;
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function normalizeDate(value) {
  if (value instanceof Date) return toLocalDateKey(value);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = parseDateOnly(value);
  return toLocalDateKey(parsed) === value ? value : null;
}

function requireWindowDate(value, field) {
  const normalized = normalizeDate(value);
  if (!normalized) {
    throw new TypeError(`${field} must be a valid YYYY-MM-DD date`);
  }
  return normalized;
}

function absoluteAmount(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.abs(number) : fallback;
}

export function createLinkedOccurrenceKey(sourceTransactionId, scheduledDate, role = '') {
  const sourceId = normalizeSourceId(sourceTransactionId);
  if (!sourceId || !scheduledDate) return null;
  return `tx:${sourceId}|date:${scheduledDate}|role:${normalizeRole(role) || 'none'}`;
}

function manualOccurrenceKey(occurrence, index) {
  const id = occurrence?.id;
  return `occurrence:${id !== null && id !== undefined && id !== '' ? id : `index-${index}`}`;
}

function calendarDayDifference(start, end) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return (endUtc - startUtc) / MS_PER_DAY;
}

function toSplitGroupId(value) {
  return String(value || '').trim();
}

function getComponentAccountId(component) {
  return Number(component?.secondaryAccountId ?? component?.accountId ?? 0) || null;
}

function getComponentAmount(component) {
  return absoluteAmount(component?.amount ?? component?.value ?? 0);
}

function isDateInFrozenBaselinePeriod(scenario, dateKey) {
  if (!dateKey) return false;
  return (scenario?.baselinePeriods || []).some((period) => {
    const startDate = normalizeDate(period?.startDate);
    const endDate = normalizeDate(period?.endDate);
    return Boolean(startDate && endDate && dateKey >= startDate && dateKey <= endDate);
  });
}

/**
 * Normalize split sets into projection-safe rule components. A split set
 * replaces its stored component rows so totals are never counted twice.
 */
export function normalizeScenarioTransactionRules(transactions = [], splitSets = []) {
  const plannedTransactions = (Array.isArray(transactions) ? transactions : [])
    .filter((transaction) => statusName(transaction) === 'planned');

  const splitSetById = new Map(
    (Array.isArray(splitSets) ? splitSets : [])
      .map((set) => [toSplitGroupId(set?.id), set])
      .filter(([id]) => Boolean(id))
  );

  if (!splitSetById.size) return plannedTransactions.map((transaction) => ({ ...transaction }));

  const transactionsByGroupId = new Map();
  plannedTransactions.forEach((transaction) => {
    const groupId = toSplitGroupId(transaction?.transactionGroupId);
    if (!groupId) return;
    if (!transactionsByGroupId.has(groupId)) transactionsByGroupId.set(groupId, []);
    transactionsByGroupId.get(groupId).push(transaction);
  });

  const normalized = plannedTransactions
    .filter((transaction) => {
      const groupId = toSplitGroupId(transaction?.transactionGroupId);
      return !groupId || !splitSetById.has(groupId);
    })
    .map((transaction) => ({ ...transaction }));

  splitSetById.forEach((set, groupId) => {
    const groupTransactions = transactionsByGroupId.get(groupId) || [];
    const firstTransaction = groupTransactions[0] || {};
    const primaryAccountId = Number(set?.payingAccountId || firstTransaction?.primaryAccountId || 0) || null;
    if (!primaryAccountId) return;

    const components = Array.isArray(set?.components) ? set.components : [];
    components.forEach((component, index) => {
      const secondaryAccountId = getComponentAccountId(component);
      const amount = getComponentAmount(component);
      if (!secondaryAccountId || amount <= 0) return;

      const role = normalizeRole(component?.role || `component_${index + 1}`);
      const matchedTransaction =
        groupTransactions.find(
          (transaction) => normalizeRole(transaction?.transactionGroupRole) === role
        ) || null;
      const sourceTransaction = matchedTransaction || firstTransaction;

      normalized.push({
        ...sourceTransaction,
        id: sourceTransaction?.id ?? `${groupId}:${role}:${index}`,
        primaryAccountId,
        secondaryAccountId,
        transactionTypeId:
          Number(component?.transactionTypeId || sourceTransaction?.transactionTypeId || 2) === 1
            ? 1
            : 2,
        amount,
        description: String(
          component?.description || sourceTransaction?.description || set?.description || ''
        ).trim(),
        recurrence: component?.recurrence || set?.recurrence || sourceTransaction?.recurrence || null,
        periodicChange: component?.periodicChange || sourceTransaction?.periodicChange || null,
        effectiveDate: sourceTransaction?.effectiveDate || set?.effectiveDate || null,
        status: sourceTransaction?.status || { name: 'planned' },
        tags: Array.isArray(sourceTransaction?.tags)
          ? [...sourceTransaction.tags]
          : (Array.isArray(set?.tags) ? [...set.tags] : []),
        transactionGroupId: groupId,
        transactionGroupRole: role,
        transactionGroupAccountGroupId:
          Number(component?.accountGroupId || sourceTransaction?.transactionGroupAccountGroupId || 0) ||
          null,
        capitalAmount: component?.capitalAmount ?? matchedTransaction?.capitalAmount ?? null,
        interestAmount: component?.interestAmount ?? matchedTransaction?.interestAmount ?? null
      });
    });
  });

  return normalized;
}

function calculateGeneratedAmount(transaction, occurrenceDate, windowStartDate, lookupData) {
  const baseAmount = absoluteAmount(transaction?.amount);
  if (!transaction?.periodicChange) return baseAmount;

  const periodicChange = lookupData
    ? expandPeriodicChangeForCalculation(transaction.periodicChange, lookupData)
    : transaction.periodicChange;
  if (!periodicChange) return baseAmount;

  const anchorDateKey =
    normalizeDate(transaction?.recurrence?.startDate) ||
    normalizeDate(transaction?.effectiveDate) ||
    normalizeDate(occurrenceDate);
  const anchorDate = anchorDateKey ? parseDateOnly(anchorDateKey) : windowStartDate;
  const elapsedYears = calendarDayDifference(anchorDate, occurrenceDate) / DAYS_PER_YEAR;
  return absoluteAmount(calculatePeriodicChange(baseAmount, periodicChange, elapsedYears), baseAmount);
}

function buildGeneratedOccurrences({ scenario, startDate, endDate, lookupData }) {
  const rules = normalizeScenarioTransactionRules(
    scenario?.transactions || [],
    scenario?.splitTransactionSets || []
  );
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  const expanded = expandTransactions(rules, start, end, scenario?.accounts || []);

  return expanded.flatMap((transaction) => {
    const occurrenceDate = transaction?._occurrenceDate || parseDateOnly(transaction?.effectiveDate);
    const scheduledDate = normalizeDate(occurrenceDate);
    if (!scheduledDate) return [];

    const role = normalizeRole(transaction?.transactionGroupRole);
    const occurrenceKey = createLinkedOccurrenceKey(transaction?.id, scheduledDate, role);
    const generatedAmount = calculateGeneratedAmount(transaction, occurrenceDate, start, lookupData);
    const introducedAfterBaseline = isDateInFrozenBaselinePeriod(scenario, scheduledDate);

    return [{
      id: occurrenceKey,
      occurrenceKey,
      sourceTransactionId: transaction?.id ?? null,
      sourceOccurrenceId: null,
      sourceOccurrenceIds: [],
      origin: 'generated',
      hasStoredOverride: false,
      primaryAccountId: transaction?.primaryAccountId ?? null,
      secondaryAccountId: transaction?.secondaryAccountId ?? null,
      transactionTypeId: Number(transaction?.transactionTypeId) === 1 ? 1 : 2,
      transactionGroupId: transaction?.transactionGroupId ?? null,
      transactionGroupRole: role || null,
      transactionGroupAccountGroupId: transaction?.transactionGroupAccountGroupId ?? null,
      capitalAmount: transaction?.capitalAmount ?? null,
      interestAmount: transaction?.interestAmount ?? null,
      description: transaction?.description || '',
      tags: Array.isArray(transaction?.tags) ? [...transaction.tags] : [],
      recurrence: clonePlain(transaction?.recurrence || null),
      recurrenceDescription: transaction?.recurrenceDescription || '',
      periodicChange: clonePlain(transaction?.periodicChange || null),
      scheduledDate,
      plannedDate: null,
      actualDate: null,
      effectiveDate: scheduledDate,
      generatedAmount,
      baselineAmount: introducedAfterBaseline ? 0 : generatedAmount,
      baselinePrimaryAccountId: transaction?.primaryAccountId ?? null,
      baselineSecondaryAccountId: transaction?.secondaryAccountId ?? null,
      baselineTransactionTypeId:
        Number(transaction?.transactionTypeId) === 1 ? 1 : 2,
      baselineSnapshotVersion: introducedAfterBaseline ? 1 : null,
      baselineState: introducedAfterBaseline ? 'frozen-new' : 'derived',
      plannedAmount: generatedAmount,
      actualAmount: null,
      status: 'planned'
    }];
  });
}

function isCanonicalOccurrenceCandidate(storedOccurrence) {
  return Boolean(
    storedOccurrence &&
    (
      hasOwn(storedOccurrence, 'occurrenceDate') ||
      hasOwn(storedOccurrence, 'scheduledDate') ||
      hasOwn(storedOccurrence, 'plannedDate') ||
      hasOwn(storedOccurrence, 'actualDate') ||
      hasOwn(storedOccurrence, 'sourceTransactionId') ||
      hasOwn(storedOccurrence, 'primaryAccountId') ||
      hasOwn(storedOccurrence, 'transactionTypeId') ||
      hasOwn(storedOccurrence, 'status')
    )
  );
}

function getOccurrenceActualDate(storedOccurrence) {
  const value =
    (typeof storedOccurrence?.status === 'object' ? storedOccurrence.status?.actualDate : null) ??
    storedOccurrence?.actualDate ??
    null;
  return normalizeDate(value);
}

function getOccurrenceActualAmount(storedOccurrence, fallback) {
  const value =
    (typeof storedOccurrence?.status === 'object' && hasOwn(storedOccurrence.status, 'actualAmount')
      ? storedOccurrence.status.actualAmount
      : undefined) ??
    (hasOwn(storedOccurrence, 'actualAmount') ? storedOccurrence.actualAmount : undefined);
  return value === null || value === undefined ? fallback : absoluteAmount(value);
}

function projectionValidity(occurrence, accounts) {
  const primaryAccountId = Number(occurrence?.primaryAccountId || 0);
  const transactionTypeId = Number(occurrence?.transactionTypeId || 0);
  if (!primaryAccountId || (transactionTypeId !== 1 && transactionTypeId !== 2)) return false;
  if (!occurrence?.forecastDate || !Number.isFinite(Number(occurrence?.forecastAmount))) return false;

  const accountIds = new Set(
    (Array.isArray(accounts) ? accounts : [])
      .map((account) => Number(account?.id || 0))
      .filter(Boolean)
  );
  if (!accountIds.size) return true;
  if (!accountIds.has(primaryAccountId)) return false;

  const secondaryAccountId = Number(occurrence?.secondaryAccountId || 0);
  return !secondaryAccountId || accountIds.has(secondaryAccountId);
}

function finalizeOccurrence(occurrence, { asOfDate, accounts }) {
  const status = VALID_STATUSES.has(occurrence?.status) ? occurrence.status : 'planned';
  const effectiveDate =
    status === 'actual'
      ? (occurrence.actualDate || occurrence.scheduledDate)
      : (occurrence.plannedDate || occurrence.scheduledDate);
  const isOverdue =
    status === 'planned' &&
    Boolean(asOfDate && effectiveDate && effectiveDate < asOfDate);
  const forecastDate = status === 'planned' && isOverdue ? asOfDate : effectiveDate;
  const forecastAmount =
    status === 'actual'
      ? absoluteAmount(occurrence.actualAmount)
      : (status === 'skipped' ? 0 : absoluteAmount(occurrence.plannedAmount));

  const next = {
    ...occurrence,
    status,
    displayStatus: isOverdue ? 'overdue' : status,
    effectiveDate,
    forecastDate,
    isOverdue,
    forecastAmount,
    amount: status === 'actual' ? absoluteAmount(occurrence.actualAmount) : absoluteAmount(occurrence.plannedAmount)
  };
  next.validForProjection = projectionValidity(next, accounts);
  next.isIncludedInForecast = status !== 'skipped' && next.validForProjection;
  return next;
}

function buildStoredOccurrence({
  storedOccurrence,
  base,
  occurrenceKey,
  sourceOccurrenceIds,
  asOfDate,
  accounts
}) {
  const status = statusName(storedOccurrence);
  const usesActualSnapshot =
    status === 'actual' &&
    Number(storedOccurrence?.actualSnapshotVersion) === 1;
  const inheritsGeneratedPlan =
    Boolean(base) &&
    status === 'planned' &&
    storedOccurrence?.isOverride === false;
  const scheduledDate =
    (inheritsGeneratedPlan ? base?.scheduledDate : normalizeDate(storedOccurrence?.scheduledDate)) ||
    base?.scheduledDate ||
    normalizeDate(storedOccurrence?.occurrenceDate) ||
    null;
  const legacyOccurrenceDate = normalizeDate(storedOccurrence?.occurrenceDate);
  const plannedDate =
    inheritsGeneratedPlan
      ? null
      : (
        normalizeDate(storedOccurrence?.plannedDate) ||
        (
          base?.scheduledDate &&
          legacyOccurrenceDate &&
          legacyOccurrenceDate !== base.scheduledDate
            ? legacyOccurrenceDate
            : null
        )
      );

  const hasExplicitPlannedAmount =
    hasOwn(storedOccurrence, 'plannedAmount') &&
    storedOccurrence.plannedAmount !== null &&
    storedOccurrence.plannedAmount !== undefined &&
    storedOccurrence.plannedAmount !== '';
  const plannedAmount = inheritsGeneratedPlan
    ? absoluteAmount(base?.plannedAmount)
    : (
      hasExplicitPlannedAmount
        ? absoluteAmount(storedOccurrence.plannedAmount)
        : (hasOwn(storedOccurrence, 'amount') ? absoluteAmount(storedOccurrence.amount) : absoluteAmount(base?.plannedAmount))
    );
  const actualDate = status === 'actual'
    ? (getOccurrenceActualDate(storedOccurrence) || plannedDate || scheduledDate)
    : null;
  const actualAmount = status === 'actual'
    ? getOccurrenceActualAmount(storedOccurrence, plannedAmount)
    : null;

  const hasExplicitBaseline =
    hasOwn(storedOccurrence, 'baselineAmount') &&
    storedOccurrence.baselineAmount !== null &&
    storedOccurrence.baselineAmount !== undefined &&
    storedOccurrence.baselineAmount !== '';
  const baselineAmount = hasExplicitBaseline
    ? absoluteAmount(storedOccurrence.baselineAmount)
    : (
      inheritsGeneratedPlan
        ? absoluteAmount(base?.baselineAmount)
        : (
          hasOwn(storedOccurrence, 'amount')
            ? absoluteAmount(storedOccurrence.amount)
            : (base ? absoluteAmount(base?.baselineAmount) : plannedAmount)
        )
    );

  const sourceTransactionId = storedOccurrence?.sourceTransactionId ?? base?.sourceTransactionId ?? null;
  const primaryAccountId = usesActualSnapshot
    ? (storedOccurrence?.primaryAccountId ?? null)
    : inheritsGeneratedPlan
    ? (base?.primaryAccountId ?? null)
    : (storedOccurrence?.primaryAccountId ?? base?.primaryAccountId ?? null);
  const secondaryAccountId = usesActualSnapshot
    ? (storedOccurrence?.secondaryAccountId ?? null)
    : inheritsGeneratedPlan
    ? (base?.secondaryAccountId ?? null)
    : (storedOccurrence?.secondaryAccountId ?? base?.secondaryAccountId ?? null);
  const rawTransactionTypeId = Number(
    usesActualSnapshot
      ? storedOccurrence?.transactionTypeId
      : inheritsGeneratedPlan
      ? base?.transactionTypeId
      : (storedOccurrence?.transactionTypeId ?? base?.transactionTypeId)
  );
  const transactionTypeId =
    rawTransactionTypeId === 1 || rawTransactionTypeId === 2
      ? rawTransactionTypeId
      : null;
  const groupRole = normalizeRole(
    usesActualSnapshot
      ? storedOccurrence?.transactionGroupRole
      : inheritsGeneratedPlan
      ? base?.transactionGroupRole
      : (storedOccurrence?.transactionGroupRole ?? base?.transactionGroupRole)
  );
  const origin = storedOccurrence?.origin || (base ? base.origin : 'manual');
  const explicitManualActual =
    status === 'actual' &&
    sourceTransactionId === null &&
    hasExplicitBaseline &&
    baselineAmount === 0 &&
    hasExplicitPlannedAmount &&
    plannedAmount === 0;

  return finalizeOccurrence({
    ...(base || {}),
    id: occurrenceKey,
    occurrenceKey,
    sourceTransactionId,
    sourceOccurrenceId: storedOccurrence?.id ?? null,
    sourceOccurrenceIds,
    origin,
    actualSnapshotVersion:
      Number(storedOccurrence?.actualSnapshotVersion) === 1 ? 1 : null,
    hasStoredOverride: true,
    hasPlanOverride: !inheritsGeneratedPlan,
    primaryAccountId,
    secondaryAccountId,
    transactionTypeId,
    transactionGroupId: usesActualSnapshot
      ? (storedOccurrence?.transactionGroupId ?? null)
      : inheritsGeneratedPlan
      ? (base?.transactionGroupId ?? null)
      : (storedOccurrence?.transactionGroupId ?? base?.transactionGroupId ?? null),
    transactionGroupRole: groupRole || null,
    transactionGroupAccountGroupId:
      usesActualSnapshot
        ? (storedOccurrence?.transactionGroupAccountGroupId ?? null)
        : inheritsGeneratedPlan
        ? (base?.transactionGroupAccountGroupId ?? null)
        : (storedOccurrence?.transactionGroupAccountGroupId ?? base?.transactionGroupAccountGroupId ?? null),
    capitalAmount: usesActualSnapshot
      ? (storedOccurrence?.capitalAmount ?? null)
      : inheritsGeneratedPlan
      ? (base?.capitalAmount ?? null)
      : (storedOccurrence?.capitalAmount ?? base?.capitalAmount ?? null),
    interestAmount: usesActualSnapshot
      ? (storedOccurrence?.interestAmount ?? null)
      : inheritsGeneratedPlan
      ? (base?.interestAmount ?? null)
      : (storedOccurrence?.interestAmount ?? base?.interestAmount ?? null),
    description: usesActualSnapshot
      ? String(storedOccurrence?.description ?? '')
      : inheritsGeneratedPlan
      ? (base?.description || '')
      : (
        storedOccurrence?.description !== null &&
        storedOccurrence?.description !== undefined
          ? String(storedOccurrence.description)
          : (base?.description || '')
      ),
    tags: usesActualSnapshot
      ? (Array.isArray(storedOccurrence?.tags) ? [...storedOccurrence.tags] : [])
      : inheritsGeneratedPlan
      ? (Array.isArray(base?.tags) ? [...base.tags] : [])
      : (
        hasOwn(storedOccurrence, 'tags') && Array.isArray(storedOccurrence.tags)
          ? [...storedOccurrence.tags]
          : (Array.isArray(base?.tags) ? [...base.tags] : [])
      ),
    recurrence: clonePlain(
      usesActualSnapshot
        ? (storedOccurrence?.recurrence ?? null)
        : inheritsGeneratedPlan
        ? (base?.recurrence ?? null)
        : (storedOccurrence?.recurrence ?? base?.recurrence ?? null)
    ),
    recurrenceDescription:
      usesActualSnapshot
        ? (storedOccurrence?.recurrenceDescription ?? '')
        : inheritsGeneratedPlan
        ? (base?.recurrenceDescription ?? '')
        : (storedOccurrence?.recurrenceDescription ?? base?.recurrenceDescription ?? ''),
    periodicChange: clonePlain(
      usesActualSnapshot
        ? (storedOccurrence?.periodicChange ?? null)
        : inheritsGeneratedPlan
        ? (base?.periodicChange ?? null)
        : (storedOccurrence?.periodicChange ?? base?.periodicChange ?? null)
    ),
    scheduledDate,
    plannedDate,
    actualDate,
    generatedAmount: base?.generatedAmount ?? null,
    baselineAmount,
    baselinePrimaryAccountId:
      Number(storedOccurrence?.baselineSnapshotVersion) === 1
        ? (storedOccurrence?.baselinePrimaryAccountId ?? null)
        : (base?.baselinePrimaryAccountId ?? primaryAccountId),
    baselineSecondaryAccountId:
      Number(storedOccurrence?.baselineSnapshotVersion) === 1
        ? (storedOccurrence?.baselineSecondaryAccountId ?? null)
        : (base?.baselineSecondaryAccountId ?? secondaryAccountId),
    baselineTransactionTypeId:
      Number(storedOccurrence?.baselineSnapshotVersion) === 1
        ? (storedOccurrence?.baselineTransactionTypeId ?? null)
        : (base?.baselineTransactionTypeId ?? transactionTypeId),
    baselineSnapshotVersion:
      Number(storedOccurrence?.baselineSnapshotVersion) === 1 ? 1 : null,
    baselineState: hasExplicitBaseline
      ? 'stored'
      : (base ? 'legacy-assumed' : 'legacy-assumed'),
    plannedAmount,
    actualAmount,
    status,
    isUnplannedActual: explicitManualActual
  }, { asOfDate, accounts });
}

function overlayPriority(item) {
  const status = statusName(item?.storedOccurrence);
  if (status === 'actual') return 3;
  if (status === 'skipped') return 2;
  return 1;
}

function occurrenceSortValue(item) {
  const id = Number(item?.storedOccurrence?.id);
  return Number.isFinite(id) ? id : item.index;
}

function selectOccurrenceOverlay(group, occurrenceKey, diagnostics) {
  const sourceOccurrenceIds = group
    .map((item) => item?.storedOccurrence?.id)
    .filter((id) => id !== null && id !== undefined)
    .sort((a, b) => {
      const aNumber = Number(a);
      const bNumber = Number(b);
      if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
      return String(a).localeCompare(String(b));
    });

  if (group.length > 1) {
    diagnostics.push({
      code: 'duplicate-occurrence-overrides',
      occurrenceKey,
      sourceOccurrenceIds,
      message: `Duplicate occurrence overrides found for ${occurrenceKey}; deterministic precedence was applied.`
    });
  }

  const actualCount = group.filter((item) => statusName(item?.storedOccurrence) === 'actual').length;
  if (actualCount > 1) {
    diagnostics.push({
      code: 'conflicting-actuals',
      occurrenceKey,
      sourceOccurrenceIds,
      message: `Conflicting actual occurrence records found for ${occurrenceKey}; the highest actual ID was selected.`
    });
  }

  const selected = [...group].sort((a, b) => {
    const priorityDifference = overlayPriority(b) - overlayPriority(a);
    if (priorityDifference) return priorityDifference;
    const idDifference = occurrenceSortValue(b) - occurrenceSortValue(a);
    if (idDifference) return idDifference;
    return b.index - a.index;
  })[0];

  return { selected, sourceOccurrenceIds };
}

function buildBaseFromSourceTransaction(sourceTransaction, scheduledDate, occurrenceKey) {
  if (!sourceTransaction || !scheduledDate) return null;
  const generatedAmount = absoluteAmount(sourceTransaction?.amount);
  const role = normalizeRole(sourceTransaction?.transactionGroupRole);
  return {
    id: occurrenceKey,
    occurrenceKey,
    sourceTransactionId: sourceTransaction?.id ?? null,
    sourceOccurrenceId: null,
    sourceOccurrenceIds: [],
    origin: 'generated',
    hasStoredOverride: false,
    primaryAccountId: sourceTransaction?.primaryAccountId ?? null,
    secondaryAccountId: sourceTransaction?.secondaryAccountId ?? null,
    transactionTypeId: Number(sourceTransaction?.transactionTypeId) === 1 ? 1 : 2,
    transactionGroupId: sourceTransaction?.transactionGroupId ?? null,
    transactionGroupRole: role || null,
    transactionGroupAccountGroupId: sourceTransaction?.transactionGroupAccountGroupId ?? null,
    capitalAmount: sourceTransaction?.capitalAmount ?? null,
    interestAmount: sourceTransaction?.interestAmount ?? null,
    description: sourceTransaction?.description || '',
    tags: Array.isArray(sourceTransaction?.tags) ? [...sourceTransaction.tags] : [],
    recurrence: clonePlain(sourceTransaction?.recurrence || null),
    recurrenceDescription: sourceTransaction?.recurrenceDescription || '',
    periodicChange: clonePlain(sourceTransaction?.periodicChange || null),
    scheduledDate,
    plannedDate: null,
    actualDate: null,
    generatedAmount,
    baselineAmount: generatedAmount,
    baselinePrimaryAccountId: sourceTransaction?.primaryAccountId ?? null,
    baselineSecondaryAccountId: sourceTransaction?.secondaryAccountId ?? null,
    baselineTransactionTypeId:
      Number(sourceTransaction?.transactionTypeId) === 1 ? 1 : 2,
    baselineSnapshotVersion: null,
    baselineState: 'derived',
    plannedAmount: generatedAmount,
    actualAmount: null,
    status: 'planned'
  };
}

function buildLegacyActualOccurrence(transaction, { asOfDate, accounts }) {
  const actualDate = normalizeDate(
    (typeof transaction?.status === 'object' ? transaction.status?.actualDate : null) ??
    transaction?.actualDate ??
    transaction?.effectiveDate
  );
  const scheduledDate =
    normalizeDate(transaction?.effectiveDate) ||
    normalizeDate(transaction?.recurrence?.startDate) ||
    actualDate;
  if (!actualDate || !scheduledDate) return null;

  const plannedAmount = absoluteAmount(transaction?.amount);
  const actualAmount = getOccurrenceActualAmount(transaction, plannedAmount);
  const occurrenceKey = `actual-tx:${transaction?.id}`;

  return finalizeOccurrence({
    id: occurrenceKey,
    occurrenceKey,
    sourceTransactionId: transaction?.id ?? null,
    sourceOccurrenceId: null,
    sourceOccurrenceIds: [],
    origin: 'legacy-actual-transaction',
    hasStoredOverride: false,
    primaryAccountId: transaction?.primaryAccountId ?? null,
    secondaryAccountId: transaction?.secondaryAccountId ?? null,
    transactionTypeId: Number(transaction?.transactionTypeId) === 1 ? 1 : 2,
    transactionGroupId: transaction?.transactionGroupId ?? null,
    transactionGroupRole: normalizeRole(transaction?.transactionGroupRole) || null,
    transactionGroupAccountGroupId: transaction?.transactionGroupAccountGroupId ?? null,
    capitalAmount: transaction?.capitalAmount ?? null,
    interestAmount: transaction?.interestAmount ?? null,
    description: transaction?.description || '',
    tags: Array.isArray(transaction?.tags) ? [...transaction.tags] : [],
    recurrence: null,
    recurrenceDescription: '',
    periodicChange: null,
    scheduledDate,
    plannedDate: null,
    actualDate,
    generatedAmount: plannedAmount,
    baselineAmount: plannedAmount,
    baselinePrimaryAccountId: transaction?.primaryAccountId ?? null,
    baselineSecondaryAccountId: transaction?.secondaryAccountId ?? null,
    baselineTransactionTypeId:
      Number(transaction?.transactionTypeId) === 1 ? 1 : 2,
    baselineSnapshotVersion: null,
    baselineState: 'derived',
    plannedAmount,
    actualAmount,
    status: 'actual',
    isUnplannedActual: false
  }, { asOfDate, accounts });
}

function getSeriesRootId(sourceTransactionsById, sourceTransactionId) {
  const sourceId = normalizeSourceId(sourceTransactionId);
  if (!sourceId) return null;
  const source = sourceTransactionsById.get(sourceId);
  return normalizeSourceId(source?.seriesRootId ?? source?.id ?? sourceId);
}

function lineageOccurrenceKey(occurrence, sourceTransactionsById) {
  const seriesRootId = getSeriesRootId(
    sourceTransactionsById,
    occurrence?.sourceTransactionId
  );
  if (!seriesRootId || !occurrence?.scheduledDate) return null;
  return [
    seriesRootId,
    occurrence.scheduledDate,
    normalizeRole(occurrence?.transactionGroupRole) || 'none'
  ].join('|');
}

function suppressPlansReplacedByLineageActuals(occurrences, sourceTransactionsById) {
  const actualLineageKeys = new Set(
    occurrences
      .filter((occurrence) => occurrence?.status === 'actual')
      .map((occurrence) => lineageOccurrenceKey(occurrence, sourceTransactionsById))
      .filter(Boolean)
  );
  if (!actualLineageKeys.size) return occurrences;

  return occurrences.filter((occurrence) => {
    if (occurrence?.status !== 'planned') return true;
    const lineageKey = lineageOccurrenceKey(occurrence, sourceTransactionsById);
    return !lineageKey || !actualLineageKeys.has(lineageKey);
  });
}

/**
 * Resolve schemaVersion 44 rule definitions and stored occurrence rows into one
 * canonical occurrence timeline.
 */
export function resolveScenarioOccurrences({
  scenario,
  startDate,
  endDate,
  asOfDate = null,
  openCommitmentStartDate = null,
  lookupData = null
} = {}) {
  const normalizedStartDate = requireWindowDate(startDate, 'startDate');
  const normalizedEndDate = requireWindowDate(endDate, 'endDate');
  if (normalizedStartDate > normalizedEndDate) {
    throw new RangeError('startDate must be on or before endDate');
  }
  const normalizedAsOfDate = asOfDate === null || asOfDate === undefined
    ? null
    : requireWindowDate(asOfDate, 'asOfDate');
  const normalizedOpenCommitmentStartDate =
    openCommitmentStartDate === null || openCommitmentStartDate === undefined
      ? normalizedStartDate
      : requireWindowDate(openCommitmentStartDate, 'openCommitmentStartDate');
  if (normalizedOpenCommitmentStartDate > normalizedStartDate) {
    throw new RangeError('openCommitmentStartDate must be on or before startDate');
  }

  const accounts = scenario?.accounts || [];
  const diagnostics = [];
  const generated = buildGeneratedOccurrences({
    scenario,
    startDate: normalizedOpenCommitmentStartDate,
    endDate: normalizedEndDate,
    lookupData
  });
  const generatedByKey = new Map(generated.map((occurrence) => [occurrence.occurrenceKey, occurrence]));
  const generatedBySourceDate = new Map();
  generated.forEach((occurrence) => {
    const key = `${normalizeSourceId(occurrence.sourceTransactionId)}|${occurrence.scheduledDate}`;
    if (!generatedBySourceDate.has(key)) generatedBySourceDate.set(key, []);
    generatedBySourceDate.get(key).push(occurrence);
  });

  const sourceTransactionsById = new Map(
    (scenario?.transactions || [])
      .map((transaction) => [normalizeSourceId(transaction?.id), transaction])
      .filter(([id]) => Boolean(id))
  );
  const occurrenceGroups = new Map();
  const invalidProjectionKeys = new Set();

  (scenario?.transactionOccurrences || []).forEach((storedOccurrence, index) => {
    if (!isCanonicalOccurrenceCandidate(storedOccurrence)) {
      diagnostics.push({
        code: 'unsupported-legacy-occurrence-shape',
        sourceOccurrenceId: storedOccurrence?.id ?? null,
        message: 'Unsupported legacy occurrence shape was ignored because it is not a dated occurrence.'
      });
      return;
    }

    const explicitDateFields = [
      ['scheduledDate', storedOccurrence?.scheduledDate],
      ['occurrenceDate', storedOccurrence?.occurrenceDate],
      ['plannedDate', storedOccurrence?.plannedDate],
      ['actualDate', storedOccurrence?.actualDate],
      ['status.actualDate', typeof storedOccurrence?.status === 'object' ? storedOccurrence.status?.actualDate : null]
    ];
    const invalidDateField = explicitDateFields.find(([, value]) => (
      value !== null &&
      value !== undefined &&
      value !== '' &&
      !normalizeDate(value)
    ));
    if (invalidDateField) {
      diagnostics.push({
        code: 'invalid-occurrence-date',
        sourceOccurrenceId: storedOccurrence?.id ?? null,
        field: invalidDateField[0],
        message: `Transaction occurrence has an invalid ${invalidDateField[0]}: ${String(invalidDateField[1])}.`
      });
      return;
    }

    const sourceId = normalizeSourceId(storedOccurrence?.sourceTransactionId);
    const linkedSourceTransaction = sourceId ? sourceTransactionsById.get(sourceId) : null;
    const linkedLegacyActualDate =
      statusName(linkedSourceTransaction) === 'actual'
        ? normalizeDate(
          (typeof linkedSourceTransaction?.status === 'object'
            ? linkedSourceTransaction.status?.actualDate
            : null) ??
          linkedSourceTransaction?.actualDate ??
          linkedSourceTransaction?.effectiveDate
        )
        : null;
    const linkedLegacyActualScheduledDate =
      normalizeDate(linkedSourceTransaction?.effectiveDate) ||
      normalizeDate(linkedSourceTransaction?.recurrence?.startDate) ||
      linkedLegacyActualDate;
    const occurrenceComparisonScheduledDate =
      normalizeDate(storedOccurrence?.scheduledDate) ||
      normalizeDate(storedOccurrence?.occurrenceDate) ||
      normalizeDate(storedOccurrence?.plannedDate);
    const linkedRoleMatches =
      normalizeRole(linkedSourceTransaction?.transactionGroupRole) ===
      normalizeRole(storedOccurrence?.transactionGroupRole);
    const preservesLinkedActualComparison =
      Boolean(
        linkedLegacyActualDate &&
        linkedLegacyActualDate >= normalizedStartDate &&
        linkedLegacyActualDate <= normalizedEndDate &&
        linkedRoleMatches &&
        occurrenceComparisonScheduledDate === linkedLegacyActualScheduledDate
      );
    const explicitDates = explicitDateFields
      .map(([, value]) => normalizeDate(value))
      .filter(Boolean);
    if (
      explicitDates.length > 0 &&
      !preservesLinkedActualComparison &&
      (
        explicitDates.every((date) => date > normalizedEndDate) ||
        explicitDates.every((date) => date < normalizedOpenCommitmentStartDate)
      )
    ) {
      return;
    }

    const explicitAmountFields = [
      ['amount', storedOccurrence?.amount],
      ['plannedAmount', storedOccurrence?.plannedAmount],
      ['baselineAmount', storedOccurrence?.baselineAmount],
      ['actualAmount', storedOccurrence?.actualAmount],
      ['status.actualAmount', typeof storedOccurrence?.status === 'object' ? storedOccurrence.status?.actualAmount : null],
      ['capitalAmount', storedOccurrence?.capitalAmount],
      ['interestAmount', storedOccurrence?.interestAmount]
    ];
    const invalidAmountField = explicitAmountFields.find(([, value]) => (
      value !== null &&
      value !== undefined &&
      value !== '' &&
      !Number.isFinite(Number(value))
    ));
    if (invalidAmountField) {
      diagnostics.push({
        code: 'invalid-occurrence-amount',
        sourceOccurrenceId: storedOccurrence?.id ?? null,
        field: invalidAmountField[0],
        message: `Transaction occurrence has an invalid ${invalidAmountField[0]} amount.`
      });
      return;
    }

    const rawScheduledDate =
      storedOccurrence?.scheduledDate ??
      storedOccurrence?.occurrenceDate ??
      storedOccurrence?.plannedDate ??
      (typeof storedOccurrence?.status === 'object' ? storedOccurrence.status?.actualDate : null) ??
      storedOccurrence?.actualDate ??
      null;
    const scheduledDate = normalizeDate(rawScheduledDate);
    if (!scheduledDate) {
      diagnostics.push({
        code: 'invalid-occurrence-date',
        sourceOccurrenceId: storedOccurrence?.id ?? null,
        message: `Transaction occurrence has an invalid date: ${String(rawScheduledDate || 'missing')}.`
      });
      return;
    }

    let occurrenceKey = null;
    if (sourceId) {
      const storedKey = String(storedOccurrence?.occurrenceKey || '').trim();
      if (storedKey) {
        occurrenceKey = storedKey;
      } else {
        let role = normalizeRole(storedOccurrence?.transactionGroupRole);
        if (!role) {
          const sourceDateMatches = generatedBySourceDate.get(`${sourceId}|${scheduledDate}`) || [];
          if (sourceDateMatches.length === 1) {
            role = normalizeRole(sourceDateMatches[0]?.transactionGroupRole);
          } else {
            role = normalizeRole(sourceTransactionsById.get(sourceId)?.transactionGroupRole);
          }
        }
        occurrenceKey = createLinkedOccurrenceKey(sourceId, scheduledDate, role);
        if (!generatedByKey.has(occurrenceKey)) {
          const sourceRoleMatches = generated.filter((occurrence) => (
            normalizeSourceId(occurrence?.sourceTransactionId) === sourceId &&
            normalizeRole(occurrence?.transactionGroupRole) === role
          ));
          if (
            !storedOccurrence?.scheduledDate &&
            sourceRoleMatches.length === 1 &&
            isOneTimeRecurrence(sourceRoleMatches[0]?.recurrence)
          ) {
            occurrenceKey = sourceRoleMatches[0].occurrenceKey;
          } else if (sourceRoleMatches.length > 0) {
            invalidProjectionKeys.add(occurrenceKey);
            diagnostics.push({
              code: 'ambiguous-linked-occurrence',
              occurrenceKey,
              sourceOccurrenceId: storedOccurrence?.id ?? null,
              message:
                'Linked occurrence could not be matched safely after its legacy date changed; ' +
                'the stored row was preserved for repair but excluded from projection.'
            });
          }
        }
      }
    }
    if (!occurrenceKey) occurrenceKey = manualOccurrenceKey(storedOccurrence, index);

    const isUntouchedGeneratedSnapshot =
      sourceId &&
      storedOccurrence?.isOverride === false &&
      statusName(storedOccurrence) === 'planned' &&
      (
        !hasOwn(storedOccurrence, 'baselineAmount') ||
        storedOccurrence.baselineAmount === null ||
        storedOccurrence.baselineAmount === undefined ||
        storedOccurrence.baselineAmount === ''
      );
    if (isUntouchedGeneratedSnapshot && !generatedByKey.has(occurrenceKey)) {
      return;
    }

    if (!occurrenceGroups.has(occurrenceKey)) occurrenceGroups.set(occurrenceKey, []);
    occurrenceGroups.get(occurrenceKey).push({ storedOccurrence, index, scheduledDate });
  });

  const occurrences = [];

  generated.forEach((base) => {
    const group = occurrenceGroups.get(base.occurrenceKey);
    if (!group?.length) {
      occurrences.push(finalizeOccurrence(base, { asOfDate: normalizedAsOfDate, accounts }));
      return;
    }

    const { selected, sourceOccurrenceIds } = selectOccurrenceOverlay(
      group,
      base.occurrenceKey,
      diagnostics
    );
    occurrences.push(buildStoredOccurrence({
      storedOccurrence: selected.storedOccurrence,
      base,
      occurrenceKey: base.occurrenceKey,
      sourceOccurrenceIds,
      asOfDate: normalizedAsOfDate,
      accounts
    }));
    occurrenceGroups.delete(base.occurrenceKey);
  });

  occurrenceGroups.forEach((group, occurrenceKey) => {
    const { selected, sourceOccurrenceIds } = selectOccurrenceOverlay(group, occurrenceKey, diagnostics);
    const sourceId = normalizeSourceId(selected?.storedOccurrence?.sourceTransactionId);
    const sourceTransaction = sourceId ? sourceTransactionsById.get(sourceId) : null;
    const base = buildBaseFromSourceTransaction(
      sourceTransaction,
      selected.scheduledDate,
      occurrenceKey
    );

    if (sourceId && !sourceTransaction) {
      diagnostics.push({
        code: 'orphan-source-transaction',
        occurrenceKey,
        sourceOccurrenceId: selected?.storedOccurrence?.id ?? null,
        message: `Occurrence references missing source transaction ${sourceId}.`
      });
    }

    let occurrence = buildStoredOccurrence({
      storedOccurrence: selected.storedOccurrence,
      base,
      occurrenceKey,
      sourceOccurrenceIds,
      asOfDate: normalizedAsOfDate,
      accounts
    });
    if (invalidProjectionKeys.has(occurrenceKey)) {
      occurrence = {
        ...occurrence,
        validForProjection: false,
        isIncludedInForecast: false
      };
    }
    occurrences.push(occurrence);
  });

  (scenario?.transactions || [])
    .filter((transaction) => statusName(transaction) === 'actual')
    .forEach((transaction) => {
      const legacyActual = buildLegacyActualOccurrence(transaction, {
        asOfDate: normalizedAsOfDate,
        accounts
      });
      if (!legacyActual) {
        diagnostics.push({
          code: 'invalid-actual-transaction-date',
          sourceTransactionId: transaction?.id ?? null,
          message: 'Actual transaction has an invalid or missing date.'
        });
        return;
      }
      const representedKey =
        `${normalizeSourceId(transaction?.id)}|${legacyActual.scheduledDate}|${normalizeRole(legacyActual.transactionGroupRole)}`;
      const matchingIndex = occurrences.findIndex((occurrence) => (
        `${normalizeSourceId(occurrence?.sourceTransactionId)}|${occurrence?.scheduledDate}|${normalizeRole(occurrence?.transactionGroupRole)}` ===
        representedKey
      ));
      if (matchingIndex === -1) {
        occurrences.push(legacyActual);
        return;
      }

      const matchingOccurrence = occurrences[matchingIndex];
      if (matchingOccurrence.status === 'actual') return;

      let realizedOccurrence = finalizeOccurrence({
        ...matchingOccurrence,
        origin: 'legacy-actual-transaction',
        actualDate: legacyActual.actualDate,
        actualAmount: legacyActual.actualAmount,
        status: 'actual',
        isUnplannedActual: false
      }, { asOfDate: normalizedAsOfDate, accounts });
      if (invalidProjectionKeys.has(matchingOccurrence.occurrenceKey)) {
        realizedOccurrence = {
          ...realizedOccurrence,
          validForProjection: false,
          isIncludedInForecast: false
        };
      }
      occurrences[matchingIndex] = realizedOccurrence;
    });

  const lineageResolvedOccurrences = suppressPlansReplacedByLineageActuals(
    occurrences,
    sourceTransactionsById
  );
  const inWindow = lineageResolvedOccurrences
    .filter((occurrence) => {
      const relevantDates = [
        occurrence?.scheduledDate,
        occurrence?.plannedDate,
        occurrence?.actualDate,
        occurrence?.effectiveDate,
        occurrence?.forecastDate
      ].filter(Boolean);
      return relevantDates.some(
        (date) => date >= normalizedStartDate && date <= normalizedEndDate
      );
    })
    .sort((a, b) => {
      const dateDifference = String(a?.effectiveDate || '').localeCompare(String(b?.effectiveDate || ''));
      if (dateDifference) return dateDifference;
      return String(a?.occurrenceKey || '').localeCompare(String(b?.occurrenceKey || ''));
    });

  return { occurrences: inWindow, diagnostics };
}
