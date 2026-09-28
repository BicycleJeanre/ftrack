// plan-actuals-grid.js
// Unified Budget workflow surface over resolved transaction occurrences and rules.

import { resolveScenarioOccurrences } from '../../../domain/queries/resolve-scenario-occurrences.js';
import { generatePeriods } from '../../../domain/calculations/period-utils.js';
import {
  getRecurrenceDescription
} from '../../../domain/calculations/recurrence-utils.js?v=20260831-recurrence-labels-16';
import { getDefaultProjectionWindowDates } from '../../../shared/app-data-utils.js';
import { formatDateOnly } from '../../../shared/date-utils.js';
import { formatCurrency, numValueClass } from '../../../shared/format-utils.js';
import { findPeriodById, findPeriodIndexById } from '../../../shared/period-window-utils.js';
import { transformTransactionToRows } from '../../transforms/transaction-row-transformer.js';
import { calculateResolvedOccurrenceTotals } from '../../transforms/data-aggregators.js?v=20260927-skipped-totals-49';
import { renderTotalsCard } from '../widgets/totals-card.js?v=20260927-grouped-totals-51';
import { populateAccountSelect } from '../widgets/account-selector-filter.js?v=20260901-account-group-filter-42';
import {
  cleanupItemDetailDismissal,
  installItemDetailDismissal
} from '../widgets/item-detail-dismissal.js?v=20260901-click-off-details-43';
import { openRecurrenceModal } from '../modals/recurrence-modal.js?v=20260926-future-plan-47';
import { openQuickAccountModal } from '../modals/quick-account-modal.js';
import { openBaselinePeriodManager } from '../modals/baseline-period-manager-modal.js?v=20260926-period-history-44';
import { openTextInputModal } from '../modals/text-input-modal.js';
import { createGrid, refreshGridData } from './grid-factory.js';
import { confirmDialog, notifyError, notifySuccess } from '../../../shared/notifications.js';
import { getScenarioPeriods } from '../../../app/services/data-service.js';
import * as OccurrenceManager from '../../../app/managers/occurrence-manager.js?v=20260926-delete-transaction-48';
import * as PeriodVariantManager from '../../../app/managers/period-variant-manager.js?v=20260927-period-what-if-53';
import * as AccountManager from '../../../app/managers/account-manager.js';

const viewByContextScenario = new Map();
const ADD_ACCOUNT_OPTION = '__add_account__';
let pendingEditor = null;
let lastPlanActualsDetailTable = null;
let lastPlanActualsDetailTableReady = false;
let planActualsDetailRuntime = null;
let planActualsDetailLifecycle = 0;
let planActualsDetailContextKey = null;

function normalizePresentation({
  presentation,
  presentationMode,
  mode
} = {}) {
  const config = presentation && typeof presentation === 'object'
    ? presentation
    : {};
  const stringPresentation = typeof presentation === 'string' ? presentation : null;
  const resolvedMode = String(
    config.mode ||
    config.presentationMode ||
    stringPresentation ||
    presentationMode ||
    mode ||
    'summary'
  ).trim().toLowerCase() === 'detail'
    ? 'detail'
    : 'summary';
  const contextKey = String(
    config.contextKey ||
    config.workflowId ||
    config.key ||
    'plan-actuals'
  ).trim() || 'plan-actuals';
  const defaultView = String(config.defaultView || 'period').trim().toLowerCase() === 'recurring'
    ? 'recurring'
    : 'period';

  return {
    ...config,
    mode: resolvedMode,
    contextKey,
    defaultView
  };
}

export function teardownPlanActualsDetailGrid() {
  planActualsDetailLifecycle += 1;
  const table = lastPlanActualsDetailTable;
  lastPlanActualsDetailTable = null;
  lastPlanActualsDetailTableReady = false;
  planActualsDetailRuntime = null;
  planActualsDetailContextKey = null;
  try {
    table?.destroy?.();
  } catch (_) {
    // Ignore cleanup failures while switching presentation or subview.
  }
}

export function teardownPlanActualsGrid({
  container = null,
  teardownRecurringView = null
} = {}) {
  pendingEditor = null;
  teardownPlanActualsDetailGrid();
  try {
    teardownRecurringView?.();
  } catch (_) {
    // Keep the parent activity teardown deterministic if a child cleanup fails.
  }
  if (container) {
    cleanupItemDetailDismissal(container);
    container.innerHTML = '';
  }
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function statusName(occurrence) {
  const rawStatus = typeof occurrence?.status === 'object'
    ? occurrence?.status?.name
    : occurrence?.status;
  return String(occurrence?.displayStatus || rawStatus || 'planned').trim().toLowerCase();
}

function selectedPeriodRange(state) {
  const periods = state?.getBudgetPeriods?.() || [];
  const selected = findPeriodById(periods, state?.getBudgetPeriod?.()) || periods[0] || null;
  if (!selected?.startDate || !selected?.endDate) {
    return { period: selected, startDate: null, endDate: null };
  }
  return {
    period: selected,
    startDate: formatDateOnly(selected.startDate),
    endDate: formatDateOnly(selected.endDate)
  };
}

async function loadPlanPeriods(scenario, periodType) {
  try {
    return await getScenarioPeriods(scenario.id, periodType);
  } catch (_) {
    const fallback = getDefaultProjectionWindowDates();
    return generatePeriods(fallback.startDate, fallback.endDate, periodType || 'Month');
  }
}

function normalizeOccurrenceForPerspective(occurrence) {
  return {
    ...occurrence,
    id: occurrence.occurrenceKey,
    amount: occurrence.plannedAmount,
    plannedAmount: occurrence.plannedAmount,
    actualAmount: occurrence.actualAmount,
    effectiveDate: occurrence.effectiveDate,
    status: {
      name: occurrence.status,
      actualAmount: occurrence.actualAmount,
      actualDate: occurrence.actualDate
    },
    _canonicalOccurrence: occurrence
  };
}

function buildDisplayRows({ occurrences, accounts, accountFilterId }) {
  return (Array.isArray(occurrences) ? occurrences : []).flatMap((occurrence) => {
    const comparisonOccurrence = buildComparisonOccurrences(
      [occurrence],
      accountFilterId
    )[0];
    const transformedRows = transformTransactionToRows(
      normalizeOccurrenceForPerspective(occurrence),
      accounts
    ).map((row) => ({
        ...row,
        occurrenceKey: occurrence.occurrenceKey,
        status: occurrence.status,
        statusName: statusName(occurrence),
        displayStatus: occurrence.displayStatus,
        baselineAmount: occurrence.baselineAmount,
        currentPlanAmount: occurrence.plannedAmount,
        actualAmount: occurrence.actualAmount,
        effectiveDate: occurrence.effectiveDate,
        scheduledDate: occurrence.scheduledDate,
        plannedDate: occurrence.plannedDate,
        actualDate: occurrence.actualDate,
        recurrence: occurrence.recurrence,
        recurrenceDescription: occurrence.recurrenceDescription,
        isOverdue: occurrence.isOverdue,
        isUnplannedActual: occurrence.isUnplannedActual,
        _canonicalOccurrence: occurrence,
        _comparisonOccurrence: comparisonOccurrence
      }));

    if (!accountFilterId) {
      return transformedRows.filter((row) => !String(row.id || '').endsWith('_flipped'));
    }

    const currentPerspectiveRow = transformedRows.find(
      (row) => Number(row.perspectiveAccountId) === Number(accountFilterId)
    );
    if (currentPerspectiveRow) return [currentPerspectiveRow];

    const baselineIncludesAccount =
      Number(occurrence?.baselinePrimaryAccountId ?? occurrence?.primaryAccountId) ===
        Number(accountFilterId) ||
      Number(occurrence?.baselineSecondaryAccountId ?? occurrence?.secondaryAccountId) ===
        Number(accountFilterId);
    if (!baselineIncludesAccount || !transformedRows.length) return [];

    // Keep rows that belonged to the selected account in the captured baseline
    // even if the current plan moved them to a different account. The
    // comparison occurrence zeroes the current contribution for that account,
    // so visible rows and totals remain consistent.
    return [{
      ...transformedRows[0],
      id: `${occurrence.occurrenceKey}:baseline-perspective:${accountFilterId}`,
      perspectiveAccountId: Number(accountFilterId),
      _baselineOnlyPerspective: true
    }];
  });
}

function attachPromotedRecurrence(occurrences, transactions) {
  const promotedRules = new Map(
    (Array.isArray(transactions) ? transactions : [])
      .filter((transaction) => transaction?.promotedFromOccurrenceKey)
      .map((transaction) => [String(transaction.promotedFromOccurrenceKey), transaction])
  );

  return (Array.isArray(occurrences) ? occurrences : []).map((occurrence) => {
    const promotedRule = promotedRules.get(String(occurrence?.occurrenceKey || ''));
    if (!promotedRule) return occurrence;
    return {
      ...occurrence,
      recurrence: promotedRule.recurrence || occurrence.recurrence || null,
      recurrenceDescription:
        promotedRule.recurrenceDescription || occurrence.recurrenceDescription || '',
      promotedTransactionId: promotedRule.id
    };
  });
}

function perspectiveType(typeId, primaryAccountId, secondaryAccountId, accountFilterId) {
  const normalizedTypeId = Number(typeId);
  if (normalizedTypeId !== 1 && normalizedTypeId !== 2) return null;
  if (!accountFilterId) return normalizedTypeId;
  if (Number(primaryAccountId) === Number(accountFilterId)) return normalizedTypeId;
  if (Number(secondaryAccountId) === Number(accountFilterId)) {
    return normalizedTypeId === 1 ? 2 : 1;
  }
  return null;
}

function buildComparisonOccurrences(occurrences, accountFilterId) {
  return (Array.isArray(occurrences) ? occurrences : []).map((occurrence) => {
    const currentTypeId = perspectiveType(
      occurrence?.transactionTypeId,
      occurrence?.primaryAccountId,
      occurrence?.secondaryAccountId,
      accountFilterId
    );
    const baselineTypeId = perspectiveType(
      occurrence?.baselineTransactionTypeId ?? occurrence?.transactionTypeId,
      occurrence?.baselinePrimaryAccountId ?? occurrence?.primaryAccountId,
      occurrence?.baselineSecondaryAccountId ?? occurrence?.secondaryAccountId,
      accountFilterId
    );
    return {
      ...occurrence,
      transactionTypeId: currentTypeId,
      baselineTransactionTypeId: baselineTypeId,
      plannedAmount: currentTypeId ? occurrence?.plannedAmount : 0,
      actualAmount: currentTypeId ? occurrence?.actualAmount : 0,
      baselineAmount: baselineTypeId ? occurrence?.baselineAmount : 0,
      isIncludedInForecast:
        Boolean(currentTypeId) && occurrence?.isIncludedInForecast !== false
    };
  });
}

function createSelect(id, options, value = '') {
  const select = document.createElement('select');
  select.id = id;
  select.className = 'input-select';
  (options || []).forEach(({ value: optionValue, label }) => {
    const option = document.createElement('option');
    option.value = String(optionValue ?? '');
    option.textContent = label;
    select.appendChild(option);
  });
  select.value = String(value ?? '');
  return select;
}

function createHeaderFilterItem(labelText, control, className = '') {
  const item = document.createElement('div');
  item.className = `header-filter-item${className ? ` ${className}` : ''}`;
  if (labelText) {
    const label = document.createElement('label');
    label.textContent = labelText;
    if (control?.id) label.htmlFor = control.id;
    item.appendChild(label);
  }
  item.appendChild(control);
  return item;
}

function ensureModeToggle({ container, viewKey, view, onChange }) {
  const card = container.closest('.forecast-card');
  const header = card?.querySelector(':scope > .card-header');
  const headerLeft = header?.querySelector('.card-header-actions');
  const label = headerLeft?.querySelector('.dash-panel-label');
  if (label) label.textContent = 'Plan & Actuals';
  if (!headerLeft) return;

  let switcher = headerLeft.querySelector('.plan-actuals-mode-switch');
  if (!switcher) {
    switcher = document.createElement('div');
    switcher.className = 'plan-actuals-mode-switch';
    switcher.setAttribute('role', 'tablist');
    switcher.setAttribute('aria-label', 'Plan and actuals view');
    headerLeft.appendChild(switcher);
  }

  switcher.innerHTML = '';
  [
    { id: 'period', label: 'Period' },
    { id: 'recurring', label: 'Recurring' }
  ].forEach((mode) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `plan-actuals-mode-btn${view === mode.id ? ' active' : ''}`;
    button.textContent = mode.label;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', view === mode.id ? 'true' : 'false');
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (view === mode.id) return;
      viewByContextScenario.set(viewKey, mode.id);
      await onChange(mode.id);
    });
    switcher.appendChild(button);
  });
}

function renderComparisonTotals(target, occurrences) {
  const totals = calculateResolvedOccurrenceTotals(occurrences);
  const money = (value) => formatCurrency(value || 0);
  renderTotalsCard(target, {
    title: 'PLAN & ACTUALS',
    columnsClass: 'plan-actuals-total-groups',
    groups: [
      {
        key: 'baseline',
        title: 'Baseline',
        items: [{
          label: 'Baseline Net',
          valueHtml: money(totals.baselineNet),
          valueClass: numValueClass(totals.baselineNet),
          calc: 'Baseline Income − Baseline Expenses.',
          shows: 'The captured or original period plan.'
        }]
      },
      {
        key: 'current-outlook',
        title: 'Current Outlook',
        items: [
          {
            label: 'Current Plan Net',
            valueHtml: money(totals.currentPlannedNet),
            valueClass: numValueClass(totals.currentPlannedNet),
            calc: 'Current Planned Income − Current Planned Expenses.',
            shows: 'The latest adjusted period plan.'
          },
          {
            label: 'Actual Net',
            valueHtml: money(totals.actualNet),
            valueClass: numValueClass(totals.actualNet),
            calc: 'Actual Income − Actual Expenses.',
            shows: 'What has happened in this period.'
          },
          {
            label: 'Open Commitments',
            valueHtml: money(totals.remainingCommitments),
            valueClass: numValueClass(totals.remainingCommitments),
            calc: 'Signed unresolved planned occurrences.',
            shows: 'The remaining period plan.'
          },
          {
            label: 'Forecast Net',
            valueHtml: money(totals.forecastNet),
            valueClass: numValueClass(totals.forecastNet),
            calc: 'Actual Net + Open Commitments.',
            shows: 'Expected result if the remaining plan happens.'
          }
        ]
      },
      {
        key: 'performance',
        title: 'Performance & Exceptions',
        items: [
          {
            label: 'Actual vs Baseline',
            valueHtml: money(totals.actualVsBaselineVariance),
            valueClass: numValueClass(totals.actualVsBaselineVariance),
            calc: 'Actual Net − Baseline Net.',
            shows: 'Variance from the original period plan.'
          },
          {
            label: 'Actual vs Current',
            valueHtml: money(totals.actualVsCurrentPlanVariance),
            valueClass: numValueClass(totals.actualVsCurrentPlanVariance),
            calc: 'Actual Net − Current Plan Net.',
            shows: 'Variance from the latest plan.'
          },
          {
            label: 'Unplanned Actuals',
            valueHtml: money(totals.unbudgetedActuals),
            valueClass: numValueClass(totals.unbudgetedActuals),
            calc: 'Actual occurrences with a zero baseline.',
            shows: 'Net surprises in this period.'
          }
        ]
      }
    ]
  });
}

function accountName(accounts, id) {
  return (accounts || []).find((account) => Number(account.id) === Number(id))?.name || 'Unassigned';
}

function movementTypeLabel(typeId) {
  if (Number(typeId) === 1) return 'Money In';
  if (Number(typeId) === 2) return 'Money Out';
  return 'Outside selected account';
}

function movementTextFromDimensions({
  transactionTypeId,
  primaryAccountId,
  secondaryAccountId
}, accounts) {
  const primaryName = accountName(accounts, primaryAccountId);
  const secondaryName = secondaryAccountId
    ? accountName(accounts, secondaryAccountId)
    : 'External';
  return Number(transactionTypeId) === 1
    ? `${secondaryName} → ${primaryName}`
    : `${primaryName} → ${secondaryName}`;
}

function orientMovementDimensions({
  transactionTypeId,
  primaryAccountId,
  secondaryAccountId,
  perspectiveAccountId
}) {
  const perspectiveIsPrimary =
    perspectiveAccountId &&
    Number(primaryAccountId) === Number(perspectiveAccountId);
  const perspectiveIsSecondary =
    perspectiveAccountId &&
    !perspectiveIsPrimary &&
    Number(secondaryAccountId) === Number(perspectiveAccountId);

  return {
    transactionTypeId,
    primaryAccountId: perspectiveIsSecondary
      ? secondaryAccountId
      : primaryAccountId,
    secondaryAccountId: perspectiveIsSecondary
      ? primaryAccountId
      : secondaryAccountId
  };
}

function currentMovementDimensions(row) {
  const occurrence = row?._canonicalOccurrence || row;
  const comparisonOccurrence = row?._comparisonOccurrence || occurrence;
  return orientMovementDimensions({
    transactionTypeId:
      comparisonOccurrence?.transactionTypeId ??
      occurrence?.transactionTypeId,
    primaryAccountId: occurrence?.primaryAccountId,
    secondaryAccountId: occurrence?.secondaryAccountId,
    perspectiveAccountId: row?.perspectiveAccountId
  });
}

function baselineMovementDimensions(row) {
  const occurrence = row?._canonicalOccurrence || row;
  const comparisonOccurrence = row?._comparisonOccurrence || occurrence;
  return orientMovementDimensions({
    transactionTypeId:
      comparisonOccurrence?.baselineTransactionTypeId ??
      occurrence?.baselineTransactionTypeId ??
      occurrence?.transactionTypeId,
    primaryAccountId:
      occurrence?.baselinePrimaryAccountId ?? occurrence?.primaryAccountId,
    secondaryAccountId:
      occurrence?.baselineSecondaryAccountId ?? occurrence?.secondaryAccountId,
    perspectiveAccountId: row?.perspectiveAccountId
  });
}

function movementDimensions(row) {
  return row?._baselineOnlyPerspective
    ? baselineMovementDimensions(row)
    : currentMovementDimensions(row);
}

async function runAction(button, action) {
  if (!button || button.disabled) return;
  const previous = button.textContent;
  try {
    button.disabled = true;
    button.textContent = '…';
    await action();
  } catch (error) {
    notifyError(error?.message || String(error));
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = previous;
    }
  }
}

function recurrenceLabel(occurrence) {
  if (occurrence?.recurrence) {
    const description = getRecurrenceDescription(occurrence.recurrence);
    if (description) return description;
  }
  return occurrence?.recurrenceDescription || 'One time';
}

function hasCapturedBaseline(occurrence) {
  return (
    Number(occurrence?.baselineSnapshotVersion) === 1 ||
    occurrence?.baselineState === 'stored' ||
    occurrence?.baselineState === 'frozen-new'
  );
}

function baselineHistoryState(occurrence) {
  if (occurrence?.baselinePeriodClosed) return 'closed';
  return hasCapturedBaseline(occurrence) ? 'captured' : 'live';
}

function buildBaselineHistoryBadge(occurrence) {
  const historyState = baselineHistoryState(occurrence);
  const labels = {
    closed: 'Closed',
    captured: 'Baseline captured',
    live: 'Live'
  };
  const titles = {
    closed: 'This occurrence belongs to a closed period. Its period baseline is protected history.',
    captured: 'This occurrence has its own comparison baseline. The rest of the period remains live and editable.',
    live: 'This occurrence has no captured baseline. Its baseline follows the current plan.'
  };
  const badge = document.createElement('span');
  badge.className = `plan-actuals-history-badge is-${historyState}`;
  badge.textContent = labels[historyState];
  badge.title = titles[historyState];
  badge.setAttribute('aria-label', badge.title);
  return badge;
}

function recurrenceTypeId(recurrence) {
  const raw = recurrence?.recurrenceType ?? recurrence?.recurrenceTypeId;
  return Number(typeof raw === 'object' ? raw?.id : raw);
}

function isRecurringPattern(recurrence) {
  const typeId = recurrenceTypeId(recurrence);
  return Number.isFinite(typeId) && typeId !== 1;
}

function normalizeRecurringPattern(recurrence) {
  return isRecurringPattern(recurrence) ? recurrence : null;
}

function buildAccountSelect(
  accounts,
  accountGroups,
  selectedId,
  {
    includeNone = false,
    onQuickAdd = null,
    quickAddDefaultTypeId = 1
  } = {}
) {
  const select = document.createElement('select');
  select.className = 'grid-summary-input';
  populateAccountSelect(select, {
    accounts,
    accountGroups,
    selectedId: hasValue(selectedId) ? selectedId : '',
    includeAll: false,
    ...(includeNone ? { emptyLabel: '— None —' } : {}),
    extraOptions: typeof onQuickAdd === 'function'
      ? [{ value: ADD_ACCOUNT_OPTION, label: '＋ Add new account…' }]
      : [],
    actionValues: [ADD_ACCOUNT_OPTION]
  });
  let previousValue = select.value;
  select.addEventListener('change', async () => {
    if (select.value !== ADD_ACCOUNT_OPTION) {
      previousValue = select.value;
      return;
    }
    select.value = previousValue;
    const payload = await openQuickAccountModal({
      defaultTypeId: typeof quickAddDefaultTypeId === 'function'
        ? quickAddDefaultTypeId()
        : quickAddDefaultTypeId
    });
    if (!payload) return;
    const draft = onQuickAdd(payload);
    if (!draft?.value) return;
    const option = document.createElement('option');
    option.value = draft.value;
    option.textContent = `${draft.label || payload.name} (new)`;
    select.insertBefore(option, select.querySelector(`option[value="${ADD_ACCOUNT_OPTION}"]`));
    select.value = draft.value;
    previousValue = draft.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  return select;
}

function buildOccurrenceEditor({
  scenarioId,
  occurrence = null,
  accounts,
  accountGroups = [],
  state,
  variantId = '',
  onCancel,
  onSaved
}) {
  const form = document.createElement('form');
  form.className = 'plan-actuals-editor grid-summary-form';

  const isNew = !occurrence;
  const isVariant = Boolean(variantId);
  const existingStatus = String(occurrence?.status || 'planned');
  const hasPromotedSource = Boolean(occurrence?.promotedTransactionId);
  const hasLinkedSource = Boolean(occurrence?.sourceTransactionId) || hasPromotedSource;
  const hasRecurringSource = hasLinkedSource && isRecurringPattern(occurrence?.recurrence);
  const canEditLinkedSeries = Boolean(occurrence?.sourceTransactionId) &&
    hasRecurringSource && existingStatus === 'planned';
  const { startDate } = selectedPeriodRange(state);
  const filteredAccountId = Number(state?.getBudgetAccountFilterId?.() || 0);
  const filteredPrimaryAccount = (accounts || []).find(
    (account) => Number(account?.id) === filteredAccountId
  );
  const defaultPrimaryId = filteredPrimaryAccount?.id ?? accounts?.[0]?.id ?? null;
  const defaultDate = occurrence?.effectiveDate || occurrence?.scheduledDate || startDate || formatDateOnly(new Date());
  let selectedRecurrence = normalizeRecurringPattern(occurrence?.recurrence);
  let recurrenceTouched = false;
  let nextAccountDraftId = 1;
  const accountDrafts = new Map();
  const materializedAccountIds = new Map();

  const registerAccountDraft = (payload) => {
    const value = `draft-account-${nextAccountDraftId++}`;
    accountDrafts.set(value, payload);
    return { value, label: payload.name };
  };

  const typeSelect = createSelect('', [
    { value: 1, label: 'Money In' },
    { value: 2, label: 'Money Out' }
  ], occurrence?.transactionTypeId || 2);
  typeSelect.className = 'grid-summary-input';
  const primarySelect = buildAccountSelect(
    accounts,
    accountGroups,
    occurrence?.primaryAccountId ?? defaultPrimaryId,
    {
      onQuickAdd: registerAccountDraft,
      quickAddDefaultTypeId: 1
    }
  );
  const secondarySelect = buildAccountSelect(
    accounts,
    accountGroups,
    occurrence?.secondaryAccountId,
    {
      includeNone: true,
      onQuickAdd: registerAccountDraft,
      quickAddDefaultTypeId: () => Number(typeSelect.value) === 1 ? 4 : 5
    }
  );

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'grid-summary-input';
  dateInput.value = defaultDate || '';

  const resolveSelectedAccountId = async (value) => {
    if (!value) return null;
    if (materializedAccountIds.has(value)) return materializedAccountIds.get(value);
    const draft = accountDrafts.get(value);
    if (!draft) {
      const accountId = Number(value);
      return Number.isFinite(accountId) && accountId > 0 ? accountId : null;
    }

    const data = await AccountManager.create(
      scenarioId,
      {
        ...draft,
        openDate: dateInput.value || defaultDate
      },
      { notify: false }
    );
    const updatedScenario = data.scenarios?.find(
      (item) => Number(item.id) === Number(scenarioId)
    );
    const createdAccount = updatedScenario?.accounts?.[updatedScenario.accounts.length - 1];
    const accountId = Number(createdAccount?.id || 0) || null;
    if (!accountId) throw new Error(`Could not create account "${draft.name}".`);
    materializedAccountIds.set(value, accountId);
    if (
      Array.isArray(accounts) &&
      !accounts.some((account) => Number(account?.id) === accountId)
    ) {
      accounts.push(createdAccount);
    }
    return accountId;
  };

  const descriptionInput = document.createElement('input');
  descriptionInput.type = 'text';
  descriptionInput.className = 'grid-summary-input';
  descriptionInput.value = occurrence?.description || '';
  descriptionInput.placeholder = 'Description';

  const plannedInput = document.createElement('input');
  plannedInput.type = 'number';
  plannedInput.min = '0';
  plannedInput.step = '0.01';
  plannedInput.className = 'grid-summary-input';
  plannedInput.value = hasValue(occurrence?.plannedAmount) ? Math.abs(Number(occurrence.plannedAmount)) : '';

  const statusOptions = isVariant
    ? existingStatus === 'actual'
      ? [{ value: 'actual', label: 'Actual (read-only history)' }]
      : [
          { value: 'planned', label: 'Planned' },
          { value: 'skipped', label: 'Skipped' }
        ]
    : isNew
    ? [
        { value: 'planned', label: 'Planned' },
        { value: 'actual', label: 'Actual' }
      ]
    : existingStatus === 'actual'
      ? [
          { value: 'actual', label: 'Actual' },
          { value: 'planned', label: 'Planned (undo actual)' }
        ]
      : existingStatus === 'skipped'
        ? [
            { value: 'skipped', label: 'Skipped' },
            { value: 'planned', label: 'Restore to planned' }
          ]
        : [
            { value: 'planned', label: 'Planned' },
            { value: 'actual', label: 'Actual' },
            { value: 'skipped', label: 'Skipped' }
          ];
  const statusSelect = createSelect('', statusOptions, existingStatus);
  statusSelect.className = 'grid-summary-input';

  const actualInput = document.createElement('input');
  actualInput.type = 'number';
  actualInput.min = '0';
  actualInput.step = '0.01';
  actualInput.className = 'grid-summary-input';
  actualInput.value = hasValue(occurrence?.actualAmount) ? Math.abs(Number(occurrence.actualAmount)) : '';
  actualInput.placeholder = 'Actual amount';

  const recurrenceButton = document.createElement('button');
  recurrenceButton.type = 'button';
  recurrenceButton.className = 'plan-actuals-recurrence-btn';
  const updateRecurrenceButton = async () => {
    recurrenceButton.textContent = selectedRecurrence
      ? (await getRecurrenceDescription(selectedRecurrence)) || 'Recurring'
      : 'One time';
  };
  updateRecurrenceButton();
  recurrenceButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const recurrenceDraft = isNew && (dateInput.value || defaultDate)
      ? OccurrenceManager.anchorRecurrenceToDate(
        selectedRecurrence || {
          recurrenceType: { id: 1, name: 'One Time' },
          interval: 1,
          endDate: null
        },
        dateInput.value || defaultDate
      )
      : selectedRecurrence;
    openRecurrenceModal(recurrenceDraft, async (nextRecurrence) => {
      const normalizedRecurrence = normalizeRecurringPattern(nextRecurrence);
      if (hasRecurringSource && !normalizedRecurrence) {
        notifyError(
          'A linked recurring rule cannot be converted to one time from a period item.'
        );
        return;
      }
      selectedRecurrence = normalizedRecurrence;
      recurrenceTouched = true;
      if (canEditLinkedSeries && scopeSelect.value === 'occurrence') {
        scopeSelect.value = 'future';
        scopeSelect.title = 'Repeat changes apply to this and future occurrences.';
        scopeSelect.dispatchEvent(new Event('change'));
      }
      await updateRecurrenceButton();
    });
  });
  if (isVariant) {
    recurrenceButton.disabled = true;
    recurrenceButton.title = 'A what-if snapshot changes only this period; recurring rules stay in Base.';
  }

  const scopeSelect = createSelect('', [
    { value: 'occurrence', label: 'This occurrence only' },
    { value: 'future', label: 'This and future' },
    { value: 'series', label: 'Entire series' }
  ], 'occurrence');
  scopeSelect.className = 'grid-summary-input';
  scopeSelect.disabled = !canEditLinkedSeries;

  if (hasPromotedSource || (existingStatus === 'actual' && hasRecurringSource)) {
    recurrenceButton.title =
      'Repeat changes from an actual item apply to future occurrences.';
  } else if (hasLinkedSource && !hasRecurringSource && existingStatus !== 'skipped') {
    recurrenceButton.title = 'Choose a repeat pattern to create future occurrences.';
  } else if (hasLinkedSource && !canEditLinkedSeries) {
    recurrenceButton.disabled = true;
    recurrenceButton.title = hasRecurringSource
      ? 'Restore this occurrence to planned before changing its recurring series.'
      : 'This item is linked to a one-time rule; edit this occurrence only.';
  }

  scopeSelect.addEventListener('change', () => {
    const occurrenceOnly = scopeSelect.value === 'occurrence';
    dateInput.disabled = !occurrenceOnly;
    if (!occurrenceOnly) dateInput.value = defaultDate || '';
  });

  const addField = (label, input, full = false) => {
    const field = document.createElement('div');
    field.className = `grid-summary-field${full ? ' form-field--full' : ''}`;
    const labelEl = document.createElement('label');
    labelEl.className = 'grid-summary-label';
    labelEl.textContent = label;
    field.appendChild(labelEl);
    field.appendChild(input);
    form.appendChild(field);
  };

  addField('Primary account', primarySelect);
  addField('Secondary account', secondarySelect);
  addField('Movement', typeSelect);
  addField('Date', dateInput);
  addField('Current plan', plannedInput);
  addField('Status', statusSelect);
  addField('Actual amount', actualInput);
  addField('Repeat', recurrenceButton);
  addField('Description', descriptionInput, true);
  if (canEditLinkedSeries && !isVariant) addField('Apply change to', scopeSelect, true);

  const lineItemsField = document.createElement('section');
  lineItemsField.className = 'plan-actuals-line-items form-field--full';
  const lineItemsHeader = document.createElement('div');
  lineItemsHeader.className = 'plan-actuals-line-items-header';
  const lineItemsHeading = document.createElement('div');
  const lineItemsTitle = document.createElement('strong');
  lineItemsTitle.textContent = 'Transaction line items';
  const lineItemsHint = document.createElement('span');
  lineItemsHint.className = 'text-secondary';
  lineItemsHint.textContent = 'Add each line item here. The transaction total is calculated automatically.';
  lineItemsHeading.appendChild(lineItemsTitle);
  lineItemsHeading.appendChild(lineItemsHint);
  const addLineItemButton = document.createElement('button');
  addLineItemButton.type = 'button';
  addLineItemButton.className = 'btn btn-secondary plan-actuals-add-line-item';
  addLineItemButton.textContent = '+ Add line item';
  const lineItemsBody = document.createElement('div');
  lineItemsBody.className = 'plan-actuals-line-items-body';
  const lineItemsFooter = document.createElement('div');
  lineItemsFooter.className = 'plan-actuals-line-items-footer';
  const lineItemsCount = document.createElement('span');
  lineItemsCount.className = 'text-secondary';
  const lineItemsTotal = document.createElement('strong');
  lineItemsFooter.appendChild(lineItemsCount);
  lineItemsFooter.appendChild(lineItemsTotal);
  lineItemsHeader.appendChild(lineItemsHeading);
  lineItemsHeader.appendChild(addLineItemButton);
  lineItemsField.appendChild(lineItemsHeader);
  lineItemsField.appendChild(lineItemsBody);
  lineItemsField.appendChild(lineItemsFooter);
  form.appendChild(lineItemsField);

  const lineItemRows = [];
  let nextLineItemId = 1;
  const collectLineItems = () => lineItemRows.flatMap((line) => {
    const amount = Math.abs(Number(line.amount.value || 0));
    if (!Number.isFinite(amount) || amount <= 0) return [];
    return [{
      id: line.id,
      date: line.date.value || dateInput.value || defaultDate,
      description: line.description.value.trim(),
      amount
    }];
  });
  const refreshLineItemTotal = () => {
    const items = collectLineItems();
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    lineItemsCount.textContent = `${items.length} line item${items.length === 1 ? '' : 's'}`;
    lineItemsTotal.textContent = formatCurrency(total);
    const hasRows = lineItemRows.length > 0;
    const target = statusSelect.value === 'actual' ? actualInput : plannedInput;
    plannedInput.readOnly = hasRows && statusSelect.value !== 'actual';
    actualInput.readOnly = hasRows && statusSelect.value === 'actual';
    plannedInput.classList.toggle(
      'grid-summary-input--readonly',
      plannedInput.readOnly
    );
    actualInput.classList.toggle(
      'grid-summary-input--readonly',
      actualInput.readOnly
    );
    if (hasRows) target.value = total.toFixed(2);
  };
  const addLineItem = (item = {}) => {
    const row = document.createElement('div');
    row.className = 'plan-actuals-line-item';
    const id = String(item.id || `line-${Date.now()}-${nextLineItemId++}`);
    const lineDate = document.createElement('input');
    lineDate.type = 'date';
    lineDate.className = 'grid-summary-input plan-actuals-line-item-date';
    lineDate.value = item.date || dateInput.value || defaultDate || '';
    lineDate.setAttribute('aria-label', 'Line item date');
    const lineDescription = document.createElement('input');
    lineDescription.type = 'text';
    lineDescription.className = 'grid-summary-input plan-actuals-line-item-description';
    lineDescription.value = String(item.description || '');
    lineDescription.placeholder = 'Line item description';
    lineDescription.setAttribute('aria-label', 'Line item description');
    const lineAmount = document.createElement('input');
    lineAmount.type = 'number';
    lineAmount.min = '0';
    lineAmount.step = '0.01';
    lineAmount.className = 'grid-summary-input plan-actuals-line-item-amount';
    lineAmount.value = Number(item.amount || 0) > 0 ? String(Math.abs(Number(item.amount))) : '';
    lineAmount.placeholder = 'Amount';
    lineAmount.setAttribute('aria-label', 'Line item amount');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn plan-actuals-remove-line-item';
    remove.title = 'Remove line item';
    remove.setAttribute('aria-label', 'Remove line item');
    remove.textContent = '×';
    const line = {
      row,
      id,
      date: lineDate,
      description: lineDescription,
      amount: lineAmount
    };
    lineItemRows.push(line);
    row.appendChild(lineDate);
    row.appendChild(lineDescription);
    row.appendChild(lineAmount);
    row.appendChild(remove);
    lineItemsBody.appendChild(row);
    [lineDate, lineDescription, lineAmount].forEach((input) => {
      input.addEventListener('input', refreshLineItemTotal);
      input.addEventListener('change', refreshLineItemTotal);
    });
    remove.addEventListener('click', () => {
      const index = lineItemRows.indexOf(line);
      if (index >= 0) lineItemRows.splice(index, 1);
      row.remove();
      refreshLineItemTotal();
    });
    refreshLineItemTotal();
    return line;
  };
  (Array.isArray(occurrence?.lineItems) ? occurrence.lineItems : []).forEach(addLineItem);
  addLineItemButton.addEventListener('click', () => {
    if (!lineItemRows.length && occurrence) {
      const existingAmount = existingStatus === 'actual'
        ? Math.abs(Number(occurrence.actualAmount || 0))
        : Math.abs(Number(occurrence.plannedAmount || 0));
      if (existingAmount > 0) {
        addLineItem({
          date: occurrence.actualDate || occurrence.effectiveDate || defaultDate,
          description: occurrence.description || 'Existing amount',
          amount: existingAmount
        });
      }
    }
    const line = addLineItem({ date: dateInput.value || defaultDate });
    line.description.focus();
  });
  statusSelect.addEventListener('change', () => {
    if (
      existingStatus === 'actual' &&
      statusSelect.value === 'planned' &&
      Math.abs(Number(plannedInput.value || 0)) === 0
    ) {
      plannedInput.value = String(Math.abs(Number(actualInput.value || 0)));
    }
    refreshLineItemTotal();
  });
  refreshLineItemTotal();

  const actions = document.createElement('div');
  actions.className = 'grid-summary-form-actions';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn btn-secondary';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', (event) => {
    event.preventDefault();
    onCancel?.();
  });
  const saveButton = document.createElement('button');
  saveButton.type = 'submit';
  saveButton.className = 'btn btn-primary';
  saveButton.textContent = isNew ? 'Add item' : 'Save';
  actions.appendChild(cancelButton);
  actions.appendChild(saveButton);
  form.appendChild(actions);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const selectedStatus = statusSelect.value || 'planned';
    const lineItems = collectLineItems();
    const itemizedTotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const plannedAmount = lineItems.length && selectedStatus !== 'actual'
      ? itemizedTotal
      : Math.abs(Number(plannedInput.value || 0));
    const actualAmount = lineItems.length && selectedStatus === 'actual'
      ? itemizedTotal
      : Math.abs(Number(actualInput.value || plannedAmount || 0));
    const recurrenceForSave = isNew && isRecurringPattern(selectedRecurrence)
      ? OccurrenceManager.anchorRecurrenceToDate(
        selectedRecurrence,
        dateInput.value || defaultDate
      )
      : selectedRecurrence;

    await runAction(saveButton, async () => {
      const occurrenceUpdates = {
        primaryAccountId: await resolveSelectedAccountId(primarySelect.value),
        secondaryAccountId: await resolveSelectedAccountId(secondarySelect.value),
        transactionTypeId: Number(typeSelect.value || 2),
        plannedDate: dateInput.value || null,
        plannedAmount,
        description: descriptionInput.value.trim(),
        lineItems
      };
      const ruleUpdates = {
        primaryAccountId: occurrenceUpdates.primaryAccountId,
        secondaryAccountId: occurrenceUpdates.secondaryAccountId,
        transactionTypeId: occurrenceUpdates.transactionTypeId,
        amount: existingStatus === 'actual' && plannedAmount === 0
          ? actualAmount
          : plannedAmount,
        description: occurrenceUpdates.description,
        lineItems
      };
      if (recurrenceTouched) ruleUpdates.recurrence = selectedRecurrence;
      const promotionRuleUpdates = {
        ...ruleUpdates,
        amount: selectedStatus === 'actual' ? actualAmount : plannedAmount
      };
      delete promotionRuleUpdates.recurrence;

      if (isVariant) {
        const result = isNew
          ? await PeriodVariantManager.createOccurrence(scenarioId, variantId, {
              ...occurrenceUpdates,
              scheduledDate: dateInput.value || defaultDate,
              plannedAmount,
              status: selectedStatus
            })
          : await PeriodVariantManager.updateOccurrence(
              scenarioId,
              variantId,
              occurrence.occurrenceKey,
              {
                ...occurrenceUpdates,
                status: selectedStatus,
                plannedAmount
              }
            );
        pendingEditor = null;
        onSaved?.(result?.scenario);
        return;
      }

      if (isNew) {
        const scheduledDate = dateInput.value || defaultDate;
        if (selectedStatus === 'planned' && isRecurringPattern(recurrenceForSave)) {
          await OccurrenceManager.createRecurringRule(scenarioId, {
            ...occurrenceUpdates,
            scheduledDate,
            plannedAmount,
            recurrence: recurrenceForSave
          });
        } else {
          const created = await OccurrenceManager.createManualOccurrence(scenarioId, {
            ...occurrenceUpdates,
            scheduledDate,
            status: selectedStatus,
            plannedAmount: selectedStatus === 'actual' ? 0 : plannedAmount,
            actualAmount: selectedStatus === 'actual' ? actualAmount : null,
            actualDate: selectedStatus === 'actual' ? scheduledDate : null
          });
          if (isRecurringPattern(recurrenceForSave) && created?.occurrence?.occurrenceKey) {
            await OccurrenceManager.promoteOccurrenceToRecurring(
              scenarioId,
              created.occurrence.occurrenceKey,
              {
                recurrence: recurrenceForSave,
                ruleUpdates: promotionRuleUpdates
              }
            );
          }
        }
      } else {
        const key = occurrence.occurrenceKey;
        const scope = scopeSelect.value;
        let actionKey = key;

        if (existingStatus === 'actual') {
          if (
            recurrenceTouched &&
            isRecurringPattern(selectedRecurrence) &&
            (hasRecurringSource || hasPromotedSource)
          ) {
            await OccurrenceManager.updateRecurringRuleAfterActual(
              scenarioId,
              key,
              ruleUpdates
            );
          }
          if (selectedStatus === 'actual') {
            await OccurrenceManager.updateActualOccurrence(scenarioId, key, {
              ...occurrenceUpdates,
              actualAmount,
              actualDate: dateInput.value || occurrence.actualDate || occurrence.scheduledDate
            });
          } else {
            await OccurrenceManager.restoreActualToPlanned(
              scenarioId,
              key,
              occurrenceUpdates
            );
          }
        } else {
          let updated;
          if (scope === 'future') {
            updated = await OccurrenceManager.updateThisAndFuture(scenarioId, key, ruleUpdates);
          } else if (scope === 'series') {
            updated = await OccurrenceManager.updateEntireSeries(scenarioId, key, ruleUpdates);
          } else {
            updated = await OccurrenceManager.updateOccurrenceOnly(
              scenarioId,
              key,
              occurrenceUpdates
            );
          }
          actionKey = updated?.occurrenceKey || key;
          if (selectedStatus === 'actual') {
            await OccurrenceManager.markActual(scenarioId, actionKey, {
              actualAmount,
              actualDate: dateInput.value || occurrence.actualDate || occurrence.scheduledDate,
              lineItems
            });
          } else if (selectedStatus === 'skipped') {
            if (existingStatus !== 'skipped') {
              await OccurrenceManager.markSkipped(scenarioId, actionKey);
            }
          } else if (existingStatus !== 'planned') {
            await OccurrenceManager.updateOccurrenceOnly(
              scenarioId,
              actionKey,
              { status: 'planned' }
            );
          }
        }

        if (
          recurrenceTouched &&
          isRecurringPattern(selectedRecurrence) &&
          selectedStatus !== 'skipped' &&
          !hasRecurringSource &&
          !hasPromotedSource
        ) {
          await OccurrenceManager.promoteOccurrenceToRecurring(scenarioId, actionKey, {
            recurrence: selectedRecurrence,
            ruleUpdates: promotionRuleUpdates
          });
        }
      }
      pendingEditor = null;
      onSaved?.();
    });
  });

  return form;
}

function actionButton({ title, text, onClick, className = '' }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `icon-btn plan-actuals-action${className ? ` ${className}` : ''}`;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.textContent = text;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick(button);
  });
  return button;
}

function buildCompletionControl({ occurrence, scenarioId, state, variantId = '', onChanged }) {
  const status = statusName(occurrence);
  const isActual = status === 'actual';
  const isSkipped = status === 'skipped';
  const label = document.createElement('label');
  label.className =
    `plan-actuals-status plan-actuals-completion status-${status}` +
    `${isActual ? ' is-complete' : ''}`;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = isActual;
  checkbox.disabled = Boolean(variantId) || isSkipped;
  checkbox.setAttribute(
    'aria-label',
    isActual
      ? `Restore ${occurrence.description || 'item'} to planned`
      : `Mark ${occurrence.description || 'item'} as actual`
  );
  checkbox.title = variantId
    ? 'Actual status is live history and cannot be changed inside a what-if snapshot'
    : isSkipped
    ? 'Skipped items cannot be marked actual'
    : (isActual ? 'Untick to restore as planned' : 'Mark as actual / completed');

  const text = document.createElement('span');
  text.textContent = status.replaceAll('-', ' ');

  label.addEventListener('click', (event) => event.stopPropagation());
  label.addEventListener('mousedown', (event) => event.stopPropagation());
  checkbox.addEventListener('change', async (event) => {
    event.stopPropagation();
    if (checkbox.disabled) return;
    checkbox.disabled = true;
    label.classList.add('is-saving');
    try {
      if (checkbox.checked) {
        await OccurrenceManager.markActual(
          scenarioId,
          occurrence.occurrenceKey,
          {
            actualAmount: occurrence.plannedAmount,
            actualDate: occurrence.effectiveDate || occurrence.scheduledDate
          }
        );
      } else {
        await OccurrenceManager.restoreActualToPlanned(
          scenarioId,
          occurrence.occurrenceKey
        );
      }
    } catch (error) {
      checkbox.checked = isActual;
      checkbox.disabled = false;
      label.classList.remove('is-saving');
      notifyError(error?.message || String(error));
    }
  });

  label.appendChild(checkbox);
  label.appendChild(text);
  return label;
}

function buildOccurrenceActions({
  occurrence,
  scenarioId,
  state,
  variantId = '',
  onChanged,
  onEdit,
  className = ''
}) {
  const actions = document.createElement('div');
  actions.className =
    `grid-summary-actions plan-actuals-actions${className ? ` ${className}` : ''}`;
  const isRecurringOccurrence = Boolean(
    occurrence.sourceTransactionId && isRecurringPattern(occurrence.recurrence)
  );

  if (variantId) {
    if (occurrence.status !== 'actual') {
      actions.appendChild(actionButton({
        title: occurrence.status === 'skipped'
          ? 'Restore in this what-if'
          : 'Skip in this what-if',
        text: occurrence.status === 'skipped' ? '↩' : '⊘',
        onClick: (button) => runAction(button, async () => {
          const result = await PeriodVariantManager.updateOccurrence(
            scenarioId,
            variantId,
            occurrence.occurrenceKey,
            { status: occurrence.status === 'skipped' ? 'planned' : 'skipped' }
          );
          await onChanged?.(result?.scenario);
        })
      }));
      actions.appendChild(actionButton({
        title: 'Delete from this what-if',
        text: '⌫',
        onClick: async (button) => {
          const confirmed = await confirmDialog(
            'Delete this item from the selected what-if snapshot? Base will not change.'
          );
          if (!confirmed) return;
          await runAction(button, async () => {
            const result = await PeriodVariantManager.deleteOccurrence(
              scenarioId,
              variantId,
              occurrence.occurrenceKey
            );
            await onChanged?.(result?.scenario);
          });
        }
      }));
      actions.appendChild(actionButton({
        title: 'Edit item in this what-if',
        text: '✎',
        onClick: () => onEdit(occurrence)
      }));
    }
    actions.appendChild(actionButton({
      title: 'Duplicate in this what-if',
      text: '⧉',
      onClick: (button) => runAction(button, async () => {
        const result = await PeriodVariantManager.duplicateOccurrence(
          scenarioId,
          variantId,
          occurrence.occurrenceKey
        );
        await onChanged?.(result?.scenario);
      })
    }));
    return actions;
  }

  if (occurrence.status !== 'skipped' && occurrence.status !== 'actual') {
    actions.appendChild(actionButton({
      title: 'Skip this occurrence',
      text: '⊘',
      onClick: (button) => runAction(button, async () => {
        await OccurrenceManager.markSkipped(scenarioId, occurrence.occurrenceKey);
        notifySuccess('This occurrence was skipped. You can restore it from the card.');
      })
    }));
  }
  if (occurrence.status === 'skipped') {
    actions.appendChild(actionButton({
      title: 'Restore to planned',
      text: '↩',
      onClick: (button) => runAction(button, async () => {
        await OccurrenceManager.updateOccurrenceOnly(
          scenarioId,
          occurrence.occurrenceKey,
          { status: 'planned' }
        );
        notifySuccess('This occurrence was restored to planned.');
      })
    }));
  }
  if (
    (occurrence.status === 'planned' || occurrence.status === 'skipped') &&
    isRecurringOccurrence
  ) {
    actions.appendChild(actionButton({
      title: 'Delete this and future occurrences',
      text: '⨉',
      onClick: async (button) => {
        const confirmed = await confirmDialog(
          'Delete this occurrence and the remaining recurring sequence? Past actuals, removed occurrences, and captured baselines will be preserved.'
        );
        if (!confirmed) return;
        await runAction(button, async () => {
          const result = await OccurrenceManager.endSeries(
            scenarioId,
            occurrence.occurrenceKey,
            { discardSkippedBoundary: occurrence.status === 'skipped' }
          );
          const preservedCount = result?.preservedHistory?.length || 0;
          notifySuccess(
            preservedCount
              ? `This and future planned occurrences were removed. ${preservedCount} protected record${preservedCount === 1 ? '' : 's'} remained as one-time history.`
              : 'This and future occurrences were removed.'
          );
        });
      }
    }));
  }
  if (
    occurrence.status !== 'actual' &&
    !isRecurringOccurrence
  ) {
    actions.appendChild(actionButton({
      title: 'Delete transaction permanently',
      text: '⌫',
      onClick: async (button) => {
        const confirmed = await confirmDialog(
          'Permanently delete this transaction? This cannot be undone.'
        );
        if (!confirmed) return;
        await runAction(button, async () => {
          await OccurrenceManager.deleteOccurrencePermanently(
            scenarioId,
            occurrence.occurrenceKey
          );
          notifySuccess('Transaction deleted permanently.');
        });
      }
    }));
  }
  actions.appendChild(actionButton({
    title: 'Edit item',
    text: '✎',
    onClick: () => onEdit(occurrence)
  }));
  actions.appendChild(actionButton({
    title: 'Duplicate item',
    text: '⧉',
    onClick: (button) => runAction(button, async () => {
      await OccurrenceManager.createManualOccurrence(scenarioId, {
        scheduledDate: occurrence.effectiveDate || occurrence.scheduledDate,
        plannedAmount: occurrence.status === 'actual'
          ? occurrence.actualAmount
          : occurrence.plannedAmount,
        primaryAccountId: occurrence.primaryAccountId,
        secondaryAccountId: occurrence.secondaryAccountId,
        transactionTypeId: occurrence.transactionTypeId,
        description: occurrence.description || '',
        tags: occurrence.tags || [],
        status: 'planned'
      });
      notifySuccess('Item duplicated as a one-time plan.');
    })
  }));
  if (
    !occurrence.sourceTransactionId &&
    !occurrence.promotedTransactionId &&
    occurrence.status !== 'skipped'
  ) {
    actions.appendChild(actionButton({
      title: 'Repeat going forward',
      text: '↻',
      onClick: () => {
        openRecurrenceModal(occurrence.recurrence || null, async (recurrence) => {
          if (!recurrence) return;
          try {
            await OccurrenceManager.promoteOccurrenceToRecurring(
              scenarioId,
              occurrence.occurrenceKey,
              { recurrence }
            );
            notifySuccess('Recurring rule created from this item.');
          } catch (error) {
            notifyError(error?.message || String(error));
          }
        });
      }
    }));
  }

  return actions;
}

function renderOccurrenceCards({
  container,
  rows,
  accounts,
  scenarioId,
  state,
  variantId = '',
  onChanged,
  onNavigateAccount,
  groupBy,
  onEdit
}) {
  container.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'grid-summary-list plan-actuals-list';
  container.appendChild(list);

  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'scenarios-list-placeholder';
    empty.textContent = 'No planned or actual items in this period. Add an item or create a recurring rule.';
    list.appendChild(empty);
    return;
  }

  const groupValue = (row) => {
    if (groupBy === 'status') return statusName(row);
    if (groupBy === 'movement') {
      return movementTypeLabel(movementDimensions(row).transactionTypeId);
    }
    if (groupBy === 'repeat') return recurrenceLabel(row);
    return '';
  };
  const groupContribution = (row) => {
    const occurrence = row?._canonicalOccurrence || row;
    const comparison = row?._comparisonOccurrence || occurrence;
    const typeId = movementDimensions(row).transactionTypeId;
    const status = statusName(occurrence);
    if (status === 'actual' && hasValue(comparison?.actualAmount)) {
      return signedAmount(comparison.actualAmount, typeId);
    }
    if (
      status === 'planned' &&
      comparison?.isIncludedInForecast !== false
    ) {
      return signedAmount(comparison?.plannedAmount, typeId);
    }
    return 0;
  };
  const sorted = groupBy
    ? [...rows].sort((a, b) => groupValue(a).localeCompare(groupValue(b)))
    : rows;
  const groupTotals = groupBy
    ? sorted.reduce((totals, row) => {
        const key = groupValue(row) || 'Other';
        totals.set(key, Number(totals.get(key) || 0) + groupContribution(row));
        return totals;
      }, new Map())
    : new Map();
  let previousGroup = null;

  sorted.forEach((row) => {
    const occurrence = row._canonicalOccurrence || row;
    if (groupBy) {
      const nextGroup = groupValue(row) || 'Other';
      if (nextGroup !== previousGroup) {
        previousGroup = nextGroup;
        const groupHeader = document.createElement('div');
        groupHeader.className = 'grid-summary-group-header';
        const groupLabel = document.createElement('span');
        groupLabel.className = 'grid-summary-group-label';
        groupLabel.textContent = nextGroup;
        const groupTotal = document.createElement('span');
        const total = Number(groupTotals.get(nextGroup) || 0);
        groupTotal.className = `grid-summary-group-total ${numValueClass(total)}`;
        groupTotal.textContent = formatCurrency(total);
        groupHeader.appendChild(groupLabel);
        groupHeader.appendChild(groupTotal);
        list.appendChild(groupHeader);
      }
    }

    const displayMovement = movementDimensions(row);
    const movementClass = Number(displayMovement.transactionTypeId) === 1
      ? 'money-in'
      : 'money-out';
    const card = document.createElement('article');
    card.className =
      `grid-summary-card plan-actuals-item ${movementClass} status-${statusName(occurrence)}`;
    card.dataset.occurrenceKey = occurrence.occurrenceKey;
    card.dataset.baselineHistory = baselineHistoryState(
      row._comparisonOccurrence || occurrence
    );
    card.classList.add('is-openable');
    card.tabIndex = 0;
    card.setAttribute(
      'aria-label',
      `Open ${occurrence.description || 'transaction'} details`
    );
    const openFromCard = (event) => {
      if (event.target.closest(
        'button, input, select, textarea, a, label, form, .plan-actuals-editor-wrap'
      )) return;
      onEdit?.(occurrence);
    };
    card.addEventListener('click', openFromCard);
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target !== card) return;
      event.preventDefault();
      onEdit?.(occurrence);
    });

    const content = document.createElement('div');
    content.className = 'grid-summary-content';

    const counterparty = document.createElement(
      displayMovement.secondaryAccountId ? 'button' : 'div'
    );
    if (displayMovement.secondaryAccountId) counterparty.type = 'button';
    counterparty.className = 'grid-summary-title plan-actuals-counterparty';
    counterparty.textContent = displayMovement.secondaryAccountId
      ? accountName(accounts, displayMovement.secondaryAccountId)
      : 'External';
    if (displayMovement.secondaryAccountId) {
      const destinationName = accountName(accounts, displayMovement.secondaryAccountId);
      counterparty.classList.add('plan-actuals-account-shortcut');
      counterparty.title = `View transactions for ${destinationName}`;
      counterparty.setAttribute('aria-label', `View transactions for ${destinationName}`);
      counterparty.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await onNavigateAccount?.(displayMovement.secondaryAccountId);
      });
    }

    const heading = document.createElement('div');
    heading.className = 'plan-actuals-heading-row';
    const status = buildCompletionControl({
      occurrence,
      scenarioId,
      state,
      variantId,
      onChanged
    });
    heading.appendChild(counterparty);
    heading.appendChild(buildBaselineHistoryBadge(
      row._comparisonOccurrence || occurrence
    ));
    heading.appendChild(status);

    const schedule = document.createElement('div');
    schedule.className = 'plan-actuals-schedule-row';
    const date = document.createElement('time');
    date.className = 'grid-summary-date';
    date.dateTime = occurrence.effectiveDate || '';
    date.textContent = occurrence.effectiveDate || 'No date';
    const repeat = document.createElement('span');
    repeat.className = 'plan-actuals-repeat';
    repeat.textContent = recurrenceLabel(occurrence);
    repeat.title = repeat.textContent;
    schedule.appendChild(repeat);
    schedule.appendChild(date);

    const movement = document.createElement('div');
    movement.className = 'grid-summary-flow plan-actuals-movement';
    const type = movementTypeLabel(displayMovement.transactionTypeId);
    movement.textContent =
      `${type}: ${movementTextFromDimensions(displayMovement, accounts)}`;

    const description = document.createElement('div');
    description.className = 'grid-summary-description plan-actuals-description';
    description.textContent = occurrence.description || 'Untitled item';

    const lineItems = Array.isArray(occurrence.lineItems) ? occurrence.lineItems : [];
    const lineItemSummary = document.createElement('div');
    lineItemSummary.className = 'plan-actuals-line-item-summary';
    lineItemSummary.textContent = lineItems.length
      ? `${lineItems.length} line item${lineItems.length === 1 ? '' : 's'} · ${formatCurrency(
          lineItems.reduce((sum, item) => sum + Math.abs(Number(item?.amount || 0)), 0)
        )}`
      : 'No line items';

    const comparison = document.createElement('div');
    comparison.className = 'plan-actuals-comparison';
    const perspectiveOccurrence = row._comparisonOccurrence || occurrence;
    const baseline = Math.abs(Number(perspectiveOccurrence.baselineAmount || 0));
    const planned = Math.abs(Number(perspectiveOccurrence.plannedAmount || 0));
    const actualAmount = occurrence.status === 'actual' && hasValue(perspectiveOccurrence.actualAmount)
      ? Math.abs(Number(perspectiveOccurrence.actualAmount))
      : null;
    const actual = actualAmount === null
      ? null
      : signedAmount(actualAmount, displayMovement.transactionTypeId);
    const variance = (actualAmount ?? planned) - baseline;
    [
      ['Baseline', baseline],
      ['Current', planned],
      ['Actual', actual],
      ['Variance', variance]
    ].forEach(([label, value]) => {
      const metric = document.createElement('div');
      metric.className = 'plan-actuals-metric';
      const labelEl = document.createElement('span');
      labelEl.className = 'label';
      labelEl.textContent = label;
      const valueEl = document.createElement('span');
      valueEl.className = `value ${value === null ? 'empty' : numValueClass(value)}`;
      valueEl.textContent = value === null ? '—' : formatCurrency(value);
      valueEl.title = valueEl.textContent;
      metric.appendChild(labelEl);
      metric.appendChild(valueEl);
      comparison.appendChild(metric);
    });

    const actions = buildOccurrenceActions({
      occurrence,
      scenarioId,
      state,
      variantId,
      onChanged,
      onEdit
    });
    schedule.appendChild(actions);

    content.appendChild(heading);
    content.appendChild(schedule);
    content.appendChild(movement);
    content.appendChild(description);
    content.appendChild(lineItemSummary);
    content.appendChild(comparison);

    card.appendChild(content);
    list.appendChild(card);
  });
}

function signedAmount(amount, typeId) {
  const value = Math.abs(Number(amount || 0));
  if (Number(typeId) === 1) return value;
  if (Number(typeId) === 2) return -value;
  return 0;
}

function buildPlanActualsDetailRows(rows, accounts) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const occurrence = row?._canonicalOccurrence || row;
    const comparison = row?._comparisonOccurrence || occurrence;
    const currentTypeId = Number(comparison?.transactionTypeId);
    const baselineTypeId = Number(comparison?.baselineTransactionTypeId);
    const canonicalStatus = statusName(occurrence);
    const baseline = signedAmount(comparison?.baselineAmount, baselineTypeId);
    const currentPlan = canonicalStatus === 'skipped'
      ? 0
      : signedAmount(comparison?.plannedAmount, currentTypeId);
    const actual = canonicalStatus === 'actual' && hasValue(comparison?.actualAmount)
      ? signedAmount(comparison.actualAmount, currentTypeId)
      : null;
    const forecast = canonicalStatus === 'actual'
      ? (actual ?? 0)
      : (
        canonicalStatus === 'planned' && comparison?.isIncludedInForecast !== false
          ? signedAmount(comparison?.plannedAmount, currentTypeId)
          : 0
      );

    const currentDimensions = currentMovementDimensions(row);
    const currentMovement = movementTextFromDimensions(
      currentDimensions,
      accounts
    );
    const baselineMovement = movementTextFromDimensions(
      baselineMovementDimensions(row),
      accounts
    );
    const currentMovementLabel =
      `${movementTypeLabel(currentTypeId)}: ${currentMovement}`;
    const baselineMovementLabel =
      `${movementTypeLabel(baselineTypeId)}: ${baselineMovement}`;
    const showBaselineMovement =
      Math.abs(Number(comparison?.baselineAmount || 0)) > 0 &&
      baselineMovementLabel !== currentMovementLabel;

    return {
      ...row,
      id: row.id || occurrence.occurrenceKey,
      occurrenceKey: occurrence.occurrenceKey,
      date: occurrence.effectiveDate || occurrence.scheduledDate || '',
      statusLabel: statusName(occurrence).replaceAll('-', ' '),
      statusGroup: statusName(occurrence),
      baselineHistory: baselineHistoryState(comparison),
      movement: currentMovementLabel,
      navigationAccountId: currentDimensions.secondaryAccountId || null,
      navigationAccountName: currentDimensions.secondaryAccountId
        ? accountName(accounts, currentDimensions.secondaryAccountId)
        : '',
      baselineMovement: showBaselineMovement ? baselineMovementLabel : '',
      movementGroup:
        movementTypeLabel(currentTypeId || baselineTypeId),
      description: occurrence.description || '',
      lineItemCount: Array.isArray(occurrence.lineItems) ? occurrence.lineItems.length : 0,
      repeat: recurrenceLabel(occurrence),
      repeatGroup: recurrenceLabel(occurrence),
      baseline,
      currentPlan,
      actual,
      forecast,
      varianceVsBaseline: forecast - baseline,
      varianceVsCurrent: forecast - currentPlan,
      _canonicalOccurrence: occurrence,
      _comparisonOccurrence: comparison
    };
  });
}

function detailMoneyFormatter(cell) {
  const value = cell.getValue();
  const span = document.createElement('span');
  if (!hasValue(value)) {
    span.className = 'plan-actuals-detail-empty';
    span.textContent = '—';
    return span;
  }
  const numeric = Number(value || 0);
  span.className = `plan-actuals-detail-money ${numValueClass(numeric)}`;
  span.textContent = formatCurrency(numeric);
  return span;
}

function detailStatusFormatter(cell) {
  const value = String(cell.getValue() || 'planned').trim().toLowerCase();
  const occurrence = cell.getRow().getData()?._canonicalOccurrence;
  const runtime = planActualsDetailRuntime;
  if (occurrence && runtime) {
    return buildCompletionControl({
      occurrence,
      scenarioId: runtime.scenarioId,
      state: runtime.state,
      variantId: runtime.variantId,
      onChanged: runtime.onChanged
    });
  }
  const span = document.createElement('span');
  span.className = `plan-actuals-status status-${value.replaceAll(' ', '-')}`;
  span.textContent = value;
  return span;
}

function detailMovementFormatter(cell) {
  const data = cell.getRow().getData();
  const wrapper = document.createElement('div');
  wrapper.className = 'plan-actuals-detail-movement';
  const runtime = planActualsDetailRuntime;
  const current = document.createElement(data.navigationAccountId ? 'button' : 'div');
  if (data.navigationAccountId) current.type = 'button';
  current.textContent = data.movement || '—';
  if (data.navigationAccountId) {
    const destinationName = data.navigationAccountName || 'secondary account';
    current.className = 'plan-actuals-detail-account-shortcut';
    current.title = `View transactions for ${destinationName}`;
    current.setAttribute('aria-label', `View transactions for ${destinationName}`);
    current.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await runtime?.onNavigateAccount?.(data.navigationAccountId);
    });
  }
  wrapper.appendChild(current);
  if (data.baselineMovement) {
    const baseline = document.createElement('div');
    baseline.className = 'plan-actuals-detail-baseline-movement';
    baseline.textContent = `Baseline: ${data.baselineMovement}`;
    wrapper.appendChild(baseline);
  }
  return wrapper;
}

function createPlanActualsDetailColumns() {
  const textColumn = (title, field, options = {}) => ({
    title,
    field,
    headerSort: true,
    headerFilter: 'input',
    formatter: 'plaintext',
    ...options
  });
  const moneyColumn = (title, field, options = {}) => ({
    title,
    field,
    headerSort: true,
    hozAlign: 'right',
    headerHozAlign: 'right',
    formatter: detailMoneyFormatter,
    ...options
  });

  return [
    textColumn('Date', 'date', { width: 112, minWidth: 105 }),
    {
      title: 'Status',
      field: 'statusLabel',
      width: 112,
      minWidth: 104,
      headerSort: true,
      headerFilter: 'input',
      formatter: detailStatusFormatter
    },
    {
      title: 'Baseline History',
      field: 'baselineHistory',
      width: 135,
      minWidth: 120,
      headerSort: true,
      headerFilter: 'list',
      headerFilterParams: {
        values: {
          '': 'All',
          closed: 'Closed',
          captured: 'Baseline captured',
          live: 'Live'
        }
      },
      formatter: (cell) => buildBaselineHistoryBadge(
        cell.getRow().getData()?._comparisonOccurrence
      )
    },
    {
      title: 'Money Movement',
      field: 'movement',
      width: 255,
      minWidth: 220,
      headerSort: true,
      headerFilter: 'input',
      formatter: detailMovementFormatter
    },
    textColumn('Description', 'description', {
      width: 210,
      minWidth: 170
    }),
    {
      title: 'Items',
      field: 'lineItemCount',
      width: 82,
      minWidth: 72,
      hozAlign: 'right',
      headerHozAlign: 'right',
      headerSort: true
    },
    textColumn('Repeat', 'repeat', {
      width: 160,
      minWidth: 135
    }),
    moneyColumn('Baseline', 'baseline', {
      width: 132,
      minWidth: 120
    }),
    moneyColumn('Current Plan', 'currentPlan', {
      width: 140,
      minWidth: 125
    }),
    moneyColumn('Actual', 'actual', {
      width: 132,
      minWidth: 120
    }),
    moneyColumn('Forecast Contribution', 'forecast', {
      width: 170,
      minWidth: 150,
      headerTooltip: 'Actual amount when completed; otherwise the unresolved plan included in projections.'
    }),
    moneyColumn('Variance vs Baseline', 'varianceVsBaseline', {
      width: 165,
      minWidth: 145,
      headerTooltip: 'Forecast contribution minus the captured baseline.'
    }),
    moneyColumn('Variance vs Current', 'varianceVsCurrent', {
      width: 160,
      minWidth: 140,
      headerTooltip: 'Forecast contribution minus the current plan.'
    }),
    {
      title: 'Actions',
      field: '_actions',
      width: 178,
      minWidth: 150,
      headerSort: false,
      formatter: (cell) => {
        const occurrence = cell.getRow().getData()?._canonicalOccurrence;
        const runtime = planActualsDetailRuntime;
        if (!occurrence || !runtime) return '';
        return buildOccurrenceActions({
          occurrence,
          scenarioId: runtime.scenarioId,
          state: runtime.state,
          variantId: runtime.variantId,
          onChanged: runtime.onChanged,
          onEdit: runtime.onEdit,
          className: 'plan-actuals-detail-actions'
        });
      }
    }
  ];
}

function detailComparisonOccurrencesFromRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => row?.getData?.() || row)
    .map((row) => row?._comparisonOccurrence)
    .filter(Boolean);
}

function applyPlanActualsDetailGrouping(table, groupBy) {
  if (!table) return;
  const field = {
    status: 'statusGroup',
    movement: 'movementGroup',
    repeat: 'repeatGroup'
  }[groupBy] || '';
  table.setGroupBy?.(field ? [field] : []);
}

function openPlanActualsDetailEditor({
  editorHost,
  scenarioId,
  occurrence = null,
  accounts,
  accountGroups = [],
  state,
  variantId = '',
  onChanged,
  isNew = false
}) {
  if (!editorHost) return;
  editorHost.innerHTML = '';
  const editorWrap = document.createElement('div');
  editorWrap.className = isNew
    ? 'plan-actuals-new-item'
    : 'plan-actuals-editor-wrap';
  const closeEditor = () => {
    editorHost.innerHTML = '';
  };
  editorWrap.appendChild(buildOccurrenceEditor({
    scenarioId,
    occurrence,
    accounts,
    accountGroups,
    state,
    variantId,
    onCancel: () => {
      pendingEditor = null;
      closeEditor();
    },
    onSaved: async (nextScenario) => {
      pendingEditor = null;
      closeEditor();
      if (nextScenario) await onChanged?.(nextScenario);
    }
  }));
  editorHost.appendChild(editorWrap);
  editorHost.scrollIntoView?.({ block: 'nearest' });
}

async function renderOccurrenceDetailTable({
  container,
  rows,
  totalsOccurrences,
  diagnostics,
  scenario,
  state,
  variantId = '',
  onChanged,
  onNavigateAccount,
  isRenderCurrent
}) {
  if (!isRenderCurrent()) return;
  let grid = container.querySelector(':scope > .plan-actuals-detail-grid');
  if (!grid) {
    teardownPlanActualsDetailGrid();
    container.innerHTML = '';
  }

  let totals = container.querySelector(':scope > .plan-actuals-totals');
  if (!totals) {
    totals = document.createElement('div');
    totals.className = 'budget-totals-container plan-actuals-totals';
    totals.id = 'budgetContent';
  }

  let diagnosticsElement = container.querySelector(':scope > .plan-actuals-diagnostics');
  if (diagnostics?.length) {
    if (!diagnosticsElement) {
      diagnosticsElement = document.createElement('div');
      diagnosticsElement.className = 'plan-actuals-diagnostics';
    }
    diagnosticsElement.textContent =
      `${diagnostics.length} planning item${diagnostics.length === 1 ? '' : 's'} need review.`;
    diagnosticsElement.title =
      diagnostics.map((item) => item.message || item.code).join('\n');
  } else {
    diagnosticsElement?.remove();
    diagnosticsElement = null;
  }

  let editorHost = container.querySelector(':scope > .plan-actuals-detail-editor-host');
  if (!editorHost) {
    editorHost = document.createElement('div');
    editorHost.className = 'plan-actuals-detail-editor-host';
  }
  const { startDate: detailStartDate, endDate: detailEndDate } =
    selectedPeriodRange(state);
  const nextDetailContextKey = JSON.stringify({
    scenarioId: Number(scenario.id),
    periodType: state?.getBudgetPeriodType?.() || '',
    periodId: state?.getBudgetPeriod?.() || '',
    startDate: detailStartDate || '',
    endDate: detailEndDate || '',
    accountId: Number(state?.getBudgetAccountFilterId?.() || 0),
    statusFilter: state?.getBudgetStatusFilter?.() || '',
    historyFilter: state?.getBudgetHistoryFilter?.() || '',
    groupBy: state?.getGroupBy?.() || '',
    variantId
  });
  const detailContextChanged =
    planActualsDetailContextKey !== null &&
    planActualsDetailContextKey !== nextDetailContextKey;
  planActualsDetailContextKey = nextDetailContextKey;
  if (detailContextChanged) {
    pendingEditor = null;
    // Editors close over the scenario, period, and filter context in which
    // they were opened. Drop them before reusing the table for another view.
    editorHost.innerHTML = '';
  }

  if (!grid) {
    grid = document.createElement('div');
    grid.className =
      'grid-container budget-grid plan-actuals-grid plan-actuals-detail-grid grid-detail';
  }

  container.appendChild(totals);
  if (diagnosticsElement) container.appendChild(diagnosticsElement);
  container.appendChild(editorHost);
  container.appendChild(grid);

  const detailRows = buildPlanActualsDetailRows(rows, scenario.accounts || []);
  const openEditor = (occurrence) => openPlanActualsDetailEditor({
    editorHost,
    scenarioId: scenario.id,
    occurrence,
    accounts: scenario.accounts || [],
    accountGroups: scenario.accountGroups || [],
    state,
    variantId,
    onChanged
  });
  planActualsDetailRuntime = {
    scenarioId: scenario.id,
    state,
    variantId,
    onChanged,
    onNavigateAccount,
    totals,
    onEdit: openEditor
  };

  renderComparisonTotals(totals, totalsOccurrences);

  const shouldRebuild =
    !lastPlanActualsDetailTable ||
    lastPlanActualsDetailTable.element !== grid;
  if (shouldRebuild) {
    teardownPlanActualsDetailGrid();
    planActualsDetailContextKey = nextDetailContextKey;
    const lifecycle = planActualsDetailLifecycle;
    planActualsDetailRuntime = {
      scenarioId: scenario.id,
      state,
      variantId,
      onChanged,
      onNavigateAccount,
      totals,
      onEdit: openEditor
    };
    const detailTable = await createGrid(grid, {
      data: detailRows,
      columns: createPlanActualsDetailColumns(),
      layout: 'fitDataStretch',
      responsiveLayout: false,
      rowHeight: 52,
      placeholder: 'No planned or actual items in this period.',
      initialSort: [{ column: 'date', dir: 'asc' }]
    });

    if (
      !isRenderCurrent() ||
      lifecycle !== planActualsDetailLifecycle ||
      !grid.isConnected
    ) {
      try {
        detailTable?.destroy?.();
      } catch (_) {
        // Ignore cleanup failures for a render superseded while the grid loaded.
      }
      return;
    }

    lastPlanActualsDetailTable = detailTable;
    detailTable.on('dataFiltered', (_filters, activeRows) => {
      if (lastPlanActualsDetailTable !== detailTable) return;
      const runtime = planActualsDetailRuntime;
      if (!runtime?.totals) return;
      renderComparisonTotals(
        runtime.totals,
        detailComparisonOccurrencesFromRows(activeRows)
      );
    });
    detailTable.on('tableBuilt', () => {
      if (lastPlanActualsDetailTable !== detailTable) return;
      lastPlanActualsDetailTableReady = true;
      applyPlanActualsDetailGrouping(
        detailTable,
        planActualsDetailRuntime?.state?.getGroupBy?.() || ''
      );
    });
  } else {
    await refreshGridData(lastPlanActualsDetailTable, detailRows);
    if (!isRenderCurrent()) return;
  }

  if (lastPlanActualsDetailTableReady) {
    applyPlanActualsDetailGrouping(
      lastPlanActualsDetailTable,
      state?.getGroupBy?.() || ''
    );
  }

  if (
    pendingEditor?.scenarioId === Number(scenario.id) &&
    pendingEditor.occurrence === null &&
    !editorHost.querySelector(':scope > .plan-actuals-new-item')
  ) {
    openPlanActualsDetailEditor({
      editorHost,
      scenarioId: scenario.id,
      accounts: scenario.accounts || [],
      accountGroups: scenario.accountGroups || [],
      state,
      variantId,
      onChanged,
      isNew: true
    });
  }

  installItemDetailDismissal({
    root: container,
    detailsSelector: '.plan-actuals-editor-wrap, .plan-actuals-new-item',
    onDismiss: (editor) => {
      pendingEditor = null;
      editor.remove();
    }
  });
}

async function renderPeriodView({
  container,
  scenarioState,
  state,
  logger,
  reload,
  isRenderCurrent,
  presentationMode = 'summary'
}) {
  if (!isRenderCurrent()) return;
  const scenario = scenarioState?.get?.();
  if (!scenario) return;
  cleanupItemDetailDismissal(container);

  const periodType = state?.getBudgetPeriodType?.() || 'Month';
  let periods = state?.getBudgetPeriods?.() || [];
  if (!periods.length) {
    periods = await loadPlanPeriods(scenario, periodType);
    if (!isRenderCurrent()) return;
    state?.setBudgetPeriods?.(periods);
  }
  if (!isRenderCurrent()) return;

  let selectedId = state?.getBudgetPeriod?.();
  if (!findPeriodById(periods, selectedId) && periods.length) {
    selectedId = periods[0].id;
    state?.setBudgetPeriod?.(selectedId);
  }
  const { startDate, endDate } = selectedPeriodRange(state);
  const resolved = startDate && endDate
    ? resolveScenarioOccurrences({
        scenario,
        startDate,
        endDate,
        asOfDate: scenario?.projection?.config?.asOfDate ?? null,
        openCommitmentStartDate: scenario?.projection?.config?.openCommitmentStartDate ?? null
      })
    : { occurrences: [], diagnostics: [] };
  const periodKey = `${periodType}|${startDate || ''}|${endDate || ''}`;
  const periodVariants = (scenario?.planning?.periodVariants || []).filter(
    (variant) => (
      String(variant?.periodType || '') === String(periodType) &&
      variant?.startDate === startDate &&
      variant?.endDate === endDate
    )
  );
  let selectedVariantId = String(state?.getSelectedVariant?.(periodKey) || '');
  let activeVariant = periodVariants.find(
    (variant) => String(variant?.id) === selectedVariantId
  ) || null;
  if (selectedVariantId && !activeVariant) {
    selectedVariantId = '';
    state?.setSelectedVariant?.(periodKey, '');
  }
  const viewResolved = activeVariant
    ? { occurrences: activeVariant.occurrences || [], diagnostics: [] }
    : resolved;
  const applyVariantScenario = async (nextScenario) => {
    if (nextScenario) scenarioState?.set?.(nextScenario);
    pendingEditor = null;
    await reload();
  };
  const navigateToAccount = async (accountId) => {
    const numericId = Number(accountId || 0);
    if (!numericId) return;
    state?.setBudgetAccountScope?.('');
    state?.setBudgetAccountFilterId?.(numericId);
    pendingEditor = null;
    await reload();
  };

  const card = container.closest('.forecast-card');
  const header = card?.querySelector(':scope > .card-header');
  const controls = header?.querySelector('.card-header-controls');
  header?.classList.add('card-header--filters-inline');
  if (controls) {
    controls.innerHTML = '';
    const periodOptions = periods.map((item) => ({
      value: item.id,
      label: item.label || String(item.id)
    }));
    const groupOptions = [
      { value: '', label: 'None' },
      { value: 'status', label: 'Status' },
      { value: 'movement', label: 'Movement' },
      { value: 'repeat', label: 'Repeat' }
    ];
    const statusOptions = [
      { value: '', label: 'Both' },
      { value: 'planned', label: 'Planned' },
      { value: 'actual', label: 'Actual' }
    ];
    const historyOptions = [
      { value: '', label: 'All' },
      { value: 'closed', label: 'Closed' },
      { value: 'captured', label: 'Baseline captured' },
      { value: 'live', label: 'Live' }
    ];
    const periodTypeOptions = ['Day', 'Week', 'Month', 'Quarter', 'Year']
      .map((value) => ({ value, label: value }));

    const inlinePeriodType = createSelect('plan-period-type-inline', periodTypeOptions, periodType);
    const inlinePeriod = createSelect('plan-period-inline', periodOptions, selectedId);
    const accountScope = state?.getBudgetAccountScope?.() || '';
    const inlineAccount = createSelect('plan-account-inline', [], '');
    const selectedAccountId = populateAccountSelect(inlineAccount, {
      accounts: scenario.accounts || [],
      accountGroups: scenario.accountGroups || [],
      scope: accountScope,
      selectedId: state?.getBudgetAccountFilterId?.() || null,
      includeAll: true,
      preserveCurrentOutsideScope: false,
      onScopeChange: (nextScope) => {
        state?.setBudgetAccountScope?.(nextScope);
      }
    });
    if (
      state?.getBudgetAccountFilterId?.() &&
      !selectedAccountId
    ) {
      state?.setBudgetAccountFilterId?.(null);
    }
    const inlineStatus = createSelect(
      'plan-status-inline',
      statusOptions,
      state?.getBudgetStatusFilter?.() || ''
    );
    const inlineHistory = createSelect(
      'plan-history-inline',
      historyOptions,
      state?.getBudgetHistoryFilter?.() || ''
    );
    const inlineGroup = createSelect('plan-group-inline', groupOptions, state?.getGroupBy?.() || '');
    const inlineVariant = createSelect(
      'plan-variant-inline',
      [
        { value: '', label: 'Base' },
        ...periodVariants.map((variant) => ({
          value: variant.id,
          label: variant.name
        }))
      ],
      selectedVariantId
    );
    inlineVariant.setAttribute('aria-label', 'What-if snapshot');
    inlinePeriod.setAttribute('aria-label', 'Period');

    const setPeriodType = async (value) => {
      inlinePeriodType.value = String(value ?? '');
      state?.setBudgetPeriodType?.(value);
      state?.setBudgetPeriods?.([]);
      state?.setBudgetPeriod?.(null);
      await reload();
    };
    inlinePeriodType.addEventListener('change', () => setPeriodType(inlinePeriodType.value));
    const setPeriod = async (value) => {
      inlinePeriod.value = String(value ?? '');
      state?.setBudgetPeriod?.(value || null);
      pendingEditor = null;
      await reload();
    };
    inlinePeriod.addEventListener('change', () => setPeriod(inlinePeriod.value));
    const setAccount = async (value) => {
      inlineAccount.value = String(value ?? '');
      state?.setBudgetAccountFilterId?.(value ? Number(value) : null);
      await reload();
    };
    inlineAccount.addEventListener('change', () => setAccount(inlineAccount.value));
    const setStatus = async (value) => {
      inlineStatus.value = String(value ?? '');
      state?.setBudgetStatusFilter?.(value || '');
      await reload();
    };
    inlineStatus.addEventListener('change', () => setStatus(inlineStatus.value));
    const setHistory = async (value) => {
      inlineHistory.value = String(value ?? '');
      state?.setBudgetHistoryFilter?.(value || '');
      await reload();
    };
    inlineHistory.addEventListener('change', () => setHistory(inlineHistory.value));
    const setGroup = async (value) => {
      inlineGroup.value = String(value ?? '');
      state?.setGroupBy?.(value || '');
      await reload();
    };
    inlineGroup.addEventListener('change', () => setGroup(inlineGroup.value));
    inlineVariant.addEventListener('change', async () => {
      state?.setSelectedVariant?.(periodKey, inlineVariant.value || '');
      pendingEditor = null;
      await reload();
    });

    const movePeriod = async (offset) => {
      const index = findPeriodIndexById(periods, state?.getBudgetPeriod?.());
      const safeIndex = index < 0 ? 0 : index;
      const nextIndex = Math.min(Math.max(safeIndex + offset, 0), Math.max(0, periods.length - 1));
      await setPeriod(periods[nextIndex]?.id || null);
    };
    const buildNav = (periodSelect = null) => {
      const nav = document.createElement('div');
      nav.className = `period-nav${periodSelect ? ' plan-actuals-period-nav' : ''}`;
      const previous = document.createElement('button');
      previous.type = 'button';
      previous.className = 'period-btn';
      previous.textContent = '<';
      previous.title = 'Previous period';
      previous.addEventListener('click', (event) => {
        event.preventDefault();
        movePeriod(-1);
      });
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'period-btn';
      next.textContent = '>';
      next.title = 'Next period';
      next.addEventListener('click', (event) => {
        event.preventDefault();
        movePeriod(1);
      });
      nav.appendChild(previous);
      if (periodSelect) nav.appendChild(periodSelect);
      nav.appendChild(next);
      return nav;
    };

    const addItem = () => {
      pendingEditor = {
        scenarioId: scenario.id,
        occurrence: null
      };
      reload();
    };
    const addInline = document.createElement('button');
    addInline.type = 'button';
    addInline.className = 'icon-btn card-inline-action';
    addInline.title = 'Add item';
    addInline.textContent = '+';
    addInline.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      addItem();
    });
    const baselineManagerInline = document.createElement('button');
    baselineManagerInline.type = 'button';
    baselineManagerInline.className = 'icon-btn card-inline-action plan-actuals-baseline-manager-action';
    baselineManagerInline.title = 'Manage period history';
    baselineManagerInline.setAttribute('aria-label', 'Manage period history');
    baselineManagerInline.textContent = '◷ History';
    baselineManagerInline.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const today = formatDateOnly(new Date());
      const selectedDate = today >= startDate && today <= endDate ? today : startDate;
      await openBaselinePeriodManager({
        scenario,
        selectedDate,
        onChanged: async (nextScenario) => {
          scenarioState?.set?.(nextScenario);
          await reload();
        }
      });
    });
    const addVariantInline = document.createElement('button');
    addVariantInline.type = 'button';
    addVariantInline.className = 'icon-btn card-inline-action';
    addVariantInline.title = 'Create a what-if snapshot from this period';
    addVariantInline.setAttribute('aria-label', 'Create what-if snapshot');
    addVariantInline.textContent = '＋ What-if';
    addVariantInline.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openTextInputModal(
        'Create what-if snapshot',
        `What-if ${periodVariants.length + 1}`,
        'Snapshot name',
        async (name) => {
          try {
            const result = await PeriodVariantManager.create(scenario.id, {
              name,
              periodType,
              periodId: selectedId,
              startDate,
              endDate,
              occurrences: resolved.occurrences
            });
            state?.setSelectedVariant?.(periodKey, result.variant.id);
            notifySuccess(`What-if snapshot “${result.variant.name}” created.`);
            await applyVariantScenario(result.scenario);
          } catch (error) {
            notifyError(error?.message || String(error));
          }
        }
      );
    });
    const deleteVariantInline = document.createElement('button');
    deleteVariantInline.type = 'button';
    deleteVariantInline.className = 'icon-btn card-inline-action';
    deleteVariantInline.title = 'Delete selected what-if snapshot';
    deleteVariantInline.setAttribute('aria-label', 'Delete selected what-if snapshot');
    deleteVariantInline.textContent = '⌫ What-if';
    deleteVariantInline.hidden = !activeVariant;
    deleteVariantInline.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!activeVariant) return;
      const confirmed = await confirmDialog(
        `Delete the what-if snapshot “${activeVariant.name}”? Base will not change.`
      );
      if (!confirmed) return;
      try {
        const result = await PeriodVariantManager.remove(scenario.id, activeVariant.id);
        state?.setSelectedVariant?.(periodKey, '');
        notifySuccess('What-if snapshot deleted.');
        await applyVariantScenario(result.scenario);
      } catch (error) {
        notifyError(error?.message || String(error));
      }
    });
    const inlineFilters = document.createElement('div');
    inlineFilters.className = 'card-inline-filters plan-actuals-inline-filters plan-actuals-toolbar';
    inlineFilters.setAttribute('role', 'toolbar');
    inlineFilters.setAttribute('aria-label', 'Plan and actuals period controls');
    inlineFilters.appendChild(createHeaderFilterItem('View', inlinePeriodType, 'filter-period-type'));
    inlineFilters.appendChild(createHeaderFilterItem('Period', buildNav(inlinePeriod), 'filter-period'));
    inlineFilters.appendChild(createHeaderFilterItem('Account', inlineAccount, 'filter-account'));
    inlineFilters.appendChild(createHeaderFilterItem('Status', inlineStatus, 'filter-status'));
    inlineFilters.appendChild(createHeaderFilterItem('History', inlineHistory, 'filter-history'));
    inlineFilters.appendChild(createHeaderFilterItem('Group', inlineGroup, 'filter-group'));
    inlineFilters.appendChild(createHeaderFilterItem('Snapshot', inlineVariant, 'filter-variant'));
    const actions = document.createElement('div');
    actions.className = 'plan-actuals-toolbar-actions';
    actions.setAttribute('aria-label', 'Period actions');
    actions.appendChild(addInline);
    actions.appendChild(addVariantInline);
    if (activeVariant) actions.appendChild(deleteVariantInline);
    else actions.appendChild(baselineManagerInline);
    inlineFilters.appendChild(actions);

    controls.appendChild(inlineFilters);
  }

  const accountFilterId = state?.getBudgetAccountFilterId?.();
  const statusFilter = String(state?.getBudgetStatusFilter?.() || '');
  const statusOccurrences = statusFilter
    ? viewResolved.occurrences.filter((occurrence) => occurrence?.status === statusFilter)
    : viewResolved.occurrences;
  const savedHistoryFilter = String(state?.getBudgetHistoryFilter?.() || '');
  const historyFilter = savedHistoryFilter === 'frozen' ? 'closed' : savedHistoryFilter;
  const visibleOccurrences = historyFilter
    ? statusOccurrences.filter(
        (occurrence) => baselineHistoryState(occurrence) === historyFilter
      )
    : statusOccurrences;
  const displayOccurrences = attachPromotedRecurrence(
    visibleOccurrences,
    scenario.transactions || []
  );
  const rows = buildDisplayRows({
    occurrences: displayOccurrences,
    accounts: scenario.accounts || [],
    accountFilterId
  });
  const totalsOccurrences = buildComparisonOccurrences(
    visibleOccurrences,
    accountFilterId
  );

  if (presentationMode === 'detail') {
    await renderOccurrenceDetailTable({
      container,
      rows,
      totalsOccurrences,
      diagnostics: viewResolved.diagnostics || [],
      scenario,
      state,
      variantId: selectedVariantId,
      onChanged: applyVariantScenario,
      onNavigateAccount: navigateToAccount,
      isRenderCurrent
    });
    return;
  }

  teardownPlanActualsDetailGrid();
  container.innerHTML = '';
  const totals = document.createElement('div');
  totals.className = 'budget-totals-container plan-actuals-totals';
  totals.id = 'budgetContent';
  container.appendChild(totals);

  if (viewResolved.diagnostics?.length) {
    const diagnostics = document.createElement('div');
    diagnostics.className = 'plan-actuals-diagnostics';
    diagnostics.textContent = `${viewResolved.diagnostics.length} planning item${viewResolved.diagnostics.length === 1 ? '' : 's'} need review.`;
    diagnostics.title = viewResolved.diagnostics.map((item) => item.message || item.code).join('\n');
    container.appendChild(diagnostics);
  }

  const grid = document.createElement('div');
  grid.className = 'grid-container budget-grid plan-actuals-grid';
  container.appendChild(grid);

  renderComparisonTotals(totals, totalsOccurrences);

  renderOccurrenceCards({
    container: grid,
    rows,
    accounts: scenario.accounts || [],
    scenarioId: scenario.id,
    state,
    variantId: selectedVariantId,
    onChanged: applyVariantScenario,
    onNavigateAccount: navigateToAccount,
    groupBy: state?.getGroupBy?.() || '',
    onEdit: (occurrence) => {
      const existing = grid.querySelector('.plan-actuals-editor-wrap');
      existing?.remove();
      const card = grid.querySelector(`[data-occurrence-key="${CSS.escape(occurrence.occurrenceKey)}"]`);
      if (!card) return;
      const editorWrap = document.createElement('div');
      editorWrap.className = 'plan-actuals-editor-wrap';
      editorWrap.appendChild(buildOccurrenceEditor({
        scenarioId: scenario.id,
        occurrence,
        accounts: scenario.accounts || [],
        accountGroups: scenario.accountGroups || [],
        state,
        variantId: selectedVariantId,
        onCancel: () => editorWrap.remove(),
        onSaved: async (nextScenario) => {
          editorWrap.remove();
          if (nextScenario) await applyVariantScenario(nextScenario);
        }
      }));
      card.appendChild(editorWrap);
    }
  });

  if (pendingEditor?.scenarioId === Number(scenario.id) && pendingEditor.occurrence === null) {
    const editorWrap = document.createElement('div');
    editorWrap.className = 'plan-actuals-new-item';
    editorWrap.appendChild(buildOccurrenceEditor({
      scenarioId: scenario.id,
      accounts: scenario.accounts || [],
      accountGroups: scenario.accountGroups || [],
      state,
      variantId: selectedVariantId,
      onCancel: () => {
        pendingEditor = null;
        reload();
      },
      onSaved: async (nextScenario) => {
        pendingEditor = null;
        if (nextScenario) await applyVariantScenario(nextScenario);
      }
    }));
    grid.insertBefore(editorWrap, grid.firstChild);
  }

  installItemDetailDismissal({
    root: container,
    detailsSelector: '.plan-actuals-editor-wrap, .plan-actuals-new-item',
    ownerSelector: '.plan-actuals-item',
    onDismiss: (editor) => {
      pendingEditor = null;
      editor.remove();
    }
  });
}

export async function loadPlanActualsGrid({
  container,
  scenarioState,
  state,
  callbacks,
  logger,
  presentation = null,
  presentationMode = null,
  mode = null
}) {
  const isRenderCurrent = () => callbacks?.isRenderCurrent?.() !== false;
  if (!isRenderCurrent()) return;
  const scenario = scenarioState?.get?.();
  if (!container) return;
  if (!scenario) {
    teardownPlanActualsGrid({
      container,
      teardownRecurringView: callbacks?.teardownRecurringView
    });
    return;
  }

  const resolvedPresentation = normalizePresentation({
    presentation,
    presentationMode,
    mode
  });
  const scenarioId = Number(scenario.id);
  const viewKey = `${resolvedPresentation.contextKey}:${scenarioId}`;
  const view =
    viewByContextScenario.get(viewKey) ||
    callbacks?.getPersistedView?.() ||
    resolvedPresentation.defaultView;
  const reload = async () => loadPlanActualsGrid({
    container,
    scenarioState,
    state,
    callbacks,
    logger,
    presentation: resolvedPresentation
  });

  ensureModeToggle({
    container,
    viewKey,
    view,
    onChange: async (nextView) => {
      await callbacks?.setPersistedView?.(nextView);
      teardownPlanActualsGrid({
        container,
        teardownRecurringView: callbacks?.teardownRecurringView
      });
      await reload();
    }
  });

  if (view === 'recurring') {
    if (!isRenderCurrent()) return;
    teardownPlanActualsGrid({
      container,
      teardownRecurringView: callbacks?.teardownRecurringView
    });
    await callbacks?.loadRecurringView?.(container, {
      ...resolvedPresentation,
      presentationMode: resolvedPresentation.mode
    });
    return;
  }

  try {
    if (!isRenderCurrent()) return;
    callbacks?.teardownRecurringView?.();
    await renderPeriodView({
      container,
      scenarioState,
      state,
      logger,
      reload,
      isRenderCurrent,
      presentationMode: resolvedPresentation.mode
    });
  } catch (error) {
    if (!isRenderCurrent()) return;
    logger?.error?.('[PlanActuals] Failed to render period view', error);
    notifyError(`Failed to load Plan & Actuals: ${error?.message || String(error)}`);
  }
}
