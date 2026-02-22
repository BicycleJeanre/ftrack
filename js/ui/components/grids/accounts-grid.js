// forecast-accounts-grid.js
// Accounts grid loader extracted from forecast.js (no behavior change).

import * as AccountManager from '../../../app/managers/account-manager.js';
import { loadLookup } from '../../../app/services/lookup-service.js';
import {
  createGrid,
  refreshGridData,
  createDuplicateColumn,
  createDeleteColumn,
  createTextColumn,
  createMoneyColumn,
  createDateColumn
} from './grid-factory.js';
import { openPeriodicChangeModal } from '../modals/periodic-change-modal.js';
import { openPeriodicChangeScheduleModal } from '../modals/periodic-change-schedule-modal.js';
import { openTagEditorModal } from '../modals/tag-editor-modal.js';
import { getPeriodicChangeDescription } from '../../../domain/calculations/periodic-change-utils.js';
import { notifyError } from '../../../shared/notifications.js';
import { GridStateManager } from './grid-state.js';

const accountsGridState = new GridStateManager('accounts');
let lastAccountsTable = null;
let accountsGridMode = 'summary'; // 'summary' or 'detail'

export function buildAccountsGridColumns({
  lookupData,
  workflowConfig,
  scenarioState,
  reloadAccountsGrid,
  reloadMasterTransactionsGrid,
  logger,
  mode = 'summary'
}) {
  // SUMMARY columns - minimal, most important fields only
  if (mode === 'summary') {
    return [
      createDuplicateColumn(
        async (cell) => {
          const currentScenario = scenarioState?.get?.();
          if (!currentScenario) return;

          const rowData = cell.getRow().getData();
          const allAccounts = await AccountManager.getAll(currentScenario.id);
          const source = allAccounts.find((a) => a.id === rowData.id) || rowData;

          const { id, accountType, periodicChangeSummary, ...payload } = JSON.parse(JSON.stringify(source));
          await AccountManager.create(currentScenario.id, payload);

          await reloadAccountsGrid(document.getElementById('accountsTable'));
          await reloadMasterTransactionsGrid(document.getElementById('transactionsTable'));
          document.dispatchEvent(new CustomEvent('forecast:accountsUpdated'));
        },
        { headerTooltip: 'Duplicate Account' }
      ),
      createDeleteColumn(
        async (cell) => {
          const currentScenario = scenarioState?.get?.();
          const rowData = cell.getRow().getData();
          await AccountManager.remove(currentScenario.id, rowData.id);
          await reloadAccountsGrid(document.getElementById('accountsTable'));
          await reloadMasterTransactionsGrid(document.getElementById('transactionsTable'));
          document.dispatchEvent(new CustomEvent('forecast:accountsUpdated'));
        },
        { confirmMessage: (rowData) => `Delete account: ${rowData.name}?` }
      ),
      createTextColumn('Account Name', 'name', { widthGrow: 2, editor: "input", editable: true }),
      {
        title: 'Type',
        field: 'type',
        minWidth: 120,
        widthGrow: 1,
        formatter: function (cell) {
          const value = cell.getValue();
          return value?.name || '';
        },
        editor: 'list',
        editable: true,
        editorParams: {
          values: lookupData.accountTypes.map((t) => ({ label: t.name, value: t })),
          listItemFormatter: function (value, title) {
            return title;
          }
        }
      },
      createMoneyColumn('Starting Balance', 'startingBalance', { widthGrow: 1, editor: "input", editable: true })
    ];
  }

  // DETAIL columns - full feature set
  const columns = [
    createDuplicateColumn(
      async (cell) => {
        const currentScenario = scenarioState?.get?.();
        if (!currentScenario) return;

        const rowData = cell.getRow().getData();
        const allAccounts = await AccountManager.getAll(currentScenario.id);
        const source = allAccounts.find((a) => a.id === rowData.id) || rowData;

        const { id, accountType, periodicChangeSummary, ...payload } = JSON.parse(JSON.stringify(source));
        await AccountManager.create(currentScenario.id, payload);

        await reloadAccountsGrid(document.getElementById('accountsTable'));
        await reloadMasterTransactionsGrid(document.getElementById('transactionsTable'));
        document.dispatchEvent(new CustomEvent('forecast:accountsUpdated'));
      },
      { headerTooltip: 'Duplicate Account' }
    ),
    createDeleteColumn(
      async (cell) => {
        const currentScenario = scenarioState?.get?.();
        const rowData = cell.getRow().getData();
        await AccountManager.remove(currentScenario.id, rowData.id);
        await reloadAccountsGrid(document.getElementById('accountsTable'));
        await reloadMasterTransactionsGrid(document.getElementById('transactionsTable'));
        document.dispatchEvent(new CustomEvent('forecast:accountsUpdated'));
      },
      { confirmMessage: (rowData) => `Delete account: ${rowData.name}?` }
    ),
    createTextColumn('Account Name', 'name', { widthGrow: 2 }),
    {
      title: 'Type',
      field: 'type',
      minWidth: 120,
      widthGrow: 1,
      formatter: function (cell) {
        const value = cell.getValue();
        return value?.name || '';
      },
      editor: 'list',
      editorParams: {
        values: lookupData.accountTypes.map((t) => ({ label: t.name, value: t })),
        listItemFormatter: function (value, title) {
          return title;
        }
      }
    },
    createMoneyColumn('Starting Balance', 'startingBalance', { widthGrow: 1 })
  ];

  if (workflowConfig && workflowConfig.showGeneratePlan) {
    columns.push(
      createMoneyColumn('Goal Amount', 'goalAmount', {
        widthGrow: 1,
        bottomCalc: null
      })
    );
    columns.push(createDateColumn('Goal Date', 'goalDate', { widthGrow: 1 }));
  }

  columns.push({
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
        const currentScenario = scenarioState?.get?.();

        const allAccts = await AccountManager.getAll(currentScenario.id);
        const acctIndex = allAccts.findIndex((ac) => ac.id === rowData.id);
        if (acctIndex >= 0) {
          allAccts[acctIndex].periodicChange = newPeriodicChange;
          await AccountManager.saveAll(currentScenario.id, allAccts);
          await reloadAccountsGrid(document.getElementById('accountsTable'));
        }
      });
    }
  });

  if (workflowConfig?.supportsPeriodicChangeSchedule) {
    columns.push({
      title: 'Periodic Change Schedule',
      field: 'periodicChangeScheduleSummary',
      minWidth: 210,
      widthGrow: 1.2,
      formatter: function (cell) {
        const summary = cell.getValue() || 'None';
        const icon =
          '<svg class="periodic-change-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3h-2v8h-8v2h8v8h2v-8h8v-2h-8V3z"/></svg>';
        return `<span class="periodic-change-cell">${icon}<span class="periodic-change-text">${summary}</span></span>`;
      },
      cellClick: function (e, cell) {
        const rowData = cell.getRow().getData();
        openPeriodicChangeScheduleModal(
          {
            basePeriodicChange: rowData.periodicChange ?? null,
            schedule: rowData.periodicChangeSchedule ?? []
          },
          async (newSchedule) => {
            const currentScenario = scenarioState?.get?.();
            const allAccts = await AccountManager.getAll(currentScenario.id);
            const acctIndex = allAccts.findIndex((ac) => ac.id === rowData.id);
            if (acctIndex >= 0) {
              allAccts[acctIndex].periodicChangeSchedule = newSchedule;
              await AccountManager.saveAll(currentScenario.id, allAccts);
              await reloadAccountsGrid(document.getElementById('accountsTable'));
            }
          }
        );
      }
    });
  }

  columns.push(createTextColumn('Description', 'description', { widthGrow: 2 }));

  columns.push({
    title: 'Tags',
    field: 'tags',
    minWidth: 150,
    widthGrow: 1.5,
    formatter: function (cell) {
      const tags = cell.getValue() || [];
      if (!Array.isArray(tags) || tags.length === 0) {
        return '<span class="text-secondary">No tags</span>';
      }
      return tags.map(tag => `<span class="tag-badge">${tag}</span>`).join('');
    },
    cellClick: function (e, cell) {
      const rowData = cell.getRow().getData();
      openTagEditorModal(rowData.tags || [], 'account', async (newTags) => {
        const currentScenario = scenarioState?.get?.();
        const allAccts = await AccountManager.getAll(currentScenario.id);
        const acctIndex = allAccts.findIndex((ac) => ac.id === rowData.id);
        if (acctIndex >= 0) {
          allAccts[acctIndex].tags = newTags;
          await AccountManager.saveAll(currentScenario.id, allAccts);
          await reloadAccountsGrid(document.getElementById('accountsTable'));
        }
      });
    }
  });

  return columns;
}

export async function loadAccountsGrid({
  container,
  scenarioState,
  getWorkflowConfig,
  reloadMasterTransactionsGrid,
  logger
}) {
  const currentScenario = scenarioState?.get?.();
  if (!currentScenario) {
    logger?.warn?.('[Forecast] loadAccountsGrid: No current scenario');
    return;
  }

  try {
    accountsGridState.capture(lastAccountsTable, {
      groupBy: '#account-grouping-select'
    });
  } catch (_) {
    // Keep existing behavior: ignore state capture errors.
  }

  const workflowConfig = getWorkflowConfig?.();

  if (!workflowConfig?.showAccounts) {
    container.innerHTML = '';
    return;
  }

  // Keep the grid container stable to reduce scroll jumps.
  const existingToolbars = container.querySelectorAll(':scope > .grid-toolbar');
  existingToolbars.forEach((el) => el.remove());

  try {
    let gridContainer = container.querySelector('#accountsGrid');
    if (!gridContainer) {
      gridContainer = document.createElement('div');
      gridContainer.id = 'accountsGrid';
      gridContainer.className = 'grid-container accounts-grid';
      window.add(container, gridContainer);
    }

    const accounts = await AccountManager.getAll(currentScenario.id);
    const displayAccounts = accounts.filter((a) => a.name !== 'Select Account');

    const lookupData = await loadLookup('lookup-data.json');

    const existingAccountAdds = container.querySelectorAll('.btn-add');
    existingAccountAdds.forEach((el) => el.remove());

    const toolbar = document.createElement('div');
    toolbar.className = 'grid-toolbar';

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'toolbar-item';

    let accountsTable = lastAccountsTable;

    const addButton = document.createElement('button');
    addButton.className = 'btn btn-primary';
    addButton.textContent = '+ Add New';
    addButton.addEventListener('click', async () => {
      const scenario = scenarioState?.get?.();

      const data = await AccountManager.create(scenario.id, {
        name: 'New Account',
        type: null,
        currency: null,
        startingBalance: 0
      });
      const updatedScenario = data.scenarios.find((s) => s.id === scenario.id);
      const newAccount = updatedScenario.accounts[updatedScenario.accounts.length - 1];

      if (!scenario.accounts) scenario.accounts = [];
      scenario.accounts.push(newAccount);

      if (accountsTable) {
        const rowData = {
          ...newAccount,
          accountType: newAccount.type?.name || 'Unknown'
        };
        accountsTable.addRow(rowData, false);
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

        await loadAccountsGrid({
          container,
          scenarioState,
          getWorkflowConfig,
          reloadMasterTransactionsGrid,
          logger
        });
      } catch (err) {
        notifyError('Failed to refresh accounts: ' + (err?.message || String(err)));
      } finally {
        if (refreshButton.isConnected) {
          refreshButton.textContent = prevText;
          refreshButton.disabled = false;
        }
      }
    });
    window.add(buttonContainer, refreshButton);

    const modeToggleButton = document.createElement('button');
    modeToggleButton.className = 'btn';
    modeToggleButton.id = 'accounts-grid-mode-toggle';
    modeToggleButton.textContent = accountsGridMode === 'summary' ? 'Detail View' : 'Summary View';
    modeToggleButton.addEventListener('click', async () => {
      accountsGridMode = accountsGridMode === 'summary' ? 'detail' : 'summary';
      try {
        await loadAccountsGrid({
          container,
          scenarioState,
          getWorkflowConfig,
          reloadMasterTransactionsGrid,
          logger
        });
      } catch (err) {
        notifyError('Failed to toggle grid view: ' + (err?.message || String(err)));
      }
    });
    window.add(buttonContainer, modeToggleButton);
    window.add(toolbar, buttonContainer);

    const accountGroupingControl = document.createElement('div');
    accountGroupingControl.className = 'toolbar-item grouping-control';
    accountGroupingControl.innerHTML = `
      <label for="account-grouping-select" class="text-muted control-label">Group By:</label>
      <select id="account-grouping-select" class="input-select control-select">
        <option value="">None</option>
        <option value="accountType">Type</option>
      </select>
    `;
    window.add(toolbar, accountGroupingControl);

    // Insert toolbar above the grid so it doesn't jump to the bottom on refresh.
    container.insertBefore(toolbar, gridContainer);

    const enrichedAccounts = await Promise.all(
      displayAccounts.map(async (a) => ({
        ...a,
        accountType: a.type?.name || 'Unknown',
        periodicChangeSummary: await getPeriodicChangeDescription(a.periodicChange),
        periodicChangeScheduleSummary:
          Array.isArray(a.periodicChangeSchedule) && a.periodicChangeSchedule.length
            ? `${a.periodicChangeSchedule.length} scheduled change${a.periodicChangeSchedule.length === 1 ? '' : 's'}`
            : 'None'
      }))
    );

    const columns = buildAccountsGridColumns({
      mode: accountsGridMode,
      lookupData,
      workflowConfig,
      scenarioState,
      reloadAccountsGrid: (nextContainer) =>
        loadAccountsGrid({
          container: nextContainer,
          scenarioState,
          getWorkflowConfig,
          reloadMasterTransactionsGrid,
          logger
        }),
      reloadMasterTransactionsGrid,
      logger
    });

    const workflowIdForKey = workflowConfig?.id ?? 'unknown';
    const columnsKey = `accounts-${workflowIdForKey}-${workflowConfig?.showGeneratePlan ? 'with-plan' : 'base'}`;
    const shouldRebuildTable =
      !accountsTable ||
      accountsTable?.element !== gridContainer ||
      accountsTable?.__ftrackColumnsKey !== columnsKey;

    if (shouldRebuildTable) {
      try {
        accountsTable?.destroy?.();
      } catch (_) {
        // ignore
      }

      accountsTable = await createGrid(gridContainer, {
        data: enrichedAccounts,
        columns,
        cellEdited: async function (cell) {
          const account = cell.getRow().getData();
          try {
            if (account.type && typeof account.type !== 'object') {
              const foundType = lookupData.accountTypes.find((t) => t.id == account.type);
              if (foundType) account.type = foundType;
            }
            if (account.currency && typeof account.currency !== 'object') {
              const foundCurrency = lookupData.currencies.find((c) => c.id == account.currency);
              if (foundCurrency) account.currency = foundCurrency;
            }
          } catch (e) {
            logger?.error?.('[Forecast] Failed to normalize account object before save', e);
          }

          const scenario = scenarioState?.get?.();
          await AccountManager.update(scenario.id, account.id, account);
          document.dispatchEvent(new CustomEvent('forecast:accountsUpdated'));
        }
      });

      accountsTable.__ftrackColumnsKey = columnsKey;
    } else {
      await refreshGridData(accountsTable, enrichedAccounts);
    }

    const accountGroupingSelect = document.getElementById('account-grouping-select');
    if (accountGroupingSelect) {
      accountGroupingSelect.addEventListener('change', (e) => {
        const groupField = e.target.value;
        if (groupField) {
          accountsTable.setGroupBy(groupField);
          accountsTable.setGroupHeader((value, count, data, group) => {
            return `${value} (${count} items)`;
          });
        } else {
          accountsTable.setGroupBy(false);
        }
      });
    }

    lastAccountsTable = accountsTable;

    // Wait for table to be built before restoring state
    accountsTable.on('tableBuilt', () => {
      try {
        accountsGridState.restore(accountsTable, { restoreGroupBy: false });
        accountsGridState.restoreDropdowns({
          groupBy: '#account-grouping-select'
        });
      } catch (_) {
        // Keep existing behavior: ignore state restore errors.
      }
    });
  } catch (err) {
    logger?.error?.('[Forecast] Failed to load accounts grid:', err);
  }
}

export async function refreshAccountsGrid(args) {
  return loadAccountsGrid(args);
}
