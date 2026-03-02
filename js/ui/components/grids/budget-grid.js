// forecast-budget-grid.js
// Budget grid loader extracted from forecast.js (no behavior change).

import { createGrid, refreshGridData, createDeleteColumn, createTextColumn, createMoneyColumn, createDateColumn, createListEditor } from './grid-factory.js';
import { attachGridHandlers } from './grid-handlers.js';
import { formatDateOnly } from '../../../shared/date-utils.js';
import { getRecurrenceDescription } from '../../../domain/calculations/recurrence-utils.js';
import { notifyError, notifySuccess, confirmDialog } from '../../../shared/notifications.js';
import { normalizeCanonicalTransaction, transformTransactionToRows, mapEditToCanonical } from '../../transforms/transaction-row-transformer.js';
import { loadLookup } from '../../../app/services/lookup-service.js';
import { GridStateManager } from './grid-state.js';
import { getScenarioProjectionRows, getScenarioBudgetWindowConfig } from '../../../shared/app-data-utils.js';
import { openTimeframeModal } from '../modals/timeframe-modal.js';
import { formatCurrency } from '../../../shared/format-utils.js';

import * as BudgetManager from '../../../app/managers/budget-manager.js';
import * as ScenarioManager from '../../../app/managers/scenario-manager.js';

import { getScenario, getScenarioPeriods, getBudget } from '../../../app/services/data-service.js';

const budgetGridState = new GridStateManager('budget');
let lastBudgetDetailTable = null;
let lastBudgetDetailTableReady = false;

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

function renderBudgetSummaryList({ container, budgets, accounts, onRefresh, filterAccountId }) {
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

  const visibleAccounts = (accounts || []).filter((a) => a.name !== 'Select Account');
  const findAccountName = (id) => visibleAccounts.find((a) => Number(a.id) === Number(id))?.name || 'Unassigned';
  const findAccountCurrency = (id) => {
    const acct = visibleAccounts.find((a) => Number(a.id) === Number(id));
    return acct?.currency?.code || acct?.currency?.name || 'ZAR';
  };

  // Transform budgets to perspective rows using shared transformer
  const allPerspectiveRows = budgets.flatMap((b) => {
    const normalized = normalizeBudgetForTransform(b);
    return transformTransactionToRows(normalized, visibleAccounts);
  });

  // Filter to current account perspective or show only primary rows
  const displayBudgets = filterAccountId
    ? allPerspectiveRows.filter(r => Number(r.perspectiveAccountId) === Number(filterAccountId))
    : allPerspectiveRows.filter(r => !String(r.id).endsWith('_flipped'));

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

  displayBudgets.forEach((budget) => {
    // Get original budget ID (handle flipped rows)
    const originalBudgetId = budget._budgetId || budget.id;
    const card = document.createElement('div');
    card.className = 'grid-summary-card';

    // --- Card face ---
    const content = document.createElement('div');
    content.className = 'grid-summary-content';

    // Use perspective-transformed values
    const isMoneyOut = Number(budget?.transactionTypeId) === 2;
    const currency = findAccountCurrency(budget?.perspectiveAccountId || budget?.primaryAccountId);
    const formattedAmt = formatCurrency(Math.abs(Number(budget?.plannedAmount || budget?.amount || 0)), currency);
    const primaryName = budget?.primaryAccountName || findAccountName(budget.primaryAccountId);
    const secondaryName = budget?.secondaryAccountName || findAccountName(budget.secondaryAccountId);
    const statusName = typeof budget?.status === 'object' ? (budget.status?.name || 'planned') : (budget?.status || 'planned');
    const isCompleted = statusName === 'actual';

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
    amountEl.className = `grid-summary-amount ${isMoneyOut ? 'negative' : 'positive'}`;
    amountEl.textContent = formattedAmt;

    rowPrimary.appendChild(checkbox);
    rowPrimary.appendChild(secondaryNameEl);
    rowPrimary.appendChild(amountEl);

    // Line 2: flow description (left) + date (right)
    const rowSecondary = document.createElement('div');
    rowSecondary.className = 'grid-summary-row-secondary';

    const flowEl = document.createElement('span');
    flowEl.className = 'grid-summary-flow';
    flowEl.textContent = `${primaryName} \u2192 ${formattedAmt} \u2192 ${secondaryName}`;

    const dateEl = document.createElement('span');
    dateEl.className = 'grid-summary-date';
    dateEl.textContent = budget?.occurrenceDate || '';

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
      const updatedStatus = typeof prevStatus === 'object'
        ? { ...prevStatus, name: newStatusName }
        : { name: newStatusName, actualAmount: null, actualDate: null };
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
      const updatedStatus = typeof prevStatus === 'object'
        ? {
            ...prevStatus,
            name: newStatusName,
            actualAmount: actualAmountInput.value !== '' ? Math.abs(Number(actualAmountInput.value)) : null,
            actualDate: actualDateInput.value || null
          }
        : {
            name: newStatusName,
            actualAmount: actualAmountInput.value !== '' ? Math.abs(Number(actualAmountInput.value)) : null,
            actualDate: actualDateInput.value || null
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

  let periodStart = null;
  let periodEnd = null;
  if (selectedPeriod?.startDate && selectedPeriod?.endDate) {
    periodStart = new Date(selectedPeriod.startDate);
    periodStart.setHours(0, 0, 0, 0);

    periodEnd = new Date(selectedPeriod.endDate);
    periodEnd.setHours(23, 59, 59, 999);
  }

  // Convert period boundaries to date strings for fast comparison
  const periodStartStr = periodStart ? formatDateOnly(periodStart) : null;
  const periodEndStr = periodEnd ? formatDateOnly(periodEnd) : null;

  masterBudgetTable.setFilter((data) => {
    if (!data) return false;

    // Preserve historical behavior: when no account filter is selected, hide flipped rows.
    if (!transactionFilterAccountId && String(data.id).includes('_flipped')) return false;

    if (transactionFilterAccountId) {
      if (data.perspectiveAccountId && Number(data.perspectiveAccountId) !== Number(transactionFilterAccountId)) {
        return false;
      }
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

  let periodStart = null;
  let periodEnd = null;
  if (selectedPeriod?.startDate && selectedPeriod?.endDate) {
    periodStart = new Date(selectedPeriod.startDate);
    periodStart.setHours(0, 0, 0, 0);
    periodEnd = new Date(selectedPeriod.endDate);
    periodEnd.setHours(23, 59, 59, 999);
  }

  lastBudgetDetailTable.setFilter((data) => {
    if (!data) return false;
    if (accountId) {
      // Use perspectiveAccountId since budgets are now transformed to perspective rows
      if (data.perspectiveAccountId && Number(data.perspectiveAccountId) !== Number(accountId)) {
        return false;
      }
    }
    if (periodStart && periodEnd) {
      const occ = data.occurrenceDate ? new Date(data.occurrenceDate) : null;
      if (!occ || Number.isNaN(occ.getTime())) return false;
      if (occ < periodStart || occ > periodEnd) return false;
    }
    return true;
  });

  callbacks?.updateBudgetTotals?.();
}

function applyBudgetSummaryFilters({ budgets, state, periods, accounts, gridContainer, reload }) {
  // Pre-compute filter criteria
  const budgetPeriod = state?.getBudgetPeriod?.();
  const accountFilterId = state?.getBudgetAccountFilterId?.();
  
  let periodStart = null, periodEnd = null;
  if (budgetPeriod) {
    const selectedPeriod = periods.find((p) => String(p.id) === String(budgetPeriod));
    if (selectedPeriod?.startDate && selectedPeriod?.endDate) {
      periodStart = new Date(selectedPeriod.startDate);
      periodEnd = new Date(selectedPeriod.endDate);
    }
  }
  
  // Filter budgets by period only - account filtering happens during transformation
  const filtered = budgets.filter((b) => {
    // Period filter
    if (periodStart && periodEnd) {
      const occ = b.occurrenceDate ? new Date(b.occurrenceDate) : null;
      if (!occ || Number.isNaN(occ.getTime())) return false;
      if (occ < periodStart || occ > periodEnd) return false;
    }
    
    return true;
  });
  
  // Re-render with all period-filtered budgets - perspective filtering happens in render
  renderBudgetSummaryList({
    container: gridContainer,
    budgets: filtered,
    accounts,
    onRefresh: reload,
    filterAccountId: accountFilterId
  });
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

  const isBudgetDetailMode = state?.getBudgetMode?.() === 'detail';

  if (isBudgetDetailMode) {
    // --- Detail mode: full Tabulator grid ---

    // Clear header icon controls (toolbar replaces them in detail mode)
    const budgetSectionDetail = container.closest('.forecast-card');
    const budgetHeaderDetail = budgetSectionDetail?.querySelector(':scope > .card-header');
    if (budgetHeaderDetail) {
      const controls = budgetHeaderDetail.querySelector('.card-header-controls');
      if (controls) controls.innerHTML = '';
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
      periods = await getScenarioPeriods(currentScenario.id, budgetPeriodType);
      state?.setBudgetPeriods?.(periods);
    }

    const allBudgets = await getBudget(currentScenario.id);
    const accounts = currentScenario.accounts || [];
    const findAccountName = (id) => accounts.find((a) => Number(a.id) === Number(id))?.name || 'Unassigned';

    // Transform budgets to perspective rows using shared transformer
    const displayRows = allBudgets.flatMap((b) => {
      const normalized = normalizeBudgetForTransform({ ...b, _scenarioId: currentScenario.id });
      return transformTransactionToRows(normalized, accounts)
        .filter((r) => !String(r.id).endsWith('_flipped'));
    }).map((r) => ({
      ...r,
      _scenarioId: currentScenario.id,
      // Perspective-aware account names already set by transformer
      transactionTypeName: r.transactionTypeName || (Number(r.transactionTypeId) === 2 ? 'Money Out' : 'Money In'),
      plannedAmount: Math.abs(Number(r.plannedAmount || r.amount || 0)),
      actualAmount: r.actualAmount != null ? Math.abs(Number(r.actualAmount)) : null,
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

        const makeHeaderFilter = (id, labelText, selectEl) => {
          const item = document.createElement('div');
          item.className = 'header-filter-item';
          const lbl = document.createElement('label');
          lbl.htmlFor = id;
          lbl.textContent = labelText;
          item.appendChild(lbl);
          item.appendChild(selectEl);
          return item;
        };

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
        controls.appendChild(makeHeaderFilter('budget-period-type-select', 'View:', periodTypeSelect));

        // Period + ◀ ▶ navigation
        const periodSelect = document.createElement('select');
        periodSelect.id = 'budget-period-select';
        periodSelect.className = 'input-select';
        
        // Helper to rebuild period options
        const rebuildPeriodOptions = (freshPeriods) => {
          periodSelect.innerHTML = '';
          const allPeriodsOpt = document.createElement('option');
          allPeriodsOpt.value = ''; allPeriodsOpt.textContent = 'All';
          periodSelect.appendChild(allPeriodsOpt);
          freshPeriods.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = String(p.id);
            opt.textContent = p.label || String(p.id);
            periodSelect.appendChild(opt);
          });
          const curPeriod = state?.getBudgetPeriod?.();
          if (curPeriod) periodSelect.value = String(curPeriod);
          else periodSelect.value = '';
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

        const periodItem = document.createElement('div');
        periodItem.className = 'header-filter-item';
        const periodLabel = document.createElement('label');
        periodLabel.htmlFor = 'budget-period-select';
        periodLabel.textContent = 'Period:';
        periodItem.appendChild(periodLabel);
        periodItem.appendChild(periodSelect);
        periodItem.appendChild(prevBtn);
        periodItem.appendChild(nextBtn);
        controls.appendChild(periodItem);

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
        controls.appendChild(makeHeaderFilter('budget-account-select', 'Account:', accountSelect));

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
        controls.appendChild(makeHeaderFilter('budget-grouping-select', 'Group:', groupBySelect));

        // Icon actions — generate and add
        const iconActions = document.createElement('div');
        iconActions.className = 'header-icon-actions';
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
        iconActions.appendChild(generateFromProjectionsBtn);
        iconActions.appendChild(addButton);
        iconActions.appendChild(clearBtn);
        controls.appendChild(iconActions);

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
                await reload();
                notifySuccess('Budget generated from expanded transactions.');
              } catch (err) {
                notifyError('Failed to generate from projections: ' + (err?.message || String(err)));
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
                  if (sel?.startDate) defaultDate = formatDateOnly(new Date(sel.startDate));
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
      createTextColumn('Secondary', 'secondaryAccountName', { widthGrow: 1 }),
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
          // When marking as actual, default actual values to planned if not already set
          const prevActualAmount = typeof prevStatus === 'object' ? prevStatus?.actualAmount : null;
          const prevActualDate   = typeof prevStatus === 'object' ? prevStatus?.actualDate   : null;
          const resolvedActualAmount = newStatusName === 'actual'
            ? (prevActualAmount ?? row.plannedAmount ?? null)
            : null;
          const resolvedActualDate = newStatusName === 'actual'
            ? (prevActualDate ?? row.occurrenceDate ?? null)
            : null;
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
          budgetGridState.restoreDropdowns({ groupBy: '#budget-grouping-select' });
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

  // Load accounts and periods upfront so the toolbar can be populated
  const accounts = currentScenario.accounts || [];
  const budgetPeriodType = state?.getBudgetPeriodType?.() || 'Month';
  let periods = state?.getBudgetPeriods?.();
  if (!periods || periods.length === 0) {
    periods = await getScenarioPeriods(currentScenario.id, budgetPeriodType);
    state?.setBudgetPeriods?.(periods);
  }

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
  };

  // --- Build filter toolbar in header (mirrors detail mode) ---
  const budgetSection = container.closest('.forecast-card');
  const budgetHeader = budgetSection?.querySelector(':scope > .card-header');
  if (budgetHeader) {
    budgetHeader.classList.add('card-header--filters-inline');
    const controls = budgetHeader.querySelector('.card-header-controls');
    if (controls) {
      controls.innerHTML = '';

      const makeHeaderFilter = (id, labelText, selectEl) => {
        const item = document.createElement('div');
        item.className = 'header-filter-item';
        const lbl = document.createElement('label');
        lbl.htmlFor = id;
        lbl.textContent = labelText;
        item.appendChild(lbl);
        item.appendChild(selectEl);
        return item;
      };

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
      controls.appendChild(makeHeaderFilter('budget-period-type-select', 'View:', periodTypeSelect));

      // Period + ◀ ▶ navigation
      const periodSelect = document.createElement('select');
      periodSelect.id = 'budget-period-select';
      periodSelect.className = 'input-select';
      
      // Helper to rebuild period options
      const rebuildPeriodOptions = (freshPeriods) => {
        periodSelect.innerHTML = '';
        const allPeriodsOpt = document.createElement('option');
        allPeriodsOpt.value = ''; allPeriodsOpt.textContent = 'All';
        periodSelect.appendChild(allPeriodsOpt);
        freshPeriods.forEach((p) => {
          const opt = document.createElement('option');
          opt.value = String(p.id);
          opt.textContent = p.label || String(p.id);
          periodSelect.appendChild(opt);
        });
        const curPeriod = state?.getBudgetPeriod?.();
        if (curPeriod) periodSelect.value = String(curPeriod);
        else periodSelect.value = '';
      };
      
      // Initial build - use fresh periods from state
      rebuildPeriodOptions(state?.getBudgetPeriods?.() || []);

      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'period-btn';
      prevBtn.textContent = '\u25c0';
      prevBtn.title = 'Previous period';
      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'period-btn';
      nextBtn.textContent = '\u25b6';
      nextBtn.title = 'Next period';

      const periodItem = document.createElement('div');
      periodItem.className = 'header-filter-item';
      const periodLabel = document.createElement('label');
      periodLabel.htmlFor = 'budget-period-select';
      periodLabel.textContent = 'Period:';
      periodItem.appendChild(periodLabel);
      periodItem.appendChild(periodSelect);
      periodItem.appendChild(prevBtn);
      periodItem.appendChild(nextBtn);
      controls.appendChild(periodItem);

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
      controls.appendChild(makeHeaderFilter('budget-account-select', 'Account:', accountSelect));

      // Icon actions — generate and add
      const iconActions = document.createElement('div');
      iconActions.className = 'header-icon-actions';
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
      iconActions.appendChild(generateFromProjectionsBtn);
      iconActions.appendChild(addButton);
      iconActions.appendChild(clearBtn);
      controls.appendChild(iconActions);

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
              state?.bumpBudgetGridLoadToken?.(); // Bump token after data modification
              await reload();
              notifySuccess('Budget generated from expanded transactions.');
            } catch (err) {
              notifyError('Failed to generate from expanded transactions: ' + (err?.message || String(err)));
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
                if (selectedPeriod?.startDate) defaultDate = formatDateOnly(new Date(selectedPeriod.startDate));
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

      periodTypeSelect.addEventListener('change', async () => {
        clearTimeout(periodTypeChangeTimeout);
        periodTypeChangeTimeout = setTimeout(async () => {
          state?.setBudgetPeriodType?.(periodTypeSelect.value);
          state?.setBudgetPeriods?.([]);
          state?.setBudgetPeriod?.(null);
          await reload();
        }, 50);
      });

      periodSelect.addEventListener('change', () => {
        state?.setBudgetPeriod?.(periodSelect.value || null);
        refreshFilters();
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
        refreshFilters();
        
        setTimeout(() => {
          prevBtn.disabled = nextBtn.disabled = false;
        }, 100);
      };
      prevBtn.addEventListener('click', (e) => { e.preventDefault(); changePeriodBy(-1); });
      nextBtn.addEventListener('click', (e) => { e.preventDefault(); changePeriodBy(1); });

      accountSelect.addEventListener('change', () => {
        state?.setBudgetAccountFilterId?.(Number(accountSelect.value));
        refreshFilters();
      });
    }
  }

  const existingTable = tables?.getMasterBudgetTable?.();
  try {
    budgetGridState.capture(existingTable, { groupBy: '#budget-grouping-select' });
  } catch (_) {
    // Keep existing behavior: ignore state capture errors.
  }

  // Don't bump token here - only bump after actual data modifications
  // This allows cached budgets to be reused when only periods/filters change

  let gridContainer = container.querySelector(':scope > .grid-container.budget-grid');
  if (!gridContainer) {
    gridContainer = document.createElement('div');
    gridContainer.className = 'grid-container budget-grid';
    window.add(container, gridContainer);
  }

  gridContainer.classList.remove('grid-detail');

  try {
    try {
      const existingTable = tables?.getMasterBudgetTable?.();
      existingTable?.destroy?.();
      tables?.setMasterBudgetTable?.(null);
    } catch (_) {
      // ignore
    }

    cachedBudgets = await getBudget(currentScenario.id);
    cachedBudgetLoadToken = state?.getBudgetGridLoadToken?.();
    const budgetPeriod = state?.getBudgetPeriod?.();
    let budgets = cachedBudgets;

    if (budgetPeriod) {
      const selectedPeriod = periods.find((p) => String(p.id) === String(budgetPeriod));
      if (selectedPeriod?.startDate && selectedPeriod?.endDate) {
        const start = new Date(selectedPeriod.startDate);
        const end = new Date(selectedPeriod.endDate);
        budgets = budgets.filter((b) => {
          const occ = b.occurrenceDate ? new Date(b.occurrenceDate) : null;
          if (!occ || Number.isNaN(occ.getTime())) return false;
          return occ >= start && occ <= end;
        });
      }
    }

    const accountFilterId = state?.getBudgetAccountFilterId?.();
    // Don't pre-filter by account here - let the render function handle perspective-based filtering
    // accountFilterId is passed to renderBudgetSummaryList for perspective filtering

    budgets = budgets.map((b) => ({ ...b, _scenarioId: currentScenario.id }));

    renderBudgetSummaryList({
      container: gridContainer,
      budgets,
      accounts: currentScenario.accounts || [],
      onRefresh: reload,
      filterAccountId: accountFilterId
    });
  } catch (err) {
    // Keep existing behavior: errors are swallowed here.
  }
}
