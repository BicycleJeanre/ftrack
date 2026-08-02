// Browser-safe migration helpers for upgrading legacy app data to schemaVersion 44.
// Runtime callers persist the returned app data, including its recovery-oriented
// migrationReport. This module has no Node.js dependencies.

import {
  CURRENT_SCHEMA_VERSION,
  createDefaultUiState,
  getDefaultProjectionWindowDates,
  mapPeriodTypeNameToId,
  normalizeDateOnlyString,
  normalizeProjectionConfig,
  normalizeTransactionOccurrence,
  normalizeTransactionRule,
  sanitizeAppDataForWrite,
  sanitizeScenarioForWrite
} from './app-data-utils.js';
import {
  DEFAULT_WORKFLOW_ID,
  getWorkflowById,
  getWorkflowIdFromLegacyScenarioTypeId
} from './workflow-registry.js';

const VALID_STATUSES = new Set(['planned', 'actual', 'skipped']);

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, clonePlain(child)])
  );
}

function safeNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.abs(number) : null;
}

function statusName(record, fallback = 'planned') {
  const raw = typeof record?.status === 'object' ? record.status?.name : record?.status;
  const normalized = String(raw || fallback).trim().toLowerCase();
  return VALID_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSourceKey(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value).trim() || null;
}

function createLinkedOccurrenceKey(sourceTransactionId, scheduledDate, role = '') {
  if (sourceTransactionId === null || sourceTransactionId === undefined || !scheduledDate) return null;
  return `tx:${sourceTransactionId}|date:${scheduledDate}|role:${normalizeRole(role) || 'none'}`;
}

function parseStoredOccurrenceKey(value) {
  const match = /^tx:([^|]+)\|date:(\d{4}-\d{2}-\d{2})\|role:([^|]+)$/.exec(
    String(value || '').trim()
  );
  if (!match) return null;
  const date = normalizeDateOnlyString(match[2]);
  if (!date) return null;
  return {
    sourceKey: normalizeSourceKey(match[1]),
    scheduledDate: date,
    role: normalizeRole(match[3] === 'none' ? '' : match[3])
  };
}

function isOneTimeRule(transaction) {
  const rawType = transaction?.recurrence?.recurrenceType ?? transaction?.recurrence?.recurrenceTypeId;
  const typeId = typeof rawType === 'object' ? Number(rawType?.id) : Number(rawType);
  return !transaction?.recurrence || typeId === 1;
}

function coercePeriodTypeId(value) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const id = safeNumber(value.id, null);
    return id != null ? id : null;
  }
  if (typeof value === 'string') return mapPeriodTypeNameToId(value);
  return null;
}

function inferLastWorkflowId(legacy, scenarios) {
  const uiState = legacy?.uiState && typeof legacy.uiState === 'object' ? legacy.uiState : {};
  const fromUi = getWorkflowById(uiState.lastWorkflowId)?.id || null;
  if (fromUi) return fromUi;

  const lastScenarioId = safeNumber(uiState.lastScenarioId, null);
  const lastScenario =
    lastScenarioId == null
      ? null
      : scenarios.find((scenario) => safeNumber(scenario?.id, null) === lastScenarioId);
  const fromLast = getWorkflowIdFromLegacyScenarioTypeId(
    lastScenario?.type ?? legacy?.scenarioType ?? null
  );
  if (fromLast) return fromLast;

  return getWorkflowIdFromLegacyScenarioTypeId(scenarios[0]?.type ?? null) || DEFAULT_WORKFLOW_ID;
}

function allocateIdFactory(records = []) {
  const used = new Set();
  let nextId = (Array.isArray(records) ? records : []).reduce((maximum, record) => {
    const id = Number(record?.id);
    return Number.isInteger(id) && id > maximum ? id : maximum;
  }, 0) + 1;

  return (preferred) => {
    const numeric = Number(preferred);
    if (Number.isInteger(numeric) && numeric > 0 && !used.has(numeric)) {
      used.add(numeric);
      return numeric;
    }
    while (used.has(nextId)) nextId += 1;
    const allocated = nextId;
    used.add(allocated);
    nextId += 1;
    return allocated;
  };
}

function createScenarioReporter({ report, scenario, scenarioIndex }) {
  const scenarioReport = {
    scenarioId: safeNumber(scenario?.id, null),
    scenarioIndex,
    summary: {
      rulesRetained: 0,
      legacyBudgetRows: 0,
      occurrencesCreated: 0,
      actualTransactionsConverted: 0,
      projectionRowsCleared: 0
    },
    issues: []
  };
  report.scenarios.push(scenarioReport);

  const addIssue = ({
    code,
    message,
    sourceCollection,
    sourceIndex,
    sourceId,
    action,
    rawRecord = null
  }) => {
    const issue = {
      severity: 'warning',
      code,
      message,
      sourceCollection,
      sourceIndex,
      sourceId: sourceId ?? null,
      action
    };
    if (rawRecord !== null) {
      issue.recoveryRecord = clonePlain(rawRecord);
      report.summary.recoveryRecordCount += 1;
    }
    scenarioReport.issues.push(issue);
    report.summary.warningCount += 1;
    return issue;
  };

  return { scenarioReport, addIssue };
}

function normalizeProjectionForMigration(scenario, migratedAt) {
  const defaults = getDefaultProjectionWindowDates();
  const legacyConfig =
    scenario?.projection?.config && typeof scenario.projection.config === 'object'
      ? scenario.projection.config
      : {};
  const periodTypeId =
    coercePeriodTypeId(legacyConfig.periodTypeId ?? scenario?.projectionPeriod) || 3;
  const config = normalizeProjectionConfig({
    startDate: legacyConfig.startDate || scenario?.startDate || defaults.startDate,
    endDate: legacyConfig.endDate || scenario?.endDate || defaults.endDate,
    periodTypeId,
    asOfDate: legacyConfig.asOfDate,
    openCommitmentStartDate: legacyConfig.openCommitmentStartDate
  });
  const existingRows = Array.isArray(scenario?.projection?.rows)
    ? scenario.projection.rows
    : (Array.isArray(scenario?.projections) ? scenario.projections : []);

  return {
    projection: {
      config,
      rows: [],
      generatedAt: null,
      stale: true,
      staleAt: migratedAt,
      staleReason: 'schema-migration'
    },
    clearedRows: existingRows.length
  };
}

function getBudgetActualAmount(budget, fallback) {
  const nested =
    typeof budget?.status === 'object' &&
    Object.prototype.hasOwnProperty.call(budget.status, 'actualAmount')
      ? budget.status.actualAmount
      : undefined;
  const raw = nested ?? budget?.actualAmount;
  const normalized = optionalAmount(raw);
  return normalized === null ? fallback : normalized;
}

function getBudgetActualDate(budget) {
  return normalizeDateOnlyString(
    (typeof budget?.status === 'object' ? budget.status?.actualDate : null) ??
    budget?.actualDate
  );
}

function migrateScenario({ legacyScenario, scenarioIndex, report, migratedAt }) {
  const scenario =
    legacyScenario && typeof legacyScenario === 'object'
      ? legacyScenario
      : {};
  const { scenarioReport, addIssue } = createScenarioReporter({
    report,
    scenario,
    scenarioIndex
  });

  const legacyTransactions = Array.isArray(scenario.transactions) ? scenario.transactions : [];
  const plannedTransactions = legacyTransactions.filter(
    (transaction) => statusName(transaction) !== 'actual'
  );
  const actualTransactions = legacyTransactions.filter(
    (transaction) => statusName(transaction) === 'actual'
  );
  const allocateRuleId = allocateIdFactory(plannedTransactions);
  const ruleIdMap = new Map();
  const usedLegacyRuleKeys = new Set();
  const rules = plannedTransactions.map((transaction, transactionIndex) => {
    const legacyKey = normalizeSourceKey(transaction?.id);
    const id = allocateRuleId(transaction?.id);
    if (
      !Number.isInteger(Number(transaction?.id)) ||
      Number(transaction.id) <= 0 ||
      usedLegacyRuleKeys.has(legacyKey)
    ) {
      addIssue({
        code: 'transaction-id-reassigned',
        message: `Transaction rule ID was invalid or duplicated and was reassigned to ${id}.`,
        sourceCollection: 'transactions',
        sourceIndex: transactionIndex,
        sourceId: transaction?.id,
        action: 'reassigned',
        rawRecord: transaction
      });
    }
    if (legacyKey && !ruleIdMap.has(legacyKey)) ruleIdMap.set(legacyKey, id);
    if (legacyKey) usedLegacyRuleKeys.add(legacyKey);

    const normalized = normalizeTransactionRule({ ...transaction, id });
    scenarioReport.summary.rulesRetained += 1;
    report.summary.rulesRetained += 1;
    return normalized;
  });
  const rulesById = new Map(rules.map((rule) => [Number(rule.id), rule]));

  const legacyBudgets = Array.isArray(scenario.budgets)
    ? scenario.budgets
    : (Array.isArray(scenario.transactionOccurrences) ? scenario.transactionOccurrences : []);
  scenarioReport.summary.legacyBudgetRows = legacyBudgets.length;
  report.summary.legacyBudgetRows += legacyBudgets.length;
  const allocateOccurrenceId = allocateIdFactory(legacyBudgets);
  const candidateOccurrences = [];

  legacyBudgets.forEach((budget, budgetIndex) => {
    const id = allocateOccurrenceId(budget?.id);
    if (!Number.isInteger(Number(budget?.id)) || Number(budget.id) <= 0 || id !== Number(budget.id)) {
      addIssue({
        code: 'occurrence-id-reassigned',
        message: `Legacy occurrence ID was invalid or duplicated and was reassigned to ${id}.`,
        sourceCollection: 'budgets',
        sourceIndex: budgetIndex,
        sourceId: budget?.id,
        action: 'reassigned',
        rawRecord: budget
      });
    }

    const explicitDateFields = [
      ['scheduledDate', budget?.scheduledDate],
      ['occurrenceDate', budget?.occurrenceDate],
      ['plannedDate', budget?.plannedDate],
      ['actualDate', budget?.actualDate],
      ['status.actualDate', typeof budget?.status === 'object' ? budget.status?.actualDate : null]
    ];
    const invalidDates = explicitDateFields.filter(([, value]) => (
      value !== null &&
      value !== undefined &&
      value !== '' &&
      !normalizeDateOnlyString(value)
    ));
    if (invalidDates.length) {
      addIssue({
        code: 'invalid-occurrence-date',
        message:
          `Legacy occurrence contains invalid date fields: ${invalidDates.map(([field]) => field).join(', ')}.`,
        sourceCollection: 'budgets',
        sourceIndex: budgetIndex,
        sourceId: budget?.id,
        action: 'recovered-with-valid-fields-or-report-only',
        rawRecord: budget
      });
    }

    const storedKey = parseStoredOccurrenceKey(budget?.occurrenceKey);
    const legacySourceKey = normalizeSourceKey(budget?.sourceTransactionId);
    const mappedSourceId = legacySourceKey ? ruleIdMap.get(legacySourceKey) ?? null : null;
    const linkedRule = mappedSourceId == null ? null : rulesById.get(Number(mappedSourceId));
    let scheduledDate =
      normalizeDateOnlyString(budget?.scheduledDate) ||
      storedKey?.scheduledDate ||
      normalizeDateOnlyString(budget?.occurrenceDate) ||
      normalizeDateOnlyString(budget?.plannedDate) ||
      getBudgetActualDate(budget);
    let plannedDate = normalizeDateOnlyString(budget?.plannedDate);
    const legacyOccurrenceDate = normalizeDateOnlyString(budget?.occurrenceDate);
    if (!plannedDate && storedKey?.scheduledDate && legacyOccurrenceDate !== storedKey.scheduledDate) {
      plannedDate = legacyOccurrenceDate;
    }

    if (!scheduledDate) {
      addIssue({
        code: 'unmigrated-occurrence-date',
        message: 'Legacy occurrence had no recoverable scheduled date and is preserved in the migration report.',
        sourceCollection: 'budgets',
        sourceIndex: budgetIndex,
        sourceId: budget?.id,
        action: 'report-only',
        rawRecord: budget
      });
      return;
    }

    let sourceTransactionId = mappedSourceId;
    let role = normalizeRole(budget?.transactionGroupRole || storedKey?.role);
    let occurrenceKey = null;
    if (legacySourceKey && mappedSourceId == null) {
      addIssue({
        code: 'orphan-source-transaction',
        message:
          `Legacy occurrence referenced missing or non-rule transaction ${legacySourceKey}; it was preserved as a manual occurrence.`,
        sourceCollection: 'budgets',
        sourceIndex: budgetIndex,
        sourceId: budget?.id,
        action: 'converted-to-manual',
        rawRecord: budget
      });
      sourceTransactionId = null;
    } else if (
      sourceTransactionId != null &&
      !budget?.scheduledDate &&
      !storedKey &&
      linkedRule &&
      !isOneTimeRule(linkedRule)
    ) {
      addIssue({
        code: 'ambiguous-recurring-occurrence',
        message:
          'A linked recurring occurrence lacked stable scheduled identity and was preserved as a manual occurrence.',
        sourceCollection: 'budgets',
        sourceIndex: budgetIndex,
        sourceId: budget?.id,
        action: 'converted-to-manual',
        rawRecord: budget
      });
      sourceTransactionId = null;
    }
    occurrenceKey =
      sourceTransactionId == null
        ? `occurrence:${id}`
        : createLinkedOccurrenceKey(sourceTransactionId, scheduledDate, role);

    const status = statusName(budget);
    const plannedValue = optionalAmount(
      budget?.plannedAmount ?? budget?.amount ?? linkedRule?.amount
    );
    const explicitBaseline = optionalAmount(budget?.baselineAmount);
    const inheritsGeneratedPlan =
      sourceTransactionId != null &&
      budget?.isOverride === false &&
      status === 'planned';
    const plannedAmount = inheritsGeneratedPlan ? null : plannedValue;
    const baselineAmount =
      budget?.baselineAmount === null || budget?.baselineAmount === undefined
        ? (inheritsGeneratedPlan ? null : plannedValue)
        : explicitBaseline;
    const actualDate =
      status === 'actual'
        ? (getBudgetActualDate(budget) || plannedDate || scheduledDate)
        : null;
    const actualAmount =
      status === 'actual'
        ? getBudgetActualAmount(budget, plannedValue)
        : null;

    if (
      (sourceTransactionId == null && plannedAmount == null && status !== 'actual') ||
      (status === 'actual' && actualAmount == null)
    ) {
      addIssue({
        code: 'invalid-occurrence-amount',
        message: 'Legacy occurrence had no recoverable amount and is preserved in the migration report.',
        sourceCollection: 'budgets',
        sourceIndex: budgetIndex,
        sourceId: budget?.id,
        action: 'report-only',
        rawRecord: budget
      });
      return;
    }

    const occurrence = normalizeTransactionOccurrence({
      id,
      sourceTransactionId,
      occurrenceKey,
      scheduledDate,
      plannedDate,
      actualDate,
      baselineAmount,
      plannedAmount,
      actualAmount,
      status,
      origin: 'migrated',
      actualSnapshotVersion: status === 'actual' ? 1 : null,
      baselinePrimaryAccountId:
        baselineAmount == null
          ? null
          : (budget?.primaryAccountId ?? linkedRule?.primaryAccountId ?? null),
      baselineSecondaryAccountId:
        baselineAmount == null
          ? null
          : (budget?.secondaryAccountId ?? linkedRule?.secondaryAccountId ?? null),
      baselineTransactionTypeId:
        baselineAmount == null
          ? null
          : (budget?.transactionTypeId ?? linkedRule?.transactionTypeId ?? null),
      baselineSnapshotVersion: baselineAmount == null ? null : 1,
      isOverride:
        typeof budget?.isOverride === 'boolean'
          ? budget.isOverride
          : true,
      primaryAccountId: budget?.primaryAccountId ?? linkedRule?.primaryAccountId ?? null,
      secondaryAccountId: budget?.secondaryAccountId ?? linkedRule?.secondaryAccountId ?? null,
      transactionTypeId: budget?.transactionTypeId ?? linkedRule?.transactionTypeId ?? null,
      description: budget?.description ?? linkedRule?.description ?? null,
      tags: Array.isArray(budget?.tags)
        ? budget.tags
        : (Array.isArray(linkedRule?.tags) ? linkedRule.tags : null),
      transactionGroupId: budget?.transactionGroupId ?? linkedRule?.transactionGroupId ?? null,
      transactionGroupRole: role || linkedRule?.transactionGroupRole || null,
      transactionGroupAccountGroupId:
        budget?.transactionGroupAccountGroupId ??
        linkedRule?.transactionGroupAccountGroupId ??
        null,
      capitalAmount: budget?.capitalAmount ?? linkedRule?.capitalAmount ?? null,
      interestAmount: budget?.interestAmount ?? linkedRule?.interestAmount ?? null,
      recurrence: budget?.recurrence ?? linkedRule?.recurrence ?? null,
      recurrenceDescription: budget?.recurrenceDescription ?? null,
      periodicChange: budget?.periodicChange ?? linkedRule?.periodicChange ?? null,
      createdAt: budget?.createdAt ?? null,
      updatedAt: budget?.updatedAt ?? null
    });
    candidateOccurrences.push({
      occurrence,
      legacySourceKey,
      sourceCollection: 'budgets',
      sourceIndex: budgetIndex,
      rawRecord: budget
    });
  });

  actualTransactions.forEach((transaction, actualIndex) => {
    const legacySourceKey = normalizeSourceKey(
      transaction?.sourceTransactionId ?? transaction?.id
    );
    const actualDate = normalizeDateOnlyString(
      (typeof transaction?.status === 'object' ? transaction.status?.actualDate : null) ??
      transaction?.actualDate ??
      transaction?.effectiveDate ??
      transaction?.recurrence?.startDate
    );
    const scheduledDate =
      normalizeDateOnlyString(transaction?.effectiveDate) ||
      normalizeDateOnlyString(transaction?.recurrence?.startDate) ||
      actualDate;
    if (!actualDate || !scheduledDate) {
      addIssue({
        code: 'invalid-actual-transaction-date',
        message: 'Legacy actual transaction had no recoverable date and is preserved in the migration report.',
        sourceCollection: 'transactions',
        sourceIndex: actualIndex,
        sourceId: transaction?.id,
        action: 'report-only',
        rawRecord: transaction
      });
      return;
    }
    const role = normalizeRole(transaction?.transactionGroupRole);
    const matchingCandidate = candidateOccurrences.find((candidate) => (
      candidate.legacySourceKey === legacySourceKey &&
      candidate.occurrence.scheduledDate === scheduledDate &&
      normalizeRole(candidate.occurrence.transactionGroupRole) === role
    ));
    const plannedAmount = optionalAmount(transaction?.amount);
    const actualAmount = getBudgetActualAmount(transaction, plannedAmount);
    if (actualAmount == null) {
      addIssue({
        code: 'invalid-actual-transaction-amount',
        message: 'Legacy actual transaction had no recoverable amount and is preserved in the migration report.',
        sourceCollection: 'transactions',
        sourceIndex: actualIndex,
        sourceId: transaction?.id,
        action: 'report-only',
        rawRecord: transaction
      });
      return;
    }

    if (matchingCandidate) {
      if (matchingCandidate.occurrence.status !== 'actual') {
        const linkedRule = matchingCandidate.occurrence.sourceTransactionId == null
          ? null
          : rulesById.get(Number(matchingCandidate.occurrence.sourceTransactionId));
        matchingCandidate.occurrence = normalizeTransactionOccurrence({
          ...matchingCandidate.occurrence,
          status: 'actual',
          actualDate,
          actualAmount,
          baselineAmount: matchingCandidate.occurrence.baselineAmount ?? plannedAmount,
          plannedAmount: matchingCandidate.occurrence.plannedAmount ?? plannedAmount,
          origin: 'migrated',
          actualSnapshotVersion: 1,
          primaryAccountId:
            transaction?.primaryAccountId ??
            matchingCandidate.occurrence.primaryAccountId ??
            linkedRule?.primaryAccountId ??
            null,
          secondaryAccountId:
            transaction?.secondaryAccountId ??
            matchingCandidate.occurrence.secondaryAccountId ??
            linkedRule?.secondaryAccountId ??
            null,
          transactionTypeId:
            transaction?.transactionTypeId ??
            matchingCandidate.occurrence.transactionTypeId ??
            linkedRule?.transactionTypeId ??
            null,
          description:
            transaction?.description ??
            matchingCandidate.occurrence.description ??
            linkedRule?.description ??
            null,
          tags: Array.isArray(transaction?.tags)
            ? transaction.tags
            : matchingCandidate.occurrence.tags,
          transactionGroupId:
            transaction?.transactionGroupId ??
            matchingCandidate.occurrence.transactionGroupId ??
            linkedRule?.transactionGroupId ??
            null,
          transactionGroupRole:
            transaction?.transactionGroupRole ??
            matchingCandidate.occurrence.transactionGroupRole ??
            linkedRule?.transactionGroupRole ??
            null,
          transactionGroupAccountGroupId:
            transaction?.transactionGroupAccountGroupId ??
            matchingCandidate.occurrence.transactionGroupAccountGroupId ??
            linkedRule?.transactionGroupAccountGroupId ??
            null,
          capitalAmount:
            transaction?.capitalAmount ??
            matchingCandidate.occurrence.capitalAmount ??
            linkedRule?.capitalAmount ??
            null,
          interestAmount:
            transaction?.interestAmount ??
            matchingCandidate.occurrence.interestAmount ??
            linkedRule?.interestAmount ??
            null,
          recurrence:
            transaction?.recurrence ??
            matchingCandidate.occurrence.recurrence ??
            linkedRule?.recurrence ??
            null,
          periodicChange:
            transaction?.periodicChange ??
            matchingCandidate.occurrence.periodicChange ??
            linkedRule?.periodicChange ??
            null
        });
      } else {
        const sameActual =
          Number(matchingCandidate.occurrence.actualAmount) === Number(actualAmount) &&
          matchingCandidate.occurrence.actualDate === actualDate;
        addIssue({
          code: sameActual
            ? 'duplicate-actual-occurrence'
            : 'conflicting-actual-occurrence',
          message: sameActual
            ? 'A duplicate legacy actual transaction matched an already-actual occurrence and was preserved in the migration report.'
            : 'A legacy actual transaction conflicted with an already-actual occurrence; the occurrence row was retained and the conflicting transaction was preserved in the migration report.',
          sourceCollection: 'transactions',
          sourceIndex: actualIndex,
          sourceId: transaction?.id,
          action: sameActual
            ? 'deduplicated-preserved-in-report'
            : 'conflict-preserved-in-report',
          rawRecord: transaction
        });
      }
      return;
    }

    const id = allocateOccurrenceId(null);
    const mappedSourceId = legacySourceKey
      ? (ruleIdMap.get(legacySourceKey) ?? null)
      : null;
    const linkedRule = mappedSourceId == null ? null : rulesById.get(Number(mappedSourceId));
    const linkedOccurrenceKey = mappedSourceId == null
      ? `occurrence:${id}`
      : createLinkedOccurrenceKey(mappedSourceId, scheduledDate, role);
    candidateOccurrences.push({
      occurrence: normalizeTransactionOccurrence({
        id,
        sourceTransactionId: mappedSourceId,
        occurrenceKey: linkedOccurrenceKey,
        scheduledDate,
        plannedDate: null,
        actualDate,
        baselineAmount: plannedAmount,
        plannedAmount,
        actualAmount,
        status: 'actual',
        origin: 'migrated',
        actualSnapshotVersion: 1,
        baselinePrimaryAccountId:
          transaction?.primaryAccountId ?? linkedRule?.primaryAccountId ?? null,
        baselineSecondaryAccountId:
          transaction?.secondaryAccountId ?? linkedRule?.secondaryAccountId ?? null,
        baselineTransactionTypeId:
          transaction?.transactionTypeId ?? linkedRule?.transactionTypeId ?? null,
        baselineSnapshotVersion: 1,
        isOverride: true,
        primaryAccountId: transaction?.primaryAccountId ?? linkedRule?.primaryAccountId ?? null,
        secondaryAccountId: transaction?.secondaryAccountId ?? linkedRule?.secondaryAccountId ?? null,
        transactionTypeId: transaction?.transactionTypeId ?? linkedRule?.transactionTypeId ?? null,
        description: transaction?.description ?? linkedRule?.description ?? null,
        tags: Array.isArray(transaction?.tags) ? transaction.tags : [],
        transactionGroupId: transaction?.transactionGroupId ?? linkedRule?.transactionGroupId ?? null,
        transactionGroupRole: transaction?.transactionGroupRole ?? linkedRule?.transactionGroupRole ?? null,
        transactionGroupAccountGroupId:
          transaction?.transactionGroupAccountGroupId ??
          linkedRule?.transactionGroupAccountGroupId ??
          null,
        capitalAmount: transaction?.capitalAmount ?? linkedRule?.capitalAmount ?? null,
        interestAmount: transaction?.interestAmount ?? linkedRule?.interestAmount ?? null,
        recurrence: transaction?.recurrence ?? linkedRule?.recurrence ?? null,
        recurrenceDescription: null,
        periodicChange: transaction?.periodicChange ?? linkedRule?.periodicChange ?? null,
        createdAt: transaction?.createdAt ?? null,
        updatedAt: transaction?.updatedAt ?? null
      }),
      legacySourceKey,
      sourceCollection: 'transactions',
      sourceIndex: actualIndex,
      rawRecord: transaction
    });
    scenarioReport.summary.actualTransactionsConverted += 1;
    report.summary.actualTransactionsConverted += 1;
  });

  const groupedByKey = new Map();
  candidateOccurrences.forEach((candidate) => {
    const key = candidate.occurrence.occurrenceKey;
    if (!groupedByKey.has(key)) groupedByKey.set(key, []);
    groupedByKey.get(key).push(candidate);
  });
  const transactionOccurrences = [];
  groupedByKey.forEach((group, occurrenceKey) => {
    const selected = [...group].sort((left, right) => {
      const priority = (candidate) => (
        candidate.occurrence.status === 'actual'
          ? 3
          : (candidate.occurrence.status === 'skipped' ? 2 : 1)
      );
      const priorityDifference = priority(right) - priority(left);
      if (priorityDifference) return priorityDifference;
      return Number(right.occurrence.id) - Number(left.occurrence.id);
    })[0];
    transactionOccurrences.push(selected.occurrence);
    if (group.length > 1) {
      group.filter((candidate) => candidate !== selected).forEach((candidate) => {
        addIssue({
          code: 'duplicate-occurrence',
          message:
            `Duplicate legacy rows resolved to ${occurrenceKey}; deterministic status/ID precedence selected one row.`,
          sourceCollection: candidate.sourceCollection,
          sourceIndex: candidate.sourceIndex,
          sourceId: candidate.rawRecord?.id,
          action: 'preserved-in-report',
          rawRecord: candidate.rawRecord
        });
      });
    }
  });
  transactionOccurrences.sort((left, right) => (
    String(left.scheduledDate || '').localeCompare(String(right.scheduledDate || '')) ||
    String(left.occurrenceKey || '').localeCompare(String(right.occurrenceKey || ''))
  ));
  scenarioReport.summary.occurrencesCreated = transactionOccurrences.length;
  report.summary.occurrencesCreated += transactionOccurrences.length;

  const { projection, clearedRows } = normalizeProjectionForMigration(scenario, migratedAt);
  scenarioReport.summary.projectionRowsCleared = clearedRows;
  report.summary.projectionRowsCleared += clearedRows;
  const planning = scenario?.planning && typeof scenario.planning === 'object'
    ? scenario.planning
    : {};

  return sanitizeScenarioForWrite({
    id: safeNumber(scenario.id, 0) || 0,
    version: safeNumber(scenario.version, 1) || 1,
    name: typeof scenario.name === 'string' && scenario.name
      ? scenario.name
      : 'Unnamed Scenario',
    description:
      scenario.description === null || typeof scenario.description === 'string'
        ? scenario.description
        : null,
    lineage: scenario.lineage && typeof scenario.lineage === 'object'
      ? scenario.lineage
      : null,
    accounts: Array.isArray(scenario.accounts) ? scenario.accounts : [],
    accountGroups: Array.isArray(scenario.accountGroups) ? scenario.accountGroups : [],
    splitTransactionSets: Array.isArray(scenario.splitTransactionSets)
      ? scenario.splitTransactionSets
      : [],
    transactions: rules,
    transactionOccurrences,
    baselinePeriods: Array.isArray(scenario.baselinePeriods)
      ? scenario.baselinePeriods
      : [],
    projection,
    planning: {
      generatePlan: planning.generatePlan || {
        startDate: projection.config.startDate,
        endDate: projection.config.endDate
      },
      advancedGoalSolver: planning.advancedGoalSolver || {
        startDate: projection.config.startDate,
        endDate: projection.config.endDate
      },
      ...(planning.goalWorkshopMode === 'simple' || planning.goalWorkshopMode === 'advanced'
        ? { goalWorkshopMode: planning.goalWorkshopMode }
        : {})
    },
    ...(scenario.advancedGoalSettings !== undefined
      ? { advancedGoalSettings: scenario.advancedGoalSettings }
      : {}),
    ...(scenario.fundSettings !== undefined
      ? { fundSettings: scenario.fundSettings }
      : {})
  });
}

/**
 * Migrate app data to schemaVersion 44.
 *
 * The return value remains AppData for compatibility with existing callers.
 * Migration diagnostics and raw recovery records are stored at
 * `appData.migrationReport`.
 *
 * @param {Object} legacy
 * @param {{ now?: string }} options
 * @returns {Object}
 */
export function migrateAppData(legacy, { now = new Date().toISOString() } = {}) {
  if (legacy?.schemaVersion === CURRENT_SCHEMA_VERSION) {
    return sanitizeAppDataForWrite(legacy);
  }
  if (
    Number.isFinite(Number(legacy?.schemaVersion)) &&
    Number(legacy.schemaVersion) > CURRENT_SCHEMA_VERSION
  ) {
    throw new Error(
      `Cannot migrate future schemaVersion ${legacy.schemaVersion} to ${CURRENT_SCHEMA_VERSION}.`
    );
  }

  const fromSchemaVersion =
    Number.isFinite(Number(legacy?.schemaVersion))
      ? Number(legacy.schemaVersion)
      : null;
  const migratedAt =
    typeof now === 'string' && now
      ? now
      : new Date().toISOString();
  const report = {
    fromSchemaVersion,
    toSchemaVersion: CURRENT_SCHEMA_VERSION,
    migratedAt,
    summary: {
      scenarioCount: 0,
      rulesRetained: 0,
      legacyBudgetRows: 0,
      occurrencesCreated: 0,
      actualTransactionsConverted: 0,
      projectionRowsCleared: 0,
      warningCount: 0,
      recoveryRecordCount: 0
    },
    scenarios: []
  };

  const legacyScenarios = Array.isArray(legacy?.scenarios) ? legacy.scenarios : [];
  const scenarios = legacyScenarios.map((scenario, scenarioIndex) =>
    migrateScenario({
      legacyScenario: scenario,
      scenarioIndex,
      report,
      migratedAt
    })
  );
  report.summary.scenarioCount = scenarios.length;

  const legacyUiState =
    legacy?.uiState && typeof legacy.uiState === 'object'
      ? legacy.uiState
      : {};
  const legacyView =
    legacyUiState.viewPeriodTypeIds && typeof legacyUiState.viewPeriodTypeIds === 'object'
      ? legacyUiState.viewPeriodTypeIds
      : {};
  const uiState = createDefaultUiState({
    lastWorkflowId: inferLastWorkflowId(legacy, legacyScenarios),
    lastScenarioId: safeNumber(legacyUiState.lastScenarioId, null),
    lastScenarioVersion: safeNumber(legacyUiState.lastScenarioVersion, null),
    viewPeriodTypeIds: {
      transactions: legacyView.transactions,
      planActuals: legacyView.planActuals ?? legacyView.budgets,
      projections: legacyView.projections
    },
    accordionStates: legacyUiState.accordionStates
  });

  return sanitizeAppDataForWrite({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    scenarios,
    uiState,
    migrationReport: report
  });
}
