// forecast-transactions-grid.js
// Master transactions grid loader extracted from forecast.js (no behavior change).

import { createGrid, refreshGridData, createTextColumn, createDateColumn, createMoneyColumn, createDeleteColumn, createDuplicateColumn, createListEditor } from './grid-factory.js';
import { attachGridHandlers } from './grid-handlers.js';
import { openRecurrenceModal } from '../modals/recurrence-modal.js';
import { openPeriodicChangeModal } from '../modals/periodic-change-modal.js';
import { openTextInputModal } from '../modals/text-input-modal.js';
import { formatDateOnly, parseDateOnly } from '../../../shared/date-utils.js';
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
let lastTransactionsDetailTable = null;
let lastTransactionsDetailTableReady = false;

function applyTransactionsDetailFilters({ state, callbacks }) {
  if (!lastTransactionsDetailTable || !lastTransactionsDetailTableReady) return;
  
  const accountId = state?.getTransactionsAccountFilterId?.();
  const groupByField = state?.getGroupBy?.();
  
  // Apply account filter
  if (accountId) {
    // Use perspectiveAccountId since transactions are transformed to perspective rows
    lastTransactionsDetailTable.setFilter((data) =>
      data.perspectiveAccountId && Number(data.perspectiveAccountId) === Number(accountId)
    );
  } else {
    lastTransactionsDetailTable.clearFilter();
  }
  
  // Apply grouping
  if (groupByField) {
    lastTransactionsDetailTable.setGroupBy([groupByField]);
  } else {
    lastTransactionsDetailTable.setGroupBy([]);
  }
  
  callbacks?.updateTransactionTotals?.();
}

function renderTransactionsRowDetails({ row, rowData, reload }) {
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

  addField('Secondary Account', rowData?.secondaryAccountName);

  // --- Recurrence (clickable → modal) ---
  let currentRecurrence = rowData?.recurrence ?? null;
  const recurrenceField = document.createElement('div');
  recurrenceField.className = 'grid-detail-field';
  const recurrenceLabel = document.createElement('label');
  recurrenceLabel.className = 'grid-detail-label';
  recurrenceLabel.textContent = 'Recurrence';
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
      const scenarioId = rowData?._scenarioId;
      if (!scenarioId) return;
      const allTxs = await getTransactions(scenarioId);
      const idx = allTxs.findIndex((t) => Number(t.id) === Number(rowData.originalTransactionId || rowData.id));
      if (idx === -1) return;
      allTxs[idx] = { ...allTxs[idx], recurrence: newRec };
      await TransactionManager.saveAll(scenarioId, allTxs);
      await reload?.();
    });
  });
  recurrenceField.appendChild(recurrenceLabel);
  recurrenceField.appendChild(recurrenceValue);
  grid.appendChild(recurrenceField);

  // --- Periodic Change (clickable → modal) ---
  let currentPeriodicChange = rowData?.periodicChange ?? null;
  const periodicField = document.createElement('div');
  periodicField.className = 'grid-detail-field';
  const periodicLabel = document.createElement('label');
  periodicLabel.className = 'grid-detail-label';
  periodicLabel.textContent = 'Periodic Change';
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
      const scenarioId = rowData?._scenarioId;
      if (!scenarioId) return;
      const allTxs = await getTransactions(scenarioId);
      const idx = allTxs.findIndex((t) => Number(t.id) === Number(rowData.originalTransactionId || rowData.id));
      if (idx === -1) return;
      allTxs[idx] = { ...allTxs[idx], periodicChange: newPc };
      await TransactionManager.saveAll(scenarioId, allTxs);
      await reload?.();
    });
  });
  periodicField.appendChild(periodicLabel);
  periodicField.appendChild(periodicValue);
  grid.appendChild(periodicField);

  // --- Tags (inline chip/input pattern matching accounts-grid detail) ---
  const cardTags = [...(rowData?.tags || [])];
  const tagsField = document.createElement('div');
  tagsField.className = 'grid-detail-field';
  const tagsLabel = document.createElement('label');
  tagsLabel.className = 'grid-detail-label';
  tagsLabel.textContent = 'Tags';
  const tagsChipsEl = document.createElement('div');
  tagsChipsEl.className = 'tag-chips';
  const saveDetailTags = async () => {
    const scenarioId = rowData?._scenarioId;
    if (!scenarioId) return;
    const allTxs = await getTransactions(scenarioId);
    const idx = allTxs.findIndex((t) => Number(t.id) === Number(rowData.originalTransactionId || rowData.id));
    if (idx === -1) return;
    allTxs[idx] = { ...allTxs[idx], tags: [...cardTags] };
    await TransactionManager.saveAll(scenarioId, allTxs);
  };
  const renderDetailTags = () => {
    tagsChipsEl.innerHTML = '';
    if (cardTags.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'text-secondary';
      empty.textContent = 'No tags';
      tagsChipsEl.appendChild(empty);
      return;
    }
    cardTags.forEach((tag, idx) => {
      const chip = document.createElement('span');
      chip.className = 'tag-badge';
      chip.innerHTML = `${tag} <button type="button" class="tag-remove" aria-label="Remove tag">&times;</button>`;
      chip.querySelector('.tag-remove').addEventListener('click', async (e) => {
        e.stopPropagation();
        cardTags.splice(idx, 1);
        renderDetailTags();
        await saveDetailTags();
      });
      tagsChipsEl.appendChild(chip);
    });
  };
  renderDetailTags();
  const tagInputRow = document.createElement('div');
  tagInputRow.className = 'tag-input-row';
  const tagInput = document.createElement('input');
  tagInput.type = 'text';
  tagInput.className = 'accounts-detail-input';
  tagInput.placeholder = 'Add tag\u2026';
  tagInput.autocomplete = 'off';
  const addTagFn = async () => {
    const val = tagInput.value.trim().toLowerCase();
    if (val && !cardTags.includes(val)) {
      cardTags.push(val);
      renderDetailTags();
      await saveDetailTags();
    }
    tagInput.value = '';
  };
  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addTagFn(); }
  });
  tagInput.addEventListener('blur', () => { if (cardTags.length > 0) saveDetailTags(); });
  const addTagBtn = document.createElement('button');
  addTagBtn.type = 'button';
  addTagBtn.className = 'icon-btn';
  addTagBtn.textContent = '\u2295';
  addTagBtn.title = 'Add Tag';
  addTagBtn.addEventListener('click', (e) => { e.stopPropagation(); addTagFn(); });
  tagInputRow.appendChild(tagInput);
  tagInputRow.appendChild(addTagBtn);
  const tagsContentRow = document.createElement('div');
  tagsContentRow.className = 'tags-content-row';
  tagsContentRow.style.flexWrap = 'nowrap';
  tagsContentRow.appendChild(tagsChipsEl);
  tagsContentRow.appendChild(tagInputRow);
  tagsField.appendChild(tagsLabel);
  tagsField.appendChild(tagsContentRow);
  grid.appendChild(tagsField);

  detailsEl.appendChild(grid);
}

function renderTransactionsSummaryList({
  container,
  transactions,
  accounts,
  onRefresh,
  filterAccountId,
  groupByField
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

  // Transform transactions to perspective rows using shared transformer
  const allPerspectiveRows = transactions.flatMap((tx) => {
    const normalized = normalizeCanonicalTransaction(tx);
    return transformTransactionToRows(normalized, visibleAccounts);
  });

  // Filter to current account perspective or show only primary rows
  let displayTransactions = filterAccountId
    ? allPerspectiveRows.filter(r => Number(r.perspectiveAccountId) === Number(filterAccountId))
    : allPerspectiveRows.filter(r => !String(r.id).endsWith('_flipped'));

  // Sort by groupByField if specified
  if (groupByField) {
    displayTransactions = displayTransactions.sort((a, b) => {
      const valA = String(a[groupByField] || '');
      const valB = String(b[groupByField] || '');
      return valA.localeCompare(valB);
    });
  }

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

  // Render grouped cards with headers
  let currentGroupValue = null;
  displayTransactions.forEach((tx, idx) => {
    // Insert group header if grouping is active and group value changed
    if (groupByField) {
      const groupValue = String(tx[groupByField] || '');
      if (groupValue !== currentGroupValue) {
        const groupHeader = document.createElement('div');
        groupHeader.className = 'grid-summary-group-header';
        groupHeader.textContent = groupValue || '(ungrouped)';
        list.appendChild(groupHeader);
        currentGroupValue = groupValue;
      }
    }

    // Get original transaction ID (handle flipped rows)
    const originalTransactionId = tx.originalTransactionId || (String(tx.id).endsWith('_flipped') ? String(tx.id).replace('_flipped', '') : tx.id);
    const card = document.createElement('div');
    card.className = 'grid-summary-card';

    const content = document.createElement('div');
    content.className = 'grid-summary-content';

    // Use perspective-transformed values
    const typeName = tx.transactionTypeName || (Number(tx.transactionTypeId) === 1 ? 'Money In' : 'Money Out');
    const isMoneyOut = Number(tx.transactionTypeId) === 2;
    const perspectiveAcct = visibleAccounts.find((a) => Number(a.id) === Number(tx.perspectiveAccountId || tx.primaryAccountId));
    const currency = perspectiveAcct?.currency?.code || perspectiveAcct?.currency?.name || 'ZAR';
    const unsignedAmt = Math.abs(Number(tx.plannedAmount || tx.amount || 0));
    const formattedAmt = formatCurrency(unsignedAmt, currency);
    const secondaryName = tx.secondaryAccountName || findAccountName(tx.secondaryAccountId);
    const primaryName = tx.primaryAccountName || findAccountName(tx.primaryAccountId);

    // Line 1: secondary account name + amount (amount pushed right)
    const rowPrimary = document.createElement('div');
    rowPrimary.className = 'grid-summary-row-primary';

    const title = document.createElement('span');
    title.className = 'grid-summary-title';
    title.textContent = secondaryName;

    const amountEl = document.createElement('span');
    amountEl.className = `grid-summary-amount ${isMoneyOut ? 'negative' : 'positive'}`;
    amountEl.textContent = formattedAmt;

    rowPrimary.appendChild(title);
    rowPrimary.appendChild(amountEl);

    // Line 2: transaction flow
    const flowEl = document.createElement('div');
    flowEl.className = 'grid-summary-flow';
    flowEl.textContent = `${primaryName} \u2192 ${secondaryName}`;

    content.appendChild(rowPrimary);
    content.appendChild(flowEl);

    // Type badge for actions rail
    const typeSpan = document.createElement('span');
    typeSpan.className = `grid-summary-type ${isMoneyOut ? 'money-out' : 'money-in'}`;
    typeSpan.textContent = typeName;

    const actions = document.createElement('div');
    actions.className = 'grid-summary-actions';

    const duplicateBtn = document.createElement('button');
    duplicateBtn.className = 'icon-btn';
    duplicateBtn.title = 'Duplicate Transaction';
    duplicateBtn.textContent = '⧉';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn';
    deleteBtn.title = 'Delete Transaction';
    deleteBtn.textContent = '⨉';

    actions.appendChild(typeSpan);
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
          tagInput.focus();
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
    addTagBtn.className = 'icon-btn';
    addTagBtn.textContent = '⊕';
    addTagBtn.title = 'Add Tag';
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
      if (e.target.closest('.icon-btn')) return;
      enterEdit();
    });

    const doSave = async () => {
      const scenario = tx?._scenarioId;
      if (!scenario) return;
      const allTxs = await getTransactions(scenario);
      const idx = allTxs.findIndex((t) => Number(t.id) === Number(originalTransactionId));
      if (idx === -1) return;

      const prevStatus = allTxs[idx].status;
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
      const scenario = tx?._scenarioId;
      if (!scenario) return;
      const allTxs = await getTransactions(scenario);
      const source = allTxs.find((t) => Number(t.id) === Number(originalTransactionId));
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
      const filtered = allTxs.filter((t) => Number(t.id) !== Number(originalTransactionId));
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

  const workflowConfig = getWorkflowConfig?.();
  const transactionsModeKey = workflowConfig?.transactionsMode === 'detail' ? 'detail' : 'summary';
  const accountFilterStateKey = `accountFilter:${transactionsModeKey}`;
  const groupByStateKey = `groupBy:${transactionsModeKey}`;

  try {
    const existingTable = tables?.getMasterTransactionsTable?.();
    transactionsGridState.capture(existingTable, {
      [groupByStateKey]: '#tx-grouping-select'
    });
  } catch (_) {
    // Keep existing behavior: ignore state capture errors.
  }

  const dropdownState = transactionsGridState?.state?.dropdowns || {};

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

      if (workflowConfig?.transactionsMode === 'detail') {
        // Detail-mode controls are built later, after periods are available.
        transactionsHeader.classList.add('card-header--filters-inline');
      } else {
        transactionsHeader.classList.remove('card-header--filters-inline');

        const accountFilterItem = document.createElement('div');
        accountFilterItem.className = 'header-filter-item';
        const accountFilterLabel = document.createElement('label');
        accountFilterLabel.htmlFor = 'tx-account-filter-select';
        accountFilterLabel.textContent = 'Account:';
        const accountFilterSelect = document.createElement('select');
        accountFilterSelect.id = 'tx-account-filter-select';
        accountFilterSelect.className = 'input-select';
        (currentScenario.accounts || [])
          .filter((a) => a.name !== 'Select Account')
          .forEach((account) => {
            const opt = document.createElement('option');
            opt.value = String(account.id);
            opt.textContent = account.name;
            accountFilterSelect.appendChild(opt);
          });
        // Default to stored state, or first account
        const firstAccountId = (currentScenario.accounts || []).find((a) => a.name !== 'Select Account')?.id;
        const storedSummaryAccount = dropdownState[accountFilterStateKey];
        const defaultSummaryAccount = storedSummaryAccount || (firstAccountId ? String(firstAccountId) : '');
        if (defaultSummaryAccount) {
          accountFilterSelect.value = defaultSummaryAccount;
          transactionsGridState.state.dropdowns[accountFilterStateKey] = defaultSummaryAccount;
        }
        // Account selector filters summary cards
        accountFilterSelect.addEventListener('change', (e) => {
          transactionsGridState.state.dropdowns[accountFilterStateKey] = e.target.value;
          loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
        });
        accountFilterItem.appendChild(accountFilterLabel);
        accountFilterItem.appendChild(accountFilterSelect);
        controls.appendChild(accountFilterItem);

        // Period Type (summary mode)
        const periodTypeSelect = document.createElement('select');
        periodTypeSelect.id = 'tx-period-type-select-summary';
        periodTypeSelect.className = 'input-select';
        ['Day', 'Week', 'Month', 'Quarter', 'Year'].forEach((pt) => {
          const opt = document.createElement('option');
          opt.value = pt;
          opt.textContent = pt;
          periodTypeSelect.appendChild(opt);
        });
        periodTypeSelect.value = state?.getActualPeriodType?.() || 'Month';
        const periodTypeItem = document.createElement('div');
        periodTypeItem.className = 'header-filter-item';
        const periodTypeLabel = document.createElement('label');
        periodTypeLabel.htmlFor = 'tx-period-type-select-summary';
        periodTypeLabel.textContent = 'Period Type:';
        periodTypeItem.appendChild(periodTypeLabel);
        periodTypeItem.appendChild(periodTypeSelect);
        controls.appendChild(periodTypeItem);

        periodTypeSelect.addEventListener('change', async () => {
          state?.setActualPeriodType?.(periodTypeSelect.value);
          state?.setTransactionsPeriods?.([]);
          state?.setActualPeriod?.(null);
          await loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
        });

        // Period selector (summary mode) - with ◀ ▶ navigation
        const periodSelectSummary = document.createElement('select');
        periodSelectSummary.id = 'tx-period-select-summary';
        periodSelectSummary.className = 'input-select';
        const allPeriodsOptSummary = document.createElement('option');
        allPeriodsOptSummary.value = '';
        allPeriodsOptSummary.textContent = 'All';
        periodSelectSummary.appendChild(allPeriodsOptSummary);
        
        // Periods will be populated dynamically after they're loaded
        const curPeriodSummary = state?.getActualPeriod?.();
        if (curPeriodSummary) periodSelectSummary.value = String(curPeriodSummary);

        const prevBtnSummary = document.createElement('button');
        prevBtnSummary.type = 'button';
        prevBtnSummary.className = 'period-btn';
        prevBtnSummary.textContent = '◀';
        prevBtnSummary.title = 'Previous period';

        const nextBtnSummary = document.createElement('button');
        nextBtnSummary.type = 'button';
        nextBtnSummary.className = 'period-btn';
        nextBtnSummary.textContent = '▶';
        nextBtnSummary.title = 'Next period';

        const periodItemSummary = document.createElement('div');
        periodItemSummary.className = 'header-filter-item';
        const periodLabelSummary = document.createElement('label');
        periodLabelSummary.htmlFor = 'tx-period-select-summary';
        periodLabelSummary.textContent = 'Period:';
        periodItemSummary.appendChild(periodLabelSummary);
        periodItemSummary.appendChild(periodSelectSummary);
        periodItemSummary.appendChild(prevBtnSummary);
        periodItemSummary.appendChild(nextBtnSummary);
        controls.appendChild(periodItemSummary);

        periodSelectSummary.addEventListener('change', async () => {
          const nextPeriodId = periodSelectSummary.value ? String(periodSelectSummary.value) : null;
          state?.setActualPeriod?.(nextPeriodId);
          await loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
        });

        prevBtnSummary.addEventListener('click', async (e) => {
          e.stopPropagation();
          const allPeriodsSummary = state?.getTransactionsPeriods?.() || [];
          const currentIdx = allPeriodsSummary.findIndex((p) => p.id === state?.getActualPeriod?.());
          if (currentIdx > 0) {
            state?.setActualPeriod?.(String(allPeriodsSummary[currentIdx - 1].id));
            await loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
          }
        });

        nextBtnSummary.addEventListener('click', async (e) => {
          e.stopPropagation();
          const allPeriodsSummary = state?.getTransactionsPeriods?.() || [];
          const currentIdx = allPeriodsSummary.findIndex((p) => p.id === state?.getActualPeriod?.());
          if (currentIdx >= 0 && currentIdx < allPeriodsSummary.length - 1) {
            state?.setActualPeriod?.(String(allPeriodsSummary[currentIdx + 1].id));
            await loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
          } else if (currentIdx === -1 && allPeriodsSummary.length > 0) {
            state?.setActualPeriod?.(String(allPeriodsSummary[0].id));
            await loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
          }
        });

        // Group By (summary mode)
        const groupBySelectSummary = document.createElement('select');
        groupBySelectSummary.id = 'tx-grouping-select-summary';
        groupBySelectSummary.className = 'input-select';
        [
          { value: '', label: 'None' },
          { value: 'transactionTypeName', label: 'Transaction Type' },
          { value: 'primaryAccountName', label: 'Primary Account' },
          { value: 'secondaryAccountName', label: 'Secondary Account' }
        ].forEach(({ value, label }) => {
          const opt = document.createElement('option');
          opt.value = value;
          opt.textContent = label;
          groupBySelectSummary.appendChild(opt);
        });
        const currentGroupBySummary = state?.getGroupBy?.() || '';
        groupBySelectSummary.value = currentGroupBySummary;
        const groupByItemSummary = document.createElement('div');
        groupByItemSummary.className = 'header-filter-item';
        const groupByLabelSummary = document.createElement('label');
        groupByLabelSummary.htmlFor = 'tx-grouping-select-summary';
        groupByLabelSummary.textContent = 'Group:';
        groupByItemSummary.appendChild(groupByLabelSummary);
        groupByItemSummary.appendChild(groupBySelectSummary);
        controls.appendChild(groupByItemSummary);

        groupBySelectSummary.addEventListener('change', () => {
          transactionsGridState.state.dropdowns[groupByStateKey] = groupBySelectSummary.value;
          state?.setGroupBy?.(groupBySelectSummary.value);
          loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
        });

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

            // Summary mode stores account selection in dropdownState, not in state
            const summaryAccountStr = transactionsGridState.state.dropdowns[accountFilterStateKey];
            const summaryAccountId = summaryAccountStr ? Number(summaryAccountStr) : null;
            const actualPeriod = state?.getActualPeriod?.();
            const periods = state?.getTransactionsPeriods?.() || [];

            const accountIds = (currentScenario.accounts || []).map((acc) => acc.id);
            const filteredAccountId =
              summaryAccountId && accountIds.includes(summaryAccountId)
                ? summaryAccountId
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
  }

  // Keep the grid container stable to reduce scroll jumps.
  // In detail mode the toolbar is stable and managed inside the detail branch; only remove
  // toolbars when switching to/from summary mode.
  if (workflowConfig?.transactionsMode !== 'detail') {
    const existingToolbars = container.querySelectorAll(':scope > .grid-toolbar');
    existingToolbars.forEach((el) => el.remove());
    // When leaving detail mode, also clear the stable table reference
    if (lastTransactionsDetailTable) {
      try { lastTransactionsDetailTable.destroy?.(); } catch (_) { /* ignore */ }
      lastTransactionsDetailTable = null;
      lastTransactionsDetailTableReady = false;
    }
  }

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
    // In detail mode the table is kept alive and updated in-place via refreshGridData;
    // destroying it here would clear the DOM before the data refresh can run.
    if (workflowConfig?.transactionsMode !== 'detail') {
      try {
        const existingTable = tables?.getMasterTransactionsTable?.();
        existingTable?.destroy?.();
        tables?.setMasterTransactionsTable?.(null);
      } catch (_) {
        // ignore
      }
    }

    const actualPeriodType = state?.getActualPeriodType?.();
    const actualPeriod = state?.getActualPeriod?.();
    let periods = state?.getTransactionsPeriods?.();
    if (!periods || periods.length === 0) {
      periods = await getScenarioPeriods(currentScenario.id, actualPeriodType);
      state?.setTransactionsPeriods?.(periods);
    }

    // Populate period selector in summary header (if it exists)
    if (workflowConfig?.transactionsMode !== 'detail') {
      const periodSelectSummary = transactionsHeader?.querySelector('#tx-period-select-summary');
      if (periodSelectSummary && periodSelectSummary.children.length === 1) { // Only if "All" option exists
        // Add period options
        periods.forEach((p) => {
          const opt = document.createElement('option');
          opt.value = String(p.id);
          opt.textContent = p.label || String(p.id);
          periodSelectSummary.appendChild(opt);
        });
        // Restore period selection from state
        const curPeriodSummary = state?.getActualPeriod?.();
        if (curPeriodSummary) periodSelectSummary.value = String(curPeriodSummary);
      }
    }

    let allTransactions = await getTransactions(currentScenario.id);
    if (actualPeriod) {
      const selectedPeriod = periods.find((p) => p.id === actualPeriod);
      if (selectedPeriod) {
        allTransactions = expandTransactions(
          allTransactions,
          parseDateOnly(selectedPeriod.startDate),
          parseDateOnly(selectedPeriod.endDate),
          currentScenario.accounts
        );
      }
    }

    // For summary mode: use summary-scoped account filter; for detail mode: use detail-scoped filter (applied via Tabulator)
    const summaryAccountFilterStr = workflowConfig?.transactionsMode !== 'detail' ? String(dropdownState[accountFilterStateKey] || '') : '';
    const accountFilterId = summaryAccountFilterStr ? Number(summaryAccountFilterStr) : state?.getTransactionFilterAccountId?.();
    // Don't pre-filter by account - filtering is done during transformation and rendering
    // Account filtering will be applied in detail via applyTransactionsDetailFilters
    // and in summary via renderTransactionsSummaryList with perspective rows

    allTransactions = allTransactions.map((tx) => ({
      ...normalizeCanonicalTransaction(tx),
      _scenarioId: currentScenario.id
    }));

    if (workflowConfig?.transactionsMode === 'detail') {
      // --- Detail mode: full Tabulator grid ---
      gridContainer.classList.add('grid-detail');

      const accounts = currentScenario.accounts || [];

      // Keep all perspective rows (primary + flipped) — setFilter handles which to show
      const displayRows = allTransactions.flatMap((tx) =>
        transformTransactionToRows(tx, accounts)
      ).map((r) => ({
        ...r,
        statusName: r.status?.name || (typeof r.status === 'string' ? r.status : 'planned')
      }));

      // Enrich computed summaries for display columns
      await Promise.all(displayRows.map(async (r) => {
        r.recurrenceSummary = r.recurrence ? (await getRecurrenceDescription(r.recurrence)) || '' : '';
        r.periodicChangeSummary = r.periodicChange ? (await getPeriodicChangeDescription(r.periodicChange)) || '' : '';
      }));

      // Data-only reload: fetch fresh transactions and update the live Tabulator instance
      // without tearing it down. Falls back to a full rebuild only if the table is not ready.
      const reload = async () => {
        if (!lastTransactionsDetailTable || !lastTransactionsDetailTableReady) {
          return loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
        }
        try {
          const refreshedScenario = await getScenario(currentScenario.id);
          scenarioState?.set?.(refreshedScenario);
          let freshTxs = await getTransactions(refreshedScenario.id);
          const currentPeriod = state?.getActualPeriod?.();
          const currentPeriods = state?.getTransactionsPeriods?.() || [];
          if (currentPeriod) {
            const selectedPeriod = currentPeriods.find((p) => p.id === currentPeriod);
            if (selectedPeriod) {
              freshTxs = expandTransactions(freshTxs, parseDateOnly(selectedPeriod.startDate), parseDateOnly(selectedPeriod.endDate), refreshedScenario.accounts);
            }
          }
          const freshAccounts = refreshedScenario.accounts || [];
          const normalizedTxs = freshTxs.map((tx) => ({ ...normalizeCanonicalTransaction(tx), _scenarioId: refreshedScenario.id }));
          const freshRows = normalizedTxs
            .flatMap((tx) => transformTransactionToRows(tx, freshAccounts))
            .map((r) => ({ ...r, statusName: r.status?.name || (typeof r.status === 'string' ? r.status : 'planned') }));
          await Promise.all(freshRows.map(async (r) => {
            r.recurrenceSummary = r.recurrence ? (await getRecurrenceDescription(r.recurrence)) || '' : '';
            r.periodicChangeSummary = r.periodicChange ? (await getPeriodicChangeDescription(r.periodicChange)) || '' : '';
          }));
          await refreshGridData(lastTransactionsDetailTable, freshRows);
          callbacks?.updateTransactionTotals?.();
          callbacks?.refreshSummaryCards?.();
        } catch (err) {
          // If the data-only update fails for any reason, fall back to full rebuild.
          return loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
        }
      };

      // --- Build header controls for detail mode (periods now available) ---
      if (transactionsHeader) {
        const controls = transactionsHeader.querySelector('.card-header-controls');
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

          // Account selector with filtering capability
          const accountFilterSelect = document.createElement('select');
          accountFilterSelect.id = 'tx-account-filter-select';
          accountFilterSelect.className = 'input-select';
          (currentScenario.accounts || [])
            .filter((a) => a.name !== 'Select Account')
            .forEach((account) => {
              const opt = document.createElement('option');
              opt.value = String(account.id);
              opt.textContent = account.name;
              accountFilterSelect.appendChild(opt);
            });
          // Default to stored state, or first account
          const storedDetailAccount = dropdownState[accountFilterStateKey];
          const detailFirstAccountId = (currentScenario.accounts || []).find((a) => a.name !== 'Select Account')?.id;
          const defaultDetailAccount = storedDetailAccount || (detailFirstAccountId ? String(detailFirstAccountId) : '');
          if (defaultDetailAccount) {
            accountFilterSelect.value = defaultDetailAccount;
            state?.setTransactionsAccountFilterId?.(Number(defaultDetailAccount));
            transactionsGridState.state.dropdowns[accountFilterStateKey] = defaultDetailAccount;
          }
          controls.appendChild(makeHeaderFilter('tx-account-filter-select', 'Account:', accountFilterSelect));

          // Handle account filter change - use Tabulator setFilter, no rebuild
          accountFilterSelect.addEventListener('change', (e) => {
            const nextId = e.target.value ? Number(e.target.value) : null;
            state?.setTransactionsAccountFilterId?.(nextId);
            transactionsGridState.state.dropdowns[accountFilterStateKey] = e.target.value;
            applyTransactionsDetailFilters({ state, callbacks });
          });

          // Period Type
          const periodTypeSelect = document.createElement('select');
          periodTypeSelect.id = 'tx-period-type-select';
          periodTypeSelect.className = 'input-select';
          ['Day', 'Week', 'Month', 'Quarter', 'Year'].forEach((pt) => {
            const opt = document.createElement('option');
            opt.value = pt; opt.textContent = pt;
            periodTypeSelect.appendChild(opt);
          });
          periodTypeSelect.value = state?.getActualPeriodType?.() || 'Month';
          controls.appendChild(makeHeaderFilter('tx-period-type-select', 'Period Type:', periodTypeSelect));

          // Period + ◀ ▶ navigation
          const periodSelect = document.createElement('select');
          periodSelect.id = 'tx-period-select';
          periodSelect.className = 'input-select';
          const allPeriodsOpt = document.createElement('option');
          allPeriodsOpt.value = ''; allPeriodsOpt.textContent = 'All';
          periodSelect.appendChild(allPeriodsOpt);
          periods.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = String(p.id);
            opt.textContent = p.label || String(p.id);
            periodSelect.appendChild(opt);
          });
          const curPeriod = state?.getActualPeriod?.();
          if (curPeriod) periodSelect.value = String(curPeriod);

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
          periodLabel.htmlFor = 'tx-period-select';
          periodLabel.textContent = 'Period:';
          periodItem.appendChild(periodLabel);
          periodItem.appendChild(periodSelect);
          periodItem.appendChild(prevBtn);
          periodItem.appendChild(nextBtn);
          controls.appendChild(periodItem);

          // Group By
          const groupBySelect = document.createElement('select');
          groupBySelect.id = 'tx-grouping-select';
          groupBySelect.className = 'input-select';
          [
            { value: '', label: 'None' },
            { value: 'transactionTypeName', label: 'Transaction Type' },
            { value: 'primaryAccountName', label: 'Primary Account' },
            { value: 'secondaryAccountName', label: 'Secondary Account' },
            { value: 'statusName', label: 'Status' }
          ].forEach(({ value, label }) => {
            const opt = document.createElement('option');
            opt.value = value; opt.textContent = label;
            groupBySelect.appendChild(opt);
          });
          // Restore detail-scoped grouping from state
          const detailGroupBy = String(dropdownState[groupByStateKey] || '');
          const currentGroupBy = detailGroupBy || state?.getGroupBy?.() || '';
          groupBySelect.value = currentGroupBy;
          if (currentGroupBy && !detailGroupBy) {
            state?.setGroupBy?.(currentGroupBy);
          }
          controls.appendChild(makeHeaderFilter('tx-grouping-select', 'Group:', groupBySelect));

          // Icon actions
          const iconActions = document.createElement('div');
          iconActions.className = 'header-icon-actions';
          const addButton = document.createElement('button');
          addButton.className = 'icon-btn';
          addButton.title = 'Add Transaction';
          addButton.textContent = '+';
          const refreshButton = document.createElement('button');
          refreshButton.className = 'icon-btn';
          refreshButton.title = 'Refresh Transactions';
          refreshButton.textContent = '⟳';
          iconActions.appendChild(addButton);
          iconActions.appendChild(refreshButton);
          controls.appendChild(iconActions);

          // Event listeners
          periodTypeSelect.addEventListener('change', async () => {
            state?.setActualPeriodType?.(periodTypeSelect.value);
            state?.setTransactionsPeriods?.([]);
            state?.setActualPeriod?.(null);
            await loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
          });
          periodSelect.addEventListener('change', () => {
            state?.setActualPeriod?.(periodSelect.value || null);
            loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
          });
          const periodIds = [null, ...periods.map((p) => p.id || null)];
          const changePeriodBy = (offset) => {
            const currentId = state?.getActualPeriod?.() ?? null;
            const currentIndex = periodIds.findIndex((id) => id === currentId);
            const safeIndex = currentIndex === -1 ? 0 : currentIndex;
            const nextIndex = Math.min(Math.max(safeIndex + offset, 0), periodIds.length - 1);
            const nextId = periodIds[nextIndex] ?? null;
            periodSelect.value = nextId ? String(nextId) : '';
            state?.setActualPeriod?.(nextId);
            loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
          };
          prevBtn.addEventListener('click', (e) => { e.preventDefault(); changePeriodBy(-1); });
          nextBtn.addEventListener('click', (e) => { e.preventDefault(); changePeriodBy(1); });
          groupBySelect.addEventListener('change', () => {
            transactionsGridState.state.dropdowns[groupByStateKey] = groupBySelect.value;
            const field = groupBySelect.value;
            state?.setGroupBy?.(field || '');
            lastTransactionsDetailTable?.setGroupBy?.(field ? [field] : []);
          });
          addButton.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
              currentScenario = scenarioState?.get?.();
              const transactionFilterAccountId = state?.getTransactionsAccountFilterId?.();
              const actualPeriod = state?.getActualPeriod?.();
              const localPeriods = state?.getTransactionsPeriods?.() || [];
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
              const selectedPeriod = actualPeriod ? localPeriods.find((p) => p.id === actualPeriod) : null;
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

      // --- Totals container (stable; selects moved to title bar) ---
      let totalsContainer = container.querySelector(':scope > .transaction-totals-container#transactionsContent');
      if (!totalsContainer) {
        gridContainer.innerHTML = '';
        totalsContainer = document.createElement('div');
        totalsContainer.className = 'transaction-totals-container';
        totalsContainer.id = 'transactionsContent';
        container.insertBefore(totalsContainer, gridContainer);
      }

      const columns = [
        // Planned/Actual checkbox — very first column
        {
          title: '',
          field: '_isActual',
          width: 60,
          minWidth: 60,
          hozAlign: 'center',
          headerSort: false,
          headerTooltip: 'Actual (checked) / Planned (unchecked)',
          formatter: (cell) => {
            const isActual = cell.getRow().getData().status?.name === 'actual';
            return `<input type="checkbox" ${isActual ? 'checked' : ''} style="pointer-events:none;cursor:default;">`;
          },
          responsive: 0,
          topCalc: false
        },
        // Row detail expand toggle
        {
          title: '',
          field: '_detailsToggle',
          width: 44,
          minWidth: 44,
          hozAlign: 'center',
          headerSort: false,
          responsive: 0,
          topCalc: false,
          formatter: (cell) => {
            const isOpen = Boolean(cell.getRow().getData()?._detailsOpen);
            return `<span style="cursor:pointer;font-size:12px;">${isOpen ? '▾' : '▸'}</span>`;
          },
          cellClick: (e, cell) => {
            const row = cell.getRow();
            const nextState = !row.getData()._detailsOpen;
            row.update({ _detailsOpen: nextState });
            row.getTable()?.redraw?.(true);
          }
        },
        createDeleteColumn(
          async (cell) => {
            const row = cell.getRow().getData();
            const scenarioId = row._scenarioId;
            if (!scenarioId) return;
            const allTxs = await getTransactions(scenarioId);
            const filtered = allTxs.filter((t) => Number(t.id) !== Number(row.originalTransactionId || row.id));
            await TransactionManager.saveAll(scenarioId, filtered);
            await reload();
          },
          { confirmMessage: (rowData) => `Delete transaction: ${rowData.description || 'Untitled'}?` }
        ),
        createDuplicateColumn(
          async (cell) => {
            const row = cell.getRow().getData();
            const scenarioId = row._scenarioId;
            if (!scenarioId) return;
            const allTxs = await getTransactions(scenarioId);
            const source = allTxs.find((t) => Number(t.id) === Number(row.originalTransactionId || row.id));
            if (!source) return;
            allTxs.push({ ...source, id: 0 });
            await TransactionManager.saveAll(scenarioId, allTxs);
            await reload();
          },
          { headerTooltip: 'Duplicate Transaction' }
        ),
        {
          title: 'Secondary', field: 'secondaryAccountName',
          minWidth: 90, widthGrow: 1, headerSort: true, headerFilter: 'input',
          editor: 'list',
          editorParams: {
            values: [
              { label: '\u2014 None \u2014', value: '' },
              ...(currentScenario.accounts || [])
                .filter((a) => a.name !== 'Select Account')
                .map((a) => ({ label: a.name, value: a.name }))
            ]
          },
          formatter: (cell) => cell.getValue() || '\u2014',
        },
        {
          title: 'Type', field: 'transactionTypeName', minWidth: 90, widthGrow: 1, headerSort: true, headerFilter: 'input',
          ...createListEditor(['Money In', 'Money Out']),
          formatter: (cell) => {
            const val = cell.getValue();
            const cls = val === 'Money Out' ? 'money-out' : 'money-in';
            return `<span class="grid-summary-type ${cls}">${val}</span>`;
          }
        },
        createMoneyColumn('Amount', 'amount', { widthGrow: 1 }),
        {
          title: 'Recurrence', field: 'recurrenceSummary', widthGrow: 1, headerSort: true,
          formatter: (cell) => {
            const val = cell.getValue() || '\u2014';
            return `<div class="accounts-detail-value--clickable" title="Click to edit recurrence">${val}</div>`;
          },
          cellClick: (e, cell) => {
            const row = cell.getRow().getData();
            const scenarioId = row._scenarioId;
            if (!scenarioId) return;
            openRecurrenceModal(row.recurrence ?? null, async (newRec) => {
              const allTxs = await getTransactions(scenarioId);
              const idx = allTxs.findIndex((t) => Number(t.id) === Number(row.originalTransactionId || row.id));
              if (idx === -1) return;
              allTxs[idx] = { ...allTxs[idx], recurrence: newRec };
              await TransactionManager.saveAll(scenarioId, allTxs);
              await reload();
            });
          }
        },
        createDateColumn('Date', 'effectiveDate', { editor: 'input', editable: true }),
      ];

      // Reuse or create the Tabulator instance
      let txTable = lastTransactionsDetailTable;
      const shouldRebuild = !txTable || txTable.element !== gridContainer;

      if (shouldRebuild) {
        try { txTable?.destroy?.(); } catch (_) { /* ignore */ }
        lastTransactionsDetailTableReady = false;

        txTable = await createGrid(gridContainer, {
          data: displayRows,
          columns,
          rowFormatter: (row) => {
            renderTransactionsRowDetails({ row, rowData: row.getData(), reload });
          },
          cellEdited: async (cell) => {
            try {
              const row = cell.getRow().getData();
              const scenarioId = row._scenarioId;
              if (!scenarioId) return;
              const allTxs = await getTransactions(scenarioId);
              const canonicalId = Number(row.originalTransactionId || row.id);
              const idx = allTxs.findIndex((t) => Number(t.id) === canonicalId);
              if (idx === -1) return;
              const isFlipped = String(row.id).endsWith('_flipped');
              const updated = mapEditToCanonical(allTxs[idx], { field: cell.getField(), value: cell.getValue(), isFlipped });
              if (cell.getField() === 'secondaryAccountName') {
                const accName = cell.getValue();
                const acc = (currentScenario.accounts || []).find((a) => a.name === accName);
                updated.secondaryAccountId = acc?.id ?? null;
              }
              allTxs[idx] = updated;
              await TransactionManager.saveAll(scenarioId, allTxs);
              callbacks?.refreshSummaryCards?.();
            } catch (err) {
              notifyError('Failed to save transaction edit.');
            }
          }
        });

        attachGridHandlers(txTable, {
          dataFiltered: (filters, rows) => {
            callbacks?.updateTransactionTotals?.(rows);
          }
        });

        txTable.on('tableBuilt', () => {
          lastTransactionsDetailTableReady = true;
          try {
            // Clear any persisted column header filters to ensure all data is visible
            txTable?.clearHeaderFilter?.();
            transactionsGridState.restore(txTable, { restoreGroupBy: true });
            transactionsGridState.restoreDropdowns({
              [groupByStateKey]: '#tx-grouping-select'
            }, { dispatchChange: false });
          } catch (_) {
            // ignore
          }
          applyTransactionsDetailFilters({ state, callbacks });
        });

        lastTransactionsDetailTable = txTable;
      } else {
        // Data-only refresh — only safe after tableBuilt fires
        if (lastTransactionsDetailTableReady) {
          await refreshGridData(txTable, displayRows);
          callbacks?.updateTransactionTotals?.();
        }
      }

      tables?.setMasterTransactionsTable?.(txTable);
    } else {
      // --- Summary mode: card list ---
      // Resolve the summary account filter: stored state, or fall back to first account
      const summaryFirstAccountId = (currentScenario.accounts || []).find((a) => a.name !== 'Select Account')?.id;
      const summaryFilterAccountId = summaryAccountFilterStr ? Number(summaryAccountFilterStr)
        : (summaryFirstAccountId ? Number(summaryFirstAccountId) : null);
      renderTransactionsSummaryList({
        container: gridContainer,
        transactions: allTransactions,
        accounts: currentScenario.accounts || [],
        filterAccountId: summaryFilterAccountId,
        groupByField: state?.getGroupBy?.() || '',
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
    }
  } catch (err) {
    // Keep existing behavior: errors are swallowed here.
  }
}
