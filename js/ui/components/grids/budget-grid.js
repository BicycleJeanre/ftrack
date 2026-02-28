// forecast-budget-grid.js
// Budget grid loader extracted from forecast.js (no behavior change).

import { createGrid, refreshGridData, createDeleteColumn, createTextColumn, createMoneyColumn, createDateColumn } from './grid-factory.js';
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

function renderBudgetSummaryList({ container, budgets, accounts, onRefresh }) {
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

  const findAccountName = (id) => (accounts || []).find((a) => Number(a.id) === Number(id))?.name || 'Unassigned';
  const findAccountCurrency = (id) => {
    const acct = (accounts || []).find((a) => Number(a.id) === Number(id));
    return acct?.currency?.code || acct?.currency?.name || 'ZAR';
  };

  budgets.forEach((budget) => {
    const card = document.createElement('div');
    card.className = 'grid-summary-card';

    const content = document.createElement('div');
    content.className = 'grid-summary-content';

    const title = document.createElement('div');
    title.className = 'grid-summary-title';
    title.textContent = budget?.description || 'Untitled Budget Entry';

    // Type badge — Money In (typeId 1) or Money Out (typeId 2)
    const isMoneyOut = Number(budget?.transactionTypeId) === 2;
    const typeSpan = document.createElement('span');
    typeSpan.className = `grid-summary-type ${isMoneyOut ? 'money-out' : 'money-in'}`;
    typeSpan.textContent = isMoneyOut ? 'Money Out' : 'Money In';

    const header = document.createElement('div');
    header.className = 'grid-summary-header';
    header.appendChild(title);
    header.appendChild(typeSpan);

    const meta = document.createElement('div');
    meta.className = 'grid-summary-meta';

    const currency = findAccountCurrency(budget?.primaryAccountId);
    const amount = document.createElement('span');
    amount.className = `grid-summary-amount ${isMoneyOut ? 'negative' : 'positive'}`;
    amount.textContent = formatCurrency(Math.abs(Number(budget?.amount || 0)), currency);

    const date = document.createElement('span');
    date.className = 'grid-summary-date';
    date.textContent = budget?.occurrenceDate || 'No date';

    const accountsLabel = document.createElement('span');
    accountsLabel.className = 'grid-summary-accounts';
    accountsLabel.textContent = `${findAccountName(budget.primaryAccountId)} → ${findAccountName(budget.secondaryAccountId)}`;

    meta.appendChild(amount);
    meta.appendChild(date);
    meta.appendChild(accountsLabel);

    content.appendChild(header);
    content.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'grid-summary-actions';

    const duplicateBtn = document.createElement('button');
    duplicateBtn.className = 'icon-btn';
    duplicateBtn.title = 'Duplicate Budget Entry';
    duplicateBtn.textContent = '📋';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn';
    deleteBtn.title = 'Delete Budget Entry';
    deleteBtn.textContent = '🗑️';

    actions.appendChild(duplicateBtn);
    actions.appendChild(deleteBtn);

    const form = document.createElement('div');
    form.className = 'grid-summary-form';
    form.style.display = 'none';

    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'grid-summary-input';
    descInput.value = budget?.description || '';

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.step = '0.01';
    amountInput.className = 'grid-summary-input';
    amountInput.value = Number(budget?.amount || 0);

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'grid-summary-input';
    dateInput.value = budget?.occurrenceDate || '';

    const formActions = document.createElement('div');
    formActions.className = 'grid-summary-form-actions';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.textContent = 'Cancel';
    formActions.appendChild(saveBtn);
    formActions.appendChild(cancelBtn);

    const addField = (label, inputEl) => {
      const field = document.createElement('div');
      field.className = 'grid-summary-field';
      const labelEl = document.createElement('label');
      labelEl.className = 'grid-summary-label';
      labelEl.textContent = label;
      field.appendChild(labelEl);
      field.appendChild(inputEl);
      form.appendChild(field);
    };

    addField('Description', descInput);
    addField('Amount', amountInput);
    addField('Date', dateInput);
    form.appendChild(formActions);

    const enterEdit = () => {
      form.style.display = 'grid';
      content.style.display = 'none';
      actions.style.display = 'none';
    };

    const exitEdit = () => {
      form.style.display = 'none';
      content.style.display = 'block';
      actions.style.display = 'flex';
    };

    card.addEventListener('click', (e) => {
      if (form.style.display === 'grid') return;
      if (e.target.closest('.icon-btn')) return;
      enterEdit();
    });

    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      descInput.value = budget?.description || '';
      amountInput.value = Number(budget?.amount || 0);
      dateInput.value = budget?.occurrenceDate || '';
      exitEdit();
    });

    saveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const scenario = budget?._scenarioId;
      if (!scenario) return;
      const allBudgets = await getBudget(scenario);
      const idx = allBudgets.findIndex((b) => Number(b.id) === Number(budget.id));
      if (idx === -1) return;

      allBudgets[idx] = {
        ...allBudgets[idx],
        description: descInput.value.trim(),
        amount: Math.abs(Number(amountInput.value || 0)),
        occurrenceDate: dateInput.value || allBudgets[idx].occurrenceDate
      };

      await BudgetManager.saveAll(scenario, allBudgets);
      await onRefresh?.();
    });

    duplicateBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const scenario = budget?._scenarioId;
      if (!scenario) return;
      const allBudgets = await getBudget(scenario);
      const source = allBudgets.find((b) => Number(b.id) === Number(budget.id));
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
      const filtered = allBudgets.filter((b) => Number(b.id) !== Number(budget.id));
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

function applyMasterBudgetTableFilters({ tables, state, callbacks }) {
  const masterBudgetTable = tables?.getMasterBudgetTable?.();
  if (!masterBudgetTable) return;

  const transactionFilterAccountId = state?.getTransactionFilterAccountId?.();
  const budgetPeriodId = state?.getBudgetPeriod?.();
  const periods = state?.getPeriods?.() || [];
  const selectedPeriod = budgetPeriodId ? periods.find((p) => p.id === budgetPeriodId) : null;

  let periodStart = null;
  let periodEnd = null;
  if (selectedPeriod?.startDate && selectedPeriod?.endDate) {
    periodStart = new Date(selectedPeriod.startDate);
    periodStart.setHours(0, 0, 0, 0);

    periodEnd = new Date(selectedPeriod.endDate);
    periodEnd.setHours(23, 59, 59, 999);
  }

  masterBudgetTable.setFilter((data) => {
    if (!data) return false;

    // Preserve historical behavior: when no account filter is selected, hide flipped rows.
    if (!transactionFilterAccountId && String(data.id).includes('_flipped')) return false;

    if (transactionFilterAccountId) {
      if (data.perspectiveAccountId && Number(data.perspectiveAccountId) !== Number(transactionFilterAccountId)) {
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

  const budgetSection = container.closest('.forecast-card');
  const budgetHeader = budgetSection?.querySelector(':scope > .card-header');
  if (budgetHeader) {
    const controls = budgetHeader.querySelector('.card-header-controls');
    if (controls) {
      controls.innerHTML = '';
      // View toggle removed: budget grid shows summary by default in base grids.
      const addButton = document.createElement('button');
      addButton.className = 'icon-btn';
      addButton.title = 'Add Budget Entry';
      addButton.textContent = '+';

      const refreshButton = document.createElement('button');
      refreshButton.className = 'icon-btn';
      refreshButton.title = 'Refresh Budget';
      refreshButton.textContent = '⟳';

      controls.appendChild(addButton);
      controls.appendChild(refreshButton);

      addButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          currentScenario = scenarioState?.get?.();

          const currentBudgets = await getBudget(currentScenario.id);

          let defaultDate = formatDateOnly(new Date());
          const periods = state?.getPeriods?.() || [];
          const liveBudgetPeriod = state?.getBudgetPeriod?.();
          if (liveBudgetPeriod) {
            const selectedPeriod = periods.find((p) => p.id === liveBudgetPeriod);
            if (selectedPeriod && selectedPeriod.startDate) {
              defaultDate = formatDateOnly(new Date(selectedPeriod.startDate));
            }
          }

          const transactionFilterAccountIdSnapshot = state?.getTransactionFilterAccountId?.();
          const accounts = currentScenario.accounts || [];
          const isValidAccountId = (id) => accounts.some((a) => Number(a.id) === Number(id));
          const firstAccountId = accounts?.[0]?.id != null ? Number(accounts[0].id) : null;
          const effectiveTransactionFilterAccountId = isValidAccountId(transactionFilterAccountIdSnapshot)
            ? transactionFilterAccountIdSnapshot
            : firstAccountId;

          const primaryAccountId =
            effectiveTransactionFilterAccountId ||
            (currentScenario.accounts && currentScenario.accounts.length > 0 ? currentScenario.accounts[0].id : null);

          const newBudget = {
            id: null,
            sourceTransactionId: null,
            primaryAccountId,
            secondaryAccountId: null,
            transactionTypeId: 2,
            amount: 0,
            description: '',
            occurrenceDate: defaultDate,
            recurrenceDescription: 'One time',
            status: {
              name: 'planned',
              actualAmount: null,
              actualDate: null
            }
          };

          currentBudgets.push(newBudget);
          await BudgetManager.saveAll(currentScenario.id, currentBudgets);

          const refreshed = await getScenario(currentScenario.id);
          scenarioState?.set?.(refreshed);

          await loadBudgetGrid({ container, scenarioState, state, tables, callbacks, logger });
        } catch (err) {
          notifyError('Failed to create budget entry. Please try again.');
        }
      });

      refreshButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        const prevText = refreshButton.textContent;
        try {
          refreshButton.textContent = '...';
          refreshButton.disabled = true;

          const scenario = scenarioState?.get?.();
          if (scenario?.id) {
            const refreshed = await getScenario(scenario.id);
            scenarioState?.set?.(refreshed);
          }

          await loadBudgetGrid({ container, scenarioState, state, tables, callbacks, logger });
        } catch (err) {
          notifyError('Failed to refresh budget: ' + (err?.message || String(err)));
        } finally {
          if (refreshButton.isConnected) {
            refreshButton.textContent = prevText;
            refreshButton.disabled = false;
          }
        }
      });
    }
  }

  const existingTable = tables?.getMasterBudgetTable?.();

  try {
    budgetGridState.capture(existingTable, {
      groupBy: '#budget-grouping-select'
    });
  } catch (_) {
    // Keep existing behavior: ignore state capture errors.
  }

  const loadToken = state?.bumpBudgetGridLoadToken?.();
  const transactionFilterAccountIdSnapshot = state?.getTransactionFilterAccountId?.();
  const budgetPeriodSnapshot = state?.getBudgetPeriod?.();
  const selIdNum = transactionFilterAccountIdSnapshot != null ? Number(transactionFilterAccountIdSnapshot) : null;

  const accounts = currentScenario.accounts || [];
  const isValidAccountId = (id) => accounts.some((a) => Number(a.id) === Number(id));
  const firstAccountId = accounts?.[0]?.id != null ? Number(accounts[0].id) : null;
  const effectiveTransactionFilterAccountId = isValidAccountId(selIdNum) ? selIdNum : firstAccountId;

  if (!isValidAccountId(selIdNum) && effectiveTransactionFilterAccountId != null) {
    state?.setTransactionFilterAccountId?.(effectiveTransactionFilterAccountId);
  }

  // Keep the grid container stable to reduce scroll jumps.
  const existingToolbars = container.querySelectorAll(':scope > .grid-toolbar');
  existingToolbars.forEach((el) => el.remove());

  // Remove any stale placeholders inserted by higher-level controllers.
  container.querySelectorAll(':scope > .empty-message').forEach((el) => el.remove());

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

    let budgets = await getBudget(currentScenario.id);
    const budgetPeriod = state?.getBudgetPeriod?.();
    let periods = state?.getPeriods?.();
    if (!periods || periods.length === 0) {
      const budgetPeriodType = state?.getBudgetPeriodType?.();
      periods = await getScenarioPeriods(currentScenario.id, budgetPeriodType);
      state?.setPeriods?.(periods);
    }

    if (budgetPeriod) {
      const selectedPeriod = periods.find((p) => p.id === budgetPeriod);
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

    const accountFilterId = state?.getTransactionFilterAccountId?.();
    if (accountFilterId) {
      budgets = budgets.filter((b) =>
        Number(b.primaryAccountId) === Number(accountFilterId) ||
        Number(b.secondaryAccountId) === Number(accountFilterId)
      );
    }

    budgets = budgets.map((b) => ({ ...b, _scenarioId: currentScenario.id }));

    renderBudgetSummaryList({
      container: gridContainer,
      budgets,
      accounts: currentScenario.accounts || [],
      onRefresh: async () => {
        await loadBudgetGrid({ container, scenarioState, state, tables, callbacks, logger });
      }
    });
  } catch (err) {
    // Keep existing behavior: errors are swallowed here.
  }
}
