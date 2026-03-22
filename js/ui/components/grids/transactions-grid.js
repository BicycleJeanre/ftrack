// forecast-transactions-grid.js
// Master transactions grid loader extracted from forecast.js (no behavior change).

import { createGrid, refreshGridData, createTextColumn, createDateColumn, createMoneyColumn, createDeleteColumn, createDuplicateColumn, createListEditor, formatMoneyDisplay } from './grid-factory.js';
import { attachGridHandlers } from './grid-handlers.js';
import { openRecurrenceModal } from '../modals/recurrence-modal.js';
import { openPeriodicChangeModal } from '../modals/periodic-change-modal.js';
import { openTextInputModal } from '../modals/text-input-modal.js';
import { createFilterModal } from '../modals/filter-modal.js';
import { formatDateOnly, parseDateOnly } from '../../../shared/date-utils.js';
import { expandTransactions } from '../../../domain/calculations/transaction-expander.js';
import { getRecurrenceDescription } from '../../../domain/calculations/recurrence-utils.js';
import { getPeriodicChangeDescription } from '../../../domain/calculations/periodic-change-utils.js';
import {
  buildCompoundTransactions,
  estimateInterestFromAccountRate,
  createTransactionGroupId
} from '../../../domain/calculations/loan-allocation-utils.js';
import { calculateCapitalInterestTotals } from '../../transforms/data-aggregators.js';
import { notifyError, confirmDialog } from '../../../shared/notifications.js';
import { normalizeCanonicalTransaction, transformTransactionToRows, mapEditToCanonical } from '../../transforms/transaction-row-transformer.js';
import * as TransactionManager from '../../../app/managers/transaction-manager.js';
import { loadLookup } from '../../../app/services/lookup-service.js';
import { GridStateManager } from './grid-state.js';
import * as DataService from '../../../app/services/data-service.js';
import { formatCurrency } from '../../../shared/format-utils.js';
import { renderMoneyTotals } from '../widgets/toolbar-totals.js';

const {
  getScenario,
  getTransactions,
  createTransaction,
  createAccount,
  getScenarioPeriods,
  saveAccounts,
  assignAccountToGroup
} = DataService;

const transactionsGridState = new GridStateManager('transactions');
let lastTransactionsDetailTable = null;
let lastTransactionsDetailTableReady = false;

function toSplitGroupId(value) {
  const id = String(value == null ? '' : value).trim();
  return id || '';
}

async function findPrincipalTransaction({ scenarioId, transactionGroupId }) {
  const groupId = toSplitGroupId(transactionGroupId);
  if (!groupId || !scenarioId) return null;
  const allTxs = await getTransactions(scenarioId);
  const sameGroup = allTxs.filter((tx) => toSplitGroupId(tx?.transactionGroupId) === groupId);
  if (!sameGroup.length) return null;
  const principal = sameGroup.find((tx) => {
    const role = String(tx?.transactionGroupRole || '').trim().toLowerCase();
    return !role || role === 'principal';
  });
  return principal || sameGroup[0] || null;
}

function buildAccountGroupLabelLookup(accountGroups = []) {
  const groups = Array.isArray(accountGroups) ? accountGroups : [];
  const labelById = new Map(
    groups
      .map((group) => [Number(group?.id || 0), String(group?.name || '').trim() || `Group ${group?.id}`])
      .filter(([id]) => id > 0)
  );

  return {
    getLabel(groupId) {
      const id = Number(groupId || 0);
      if (!id) return 'Unassigned';
      return labelById.get(id) || `Group ${id}`;
    }
  };
}

function getAccountTypeId(account) {
  const typeRaw = account?.type ?? account?.accountType ?? null;
  if (typeRaw && typeof typeRaw === 'object') {
    return Number(typeRaw.id || 0) || null;
  }
  const directNum = Number(typeRaw || 0);
  if (Number.isFinite(directNum) && directNum > 0) return directNum;
  const byName = String(typeRaw || '').trim().toLowerCase();
  if (byName === 'asset') return 1;
  if (byName === 'liability') return 2;
  if (byName === 'equity') return 3;
  if (byName === 'income') return 4;
  if (byName === 'expense') return 5;
  return null;
}

function inferInterestAccountType(targetAccount) {
  const targetTypeId = getAccountTypeId(targetAccount);
  if (targetTypeId === 2) {
    return { id: 5, name: 'Expense', suffix: 'Interest Expense' };
  }
  if (targetTypeId === 1 || targetTypeId === 3 || targetTypeId === 4) {
    return { id: 4, name: 'Income', suffix: 'Interest Income' };
  }
  return { id: 5, name: 'Expense', suffix: 'Interest Expense' };
}

function findPrimaryGroupIdForAccount(accountGroups = [], accountId = null) {
  const targetId = Number(accountId || 0) || null;
  if (!targetId) return null;
  const groups = Array.isArray(accountGroups) ? accountGroups : [];
  const found = groups.find((group) => (
    Array.isArray(group?.accountIds)
      && group.accountIds.some((id) => Number(id || 0) === targetId)
  ));
  return Number(found?.id || 0) || null;
}

function buildUniqueInterestAccountName({ targetAccount, payload, existingAccounts = [], suffix = 'Interest Expense' }) {
  const baseSeed = String(targetAccount?.name || payload?.description || 'Split Payment').trim() || 'Split Payment';
  const baseName = `${baseSeed} ${suffix}`.trim();
  const existingNames = new Set(
    (Array.isArray(existingAccounts) ? existingAccounts : [])
      .map((account) => String(account?.name || '').trim().toLowerCase())
      .filter(Boolean)
  );
  if (!existingNames.has(baseName.toLowerCase())) {
    return baseName;
  }
  let counter = 2;
  while (existingNames.has(`${baseName} ${counter}`.toLowerCase())) {
    counter += 1;
  }
  return `${baseName} ${counter}`;
}

function extractId(value, fallback = 0) {
  if (value && typeof value === 'object' && value.id != null) {
    const fromObj = Number(value.id);
    return Number.isFinite(fromObj) ? fromObj : fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const RATE_PERIOD_DAYS = {
  1: 365.25,
  2: 30.4375,
  3: 91.3125,
  4: 1,
  5: 7
};

const RECURRENCE_DAYS = {
  1: 30.4375,
  2: 1,
  3: 7,
  4: 30.4375,
  5: 30.4375,
  6: 91.3125,
  7: 365.25,
  11: 30.4375
};

function deriveAccrualDaysFromPeriodicChange(periodicChange) {
  if (!periodicChange) return null;

  const changeModeId = extractId(periodicChange.changeMode, 0);
  if (changeModeId === 2) {
    const fixedPeriodId = extractId(periodicChange.period, 0);
    return RATE_PERIOD_DAYS[fixedPeriodId] || null;
  }

  const changeTypeId = extractId(periodicChange.changeType, 0);
  if (changeTypeId === 2) return RATE_PERIOD_DAYS[2];
  if (changeTypeId === 3) return RATE_PERIOD_DAYS[4];
  if (changeTypeId === 4) return RATE_PERIOD_DAYS[3];
  if (changeTypeId === 5) return RATE_PERIOD_DAYS[1];

  if (changeTypeId === 7) {
    const customPeriodId = extractId(periodicChange?.customCompounding?.period, 0);
    return RATE_PERIOD_DAYS[customPeriodId] || RATE_PERIOD_DAYS[extractId(periodicChange.ratePeriod, 0)] || null;
  }

  if (changeTypeId === 8) {
    const compoundingPeriodId = extractId(periodicChange.frequency, 0);
    return RATE_PERIOD_DAYS[compoundingPeriodId] || RATE_PERIOD_DAYS[extractId(periodicChange.ratePeriod, 0)] || null;
  }

  const ratePeriodId = extractId(periodicChange.ratePeriod, 0);
  return RATE_PERIOD_DAYS[ratePeriodId] || null;
}

function deriveAccrualDaysForSplit({ periodicChange, recurrence }) {
  const recurrenceTypeId = extractId(recurrence?.recurrenceType, 1) || 1;
  const recurrenceInterval = Math.max(1, Number(recurrence?.interval || 1) || 1);
  const periodicDays = deriveAccrualDaysFromPeriodicChange(periodicChange);
  const baseDays = periodicDays || RECURRENCE_DAYS[recurrenceTypeId] || RATE_PERIOD_DAYS[2];
  return Math.max(1, Number(baseDays || 0) * recurrenceInterval);
}

async function ensureInterestAccountForPayload({ scenarioId, scenario, payload }) {
  if (!payload || !Array.isArray(payload.components)) {
    return { payload, createdAccountId: null };
  }

  const interestIndex = payload.components.findIndex(
    (component) => String(component?.role || '').trim().toLowerCase() === 'interest'
  );
  if (interestIndex < 0) {
    return { payload, createdAccountId: null };
  }

  const interestComponent = payload.components[interestIndex] || null;
  const interestAmount = Math.abs(Number(
    interestComponent?.amount ??
    interestComponent?.value ??
    payload?.interestAmount ??
    0
  )) || 0;
  if (interestAmount <= 0) {
    return { payload, createdAccountId: null };
  }

  const existingInterestAccountId = Number(
    payload?.interestAccountId ||
    interestComponent?.accountId ||
    interestComponent?.secondaryAccountId ||
    0
  ) || null;
  if (existingInterestAccountId) {
    return { payload, createdAccountId: null };
  }

  const currentAccounts = Array.isArray(scenario?.accounts) ? scenario.accounts : [];
  const targetAccountId = Number(payload?.targetAccountId || 0) || null;
  const targetAccount = currentAccounts.find((account) => Number(account?.id || 0) === targetAccountId) || null;
  const interestType = inferInterestAccountType(targetAccount);
  const accountName = buildUniqueInterestAccountName({
    targetAccount,
    payload,
    existingAccounts: currentAccounts,
    suffix: interestType.suffix
  });

  const createdAccount = await createAccount(scenarioId, {
    name: accountName,
    type: { id: interestType.id, name: interestType.name },
    currency: targetAccount?.currency || { id: 1, name: 'ZAR' },
    startingBalance: 0,
    openDate: payload?.effectiveDate || formatDateOnly(new Date()),
    periodicChange: null
  });

  const createdAccountId = Number(createdAccount?.id || 0) || null;
  if (!createdAccountId) {
    return { payload, createdAccountId: null };
  }

  const targetGroupId = findPrimaryGroupIdForAccount(scenario?.accountGroups || [], targetAccountId);
  if (targetGroupId) {
    await assignAccountToGroup(scenarioId, createdAccountId, targetGroupId);
  }

  const nextPayload = {
    ...payload,
    interestAccountId: createdAccountId,
    components: payload.components.map((component, index) => {
      if (index !== interestIndex) return { ...component };
      return {
        ...component,
        accountId: createdAccountId,
        secondaryAccountId: createdAccountId,
        accountGroupId: Number(component?.accountGroupId || 0) || targetGroupId || null
      };
    })
  };
  return { payload: nextPayload, createdAccountId };
}

function buildSplitSetDraft({ scenario, transactionGroupId }) {
  const groupId = toSplitGroupId(transactionGroupId);
  if (!groupId) return null;

  const allTransactions = Array.isArray(scenario?.transactions) ? scenario.transactions : [];
  const groupedTransactions = allTransactions.filter(
    (txn) => toSplitGroupId(txn?.transactionGroupId) === groupId
  );
  if (!groupedTransactions.length) return null;

  const existingSet = (Array.isArray(scenario?.splitTransactionSets) ? scenario.splitTransactionSets : [])
    .find((set) => toSplitGroupId(set?.id) === groupId) || null;

  const first = groupedTransactions[0];
  const byRole = new Map();
  groupedTransactions.forEach((txn) => {
    const role = String(txn?.transactionGroupRole || '').trim().toLowerCase() || 'adhoc';
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role).push(txn);
  });

  const sumAmount = groupedTransactions.reduce((sum, txn) => sum + Math.abs(Number(txn?.amount || 0)), 0);

  const collapseRole = (role) => {
    const list = byRole.get(role) || [];
    if (!list.length) return { accountId: null, amount: 0, accountGroupId: null, transactionTypeId: 2 };
    const firstByRole = list[0];
    const amount = list.reduce((sum, txn) => sum + Math.abs(Number(txn?.amount || 0)), 0);
    return {
      accountId: Number(firstByRole?.secondaryAccountId || 0) || null,
      amount,
      accountGroupId: Number(firstByRole?.transactionGroupAccountGroupId || 0) || null,
      transactionTypeId: Number(firstByRole?.transactionTypeId || 2) === 1 ? 1 : 2
    };
  };

  const principal = collapseRole('principal');
  const interest = collapseRole('interest');
  const fee = collapseRole('fee');

  const additionalComponents = groupedTransactions
    .filter((txn) => {
      const role = String(txn?.transactionGroupRole || '').trim().toLowerCase();
      return role && role !== 'principal' && role !== 'interest' && role !== 'fee';
    })
    .map((txn, idx) => ({
      role: String(txn?.transactionGroupRole || '').trim().toLowerCase() || `adhoc_${idx + 1}`,
      accountId: Number(txn?.secondaryAccountId || 0) || null,
      transactionTypeId: Number(txn?.transactionTypeId || 2) === 1 ? 1 : 2,
      amount: Math.abs(Number(txn?.amount || 0)),
      description: String(txn?.description || '').trim(),
      accountGroupId: Number(txn?.transactionGroupAccountGroupId || 0) || null,
      recurrence: txn?.recurrence || null,
      periodicChange: txn?.periodicChange || null,
      amountMode: 'fixed',
      order: idx + 3
    }));

  const components = [
    {
      role: 'principal',
      accountId: principal.accountId,
      transactionTypeId: principal.transactionTypeId,
      amount: principal.amount,
      description: 'Principal',
      accountGroupId: principal.accountGroupId,
      recurrence: null,
      periodicChange: null,
      amountMode: 'remainder',
      order: 0
    },
    {
      role: 'interest',
      accountId: interest.accountId,
      transactionTypeId: interest.transactionTypeId,
      amount: interest.amount,
      description: 'Interest',
      accountGroupId: interest.accountGroupId,
      recurrence: null,
      periodicChange: null,
      amountMode: 'derived',
      order: 1
    },
    {
      role: 'fee',
      accountId: fee.accountId,
      transactionTypeId: fee.transactionTypeId,
      amount: fee.amount,
      description: 'Fee',
      accountGroupId: fee.accountGroupId,
      recurrence: null,
      periodicChange: null,
      amountMode: 'fixed',
      order: 2
    },
    ...additionalComponents
  ].filter((component) => Number(component.amount || 0) > 0);

  return {
    id: groupId,
    transactionGroupId: groupId,
    mode: String(existingSet?.strategy || 'manual'),
    strategy: String(existingSet?.strategy || 'manual'),
    description: String(existingSet?.description || first?.description || '').trim(),
    payingAccountId: Number(existingSet?.payingAccountId || first?.primaryAccountId || 0) || null,
    primaryAccountId: Number(existingSet?.payingAccountId || first?.primaryAccountId || 0) || null,
    targetAccountId: Number(existingSet?.targetAccountId || principal.accountId || 0) || null,
    effectiveDate: String(existingSet?.effectiveDate || first?.effectiveDate || '').trim() || null,
    totalAmount: Number(existingSet?.totalAmount || sumAmount || 0),
    interestSource: String(existingSet?.interestSource || 'manual').trim().toLowerCase() || 'manual',
    customRate: Number(existingSet?.customRate || 0) || 0,
    days: Number(existingSet?.days || 30) || 30,
    principalAmount: principal.amount,
    principalAccountId: principal.accountId,
    interestAmount: interest.amount,
    interestAccountId: interest.accountId,
    feeAmount: fee.amount,
    feeAccountId: fee.accountId,
    components
  };
}

function buildSplitSetRecord(payload) {
  const groupId = toSplitGroupId(payload?.transactionGroupId || payload?.id);
  const components = Array.isArray(payload?.components) ? payload.components : [];
  return {
    id: groupId,
    description: String(payload?.description || '').trim(),
    payingAccountId: Number(payload?.primaryAccountId || payload?.payingAccountId || 0) || null,
    effectiveDate: String(payload?.effectiveDate || '').trim() || null,
    strategy: String(payload?.mode || payload?.strategy || 'manual').trim().toLowerCase(),
    targetAccountId: Number(payload?.targetAccountId || 0) || null,
    interestSource: String(payload?.interestSource || 'none').trim().toLowerCase(),
    customRate: Math.abs(Number(payload?.customRate || 0)) || 0,
    days: Math.max(1, Number(payload?.days || 30) || 30),
    totalAmount: Math.abs(Number(payload?.totalAmount || 0)) || 0,
    components: components.map((component, index) => ({
      role: String(component?.role || '').trim().toLowerCase() || `adhoc_${index + 1}`,
      accountId: Number(component?.accountId ?? component?.secondaryAccountId ?? 0) || null,
      transactionTypeId: Number(component?.transactionTypeId || 2) === 1 ? 1 : 2,
      accountGroupId: Number(component?.accountGroupId || 0) || null,
      recurrence: component?.recurrence || null,
      periodicChange: component?.periodicChange || null,
      amountMode: String(component?.amountMode || 'fixed').trim().toLowerCase() || 'fixed',
      value: Math.abs(Number(component?.value ?? component?.amount ?? 0)) || 0,
      description: String(component?.description || '').trim(),
      order: Number.isFinite(Number(component?.order)) ? Number(component.order) : index
    })),
    recurrence: payload?.recurrence || null,
    tags: Array.isArray(payload?.tags) ? payload.tags : []
  };
}

function resolveCanonicalTransactionFromRow({ scenario, rowData }) {
  const transactions = Array.isArray(scenario?.transactions) ? scenario.transactions : [];
  const originalId = Number(
    rowData?.originalTransactionId ||
    String(rowData?.id || '').replace('_flipped', '') ||
    0
  ) || 0;
  if (!originalId) return null;
  return transactions.find((txn) => Number(txn?.id) === originalId) || null;
}

function applySplitSetFilters(rows, {
  splitGroupFilter = '',
  splitRoleFilter = '',
  splitAccountGroupFilter = ''
} = {}) {
  const groupFilter = toSplitGroupId(splitGroupFilter);
  const roleFilter = String(splitRoleFilter || '').trim().toLowerCase();
  const accountGroupFilter = Number(splitAccountGroupFilter || 0) || null;
  let filtered = Array.isArray(rows) ? rows : [];
  if (groupFilter) {
    filtered = filtered.filter((row) => toSplitGroupId(row?.transactionGroupId) === groupFilter);
  }
  if (roleFilter) {
    filtered = filtered.filter((row) => String(row?.transactionGroupRole || '').trim().toLowerCase() === roleFilter);
  }
  if (accountGroupFilter) {
    filtered = filtered.filter((row) => Number(row?.transactionGroupAccountGroupId || 0) === accountGroupFilter);
  }
  return filtered;
}

function collectSplitFilterOptions(transactions = []) {
  const groupIds = Array.from(
    new Set(
      (transactions || [])
        .map((txn) => toSplitGroupId(txn?.transactionGroupId))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const roles = Array.from(
    new Set(
      (transactions || [])
        .map((txn) => String(txn?.transactionGroupRole || '').trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const accountGroupIds = Array.from(
    new Set(
      (transactions || [])
        .map((txn) => Number(txn?.transactionGroupAccountGroupId || 0))
        .filter((id) => id > 0)
    )
  ).sort((a, b) => a - b);

  return { groupIds, roles, accountGroupIds };
}

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

function renderTransactionsRowDetails({ row, rowData, reload, onEditSplitSet }) {
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
  addField('Transaction Group', rowData?.transactionGroupId != null ? String(rowData.transactionGroupId) : 'None');
  addField('Group Role', rowData?.transactionGroupRole || 'None');
  addField('Split Account Group', rowData?.transactionGroupAccountGroupLabel || 'Unassigned');

  if (rowData?.transactionGroupId && typeof onEditSplitSet === 'function') {
    const splitField = document.createElement('div');
    splitField.className = 'grid-detail-field';
    const splitLabel = document.createElement('label');
    splitLabel.className = 'grid-detail-label';
    splitLabel.textContent = 'Split Set';
    const splitAction = document.createElement('button');
    splitAction.type = 'button';
    splitAction.className = 'icon-btn';
    splitAction.textContent = '⇄ Edit';
    splitAction.title = 'Edit split payment set';
    splitAction.addEventListener('click', (event) => {
      event.stopPropagation();
      onEditSplitSet(rowData);
    });
    splitField.appendChild(splitLabel);
    splitField.appendChild(splitAction);
    grid.appendChild(splitField);
  }

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

function ensureTransactionTotalsContainer(container, gridContainer) {
  if (!container) return null;

  let totalsContainer = container.querySelector(':scope > .transaction-totals-container#transactionsContent');
  if (!totalsContainer) {
    totalsContainer = document.createElement('div');
    totalsContainer.className = 'transaction-totals-container';
    totalsContainer.id = 'transactionsContent';
  }

  if (gridContainer?.parentNode === container) {
    if (totalsContainer.parentNode !== container || totalsContainer.nextSibling !== gridContainer) {
      try {
        container.insertBefore(totalsContainer, gridContainer);
      } catch (_) {
        // ignore
      }
    }
  } else if (totalsContainer.parentNode !== container) {
    container.insertBefore(totalsContainer, container.firstChild);
  }

  return totalsContainer;
}

function renderTransactionsSummaryTotals({
  totalsContainer,
  transactions,
  accounts,
  filterAccountId,
  splitGroupFilter = '',
  splitRoleFilter = '',
  splitAccountGroupFilter = ''
}) {
  if (!totalsContainer) return;

  const visibleAccounts = (accounts || []).filter((a) => a.name !== 'Select Account');
  const allPerspectiveRows = (transactions || []).flatMap((tx) => {
    const normalized = normalizeCanonicalTransaction(tx);
    return transformTransactionToRows(normalized, visibleAccounts);
  });

  const displayTransactions = filterAccountId
    ? allPerspectiveRows.filter((r) => Number(r.perspectiveAccountId) === Number(filterAccountId))
    : allPerspectiveRows.filter((r) => !String(r.id).endsWith('_flipped'));

  const filteredTransactions = applySplitSetFilters(displayTransactions, {
    splitGroupFilter,
    splitRoleFilter,
    splitAccountGroupFilter
  });

  const totals = calculateCapitalInterestTotals(filteredTransactions, {
    amountField: 'plannedAmount',
    typeField: 'transactionType',
    typeNameField: 'transactionTypeName',
    typeIdField: 'transactionTypeId',
    capitalField: 'capitalAmount',
    interestField: 'interestAmount',
    roleField: 'transactionGroupRole'
  });

  renderMoneyTotals(totalsContainer, totals);
}

function renderTransactionsSummaryList({
  container,
  transactions,
  splitSets = [],
  accounts,
  onRefresh,
  filterAccountId,
  groupByField,
  splitGroupFilter = '',
  splitRoleFilter = '',
  splitAccountGroupFilter = '',
  splitAccountGroupLabelLookup = null,
  onEditSplitSet = null
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
  const splitSetsById = new Map(
    (Array.isArray(splitSets) ? splitSets : [])
      .map((set) => [toSplitGroupId(set?.id), set])
      .filter(([id]) => Boolean(id))
  );

  // Transform transactions to perspective rows using shared transformer
  const allPerspectiveRows = transactions.flatMap((tx) => {
    const normalized = normalizeCanonicalTransaction(tx);
    return transformTransactionToRows(normalized, visibleAccounts);
  });

  // Filter to current account perspective or show only primary rows
  let displayTransactions = filterAccountId
    ? allPerspectiveRows.filter(r => Number(r.perspectiveAccountId) === Number(filterAccountId))
    : allPerspectiveRows.filter(r => !String(r.id).endsWith('_flipped'));

  displayTransactions = applySplitSetFilters(displayTransactions, {
    splitGroupFilter,
    splitRoleFilter,
    splitAccountGroupFilter
  });

  const splitGroupLabelForId = typeof splitAccountGroupLabelLookup?.getLabel === 'function'
    ? splitAccountGroupLabelLookup.getLabel
    : (groupId) => {
      const id = Number(groupId || 0);
      return id > 0 ? `Group ${id}` : 'Unassigned';
    };
  displayTransactions = displayTransactions.map((tx) => ({
    ...tx,
    transactionGroupAccountGroupLabel: splitGroupLabelForId(tx?.transactionGroupAccountGroupId)
  }));

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
    const isFlippedRow = String(tx.id).endsWith('_flipped');
    const originalTransactionId = tx.originalTransactionId || (isFlippedRow ? String(tx.id).replace('_flipped', '') : tx.id);
    const splitGroupId = toSplitGroupId(tx?.transactionGroupId);
    const splitRole = String(tx?.transactionGroupRole || '').trim().toLowerCase();
    const existingSplitSet = splitGroupId ? (splitSetsById.get(splitGroupId) || null) : null;
    const sourceCanonicalTx = transactions.find(
      (candidate) => Number(candidate?.id || 0) === Number(originalTransactionId)
    ) || null;
    const displayTypeId = Number(tx?.transactionTypeId || 2) === 1 ? 1 : 2;
    const splitPrincipalComponent = Array.isArray(existingSplitSet?.components)
      ? existingSplitSet.components.find((component) => String(component?.role || '').trim().toLowerCase() === 'principal') || null
      : null;
    const defaultSplitTargetAccountId = Number(
      existingSplitSet?.targetAccountId ||
      splitPrincipalComponent?.accountId ||
      sourceCanonicalTx?.secondaryAccountId ||
      tx?.secondaryAccountId ||
      0
    ) || null;
    const splitInterestComponent = Array.isArray(existingSplitSet?.components)
      ? existingSplitSet.components.find((component) => String(component?.role || '').trim().toLowerCase() === 'interest') || null
      : null;
    const inlineSplitEditable = Boolean(splitGroupId) && (!splitRole || splitRole === 'principal');
    const card = document.createElement('div');
    card.className = 'grid-summary-card';

    const content = document.createElement('div');
    content.className = 'grid-summary-content';

    // Use perspective-transformed values with signed amounts
    const typeName = tx.transactionTypeName || (Number(tx.transactionTypeId) === 1 ? 'Money In' : 'Money Out');
    const isMoneyOut = Number(tx.transactionTypeId) === 2;
    const signedAmount = Number(tx.plannedAmount || tx.amount || 0);
    const formattedAmt = formatMoneyDisplay(signedAmount);
    const secondaryName = tx.secondaryAccountName || findAccountName(tx.secondaryAccountId);
    const primaryName = tx.primaryAccountName || findAccountName(tx.primaryAccountId);

    // Line 1: secondary account name + amount (amount pushed right)
    const rowPrimary = document.createElement('div');
    rowPrimary.className = 'grid-summary-row-primary';

    const title = document.createElement('span');
    title.className = 'grid-summary-title';
    title.textContent = secondaryName;

    const amountEl = document.createElement('span');
    amountEl.innerHTML = formattedAmt;

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
    let suppressInlineAutoSave = false;

    let splitFormActions = null;
    const suppressAutoSaveOnce = () => {
      suppressInlineAutoSave = true;
      setTimeout(() => {
        suppressInlineAutoSave = false;
      }, 0);
    };

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
    typeSelect.value = String(displayTypeId);
    if (inlineSplitEditable) {
      typeSelect.title = 'Type is interpreted from the selected account perspective.';
    }

    // -- Account selects --
    const secondaryAccountSelect = buildAccountSelect(
      inlineSplitEditable ? defaultSplitTargetAccountId : tx?.secondaryAccountId,
      true
    );

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
      suppressAutoSaveOnce();
      openRecurrenceModal(currentRecurrence, async (newRec) => {
        currentRecurrence = newRec;
        await updateRecurrenceLabel(newRec);
        updateSplitInlinePreview();
      });
    });
    recurrenceValue.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      suppressAutoSaveOnce();
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
      suppressAutoSaveOnce();
      openPeriodicChangeModal(currentPeriodicChange, async (newPc) => {
        currentPeriodicChange = newPc;
        await updatePeriodicLabel(newPc);
      });
    });
    periodicValue.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      suppressAutoSaveOnce();
    });
    const periodicField = document.createElement('div');
    periodicField.className = 'grid-summary-field form-field--full';
    const periodicFieldLabel = document.createElement('label');
    periodicFieldLabel.className = 'grid-summary-label';
    periodicFieldLabel.textContent = 'Periodic Change';
    periodicField.appendChild(periodicFieldLabel);
    periodicField.appendChild(periodicValue);

    // -- Split Options (reuses the same card form UI for split rows) --
    const splitOptionsField = document.createElement('div');
    splitOptionsField.className = 'grid-summary-field form-field--full tx-split-inline';
    splitOptionsField.style.display = inlineSplitEditable ? 'flex' : 'none';

    const splitOptionsLabel = document.createElement('label');
    splitOptionsLabel.className = 'grid-summary-label';
    splitOptionsLabel.textContent = 'Split Options';

    const splitOptionsBody = document.createElement('div');
    splitOptionsBody.className = 'tx-split-inline-body';

    const splitModeRow = document.createElement('div');
    splitModeRow.className = 'tx-split-inline-row';
    const splitModeLabel = document.createElement('span');
    splitModeLabel.className = 'text-secondary';
    splitModeLabel.textContent = 'Allocation Strategy';
    const splitModeSelect = document.createElement('select');
    splitModeSelect.className = 'grid-summary-input';
    splitModeSelect.innerHTML = `
      <option value="top_down">Top-Down</option>
      <option value="manual">Manual</option>
    `;
    splitModeSelect.value = String(existingSplitSet?.strategy || 'top_down').trim().toLowerCase() === 'manual'
      ? 'manual'
      : 'top_down';
    splitModeRow.appendChild(splitModeLabel);
    splitModeRow.appendChild(splitModeSelect);

    const splitInterestAccountRow = document.createElement('div');
    splitInterestAccountRow.className = 'tx-split-inline-row';
    const splitInterestAccountLabel = document.createElement('span');
    splitInterestAccountLabel.className = 'text-secondary';
    splitInterestAccountLabel.textContent = 'Interest Account';
    const splitInterestAccountSelect = buildAccountSelect(
      splitInterestComponent?.accountId || null,
      true
    );
    const splitInterestNone = splitInterestAccountSelect.querySelector('option[value=""]');
    if (splitInterestNone) {
      splitInterestNone.textContent = 'Auto-create Interest Account';
    }
    splitInterestAccountRow.appendChild(splitInterestAccountLabel);
    splitInterestAccountRow.appendChild(splitInterestAccountSelect);

    const splitAmountsRow = document.createElement('div');
    splitAmountsRow.className = 'tx-split-inline-row tx-split-inline-row--two';

    const splitInterestAmountWrap = document.createElement('div');
    splitInterestAmountWrap.className = 'tx-split-inline-cell';
    const splitInterestAmountLabel = document.createElement('span');
    splitInterestAmountLabel.className = 'text-secondary';
    splitInterestAmountLabel.textContent = 'Interest Amount';
    const splitInterestAmountInput = document.createElement('input');
    splitInterestAmountInput.type = 'number';
    splitInterestAmountInput.step = '0.01';
    splitInterestAmountInput.min = '0';
    splitInterestAmountInput.className = 'grid-summary-input';
    splitInterestAmountInput.value = Number(splitInterestComponent?.value || tx?.interestAmount || 0).toFixed(2);
    splitInterestAmountWrap.appendChild(splitInterestAmountLabel);
    splitInterestAmountWrap.appendChild(splitInterestAmountInput);

    const splitPrincipalAmountWrap = document.createElement('div');
    splitPrincipalAmountWrap.className = 'tx-split-inline-cell';
    const splitPrincipalAmountLabel = document.createElement('span');
    splitPrincipalAmountLabel.className = 'text-secondary';
    splitPrincipalAmountLabel.textContent = 'Principal Amount';
    const splitPrincipalAmountInput = document.createElement('input');
    splitPrincipalAmountInput.type = 'number';
    splitPrincipalAmountInput.step = '0.01';
    splitPrincipalAmountInput.min = '0';
    splitPrincipalAmountInput.className = 'grid-summary-input grid-summary-input--readonly';
    splitPrincipalAmountInput.readOnly = true;
    splitPrincipalAmountInput.value = Number(tx?.capitalAmount || 0).toFixed(2);
    splitPrincipalAmountWrap.appendChild(splitPrincipalAmountLabel);
    splitPrincipalAmountWrap.appendChild(splitPrincipalAmountInput);

    splitAmountsRow.appendChild(splitInterestAmountWrap);
    splitAmountsRow.appendChild(splitPrincipalAmountWrap);

    const splitPeriodicRow = document.createElement('div');
    splitPeriodicRow.className = 'tx-split-inline-row';
    const splitPeriodicLabel = document.createElement('span');
    splitPeriodicLabel.className = 'text-secondary';
    splitPeriodicLabel.textContent = 'Interest Rate Source';
    const splitPeriodicBtn = document.createElement('button');
    splitPeriodicBtn.type = 'button';
    splitPeriodicBtn.className = 'icon-btn';
    splitPeriodicBtn.textContent = 'Edit Secondary Account Periodic Change';
    const splitPeriodicSummary = document.createElement('div');
    splitPeriodicSummary.className = 'modal-periodic-hint';
    splitPeriodicSummary.style.marginLeft = 'auto';
    splitPeriodicRow.appendChild(splitPeriodicLabel);
    splitPeriodicRow.appendChild(splitPeriodicBtn);
    splitPeriodicRow.appendChild(splitPeriodicSummary);

    const splitHint = document.createElement('div');
    splitHint.className = 'modal-periodic-hint';

    splitOptionsBody.appendChild(splitModeRow);
    splitOptionsBody.appendChild(splitInterestAccountRow);
    splitOptionsBody.appendChild(splitAmountsRow);
    splitOptionsBody.appendChild(splitPeriodicRow);
    splitOptionsBody.appendChild(splitHint);
    splitOptionsField.appendChild(splitOptionsLabel);
    splitOptionsField.appendChild(splitOptionsBody);

    if (inlineSplitEditable) {
      splitFormActions = document.createElement('div');
      splitFormActions.className = 'grid-summary-actions split-inline-actions';
      const saveSplitBtn = document.createElement('button');
      saveSplitBtn.className = 'icon-btn icon-btn--primary';
      saveSplitBtn.title = 'Save Split Set';
      saveSplitBtn.textContent = 'Save';
      const cancelSplitBtn = document.createElement('button');
      cancelSplitBtn.className = 'icon-btn';
      cancelSplitBtn.title = 'Cancel Edit';
      cancelSplitBtn.textContent = 'Cancel';
      splitFormActions.appendChild(saveSplitBtn);
      splitFormActions.appendChild(cancelSplitBtn);

      saveSplitBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await doSave();
        exitEdit();
      });

      cancelSplitBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        suppressAutoSaveOnce();
        exitEdit();
        await onRefresh?.();
      });
    }

    let splitTargetPeriodicChangeTouched = false;
    let splitTargetPeriodicChange = null;

    const getSelectedSecondaryAccount = () => {
      const selectedId = Number(secondaryAccountSelect.value || 0) || null;
      if (!selectedId) return null;
      return visibleAccounts.find((account) => Number(account?.id || 0) === selectedId) || null;
    };

    const getSplitRecurrence = () => currentRecurrence || null;

    const getAccrualDays = () => {
      const targetAccount = getSelectedSecondaryAccount();
      const periodicChange = splitTargetPeriodicChangeTouched
        ? splitTargetPeriodicChange
        : (targetAccount?.periodicChange || null);
      return deriveAccrualDaysForSplit({
        periodicChange,
        recurrence: getSplitRecurrence()
      });
    };

    const updateSplitInlinePreview = () => {
      if (!inlineSplitEditable) return;
      const totalAmount = Math.abs(Number(amountInput.value || 0)) || 0;
      const targetAccount = getSelectedSecondaryAccount();
      const recurrence = getSplitRecurrence();
      const accrualDays = getAccrualDays();
      const mode = splitModeSelect.value === 'manual' ? 'manual' : 'top_down';
      let interestAmount = Math.abs(Number(splitInterestAmountInput.value || 0)) || 0;

      if (mode === 'top_down') {
        const effectivePeriodic = splitTargetPeriodicChangeTouched
          ? splitTargetPeriodicChange
          : (targetAccount?.periodicChange || null);
        const estimatedInterest = estimateInterestFromAccountRate({
          account: { ...(targetAccount || {}), periodicChange: effectivePeriodic },
          days: accrualDays,
          interestSource: 'account_rate'
        });
        interestAmount = Math.min(totalAmount, Math.abs(Number(estimatedInterest || 0)));
        splitInterestAmountInput.value = interestAmount.toFixed(2);
      } else {
        interestAmount = Math.min(totalAmount, interestAmount);
      }

      const principalAmount = Math.max(0, totalAmount - interestAmount);
      splitPrincipalAmountInput.value = principalAmount.toFixed(2);

      if (!targetAccount) {
        splitHint.textContent = 'Select a secondary account to compute split allocation.';
        splitPeriodicSummary.textContent = 'No secondary account selected.';
        return;
      }

      const effectivePeriodic = splitTargetPeriodicChangeTouched
        ? splitTargetPeriodicChange
        : (targetAccount?.periodicChange || null);
      const hasPeriodic = Boolean(effectivePeriodic);
      splitPeriodicSummary.textContent = hasPeriodic
        ? `Derived accrual: ${Number(accrualDays).toFixed(2)} day(s) per cycle.`
        : 'No periodic change set on secondary account.';
      splitHint.textContent = mode === 'manual'
        ? `Manual allocation: principal ${principalAmount.toFixed(2)} + interest ${interestAmount.toFixed(2)} = amount ${totalAmount.toFixed(2)}.`
        : `Top-down allocation: amount ${totalAmount.toFixed(2)} with interest estimated from secondary-account periodic change.`;
    };

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
    if (inlineSplitEditable) {
      form.appendChild(splitOptionsField);
      splitModeSelect.addEventListener('change', updateSplitInlinePreview);
      splitInterestAmountInput.addEventListener('input', updateSplitInlinePreview);
      amountInput.addEventListener('input', updateSplitInlinePreview);
      secondaryAccountSelect.addEventListener('change', updateSplitInlinePreview);
      splitPeriodicBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        suppressAutoSaveOnce();
        const targetAccount = getSelectedSecondaryAccount();
        if (!targetAccount) {
          notifyError('Select a secondary account first.');
          return;
        }
        const currentValue = splitTargetPeriodicChangeTouched
          ? splitTargetPeriodicChange
          : (targetAccount?.periodicChange || null);
        openPeriodicChangeModal(currentValue, (nextPeriodicChange) => {
          splitTargetPeriodicChangeTouched = true;
          splitTargetPeriodicChange = nextPeriodicChange || null;
          updateSplitInlinePreview();
        });
      });
      splitPeriodicBtn.addEventListener('mousedown', (event) => {
        event.stopPropagation();
        suppressAutoSaveOnce();
      });
      updateSplitInlinePreview();
      if (splitFormActions) {
        form.appendChild(splitFormActions);
      }
    }

    async function handleDocMouseDown(e) {
      if (suppressInlineAutoSave) return;
      if (document.querySelector('.modal-overlay')) return;
      if (!card.contains(e.target)) {
        document.removeEventListener('mousedown', handleDocMouseDown);
        if (!inlineSplitEditable) {
          exitEdit();
          await doSave();
        }
      }
    }

    const enterEdit = () => {
      form.style.display = 'grid';
      content.style.display = 'none';
      actions.style.display = inlineSplitEditable ? 'flex' : 'none';
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

      if (inlineSplitEditable) {
        const sourceTx = allTxs[idx];
        const primaryAccountId = Number(sourceTx?.primaryAccountId || 0) || null;
        const targetAccountId = secondaryAccountSelect.value ? Number(secondaryAccountSelect.value) : null;
        const totalAmount = Math.abs(Number(amountInput.value || 0)) || 0;
        if (!primaryAccountId) {
          notifyError('Primary account is required for split transactions.');
          return;
        }
        if (!targetAccountId) {
          notifyError('Select a secondary account for the split transaction.');
          return;
        }
        if (totalAmount <= 0) {
          notifyError('Amount must be greater than zero.');
          return;
        }

        const modeValue = splitModeSelect.value === 'manual' ? 'manual' : 'top_down';
        const splitRecurrence = currentRecurrence || null;
        const effectiveDateValue = dateInput.value || sourceTx?.effectiveDate || formatDateOnly(new Date());
        const scenarioBefore = await getScenario(scenario);
        const targetAccountFromScenario = (scenarioBefore?.accounts || []).find(
          (account) => Number(account?.id || 0) === targetAccountId
        ) || null;

        if (splitTargetPeriodicChangeTouched) {
          const nextAccounts = (scenarioBefore?.accounts || []).map((account) => (
            Number(account?.id || 0) === targetAccountId
              ? { ...account, periodicChange: splitTargetPeriodicChange || null }
              : account
          ));
          await saveAccounts(scenario, nextAccounts);
        }

        const effectiveTargetPeriodic = splitTargetPeriodicChangeTouched
          ? splitTargetPeriodicChange
          : (targetAccountFromScenario?.periodicChange || null);
        const accrualDays = deriveAccrualDaysForSplit({
          periodicChange: effectiveTargetPeriodic,
          recurrence: splitRecurrence
        });

        let interestAmount = Math.abs(Number(splitInterestAmountInput.value || 0)) || 0;
        if (modeValue === 'top_down') {
          const estimatedInterest = estimateInterestFromAccountRate({
            account: { ...(targetAccountFromScenario || {}), periodicChange: effectiveTargetPeriodic },
            days: accrualDays,
            interestSource: 'account_rate'
          });
          interestAmount = Math.min(totalAmount, Math.abs(Number(estimatedInterest || 0)));
          splitInterestAmountInput.value = interestAmount.toFixed(2);
        } else {
          interestAmount = Math.min(totalAmount, interestAmount);
        }
        const principalAmount = Math.max(0, totalAmount - interestAmount);
        splitPrincipalAmountInput.value = principalAmount.toFixed(2);

        const groupId = splitGroupId || createTransactionGroupId();
        const interestAccountId = splitInterestAccountSelect.value
          ? Number(splitInterestAccountSelect.value)
          : null;
        const selectedDisplayTypeId = Number(typeSelect.value || displayTypeId || 2) === 1 ? 1 : 2;
        const componentTypeId = isFlippedRow
          ? (selectedDisplayTypeId === 1 ? 2 : 1)
          : selectedDisplayTypeId;
        const targetGroupId = findPrimaryGroupIdForAccount(scenarioBefore?.accountGroups || [], targetAccountId);
        const interestGroupId = findPrimaryGroupIdForAccount(
          scenarioBefore?.accountGroups || [],
          interestAccountId
        );
        const preservedAdditionalComponents = Array.isArray(existingSplitSet?.components)
          ? existingSplitSet.components
            .filter((component) => {
              const role = String(component?.role || '').trim().toLowerCase();
              return role && role !== 'principal' && role !== 'interest';
            })
            .map((component, index) => ({
              role: String(component?.role || '').trim().toLowerCase() || `additional_${index + 1}`,
              accountId: Number(component?.accountId || 0) || null,
              secondaryAccountId: Number(component?.accountId || 0) || null,
              transactionTypeId: Number(component?.transactionTypeId || componentTypeId || 2) === 1 ? 1 : 2,
              amount: Math.abs(Number(component?.value ?? component?.amount ?? 0)) || 0,
              value: Math.abs(Number(component?.value ?? component?.amount ?? 0)) || 0,
              description: String(component?.description || '').trim(),
              amountMode: String(component?.amountMode || 'fixed').trim().toLowerCase() || 'fixed',
              accountGroupId: Number(component?.accountGroupId || 0) || null,
              recurrence: component?.recurrence || splitRecurrence || null,
              periodicChange: component?.periodicChange || null,
              order: Number.isFinite(Number(component?.order)) ? Number(component.order) : index + 2
            }))
            .filter((component) => component.amount > 0 && component.secondaryAccountId)
          : [];

        let workingPayload = {
          mode: modeValue,
          strategy: modeValue,
          transactionGroupId: groupId,
          id: groupId,
          primaryAccountId,
          payingAccountId: primaryAccountId,
          targetAccountId,
          effectiveDate: effectiveDateValue,
          description: descInput.value.trim(),
          totalAmount,
          principalAmount,
          interestAmount,
          feeAmount: 0,
          principalAccountId: targetAccountId,
          interestAccountId,
          feeAccountId: null,
          interestSource: modeValue === 'manual' ? 'manual' : 'account_rate',
          customRate: 0,
          days: Math.max(1, Number(accrualDays || 0)),
          recurrence: splitRecurrence,
          tags: [...cardTags],
          components: [
            {
              role: 'principal',
              accountId: targetAccountId,
              secondaryAccountId: targetAccountId,
              transactionTypeId: componentTypeId,
              amount: principalAmount,
              value: principalAmount,
              description: 'Principal',
              amountMode: modeValue === 'manual' ? 'fixed' : 'remainder',
              accountGroupId: targetGroupId || null,
              recurrence: splitRecurrence,
              periodicChange: null,
              order: 0
            },
            {
              role: 'interest',
              accountId: interestAccountId,
              secondaryAccountId: interestAccountId,
              transactionTypeId: componentTypeId,
              amount: interestAmount,
              value: interestAmount,
              description: 'Interest',
              amountMode: modeValue === 'manual' ? 'fixed' : 'derived',
              accountGroupId: interestGroupId || null,
              recurrence: splitRecurrence,
              periodicChange: null,
              order: 1
            },
            ...preservedAdditionalComponents
          ]
        };

        const scenarioAfterRate = await getScenario(scenario);
        const ensuredInterest = await ensureInterestAccountForPayload({
          scenarioId: scenario,
          scenario: scenarioAfterRate,
          payload: workingPayload
        });
        workingPayload = ensuredInterest.payload;

        const componentTransactions = buildCompoundTransactions(workingPayload);
        if (!componentTransactions.length) {
          notifyError('Split transaction requires valid principal/interest components.');
          return;
        }

        await TransactionManager.upsertSplitTransactionSet(scenario, {
          splitSet: buildSplitSetRecord(workingPayload),
          componentTransactions,
          replaceTransactionGroupId: groupId
        });
        await onRefresh?.();
        return;
      }

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
        if (suppressInlineAutoSave) return;
        if (document.querySelector('.modal-overlay')) return;
        if (form.style.display !== 'grid') return;
        if (!form.contains(document.activeElement)) {
          if (!inlineSplitEditable) {
            await doSave();
          }
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
        if (!inlineSplitEditable) {
          exitEdit();
          doSave();
        }
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

    const pendingEditId = Number(transactionsGridState?.state?.pendingSummaryEditTransactionId || 0) || null;
    if (pendingEditId && Number(originalTransactionId) === pendingEditId) {
      enterEdit();
      if (inlineSplitEditable) {
        updateSplitInlinePreview();
      }
      transactionsGridState.state.pendingSummaryEditTransactionId = null;
      transactionsGridState.state.pendingSummarySplitInline = false;
    }
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
  const forceSummaryMode = transactionsGridState?.state?.pendingSummarySplitInline
    && workflowConfig?.transactionsMode === 'detail';
  const effectiveTransactionsMode = forceSummaryMode
    ? 'summary'
    : (workflowConfig?.transactionsMode === 'detail' ? 'detail' : 'summary');
  const transactionsModeKey = effectiveTransactionsMode === 'detail' ? 'detail' : 'summary';
  const accountFilterStateKey = `accountFilter:${transactionsModeKey}`;
  const groupByStateKey = `groupBy:${transactionsModeKey}`;
  const splitGroupFilterStateKey = `splitGroupFilter:${transactionsModeKey}`;
  const splitRoleFilterStateKey = `splitRoleFilter:${transactionsModeKey}`;
  const splitAccountGroupFilterStateKey = `splitAccountGroupFilter:${transactionsModeKey}`;
  const groupBySelector = effectiveTransactionsMode === 'detail'
    ? '#tx-grouping-select'
    : '#tx-grouping-select-summary';
  const splitGroupSelector = effectiveTransactionsMode === 'detail'
    ? '#tx-split-group-filter'
    : '#tx-split-group-filter-summary';
  const splitRoleSelector = effectiveTransactionsMode === 'detail'
    ? '#tx-split-role-filter'
    : '#tx-split-role-filter-summary';
  const splitAccountGroupSelector = effectiveTransactionsMode === 'detail'
    ? '#tx-split-account-group-filter'
    : '#tx-split-account-group-filter-summary';

  try {
    const existingTable = tables?.getMasterTransactionsTable?.();
    transactionsGridState.capture(existingTable, {
      [groupByStateKey]: groupBySelector,
      [splitGroupFilterStateKey]: splitGroupSelector,
      [splitRoleFilterStateKey]: splitRoleSelector,
      [splitAccountGroupFilterStateKey]: splitAccountGroupSelector
    });
  } catch (_) {
    // Keep existing behavior: ignore state capture errors.
  }

  const dropdownState = transactionsGridState?.state?.dropdowns || {};
  const splitAccountGroupLabelLookup = buildAccountGroupLabelLookup(currentScenario.accountGroups || []);

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

      if (effectiveTransactionsMode === 'detail') {
        // Detail-mode controls are built later, after periods are available.
        transactionsHeader.classList.add('card-header--filters-inline');
      } else {
        transactionsHeader.classList.add('card-header--filters-inline');
        const splitFilterOptions = collectSplitFilterOptions(currentScenario.transactions || []);

        // Create filter controls
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
        const firstAccountId = (currentScenario.accounts || []).find((a) => a.name !== 'Select Account')?.id;
        const storedSummaryAccount = dropdownState[accountFilterStateKey];
        const defaultSummaryAccount = storedSummaryAccount || (firstAccountId ? String(firstAccountId) : '');
        if (defaultSummaryAccount) {
          accountFilterSelect.value = defaultSummaryAccount;
          transactionsGridState.state.dropdowns[accountFilterStateKey] = defaultSummaryAccount;
        }
        accountFilterSelect.addEventListener('change', (e) => {
          transactionsGridState.state.dropdowns[accountFilterStateKey] = e.target.value;
          loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
        });

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
        const summaryPeriods = state?.getTransactionsPeriods?.() || [];
        summaryPeriods.forEach((p) => {
          const opt = document.createElement('option');
          opt.value = String(p.id);
          opt.textContent = p.label || String(p.id);
          periodSelectSummary.appendChild(opt);
        });
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

        const periodNavSummary = document.createElement('div');
        periodNavSummary.className = 'period-nav';
        periodNavSummary.appendChild(prevBtnSummary);
        periodNavSummary.appendChild(nextBtnSummary);

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
          { value: 'secondaryAccountName', label: 'Secondary Account' },
          { value: 'transactionGroupId', label: 'Transaction Group' },
          { value: 'transactionGroupRole', label: 'Group Role' },
          { value: 'transactionGroupAccountGroupLabel', label: 'Split Account Group' }
        ].forEach(({ value, label }) => {
          const opt = document.createElement('option');
          opt.value = value;
          opt.textContent = label;
          groupBySelectSummary.appendChild(opt);
        });
        const currentGroupBySummary = state?.getGroupBy?.() || '';
        groupBySelectSummary.value = currentGroupBySummary;
        groupBySelectSummary.addEventListener('change', () => {
          transactionsGridState.state.dropdowns[groupByStateKey] = groupBySelectSummary.value;
          state?.setGroupBy?.(groupBySelectSummary.value);
          loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
        });

        const splitGroupSelectSummary = document.createElement('select');
        splitGroupSelectSummary.id = 'tx-split-group-filter-summary';
        splitGroupSelectSummary.className = 'input-select';
        splitGroupSelectSummary.innerHTML = '<option value="">All Split Sets</option>';
        splitFilterOptions.groupIds.forEach((groupId) => {
          const opt = document.createElement('option');
          opt.value = groupId;
          opt.textContent = groupId;
          splitGroupSelectSummary.appendChild(opt);
        });
        splitGroupSelectSummary.value = String(dropdownState[splitGroupFilterStateKey] || '');
        splitGroupSelectSummary.addEventListener('change', () => {
          transactionsGridState.state.dropdowns[splitGroupFilterStateKey] = splitGroupSelectSummary.value;
          loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
        });

        const splitRoleSelectSummary = document.createElement('select');
        splitRoleSelectSummary.id = 'tx-split-role-filter-summary';
        splitRoleSelectSummary.className = 'input-select';
        splitRoleSelectSummary.innerHTML = '<option value="">All Roles</option>';
        splitFilterOptions.roles.forEach((role) => {
          const opt = document.createElement('option');
          opt.value = role;
          opt.textContent = role;
          splitRoleSelectSummary.appendChild(opt);
        });
        splitRoleSelectSummary.value = String(dropdownState[splitRoleFilterStateKey] || '');
        splitRoleSelectSummary.addEventListener('change', () => {
          transactionsGridState.state.dropdowns[splitRoleFilterStateKey] = splitRoleSelectSummary.value;
          loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
        });

        const splitAccountGroupSelectSummary = document.createElement('select');
        splitAccountGroupSelectSummary.id = 'tx-split-account-group-filter-summary';
        splitAccountGroupSelectSummary.className = 'input-select';
        splitAccountGroupSelectSummary.innerHTML = '<option value="">All Split Account Groups</option>';
        splitFilterOptions.accountGroupIds.forEach((groupId) => {
          const opt = document.createElement('option');
          opt.value = String(groupId);
          opt.textContent = splitAccountGroupLabelLookup.getLabel(groupId);
          splitAccountGroupSelectSummary.appendChild(opt);
        });
        splitAccountGroupSelectSummary.value = String(dropdownState[splitAccountGroupFilterStateKey] || '');
        splitAccountGroupSelectSummary.addEventListener('change', () => {
          transactionsGridState.state.dropdowns[splitAccountGroupFilterStateKey] = splitAccountGroupSelectSummary.value;
          loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
        });

        // Create filter button and modal
        const filterButton = document.createElement('button');
        filterButton.type = 'button';
        filterButton.className = 'icon-btn';
        filterButton.title = 'Open filters';
        filterButton.textContent = '⚙';
        filterButton.setAttribute('aria-label', 'Filters');

        const addButton = document.createElement('button');
        addButton.className = 'icon-btn';
        addButton.title = 'Add Transaction';
        addButton.textContent = '+';

        const splitButton = document.createElement('button');
        splitButton.className = 'icon-btn';
        splitButton.title = 'Create Split Payment Set';
        splitButton.textContent = '⇄';

        const refreshButton = document.createElement('button');
        refreshButton.className = 'icon-btn';
        refreshButton.title = 'Refresh Transactions';
        refreshButton.textContent = '⟳';

        const modalActions = document.createElement('div');
        modalActions.className = 'modal-filter-actions';
        modalActions.appendChild(addButton);
        modalActions.appendChild(splitButton);
        modalActions.appendChild(refreshButton);

        const filterModal = createFilterModal({
          id: 'tx-filters-summary-modal',
          title: 'Filter Transactions',
          trigger: filterButton,
          items: [
            { id: 'account', label: 'Account:', control: accountFilterSelect },
            { id: 'period-type', label: 'Period Type:', control: periodTypeSelect },
            { id: 'period', label: 'Period:', control: periodSelectSummary },
            { id: 'period-nav', label: '', control: periodNavSummary },
            { id: 'group-by', label: 'Group By:', control: groupBySelectSummary },
            { id: 'split-group', label: 'Split Set:', control: splitGroupSelectSummary },
            { id: 'split-role', label: 'Role:', control: splitRoleSelectSummary },
            { id: 'split-account-group', label: 'Split Account Group:', control: splitAccountGroupSelectSummary },
            { id: 'actions', label: 'Actions:', control: modalActions }
          ]
        });

        filterButton.style.marginLeft = 'auto';
        controls.appendChild(filterButton);

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
              transactionGroupId: null,
              transactionGroupRole: null,
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

        splitButton.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            currentScenario = scenarioState?.get?.();

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
              notifyError('Please create at least one account before adding a split payment.');
              return;
            }

            const selectedPeriod = actualPeriod ? periods.find((p) => p.id === actualPeriod) : null;
            const defaultEffectiveDate = selectedPeriod
              ? formatDateOnly(selectedPeriod.startDate)
              : (currentScenario?.projection?.config?.startDate || formatDateOnly(new Date()));

            const splitGroupId = createTransactionGroupId();
            const createdDraft = await createTransaction(currentScenario.id, {
              primaryAccountId: defaultAccountId,
              secondaryAccountId: null,
              transactionTypeId: 2,
              amount: 0,
              effectiveDate: defaultEffectiveDate,
              description: '',
              recurrence: null,
              periodicChange: null,
              transactionGroupId: splitGroupId,
              transactionGroupRole: 'principal',
              status: 'planned',
              tags: []
            });

            transactionsGridState.state.pendingSummaryEditTransactionId = Number(createdDraft?.id || 0) || null;
            transactionsGridState.state.pendingSummarySplitInline = true;

            const refreshed = await getScenario(currentScenario.id);
            scenarioState?.set?.(refreshed);
            await loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
          } catch (err) {
            notifyError('Failed to create split transaction draft: ' + (err?.message || String(err)));
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
  const totalsContainer = ensureTransactionTotalsContainer(container, gridContainer);

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
    const summaryAccountFilterStr = effectiveTransactionsMode !== 'detail' ? String(dropdownState[accountFilterStateKey] || '') : '';
    const accountFilterId = summaryAccountFilterStr ? Number(summaryAccountFilterStr) : state?.getTransactionFilterAccountId?.();
    // Don't pre-filter by account - filtering is done during transformation and rendering
    // Account filtering will be applied in detail via applyTransactionsDetailFilters
    // and in summary via renderTransactionsSummaryList with perspective rows

    allTransactions = allTransactions.map((tx) => ({
      ...normalizeCanonicalTransaction(tx),
      _scenarioId: currentScenario.id
    }));

    if (effectiveTransactionsMode === 'detail') {
      // --- Detail mode: full Tabulator grid ---
      gridContainer.classList.add('grid-detail');

      const accounts = currentScenario.accounts || [];
      const splitGroupFilter = String(dropdownState[splitGroupFilterStateKey] || '');
      const splitRoleFilter = String(dropdownState[splitRoleFilterStateKey] || '');
      const splitAccountGroupFilter = String(dropdownState[splitAccountGroupFilterStateKey] || '');

      // Keep all perspective rows (primary + flipped) — setFilter handles which to show
      let displayRows = allTransactions.flatMap((tx) =>
        transformTransactionToRows(tx, accounts)
      ).map((r) => ({
        ...r,
        statusName: r.status?.name || (typeof r.status === 'string' ? r.status : 'planned'),
        transactionGroupAccountGroupLabel: splitAccountGroupLabelLookup.getLabel(r?.transactionGroupAccountGroupId)
      }));

      displayRows = applySplitSetFilters(displayRows, {
        splitGroupFilter,
        splitRoleFilter,
        splitAccountGroupFilter
      });

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
          let freshRows = normalizedTxs
            .flatMap((tx) => transformTransactionToRows(tx, freshAccounts))
            .map((r) => ({
              ...r,
              statusName: r.status?.name || (typeof r.status === 'string' ? r.status : 'planned'),
              transactionGroupAccountGroupLabel: splitAccountGroupLabelLookup.getLabel(r?.transactionGroupAccountGroupId)
            }));

          const liveSplitGroupFilter = String(document.querySelector('#tx-split-group-filter')?.value || '');
          const liveSplitRoleFilter = String(document.querySelector('#tx-split-role-filter')?.value || '');
          const liveSplitAccountGroupFilter = String(document.querySelector('#tx-split-account-group-filter')?.value || '');
          freshRows = applySplitSetFilters(freshRows, {
            splitGroupFilter: liveSplitGroupFilter,
            splitRoleFilter: liveSplitRoleFilter,
            splitAccountGroupFilter: liveSplitAccountGroupFilter
          });
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

      const openSplitSetEditor = async (rowData) => {
        const transactionGroupId = toSplitGroupId(rowData?.transactionGroupId);
        if (!transactionGroupId) {
          notifyError('This row is not part of a split payment set.');
          return;
        }
        try {
          const scenarioForEdit = scenarioState?.get?.() || currentScenario;
          const canonicalTx = resolveCanonicalTransactionFromRow({ scenario: scenarioForEdit, rowData });
          const accountIds = (scenarioForEdit?.accounts || []).map((account) => account.id);
          const canonicalPrimary = Number(canonicalTx?.primaryAccountId || rowData?.primaryAccountId || 0) || null;
          const defaultPrimaryAccountId = accountIds.includes(Number(canonicalPrimary))
            ? Number(canonicalPrimary)
            : (accountIds[0] || null);
          const defaultEffectiveDate = canonicalTx?.effectiveDate || rowData?.effectiveDate
            || (scenarioForEdit?.projection?.config?.startDate || formatDateOnly(new Date()));
          let principalTx = await findPrincipalTransaction({
            scenarioId: scenarioForEdit.id,
            transactionGroupId
          });

          if (!principalTx) {
            const primaryAccountId = defaultPrimaryAccountId || null;
            if (!primaryAccountId) {
              notifyError('Please create at least one account before editing a split payment.');
              return;
            }
            const createdDraft = await createTransaction(scenarioForEdit.id, {
              primaryAccountId,
              secondaryAccountId: null,
              transactionTypeId: 2,
              amount: 0,
              effectiveDate: defaultEffectiveDate,
              description: '',
              recurrence: null,
              periodicChange: null,
              transactionGroupId,
              transactionGroupRole: 'principal',
              status: 'planned',
              tags: []
            });
            principalTx = createdDraft || null;
          }

          if (!principalTx?.id) {
            notifyError('Failed to open split-set editor.');
            return;
          }

          transactionsGridState.state.pendingSummaryEditTransactionId = Number(principalTx.id) || null;
          transactionsGridState.state.pendingSummarySplitInline = true;
          await loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
        } catch (err) {
          notifyError('Failed to open split-set editor: ' + (err?.message || String(err)));
        }
      };

      // --- Build header controls for detail mode (periods now available) ---
      if (transactionsHeader) {
        const controls = transactionsHeader.querySelector('.card-header-controls');
        if (controls) {
          controls.innerHTML = '';
          const splitFilterOptions = collectSplitFilterOptions(currentScenario.transactions || []);

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
          const storedDetailAccount = dropdownState[accountFilterStateKey];
          const detailFirstAccountId = (currentScenario.accounts || []).find((a) => a.name !== 'Select Account')?.id;
          const defaultDetailAccount = storedDetailAccount || (detailFirstAccountId ? String(detailFirstAccountId) : '');
          if (defaultDetailAccount) {
            accountFilterSelect.value = defaultDetailAccount;
            state?.setTransactionsAccountFilterId?.(Number(defaultDetailAccount));
            transactionsGridState.state.dropdowns[accountFilterStateKey] = defaultDetailAccount;
          }
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
            opt.value = pt;
            opt.textContent = pt;
            periodTypeSelect.appendChild(opt);
          });
          periodTypeSelect.value = state?.getActualPeriodType?.() || 'Month';
          periodTypeSelect.addEventListener('change', async () => {
            state?.setActualPeriodType?.(periodTypeSelect.value);
            state?.setTransactionsPeriods?.([]);
            state?.setActualPeriod?.(null);
            await loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
          });

          // Period + ◀ ▶ navigation
          const periodSelect = document.createElement('select');
          periodSelect.id = 'tx-period-select';
          periodSelect.className = 'input-select';
          const allPeriodsOpt = document.createElement('option');
          allPeriodsOpt.value = '';
          allPeriodsOpt.textContent = 'All';
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

          const periodNav = document.createElement('div');
          periodNav.className = 'period-nav';
          periodNav.appendChild(prevBtn);
          periodNav.appendChild(nextBtn);

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

          // Group By
          const groupBySelect = document.createElement('select');
          groupBySelect.id = 'tx-grouping-select';
          groupBySelect.className = 'input-select';
          [
            { value: '', label: 'None' },
            { value: 'transactionTypeName', label: 'Transaction Type' },
            { value: 'primaryAccountName', label: 'Primary Account' },
            { value: 'secondaryAccountName', label: 'Secondary Account' },
            { value: 'statusName', label: 'Status' },
            { value: 'transactionGroupId', label: 'Transaction Group' },
            { value: 'transactionGroupRole', label: 'Group Role' },
            { value: 'transactionGroupAccountGroupLabel', label: 'Split Account Group' }
          ].forEach(({ value, label }) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            groupBySelect.appendChild(opt);
          });
          const detailGroupBy = String(dropdownState[groupByStateKey] || '');
          const currentGroupBy = detailGroupBy || state?.getGroupBy?.() || '';
          groupBySelect.value = currentGroupBy;
          if (currentGroupBy && !detailGroupBy) {
            state?.setGroupBy?.(currentGroupBy);
          }

          groupBySelect.addEventListener('change', () => {
            transactionsGridState.state.dropdowns[groupByStateKey] = groupBySelect.value;
            const field = groupBySelect.value;
            state?.setGroupBy?.(field || '');
            lastTransactionsDetailTable?.setGroupBy?.(field ? [field] : []);
          });

          const splitGroupSelect = document.createElement('select');
          splitGroupSelect.id = 'tx-split-group-filter';
          splitGroupSelect.className = 'input-select';
          splitGroupSelect.innerHTML = '<option value="">All Split Sets</option>';
          splitFilterOptions.groupIds.forEach((groupId) => {
            const opt = document.createElement('option');
            opt.value = groupId;
            opt.textContent = groupId;
            splitGroupSelect.appendChild(opt);
          });
          splitGroupSelect.value = String(dropdownState[splitGroupFilterStateKey] || '');
          splitGroupSelect.addEventListener('change', () => {
            transactionsGridState.state.dropdowns[splitGroupFilterStateKey] = splitGroupSelect.value;
            loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
          });

          const splitRoleSelect = document.createElement('select');
          splitRoleSelect.id = 'tx-split-role-filter';
          splitRoleSelect.className = 'input-select';
          splitRoleSelect.innerHTML = '<option value="">All Roles</option>';
          splitFilterOptions.roles.forEach((role) => {
            const opt = document.createElement('option');
            opt.value = role;
            opt.textContent = role;
            splitRoleSelect.appendChild(opt);
          });
          splitRoleSelect.value = String(dropdownState[splitRoleFilterStateKey] || '');
          splitRoleSelect.addEventListener('change', () => {
            transactionsGridState.state.dropdowns[splitRoleFilterStateKey] = splitRoleSelect.value;
            loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
          });

          const splitAccountGroupSelect = document.createElement('select');
          splitAccountGroupSelect.id = 'tx-split-account-group-filter';
          splitAccountGroupSelect.className = 'input-select';
          splitAccountGroupSelect.innerHTML = '<option value="">All Split Account Groups</option>';
          splitFilterOptions.accountGroupIds.forEach((groupId) => {
            const opt = document.createElement('option');
            opt.value = String(groupId);
            opt.textContent = splitAccountGroupLabelLookup.getLabel(groupId);
            splitAccountGroupSelect.appendChild(opt);
          });
          splitAccountGroupSelect.value = String(dropdownState[splitAccountGroupFilterStateKey] || '');
          splitAccountGroupSelect.addEventListener('change', () => {
            transactionsGridState.state.dropdowns[splitAccountGroupFilterStateKey] = splitAccountGroupSelect.value;
            loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
          });

          // Create filter button and modal
          const filterButton = document.createElement('button');
          filterButton.type = 'button';
          filterButton.className = 'icon-btn';
          filterButton.title = 'Open filters';
          filterButton.textContent = '⚙';
          filterButton.setAttribute('aria-label', 'Filters');

          const addButton = document.createElement('button');
          addButton.className = 'icon-btn';
          addButton.title = 'Add Transaction';
          addButton.textContent = '+';

          const splitButton = document.createElement('button');
          splitButton.className = 'icon-btn';
          splitButton.title = 'Create Split Payment Set';
          splitButton.textContent = '⇄';

          const refreshButton = document.createElement('button');
          refreshButton.className = 'icon-btn';
          refreshButton.title = 'Refresh Transactions';
          refreshButton.textContent = '⟳';

          const modalActions = document.createElement('div');
          modalActions.className = 'modal-filter-actions';
          modalActions.appendChild(addButton);
          modalActions.appendChild(splitButton);
          modalActions.appendChild(refreshButton);

          const filterModal = createFilterModal({
            id: 'tx-filters-detail-modal',
            title: 'Filter Transactions',
            trigger: filterButton,
            items: [
              { id: 'account', label: 'Account:', control: accountFilterSelect },
              { id: 'period-type', label: 'Period Type:', control: periodTypeSelect },
              { id: 'period', label: 'Period:', control: periodSelect },
              { id: 'period-nav', label: '', control: periodNav },
              { id: 'group-by', label: 'Group By:', control: groupBySelect },
              { id: 'split-group', label: 'Split Set:', control: splitGroupSelect },
              { id: 'split-role', label: 'Role:', control: splitRoleSelect },
              { id: 'split-account-group', label: 'Split Account Group:', control: splitAccountGroupSelect },
              { id: 'actions', label: 'Actions:', control: modalActions }
            ]
          });

          filterButton.style.marginLeft = 'auto';
          controls.appendChild(filterButton);

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
                transactionGroupId: null,
                transactionGroupRole: null,
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

          splitButton.addEventListener('click', async (e) => {
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
                notifyError('Please create at least one account before adding a split payment.');
                return;
              }
              const selectedPeriod = actualPeriod ? localPeriods.find((p) => p.id === actualPeriod) : null;
              const defaultEffectiveDate = selectedPeriod
                ? formatDateOnly(selectedPeriod.startDate)
                : (currentScenario?.projection?.config?.startDate || formatDateOnly(new Date()));

              const splitGroupId = createTransactionGroupId();
              const createdDraft = await createTransaction(currentScenario.id, {
                primaryAccountId: defaultAccountId,
                secondaryAccountId: null,
                transactionTypeId: 2,
                amount: 0,
                effectiveDate: defaultEffectiveDate,
                description: '',
                recurrence: null,
                periodicChange: null,
                transactionGroupId: splitGroupId,
                transactionGroupRole: 'principal',
                status: 'planned',
                tags: []
              });

              transactionsGridState.state.pendingSummaryEditTransactionId = Number(createdDraft?.id || 0) || null;
              transactionsGridState.state.pendingSummarySplitInline = true;

              const refreshed = await getScenario(currentScenario.id);
              scenarioState?.set?.(refreshed);
              await loadMasterTransactionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
            } catch (err) {
              notifyError('Failed to open split payment builder: ' + (err?.message || String(err)));
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
        createTextColumn('Group', 'transactionGroupId', { widthGrow: 1 }),
        createTextColumn('Role', 'transactionGroupRole', { widthGrow: 1 }),
        createTextColumn('Split Group', 'transactionGroupAccountGroupLabel', { widthGrow: 1 }),
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
            renderTransactionsRowDetails({
              row,
              rowData: row.getData(),
              reload,
              onEditSplitSet: openSplitSetEditor
            });
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
              [groupByStateKey]: '#tx-grouping-select',
              [splitGroupFilterStateKey]: '#tx-split-group-filter',
              [splitRoleFilterStateKey]: '#tx-split-role-filter',
              [splitAccountGroupFilterStateKey]: '#tx-split-account-group-filter'
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
      if (lastTransactionsDetailTable) {
        try { lastTransactionsDetailTable.destroy?.(); } catch (_) { /* ignore */ }
        lastTransactionsDetailTable = null;
        lastTransactionsDetailTableReady = false;
      }

      // Resolve the summary account filter: stored state, or fall back to first account
      const summaryFirstAccountId = (currentScenario.accounts || []).find((a) => a.name !== 'Select Account')?.id;
      const summaryFilterAccountId = summaryAccountFilterStr ? Number(summaryAccountFilterStr)
        : (summaryFirstAccountId ? Number(summaryFirstAccountId) : null);
      const summarySplitGroupFilter = String(dropdownState[splitGroupFilterStateKey] || '');
      const summarySplitRoleFilter = String(dropdownState[splitRoleFilterStateKey] || '');
      const summarySplitAccountGroupFilter = String(dropdownState[splitAccountGroupFilterStateKey] || '');

      const openSummarySplitSetEditor = async (txRow) => {
        const transactionGroupId = toSplitGroupId(txRow?.transactionGroupId);
        if (!transactionGroupId) {
          notifyError('This transaction is not part of a split payment set.');
          return;
        }
        const canonicalTx = resolveCanonicalTransactionFromRow({ scenario: currentScenario, rowData: txRow });
        const accountIds = (currentScenario.accounts || []).map((account) => account.id);
        const canonicalPrimary = Number(canonicalTx?.primaryAccountId || txRow?.primaryAccountId || 0) || null;
        const defaultPrimaryAccountId = accountIds.includes(Number(canonicalPrimary))
          ? Number(canonicalPrimary)
          : (accountIds[0] || null);
        const defaultEffectiveDate = canonicalTx?.effectiveDate || txRow?.effectiveDate
          || (currentScenario?.projection?.config?.startDate || formatDateOnly(new Date()));
        let principalTx = await findPrincipalTransaction({
          scenarioId: currentScenario.id,
          transactionGroupId
        });

        if (!principalTx) {
          const primaryAccountId = defaultPrimaryAccountId || null;
          if (!primaryAccountId) {
            notifyError('Please create at least one account before editing a split payment.');
            return;
          }
          const createdDraft = await createTransaction(currentScenario.id, {
            primaryAccountId,
            secondaryAccountId: null,
            transactionTypeId: 2,
            amount: 0,
            effectiveDate: defaultEffectiveDate,
            description: '',
            recurrence: null,
            periodicChange: null,
            transactionGroupId,
            transactionGroupRole: 'principal',
            status: 'planned',
            tags: []
          });
          principalTx = createdDraft || null;
        }

        if (!principalTx?.id) {
          notifyError('Failed to open split-set editor.');
          return;
        }

        transactionsGridState.state.pendingSummaryEditTransactionId = Number(principalTx.id) || null;
        transactionsGridState.state.pendingSummarySplitInline = true;

        await loadMasterTransactionsGrid({
          container,
          scenarioState,
          getWorkflowConfig,
          state,
          tables,
          callbacks,
          logger
        });
      };

      renderTransactionsSummaryTotals({
        totalsContainer,
        transactions: allTransactions,
        accounts: currentScenario.accounts || [],
        filterAccountId: summaryFilterAccountId,
        splitGroupFilter: summarySplitGroupFilter,
        splitRoleFilter: summarySplitRoleFilter,
        splitAccountGroupFilter: summarySplitAccountGroupFilter
      });

      renderTransactionsSummaryList({
        container: gridContainer,
        transactions: allTransactions,
        splitSets: currentScenario.splitTransactionSets || [],
        accounts: currentScenario.accounts || [],
        filterAccountId: summaryFilterAccountId,
        groupByField: state?.getGroupBy?.() || '',
        splitGroupFilter: summarySplitGroupFilter,
        splitRoleFilter: summarySplitRoleFilter,
        splitAccountGroupFilter: summarySplitAccountGroupFilter,
        splitAccountGroupLabelLookup,
        onEditSplitSet: openSummarySplitSetEditor,
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
