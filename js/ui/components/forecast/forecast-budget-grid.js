// forecast-budget-grid.js
// Budget grid loader extracted from forecast.js (no behavior change).

import { createGrid, refreshGridData, createDeleteColumn, createTextColumn, createMoneyColumn, createDateColumn } from '../grids/grid-factory.js';
import { attachGridHandlers } from '../grids/grid-handlers.js';
import { formatDateOnly } from '../../../shared/date-utils.js';
import { getRecurrenceDescription } from '../../../domain/calculations/recurrence-utils.js';
import { notifyError, notifySuccess } from '../../../shared/notifications.js';
import { normalizeCanonicalTransaction, transformTransactionToRows, mapEditToCanonical } from '../../transforms/transaction-row-transformer.js';
import { loadLookup } from '../../../app/services/lookup-service.js';
import { GridStateManager } from '../grids/grid-state.js';

import * as BudgetManager from '../../../app/managers/budget-manager.js';

import { getScenario, getScenarioPeriods, getBudget } from '../../../app/services/data-service.js';

const budgetGridState = new GridStateManager('budget');

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

  try {
    const existingTable = tables?.getMasterBudgetTable?.();
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

  // Keep the grid container stable to reduce scroll jumps.
  const existingToolbars = container.querySelectorAll(':scope > .grid-toolbar');
  existingToolbars.forEach((el) => el.remove());

  let gridContainer = container.querySelector(':scope > .grid-container.budget-grid');
  if (!gridContainer) {
    gridContainer = document.createElement('div');
    gridContainer.className = 'grid-container budget-grid';
    window.add(container, gridContainer);
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
        if (budgetPeriodSnapshot) {
          const selectedPeriod = periods.find((p) => p.id === budgetPeriodSnapshot);
          if (selectedPeriod && selectedPeriod.startDate) {
            defaultDate = formatDateOnly(new Date(selectedPeriod.startDate));
          }
        }

        const primaryAccountId =
          transactionFilterAccountIdSnapshot ||
          (currentScenario.accounts && currentScenario.accounts.length > 0
            ? currentScenario.accounts[0].id
            : null);

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
    regenerateFromProjectionsButton.textContent = 'Regenerate Budget from Projections.';
    regenerateFromProjectionsButton.addEventListener('click', async () => {
      try {
        currentScenario = scenarioState?.get?.();

        if (!currentScenario.projections || currentScenario.projections.length === 0) {
          notifyError('No projections to save as budget. Generate projections first.');
          return;
        }

        const confirmed = confirm('Save current projection as Budget? This will replace any existing budget.');
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
        regenerateFromProjectionsButton.textContent = 'Regenerate Budget from Projections.';
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
        <option value="">-- All Accounts --</option>
      </select>
    `;
    window.add(toolbar, accountFilter);

    window.add(container, toolbar);

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
        await loadBudgetGrid({ container, scenarioState, state, tables, callbacks, logger });
      });

      document.getElementById('budget-prev-period-btn')?.addEventListener('click', async () => {
        const budgetPeriod = state?.getBudgetPeriod?.();
        const currentIndex = periods.findIndex((p) => p.id === budgetPeriod);
        if (currentIndex > 0) {
          state?.setBudgetPeriod?.(periods[currentIndex - 1].id);
          await loadBudgetGrid({ container, scenarioState, state, tables, callbacks, logger });
        }
      });

      document.getElementById('budget-next-period-btn')?.addEventListener('click', async () => {
        const budgetPeriod = state?.getBudgetPeriod?.();
        const currentIndex = periods.findIndex((p) => p.id === budgetPeriod);
        if (currentIndex < periods.length - 1) {
          state?.setBudgetPeriod?.(periods[currentIndex + 1].id);
          await loadBudgetGrid({ container, scenarioState, state, tables, callbacks, logger });
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
      budgetAccountFilterSelect.innerHTML = '<option value="">-- All Accounts --</option>';
      (currentScenario.accounts || []).forEach((account) => {
        const option = document.createElement('option');
        option.value = account.id;
        option.textContent = account.name;
        budgetAccountFilterSelect.appendChild(option);
      });

      budgetAccountFilterSelect.value = transactionFilterAccountIdSnapshot || '';

      budgetAccountFilterSelect.addEventListener('change', async (e) => {
        const nextId = e.target.value ? Number(e.target.value) : null;
        state?.setTransactionFilterAccountId?.(nextId);

        const masterBudgetTable = tables?.getMasterBudgetTable?.();
        if (masterBudgetTable) {
          if (nextId) {
            masterBudgetTable.setFilter((data) => {
              if (!data.perspectiveAccountId) return true;
              return Number(data.perspectiveAccountId) === nextId;
            });
          } else {
            masterBudgetTable.setFilter((data) => {
              return !String(data.id).includes('_flipped');
            });
          }
          callbacks?.updateBudgetTotals?.();
        }

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

        await callbacks?.loadProjectionsSection?.(callbacks?.getEl?.('projectionsContent'));
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
        amount:
          statusObj.actualAmount !== null && statusObj.actualAmount !== undefined
            ? statusObj.actualAmount
            : budget.amount,
        description: budget.description,
        occurrenceDate: budget.occurrenceDate,
        recurrenceDescription: recurrenceSummary,
        status: statusObj
      };

      if (budgetPeriodSnapshot) {
        const selectedPeriod = periods.find((p) => p.id === budgetPeriodSnapshot);
        if (selectedPeriod) {
          const budgetDate = new Date(budget.occurrenceDate);
          const periodStart = new Date(selectedPeriod.startDate);
          const periodEnd = new Date(selectedPeriod.endDate);
          periodEnd.setHours(23, 59, 59, 999);
          if (budgetDate < periodStart || budgetDate > periodEnd) {
            return [];
          }
        }
      }

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
      <span class="toolbar-total-item"><span class="label">Actual Net:</span> <span class="value">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Money In:</span> <span class="value positive">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Money Out:</span> <span class="value negative">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Net:</span> <span class="value">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Planned Outstanding:</span> <span class="value negative">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Planned Net Balance:</span> <span class="value">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Unplanned:</span> <span class="value negative">${formatCurrency(0)}</span></span>
    `;
    window.add(toolbar, totalsInline);
    window.add(container, toolbar);

    const existingTable = tables?.getMasterBudgetTable?.();

    const columns = [
      createDeleteColumn(
        async (cell) => {
          currentScenario = scenarioState?.get?.();

          await BudgetManager.remove(currentScenario.id, cell.getRow().getData().id);

          const refreshed = await getScenario(currentScenario.id);
          scenarioState?.set?.(refreshed);

          await loadBudgetGrid({ container, scenarioState, state, tables, callbacks, logger });
        },
        { confirmMessage: () => 'Delete this budget occurrence?' }
      ),
      {
        title: 'Secondary Account',
        field: 'secondaryAccount',
        minWidth: 150,
        widthGrow: 1.5,
        formatter: function (cell) {
          const value = cell.getValue();
          return value?.name || '';
        },
        editor: 'list',
        editorParams: {
          values: () => (scenarioState?.get?.()?.accounts || []).map((acc) => ({ label: acc.name, value: acc })),
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
      createMoneyColumn('Planned Amount', 'plannedAmount', { minWidth: 100, widthGrow: 1 }),
      ...(showBudgetDateColumn
        ? [createDateColumn('Date', 'occurrenceDate', { minWidth: 110, widthGrow: 1 })]
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
      createTextColumn('Description', 'description', { widthGrow: 2 }),
      createMoneyColumn('Actual Amount', 'actualAmount', { minWidth: 100, widthGrow: 1 }),
      createDateColumn('Actual Date', 'actualDate', { minWidth: 110, widthGrow: 1 })
    ];

    let budgetTable = existingTable;
    const needsNewTable = !budgetTable || budgetTable?.element !== gridContainer;
    let didCreateNewTable = false;

    if (needsNewTable) {
      didCreateNewTable = true;
      try {
        budgetTable?.destroy?.();
      } catch (_) {
        // ignore
      }

      budgetTable = await createGrid(gridContainer, {
        data: transformedData,
        columns,
        cellEdited: async function (cell) {
        currentScenario = scenarioState?.get?.();

        const rowData = cell.getRow().getData();
        const field = cell.getColumn().getField();
        const newValue = cell.getValue();

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
                actualAmount: updatedBudget.actualAmount || null,
                actualDate: updatedBudget.actualDate || null
              };
            }
          }

          allBudgets[budgetIndex] = updatedBudget;
          await BudgetManager.saveAll(currentScenario.id, allBudgets);
        }
        }
      });
    } else {
      await refreshGridData(budgetTable, transformedData);
    }

    tables?.setMasterBudgetTable?.(budgetTable);

    if (didCreateNewTable) {
      const handleBudgetFiltered = function (filters, rows) {
        callbacks?.updateBudgetTotals?.(rows);
      };

      const handleBudgetBuilt = function () {
        callbacks?.updateBudgetTotals?.();
      };

      attachGridHandlers(budgetTable, {
        dataFiltered: handleBudgetFiltered,
        tableBuilt: handleBudgetBuilt
      });
    }

    const budgetGroupingSelect = document.getElementById('budget-grouping-select');
    if (budgetGroupingSelect) {
      const formatGroupLabel = (val) => {
        if (val === null || val === undefined || val === '') return 'Unspecified';
        if (typeof val === 'object') return val.name || val.label || val.description || 'Unspecified';
        return String(val);
      };

      budgetGroupingSelect.addEventListener('change', (e) => {
        const groupField = e.target.value;
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
      });
    }

    try {
      budgetGridState.restore(budgetTable, { restoreGroupBy: false });
      budgetGridState.restoreDropdowns({
        groupBy: '#budget-grouping-select'
      });
    } catch (_) {
      // Keep existing behavior: ignore state restore errors.
    }

    setTimeout(() => {
      if (transactionFilterAccountIdSnapshot) {
        budgetTable.setFilter((data) => {
          if (!data.perspectiveAccountId) return true;
          return Number(data.perspectiveAccountId) === transactionFilterAccountIdSnapshot;
        });
      } else {
        budgetTable.setFilter((data) => {
          return !String(data.id).includes('_flipped');
        });
      }
    }, 0);

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
