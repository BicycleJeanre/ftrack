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
import { formatCurrency } from '../../../shared/format-utils.js';

const accountsGridState = new GridStateManager('accounts');
let lastAccountsTable = null;
// Removed accountsGridMode: always summary in base grid.

function sanitizeAccountPayload(account) {
  if (!account || typeof account !== 'object') return account;
  const { _detailsOpen, ...payload } = account;
  return payload;
}

function createDetailField({ label, inputEl }) {
  const field = document.createElement('div');
  field.className = 'accounts-detail-field';

  const labelEl = document.createElement('label');
  labelEl.className = 'accounts-detail-label';
  labelEl.textContent = label;

  field.appendChild(labelEl);
  field.appendChild(inputEl);

  return field;
}

function renderAccountsRowDetails({
  row,
  rowData,
  lookupData,
  workflowConfig,
  scenarioState,
  reloadAccountsGrid,
  logger
}) {
  const rowEl = row.getElement();
  if (!rowEl) return;

  let detailsEl = rowEl.querySelector('.accounts-row-details');
  if (!detailsEl) {
    detailsEl = document.createElement('div');
    detailsEl.className = 'accounts-row-details';
    rowEl.appendChild(detailsEl);
  }

  if (!rowData?._detailsOpen) {
    detailsEl.style.display = 'none';
    detailsEl.innerHTML = '';
    rowEl.classList.remove('accounts-row-expanded');
    return;
  }

  detailsEl.style.display = 'block';
  detailsEl.innerHTML = '';
  rowEl.classList.add('accounts-row-expanded');

  const grid = document.createElement('div');
  grid.className = 'accounts-row-details-grid';

  const typeSelect = createAccountTypeSelect({
    lookupData,
    currentValue: rowData?.type || null
  });
  typeSelect.addEventListener('change', async () => {
    const scenario = scenarioState?.get?.();
    if (!scenario) return;
    const nextTypeId = typeSelect.value;
    const nextType = (lookupData?.accountTypes || []).find((type) => String(type.id) === String(nextTypeId)) || null;
    try {
      await AccountManager.update(scenario.id, rowData.id, { type: nextType });
      row.update({ type: nextType, accountType: nextType?.name || 'Unknown' });
    } catch (err) {
      logger?.error?.('[AccountsGrid] Failed to update type', err);
    }
  });
  grid.appendChild(createDetailField({ label: 'Type', inputEl: typeSelect }));

  const startingBalanceInput = document.createElement('input');
  startingBalanceInput.type = 'number';
  startingBalanceInput.step = '0.01';
  startingBalanceInput.className = 'accounts-detail-input';
  startingBalanceInput.value = rowData?.startingBalance ?? 0;
  startingBalanceInput.addEventListener('blur', async () => {
    const scenario = scenarioState?.get?.();
    if (!scenario) return;
    const nextBalance = Number(startingBalanceInput.value || 0);
    try {
      await AccountManager.update(scenario.id, rowData.id, {
        startingBalance: Number.isNaN(nextBalance) ? 0 : nextBalance
      });
      row.update({ startingBalance: Number.isNaN(nextBalance) ? 0 : nextBalance });
    } catch (err) {
      logger?.error?.('[AccountsGrid] Failed to update starting balance', err);
    }
  });
  grid.appendChild(createDetailField({ label: 'Starting Balance', inputEl: startingBalanceInput }));

  const descriptionInput = document.createElement('input');
  descriptionInput.type = 'text';
  descriptionInput.className = 'accounts-detail-input';
  descriptionInput.value = rowData?.description || '';
  descriptionInput.placeholder = 'Add a description';
  descriptionInput.addEventListener('blur', async () => {
    const nextValue = descriptionInput.value.trim();
    if (nextValue === (rowData?.description || '')) return;
    const scenario = scenarioState?.get?.();
    if (!scenario) return;
    try {
      await AccountManager.update(scenario.id, rowData.id, { description: nextValue });
      row.update({ description: nextValue });
    } catch (err) {
      logger?.error?.('[AccountsGrid] Failed to update description', err);
    }
  });
  grid.appendChild(createDetailField({ label: 'Description', inputEl: descriptionInput }));

  if (workflowConfig?.showGeneratePlan) {
    const goalAmountInput = document.createElement('input');
    goalAmountInput.type = 'number';
    goalAmountInput.step = '0.01';
    goalAmountInput.className = 'accounts-detail-input';
    goalAmountInput.value = rowData?.goalAmount ?? '';
    goalAmountInput.placeholder = '0.00';

    const goalDateInput = document.createElement('input');
    goalDateInput.type = 'date';
    goalDateInput.className = 'accounts-detail-input';
    goalDateInput.value = rowData?.goalDate || '';

    const saveGoal = async () => {
      const scenario = scenarioState?.get?.();
      if (!scenario) return;

      const nextGoalAmountRaw = goalAmountInput.value;
      const nextGoalAmount = nextGoalAmountRaw === '' ? null : Number(nextGoalAmountRaw);
      const nextGoalDate = goalDateInput.value || null;

      try {
        await AccountManager.update(scenario.id, rowData.id, {
          goalAmount: Number.isNaN(nextGoalAmount) ? null : nextGoalAmount,
          goalDate: nextGoalDate
        });
        row.update({
          goalAmount: Number.isNaN(nextGoalAmount) ? null : nextGoalAmount,
          goalDate: nextGoalDate
        });
      } catch (err) {
        logger?.error?.('[AccountsGrid] Failed to update goal fields', err);
      }
    };

    goalAmountInput.addEventListener('blur', saveGoal);
    goalDateInput.addEventListener('blur', saveGoal);

    grid.appendChild(createDetailField({ label: 'Goal Amount', inputEl: goalAmountInput }));
    grid.appendChild(createDetailField({ label: 'Goal Date', inputEl: goalDateInput }));
  }

  const tagsField = document.createElement('div');
  tagsField.className = 'accounts-detail-field';
  const tagsLabel = document.createElement('label');
  tagsLabel.className = 'accounts-detail-label';
  tagsLabel.textContent = 'Tags';
  const tagsValue = document.createElement('div');
  tagsValue.className = 'accounts-detail-tags';
  const renderTags = (tags = []) => {
    tagsValue.innerHTML = '';
    if (!Array.isArray(tags) || tags.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'text-secondary';
      empty.textContent = 'No tags';
      tagsValue.appendChild(empty);
      return;
    }
    tags.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'tag-badge';
      chip.textContent = tag;
      tagsValue.appendChild(chip);
    });
  };
  renderTags(rowData?.tags || []);

  const tagsButton = document.createElement('button');
  tagsButton.className = 'btn accounts-detail-btn';
  tagsButton.textContent = 'Edit Tags';
  tagsButton.addEventListener('click', () => {
    openTagEditorModal(rowData?.tags || [], 'account', async (newTags) => {
      const scenario = scenarioState?.get?.();
      if (!scenario) return;
      try {
        await AccountManager.update(scenario.id, rowData.id, { tags: newTags });
        row.update({ tags: newTags });
        renderTags(newTags);
      } catch (err) {
        logger?.error?.('[AccountsGrid] Failed to update tags', err);
      }
    });
  });

  tagsField.appendChild(tagsLabel);
  tagsField.appendChild(tagsValue);
  tagsField.appendChild(tagsButton);
  grid.appendChild(tagsField);

  const periodicField = document.createElement('div');
  periodicField.className = 'accounts-detail-field';
  const periodicLabel = document.createElement('label');
  periodicLabel.className = 'accounts-detail-label';
  periodicLabel.textContent = 'Periodic Change';
  const periodicValue = document.createElement('div');
  periodicValue.className = 'accounts-detail-value';
  periodicValue.textContent = rowData?.periodicChangeSummary || 'None';

  const periodicButton = document.createElement('button');
  periodicButton.className = 'btn accounts-detail-btn';
  periodicButton.textContent = 'Edit Periodic Change';
  periodicButton.addEventListener('click', () => {
    openPeriodicChangeModal(rowData?.periodicChange, async (newPeriodicChange) => {
      const scenario = scenarioState?.get?.();
      if (!scenario) return;
      try {
        const summary = await getPeriodicChangeDescription(newPeriodicChange);
        await AccountManager.update(scenario.id, rowData.id, {
          periodicChange: newPeriodicChange
        });
        row.update({
          periodicChange: newPeriodicChange,
          periodicChangeSummary: summary
        });
        periodicValue.textContent = summary || 'None';
      } catch (err) {
        logger?.error?.('[AccountsGrid] Failed to update periodic change', err);
      }
    });
  });

  periodicField.appendChild(periodicLabel);
  periodicField.appendChild(periodicValue);
  periodicField.appendChild(periodicButton);
  grid.appendChild(periodicField);

  if (workflowConfig?.supportsPeriodicChangeSchedule) {
    const scheduleField = document.createElement('div');
    scheduleField.className = 'accounts-detail-field';
    const scheduleLabel = document.createElement('label');
    scheduleLabel.className = 'accounts-detail-label';
    scheduleLabel.textContent = 'Periodic Change Schedule';
    const scheduleValue = document.createElement('div');
    scheduleValue.className = 'accounts-detail-value';
    scheduleValue.textContent = rowData?.periodicChangeScheduleSummary || 'None';

    const scheduleButton = document.createElement('button');
    scheduleButton.className = 'btn accounts-detail-btn';
    scheduleButton.textContent = 'Edit Schedule';
    scheduleButton.addEventListener('click', () => {
      openPeriodicChangeScheduleModal(
        {
          basePeriodicChange: rowData?.periodicChange ?? null,
          schedule: rowData?.periodicChangeSchedule ?? []
        },
        async (newSchedule) => {
          const scenario = scenarioState?.get?.();
          if (!scenario) return;
          try {
            const nextSummary =
              Array.isArray(newSchedule) && newSchedule.length
                ? `${newSchedule.length} scheduled change${newSchedule.length === 1 ? '' : 's'}`
                : 'None';
            await AccountManager.update(scenario.id, rowData.id, {
              periodicChangeSchedule: newSchedule
            });
            row.update({
              periodicChangeSchedule: newSchedule,
              periodicChangeScheduleSummary: nextSummary
            });
            scheduleValue.textContent = nextSummary;
          } catch (err) {
            logger?.error?.('[AccountsGrid] Failed to update periodic change schedule', err);
          }
        }
      );
    });

    scheduleField.appendChild(scheduleLabel);
    scheduleField.appendChild(scheduleValue);
    scheduleField.appendChild(scheduleButton);
    grid.appendChild(scheduleField);
  }

  detailsEl.appendChild(grid);
}

function createAccountTypeSelect({ lookupData, currentValue }) {
  const select = document.createElement('select');
  select.className = 'accounts-detail-input';

  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = 'Select type';
  select.appendChild(emptyOption);

  (lookupData?.accountTypes || []).forEach((type) => {
    const option = document.createElement('option');
    option.value = String(type.id);
    option.textContent = type.name;
    if (currentValue && String(currentValue.id) === String(type.id)) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  return select;
}

function renderAccountsSummaryList({
  container,
  accounts,
  lookupData,
  scenarioState,
  reloadAccountsGrid,
  logger
}) {
  container.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'accounts-summary-list';
  container.appendChild(list);

  if (!accounts || accounts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'scenarios-list-placeholder';
    empty.textContent = 'No accounts yet. Click + Add New to create your first account.';
    list.appendChild(empty);
    return;
  }

  accounts.forEach((account) => {
    const card = document.createElement('div');
    card.className = 'account-card';

    const content = document.createElement('div');
    content.className = 'account-card-content';

    const nameEl = document.createElement('div');
    nameEl.className = 'account-card-name';
    nameEl.textContent = account?.name || 'Untitled';

    const meta = document.createElement('div');
    meta.className = 'account-card-meta';

    const typeEl = document.createElement('span');
    typeEl.className = 'account-card-type';
    typeEl.textContent = account?.type?.name || 'Unspecified';

    const balanceEl = document.createElement('span');
    balanceEl.className = 'account-card-balance';
    const currency = account?.currency?.code || account?.currency?.name || 'ZAR';
    balanceEl.textContent = formatCurrency(Number(account?.startingBalance || 0), currency);

    meta.appendChild(typeEl);
    meta.appendChild(balanceEl);

    content.appendChild(nameEl);
    content.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'account-card-actions';

    const duplicateBtn = document.createElement('button');
    duplicateBtn.className = 'icon-btn';
    duplicateBtn.title = 'Duplicate Account';
    duplicateBtn.textContent = '📋';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn';
    deleteBtn.title = 'Delete Account';
    deleteBtn.textContent = '🗑️';

    actions.appendChild(duplicateBtn);
    actions.appendChild(deleteBtn);

    const form = document.createElement('div');
    form.className = 'account-card-form';
    form.style.display = 'none';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'accounts-detail-input';
    nameInput.value = account?.name || '';

    const typeSelect = createAccountTypeSelect({
      lookupData,
      currentValue: account?.type || null
    });

    const balanceInput = document.createElement('input');
    balanceInput.type = 'number';
    balanceInput.step = '0.01';
    balanceInput.className = 'accounts-detail-input';
    balanceInput.value = account?.startingBalance ?? 0;

    const formActions = document.createElement('div');
    formActions.className = 'account-card-form-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.textContent = 'Cancel';

    formActions.appendChild(saveBtn);
    formActions.appendChild(cancelBtn);

    form.appendChild(createDetailField({ label: 'Name', inputEl: nameInput }));
    form.appendChild(createDetailField({ label: 'Type', inputEl: typeSelect }));
    form.appendChild(createDetailField({ label: 'Starting Balance', inputEl: balanceInput }));
    form.appendChild(formActions);

    const enterEditMode = () => {
      form.style.display = 'grid';
      content.style.display = 'none';
      actions.style.display = 'none';
    };

    const exitEditMode = () => {
      form.style.display = 'none';
      content.style.display = 'block';
      actions.style.display = 'flex';
    };

    duplicateBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const scenario = scenarioState?.get?.();
      if (!scenario) return;
      try {
        const allAccounts = await AccountManager.getAll(scenario.id);
        const source = allAccounts.find((a) => a.id === account.id) || account;
        const { id, accountType, periodicChangeSummary, ...payload } = JSON.parse(JSON.stringify(source));
        await AccountManager.create(scenario.id, payload);

        await reloadAccountsGrid(document.getElementById('accountsTable'));
        document.dispatchEvent(new CustomEvent('forecast:accountsUpdated'));
      } catch (err) {
        logger?.error?.('[AccountsGrid] Failed to duplicate account', err);
      }
    });

    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const scenario = scenarioState?.get?.();
      if (!scenario) return;
      const confirmed = confirm(`Delete account: ${account?.name || 'Untitled'}?`);
      if (!confirmed) return;
      try {
        await AccountManager.remove(scenario.id, account.id);
        await reloadAccountsGrid(document.getElementById('accountsTable'));
        document.dispatchEvent(new CustomEvent('forecast:accountsUpdated'));
      } catch (err) {
        logger?.error?.('[AccountsGrid] Failed to delete account', err);
      }
    });

    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      nameInput.value = account?.name || '';
      if (account?.type?.id != null) {
        typeSelect.value = String(account.type.id);
      } else {
        typeSelect.value = '';
      }
      balanceInput.value = account?.startingBalance ?? 0;
      exitEditMode();
    });

    saveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const scenario = scenarioState?.get?.();
      if (!scenario) return;

      const nextName = nameInput.value.trim() || 'Untitled';
      const nextBalance = Number(balanceInput.value || 0);
      const nextTypeId = typeSelect.value;
      const nextType = (lookupData?.accountTypes || []).find((type) => String(type.id) === String(nextTypeId)) || null;

      try {
        await AccountManager.update(scenario.id, account.id, {
          name: nextName,
          type: nextType,
          startingBalance: Number.isNaN(nextBalance) ? 0 : nextBalance
        });

        account.name = nextName;
        account.type = nextType;
        account.startingBalance = Number.isNaN(nextBalance) ? 0 : nextBalance;

        nameEl.textContent = account?.name || 'Untitled';
        typeEl.textContent = account?.type?.name || 'Unspecified';
        balanceEl.textContent = formatCurrency(Number(account?.startingBalance || 0), currency);

        exitEditMode();
      } catch (err) {
        logger?.error?.('[AccountsGrid] Failed to update account from summary list', err);
      }
    });

    card.appendChild(content);
    card.appendChild(actions);
    card.appendChild(form);

    card.addEventListener('click', (e) => {
      if (form.style.display === 'grid') return;
      if (e.target.closest('.icon-btn')) return;
      enterEditMode();
    });

    list.appendChild(card);
  });
}

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
      {
        title: '',
        field: '_detailsToggle',
        width: 44,
        hozAlign: 'center',
        headerSort: false,
        formatter: function (cell) {
          const isOpen = Boolean(cell.getRow().getData()?._detailsOpen);
          const icon = isOpen ? '▾' : '▸';
          return `<span class="accounts-row-toggle" aria-hidden="true">${icon}</span>`;
        },
        cellClick: function (e, cell) {
          const row = cell.getRow();
          const rowData = row.getData() || {};
          const nextState = !rowData._detailsOpen;
          row.update({ _detailsOpen: nextState });
          row.getTable()?.redraw?.(true);
        }
      },
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

  // DETAIL columns - streamlined set
  const columns = [
    {
      title: '',
      field: '_detailsToggle',
      width: 44,
      hozAlign: 'center',
      headerSort: false,
      formatter: function (cell) {
        const isOpen = Boolean(cell.getRow().getData()?._detailsOpen);
        const icon = isOpen ? '▾' : '▸';
        return `<span class="accounts-row-toggle" aria-hidden="true">${icon}</span>`;
      },
      cellClick: function (e, cell) {
        const row = cell.getRow();
        const rowData = row.getData() || {};
        const nextState = !rowData._detailsOpen;
        row.update({ _detailsOpen: nextState });
        row.getTable()?.redraw?.(true);
      }
    },
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
    createTextColumn('Account Name', 'name', { widthGrow: 2 })
  ];

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

  const accountsSection = container.closest('.forecast-card');
  const accountsHeader = accountsSection?.querySelector(':scope > .card-header');
  if (accountsHeader) {
    const controls = accountsHeader.querySelector('.card-header-controls');
    if (!controls) return;
    controls.innerHTML = '';

    // View toggle removed: accounts should always show the summary in base grids.

    const addButton = document.createElement('button');
    addButton.className = 'icon-btn';
    addButton.title = 'Add Account';
    addButton.textContent = '+';

    const refreshButton = document.createElement('button');
    refreshButton.className = 'icon-btn';
    refreshButton.title = 'Refresh Accounts';
    refreshButton.textContent = '⟳';

    controls.appendChild(addButton);
    controls.appendChild(refreshButton);

    // Detail-specific grouping removed from base accounts grid.

    addButton.addEventListener('click', async (e) => {
      e.stopPropagation();
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

      // Always reload in summary mode.
      await loadAccountsGrid({
        container,
        scenarioState,
        getWorkflowConfig,
        reloadMasterTransactionsGrid,
        logger
      });
      return;

      const rowData = {
        ...newAccount,
        accountType: newAccount.type?.name || 'Unknown'
      };
      lastAccountsTable.addRow(rowData, false);
    });

    refreshButton.addEventListener('click', async (e) => {
      e.stopPropagation();
      const prevText = refreshButton.textContent;
      try {
        refreshButton.textContent = '...';
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

    gridContainer.className = 'grid-container accounts-grid';

    const accounts = await AccountManager.getAll(currentScenario.id);
    const displayAccounts = accounts.filter((a) => a.name !== 'Select Account');

    const lookupData = await loadLookup('lookup-data.json');

    let accountsTable = lastAccountsTable;

    // Always summary mode in base grid.
      try {
        accountsTable?.destroy?.();
      } catch (_) {
        // ignore
      }
      accountsTable = null;
      lastAccountsTable = null;
      renderAccountsSummaryList({
        container: gridContainer,
        accounts: displayAccounts,
        lookupData,
        scenarioState,
        reloadAccountsGrid: (nextContainer) =>
          loadAccountsGrid({
            container: nextContainer,
            scenarioState,
            getWorkflowConfig,
            reloadMasterTransactionsGrid,
            logger
          }),
        logger
      });
      return;

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
      mode: 'summary',
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
    const columnsKey = `accounts-${workflowIdForKey}-summary-${workflowConfig?.showGeneratePlan ? 'with-plan' : 'base'}`;
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
        rowFormatter: (row) => {
          renderAccountsRowDetails({
            row,
            rowData: row.getData(),
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
            logger
          });
        },
        cellEdited: async function (cell) {
          const account = sanitizeAccountPayload(cell.getRow().getData());
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
