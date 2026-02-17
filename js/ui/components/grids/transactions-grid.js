// forecast-transactions-grid.js
// Master transactions grid loader extracted from forecast.js (no behavior change).

import { createGrid, refreshGridData, createTextColumn, createDateColumn, createMoneyColumn, createDeleteColumn, createDuplicateColumn } from './grid-factory.js';
import { attachGridHandlers } from './grid-handlers.js';
import { openRecurrenceModal } from '../modals/recurrence-modal.js';
import { openPeriodicChangeModal } from '../modals/periodic-change-modal.js';
import { openTextInputModal } from '../modals/text-input-modal.js';
import { formatDateOnly } from '../../../shared/date-utils.js';
import { expandTransactions } from '../../../domain/calculations/transaction-expander.js';
import { getRecurrenceDescription } from '../../../domain/calculations/recurrence-utils.js';
import { getPeriodicChangeDescription } from '../../../domain/calculations/periodic-change-utils.js';
import { calculateCategoryTotals } from '../../transforms/data-aggregators.js';
import { notifyError } from '../../../shared/notifications.js';
import { normalizeCanonicalTransaction, transformTransactionToRows, mapEditToCanonical } from '../../transforms/transaction-row-transformer.js';
import * as TransactionManager from '../../../app/managers/transaction-manager.js';
import { loadLookup } from '../../../app/services/lookup-service.js';
import { GridStateManager } from './grid-state.js';

import {
  getScenario,
  getTransactions,
  createTransaction,
  createAccount,
  getScenarioPeriods
} from '../../../data-manager.js';

const transactionsGridState = new GridStateManager('transactions');

export async function loadMasterTransactionsGrid({
  container,
  scenarioState,
  getScenarioTypeConfig,
  state,
  tables,
  callbacks,
  logger
}) {
  let currentScenario = scenarioState?.get?.();
  if (!currentScenario) return;

  try {
    const existingTable = tables?.getMasterTransactionsTable?.();
    transactionsGridState.capture(existingTable, {
      groupBy: '#tx-grouping-select'
    });
  } catch (_) {
    // Keep existing behavior: ignore state capture errors.
  }

  const typeConfig = getScenarioTypeConfig?.();

  if (!currentScenario.type) {
    container.innerHTML =
      '<div class="empty-message">Please select a Scenario Type and Period Type in the scenario grid above to enable transactions.</div>';
    return;
  }

  if (!typeConfig?.showPlannedTransactions) {
    container.innerHTML = '';
    return;
  }

  // Keep the grid container stable to reduce scroll jumps.
  const existingToolbars = container.querySelectorAll(':scope > .grid-toolbar');
  existingToolbars.forEach((el) => el.remove());

  // Remove any stale placeholders inserted by higher-level controllers.
  container.querySelectorAll(':scope > .empty-message').forEach((el) => el.remove());

  let gridContainer = container.querySelector(':scope > .grid-container.master-transactions-grid');
  if (!gridContainer) {
    gridContainer = document.createElement('div');
    gridContainer.className = 'grid-container master-transactions-grid';
    window.add(container, gridContainer);
  }

  const rerun = async () => {
    await loadMasterTransactionsGrid({
      container,
      scenarioState,
      getScenarioTypeConfig,
      state,
      tables,
      callbacks,
      logger
    });
    await callbacks?.refreshSummaryCards?.();
  };

  const toolbar = document.createElement('div');
  toolbar.className = 'grid-toolbar';

  const existingAdds = container.querySelectorAll('.btn-add');
  existingAdds.forEach((el) => el.remove());

  const addButtonContainer = document.createElement('div');
  addButtonContainer.className = 'toolbar-item';
  const addButton = document.createElement('button');
  addButton.className = 'btn btn-primary btn-add';
  addButton.textContent = '+ Add New Transaction';
  addButton.addEventListener('click', async () => {
    try {
      currentScenario = scenarioState?.get?.();

      const transactionFilterAccountId = state?.getTransactionFilterAccountId?.();
      const actualPeriod = state?.getActualPeriod?.();
      const periods = state?.getPeriods?.() || [];

      const accountIds = (currentScenario.accounts || []).map((acc) => acc.id);
      const filteredAccountId =
        transactionFilterAccountId && accountIds.includes(transactionFilterAccountId)
          ? transactionFilterAccountId
          : null;
      const defaultAccountId = filteredAccountId || (accountIds.length > 0 ? accountIds[0] : null);

      if (!defaultAccountId) {
        notifyError('Please create at least one account before adding a transaction.');
        return;
      }

      const selectedPeriod = actualPeriod ? periods.find((p) => p.id === actualPeriod) : null;
      const defaultEffectiveDate = selectedPeriod
        ? formatDateOnly(selectedPeriod.startDate)
        : (currentScenario.startDate || formatDateOnly(new Date()));

      await createTransaction(currentScenario.id, {
        primaryAccountId: defaultAccountId,
        secondaryAccountId: null,
        transactionTypeId: 2,
        amount: 0,
        effectiveDate: defaultEffectiveDate,
        description: '',
        recurrence: null,
        periodicChange: null,
        status: 'planned',
        tags: []
      });

      const refreshed = await getScenario(currentScenario.id);
      scenarioState?.set?.(refreshed);

      await rerun();
    } catch (err) {
      notifyError('Failed to create transaction. Please try again.');
    }
  });
  window.add(addButtonContainer, addButton);
  window.add(toolbar, addButtonContainer);

  const groupingControl = document.createElement('div');
  groupingControl.className = 'toolbar-item grouping-control';
  groupingControl.innerHTML = `
    <label for="tx-grouping-select" class="text-muted control-label">Group By:</label>
    <select id="tx-grouping-select" class="input-select control-select">
      <option value="">None</option>
      <option value="transactionTypeName">Type (Money In/Out)</option>
      <option value="secondaryAccountTypeName">Account Type</option>
      <option value="recurrenceSummary">Recurrence Period</option>
      <option value="secondaryAccountName">Account</option>
    </select>
  `;
  window.add(toolbar, groupingControl);

  const periodTypeControl = document.createElement('div');
  periodTypeControl.className = 'toolbar-item period-type-control';
  periodTypeControl.innerHTML = `
    <label for="tx-period-type-select" class="text-muted control-label">View By:</label>
    <select id="tx-period-type-select" class="input-select control-select">
      <option value="Day">Day</option>
      <option value="Week">Week</option>
      <option value="Month">Month</option>
      <option value="Quarter">Quarter</option>
      <option value="Year">Year</option>
    </select>
  `;
  window.add(toolbar, periodTypeControl);

  const periodFilter = document.createElement('div');
  periodFilter.className = 'toolbar-item period-filter';
  periodFilter.innerHTML = `
    <label for="actual-period-select" class="text-muted control-label">Period:</label>
    <select id="actual-period-select" class="input-select control-select"></select>
    <button id="actual-prev-period-btn" class="btn btn-ghost control-button" title="Previous Period">&#9664;</button>
    <button id="actual-next-period-btn" class="btn btn-ghost control-button" title="Next Period">&#9654;</button>
  `;
  window.add(toolbar, periodFilter);

  const accountFilter = document.createElement('div');
  accountFilter.className = 'toolbar-item account-filter';
  accountFilter.innerHTML = `
    <label for="account-filter-select" class="text-muted control-label">Account:</label>
    <select id="account-filter-select" class="input-select control-select">
      <option value="">-- All Accounts --</option>
    </select>
  `;
  window.add(toolbar, accountFilter);

  // Insert toolbar above the grid so it doesn't jump to the bottom on refresh.
  container.insertBefore(toolbar, gridContainer);

  const periodTypeSelect = document.getElementById('tx-period-type-select');
  if (periodTypeSelect) {
    periodTypeSelect.value = state?.getActualPeriodType?.();
  }

  const actualPeriodType = state?.getActualPeriodType?.();
  const periods = await getScenarioPeriods(currentScenario.id, actualPeriodType);
  state?.setPeriods?.(periods);

  const periodSelect = document.getElementById('actual-period-select');
  if (periodSelect) {
    periodSelect.innerHTML = '<option value="">-- All Periods --</option>';
    periods.forEach((period) => {
      const option = document.createElement('option');
      option.value = period.id;
      option.textContent =
        period.label || `${formatDateOnly(period.startDate) || ''} to ${formatDateOnly(period.endDate) || ''}`;
      periodSelect.appendChild(option);
    });

    periodSelect.value = state?.getActualPeriod?.() || '';

    periodSelect.addEventListener('change', async (e) => {
      state?.setActualPeriod?.(e.target.value);
      await rerun();
    });

    document.getElementById('actual-prev-period-btn')?.addEventListener('click', async () => {
      const actualPeriod = state?.getActualPeriod?.();
      const currentIndex = periods.findIndex((p) => p.id === actualPeriod);
      if (currentIndex > 0) {
        state?.setActualPeriod?.(periods[currentIndex - 1].id);
        await rerun();
      }
    });

    document.getElementById('actual-next-period-btn')?.addEventListener('click', async () => {
      const actualPeriod = state?.getActualPeriod?.();
      const currentIndex = periods.findIndex((p) => p.id === actualPeriod);
      if (currentIndex < periods.length - 1) {
        state?.setActualPeriod?.(periods[currentIndex + 1].id);
        await rerun();
      }
    });

    document.getElementById('tx-period-type-select')?.addEventListener('change', async (e) => {
      state?.setActualPeriodType?.(e.target.value);
      state?.setActualPeriod?.(null);
      await rerun();
    });
  }

  const accountFilterSelect = document.getElementById('account-filter-select');
  if (accountFilterSelect) {
    accountFilterSelect.innerHTML = '<option value="">-- All Accounts --</option>';
    (currentScenario.accounts || []).forEach((account) => {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = account.name;
      accountFilterSelect.appendChild(option);
    });

    accountFilterSelect.value = state?.getTransactionFilterAccountId?.() || '';

    accountFilterSelect.addEventListener('change', async (e) => {
      const nextFilter = e.target.value ? Number(e.target.value) : null;
      state?.setTransactionFilterAccountId?.(nextFilter);

      const masterTransactionsTable = tables?.getMasterTransactionsTable?.();
      if (masterTransactionsTable) {
        if (nextFilter) {
          masterTransactionsTable.setFilter((data) => {
            if (!data.perspectiveAccountId) return true;
            return Number(data.perspectiveAccountId) === nextFilter;
          });
        } else {
          masterTransactionsTable.setFilter((data) => {
            return !String(data.id).includes('_flipped');
          });
        }
        callbacks?.updateTransactionTotals?.();
      }

      const masterBudgetTable = tables?.getMasterBudgetTable?.();
      if (masterBudgetTable) {
        if (nextFilter) {
          masterBudgetTable.setFilter((data) => {
            if (!data.perspectiveAccountId) return true;
            return Number(data.perspectiveAccountId) === nextFilter;
          });
        } else {
          masterBudgetTable.setFilter((data) => {
            return !String(data.id).includes('_flipped');
          });
        }
        callbacks?.updateBudgetTotals?.();
      }

      // Projections account filtering is independent of transactions.
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

  const showDateColumn = !!state?.getActualPeriod?.();

  try {
    let allTransactions = await getTransactions(currentScenario.id);

    const actualPeriod = state?.getActualPeriod?.();
    if (actualPeriod) {
      const selectedPeriod = periods.find((p) => p.id === actualPeriod);
      if (selectedPeriod) {
        allTransactions = expandTransactions(
          allTransactions,
          selectedPeriod.startDate,
          selectedPeriod.endDate,
          currentScenario.accounts
        );
      }
    }

    allTransactions = allTransactions.map(normalizeCanonicalTransaction);

    const transformedData = await Promise.all(
      allTransactions.flatMap(async (tx) => {
        const statusName = typeof tx.status === 'object' ? tx.status.name : tx.status;
        const actualAmount = typeof tx.status === 'object' ? tx.status.actualAmount : tx.actualAmount;
        const actualDate = typeof tx.status === 'object' ? tx.status.actualDate : tx.actualDate;

        const displayDate = actualPeriod
          ? (statusName === 'actual' && actualDate ? actualDate : tx.effectiveDate)
          : '';

        const recurrenceSummary = getRecurrenceDescription(tx.recurrence);
        const periodicChangeSummary = await getPeriodicChangeDescription(tx.periodicChange);

        const txForDisplay = {
          ...tx,
          status: statusName || 'planned',
          plannedAmount: tx.plannedAmount ?? Math.abs(Number(tx.amount ?? 0)),
          actualAmount:
            actualAmount !== undefined && actualAmount !== null ? Math.abs(actualAmount) : tx.actualAmount,
          effectiveDate: tx.effectiveDate,
          plannedDate: tx.effectiveDate,
          actualDate: actualDate,
          displayDate,
          recurrenceDescription: recurrenceSummary,
          recurrenceSummary,
          periodicChangeSummary,
          periodicChange: tx.periodicChange,
          tags: tx.tags || []
        };

        return transformTransactionToRows(txForDisplay, normalizedAccounts);
      })
    );

    const flatTransformedData = transformedData.flat();

    const txTotals = calculateCategoryTotals(flatTransformedData, {
      amountField: 'amount',
      typeField: 'transactionType',
      typeNameField: 'transactionTypeName',
      typeIdField: 'transactionTypeId'
    });

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
      <span class="toolbar-total-item"><span class="label">Money In:</span> <span class="value positive">${formatCurrency(txTotals.moneyIn)}</span></span>
      <span class="toolbar-total-item"><span class="label">Money Out:</span> <span class="value negative">${formatCurrency(txTotals.moneyOut)}</span></span>
      <span class="toolbar-total-item"><span class="label">Net:</span> <span class="value ${txTotals.net >= 0 ? 'positive' : 'negative'}">${formatCurrency(txTotals.net)}</span></span>
    `;
    toolbar.appendChild(totalsInline);

    let masterTransactionsTable = tables?.getMasterTransactionsTable?.();
    const shouldRebuildTable =
      !masterTransactionsTable ||
      masterTransactionsTable?.element !== gridContainer ||
      masterTransactionsTable?.__ftrackShowDateColumn !== showDateColumn;

    let didCreateNewTable = false;

    if (shouldRebuildTable) {
      didCreateNewTable = true;
      try {
        masterTransactionsTable?.destroy?.();
      } catch (_) {
        // ignore
      }

      masterTransactionsTable = await createGrid(gridContainer, {
        data: flatTransformedData,
        headerWordWrap: false,
        autoResize: true,
        columns: [
        createDuplicateColumn(
          async (cell) => {
            const scenario = scenarioState?.get?.();
            if (!scenario) return;

            const rowData = cell.getRow().getData();
            const actualTxId = String(rowData.id).includes('_flipped')
              ? String(rowData.id).replace('_flipped', '')
              : rowData.id;

            const allTxs = await getTransactions(scenario.id);
            const source = allTxs.find((tx) => tx.id === Number(actualTxId));
            if (!source) return;

            const cloned = JSON.parse(JSON.stringify(source));
            cloned.id = 0;
            allTxs.push(cloned);

            await TransactionManager.saveAll(scenario.id, allTxs);
            await rerun();
          },
          { headerTooltip: 'Duplicate Transaction' }
        ),
        createDeleteColumn(
          async (cell) => {
            const scenario = scenarioState?.get?.();
            const rowData = cell.getRow().getData();
            const actualTxId = String(rowData.id).includes('_flipped')
              ? String(rowData.id).replace('_flipped', '')
              : rowData.id;
            const allTxs = await getTransactions(scenario.id);
            const filteredTxs = allTxs.filter((tx) => tx.id !== Number(actualTxId));
            await TransactionManager.saveAll(scenario.id, filteredTxs);
            await rerun();
          },
          { confirmMessage: () => 'Delete this transaction?' }
        ),
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
            values: () => [
              ...((scenarioState?.get?.()?.accounts || []).map((acc) => ({ label: acc.name, value: acc }))),
              { label: 'Insert New Account...', value: { __create__: true } }
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
        createMoneyColumn('Amount', 'amount', { minWidth: 100, widthGrow: 1 }),
        {
          title: 'Recurrence',
          field: 'recurrenceSummary',
          minWidth: 170,
          widthGrow: 1.2,
          formatter: function (cell) {
            const summary = cell.getValue() || 'One time';
            const icon =
              '<svg class="recurrence-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/></svg>';
            return `<span class="recurrence-cell">${icon}<span class="recurrence-text">${summary}</span></span>`;
          },
          cellClick: function (e, cell) {
            const rowData = cell.getRow().getData();
            openRecurrenceModal(rowData.recurrence, async (newRecurrence) => {
              const scenario = scenarioState?.get?.();
              const allTxs = await getTransactions(scenario.id);
              const actualTxId = String(rowData.id).replace('_flipped', '');
              const txIndex = allTxs.findIndex((tx) => String(tx.id) === actualTxId);
              if (txIndex >= 0) {
                allTxs[txIndex].recurrence = newRecurrence;
                await TransactionManager.saveAll(scenario.id, allTxs);
                await rerun();
              }
            });
          }
        },
        {
          title: 'Periodic Change',
          field: 'periodicChangeSummary',
          minWidth: 170,
          widthGrow: 1.2,
          formatter: function (cell) {
            const summary = cell.getValue() || 'None';
            const icon =
              '<svg class="periodic-change-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3h-2v8h-8v2h8v8h2v-8h8v-2h-8V3z"/></svg>';
            return `<span class="periodic-change-cell">${icon}<span class="periodic-change-text">${summary}</span></span>`;
          },
          cellClick: function (e, cell) {
            const rowData = cell.getRow().getData();
            openPeriodicChangeModal(rowData.periodicChange, async (newPeriodicChange) => {
              const scenario = scenarioState?.get?.();
              const allTxs = await getTransactions(scenario.id);
              const actualTxId = String(rowData.id).replace('_flipped', '');
              const txIndex = allTxs.findIndex((tx) => String(tx.id) === actualTxId);
              if (txIndex >= 0) {
                allTxs[txIndex].periodicChange = newPeriodicChange;
                await TransactionManager.saveAll(scenario.id, allTxs);
                await rerun();
              }
            });
          }
        },
        ...(showDateColumn
          ? [createDateColumn('Date', 'displayDate', { minWidth: 110, widthGrow: 1 })]
          : []),
        createTextColumn('Description', 'description', { widthGrow: 2 })
        ],
        cellEdited: async function (cell) {
        const scenario = scenarioState?.get?.();
        const rowData = cell.getRow().getData();
        const field = cell.getColumn().getField();
        const newValue = cell.getValue();

        const isFlipped = String(rowData.id).includes('_flipped');
        const actualTxId = String(rowData.id).replace('_flipped', '');

        if ((field === 'secondaryAccount' || field === 'primaryAccount') && newValue && newValue.__create__) {
          openTextInputModal('Create New Account', 'Enter account name:', '', async (accountName) => {
            if (accountName && accountName.trim()) {
              try {
                const newAccount = await createAccount(scenario.id, {
                  name: accountName.trim(),
                  type: { id: 1, name: 'Asset' },
                  currency: { id: 1, name: 'ZAR' },
                  startingBalance: 0,
                  openDate: formatDateOnly(new Date()),
                  periodicChange: null
                });

                const currentRow = cell.getRow();
                const currentData = currentRow.getData();

                if (field === 'primaryAccount') {
                  currentData.primaryAccountId = newAccount.id;
                  currentData.primaryAccount = newAccount;
                } else {
                  currentData.secondaryAccountId = newAccount.id;
                  currentData.secondaryAccount = newAccount;
                }

                currentRow.update(currentData);

                const allTxs = await getTransactions(scenario.id);
                const txIndex = allTxs.findIndex((tx) => tx.id === currentData.id);
                if (txIndex >= 0) {
                  if (field === 'primaryAccount') {
                    allTxs[txIndex].primaryAccountId = newAccount.id;
                  } else {
                    allTxs[txIndex].secondaryAccountId = newAccount.id;
                  }
                  await TransactionManager.saveAll(scenario.id, allTxs);
                }

                if (window.accountsTableInstance) {
                  const enrichedAccount = {
                    ...newAccount,
                    accountType: newAccount.type?.name || 'Unknown'
                  };
                  window.accountsTableInstance.addRow(enrichedAccount);
                }
              } catch (err) {
                notifyError('Failed to create account. Please try again.');
              }
            }
          });
          return;
        }

        const allTxs = (await getTransactions(scenario.id)).map(normalizeCanonicalTransaction);
        const txIndex = allTxs.findIndex((tx) => String(tx.id) === actualTxId);

        if (txIndex >= 0) {
          const updatedTx = mapEditToCanonical(allTxs[txIndex], { field, value: newValue, isFlipped });
          allTxs[txIndex] = updatedTx;
          await TransactionManager.saveAll(scenario.id, allTxs);
          await rerun();
        }
        }
      });

      masterTransactionsTable.__ftrackShowDateColumn = showDateColumn;
    } else {
      await refreshGridData(masterTransactionsTable, flatTransformedData);
    }

    tables?.setMasterTransactionsTable?.(masterTransactionsTable);

    const groupingSelect = document.getElementById('tx-grouping-select');
    if (groupingSelect) {
      const formatGroupLabel = (val) => {
        if (val === null || val === undefined || val === '') return 'Unspecified';
        if (typeof val === 'object') return val.name || val.label || val.description || 'Unspecified';
        return String(val);
      };

      groupingSelect.addEventListener('change', (e) => {
        const groupField = e.target.value;
        if (groupField) {
          masterTransactionsTable.setGroupBy(groupField);
          masterTransactionsTable.setGroupHeader((value, count, data, group) => {
            const totalAmount = data.reduce((sum, row) => sum + Number(row.amount || 0), 0);
            const label = formatGroupLabel(value);
            const formatted = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(
              totalAmount
            );
            return `${label} (${count} items, Total: ${formatted})`;
          });
        } else {
          masterTransactionsTable.setGroupBy(false);
        }
      });
    }

    try {
      transactionsGridState.restore(masterTransactionsTable, { restoreGroupBy: false });
      transactionsGridState.restoreDropdowns({
        groupBy: '#tx-grouping-select'
      });
    } catch (_) {
      // Keep existing behavior: ignore state restore errors.
    }

    setTimeout(() => {
      const transactionFilterAccountId = state?.getTransactionFilterAccountId?.();
      if (transactionFilterAccountId) {
        masterTransactionsTable.setFilter((data) => {
          if (!data.perspectiveAccountId) return true;
          return Number(data.perspectiveAccountId) === transactionFilterAccountId;
        });
      } else {
        masterTransactionsTable.setFilter((data) => {
          return !String(data.id).includes('_flipped');
        });
      }
    }, 0);

    const handleTransactionsFiltered = function (filters, rows) {
      callbacks?.updateTransactionTotals?.(rows);
    };

    const handleTransactionsBuilt = function () {
      callbacks?.updateTransactionTotals?.();
    };

    if (didCreateNewTable) {
      attachGridHandlers(masterTransactionsTable, {
        dataFiltered: handleTransactionsFiltered,
        tableBuilt: handleTransactionsBuilt
      });
    }

    // Totals should reflect the post-filter view on every refresh.
    try {
      callbacks?.updateTransactionTotals?.();
    } catch (_) {
      // ignore
    }
  } catch (err) {
    // Keep existing behavior: errors are swallowed here.
  }
}
