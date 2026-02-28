// forecast-budget-grid.js
// Budget grid loader extracted from forecast.js (no behavior change).

import { createGrid, refreshGridData, createDeleteColumn, createTextColumn, createMoneyColumn, createDateColumn } from './grid-factory.js';
import { attachGridHandlers } from './grid-handlers.js';
import { formatDateOnly } from '../../../shared/date-utils.js';
import { getRecurrenceDescription } from '../../../domain/calculations/recurrence-utils.js';
import { notifyError, notifySuccess } from '../../../shared/notifications.js';
import { normalizeCanonicalTransaction, transformTransactionToRows, mapEditToCanonical } from '../../transforms/transaction-row-transformer.js';
import { loadLookup } from '../../../app/services/lookup-service.js';
import { GridStateManager } from './grid-state.js';

import * as BudgetManager from '../../../app/managers/budget-manager.js';

import { getScenario, getScenarioPeriods, getBudget } from '../../../app/services/data-service.js';

const budgetGridState = new GridStateManager('budget');

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

  // Allow the accordion to paint immediately before doing heavy work
  // (storage read/parse + transform + Tabulator build/refresh).
  // Only show the loading placeholder when building the grid for the first time.
  let loadingEl = null;
  if (!existingTable) {
    loadingEl = document.createElement('div');
    loadingEl.className = 'text-muted';
    loadingEl.style.padding = '12px 0';
    loadingEl.textContent = 'Loading budget…';
    container.insertBefore(loadingEl, gridContainer);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (loadToken !== state?.getBudgetGridLoadToken?.()) {
      try { loadingEl.remove(); } catch (_) { /* noop */ }
      return;
    }

    try { loadingEl.remove(); } catch (_) { /* noop */ }
    loadingEl = null;
  }

  try {
    let budgetOccurrences = await getBudget(currentScenario.id);

    if (loadToken !== state?.getBudgetGridLoadToken?.()) {
      return;
    }

    const toolbar = document.createElement('div');
    toolbar.className = 'grid-toolbar';

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'toolbar-item';

    const addButton = document.createElement('button');
    addButton.className = 'btn btn-primary';
    addButton.textContent = '+ Add New Entry';
    addButton.addEventListener('click', async () => {
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
    window.add(buttonContainer, addButton);

    const refreshButton = document.createElement('button');
    refreshButton.className = 'btn';
    refreshButton.textContent = 'Refresh';
    refreshButton.addEventListener('click', async () => {
      const prevText = refreshButton.textContent;
      try {
        refreshButton.textContent = 'Refreshing...';
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
    window.add(buttonContainer, refreshButton);

    const clearButton = document.createElement('button');
    clearButton.className = 'btn';
    clearButton.textContent = 'Clear Budget';
    clearButton.addEventListener('click', async () => {
      const confirmed = confirm('Clear all budget occurrences? This cannot be undone.');
      if (!confirmed) return;

      try {
        currentScenario = scenarioState?.get?.();

        await BudgetManager.clearAll(currentScenario.id);

        const refreshed = await getScenario(currentScenario.id);
        scenarioState?.set?.(refreshed);

        await loadBudgetGrid({ container, scenarioState, state, tables, callbacks, logger });
      } catch (err) {
        notifyError('Failed to clear budget: ' + err.message);
      }
    });
    window.add(buttonContainer, clearButton);

    const regenerateFromProjectionsButton = document.createElement('button');
    regenerateFromProjectionsButton.className = 'btn btn-primary';
    regenerateFromProjectionsButton.textContent = 'Regenerate Budget from Projections';
    regenerateFromProjectionsButton.addEventListener('click', async () => {
      try {
        currentScenario = scenarioState?.get?.();

        if (!currentScenario.projections || currentScenario.projections.length === 0) {
          notifyError('No projections to save as budget. Generate projections first.');
          return;
        }

        const confirmed = confirm('Regenerate planned budget entries from projections? Entries with recorded actuals will be preserved.');
        if (!confirmed) return;

        regenerateFromProjectionsButton.textContent = 'Saving...';
        regenerateFromProjectionsButton.disabled = true;

        await BudgetManager.createFromProjections(currentScenario.id, currentScenario.projections);

        const refreshed = await getScenario(currentScenario.id);
        scenarioState?.set?.(refreshed);

        await loadBudgetGrid({ container, scenarioState, state, tables, callbacks, logger });

        notifySuccess('Budget saved successfully!');
      } catch (err) {
        notifyError('Failed to save budget: ' + err.message);
      } finally {
        regenerateFromProjectionsButton.textContent = 'Regenerate Budget from Projections';
        regenerateFromProjectionsButton.disabled = false;
      }
    });
    window.add(buttonContainer, regenerateFromProjectionsButton);

    window.add(toolbar, buttonContainer);

    const periodTypeControl = document.createElement('div');
    periodTypeControl.className = 'toolbar-item period-type-control';
    periodTypeControl.innerHTML = `
      <label for="budget-period-type-select" class="text-muted control-label">View By:</label>
      <select id="budget-period-type-select" class="input-select control-select">
        <option value="Day">Day</option>
        <option value="Week">Week</option>
        <option value="Month">Month</option>
        <option value="Quarter">Quarter</option>
        <option value="Year">Year</option>
      </select>
    `;
    window.add(toolbar, periodTypeControl);

    const periodFilter = document.createElement('div');
    periodFilter.className = 'toolbar-item period-filter control-layout-wrap';
    periodFilter.innerHTML = `
        <label for="budget-period-select" class="text-muted control-label">Period:</label>
      <select id="budget-period-select" class="input-select control-select"></select>
        <button id="budget-prev-period-btn" class="btn btn-ghost control-button" title="Previous Period">&#9664;</button>
        <button id="budget-next-period-btn" class="btn btn-ghost control-button" title="Next Period">&#9654;</button>
    `;
    window.add(toolbar, periodFilter);

    const accountFilter = document.createElement('div');
    accountFilter.className = 'toolbar-item account-filter';
    accountFilter.innerHTML = `
      <label for="budget-account-filter-select" class="text-muted control-label">Account:</label>
      <select id="budget-account-filter-select" class="input-select control-select">
      </select>
    `;
    window.add(toolbar, accountFilter);

    // Insert toolbar above the grid so it doesn't jump to the bottom on refresh.
    container.insertBefore(toolbar, gridContainer);

    const periodTypeSelect = document.getElementById('budget-period-type-select');
    if (periodTypeSelect) {
      periodTypeSelect.value = state?.getBudgetPeriodType?.();
    }

    const budgetPeriodType = state?.getBudgetPeriodType?.();
    const periods = await getScenarioPeriods(currentScenario.id, budgetPeriodType);
    state?.setPeriods?.(periods);

    const budgetPeriodSelect = document.getElementById('budget-period-select');
    if (budgetPeriodSelect) {
      budgetPeriodSelect.innerHTML = '<option value="">-- All Periods --</option>';
      periods.forEach((period) => {
        const option = document.createElement('option');
        option.value = period.id;
        option.textContent =
          period.label || `${formatDateOnly(period.startDate) || ''} to ${formatDateOnly(period.endDate) || ''}`;
        budgetPeriodSelect.appendChild(option);
      });

      budgetPeriodSelect.value = budgetPeriodSnapshot || '';

      budgetPeriodSelect.addEventListener('change', async (e) => {
        state?.setBudgetPeriod?.(e.target.value);
        applyMasterBudgetTableFilters({ tables, state, callbacks });
      });

      document.getElementById('budget-prev-period-btn')?.addEventListener('click', async () => {
        const budgetPeriod = state?.getBudgetPeriod?.();
        const currentIndex = periods.findIndex((p) => p.id === budgetPeriod);
        if (currentIndex > 0) {
          state?.setBudgetPeriod?.(periods[currentIndex - 1].id);
          budgetPeriodSelect.value = periods[currentIndex - 1].id;
          applyMasterBudgetTableFilters({ tables, state, callbacks });
        }
      });

      document.getElementById('budget-next-period-btn')?.addEventListener('click', async () => {
        const budgetPeriod = state?.getBudgetPeriod?.();
        const currentIndex = periods.findIndex((p) => p.id === budgetPeriod);
        if (currentIndex < periods.length - 1) {
          state?.setBudgetPeriod?.(periods[currentIndex + 1].id);
          budgetPeriodSelect.value = periods[currentIndex + 1].id;
          applyMasterBudgetTableFilters({ tables, state, callbacks });
        }
      });

      document.getElementById('budget-period-type-select')?.addEventListener('change', async (e) => {
        state?.setBudgetPeriodType?.(e.target.value);
        state?.setBudgetPeriod?.(null);
        await loadBudgetGrid({ container, scenarioState, state, tables, callbacks, logger });
      });
    }

    const budgetAccountFilterSelect = document.getElementById('budget-account-filter-select');
    if (budgetAccountFilterSelect) {
      budgetAccountFilterSelect.innerHTML = '';
      (currentScenario.accounts || []).forEach((account) => {
        const option = document.createElement('option');
        option.value = account.id;
        option.textContent = account.name;
        budgetAccountFilterSelect.appendChild(option);
      });

      if (effectiveTransactionFilterAccountId != null) {
        budgetAccountFilterSelect.value = String(effectiveTransactionFilterAccountId);
      } else {
        budgetAccountFilterSelect.value = '';
      }

      budgetAccountFilterSelect.addEventListener('change', async (e) => {
        const nextId = e.target.value ? Number(e.target.value) : null;
        state?.setTransactionFilterAccountId?.(nextId);

        applyMasterBudgetTableFilters({ tables, state, callbacks });

        const masterTransactionsTable = tables?.getMasterTransactionsTable?.();
        if (masterTransactionsTable) {
          if (nextId) {
            masterTransactionsTable.setFilter((data) => {
              if (!data.perspectiveAccountId) return true;
              return Number(data.perspectiveAccountId) === nextId;
            });
          } else {
            masterTransactionsTable.setFilter((data) => {
              return !String(data.id).includes('_flipped');
            });
          }
          callbacks?.updateTransactionTotals?.();
        }

        // Projections account filtering is independent of budget.
      });
    }

    const lookupData = await loadLookup('lookup-data.json');

    const normalizedAccounts = (currentScenario.accounts || []).map((account) => {
      const normalized = { ...account };
      if (normalized.type && typeof normalized.type !== 'object') {
        const foundType = lookupData.accountTypes.find((t) => t.id == normalized.type);
        if (foundType) normalized.type = foundType;
      }
      return normalized;
    });

    // Tabulator list editor expects a concrete values array (function values are not supported
    // in our current Tabulator build), so precompute account options per render.
    const editorAccounts = (currentScenario.accounts || []).filter((a) => a?.name !== 'Select Account');
    const secondaryAccountValues = editorAccounts.map((acc) => ({
      label: acc.name,
      value: acc
    }));
    const secondaryAccountsKey = editorAccounts.map((a) => `${a.id}:${a.name}`).join('|');
    const scenarioId = Number(currentScenario.id);

    const transformedData = budgetOccurrences.flatMap((budget) => {
      const storedPrimaryId = budget.primaryAccountId;
      const storedSecondaryId = budget.secondaryAccountId;
      const storedTypeId = budget.transactionTypeId;

      const statusObj =
        typeof budget.status === 'object'
          ? budget.status
          : { name: budget.status, actualAmount: null, actualDate: null };

      const sourceTransaction = budget.sourceTransactionId
        ? currentScenario.transactions?.find((tx) => tx.id === budget.sourceTransactionId)
        : null;
      const recurrenceSummary = sourceTransaction?.recurrence
        ? getRecurrenceDescription(sourceTransaction.recurrence)
        : budget.recurrenceDescription || 'One time';

      const baseData = {
        id: budget.id,
        originalBudgetId: budget.id,
        sourceTransactionId: budget.sourceTransactionId,
        primaryAccountId: storedPrimaryId,
        secondaryAccountId: storedSecondaryId,
        transactionTypeId: storedTypeId,
        transactionType: storedTypeId === 1 ? { id: 1, name: 'Money In' } : { id: 2, name: 'Money Out' },
        plannedAmount: budget.amount,
        actualAmount: statusObj.actualAmount,
        actualDate: statusObj.actualDate,
        completed: String(statusObj?.name || '').toLowerCase() === 'actual',
        amount:
          statusObj.actualAmount !== null && statusObj.actualAmount !== undefined
            ? statusObj.actualAmount
            : budget.amount,
        description: budget.description,
        occurrenceDate: budget.occurrenceDate,
        recurrenceDescription: recurrenceSummary,
        status: statusObj
      };

      const canonicalBudget = normalizeCanonicalTransaction(baseData);
      return transformTransactionToRows(canonicalBudget, normalizedAccounts);
    });

    if (loadToken !== state?.getBudgetGridLoadToken?.()) {
      return;
    }

    const showBudgetDateColumn = true;

    const groupingControl = document.createElement('div');
    groupingControl.className = 'toolbar-item grouping-control';
    groupingControl.innerHTML = `
      <label for="budget-grouping-select" class="text-muted control-label">Group By:</label>
      <select id="budget-grouping-select" class="input-select control-select">
        <option value="">None</option>
        <option value="transactionTypeName">Type (Money In/Out)</option>
        <option value="secondaryAccountTypeName">Account Type</option>
        <option value="recurrenceDescription">Recurrence Period</option>
        <option value="secondaryAccountName">Account</option>
      </select>
    `;
    window.add(toolbar, groupingControl);

    const formatCurrency = (value) =>
      new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    const totalsInline = document.createElement('div');
    totalsInline.className = 'toolbar-item toolbar-totals';
    totalsInline.innerHTML = `
      <span class="toolbar-total-item"><span class="label">Realized Net</span><span class="sublabel">Recorded actuals — income minus expenses</span><span class="value">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Planned Income</span><span class="sublabel">Total budgeted inflows</span><span class="value positive">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Planned Expenses</span><span class="sublabel">Total budgeted outflows</span><span class="value negative">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Planned Net Income</span><span class="sublabel">Budgeted income minus budgeted expenses</span><span class="value">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Open Commitments</span><span class="sublabel">Planned entries not yet recorded as actuals</span><span class="value negative">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Forecast Position</span><span class="sublabel">Realized net minus open commitments</span><span class="value">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Unbudgeted Actuals</span><span class="sublabel">Actuals recorded with no corresponding budget entry</span><span class="value negative">${formatCurrency(0)}</span></span>
    `;
    window.add(toolbar, totalsInline);

    const setBudgetCompletedState = async ({ rowId, markCompleted }) => {
      currentScenario = scenarioState?.get?.();

      const canonicalId = String(rowId).replace('_flipped', '');
      const allBudgets = (await getBudget(currentScenario.id)).map(normalizeCanonicalTransaction);
      const budgetIndex = allBudgets.findIndex((b) => String(b.id) === canonicalId);
      if (budgetIndex < 0) return;

      const target = { ...allBudgets[budgetIndex] };
      const nextStatus = typeof target.status === 'object'
        ? { ...target.status }
        : { name: target.status || 'planned', actualAmount: null, actualDate: null };

      if (markCompleted) {
        nextStatus.name = 'actual';

        if (!hasValue(nextStatus.actualAmount) && !hasValue(target.actualAmount)) {
          const planned = Math.abs(Number(target.plannedAmount ?? target.amount ?? 0) || 0);
          nextStatus.actualAmount = planned;
          target.actualAmount = planned;
        }

        if (!hasValue(nextStatus.actualDate) && !hasValue(target.actualDate)) {
          const today = formatDateOnly(new Date());
          nextStatus.actualDate = today;
          target.actualDate = today;
        }
      } else {
        nextStatus.name = 'planned';
      }

      if (hasValue(nextStatus.actualAmount)) {
        nextStatus.actualAmount = Math.abs(Number(nextStatus.actualAmount) || 0);
        target.actualAmount = nextStatus.actualAmount;
      }

      target.status = {
        name: nextStatus.name || 'planned',
        actualAmount: hasValue(nextStatus.actualAmount) ? nextStatus.actualAmount : null,
        actualDate: hasValue(nextStatus.actualDate) ? nextStatus.actualDate : null
      };

      allBudgets[budgetIndex] = target;
      await BudgetManager.saveAll(currentScenario.id, allBudgets);

      const refreshed = await getScenario(currentScenario.id);
      scenarioState?.set?.(refreshed);

      await loadBudgetGrid({ container, scenarioState, state, tables, callbacks, logger });
    };

    const readOnlyIfCompleted = (cell) => {
      const rowData = cell?.getRow?.()?.getData?.();
      return !isCompletedRow(rowData);
    };

    const deleteColumn = createDeleteColumn(
      async (cell) => {
        currentScenario = scenarioState?.get?.();

        await BudgetManager.remove(currentScenario.id, cell.getRow().getData().id);

        const refreshed = await getScenario(currentScenario.id);
        scenarioState?.set?.(refreshed);

        await loadBudgetGrid({ container, scenarioState, state, tables, callbacks, logger });
      },
      { confirmMessage: () => 'Delete this budget occurrence?' }
    );
    const originalDeleteCellClick = deleteColumn.cellClick;
    deleteColumn.cellClick = async function (e, cell) {
      const rowData = cell.getRow().getData();
      if (isCompletedRow(rowData)) return;
      return originalDeleteCellClick(e, cell);
    };

    const completedColumn = {
      title: 'Completed',
      field: 'completed',
      width: 110,
      minWidth: 110,
      hozAlign: 'center',
      headerSort: false,
      formatter: function (cell) {
        const completed = isCompletedRow(cell.getRow().getData());
        return `<input type="checkbox" ${completed ? 'checked' : ''} aria-label="Completed" />`;
      },
      cellClick: async function (e, cell) {
        const input = e?.target;
        if (input && input.tagName === 'INPUT') {
          e.preventDefault();
        }

        const rowData = cell.getRow().getData();
        const markCompleted = !isCompletedRow(rowData);
        await setBudgetCompletedState({ rowId: rowData.id, markCompleted });
      }
    };

    let budgetTable = tables?.getMasterBudgetTable?.();
    const shouldRebuildTable =
      !budgetTable ||
      budgetTable?.element !== gridContainer ||
      budgetTable?.__ftrackScenarioId !== scenarioId ||
      budgetTable?.__ftrackSecondaryAccountsKey !== secondaryAccountsKey;
    let didCreateNewTable = false;

    if (shouldRebuildTable) {
      didCreateNewTable = true;
      try {
        budgetTable?.destroy?.();
      } catch (_) {
        // ignore
      }

      budgetTable = await createGrid(gridContainer, {
        data: transformedData,
        rowFormatter: function (row) {
        try {
          const data = row.getData();
          const el = row.getElement();
          if (!el || !el.classList) return;

          if (isCompletedRow(data)) {
            el.classList.add('budget-row-frozen');
          } else {
            el.classList.remove('budget-row-frozen');
          }
        } catch (_) {
          // Ignore row format errors.
        }
        },
        columns: [
        deleteColumn,
        completedColumn,
        {
          title: 'Secondary Account',
          field: 'secondaryAccount',
          minWidth: 150,
          widthGrow: 1.5,
          editable: readOnlyIfCompleted,
          formatter: function (cell) {
            const value = cell.getValue();
            return value?.name || '';
          },
          editor: 'list',
          editorParams: {
            values: secondaryAccountValues,
            listItemFormatter: function (value, title) {
              return title;
            }
          },
          sorter: function (a, b) {
            const aVal = a?.name || '';
            const bVal = b?.name || '';
            return aVal.localeCompare(bVal);
          }
        },
        {
          title: 'Type',
          field: 'transactionType',
          minWidth: 100,
          widthGrow: 1,
          editable: readOnlyIfCompleted,
          formatter: function (cell) {
            const value = cell.getValue();
            return value?.name || '';
          },
          editor: 'list',
          editorParams: {
            values: [
              { label: 'Money In', value: { id: 1, name: 'Money In' } },
              { label: 'Money Out', value: { id: 2, name: 'Money Out' } }
            ],
            listItemFormatter: function (value, title) {
              return title;
            }
          },
          sorter: function (a, b) {
            const aVal = a?.name || '';
            const bVal = b?.name || '';
            return aVal.localeCompare(bVal);
          }
        },
        createMoneyColumn('Planned Amount', 'plannedAmount', { minWidth: 100, widthGrow: 1, editable: readOnlyIfCompleted }),
        ...(showBudgetDateColumn
          ? [createDateColumn('Date', 'occurrenceDate', { minWidth: 110, widthGrow: 1, editable: readOnlyIfCompleted })]
          : []),
        {
          title: 'Recurrence',
          field: 'recurrenceDescription',
          minWidth: 130,
          widthGrow: 1,
          formatter: function (cell) {
            return cell.getValue() || 'One time';
          }
        },
        createTextColumn('Description', 'description', { widthGrow: 2, editable: readOnlyIfCompleted }),
        createMoneyColumn('Actual Amount', 'actualAmount', { minWidth: 100, widthGrow: 1, editable: readOnlyIfCompleted }),
        createDateColumn('Actual Date', 'actualDate', { minWidth: 110, widthGrow: 1, editable: readOnlyIfCompleted })
        ],
        cellEdited: async function (cell) {
        currentScenario = scenarioState?.get?.();

        const rowData = cell.getRow().getData();
        const field = cell.getColumn().getField();
        const newValue = cell.getValue();

        if (isCompletedRow(rowData)) {
          return;
        }

        const isFlipped = String(rowData.id).includes('_flipped');
        const canonicalId = String(rowData.id).replace('_flipped', '');
        const allBudgets = (await getBudget(currentScenario.id)).map(normalizeCanonicalTransaction);
        const budgetIndex = allBudgets.findIndex((b) => String(b.id) === canonicalId);

        if (budgetIndex >= 0) {
          const updatedBudget = mapEditToCanonical(allBudgets[budgetIndex], {
            field,
            value: newValue,
            isFlipped
          });

          if (updatedBudget.actualAmount !== null && updatedBudget.actualAmount !== undefined) {
            updatedBudget.actualAmount = Math.abs(Number(updatedBudget.actualAmount) || 0);
          }

          if (field === 'actualAmount' || field === 'actualDate') {
            const hasActualData =
              (updatedBudget.actualAmount !== null && updatedBudget.actualAmount !== undefined) ||
              (updatedBudget.actualDate !== null && updatedBudget.actualDate !== undefined);
            if (hasActualData) {
              updatedBudget.status = {
                name: 'actual',
                actualAmount:
                  updatedBudget.actualAmount !== null && updatedBudget.actualAmount !== undefined
                    ? updatedBudget.actualAmount
                    : null,
                actualDate:
                  updatedBudget.actualDate !== null && updatedBudget.actualDate !== undefined
                    ? updatedBudget.actualDate
                    : null
              };
            }
          }

          allBudgets[budgetIndex] = updatedBudget;
          await BudgetManager.saveAll(currentScenario.id, allBudgets);
        }
        }
      });

      budgetTable.__ftrackScenarioId = scenarioId;
      budgetTable.__ftrackSecondaryAccountsKey = secondaryAccountsKey;
    } else {
      await refreshGridData(budgetTable, transformedData);
    }

    tables?.setMasterBudgetTable?.(budgetTable);

    const budgetGroupingSelect = document.getElementById('budget-grouping-select');
    if (budgetGroupingSelect) {
      const formatGroupLabel = (val) => {
        if (val === null || val === undefined || val === '') return 'Unspecified';
        if (typeof val === 'object') return val.name || val.label || val.description || 'Unspecified';
        return String(val);
      };

      budgetGroupingSelect.onchange = (e) => {
        const groupField = e?.target?.value;
        if (groupField) {
          budgetTable.setGroupBy(groupField);
          budgetTable.setGroupHeader((value, count, data, group) => {
            const totalAmount = data.reduce((sum, row) => sum + Number(row.plannedAmount || 0), 0);
            const label = formatGroupLabel(value);
            const formatted = new Intl.NumberFormat('en-ZA', {
              style: 'currency',
              currency: 'ZAR'
            }).format(totalAmount);
            return `${label} (${count} items, Total: ${formatted})`;
          });
        } else {
          budgetTable.setGroupBy(false);
        }
      };
    }

    const applyStateAndFilters = () => {
      try {
        budgetGridState.restore(budgetTable, { restoreGroupBy: false });
        budgetGridState.restoreDropdowns(
          {
            groupBy: '#budget-grouping-select'
          },
          { dispatchChange: true }
        );
      } catch (_) {
        // Keep existing behavior: ignore state restore errors.
      }

      setTimeout(() => {
        applyMasterBudgetTableFilters({ tables, state, callbacks });
      }, 0);
    };

    const handleBudgetFiltered = function (filters, rows) {
      callbacks?.updateBudgetTotals?.(rows);
    };

    const handleBudgetBuilt = function () {
      callbacks?.updateBudgetTotals?.();
      applyStateAndFilters();
    };

    if (didCreateNewTable) {
      attachGridHandlers(budgetTable, {
        dataFiltered: handleBudgetFiltered,
        tableBuilt: handleBudgetBuilt
      });
    } else {
      applyStateAndFilters();
    }

    // Totals should reflect the post-filter view on every refresh.
    try {
      callbacks?.updateBudgetTotals?.();
    } catch (_) {
      // ignore
    }
  } catch (err) {
    logger?.error?.('[Forecast] loadBudgetGrid failed', err);
  }
}

export async function refreshBudgetGrid(args) {
  return loadBudgetGrid(args);
}
