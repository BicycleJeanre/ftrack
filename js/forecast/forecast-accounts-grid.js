// forecast-accounts-grid.js
// Accounts grid loader extracted from forecast.js (no behavior change).

import * as AccountManager from '../managers/account-manager.js';
import { loadLookup } from '../lookup-loader.js';
import {
  createGrid,
  createDeleteColumn,
  createTextColumn,
  createMoneyColumn,
  createDateColumn
} from '../grid-factory.js';
import { openPeriodicChangeModal } from '../modal-periodic-change.js';
import { getPeriodicChangeDescription } from '../periodic-change-utils.js';
import { GridStateManager } from '../grid-state.js';

const accountsGridState = new GridStateManager('accounts');
let lastAccountsTable = null;

export function buildAccountsGridColumns({
  lookupData,
  typeConfig,
  scenarioState,
  reloadAccountsGrid,
  reloadMasterTransactionsGrid,
  logger
}) {
  const columns = [
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

  if (typeConfig && typeConfig.showGeneratePlan) {
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

  columns.push(createTextColumn('Description', 'description', { widthGrow: 2 }));

  return columns;
}

export async function loadAccountsGrid({
  container,
  scenarioState,
  getScenarioTypeConfig,
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

  const typeConfig = getScenarioTypeConfig?.();

  if (!currentScenario.type) {
    container.innerHTML =
      '<div class="empty-message">Please select a Scenario Type and Period Type in the scenario grid above to enable accounts.</div>';
    return;
  }

  if (!typeConfig?.showAccounts) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';

  try {
    const accounts = await AccountManager.getAll(currentScenario.id);
    const displayAccounts = accounts.filter((a) => a.name !== 'Select Account');

    const lookupData = await loadLookup('lookup-data.json');

    const existingAccountAdds = container.querySelectorAll('.btn-add');
    existingAccountAdds.forEach((el) => el.remove());

    const toolbar = document.createElement('div');
    toolbar.className = 'grid-toolbar';

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'toolbar-item';

    let accountsTable = null;

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
    window.add(container, toolbar);

    const gridContainer = document.createElement('div');
    gridContainer.id = 'accountsGrid';
    gridContainer.className = 'grid-container accounts-grid';

    const existingInner = container.querySelector('#accountsGrid');
    if (existingInner) existingInner.remove();

    const enrichedAccounts = await Promise.all(
      displayAccounts.map(async (a) => ({
        ...a,
        accountType: a.type?.name || 'Unknown',
        periodicChangeSummary: await getPeriodicChangeDescription(a.periodicChange)
      }))
    );

    window.add(container, gridContainer);

    accountsTable = await createGrid(gridContainer, {
      data: enrichedAccounts,
      columns: buildAccountsGridColumns({
        lookupData,
        typeConfig,
        scenarioState,
        reloadAccountsGrid: (nextContainer) =>
          loadAccountsGrid({
            container: nextContainer,
            scenarioState,
            getScenarioTypeConfig,
            reloadMasterTransactionsGrid,
            logger
          }),
        reloadMasterTransactionsGrid,
        logger
      }),
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

    try {
      accountsGridState.restore(accountsTable, { restoreGroupBy: false });
      accountsGridState.restoreDropdowns({
        groupBy: '#account-grouping-select'
      });
    } catch (_) {
      // Keep existing behavior: ignore state restore errors.
    }
  } catch (err) {
    logger?.error?.('[Forecast] Failed to load accounts grid:', err);
  }
}
