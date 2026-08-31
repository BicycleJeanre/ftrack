// plan-actuals-grid.js
// Unified Budget workflow surface over resolved transaction occurrences and rules.

import { resolveScenarioOccurrences } from '../../../domain/queries/resolve-scenario-occurrences.js';
import { generatePeriods } from '../../../domain/calculations/period-utils.js';
import {
  getRecurrenceDescription
} from '../../../domain/calculations/recurrence-utils.js?v=20260831-recurrence-labels-16';
import { getDefaultProjectionWindowDates, mapPeriodTypeNameToId } from '../../../shared/app-data-utils.js';
import { formatDateOnly } from '../../../shared/date-utils.js';
import { formatCurrency, numValueClass } from '../../../shared/format-utils.js';
import { findPeriodById, findPeriodIndexById } from '../../../shared/period-window-utils.js';
import { transformTransactionToRows } from '../../transforms/transaction-row-transformer.js';
import { calculateResolvedOccurrenceTotals } from '../../transforms/data-aggregators.js';
import { renderTotalsCard } from '../widgets/totals-card.js';
import { openRecurrenceModal } from '../modals/recurrence-modal.js';
import { createGrid, refreshGridData } from './grid-factory.js';
import { notifyError, notifySuccess } from '../../../shared/notifications.js';
import { getScenarioPeriods } from '../../../app/services/data-service.js';
import * as OccurrenceManager from '../../../app/managers/occurrence-manager.js';

const viewByContextScenario = new Map();
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
    container.innerHTML = '';
  }
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function statusName(occurrence) {
  return String(occurrence?.displayStatus || occurrence?.status || 'planned').trim().toLowerCase();
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

    // Keep rows that belonged to the selected account in the frozen baseline
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
    items: [
      {
        label: 'Baseline Net',
        valueHtml: money(totals.baselineNet),
        valueClass: numValueClass(totals.baselineNet),
        calc: 'Baseline Income − Baseline Expenses.',
        shows: 'The frozen or original period plan.'
      },
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
      },
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

function periodPayload(state) {
  const { startDate, endDate } = selectedPeriodRange(state);
  return {
    periodTypeId: mapPeriodTypeNameToId(state?.getBudgetPeriodType?.() || 'Month') || 3,
    startDate,
    endDate
  };
}

function baselinePeriodForDate(state, date) {
  const period = periodPayload(state);
  if (!date || !period.startDate || !period.endDate) return null;
  return date >= period.startDate && date <= period.endDate ? period : null;
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

function buildAccountSelect(accounts, selectedId, { includeNone = false } = {}) {
  const select = document.createElement('select');
  select.className = 'grid-summary-input';
  if (includeNone) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '— None —';
    select.appendChild(option);
  }
  (accounts || []).forEach((account) => {
    const option = document.createElement('option');
    option.value = String(account.id);
    option.textContent = account.name || String(account.id);
    select.appendChild(option);
  });
  select.value = hasValue(selectedId) ? String(selectedId) : '';
  return select;
}

function buildOccurrenceEditor({
  scenarioId,
  occurrence = null,
  accounts,
  state,
  onCancel,
  onSaved
}) {
  const form = document.createElement('form');
  form.className = 'plan-actuals-editor grid-summary-form';

  const isNew = !occurrence;
  const existingStatus = String(occurrence?.status || 'planned');
  const hasLinkedSource = Boolean(occurrence?.sourceTransactionId);
  const hasRecurringSource = hasLinkedSource && isRecurringPattern(occurrence?.recurrence);
  const canEditLinkedSeries = hasRecurringSource && existingStatus === 'planned';
  const { period, startDate } = selectedPeriodRange(state);
  const defaultPrimaryId = accounts?.[0]?.id ?? null;
  const defaultDate = occurrence?.effectiveDate || occurrence?.scheduledDate || startDate || formatDateOnly(new Date());
  let selectedRecurrence = normalizeRecurringPattern(occurrence?.recurrence);
  let recurrenceTouched = false;

  const primarySelect = buildAccountSelect(accounts, occurrence?.primaryAccountId ?? defaultPrimaryId);
  const secondarySelect = buildAccountSelect(accounts, occurrence?.secondaryAccountId, { includeNone: true });
  const typeSelect = createSelect('', [
    { value: 1, label: 'Money In' },
    { value: 2, label: 'Money Out' }
  ], occurrence?.transactionTypeId || 2);
  typeSelect.className = 'grid-summary-input';

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'grid-summary-input';
  dateInput.value = defaultDate || '';

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

  const statusOptions = isNew
    ? [
        { value: 'planned', label: 'Planned' },
        { value: 'actual', label: 'Actual' }
      ]
    : existingStatus === 'actual'
      ? [{ value: 'actual', label: 'Actual' }]
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
    openRecurrenceModal(selectedRecurrence, async (nextRecurrence) => {
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

  const scopeSelect = createSelect('', [
    { value: 'occurrence', label: 'This occurrence only' },
    { value: 'future', label: 'This and future' },
    { value: 'series', label: 'Entire series' }
  ], 'occurrence');
  scopeSelect.className = 'grid-summary-input';
  scopeSelect.disabled = !canEditLinkedSeries;

  if (hasLinkedSource && !canEditLinkedSeries && existingStatus !== 'actual') {
    recurrenceButton.disabled = true;
    recurrenceButton.title = hasRecurringSource
      ? 'Restore this occurrence to planned before changing its recurring series.'
      : 'This item is linked to a one-time rule; edit this occurrence only.';
  }

  if (existingStatus === 'actual') {
    [
      primarySelect,
      secondarySelect,
      typeSelect,
      plannedInput,
      recurrenceButton,
      descriptionInput,
      scopeSelect
    ].forEach((control) => {
      control.disabled = true;
    });
  }

  scopeSelect.addEventListener('change', () => {
    const occurrenceOnly = scopeSelect.value === 'occurrence';
    dateInput.disabled = existingStatus === 'actual' ? false : !occurrenceOnly;
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
  if (canEditLinkedSeries) addField('Apply change to', scopeSelect, true);

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
    const plannedAmount = Math.abs(Number(plannedInput.value || 0));
    const actualAmount = Math.abs(Number(actualInput.value || plannedAmount || 0));
    const selectedStatus = statusSelect.value || 'planned';
    const occurrenceUpdates = {
      primaryAccountId: primarySelect.value ? Number(primarySelect.value) : null,
      secondaryAccountId: secondarySelect.value ? Number(secondarySelect.value) : null,
      transactionTypeId: Number(typeSelect.value || 2),
      plannedDate: dateInput.value || null,
      plannedAmount,
      description: descriptionInput.value.trim()
    };
    const ruleUpdates = {
      primaryAccountId: occurrenceUpdates.primaryAccountId,
      secondaryAccountId: occurrenceUpdates.secondaryAccountId,
      transactionTypeId: occurrenceUpdates.transactionTypeId,
      amount: plannedAmount,
      description: occurrenceUpdates.description
    };
    if (recurrenceTouched) ruleUpdates.recurrence = selectedRecurrence;
    const promotionRuleUpdates = { ...ruleUpdates };
    delete promotionRuleUpdates.recurrence;

    await runAction(saveButton, async () => {
      if (isNew) {
        const scheduledDate = dateInput.value || defaultDate;
        const created = await OccurrenceManager.createManualOccurrence(scenarioId, {
          ...occurrenceUpdates,
          scheduledDate,
          status: selectedStatus,
          plannedAmount: selectedStatus === 'actual' ? 0 : plannedAmount,
          actualAmount: selectedStatus === 'actual' ? actualAmount : null,
          actualDate: selectedStatus === 'actual' ? scheduledDate : null,
          baselinePeriod: baselinePeriodForDate(state, scheduledDate)
        });
        if (isRecurringPattern(selectedRecurrence) && created?.occurrence?.occurrenceKey) {
          await OccurrenceManager.promoteOccurrenceToRecurring(
            scenarioId,
            created.occurrence.occurrenceKey,
            {
              recurrence: selectedRecurrence,
              ruleUpdates: promotionRuleUpdates
            }
          );
        }
      } else {
        const key = occurrence.occurrenceKey;
        const scope = scopeSelect.value;
        let actionKey = key;

        if (existingStatus !== 'actual') {
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
        }

        if (selectedStatus === 'actual') {
          await OccurrenceManager.markActual(scenarioId, actionKey, {
            actualAmount,
            actualDate: dateInput.value || occurrence.actualDate || occurrence.scheduledDate,
            period: baselinePeriodForDate(state, occurrence.scheduledDate)
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

        if (
          recurrenceTouched &&
          isRecurringPattern(selectedRecurrence) &&
          selectedStatus !== 'skipped' &&
          !occurrence.sourceTransactionId
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

function buildCompletionControl({ occurrence, scenarioId, state }) {
  const status = statusName(occurrence);
  const isActual = status === 'actual';
  const isSkipped = status === 'skipped';
  const label = document.createElement('label');
  label.className = `plan-actuals-completion${isActual ? ' is-complete' : ''}`;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = isActual;
  checkbox.disabled = isActual || isSkipped;
  checkbox.setAttribute(
    'aria-label',
    isActual ? 'Actual / completed' : `Mark ${occurrence.description || 'item'} as actual`
  );
  checkbox.title = isSkipped
    ? 'Skipped items cannot be marked actual'
    : (isActual ? 'Actual / completed' : 'Mark as actual / completed');

  const text = document.createElement('span');
  text.textContent = 'Actual';

  label.addEventListener('click', (event) => event.stopPropagation());
  label.addEventListener('mousedown', (event) => event.stopPropagation());
  checkbox.addEventListener('change', async (event) => {
    event.stopPropagation();
    if (!checkbox.checked || checkbox.disabled) return;
    checkbox.disabled = true;
    label.classList.add('is-saving');
    try {
      await OccurrenceManager.markActual(
        scenarioId,
        occurrence.occurrenceKey,
        {
          actualAmount: occurrence.plannedAmount,
          actualDate: occurrence.effectiveDate || occurrence.scheduledDate,
          period: baselinePeriodForDate(state, occurrence.scheduledDate)
        }
      );
    } catch (error) {
      checkbox.checked = false;
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
  onEdit,
  className = ''
}) {
  const actions = document.createElement('div');
  actions.className =
    `grid-summary-actions plan-actuals-actions${className ? ` ${className}` : ''}`;

  actions.appendChild(buildCompletionControl({ occurrence, scenarioId, state }));
  if (occurrence.status !== 'skipped' && occurrence.status !== 'actual') {
    actions.appendChild(actionButton({
      title: 'Skip occurrence',
      text: '⊘',
      onClick: (button) => runAction(button, () => (
        OccurrenceManager.markSkipped(scenarioId, occurrence.occurrenceKey)
      ))
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
  if (!occurrence.sourceTransactionId && occurrence.status !== 'skipped') {
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
    const status = String(occurrence?.status || 'planned').trim().toLowerCase();
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

    const content = document.createElement('div');
    content.className = 'grid-summary-content';

    const counterparty = document.createElement('div');
    counterparty.className = 'grid-summary-title plan-actuals-counterparty';
    counterparty.textContent = displayMovement.secondaryAccountId
      ? accountName(accounts, displayMovement.secondaryAccountId)
      : 'External';

    const top = document.createElement('div');
    top.className = 'plan-actuals-item-top';
    const status = document.createElement('span');
    status.className = `plan-actuals-status status-${statusName(occurrence)}`;
    status.textContent = statusName(occurrence).replaceAll('-', ' ');
    const date = document.createElement('time');
    date.className = 'grid-summary-date';
    date.dateTime = occurrence.effectiveDate || '';
    date.textContent = occurrence.effectiveDate || 'No date';
    const repeat = document.createElement('span');
    repeat.className = 'plan-actuals-repeat';
    repeat.textContent = recurrenceLabel(occurrence);
    top.appendChild(status);
    top.appendChild(date);
    top.appendChild(repeat);

    const movement = document.createElement('div');
    movement.className = 'grid-summary-flow plan-actuals-movement';
    const type = movementTypeLabel(displayMovement.transactionTypeId);
    movement.textContent =
      `${type}: ${movementTextFromDimensions(displayMovement, accounts)}`;

    const description = document.createElement('div');
    description.className = 'grid-summary-description plan-actuals-description';
    description.textContent = occurrence.description || 'Untitled item';

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
      metric.appendChild(labelEl);
      metric.appendChild(valueEl);
      comparison.appendChild(metric);
    });

    content.appendChild(counterparty);
    content.appendChild(top);
    content.appendChild(movement);
    content.appendChild(description);
    content.appendChild(comparison);

    const actions = buildOccurrenceActions({
      occurrence,
      scenarioId,
      state,
      onEdit
    });

    card.appendChild(content);
    card.appendChild(actions);
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
    const canonicalStatus = String(occurrence?.status || 'planned').trim().toLowerCase();
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

    const currentMovement = movementTextFromDimensions(
      currentMovementDimensions(row),
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
      movement: currentMovementLabel,
      baselineMovement: showBaselineMovement ? baselineMovementLabel : '',
      movementGroup:
        movementTypeLabel(currentTypeId || baselineTypeId),
      description: occurrence.description || '',
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
  const span = document.createElement('span');
  span.className = `plan-actuals-status status-${value.replaceAll(' ', '-')}`;
  span.textContent = value;
  return span;
}

function detailMovementFormatter(cell) {
  const data = cell.getRow().getData();
  const wrapper = document.createElement('div');
  wrapper.className = 'plan-actuals-detail-movement';
  const current = document.createElement('div');
  current.textContent = data.movement || '—';
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
      headerTooltip: 'Forecast contribution minus the frozen baseline.'
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
  state,
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
    state,
    onCancel: () => {
      pendingEditor = null;
      closeEditor();
    },
    onSaved: () => {
      pendingEditor = null;
      closeEditor();
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
    groupBy: state?.getGroupBy?.() || ''
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
    state
  });
  planActualsDetailRuntime = {
    scenarioId: scenario.id,
    state,
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
      state,
      isNew: true
    });
  }
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
  const { period, startDate, endDate } = selectedPeriodRange(state);
  const resolved = startDate && endDate
    ? resolveScenarioOccurrences({
        scenario,
        startDate,
        endDate,
        asOfDate: scenario?.projection?.config?.asOfDate ?? null,
        openCommitmentStartDate: scenario?.projection?.config?.openCommitmentStartDate ?? null
      })
    : { occurrences: [], diagnostics: [] };

  const card = container.closest('.forecast-card');
  const header = card?.querySelector(':scope > .card-header');
  const controls = header?.querySelector('.card-header-controls');
  header?.classList.add('card-header--filters-inline');
  if (controls) {
    controls.innerHTML = '';
    const accountOptions = [
      { value: '', label: 'All Accounts' },
      ...(scenario.accounts || []).map((account) => ({
        value: account.id,
        label: account.name || String(account.id)
      }))
    ];
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
    const periodTypeOptions = ['Day', 'Week', 'Month', 'Quarter', 'Year']
      .map((value) => ({ value, label: value }));

    const inlinePeriodType = createSelect('plan-period-type-inline', periodTypeOptions, periodType);
    const inlinePeriod = createSelect('plan-period-inline', periodOptions, selectedId);
    const inlineAccount = createSelect('plan-account-inline', accountOptions, state?.getBudgetAccountFilterId?.() || '');
    const inlineGroup = createSelect('plan-group-inline', groupOptions, state?.getGroupBy?.() || '');
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
    const setGroup = async (value) => {
      inlineGroup.value = String(value ?? '');
      state?.setGroupBy?.(value || '');
      await reload();
    };
    inlineGroup.addEventListener('change', () => setGroup(inlineGroup.value));

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
      pendingEditor = { scenarioId: scenario.id, occurrence: null };
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
    const freeze = async (button) => runAction(button, async () => {
      if (!startDate || !endDate) return;
      await OccurrenceManager.freezePeriodBaseline(scenario.id, {
        ...periodPayload(state),
        startDate,
        endDate
      });
      notifySuccess(`Baseline frozen for ${period?.label || 'the selected period'}.`);
    });
    const freezeInline = document.createElement('button');
    freezeInline.type = 'button';
    freezeInline.className = 'icon-btn card-inline-action';
    freezeInline.title = 'Freeze baseline';
    freezeInline.textContent = '❄';
    freezeInline.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      freeze(freezeInline);
    });
    const inlineFilters = document.createElement('div');
    inlineFilters.className = 'card-inline-filters plan-actuals-inline-filters plan-actuals-toolbar';
    inlineFilters.setAttribute('role', 'toolbar');
    inlineFilters.setAttribute('aria-label', 'Plan and actuals period controls');
    inlineFilters.appendChild(createHeaderFilterItem('View', inlinePeriodType, 'filter-period-type'));
    inlineFilters.appendChild(createHeaderFilterItem('Period', buildNav(inlinePeriod), 'filter-period'));
    inlineFilters.appendChild(createHeaderFilterItem('Account', inlineAccount, 'filter-account'));
    inlineFilters.appendChild(createHeaderFilterItem('Group', inlineGroup, 'filter-group'));
    const actions = document.createElement('div');
    actions.className = 'plan-actuals-toolbar-actions';
    actions.setAttribute('aria-label', 'Period actions');
    actions.appendChild(addInline);
    actions.appendChild(freezeInline);
    inlineFilters.appendChild(actions);

    controls.appendChild(inlineFilters);
  }

  const accountFilterId = state?.getBudgetAccountFilterId?.();
  const rows = buildDisplayRows({
    occurrences: resolved.occurrences,
    accounts: scenario.accounts || [],
    accountFilterId
  });
  const totalsOccurrences = buildComparisonOccurrences(
    resolved.occurrences,
    accountFilterId
  );

  if (presentationMode === 'detail') {
    await renderOccurrenceDetailTable({
      container,
      rows,
      totalsOccurrences,
      diagnostics: resolved.diagnostics || [],
      scenario,
      state,
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

  if (resolved.diagnostics?.length) {
    const diagnostics = document.createElement('div');
    diagnostics.className = 'plan-actuals-diagnostics';
    diagnostics.textContent = `${resolved.diagnostics.length} planning item${resolved.diagnostics.length === 1 ? '' : 's'} need review.`;
    diagnostics.title = resolved.diagnostics.map((item) => item.message || item.code).join('\n');
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
        state,
        onCancel: () => editorWrap.remove(),
        onSaved: () => editorWrap.remove()
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
      state,
      onCancel: () => {
        pendingEditor = null;
        reload();
      },
      onSaved: () => {
        pendingEditor = null;
      }
    }));
    grid.insertBefore(editorWrap, grid.firstChild);
  }
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
    onChange: async () => {
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
