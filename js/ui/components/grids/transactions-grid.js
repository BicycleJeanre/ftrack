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
import * as DataService from '../../../app/services/data-service.js';
import { formatCurrency } from '../../../shared/format-utils.js';

const {
  getScenario,
  getTransactions,
  createTransaction,
  createAccount,
  getScenarioPeriods
} = DataService;

const transactionsGridState = new GridStateManager('transactions');

function renderTransactionsRowDetails({ row, rowData }) {
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
  addField('Recurrence', rowData?.recurrenceSummary || rowData?.recurrenceDescription);
  addField('Periodic Change', rowData?.periodicChangeSummary);

  const tagsField = document.createElement('div');
  tagsField.className = 'grid-detail-field';
  const tagsLabel = document.createElement('label');
  tagsLabel.className = 'grid-detail-label';
  tagsLabel.textContent = 'Tags';
  const tagsValue = document.createElement('div');
  tagsValue.className = 'grid-detail-tags';
  const tags = rowData?.tags || [];
  if (!Array.isArray(tags) || tags.length === 0) {
    tagsValue.textContent = '—';
  } else {
    tagsValue.innerHTML = tags.map(tag => `<span class="tag-badge">${tag}</span>`).join('');
  }
  tagsField.appendChild(tagsLabel);
  tagsField.appendChild(tagsValue);
  grid.appendChild(tagsField);

  detailsEl.appendChild(grid);
}

function renderTransactionsSummaryList({
  container,
  transactions,
  accounts,
  onRefresh
}) {
  container.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'grid-summary-list';
  container.appendChild(list);

  if (!transactions || transactions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'scenarios-list-placeholder';
    empty.textContent = 'No transactions yet. Switch to Detail to add a transaction.';
    list.appendChild(empty);
    return;
  }

  const findAccountName = (id) => (accounts || []).find((a) => Number(a.id) === Number(id))?.name || 'Unassigned';

  transactions.forEach((tx) => {
    const card = document.createElement('div');
    card.className = 'grid-summary-card';

    const content = document.createElement('div');
    content.className = 'grid-summary-content';

    const title = document.createElement('div');
    title.className = 'grid-summary-title';
    title.textContent = tx?.description || 'Untitled Transaction';

    const meta = document.createElement('div');
    meta.className = 'grid-summary-meta';

    const typeName = Number(tx.transactionTypeId) === 1 ? 'Money In' : 'Money Out';
    const signedAmount = Number(tx.amount || 0) * (Number(tx.transactionTypeId) === 1 ? 1 : -1);
    const amount = document.createElement('span');
    amount.className = 'grid-summary-amount';
    amount.textContent = formatCurrency(Math.abs(signedAmount), 'ZAR');
    if (signedAmount < 0) amount.classList.add('negative');

    const date = document.createElement('span');
    date.className = 'grid-summary-date';
    date.textContent = tx?.effectiveDate || 'No date';

    const accountsLabel = document.createElement('span');
    accountsLabel.className = 'grid-summary-accounts';
    accountsLabel.textContent = `${findAccountName(tx.primaryAccountId)} → ${findAccountName(tx.secondaryAccountId)}`;

    const type = document.createElement('span');
    type.className = 'grid-summary-type';
    type.textContent = typeName;

    meta.appendChild(amount);
    meta.appendChild(date);
    meta.appendChild(type);
    meta.appendChild(accountsLabel);

    content.appendChild(title);
    content.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'grid-summary-actions';

    const duplicateBtn = document.createElement('button');
    duplicateBtn.className = 'icon-btn';
    duplicateBtn.title = 'Duplicate Transaction';
    duplicateBtn.textContent = '📋';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn';
    deleteBtn.title = 'Delete Transaction';
    deleteBtn.textContent = '🗑️';

    actions.appendChild(duplicateBtn);
    actions.appendChild(deleteBtn);

    const form = document.createElement('div');
    form.className = 'grid-summary-form';
    form.style.display = 'none';

    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'grid-summary-input';
    descInput.value = tx?.description || '';

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.step = '0.01';
    amountInput.className = 'grid-summary-input';
    amountInput.value = Number(tx?.amount || 0);

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'grid-summary-input';
    dateInput.value = tx?.effectiveDate || '';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'grid-summary-input';
    typeSelect.innerHTML = `
      <option value="1">Money In</option>
      <option value="2">Money Out</option>
    `;
    typeSelect.value = String(tx?.transactionTypeId || 2);

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
    addField('Type', typeSelect);
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
      descInput.value = tx?.description || '';
      amountInput.value = Number(tx?.amount || 0);
      dateInput.value = tx?.effectiveDate || '';
      typeSelect.value = String(tx?.transactionTypeId || 2);
      exitEdit();
    });

    saveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const scenario = tx?._scenarioId;
      if (!scenario) return;
      const allTxs = await getTransactions(scenario);
      const idx = allTxs.findIndex((t) => Number(t.id) === Number(tx.id));
      if (idx === -1) return;

      allTxs[idx] = {
        ...allTxs[idx],
        description: descInput.value.trim(),
        amount: Math.abs(Number(amountInput.value || 0)),
        effectiveDate: dateInput.value || allTxs[idx].effectiveDate,
        transactionTypeId: Number(typeSelect.value || 2)
      };

      await TransactionManager.saveAll(scenario, allTxs);
      await onRefresh?.();
    });

    duplicateBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const scenario = tx?._scenarioId;
      if (!scenario) return;
      const allTxs = await getTransactions(scenario);
      const source = allTxs.find((t) => Number(t.id) === Number(tx.id));
      if (!source) return;
      const cloned = { ...source, id: 0 };
      allTxs.push(cloned);
      await TransactionManager.saveAll(scenario, allTxs);
      await onRefresh?.();
    });

    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const scenario = tx?._scenarioId;
      if (!scenario) return;
      const confirmed = confirm('Delete this transaction?');
      if (!confirmed) return;
      const allTxs = await getTransactions(scenario);
      const filtered = allTxs.filter((t) => Number(t.id) !== Number(tx.id));
      await TransactionManager.saveAll(scenario, filtered);
      await onRefresh?.();
    });

    card.appendChild(content);
    card.appendChild(actions);
    card.appendChild(form);

    list.appendChild(card);
  });
}

export async function loadMasterTransactionsGrid({
  container,
  scenarioState,
  getWorkflowConfig,
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

  const workflowConfig = getWorkflowConfig?.();

  if (!workflowConfig?.showPlannedTransactions) {
    container.innerHTML = '';
    return;
  }

  const transactionsSection = container.closest('.forecast-card');
  const transactionsHeader = transactionsSection?.querySelector(':scope > .card-header');
  if (transactionsHeader) {
    const controls = transactionsHeader.querySelector('.card-header-controls');
    if (controls) {
      controls.innerHTML = '';
      // View toggle removed: transactions should always render summary in base grids.
      const addButton = document.createElement('button');
      addButton.className = 'icon-btn';
      addButton.title = 'Add Transaction';
      addButton.textContent = '+';

      const refreshButton = document.createElement('button');
      refreshButton.className = 'icon-btn';
      refreshButton.title = 'Refresh Transactions';
      refreshButton.textContent = '⟳';

      controls.appendChild(addButton);
      controls.appendChild(refreshButton);

      addButton.addEventListener('click', async (e) => {
        e.stopPropagation();
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
            : (currentScenario?.projection?.config?.startDate || formatDateOnly(new Date()));

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

          await loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
        } catch (err) {
          notifyError('Failed to create transaction. Please try again.');
        }
      });

      refreshButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        const prevText = refreshButton.textContent;
        try {
          refreshButton.textContent = '...';
          refreshButton.disabled = true;
          const refreshed = await getScenario(currentScenario.id);
          scenarioState?.set?.(refreshed);
          await loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
        } catch (err) {
          notifyError('Failed to refresh transactions: ' + (err?.message || String(err)));
        } finally {
          if (refreshButton.isConnected) {
            refreshButton.textContent = prevText;
            refreshButton.disabled = false;
          }
        }
      });
    }
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

  gridContainer.classList.remove('grid-detail');

  try {
    try {
      const existingTable = tables?.getMasterTransactionsTable?.();
      existingTable?.destroy?.();
      tables?.setMasterTransactionsTable?.(null);
    } catch (_) {
      // ignore
    }

    const actualPeriodType = state?.getActualPeriodType?.();
    const actualPeriod = state?.getActualPeriod?.();
    let periods = state?.getPeriods?.();
    if (!periods || periods.length === 0) {
      periods = await getScenarioPeriods(currentScenario.id, actualPeriodType);
      state?.setPeriods?.(periods);
    }

    let allTransactions = await getTransactions(currentScenario.id);
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

    const accountFilterId = state?.getTransactionFilterAccountId?.();
    if (accountFilterId) {
      allTransactions = allTransactions.filter((tx) =>
        Number(tx.primaryAccountId) === Number(accountFilterId) ||
        Number(tx.secondaryAccountId) === Number(accountFilterId)
      );
    }

    allTransactions = allTransactions.map((tx) => ({
      ...normalizeCanonicalTransaction(tx),
      _scenarioId: currentScenario.id
    }));

    renderTransactionsSummaryList({
      container: gridContainer,
      transactions: allTransactions,
      accounts: currentScenario.accounts || [],
      onRefresh: async () => {
        await loadMasterTransactionsGrid({
          container,
          scenarioState,
          getWorkflowConfig,
          state,
          tables,
          callbacks,
          logger
        });
      }
    });
  } catch (err) {
    // Keep existing behavior: errors are swallowed here.
  }
}
