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
import { notifyError, confirmDialog } from '../../../shared/notifications.js';
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

  const visibleAccounts = (accounts || []).filter((a) => a.name !== 'Select Account');
  const findAccountName = (id) => visibleAccounts.find((a) => Number(a.id) === Number(id))?.name || 'Unassigned';

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

  transactions.forEach((tx) => {
    const card = document.createElement('div');
    card.className = 'grid-summary-card';

    const content = document.createElement('div');
    content.className = 'grid-summary-content';

    const typeName = Number(tx.transactionTypeId) === 1 ? 'Money In' : 'Money Out';
    const isMoneyOut = Number(tx.transactionTypeId) === 2;
    const primaryAcct = visibleAccounts.find((a) => Number(a.id) === Number(tx.primaryAccountId));
    const currency = primaryAcct?.currency?.code || primaryAcct?.currency?.name || 'ZAR';
    const unsignedAmt = Math.abs(Number(tx.amount || 0));
    const formattedAmt = formatCurrency(unsignedAmt, currency);
    const secondaryName = findAccountName(tx.secondaryAccountId);
    const primaryName = findAccountName(tx.primaryAccountId);

    // Header row: secondary account name (left) + type badge (right)
    const header = document.createElement('div');
    header.className = 'grid-summary-header';
    const title = document.createElement('div');
    title.className = 'grid-summary-title';
    title.textContent = secondaryName;
    const typeSpan = document.createElement('span');
    typeSpan.className = `grid-summary-type ${isMoneyOut ? 'money-out' : 'money-in'}`;
    typeSpan.textContent = typeName;
    header.appendChild(title);
    header.appendChild(typeSpan);

    // Amount value
    const amountEl = document.createElement('div');
    amountEl.className = 'grid-summary-amount';
    amountEl.textContent = formattedAmt;
    if (isMoneyOut) amountEl.classList.add('negative');

    // Subtitle: primary → amount → secondary flow
    const meta = document.createElement('div');
    meta.className = 'grid-summary-meta';
    const flowLabel = document.createElement('span');
    flowLabel.className = 'grid-summary-accounts';
    flowLabel.textContent = `${primaryName} → ${formattedAmt} → ${secondaryName}`;
    meta.appendChild(flowLabel);

    content.appendChild(header);
    content.appendChild(amountEl);
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

    // -- Basic fields --
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
    typeSelect.innerHTML = `<option value="1">Money In</option><option value="2">Money Out</option>`;
    typeSelect.value = String(tx?.transactionTypeId || 2);

    // -- Account selects --
    const secondaryAccountSelect = buildAccountSelect(tx?.secondaryAccountId, true);

    // -- Status --
    const statusName = typeof tx?.status === 'object' ? (tx.status?.name || 'planned') : (tx?.status || 'planned');
    const statusSelect = document.createElement('select');
    statusSelect.className = 'grid-summary-input';
    statusSelect.innerHTML = `<option value="planned">Planned</option><option value="actual">Actual</option>`;
    statusSelect.value = statusName;

    // -- Tags --
    const cardTags = [...(tx?.tags || [])];
    const tagsChipsEl = document.createElement('div');
    tagsChipsEl.className = 'tag-chips';
    const renderCardTags = () => {
      tagsChipsEl.innerHTML = '';
      if (cardTags.length === 0) {
        const emptyEl = document.createElement('span');
        emptyEl.className = 'text-secondary';
        emptyEl.textContent = 'No tags';
        tagsChipsEl.appendChild(emptyEl);
        return;
      }
      cardTags.forEach((tag, idx) => {
        const chip = document.createElement('span');
        chip.className = 'tag-badge';
        chip.innerHTML = `${tag} <button type="button" class="tag-remove" aria-label="Remove tag">&times;</button>`;
        chip.querySelector('.tag-remove').addEventListener('click', (e) => {
          e.stopPropagation();
          cardTags.splice(idx, 1);
          renderCardTags();
        });
        tagsChipsEl.appendChild(chip);
      });
    };
    renderCardTags();
    const tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.className = 'grid-summary-input';
    tagInput.placeholder = 'Add tag…';
    tagInput.style.cssText = 'flex:1;width:auto;';
    const addTagBtn = document.createElement('button');
    addTagBtn.type = 'button';
    addTagBtn.className = 'btn';
    addTagBtn.textContent = 'Add';
    const addTagFn = () => {
      const val = tagInput.value.trim().toLowerCase();
      if (val && !cardTags.includes(val)) { cardTags.push(val); renderCardTags(); }
      tagInput.value = '';
    };
    tagInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addTagFn(); } });
    addTagBtn.addEventListener('click', (e) => { e.stopPropagation(); addTagFn(); });
    const tagInputRow = document.createElement('div');
    tagInputRow.className = 'tag-input-row';
    tagInputRow.appendChild(tagInput);
    tagInputRow.appendChild(addTagBtn);

    const tagsField = document.createElement('div');
    tagsField.className = 'grid-summary-field form-field--full';
    const tagsFieldLabel = document.createElement('label');
    tagsFieldLabel.className = 'grid-summary-label';
    tagsFieldLabel.textContent = 'Tags';
    tagsField.appendChild(tagsFieldLabel);
    tagsField.appendChild(tagsChipsEl);
    tagsField.appendChild(tagInputRow);

    // -- Recurrence (modal) --
    let currentRecurrence = tx?.recurrence ?? null;
    const recurrenceValue = document.createElement('div');
    recurrenceValue.className = 'accounts-detail-value accounts-detail-value--clickable';
    recurrenceValue.title = 'Click to edit recurrence';
    const updateRecurrenceLabel = async (rec) => {
      recurrenceValue.textContent = rec ? (await getRecurrenceDescription(rec)) || 'None' : 'None';
    };
    updateRecurrenceLabel(currentRecurrence);
    recurrenceValue.addEventListener('click', (e) => {
      e.stopPropagation();
      openRecurrenceModal(currentRecurrence, async (newRec) => {
        currentRecurrence = newRec;
        await updateRecurrenceLabel(newRec);
      });
    });
    const recurrenceField = document.createElement('div');
    recurrenceField.className = 'grid-summary-field form-field--full';
    const recurrenceFieldLabel = document.createElement('label');
    recurrenceFieldLabel.className = 'grid-summary-label';
    recurrenceFieldLabel.textContent = 'Recurrence';
    recurrenceField.appendChild(recurrenceFieldLabel);
    recurrenceField.appendChild(recurrenceValue);

    // -- Periodic Change (modal) --
    let currentPeriodicChange = tx?.periodicChange ?? null;
    const periodicValue = document.createElement('div');
    periodicValue.className = 'accounts-detail-value accounts-detail-value--clickable';
    periodicValue.title = 'Click to edit periodic change';
    const updatePeriodicLabel = async (pc) => {
      periodicValue.textContent = pc ? (await getPeriodicChangeDescription(pc)) || 'None' : 'None';
    };
    updatePeriodicLabel(currentPeriodicChange);
    periodicValue.addEventListener('click', (e) => {
      e.stopPropagation();
      openPeriodicChangeModal(currentPeriodicChange, async (newPc) => {
        currentPeriodicChange = newPc;
        await updatePeriodicLabel(newPc);
      });
    });
    const periodicField = document.createElement('div');
    periodicField.className = 'grid-summary-field form-field--full';
    const periodicFieldLabel = document.createElement('label');
    periodicFieldLabel.className = 'grid-summary-label';
    periodicFieldLabel.textContent = 'Periodic Change';
    periodicField.appendChild(periodicFieldLabel);
    periodicField.appendChild(periodicValue);

    // -- Form actions --
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

    addField('Type', typeSelect);
    addField('Secondary Account', secondaryAccountSelect);
    addField('Amount', amountInput);
    addField('Description', descInput);
    addField('Date', dateInput);
    addField('Status', statusSelect);
    form.appendChild(tagsField);
    form.appendChild(recurrenceField);
    form.appendChild(periodicField);
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
      secondaryAccountSelect.value = tx?.secondaryAccountId ? String(tx.secondaryAccountId) : '';
      statusSelect.value = statusName;
      cardTags.splice(0, cardTags.length, ...(tx?.tags || []));
      renderCardTags();
      currentRecurrence = tx?.recurrence ?? null;
      updateRecurrenceLabel(currentRecurrence);
      currentPeriodicChange = tx?.periodicChange ?? null;
      updatePeriodicLabel(currentPeriodicChange);
      exitEdit();
    });

    saveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const scenario = tx?._scenarioId;
      if (!scenario) return;
      const allTxs = await getTransactions(scenario);
      const idx = allTxs.findIndex((t) => Number(t.id) === Number(tx.id));
      if (idx === -1) return;

      const prevStatus = allTxs[idx].status;
      const prevStatusName = typeof prevStatus === 'object' ? prevStatus?.name : (prevStatus || 'planned');
      const newStatusName = statusSelect.value;
      const updatedStatus = typeof prevStatus === 'object'
        ? { ...prevStatus, name: newStatusName }
        : { name: newStatusName, actualAmount: null, actualDate: null };

      allTxs[idx] = {
        ...allTxs[idx],
        description: descInput.value.trim(),
        amount: Math.abs(Number(amountInput.value || 0)),
        effectiveDate: dateInput.value || allTxs[idx].effectiveDate,
        transactionTypeId: Number(typeSelect.value || 2),
        primaryAccountId: allTxs[idx].primaryAccountId,
        secondaryAccountId: secondaryAccountSelect.value ? Number(secondaryAccountSelect.value) : null,
        status: updatedStatus,
        tags: [...cardTags],
        recurrence: currentRecurrence,
        periodicChange: currentPeriodicChange
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
      if (!await confirmDialog('Delete this transaction?')) return;
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

      // Account filter — lets the user narrow the list by primary account perspective.
      const accountFilterWrapper = document.createElement('div');
      accountFilterWrapper.style.cssText = 'display:flex;align-items:center;gap:5px;';
      const accountFilterLabel = document.createElement('label');
      accountFilterLabel.className = 'text-muted';
      accountFilterLabel.style.cssText = 'font-size:11px;white-space:nowrap;';
      accountFilterLabel.textContent = 'Account:';
      const accountFilterSelect = document.createElement('select');
      accountFilterSelect.className = 'input-select';
      accountFilterSelect.style.cssText = 'padding:3px 6px;min-width:110px;width:auto;font-size:12px;';
      (currentScenario.accounts || [])
        .filter((a) => a.name !== 'Select Account')
        .forEach((account) => {
          const opt = document.createElement('option');
          opt.value = String(account.id);
          opt.textContent = account.name;
          accountFilterSelect.appendChild(opt);
        });
      const currentFilterId = state?.getTransactionFilterAccountId?.();
      const firstAccountId = (currentScenario.accounts || []).find((a) => a.name !== 'Select Account')?.id;
      const initialFilterId = currentFilterId || firstAccountId || null;
      if (initialFilterId) {
        accountFilterSelect.value = String(initialFilterId);
        if (!currentFilterId) {
          state?.setTransactionFilterAccountId?.(Number(initialFilterId));
        }
      }
      accountFilterSelect.addEventListener('change', (e) => {
        const nextId = e.target.value ? Number(e.target.value) : null;
        state?.setTransactionFilterAccountId?.(nextId);
        loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
      });
      accountFilterWrapper.appendChild(accountFilterLabel);
      accountFilterWrapper.appendChild(accountFilterSelect);
      controls.appendChild(accountFilterWrapper);

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
