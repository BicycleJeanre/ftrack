// resolve-scenario-occurrences.js
// Canonical compatibility query for schemaVersion 43 planning rules and stored
// budget occurrences. This module is pure: it never mutates scenario data.

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

function manualOccurrenceKey(budget, index) {
  const id = budget?.id;
  return `budget:${id !== null && id !== undefined && id !== '' ? id : `index-${index}`}`;
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

    return [{
      id: occurrenceKey,
      occurrenceKey,
      sourceTransactionId: transaction?.id ?? null,
      sourceBudgetId: null,
      sourceBudgetIds: [],
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
      baselineAmount: generatedAmount,
      baselineState: 'derived',
      plannedAmount: generatedAmount,
      actualAmount: null,
      status: 'planned'
    }];
  });
}

function isCanonicalBudgetCandidate(budget) {
  return Boolean(
    budget &&
    (
      hasOwn(budget, 'occurrenceDate') ||
      hasOwn(budget, 'scheduledDate') ||
      hasOwn(budget, 'plannedDate') ||
      hasOwn(budget, 'actualDate') ||
      hasOwn(budget, 'sourceTransactionId') ||
      hasOwn(budget, 'primaryAccountId') ||
      hasOwn(budget, 'transactionTypeId') ||
      hasOwn(budget, 'status')
    )
  );
}

function getBudgetActualDate(budget) {
  const value =
    (typeof budget?.status === 'object' ? budget.status?.actualDate : null) ??
    budget?.actualDate ??
    null;
  return normalizeDate(value);
}

function getBudgetActualAmount(budget, fallback) {
  const value =
    (typeof budget?.status === 'object' && hasOwn(budget.status, 'actualAmount')
      ? budget.status.actualAmount
      : undefined) ??
    (hasOwn(budget, 'actualAmount') ? budget.actualAmount : undefined);
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

function buildBudgetOccurrence({
  budget,
  base,
  occurrenceKey,
  sourceBudgetIds,
  asOfDate,
  accounts
}) {
  const status = statusName(budget);
  const inheritsGeneratedPlan =
    Boolean(base) &&
    status === 'planned' &&
    budget?.isOverride === false;
  const scheduledDate =
    (inheritsGeneratedPlan ? base?.scheduledDate : normalizeDate(budget?.scheduledDate)) ||
    base?.scheduledDate ||
    normalizeDate(budget?.occurrenceDate) ||
    null;
  const legacyOccurrenceDate = normalizeDate(budget?.occurrenceDate);
  const plannedDate =
    inheritsGeneratedPlan
      ? null
      : (
        normalizeDate(budget?.plannedDate) ||
        (
          base?.scheduledDate &&
          legacyOccurrenceDate &&
          legacyOccurrenceDate !== base.scheduledDate
            ? legacyOccurrenceDate
            : null
        )
      );

  const hasExplicitPlannedAmount =
    hasOwn(budget, 'plannedAmount') &&
    budget.plannedAmount !== null &&
    budget.plannedAmount !== undefined &&
    budget.plannedAmount !== '';
  const plannedAmount = inheritsGeneratedPlan
    ? absoluteAmount(base?.plannedAmount)
    : (
      hasExplicitPlannedAmount
        ? absoluteAmount(budget.plannedAmount)
        : (hasOwn(budget, 'amount') ? absoluteAmount(budget.amount) : absoluteAmount(base?.plannedAmount))
    );
  const actualDate = status === 'actual'
    ? (getBudgetActualDate(budget) || plannedDate || scheduledDate)
    : null;
  const actualAmount = status === 'actual'
    ? getBudgetActualAmount(budget, plannedAmount)
    : null;

  const hasExplicitBaseline =
    hasOwn(budget, 'baselineAmount') &&
    budget.baselineAmount !== null &&
    budget.baselineAmount !== undefined &&
    budget.baselineAmount !== '';
  const baselineAmount = hasExplicitBaseline
    ? absoluteAmount(budget.baselineAmount)
    : (
      inheritsGeneratedPlan
        ? absoluteAmount(base?.baselineAmount)
        : (hasOwn(budget, 'amount') ? absoluteAmount(budget.amount) : absoluteAmount(base?.baselineAmount))
    );

  const sourceTransactionId = budget?.sourceTransactionId ?? base?.sourceTransactionId ?? null;
  const primaryAccountId = inheritsGeneratedPlan
    ? (base?.primaryAccountId ?? null)
    : (budget?.primaryAccountId ?? base?.primaryAccountId ?? null);
  const secondaryAccountId = inheritsGeneratedPlan
    ? (base?.secondaryAccountId ?? null)
    : (budget?.secondaryAccountId ?? base?.secondaryAccountId ?? null);
  const rawTransactionTypeId = Number(
    inheritsGeneratedPlan
      ? base?.transactionTypeId
      : (budget?.transactionTypeId ?? base?.transactionTypeId)
  );
  const transactionTypeId =
    rawTransactionTypeId === 1 || rawTransactionTypeId === 2
      ? rawTransactionTypeId
      : null;
  const groupRole = normalizeRole(
    inheritsGeneratedPlan
      ? base?.transactionGroupRole
      : (budget?.transactionGroupRole ?? base?.transactionGroupRole)
  );
  const origin = budget?.origin || (base ? base.origin : 'manual');
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
    sourceBudgetId: budget?.id ?? null,
    sourceBudgetIds,
    origin,
    hasStoredOverride: true,
    hasPlanOverride: !inheritsGeneratedPlan,
    primaryAccountId,
    secondaryAccountId,
    transactionTypeId,
    transactionGroupId: inheritsGeneratedPlan
      ? (base?.transactionGroupId ?? null)
      : (budget?.transactionGroupId ?? base?.transactionGroupId ?? null),
    transactionGroupRole: groupRole || null,
    transactionGroupAccountGroupId:
      inheritsGeneratedPlan
        ? (base?.transactionGroupAccountGroupId ?? null)
        : (budget?.transactionGroupAccountGroupId ?? base?.transactionGroupAccountGroupId ?? null),
    capitalAmount: inheritsGeneratedPlan
      ? (base?.capitalAmount ?? null)
      : (budget?.capitalAmount ?? base?.capitalAmount ?? null),
    interestAmount: inheritsGeneratedPlan
      ? (base?.interestAmount ?? null)
      : (budget?.interestAmount ?? base?.interestAmount ?? null),
    description: inheritsGeneratedPlan
      ? (base?.description || '')
      : (hasOwn(budget, 'description') ? String(budget.description || '') : (base?.description || '')),
    tags: inheritsGeneratedPlan
      ? (Array.isArray(base?.tags) ? [...base.tags] : [])
      : (
        hasOwn(budget, 'tags') && Array.isArray(budget.tags)
          ? [...budget.tags]
          : (Array.isArray(base?.tags) ? [...base.tags] : [])
      ),
    recurrence: clonePlain(
      inheritsGeneratedPlan
        ? (base?.recurrence ?? null)
        : (budget?.recurrence ?? base?.recurrence ?? null)
    ),
    recurrenceDescription:
      inheritsGeneratedPlan
        ? (base?.recurrenceDescription ?? '')
        : (budget?.recurrenceDescription ?? base?.recurrenceDescription ?? ''),
    periodicChange: clonePlain(
      inheritsGeneratedPlan
        ? (base?.periodicChange ?? null)
        : (budget?.periodicChange ?? base?.periodicChange ?? null)
    ),
    scheduledDate,
    plannedDate,
    actualDate,
    generatedAmount: base?.generatedAmount ?? null,
    baselineAmount,
    baselineState: hasExplicitBaseline
      ? 'stored'
      : (base ? 'legacy-assumed' : 'legacy-assumed'),
    plannedAmount,
    actualAmount,
    status,
    isUnbudgetedActual: explicitManualActual
  }, { asOfDate, accounts });
}

function overlayPriority(item) {
  const status = statusName(item?.budget);
  if (status === 'actual') return 3;
  if (status === 'skipped') return 2;
  return 1;
}

function budgetSortValue(item) {
  const id = Number(item?.budget?.id);
  return Number.isFinite(id) ? id : item.index;
}

function selectBudgetOverlay(group, occurrenceKey, diagnostics) {
  const sourceBudgetIds = group
    .map((item) => item?.budget?.id)
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
      sourceBudgetIds,
      message: `Duplicate occurrence overrides found for ${occurrenceKey}; deterministic precedence was applied.`
    });
  }

  const actualCount = group.filter((item) => statusName(item?.budget) === 'actual').length;
  if (actualCount > 1) {
    diagnostics.push({
      code: 'conflicting-actuals',
      occurrenceKey,
      sourceBudgetIds,
      message: `Conflicting actual occurrence records found for ${occurrenceKey}; the highest actual ID was selected.`
    });
  }

  const selected = [...group].sort((a, b) => {
    const priorityDifference = overlayPriority(b) - overlayPriority(a);
    if (priorityDifference) return priorityDifference;
    const idDifference = budgetSortValue(b) - budgetSortValue(a);
    if (idDifference) return idDifference;
    return b.index - a.index;
  })[0];

  return { selected, sourceBudgetIds };
}

function buildBaseFromSourceTransaction(sourceTransaction, scheduledDate, occurrenceKey) {
  if (!sourceTransaction || !scheduledDate) return null;
  const generatedAmount = absoluteAmount(sourceTransaction?.amount);
  const role = normalizeRole(sourceTransaction?.transactionGroupRole);
  return {
    id: occurrenceKey,
    occurrenceKey,
    sourceTransactionId: sourceTransaction?.id ?? null,
    sourceBudgetId: null,
    sourceBudgetIds: [],
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
  const actualAmount = getBudgetActualAmount(transaction, plannedAmount);
  const occurrenceKey = `actual-tx:${transaction?.id}`;

  return finalizeOccurrence({
    id: occurrenceKey,
    occurrenceKey,
    sourceTransactionId: transaction?.id ?? null,
    sourceBudgetId: null,
    sourceBudgetIds: [],
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
    baselineState: 'derived',
    plannedAmount,
    actualAmount,
    status: 'actual',
    isUnbudgetedActual: false
  }, { asOfDate, accounts });
}

/**
 * Resolve schemaVersion 43 rule definitions and stored Budget rows into one
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
  const budgetGroups = new Map();
  const invalidProjectionKeys = new Set();

  (scenario?.budgets || []).forEach((budget, index) => {
    if (!isCanonicalBudgetCandidate(budget)) {
      diagnostics.push({
        code: 'unsupported-legacy-budget-shape',
        sourceBudgetId: budget?.id ?? null,
        message: 'Unsupported legacy budget shape was ignored because it is not a dated occurrence.'
      });
      return;
    }

    const explicitDateFields = [
      ['scheduledDate', budget?.scheduledDate],
      ['occurrenceDate', budget?.occurrenceDate],
      ['plannedDate', budget?.plannedDate],
      ['actualDate', budget?.actualDate],
      ['status.actualDate', typeof budget?.status === 'object' ? budget.status?.actualDate : null]
    ];
    const invalidDateField = explicitDateFields.find(([, value]) => (
      value !== null &&
      value !== undefined &&
      value !== '' &&
      !normalizeDate(value)
    ));
    if (invalidDateField) {
      diagnostics.push({
        code: 'invalid-budget-date',
        sourceBudgetId: budget?.id ?? null,
        field: invalidDateField[0],
        message: `Budget occurrence has an invalid ${invalidDateField[0]}: ${String(invalidDateField[1])}.`
      });
      return;
    }

    const sourceId = normalizeSourceId(budget?.sourceTransactionId);
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
    const budgetComparisonScheduledDate =
      normalizeDate(budget?.scheduledDate) ||
      normalizeDate(budget?.occurrenceDate) ||
      normalizeDate(budget?.plannedDate);
    const linkedRoleMatches =
      normalizeRole(linkedSourceTransaction?.transactionGroupRole) ===
      normalizeRole(budget?.transactionGroupRole);
    const preservesLinkedActualComparison =
      Boolean(
        linkedLegacyActualDate &&
        linkedLegacyActualDate >= normalizedStartDate &&
        linkedLegacyActualDate <= normalizedEndDate &&
        linkedRoleMatches &&
        budgetComparisonScheduledDate === linkedLegacyActualScheduledDate
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
      ['amount', budget?.amount],
      ['plannedAmount', budget?.plannedAmount],
      ['baselineAmount', budget?.baselineAmount],
      ['actualAmount', budget?.actualAmount],
      ['status.actualAmount', typeof budget?.status === 'object' ? budget.status?.actualAmount : null],
      ['capitalAmount', budget?.capitalAmount],
      ['interestAmount', budget?.interestAmount]
    ];
    const invalidAmountField = explicitAmountFields.find(([, value]) => (
      value !== null &&
      value !== undefined &&
      value !== '' &&
      !Number.isFinite(Number(value))
    ));
    if (invalidAmountField) {
      diagnostics.push({
        code: 'invalid-budget-amount',
        sourceBudgetId: budget?.id ?? null,
        field: invalidAmountField[0],
        message: `Budget occurrence has an invalid ${invalidAmountField[0]} amount.`
      });
      return;
    }

    const rawScheduledDate =
      budget?.scheduledDate ??
      budget?.occurrenceDate ??
      budget?.plannedDate ??
      (typeof budget?.status === 'object' ? budget.status?.actualDate : null) ??
      budget?.actualDate ??
      null;
    const scheduledDate = normalizeDate(rawScheduledDate);
    if (!scheduledDate) {
      diagnostics.push({
        code: 'invalid-budget-date',
        sourceBudgetId: budget?.id ?? null,
        message: `Budget occurrence has an invalid date: ${String(rawScheduledDate || 'missing')}.`
      });
      return;
    }

    let occurrenceKey = null;
    if (sourceId) {
      const storedKey = String(budget?.occurrenceKey || '').trim();
      if (storedKey) {
        occurrenceKey = storedKey;
      } else {
        let role = normalizeRole(budget?.transactionGroupRole);
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
            !budget?.scheduledDate &&
            sourceRoleMatches.length === 1 &&
            isOneTimeRecurrence(sourceRoleMatches[0]?.recurrence)
          ) {
            occurrenceKey = sourceRoleMatches[0].occurrenceKey;
          } else if (sourceRoleMatches.length > 0) {
            invalidProjectionKeys.add(occurrenceKey);
            diagnostics.push({
              code: 'ambiguous-linked-occurrence',
              occurrenceKey,
              sourceBudgetId: budget?.id ?? null,
              message:
                'Linked occurrence could not be matched safely after its legacy date changed; ' +
                'the stored row was preserved for repair but excluded from projection.'
            });
          }
        }
      }
    }
    if (!occurrenceKey) occurrenceKey = manualOccurrenceKey(budget, index);

    const isUntouchedGeneratedSnapshot =
      sourceId &&
      budget?.isOverride === false &&
      statusName(budget) === 'planned' &&
      (
        !hasOwn(budget, 'baselineAmount') ||
        budget.baselineAmount === null ||
        budget.baselineAmount === undefined ||
        budget.baselineAmount === ''
      );
    if (isUntouchedGeneratedSnapshot && !generatedByKey.has(occurrenceKey)) {
      return;
    }

    if (!budgetGroups.has(occurrenceKey)) budgetGroups.set(occurrenceKey, []);
    budgetGroups.get(occurrenceKey).push({ budget, index, scheduledDate });
  });

  const occurrences = [];

  generated.forEach((base) => {
    const group = budgetGroups.get(base.occurrenceKey);
    if (!group?.length) {
      occurrences.push(finalizeOccurrence(base, { asOfDate: normalizedAsOfDate, accounts }));
      return;
    }

    const { selected, sourceBudgetIds } = selectBudgetOverlay(
      group,
      base.occurrenceKey,
      diagnostics
    );
    occurrences.push(buildBudgetOccurrence({
      budget: selected.budget,
      base,
      occurrenceKey: base.occurrenceKey,
      sourceBudgetIds,
      asOfDate: normalizedAsOfDate,
      accounts
    }));
    budgetGroups.delete(base.occurrenceKey);
  });

  budgetGroups.forEach((group, occurrenceKey) => {
    const { selected, sourceBudgetIds } = selectBudgetOverlay(group, occurrenceKey, diagnostics);
    const sourceId = normalizeSourceId(selected?.budget?.sourceTransactionId);
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
        sourceBudgetId: selected?.budget?.id ?? null,
        message: `Occurrence references missing source transaction ${sourceId}.`
      });
    }

    let occurrence = buildBudgetOccurrence({
      budget: selected.budget,
      base,
      occurrenceKey,
      sourceBudgetIds,
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
        isUnbudgetedActual: false
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

  const inWindow = occurrences
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
