// forecast-budget-grid.js
// Budget grid loader extracted from forecast.js (no behavior change).

import { createGrid, refreshGridData, createDeleteColumn, createTextColumn, createMoneyColumn, createDateColumn, createListEditor, formatMoneyDisplay } from './grid-factory.js';
import { attachGridHandlers } from './grid-handlers.js';
import { createFilterModal } from '../modals/filter-modal.js';
import { formatDateOnly } from '../../../shared/date-utils.js';
import { getRecurrenceDescription } from '../../../domain/calculations/recurrence-utils.js';
import { notifyError, notifySuccess, confirmDialog } from '../../../shared/notifications.js';
import { normalizeCanonicalTransaction, transformTransactionToRows, mapEditToCanonical } from '../../transforms/transaction-row-transformer.js';
import { loadLookup } from '../../../app/services/lookup-service.js';
import { GridStateManager } from './grid-state.js';
import { getScenarioProjectionRows, getScenarioBudgetWindowConfig } from '../../../shared/app-data-utils.js';
import { openTimeframeModal } from '../modals/timeframe-modal.js';
import { formatCurrency } from '../../../shared/format-utils.js';
import { calculateBudgetTotals } from '../../transforms/data-aggregators.js';
import { renderBudgetTotals } from '../widgets/toolbar-totals.js';

import * as BudgetManager from '../../../app/managers/budget-manager.js';
import * as ScenarioManager from '../../../app/managers/scenario-manager.js';

import { getScenario, getScenarioPeriods, getBudget } from '../../../app/services/data-service.js';

const budgetGridState = new GridStateManager('budget');
let lastBudgetDetailTable = null;
let lastBudgetDetailTableReady = false;

function ensureBudgetFilterButton(controls) {
  if (!controls) return null;
  let filterButton = controls.querySelector('[data-budget-filter-trigger]');
  const shouldAppend = !filterButton || !filterButton.isConnected;
  if (!filterButton) {
    filterButton = document.createElement('button');
    filterButton.type = 'button';
    filterButton.className = 'icon-btn';
    filterButton.title = 'Open filters';
    filterButton.textContent = '⚙';
    filterButton.setAttribute('aria-label', 'Filters');
    filterButton.setAttribute('data-budget-filter-trigger', 'true');
  }
  filterButton.style.marginLeft = 'auto';
  if (shouldAppend) {
    controls.appendChild(filterButton);
  }
  return filterButton;
}

/**
 * Normalize a budget entry to transaction-compatible format for perspective transformation
 */
function normalizeBudgetForTransform(budget) {
  return {
    id: budget.id,
    primaryAccountId: budget.primaryAccountId,
    secondaryAccountId: budget.secondaryAccountId,
    transactionTypeId: budget.transactionTypeId,
    transactionType: budget.transactionType,
    amount: budget.amount,
    plannedAmount: budget.amount,
    actualAmount: budget.status?.actualAmount ?? null,
    description: budget.description,
    effectiveDate: budget.occurrenceDate,
    status: budget.status,
    tags: budget.tags || [],
    // Preserve budget-specific fields
    _budgetId: budget.id,
    _scenarioId: budget._scenarioId,
    sourceTransactionId: budget.sourceTransactionId,
    recurrenceDescription: budget.recurrenceDescription,
    occurrenceDate: budget.occurrenceDate,
    periodicChange: budget.periodicChange
  };
}

function renderBudgetRowDetails({ row, rowData }) {
  const rowEl = row.getElement();
  if (!rowEl) return;

  let detailsEl = rowEl.querySelector('.grid-row-details');
  if (!detailsEl) {
    detailsEl = document.createElement('div');
    detailsEl.className = 'grid-row-details';
    rowEl.appendChild(detailsEl);
  }

  if (!rowData?._detailsOpen) {
    detailsEl.style.display = 'none';
    detailsEl.innerHTML = '';
    rowEl.classList.remove('grid-row-expanded');
    return;
  }

  detailsEl.style.display = 'block';
  detailsEl.innerHTML = '';
  rowEl.classList.add('grid-row-expanded');

  const grid = document.createElement('div');
  grid.className = 'grid-row-details-grid';

  const addField = (label, value) => {
    const field = document.createElement('div');
    field.className = 'grid-detail-field';
    const labelEl = document.createElement('label');
    labelEl.className = 'grid-detail-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('div');
    valueEl.className = 'grid-detail-value';
    valueEl.textContent = value || '—';
    field.appendChild(labelEl);
    field.appendChild(valueEl);
    grid.appendChild(field);
  };

  addField('Primary Account', rowData?.primaryAccountName);
  addField('Secondary Account', rowData?.secondaryAccountName);
  addField('Recurrence', rowData?.recurrenceDescription);
  addField('Status', rowData?.status?.name || rowData?.status);

  detailsEl.appendChild(grid);
}

function renderBudgetSummaryList({ container, budgets, accounts, onRefresh, filterAccountId, groupByField }) {
  container.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'grid-summary-list';
  container.appendChild(list);

  if (!budgets || budgets.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'scenarios-list-placeholder';
    empty.textContent = 'No budget entries yet. Switch to Detail to add one.';
    list.appendChild(empty);
    return;
  }

  const { visibleAccounts, displayBudgets } = getBudgetSummaryDisplayRows({
    budgets,
    accounts,
    filterAccountId
  });
  const findAccountName = (id) => visibleAccounts.find((a) => Number(a.id) === Number(id))?.name || 'Unassigned';
  const findAccountCurrency = (id) => {
    const acct = visibleAccounts.find((a) => Number(a.id) === Number(id));
    return acct?.currency?.code || acct?.currency?.name || 'ZAR';
  };

  const buildAccountSelect = (selectedId, includeNone = false) => {
    const sel = document.createElement('select');
    sel.className = 'grid-summary-input';
    if (includeNone) {
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '— None —';
      sel.appendChild(noneOpt);
    }
    visibleAccounts.forEach((a) => {
      const opt = document.createElement('option');
      opt.value = String(a.id);
      opt.textContent = a.name;
      sel.appendChild(opt);
    });
    sel.value = selectedId ? String(selectedId) : '';
    return sel;
  };

  // Sort by groupByField for consistent grouping
  const sortedBudgets = groupByField
    ? [...displayBudgets].sort((a, b) => {
        const ka = String(a[groupByField] || '');
        const kb = String(b[groupByField] || '');
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      })
    : displayBudgets;

  let lastGroupKey = null;

  sortedBudgets.forEach((budget) => {
    // Insert group header when groupByField changes
    if (groupByField) {
      const groupKey = String(budget[groupByField] || 'Other');
      if (groupKey !== lastGroupKey) {
        lastGroupKey = groupKey;
        const groupHeader = document.createElement('div');
        groupHeader.className = 'grid-summary-group-header';
        groupHeader.textContent = groupKey;
        list.appendChild(groupHeader);
      }
    }
    // Get original budget ID (handle flipped rows)
    const originalBudgetId = budget._budgetId || budget.id;
    const card = document.createElement('div');
    card.className = 'grid-summary-card';

    // --- Card face ---
    const content = document.createElement('div');
    content.className = 'grid-summary-content';

    // Use perspective-transformed values with signed amounts
    const isMoneyOut = Number(budget?.transactionTypeId) === 2;
    const statusName = typeof budget?.status === 'object' ? (budget.status?.name || 'planned') : (budget?.status || 'planned');
    const isCompleted = statusName === 'actual';
    if (isCompleted) {
      card.style.borderLeft = '3px solid var(--accent-primary)';
      card.style.paddingLeft = '7px';
    }
    const signedPlannedAmount = Number(budget?.plannedAmount || budget?.amount || 0);
    const rawActualAmount = hasValue(budget?.actualAmount) ? budget.actualAmount : budget?.status?.actualAmount;
    const signedActualAmount = hasValue(rawActualAmount) ? Number(rawActualAmount) : null;
    const actualDate = hasValue(budget?.actualDate) ? budget.actualDate : (hasValue(budget?.status?.actualDate) ? budget.status.actualDate : null);
    const useActualDisplay = isCompleted;
    const displayAmount = useActualDisplay ? signedActualAmount : signedPlannedAmount;
    const formatOptionalMoney = (value) => (value === null || value === undefined || value === '') ? '—' : formatMoneyDisplay(value);
    const formattedDisplayAmount = formatOptionalMoney(displayAmount);
    const plainDisplayAmount = hasValue(displayAmount) ? formatCurrency(displayAmount) : '—';
    const plainPlannedAmount = formatCurrency(signedPlannedAmount);
    const primaryName = budget?.primaryAccountName || findAccountName(budget.primaryAccountId);
    const secondaryName = budget?.secondaryAccountName || findAccountName(budget.secondaryAccountId);

    // Line 1: checkbox + secondary account name + amount
    const rowPrimary = document.createElement('div');
    rowPrimary.className = 'grid-summary-row-primary';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'grid-summary-complete';
    checkbox.checked = isCompleted;
    checkbox.title = isCompleted ? 'Mark as planned' : 'Mark as actual';

    const secondaryNameEl = document.createElement('span');
    secondaryNameEl.className = 'grid-summary-title';
    secondaryNameEl.textContent = secondaryName;

    const amountEl = document.createElement('span');
    if (useActualDisplay) {
      const actualAmountEl = document.createElement('span');
      actualAmountEl.innerHTML = formattedDisplayAmount;

      const plannedAmountEl = document.createElement('span');
      plannedAmountEl.style.fontSize = '0.75em';
      plannedAmountEl.style.color = 'var(--text-secondary)';
      plannedAmountEl.textContent = `(Plan ${plainPlannedAmount})`;

      amountEl.style.display = 'inline-flex';
      amountEl.style.alignItems = 'center';
      amountEl.style.gap = '6px';
      amountEl.appendChild(actualAmountEl);
      amountEl.appendChild(plannedAmountEl);
    } else {
      amountEl.innerHTML = formattedDisplayAmount;
    }

    rowPrimary.appendChild(checkbox);
    rowPrimary.appendChild(secondaryNameEl);
    rowPrimary.appendChild(amountEl);

    // Line 2: flow description (left) + date (right)
    const rowSecondary = document.createElement('div');
    rowSecondary.className = 'grid-summary-row-secondary';

    const flowEl = document.createElement('span');
    flowEl.className = 'grid-summary-flow';
    flowEl.textContent = `${primaryName} \u2192 ${plainDisplayAmount} \u2192 ${secondaryName}`;

    const dateEl = document.createElement('span');
    dateEl.className = 'grid-summary-date';
    dateEl.textContent = useActualDisplay ? (actualDate || '') : (budget?.occurrenceDate || '');

    rowSecondary.appendChild(flowEl);
    rowSecondary.appendChild(dateEl);

    content.appendChild(rowPrimary);
    content.appendChild(rowSecondary);

    // Actions rail: type capsule + icon buttons
    const actions = document.createElement('div');
    actions.className = 'grid-summary-actions';

    const typeSpan = document.createElement('span');
    typeSpan.className = `grid-summary-type ${isMoneyOut ? 'money-out' : 'money-in'}`;
    typeSpan.textContent = isMoneyOut ? 'Money Out' : 'Money In';

    const duplicateBtn = document.createElement('button');
    duplicateBtn.className = 'icon-btn';
    duplicateBtn.title = 'Duplicate Budget Entry';
    duplicateBtn.textContent = '⧉';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn';
    deleteBtn.title = 'Delete Budget Entry';
    deleteBtn.textContent = '⨉';

    actions.appendChild(typeSpan);
    actions.appendChild(duplicateBtn);
    actions.appendChild(deleteBtn);

    // --- Edit form ---
    const form = document.createElement('div');
    form.className = 'grid-summary-form';
    form.style.display = 'none';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'grid-summary-input';
    typeSelect.innerHTML = `<option value="1">Money In</option><option value="2">Money Out</option>`;
    typeSelect.value = String(budget?.transactionTypeId || 2);

    const secondaryAccountSelect = buildAccountSelect(budget?.secondaryAccountId, true);

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.step = '0.01';
    amountInput.className = 'grid-summary-input';
    amountInput.value = Number(budget?.amount || 0);

    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'grid-summary-input';
    descInput.value = budget?.description || '';

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'grid-summary-input grid-summary-input--readonly';
    dateInput.value = budget?.occurrenceDate || '';
    dateInput.readOnly = true;

    const statusSelect = document.createElement('select');
    statusSelect.className = 'grid-summary-input';
    statusSelect.innerHTML = `<option value="planned">Planned</option><option value="actual">Actual</option>`;
    statusSelect.value = statusName;

    const actualAmountInput = document.createElement('input');
    actualAmountInput.type = 'number';
    actualAmountInput.step = '0.01';
    actualAmountInput.className = 'grid-summary-input';
    actualAmountInput.value = budget?.status?.actualAmount != null ? Number(budget.status.actualAmount) : '';
    actualAmountInput.placeholder = 'Optional';

    const actualDateInput = document.createElement('input');
    actualDateInput.type = 'date';
    actualDateInput.className = 'grid-summary-input';
    actualDateInput.value = budget?.status?.actualDate || '';

    const recurrenceInput = document.createElement('input');
    recurrenceInput.type = 'text';
    recurrenceInput.className = 'grid-summary-input';
    recurrenceInput.value = budget?.recurrenceDescription || '';
    recurrenceInput.placeholder = 'e.g. Monthly';

    const addField = (label, inputEl, fullWidth = false) => {
      const field = document.createElement('div');
      field.className = fullWidth ? 'grid-summary-field form-field--full' : 'grid-summary-field';
      const labelEl = document.createElement('label');
      labelEl.className = 'grid-summary-label';
      labelEl.textContent = label;
      field.appendChild(labelEl);
      field.appendChild(inputEl);
      form.appendChild(field);
    };

    addField('Type', typeSelect);
    addField('Secondary Account', secondaryAccountSelect);
    addField('Amount', amountInput);
    addField('Description', descInput, true);
    addField('Planned Date', dateInput);
    addField('Status', statusSelect);
    addField('Actual Amount', actualAmountInput);
    addField('Actual Date', actualDateInput);
    addField('Recurrence', recurrenceInput, true);

    // --- Interactions ---
    async function handleDocMouseDown(e) {
      if (document.querySelector('.modal-overlay')) return;
      if (!card.contains(e.target)) {
        document.removeEventListener('mousedown', handleDocMouseDown);
        exitEdit();
        await doSave();
      }
    }

    const enterEdit = () => {
      form.style.display = 'grid';
      content.style.display = 'none';
      actions.style.display = 'none';
      document.addEventListener('mousedown', handleDocMouseDown);
    };

    const exitEdit = () => {
      document.removeEventListener('mousedown', handleDocMouseDown);
      form.style.display = 'none';
      content.style.display = 'block';
      actions.style.display = 'flex';
    };

    card.addEventListener('click', (e) => {
      if (form.style.display === 'grid') return;
      if (e.target.closest('.icon-btn') || e.target === checkbox) return;
      enterEdit();
    });

    checkbox.addEventListener('click', async (e) => {
      e.stopPropagation();
      const scenario = budget?._scenarioId;
      if (!scenario) return;
      const allBudgets = await getBudget(scenario);
      const idx = allBudgets.findIndex((b) => Number(b.id) === Number(originalBudgetId));
      if (idx === -1) return;
      const prevStatus = allBudgets[idx].status;
      const prevStatusName = typeof prevStatus === 'object' ? prevStatus?.name : (prevStatus || 'planned');
      const newStatusName = prevStatusName === 'actual' ? 'planned' : 'actual';
      const existingActualAmountRaw = typeof prevStatus === 'object'
        ? (hasValue(prevStatus?.actualAmount) ? prevStatus.actualAmount : allBudgets[idx]?.actualAmount)
        : allBudgets[idx]?.actualAmount;
      const existingActualDateRaw = typeof prevStatus === 'object'
        ? (hasValue(prevStatus?.actualDate) ? prevStatus.actualDate : allBudgets[idx]?.actualDate)
        : allBudgets[idx]?.actualDate;
      const existingActualAmount = hasValue(existingActualAmountRaw) ? Math.abs(Number(existingActualAmountRaw)) : null;
      const existingActualDate = hasValue(existingActualDateRaw) ? existingActualDateRaw : null;
      const defaultActualAmount = Math.abs(Number(allBudgets[idx]?.amount ?? budget?.amount ?? 0));
      const defaultActualDate = allBudgets[idx]?.occurrenceDate || budget?.occurrenceDate || null;
      const updatedStatus = typeof prevStatus === 'object'
        ? {
            ...prevStatus,
            name: newStatusName,
            actualAmount: newStatusName === 'actual' ? (existingActualAmount ?? defaultActualAmount) : existingActualAmount,
            actualDate: newStatusName === 'actual' ? (existingActualDate ?? defaultActualDate) : existingActualDate
          }
        : {
            name: newStatusName,
            actualAmount: newStatusName === 'actual' ? (existingActualAmount ?? defaultActualAmount) : existingActualAmount,
            actualDate: newStatusName === 'actual' ? (existingActualDate ?? defaultActualDate) : existingActualDate
          };
      allBudgets[idx] = { ...allBudgets[idx], status: updatedStatus };
      await BudgetManager.saveAll(scenario, allBudgets);
      await onRefresh?.();
    });

    const doSave = async () => {
      const scenario = budget?._scenarioId;
      if (!scenario) return;
      const allBudgets = await getBudget(scenario);
      const idx = allBudgets.findIndex((b) => Number(b.id) === Number(originalBudgetId));
      if (idx === -1) return;
      const prevStatus = allBudgets[idx].status;
      const newStatusName = statusSelect.value;
      const enteredActualAmount = actualAmountInput.value !== '' ? Math.abs(Number(actualAmountInput.value)) : null;
      const enteredActualDate = actualDateInput.value || null;
      const existingActualAmountRaw = typeof prevStatus === 'object'
        ? (hasValue(prevStatus?.actualAmount) ? prevStatus.actualAmount : allBudgets[idx]?.actualAmount)
        : allBudgets[idx]?.actualAmount;
      const existingActualDateRaw = typeof prevStatus === 'object'
        ? (hasValue(prevStatus?.actualDate) ? prevStatus.actualDate : allBudgets[idx]?.actualDate)
        : allBudgets[idx]?.actualDate;
      const existingActualAmount = hasValue(existingActualAmountRaw) ? Math.abs(Number(existingActualAmountRaw)) : null;
      const existingActualDate = hasValue(existingActualDateRaw) ? existingActualDateRaw : null;
      const defaultActualAmount = Math.abs(Number(amountInput.value || allBudgets[idx]?.amount || 0));
      const defaultActualDate = allBudgets[idx]?.occurrenceDate || null;
      const resolvedActualAmount = newStatusName === 'actual'
        ? (enteredActualAmount ?? existingActualAmount ?? defaultActualAmount)
        : (enteredActualAmount ?? existingActualAmount);
      const resolvedActualDate = newStatusName === 'actual'
        ? (enteredActualDate || existingActualDate || defaultActualDate)
        : (enteredActualDate || existingActualDate || null);
      const updatedStatus = typeof prevStatus === 'object'
        ? {
            ...prevStatus,
            name: newStatusName,
            actualAmount: resolvedActualAmount,
            actualDate: resolvedActualDate
          }
        : {
            name: newStatusName,
            actualAmount: resolvedActualAmount,
            actualDate: resolvedActualDate
          };
      allBudgets[idx] = {
        ...allBudgets[idx],
        transactionTypeId: Number(typeSelect.value || 2),
        secondaryAccountId: secondaryAccountSelect.value ? Number(secondaryAccountSelect.value) : null,
        amount: Math.abs(Number(amountInput.value || 0)),
        description: descInput.value.trim(),
        status: updatedStatus,
        recurrenceDescription: recurrenceInput.value.trim() || allBudgets[idx].recurrenceDescription
      };
      await BudgetManager.saveAll(scenario, allBudgets);
      await onRefresh?.();
    };

    form.addEventListener('focusout', () => {
      setTimeout(async () => {
        if (document.querySelector('.modal-overlay')) return;
        if (form.style.display !== 'grid') return;
        if (!form.contains(document.activeElement)) {
          await doSave();
        }
      }, 0);
    });

    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const focusable = Array.from(form.querySelectorAll('input:not([readonly]):not([disabled]), select:not([disabled])'));
      const idx = focusable.indexOf(e.target);
      if (idx === -1) return;
      e.preventDefault();
      if (idx < focusable.length - 1) {
        focusable[idx + 1].focus();
      } else {
        document.removeEventListener('mousedown', handleDocMouseDown);
        exitEdit();
        doSave();
      }
    });

    duplicateBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const scenario = budget?._scenarioId;
      if (!scenario) return;
      const allBudgets = await getBudget(scenario);
      const source = allBudgets.find((b) => Number(b.id) === Number(originalBudgetId));
      if (!source) return;
      const cloned = { ...source, id: 0 };
      allBudgets.push(cloned);
      await BudgetManager.saveAll(scenario, allBudgets);
      await onRefresh?.();
    });

    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const scenario = budget?._scenarioId;
      if (!scenario) return;
      if (!await confirmDialog('Delete this budget entry?')) return;
      const allBudgets = await getBudget(scenario);
      const filtered = allBudgets.filter((b) => Number(b.id) !== Number(originalBudgetId));
      await BudgetManager.saveAll(scenario, filtered);
      await onRefresh?.();
    });

    card.appendChild(content);
    card.appendChild(actions);
    card.appendChild(form);

    list.appendChild(card);
  });
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function isCompletedRow(rowData) {
  const statusName = rowData?.status?.name;
  if (typeof statusName === 'string') return statusName.toLowerCase() === 'actual';
  if (rowData?.completed === true) return true;
  return false;
}

/**
 * If the scenario is missing a budgetWindow config, open the timeframe modal so the user
 * can set one first. Once a valid config exists (or immediately if already set), calls onReady.
 */
function requireBudgetWindow({ scenario, scenarioState, onReady }) {
  const existing = getScenarioBudgetWindowConfig(scenario);
  if (existing?.startDate && existing?.endDate) {
    onReady();
    return;
  }
  openTimeframeModal({
    title: 'Set Budget Window',
    showPeriodType: false,
    onConfirm: async ({ startDate, endDate }) => {
      try {
        await ScenarioManager.update(scenario.id, { budgetWindow: { config: { startDate, endDate } } });
        const refreshed = await getScenario(scenario.id);
        scenarioState?.set?.(refreshed);
        onReady();
      } catch (err) {
        notifyError('Failed to set budget window: ' + (err?.message || String(err)));
      }
    }
  });
}

function applyMasterBudgetTableFilters({ tables, state, callbacks }) {
  const masterBudgetTable = tables?.getMasterBudgetTable?.();
  if (!masterBudgetTable) return;

  const budgetAccountFilterId = state?.getBudgetAccountFilterId?.();
  const budgetPeriodId = state?.getBudgetPeriod?.();
  const periods = state?.getBudgetPeriods?.() || [];
  const selectedPeriod = budgetPeriodId ? periods.find((p) => p.id === budgetPeriodId) : null;

  // Convert period boundaries to date strings for fast comparison
  const periodStartStr = selectedPeriod?.startDate ? formatDateOnly(selectedPeriod.startDate) : null;
  const periodEndStr = selectedPeriod?.endDate ? formatDateOnly(selectedPeriod.endDate) : null;

  masterBudgetTable.setFilter((data) => {
    if (!data) return false;

    if (budgetAccountFilterId) {
      // Show only the perspective matching the selected account
      if (Number(data.perspectiveAccountId) !== Number(budgetAccountFilterId)) return false;
    } else {
      // No account filter — hide flipped rows to avoid duplicates
      if (String(data.id).endsWith('_flipped')) return false;
    }

    if (periodStartStr && periodEndStr) {
      const occStr = data.occurrenceDate; // Already a string (YYYY-MM-DD)
      if (!occStr) return false;
      if (occStr < periodStartStr || occStr > periodEndStr) return false;
    }

    return true;
  });

  callbacks?.updateBudgetTotals?.();
}

function applyBudgetDetailFilters({ state, periods, callbacks }) {
  if (!lastBudgetDetailTable) return;

  const accountId = state?.getBudgetAccountFilterId?.();
  const periodId  = state?.getBudgetPeriod?.();
  const selectedPeriod = periodId ? periods.find((p) => String(p.id) === String(periodId)) : null;

  let periodStartStr = null;
  let periodEndStr = null;
  if (selectedPeriod?.startDate && selectedPeriod?.endDate) {
    periodStartStr = formatDateOnly(selectedPeriod.startDate);
    periodEndStr = formatDateOnly(selectedPeriod.endDate);
  }

  lastBudgetDetailTable.setFilter((data) => {
    if (!data) return false;
    if (accountId) {
      // Show only the perspective matching the selected account
      if (Number(data.perspectiveAccountId) !== Number(accountId)) return false;
    } else {
      // No account filter — hide flipped rows to avoid duplicates
      if (String(data.id).endsWith('_flipped')) return false;
    }
    if (periodStartStr && periodEndStr) {
      const occStr = data.occurrenceDate;
      if (!occStr) return false;
      if (occStr < periodStartStr || occStr > periodEndStr) return false;
    }
    return true;
  });

  callbacks?.updateBudgetTotals?.();
}

function applyBudgetSummaryFilters({ budgets, state, periods, accounts, gridContainer, reload }) {
  // Pre-compute filter criteria
  const budgetPeriod = state?.getBudgetPeriod?.();
  const accountFilterId = state?.getBudgetAccountFilterId?.();
  const groupByField = state?.getGroupBy?.();
  
  let periodStartStr = null, periodEndStr = null;
  if (budgetPeriod) {
    const selectedPeriod = periods.find((p) => String(p.id) === String(budgetPeriod));
    if (selectedPeriod?.startDate && selectedPeriod?.endDate) {
      periodStartStr = formatDateOnly(selectedPeriod.startDate);
      periodEndStr = formatDateOnly(selectedPeriod.endDate);
    }
  }
  
  // Filter budgets by period only - account filtering happens during transformation
  const filtered = budgets.filter((b) => {
    // Period filter
    if (periodStartStr && periodEndStr) {
      const occStr = b.occurrenceDate;
      if (!occStr) return false;
      if (occStr < periodStartStr || occStr > periodEndStr) return false;
    }
    
    return true;
  });
  
  // Re-render with all period-filtered budgets - perspective filtering happens in render
  renderBudgetSummaryList({
    container: gridContainer,
    budgets: filtered,
    accounts,
    onRefresh: reload,
    filterAccountId: accountFilterId,
    groupByField: groupByField
  });
}

function ensureBudgetTotalsContainer(container, gridContainer) {
  if (!container) return null;

  let totalsContainer = container.querySelector(':scope > .budget-totals-container#budgetContent');
  if (!totalsContainer) {
    totalsContainer = document.createElement('div');
    totalsContainer.className = 'budget-totals-container';
    totalsContainer.id = 'budgetContent';
  }

  if (gridContainer?.parentNode === container) {
    if (totalsContainer.parentNode !== container || totalsContainer.nextSibling !== gridContainer) {
      try {
        container.insertBefore(totalsContainer, gridContainer);
      } catch (_) {
        // ignore
      }
    }
  } else if (totalsContainer.parentNode !== container) {
    container.insertBefore(totalsContainer, container.firstChild);
  }

  return totalsContainer;
}

function getBudgetSummaryDisplayRows({ budgets, accounts, filterAccountId }) {
  const visibleAccounts = (accounts || []).filter((a) => a.name !== 'Select Account');

  const allPerspectiveRows = (budgets || []).flatMap((b) => {
    const normalized = normalizeBudgetForTransform(b);
    return transformTransactionToRows(normalized, visibleAccounts);
  });

  const displayBudgets = (filterAccountId
    ? allPerspectiveRows.filter((r) => Number(r.perspectiveAccountId) === Number(filterAccountId))
    : allPerspectiveRows.filter((r) => !String(r.id).endsWith('_flipped'))
  ).map((r) => ({
    ...r,
    statusName: (typeof r.status === 'object' ? r.status?.name : r.status) || 'planned'
  }));

  return { visibleAccounts, displayBudgets };
}

function renderBudgetSummaryTotals({ totalsContainer, budgets, accounts, filterAccountId }) {
  if (!totalsContainer) return;

  const { displayBudgets } = getBudgetSummaryDisplayRows({ budgets, accounts, filterAccountId });

  const totals = calculateBudgetTotals(displayBudgets, {
    plannedField: 'plannedAmount',
    actualField: 'actualAmount',
    typeField: 'transactionType',
    typeNameField: 'transactionTypeName',
    typeIdField: 'transactionTypeId'
  });

  renderBudgetTotals(totalsContainer, totals);
}

export async function loadBudgetGrid({
  container,
  scenarioState,
  state,
  tables,
  callbacks,
  logger
}) {
  let currentScenario = scenarioState?.get?.();
  if (!currentScenario) return;

  const budgetModeKey = state?.getBudgetMode?.() === 'detail' ? 'detail' : 'summary';
  const groupByStateKey = `groupBy:${budgetModeKey}`;

  try {
    const existingTable = tables?.getMasterBudgetTable?.();
    budgetGridState.capture(existingTable, {
      [groupByStateKey]: '#budget-grouping-select'
    });
  } catch (_) {
    // Keep existing behavior: ignore state capture errors.
  }

  const dropdownState = budgetGridState?.state?.dropdowns || {};

  const isBudgetDetailMode = state?.getBudgetMode?.() === 'detail';

  if (isBudgetDetailMode) {
    // --- Detail mode: full Tabulator grid ---

    // Clear header icon controls (toolbar replaces them in detail mode) and ensure the filter trigger exists immediately.
    const budgetSectionDetail = container.closest('.forecast-card');
    const budgetHeaderDetail = budgetSectionDetail?.querySelector(':scope > .card-header');
    if (budgetHeaderDetail) {
      const controls = budgetHeaderDetail.querySelector('.card-header-controls');
      if (controls) {
        controls.innerHTML = '';
        ensureBudgetFilterButton(controls);
      }
    }

    container.querySelectorAll(':scope > .empty-message').forEach((el) => el.remove());

    let gridContainer = container.querySelector(':scope > .grid-container.budget-grid');
    if (!gridContainer) {
      gridContainer = document.createElement('div');
      gridContainer.className = 'grid-container budget-grid';
      window.add(container, gridContainer);
    }

    gridContainer.classList.add('grid-detail');
    // Don't bump token here - only bump after actual data modifications
    // This allows better performance for view/filter changes

    // --- Load data ---
    const budgetPeriodType = state?.getBudgetPeriodType?.() || 'Month';
    let periods = state?.getBudgetPeriods?.();
    if (!periods || periods.length === 0) {
      periods = await getScenarioPeriods(currentScenario.id, budgetPeriodType, 'budget');
      state?.setBudgetPeriods?.(periods);
    }

    const allBudgets = await getBudget(currentScenario.id);
    const accounts = currentScenario.accounts || [];
    const findAccountName = (id) => accounts.find((a) => Number(a.id) === Number(id))?.name || 'Unassigned';
    const secondaryAccountOptions = ['— None —', ...accounts.map((a) => a.name || String(a.id))];

    // Transform budgets to perspective rows using shared transformer.
    // Keep flipped rows so the account filter can show entries from either perspective.
    const displayRows = allBudgets.flatMap((b) => {
      const normalized = normalizeBudgetForTransform({ ...b, _scenarioId: currentScenario.id });
      return transformTransactionToRows(normalized, accounts);
    }).map((r) => ({
      ...r,
      _scenarioId: currentScenario.id,
      // Perspective-aware account names already set by transformer
      transactionTypeName: r.transactionTypeName || (Number(r.transactionTypeId) === 2 ? 'Money Out' : 'Money In'),
      // Keep signed amounts from transformer so color formatting is correct (Money Out is negative)
      plannedAmount: r.plannedAmount != null ? Number(r.plannedAmount) : null,
      actualAmount: r.actualAmount != null ? Number(r.actualAmount) : null,
      actualDate: r.actualDate || r.status?.actualDate || null,
      statusName: r.status?.name || 'planned',
      // Preserve budget-specific fields from normalized data
      occurrenceDate: r.occurrenceDate,
      recurrenceDescription: r.recurrenceDescription
    }));

    const reload = () => loadBudgetGrid({ container, scenarioState, state, tables, callbacks, logger });

    // --- Card header controls (projections-detail pattern) ---
    const budgetSectionEl = container.closest('.forecast-card');
    const budgetHeaderEl = budgetSectionEl?.querySelector(':scope > .card-header');
    if (budgetHeaderEl) {
      budgetHeaderEl.classList.add('card-header--filters-inline');
      const controls = budgetHeaderEl.querySelector('.card-header-controls');
      if (controls) {
        controls.innerHTML = '';

        // Debounce period type changes
        let periodTypeChangeTimeout = null;

        // View By (period type)
        const periodTypeSelect = document.createElement('select');
        periodTypeSelect.id = 'budget-period-type-select';
        periodTypeSelect.className = 'input-select';
        ['Day', 'Week', 'Month', 'Quarter', 'Year'].forEach((pt) => {
          const opt = document.createElement('option');
          opt.value = pt; opt.textContent = pt;
          periodTypeSelect.appendChild(opt);
        });
        periodTypeSelect.value = budgetPeriodType;
        periodTypeSelect.addEventListener('change', async () => {
          clearTimeout(periodTypeChangeTimeout);
          periodTypeChangeTimeout = setTimeout(async () => {
            state?.setBudgetPeriodType?.(periodTypeSelect.value);
            state?.setBudgetPeriods?.([]);
            state?.setBudgetPeriod?.(null);
            await reload();
          }, 50);
        });

        // Period + ◀ ▶ navigation
        const periodSelect = document.createElement('select');
        periodSelect.id = 'budget-period-select';
        periodSelect.className = 'input-select';
        
        // Helper to rebuild period options - NO "All" option for budget
        const rebuildPeriodOptions = (freshPeriods) => {
          periodSelect.innerHTML = '';
          freshPeriods.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = String(p.id);
            opt.textContent = p.label || String(p.id);
            periodSelect.appendChild(opt);
          });
          const curPeriod = state?.getBudgetPeriod?.();
          if (curPeriod) {
            periodSelect.value = String(curPeriod);
          } else if (freshPeriods.length > 0) {
            // Default to first period if none selected
            periodSelect.value = String(freshPeriods[0].id);
            state?.setBudgetPeriod?.(freshPeriods[0].id);
          }
        };
        
        // Initial build - use fresh periods from state
        rebuildPeriodOptions(state?.getBudgetPeriods?.() || []);

        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'period-btn';
        prevBtn.textContent = '◀';
        prevBtn.title = 'Previous period';
        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'period-btn';
        nextBtn.textContent = '▶';
        nextBtn.title = 'Next period';

        const periodNav = document.createElement('div');
        periodNav.className = 'period-nav';
        periodNav.appendChild(prevBtn);
        periodNav.appendChild(nextBtn);

        // Account filter
        const accountSelect = document.createElement('select');
        accountSelect.id = 'budget-account-select';
        accountSelect.className = 'input-select';
        accounts.forEach((a) => {
          const opt = document.createElement('option');
          opt.value = String(a.id);
          opt.textContent = a.name || String(a.id);
          accountSelect.appendChild(opt);
        });
        const curAccountId = state?.getBudgetAccountFilterId?.();
        const firstAccountId = accounts[0]?.id != null ? Number(accounts[0].id) : null;
        const effectiveAccountId = curAccountId || firstAccountId;
        if (effectiveAccountId) {
          accountSelect.value = String(effectiveAccountId);
          if (!curAccountId) state?.setBudgetAccountFilterId?.(effectiveAccountId);
        }

        // Group By
        const groupBySelect = document.createElement('select');
        groupBySelect.id = 'budget-grouping-select';
        groupBySelect.className = 'input-select';
        [
          { value: '', label: 'None' },
          { value: 'transactionTypeName', label: 'Type' },
          { value: 'secondaryAccountName', label: 'Secondary Account' },
          { value: 'statusName', label: 'Status' }
        ].forEach(({ value, label }) => {
          const opt = document.createElement('option');
          opt.value = value; opt.textContent = label;
          groupBySelect.appendChild(opt);
        });
        const detailGroupBy = String(dropdownState[groupByStateKey] || '');
        const currentGroupBy = detailGroupBy || state?.getGroupBy?.();
        if (currentGroupBy) groupBySelect.value = currentGroupBy;

        // Action buttons
        const generateFromProjectionsBtn = document.createElement('button');
        generateFromProjectionsBtn.className = 'icon-btn';
        generateFromProjectionsBtn.title = 'Generate from Expanded Transactions';
        generateFromProjectionsBtn.textContent = '⊞';
        const addButton = document.createElement('button');
        addButton.className = 'icon-btn';
        addButton.title = 'Add budget entry';
        addButton.textContent = '⊕';
        const clearBtn = document.createElement('button');
        clearBtn.className = 'icon-btn';
        clearBtn.title = 'Clear budget';
        clearBtn.textContent = '⊗';
        const modalActions = document.createElement('div');
        modalActions.className = 'modal-filter-actions';
        modalActions.appendChild(generateFromProjectionsBtn);
        modalActions.appendChild(addButton);
        modalActions.appendChild(clearBtn);

        // Modal trigger
        const filterButton = ensureBudgetFilterButton(controls);

        createFilterModal({
          id: 'budget-filters-detail-modal',
          title: 'Filter Budget',
          trigger: filterButton,
          items: [
            { id: 'period-type', label: 'Period Type:', control: periodTypeSelect },
            { id: 'period', label: 'Period:', control: periodSelect },
            { id: 'period-nav', label: '', control: periodNav },
            { id: 'account', label: 'Account:', control: accountSelect },
            { id: 'group-by', label: 'Group By:', control: groupBySelect },
            { id: 'actions', label: 'Actions:', control: modalActions }
          ]
        });

        // --- Event handlers ---
        clearBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!await confirmDialog('Clear all budget entries?')) return;
          const prevText = clearBtn.textContent;
          try {
            clearBtn.textContent = '…';
            clearBtn.disabled = true;
            currentScenario = scenarioState?.get?.();
            if (!currentScenario?.id) return;
            await BudgetManager.clearAll(currentScenario.id);
            const refreshed = await getScenario(currentScenario.id);
                          state?.setBudgetPeriods?.([]); // Clear period cache to refetch from new budget window
            scenarioState?.set?.(refreshed);
            state?.bumpBudgetGridLoadToken?.(); // Bump token after data modification
            await reload();
          } catch (err) {
            notifyError('Failed to clear budget: ' + (err?.message || String(err)));
          } finally {
            if (clearBtn.isConnected) {
              clearBtn.textContent = prevText;
              clearBtn.disabled = false;
            }
          }
        });

        generateFromProjectionsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          currentScenario = scenarioState?.get?.();
          openTimeframeModal({
            title: 'Generate from Expanded Transactions',
            showPeriodType: false,
            onConfirm: async ({ startDate, endDate }) => {
              const prevText = generateFromProjectionsBtn.textContent;
              try {
                generateFromProjectionsBtn.disabled = true;
                await ScenarioManager.update(currentScenario.id, { budgetWindow: { config: { startDate, endDate } } });
                await BudgetManager.createFromProjections(currentScenario.id);
                const refreshed = await getScenario(currentScenario.id);
                scenarioState?.set?.(refreshed);
                state?.setBudgetPeriods?.([]); // Clear period cache to refetch from new budget window
                await reload();
                notifySuccess('Budget generated from expanded transactions.');
              } catch (err) {
                notifyError(err?.message || 'Failed to generate from projections.');
              } finally {
                if (generateFromProjectionsBtn.isConnected) {
                  generateFromProjectionsBtn.disabled = false;
                  generateFromProjectionsBtn.textContent = prevText;
                }
              }
            }
          });
        });

        addButton.addEventListener('click', (e) => {
          e.stopPropagation();
          currentScenario = scenarioState?.get?.();
          requireBudgetWindow({
            scenario: currentScenario,
            scenarioState,
            onReady: async () => {
              try {
                currentScenario = scenarioState?.get?.();
                const allBudgetsForAdd = await getBudget(currentScenario.id);
                let defaultDate = formatDateOnly(new Date());
                const livePeriods = state?.getBudgetPeriods?.() || [];
                const livePeriod = state?.getBudgetPeriod?.();
                if (livePeriod) {
                  const sel = livePeriods.find((p) => String(p.id) === String(livePeriod));
                  if (sel?.startDate) defaultDate = formatDateOnly(sel.startDate);
                }
                const acctSnapshot = state?.getBudgetAccountFilterId?.();
                const firstAccId = accounts?.[0]?.id != null ? Number(accounts[0].id) : null;
                const isValidId = (id) => accounts.some((a) => Number(a.id) === Number(id));
                const primaryAccountId = isValidId(acctSnapshot) ? acctSnapshot : firstAccId;
                allBudgetsForAdd.push({
                  id: null, sourceTransactionId: null,
                  primaryAccountId, secondaryAccountId: null,
                  transactionTypeId: 2, amount: 0, description: '',
                  occurrenceDate: defaultDate, recurrenceDescription: 'One time',
                  status: { name: 'planned', actualAmount: null, actualDate: null }
                });
                await BudgetManager.saveAll(currentScenario.id, allBudgetsForAdd);
                const refreshed = await getScenario(currentScenario.id);
                scenarioState?.set?.(refreshed);
                state?.bumpBudgetGridLoadToken?.(); // Bump token after data modification
                await reload();
              } catch (err) {
                notifyError('Failed to create budget entry. Please try again.');
              }
            }
          });
        });

        periodSelect.addEventListener('change', () => {
          state?.setBudgetPeriod?.(periodSelect.value || null);
          // Get fresh periods from state rather than closure to ensure accuracy
          const freshPeriods = state?.getBudgetPeriods?.() || [];
          applyBudgetDetailFilters({ state, periods: freshPeriods, callbacks });
        });

        const changePeriodBy = (offset) => {
          if (prevBtn.disabled || nextBtn.disabled) return; // Prevent concurrent
          prevBtn.disabled = nextBtn.disabled = true;
          
          // Get fresh periods from state to ensure accuracy
          const freshPeriods = state?.getBudgetPeriods?.() || [];
          const periodIds = [null, ...freshPeriods.map((p) => p.id || null)];
          const currentId = state?.getBudgetPeriod?.() ?? null;
          const currentIndex = periodIds.findIndex((id) => id === currentId);
          const safeIndex = currentIndex === -1 ? 0 : currentIndex;
          const nextIndex = Math.min(Math.max(safeIndex + offset, 0), periodIds.length - 1);
          const nextId = periodIds[nextIndex] ?? null;
          periodSelect.value = nextId ? String(nextId) : '';
          state?.setBudgetPeriod?.(nextId);
          applyBudgetDetailFilters({ state, periods: freshPeriods, callbacks });
          
          setTimeout(() => {
            prevBtn.disabled = nextBtn.disabled = false;
          }, 100);
        };
        prevBtn.addEventListener('click', (e) => { e.preventDefault(); changePeriodBy(-1); });
        nextBtn.addEventListener('click', (e) => { e.preventDefault(); changePeriodBy(1); });

        accountSelect.addEventListener('change', () => {
          state?.setBudgetAccountFilterId?.(Number(accountSelect.value));
          // Get fresh periods from state to maintain consistency with period selector
          const freshPeriods = state?.getBudgetPeriods?.() || [];
          applyBudgetDetailFilters({ state, periods: freshPeriods, callbacks });
        });

        groupBySelect.addEventListener('change', () => {
          const field = groupBySelect.value;
          budgetGridState.state.dropdowns[groupByStateKey] = field;
          state?.setGroupBy?.(field);
          lastBudgetDetailTable?.setGroupBy?.(field ? [field] : []);
        });

      }
    }

    // --- Totals card (outside header, overall-total summary card style) ---
    container.querySelectorAll(':scope > .grid-toolbar, :scope > .grid-totals, :scope > .budget-totals-container').forEach((el) => el.remove());
    const totalsBar = document.createElement('div');
    totalsBar.className = 'budget-totals-container';
    totalsBar.id = 'budgetContent';
    container.insertBefore(totalsBar, gridContainer);

    // --- Columns ---
    const columns = [
      createDeleteColumn(
        async (cell) => {
          const row = cell.getRow().getData();
          const scenarioId = row._scenarioId;
          if (!scenarioId) return;
          const allBudgetsForDel = await getBudget(scenarioId);
          // Extract canonical budget ID (handle potential flipped rows)
          const canonicalId = Number(row._budgetId || row.originalTransactionId || row.id);
          const remaining = allBudgetsForDel.filter((b) => Number(b.id) !== canonicalId);
          await BudgetManager.saveAll(scenarioId, remaining);
          state?.bumpBudgetGridLoadToken?.(); // Bump token after data modification
          await reload();
        },
        { confirmMessage: (rowData) => `Delete budget entry: ${rowData.description || 'Untitled'}?` }
      ),
      {
        title: 'Secondary',
        field: 'secondaryAccountName',
        widthGrow: 1,
        headerSort: true,
        headerFilter: 'input',
        headerHozAlign: 'left',
        ...createListEditor(secondaryAccountOptions)
      },
      {
        title: 'Type', field: 'transactionTypeName', minWidth: 90, widthGrow: 1,
        ...createListEditor(['Money In', 'Money Out']),
        formatter: (cell) => {
          const val = cell.getValue();
          const cls = val === 'Money Out' ? 'money-out' : 'money-in';
          return `<span class="grid-summary-type ${cls}">${val}</span>`;
        }
      },
      createMoneyColumn('Planned', 'plannedAmount', { widthGrow: 1 }),
      createDateColumn('Date', 'occurrenceDate', { editor: 'input', editable: true }),
      createTextColumn('Recurrence', 'recurrenceDescription', { widthGrow: 1 }),
      createTextColumn('Description', 'description', { widthGrow: 2, editor: 'input', editable: true }),
      createMoneyColumn('Actual', 'actualAmount', { widthGrow: 1 }),
      createDateColumn('Actual Date', 'actualDate', {}),
      {
        title: '',
        field: 'statusName',
        width: 72,
        minWidth: 72,
        hozAlign: 'center',
        headerSort: false,
        headerTooltip: 'Actual (checked) / Planned (unchecked)',
        responsive: 0,
        topCalc: false,
        formatter: (cell) => {
          const isActual = cell.getRow().getData().statusName === 'actual';
          return `<input type="checkbox" ${isActual ? 'checked' : ''} style="pointer-events:none;cursor:default;">`;
        },
        cellClick: async (e, cell) => {
          const row = cell.getRow().getData();
          const scenarioId = row._scenarioId;
          if (!scenarioId) return;
          const allBudgetsForToggle = await getBudget(scenarioId);
          // Extract canonical budget ID (handle potential flipped rows)
          const canonicalId = Number(row._budgetId || row.originalTransactionId || row.id);
          const idx = allBudgetsForToggle.findIndex((b) => Number(b.id) === canonicalId);
          if (idx === -1) return;
          const prevStatus = allBudgetsForToggle[idx].status;
          const prevStatusName = typeof prevStatus === 'object' ? prevStatus?.name : (prevStatus || 'planned');
          const newStatusName = prevStatusName === 'actual' ? 'planned' : 'actual';
          // Default from planned only when no prior actual override is saved
          const prevActualAmountRaw = typeof prevStatus === 'object'
            ? (hasValue(prevStatus?.actualAmount) ? prevStatus.actualAmount : allBudgetsForToggle[idx]?.actualAmount)
            : allBudgetsForToggle[idx]?.actualAmount;
          const prevActualDateRaw = typeof prevStatus === 'object'
            ? (hasValue(prevStatus?.actualDate) ? prevStatus.actualDate : allBudgetsForToggle[idx]?.actualDate)
            : allBudgetsForToggle[idx]?.actualDate;
          const prevActualAmount = hasValue(prevActualAmountRaw) ? Math.abs(Number(prevActualAmountRaw)) : null;
          const prevActualDate = hasValue(prevActualDateRaw) ? prevActualDateRaw : null;
          const resolvedActualAmount = newStatusName === 'actual'
            ? (prevActualAmount ?? row.plannedAmount ?? null)
            : prevActualAmount;
          const resolvedActualDate = newStatusName === 'actual'
            ? (prevActualDate ?? row.occurrenceDate ?? null)
            : prevActualDate;
          const updatedStatus = typeof prevStatus === 'object'
            ? { ...prevStatus, name: newStatusName, actualAmount: resolvedActualAmount, actualDate: resolvedActualDate }
            : { name: newStatusName, actualAmount: resolvedActualAmount, actualDate: resolvedActualDate };
          allBudgetsForToggle[idx] = { ...allBudgetsForToggle[idx], status: updatedStatus };
          await BudgetManager.saveAll(scenarioId, allBudgetsForToggle);
          state?.bumpBudgetGridLoadToken?.(); // Bump token after data modification
          cell.getRow().update({ statusName: newStatusName, actualAmount: resolvedActualAmount, actualDate: resolvedActualDate });
          callbacks?.updateBudgetTotals?.();
        }
      }
    ];

    // --- Reuse or create Tabulator instance ---
    let budgetTable = lastBudgetDetailTable;
    const shouldRebuild = !budgetTable || budgetTable.element !== gridContainer;

    if (shouldRebuild) {
      try { budgetTable?.destroy?.(); } catch (_) { /* ignore */ }
      lastBudgetDetailTableReady = false;

      budgetTable = await createGrid(gridContainer, {
        data: displayRows,
        columns,
        cellEdited: async (cell) => {
          try {
            const row = cell.getRow().getData();
            const scenarioId = row._scenarioId;
            if (!scenarioId) return;
            const allBudgetsForEdit = await getBudget(scenarioId);
            // Extract canonical budget ID (handle potential flipped rows)
            const canonicalId = Number(row._budgetId || row.originalTransactionId || row.id);
            const idx = allBudgetsForEdit.findIndex((b) => Number(b.id) === canonicalId);
            if (idx === -1) return;
            const field = cell.getField();
            const value = cell.getValue();
            if (field === 'occurrenceDate') allBudgetsForEdit[idx].occurrenceDate = value;
            if (field === 'description') allBudgetsForEdit[idx].description = value;
            if (field === 'transactionTypeName') allBudgetsForEdit[idx].transactionTypeId = value === 'Money Out' ? 2 : 1;
            if (field === 'secondaryAccountName') {
              if (!value || value === '— None —') {
                allBudgetsForEdit[idx].secondaryAccountId = null;
              } else {
                const matchedAccount = accounts.find((a) => String(a.name || a.id) === String(value));
                allBudgetsForEdit[idx].secondaryAccountId = matchedAccount ? Number(matchedAccount.id) : null;
              }
            }
            if (field === 'plannedAmount') {
              allBudgetsForEdit[idx].amount = Math.abs(Number(value || 0));
            }
            if (field === 'actualAmount') {
              const prevStatus = allBudgetsForEdit[idx].status;
              const normalizedActualAmount = value !== null && value !== undefined && value !== ''
                ? Math.abs(Number(value))
                : null;
              allBudgetsForEdit[idx].status = typeof prevStatus === 'object'
                ? { ...prevStatus, actualAmount: normalizedActualAmount }
                : { name: prevStatus || 'planned', actualAmount: normalizedActualAmount, actualDate: null };
            }
            if (field === 'actualDate') {
              const prevStatus = allBudgetsForEdit[idx].status;
              const normalizedActualDate = value || null;
              allBudgetsForEdit[idx].status = typeof prevStatus === 'object'
                ? { ...prevStatus, actualDate: normalizedActualDate }
                : { name: prevStatus || 'planned', actualAmount: null, actualDate: normalizedActualDate };
            }
            await BudgetManager.saveAll(scenarioId, allBudgetsForEdit);
            state?.bumpBudgetGridLoadToken?.(); // Bump token after data modification
            callbacks?.updateBudgetTotals?.();
          } catch (err) {
            notifyError('Failed to save budget entry edit.');
          }
        }
      });

      attachGridHandlers(budgetTable, {
        dataFiltered: (filters, rows) => {
          callbacks?.updateBudgetTotals?.(rows);
        }
      });

      budgetTable.on('tableBuilt', () => {
        lastBudgetDetailTableReady = true;
        try {
          budgetGridState.restore(budgetTable, { restoreGroupBy: true });
          budgetGridState.restoreDropdowns({
            [groupByStateKey]: '#budget-grouping-select'
          }, { dispatchChange: false });
        } catch (_) { /* ignore */ }
        applyBudgetDetailFilters({ state, periods, callbacks });
      });

      lastBudgetDetailTable = budgetTable;
    } else {
      if (lastBudgetDetailTableReady) {
        await refreshGridData(budgetTable, displayRows);
        applyBudgetDetailFilters({ state, periods, callbacks });
      }
    }

    tables?.setMasterBudgetTable?.(budgetTable);
    return;
  }

  // --- Summary mode (existing path) ---
  // When switching from detail to summary, clean up detail artifacts
  if (lastBudgetDetailTable) {
    try { lastBudgetDetailTable.destroy?.(); } catch (_) { /* ignore */ }
    lastBudgetDetailTable = null;
    lastBudgetDetailTableReady = false;
  }
  container.querySelectorAll(':scope > .grid-toolbar').forEach((el) => el.remove());
  container.querySelectorAll(':scope > .empty-message').forEach((el) => el.remove());

  const placeholderBudgetSection = container.closest('.forecast-card');
  const placeholderBudgetHeader = placeholderBudgetSection?.querySelector(':scope > .card-header');
  if (placeholderBudgetHeader) {
    const placeholderControls = placeholderBudgetHeader.querySelector('.card-header-controls');
    if (placeholderControls) {
      placeholderControls.innerHTML = '';
      ensureBudgetFilterButton(placeholderControls);
    }
  }

  // Load accounts and begin fetching periods/budgets so toolbar can emerge immediately
  const accounts = currentScenario.accounts || [];
  const budgetPeriodType = state?.getBudgetPeriodType?.() || 'Month';
  let periods = state?.getBudgetPeriods?.();
  const periodPromise = (!periods || periods.length === 0)
    ? getScenarioPeriods(currentScenario.id, budgetPeriodType, 'budget').then((freshPeriods) => {
      state?.setBudgetPeriods?.(freshPeriods);
      periods = freshPeriods;
      return freshPeriods;
    })
    : Promise.resolve(periods);
  const budgetsPromise = getBudget(currentScenario.id);

  const isValidAccountId = (id) => accounts.some((a) => Number(a.id) === Number(id));
  const firstAccountId = accounts?.[0]?.id != null ? Number(accounts[0].id) : null;
  const selIdNum = state?.getBudgetAccountFilterId?.() != null ? Number(state.getBudgetAccountFilterId()) : null;
  const effectiveTransactionFilterAccountId = isValidAccountId(selIdNum) ? selIdNum : firstAccountId;
  if (!isValidAccountId(selIdNum) && effectiveTransactionFilterAccountId != null) {
    state?.setBudgetAccountFilterId?.(effectiveTransactionFilterAccountId);
  }

  // Cache budget data to avoid refetching on filter changes
  let cachedBudgets = null;
  let cachedBudgetLoadToken = null;

  const reload = () => loadBudgetGrid({ container, scenarioState, state, tables, callbacks, logger });

  let gridContainer = container.querySelector(':scope > .grid-container.budget-grid');
  if (!gridContainer) {
    gridContainer = document.createElement('div');
    gridContainer.className = 'grid-container budget-grid';
    window.add(container, gridContainer);
  }

  gridContainer.classList.remove('grid-detail');
  const totalsContainer = ensureBudgetTotalsContainer(container, gridContainer);

  const refreshFilters = () => {
    if (!cachedBudgets) return;
    const token = state?.getBudgetGridLoadToken?.();
    if (token !== cachedBudgetLoadToken) return; // Data invalidated, need full reload
    
    applyBudgetSummaryFilters({
      budgets: cachedBudgets,
      state,
      periods,
      accounts: currentScenario.accounts || [],
      gridContainer,
      reload
    });

    try {
      const budgetPeriod = state?.getBudgetPeriod?.();
      let periodFilteredBudgets = cachedBudgets;
      if (budgetPeriod) {
        const selectedPeriod = (periods || []).find((p) => String(p.id) === String(budgetPeriod));
        if (selectedPeriod?.startDate && selectedPeriod?.endDate) {
          const startStr = formatDateOnly(selectedPeriod.startDate);
          const endStr = formatDateOnly(selectedPeriod.endDate);
          periodFilteredBudgets = cachedBudgets.filter((b) => {
            const occStr = b.occurrenceDate;
            if (!occStr) return false;
            return occStr >= startStr && occStr <= endStr;
          });
        }
      }

      renderBudgetSummaryTotals({
        totalsContainer,
        budgets: periodFilteredBudgets,
        accounts: currentScenario.accounts || [],
        filterAccountId: state?.getBudgetAccountFilterId?.()
      });
    } catch (_) {
      // ignore
    }
  };

  let rebuildPeriodOptionsRef = null;

  // --- Build filter toolbar in header (mirrors detail mode) ---
  const budgetSection = container.closest('.forecast-card');
  const budgetHeader = budgetSection?.querySelector(':scope > .card-header');
  if (budgetHeader) {
    budgetHeader.classList.add('card-header--filters-inline');
    const controls = budgetHeader.querySelector('.card-header-controls');
    if (controls) {
      controls.innerHTML = '';

      // Debounce period type changes
      let periodTypeChangeTimeout = null;

      // View By (period type)
      const periodTypeSelect = document.createElement('select');
      periodTypeSelect.id = 'budget-period-type-select';
      periodTypeSelect.className = 'input-select';
      ['Day', 'Week', 'Month', 'Quarter', 'Year'].forEach((pt) => {
        const opt = document.createElement('option');
        opt.value = pt;
        opt.textContent = pt;
        periodTypeSelect.appendChild(opt);
      });
      periodTypeSelect.value = budgetPeriodType;
      periodTypeSelect.addEventListener('change', async () => {
        clearTimeout(periodTypeChangeTimeout);
        periodTypeChangeTimeout = setTimeout(async () => {
          state?.setBudgetPeriodType?.(periodTypeSelect.value);
          state?.setBudgetPeriods?.([]);
          state?.setBudgetPeriod?.(null);
          await reload();
        }, 50);
      });

      // Period + ◀ ▶ navigation
      const periodSelect = document.createElement('select');
      periodSelect.id = 'budget-period-select';
      periodSelect.className = 'input-select';
      
      const rebuildPeriodOptions = (freshPeriods) => {
        periodSelect.innerHTML = '';
        freshPeriods.forEach((p) => {
          const opt = document.createElement('option');
          opt.value = String(p.id);
          opt.textContent = p.label || String(p.id);
          periodSelect.appendChild(opt);
        });
        const curPeriod = state?.getBudgetPeriod?.();
        if (curPeriod) {
          periodSelect.value = String(curPeriod);
        } else if (freshPeriods.length > 0) {
          periodSelect.value = String(freshPeriods[0].id);
          state?.setBudgetPeriod?.(freshPeriods[0].id);
        }
      };
      
      rebuildPeriodOptionsRef = rebuildPeriodOptions;
      rebuildPeriodOptions(state?.getBudgetPeriods?.() || []);

      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'period-btn';
      prevBtn.textContent = '◀';
      prevBtn.title = 'Previous period';

      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'period-btn';
      nextBtn.textContent = '▶';
      nextBtn.title = 'Next period';

      const periodNav = document.createElement('div');
      periodNav.className = 'period-nav';
      periodNav.appendChild(prevBtn);
      periodNav.appendChild(nextBtn);

      // Account filter
      const accountSelect = document.createElement('select');
      accountSelect.id = 'budget-account-select';
      accountSelect.className = 'input-select';
      accounts.forEach((a) => {
        const opt = document.createElement('option');
        opt.value = String(a.id);
        opt.textContent = a.name || String(a.id);
        accountSelect.appendChild(opt);
      });
      const curAccountId = state?.getBudgetAccountFilterId?.();
      if (curAccountId) accountSelect.value = String(curAccountId);

      // Group By
      const groupBySelect = document.createElement('select');
      groupBySelect.id = 'budget-grouping-select';
      groupBySelect.className = 'input-select';
      [
        { value: '', label: 'None' },
        { value: 'transactionTypeName', label: 'Type' },
        { value: 'secondaryAccountName', label: 'Secondary Account' },
        { value: 'statusName', label: 'Status' }
      ].forEach(({ value, label }) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        groupBySelect.appendChild(opt);
      });
      const summaryGroupBy = String(dropdownState[groupByStateKey] || '');
      const currentGroupBy = summaryGroupBy || state?.getGroupBy?.();
      if (currentGroupBy) groupBySelect.value = currentGroupBy;

      // Create filter button and modal
      const filterButton = ensureBudgetFilterButton(controls);

      // Action buttons in modal
      const generateFromProjectionsBtn = document.createElement('button');
      generateFromProjectionsBtn.className = 'icon-btn';
      generateFromProjectionsBtn.title = 'Generate from Expanded Transactions';
      generateFromProjectionsBtn.textContent = '⊞';

      const addButton = document.createElement('button');
      addButton.className = 'icon-btn';
      addButton.title = 'Add Budget Entry';
      addButton.textContent = '+';

      const clearBtn = document.createElement('button');
      clearBtn.className = 'icon-btn';
      clearBtn.title = 'Clear budget';
      clearBtn.textContent = '⊗';

      const modalActions = document.createElement('div');
      modalActions.className = 'modal-filter-actions';
      modalActions.appendChild(generateFromProjectionsBtn);
      modalActions.appendChild(addButton);
      modalActions.appendChild(clearBtn);

      const runSummaryFilters = (optionalPeriods) => {
        if (!cachedBudgets) return;
        applyBudgetSummaryFilters({
          budgets: cachedBudgets,
          state,
          periods: optionalPeriods || (state?.getBudgetPeriods?.() || []),
          accounts,
          gridContainer,
          reload
        });
      };

      const filterModal = createFilterModal({
        id: 'budget-filters-summary-modal',
        title: 'Filter Budget',
        trigger: filterButton,
        items: [
          { id: 'period-type', label: 'Period Type:', control: periodTypeSelect },
          { id: 'period', label: 'Period:', control: periodSelect },
          { id: 'period-nav', label: '', control: periodNav },
          { id: 'account', label: 'Account:', control: accountSelect },
          { id: 'group-by', label: 'Group By:', control: groupBySelect },
          { id: 'actions', label: 'Actions:', control: modalActions }
        ]
      });


      // Event listeners for period navigation
      periodSelect.addEventListener('change', () => {
        state?.setBudgetPeriod?.(periodSelect.value || null);
        runSummaryFilters();
      });

      const changePeriodBy = (offset) => {
        if (prevBtn.disabled || nextBtn.disabled) return;
        prevBtn.disabled = nextBtn.disabled = true;
        const freshPeriods = state?.getBudgetPeriods?.() || [];
        const periodIds = freshPeriods.map((p) => p.id || null);
        const currentId = state?.getBudgetPeriod?.() ?? null;
        const currentIndex = periodIds.findIndex((id) => id === currentId);
        const safeIndex = currentIndex === -1 ? 0 : currentIndex;
        const nextIndex = Math.min(Math.max(safeIndex + offset, 0), periodIds.length - 1);
        const nextId = periodIds[nextIndex] ?? null;
        periodSelect.value = nextId ? String(nextId) : '';
        state?.setBudgetPeriod?.(nextId);
        runSummaryFilters(freshPeriods);
        setTimeout(() => {
          prevBtn.disabled = nextBtn.disabled = false;
        }, 100);
      };
      prevBtn.addEventListener('click', (e) => { e.preventDefault(); changePeriodBy(-1); });
      nextBtn.addEventListener('click', (e) => { e.preventDefault(); changePeriodBy(1); });

      // Event listener for account filter
      accountSelect.addEventListener('change', () => {
        state?.setBudgetAccountFilterId?.(Number(accountSelect.value));
        runSummaryFilters();
      });

      // Event listener for group by
      groupBySelect.addEventListener('change', () => {
        budgetGridState.state.dropdowns[groupByStateKey] = groupBySelect.value;
        state?.setGroupBy?.(groupBySelect.value);
        runSummaryFilters();
      });

      // --- Event handlers ---
      clearBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!await confirmDialog('Clear all budget entries?')) return;
        const prevText = clearBtn.textContent;
        try {
          clearBtn.textContent = '…';
          clearBtn.disabled = true;
          currentScenario = scenarioState?.get?.();
          if (!currentScenario?.id) return;
          await BudgetManager.clearAll(currentScenario.id);
          const refreshed = await getScenario(currentScenario.id);
          scenarioState?.set?.(refreshed);
          state?.bumpBudgetGridLoadToken?.(); // Bump token after data modification
          await reload();
        } catch (err) {
          notifyError('Failed to clear budget: ' + (err?.message || String(err)));
        } finally {
          if (clearBtn.isConnected) {
            clearBtn.textContent = prevText;
            clearBtn.disabled = false;
          }
        }
      });

      generateFromProjectionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentScenario = scenarioState?.get?.();
        openTimeframeModal({
          title: 'Generate from Expanded Transactions',
          showPeriodType: false,
          onConfirm: async ({ startDate, endDate }) => {
            const prevText = generateFromProjectionsBtn.textContent;
            try {
              generateFromProjectionsBtn.disabled = true;
              await ScenarioManager.update(currentScenario.id, { budgetWindow: { config: { startDate, endDate } } });
              await BudgetManager.createFromProjections(currentScenario.id);
              const refreshed = await getScenario(currentScenario.id);
              scenarioState?.set?.(refreshed);
              state?.setBudgetPeriods?.([]); // Clear period cache to refetch from new budget window
              state?.bumpBudgetGridLoadToken?.(); // Bump token after data modification
              await reload();
              notifySuccess('Budget generated from expanded transactions.');
            } catch (err) {
              notifyError(err?.message || 'Failed to generate from expanded transactions.');
            } finally {
              if (generateFromProjectionsBtn.isConnected) {
                generateFromProjectionsBtn.disabled = false;
                generateFromProjectionsBtn.textContent = prevText;
              }
            }
          }
        });
      });

      addButton.addEventListener('click', (e) => {
        e.stopPropagation();
        currentScenario = scenarioState?.get?.();
        requireBudgetWindow({
          scenario: currentScenario,
          scenarioState,
          onReady: async () => {
            try {
              currentScenario = scenarioState?.get?.();
              const currentBudgets = await getBudget(currentScenario.id);
              let defaultDate = formatDateOnly(new Date());
              const livePeriods = state?.getBudgetPeriods?.() || [];
              const liveBudgetPeriod = state?.getBudgetPeriod?.();
              if (liveBudgetPeriod) {
                const selectedPeriod = livePeriods.find((p) => String(p.id) === String(liveBudgetPeriod));
                if (selectedPeriod?.startDate) defaultDate = formatDateOnly(selectedPeriod.startDate);
              }
              const snapshotAcctId = state?.getBudgetAccountFilterId?.();
              const primaryAccountId = isValidAccountId(snapshotAcctId) ? snapshotAcctId : firstAccountId;
              currentBudgets.push({
                id: null, sourceTransactionId: null,
                primaryAccountId, secondaryAccountId: null,
                transactionTypeId: 2, amount: 0, description: '',
                occurrenceDate: defaultDate, recurrenceDescription: 'One time',
                status: { name: 'planned', actualAmount: null, actualDate: null }
              });
              await BudgetManager.saveAll(currentScenario.id, currentBudgets);
              const refreshed = await getScenario(currentScenario.id);
              scenarioState?.set?.(refreshed);
              state?.bumpBudgetGridLoadToken?.(); // Bump token after data modification
              await reload();
            } catch (err) {
              notifyError('Failed to create budget entry. Please try again.');
            }
          }
        });
      });
    }
  }

  // Don't bump token here - only bump after actual data modifications
  // This allows cached budgets to be reused when only periods/filters change

  const resolvedPeriods = await periodPromise;
  if (rebuildPeriodOptionsRef) {
    rebuildPeriodOptionsRef(resolvedPeriods || []);
  }
  periods = resolvedPeriods || periods;

  try {
    try {
      const existingTable = tables?.getMasterBudgetTable?.();
      existingTable?.destroy?.();
      tables?.setMasterBudgetTable?.(null);
    } catch (_) {
      // ignore
    }

    const budgetsData = await budgetsPromise;
    cachedBudgets = budgetsData.map(b => ({ ...b, _scenarioId: currentScenario.id }));
    cachedBudgetLoadToken = state?.getBudgetGridLoadToken?.();
    const budgetPeriod = state?.getBudgetPeriod?.();
    let budgets = cachedBudgets;

    if (budgetPeriod) {
      const selectedPeriod = periods.find((p) => String(p.id) === String(budgetPeriod));
      if (selectedPeriod?.startDate && selectedPeriod?.endDate) {
        const startStr = formatDateOnly(selectedPeriod.startDate);
        const endStr = formatDateOnly(selectedPeriod.endDate);
        budgets = budgets.filter((b) => {
          const occStr = b.occurrenceDate;
          if (!occStr) return false;
          return occStr >= startStr && occStr <= endStr;
        });
      }
    }

    const accountFilterId = state?.getBudgetAccountFilterId?.();
    // Don't pre-filter by account here - let the render function handle perspective-based filtering
    // accountFilterId is passed to renderBudgetSummaryList for perspective filtering

    renderBudgetSummaryList({
      container: gridContainer,
      budgets,
      accounts: currentScenario.accounts || [],
      onRefresh: reload,
      filterAccountId: accountFilterId,
      groupByField: state?.getGroupBy?.()
    });

    renderBudgetSummaryTotals({
      totalsContainer,
      budgets,
      accounts: currentScenario.accounts || [],
      filterAccountId: accountFilterId
    });
  } catch (err) {
    notifyError(err?.message || 'Failed to reload budget summary.');
  }
}
