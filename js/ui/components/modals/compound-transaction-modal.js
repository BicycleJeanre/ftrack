// compound-transaction-modal.js
// Modal for creating and editing split payment sets with recurrence-first scheduling and strategy-aware UI.

import { createModal } from './modal-factory.js';
import { notifyError } from '../../../shared/notifications.js';
import { openPeriodicChangeModal } from './periodic-change-modal.js';
import { openRecurrenceModal } from './recurrence-modal.js';
import {
  buildTopDownAllocation,
  buildManualAllocation,
  estimateInterestFromAccountRate,
  createTransactionGroupId
} from '../../../domain/calculations/loan-allocation-utils.js';
import { formatDateOnly } from '../../../shared/date-utils.js';
import { getRecurrenceDescription } from '../../../domain/calculations/recurrence-utils.js';

function extractId(value, fallback = 0) {
  if (value && typeof value === 'object' && value.id != null) {
    const fromObj = Number(value.id);
    return Number.isFinite(fromObj) ? fromObj : fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAmountInput(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.abs(value) : 0;
  }
  const cleaned = String(value || '').trim().replace(/,/g, '');
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function toDisplayMoney(value) {
  return Number(parseAmountInput(value) || 0).toFixed(2);
}

function setSelectOptions(selectEl, accounts = [], { includeBlank = true, blankLabel = 'Select Account' } = {}) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  if (includeBlank) {
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = blankLabel;
    selectEl.appendChild(blank);
  }
  (accounts || []).forEach((account) => {
    const id = Number(account?.id || 0);
    if (!id) return;
    const option = document.createElement('option');
    option.value = String(id);
    option.textContent = account?.name || `Account ${id}`;
    selectEl.appendChild(option);
  });
}

function makeOneTimeRecurrence(startDate) {
  return {
    recurrenceType: { id: 1, name: 'One Time' },
    startDate,
    endDate: null,
    interval: null,
    dayOfWeek: null,
    dayOfMonth: null,
    weekOfMonth: null,
    dayOfWeekInMonth: null,
    dayOfQuarter: null,
    month: null,
    dayOfYear: null,
    customDates: null,
    id: null
  };
}

function normalizeRecurrence(rawRecurrence, fallbackStartDate) {
  const recurrence = rawRecurrence && typeof rawRecurrence === 'object'
    ? { ...rawRecurrence }
    : {};
  const startDate = String(recurrence.startDate || fallbackStartDate || '').trim() || fallbackStartDate;
  const typeId = extractId(recurrence.recurrenceType ?? recurrence.recurrenceTypeId, 1) || 1;
  const typeNames = {
    1: 'One Time',
    2: 'Daily',
    3: 'Weekly',
    4: 'Monthly - Day of Month',
    5: 'Monthly - Week of Month',
    6: 'Quarterly',
    7: 'Yearly',
    11: 'Custom Dates'
  };

  return {
    ...makeOneTimeRecurrence(startDate),
    ...recurrence,
    recurrenceType: recurrence.recurrenceType && typeof recurrence.recurrenceType === 'object'
      ? recurrence.recurrenceType
      : { id: typeId, name: typeNames[typeId] || 'One Time' },
    startDate
  };
}

function normalizeInitialSplitSet(splitSet, fallbackDate) {
  const raw = splitSet && typeof splitSet === 'object' ? splitSet : {};
  const components = Array.isArray(raw.components) ? raw.components : [];
  const findRole = (role) =>
    components.find((component) => String(component?.role || '').trim().toLowerCase() === role) || null;
  const principal = findRole('principal');
  const interest = findRole('interest');

  const additional = components.filter((component) => {
    const role = String(component?.role || '').trim().toLowerCase();
    return role && role !== 'principal' && role !== 'interest';
  });

  const effectiveDate = String(raw.effectiveDate || '').trim() || fallbackDate || null;
  const recurrence = normalizeRecurrence(raw.recurrence || null, effectiveDate || fallbackDate);

  return {
    id: String(raw.transactionGroupId || raw.id || '').trim(),
    mode: String(raw.mode || raw.strategy || 'top_down').trim().toLowerCase(),
    description: String(raw.description || '').trim(),
    payingAccountId: Number(raw.primaryAccountId || raw.payingAccountId || 0) || null,
    targetAccountId: Number(raw.targetAccountId || principal?.accountId || principal?.secondaryAccountId || 0) || null,
    effectiveDate,
    recurrence,
    totalAmount: parseAmountInput(raw.totalAmount),
    principalAmount: parseAmountInput(raw.principalAmount ?? principal?.amount ?? principal?.value),
    interestAmount: parseAmountInput(raw.interestAmount ?? interest?.amount ?? interest?.value),
    interestAccountId: Number(raw.interestAccountId || interest?.accountId || interest?.secondaryAccountId || 0) || null,
    additionalComponents: additional.map((component, idx) => ({
      role: String(component?.role || '').trim().toLowerCase() || `additional_${idx + 1}`,
      accountId: Number(component?.accountId || component?.secondaryAccountId || 0) || null,
      amount: parseAmountInput(component?.amount ?? component?.value),
      description: String(component?.description || '').trim(),
      transactionTypeId: Number(component?.transactionTypeId || 2) === 1 ? 1 : 2,
      accountGroupId: Number(component?.accountGroupId || 0) || null,
      recurrence: component?.recurrence || null,
      periodicChange: component?.periodicChange || null
    }))
  };
}

function readAccountRateInfo(account) {
  const periodicChange = account?.periodicChange || null;
  if (!periodicChange) {
    return {
      hasRate: false,
      annualRatePercent: 0,
      balance: Math.abs(Number(account?.startingBalance || 0))
    };
  }

  const modeId = extractId(periodicChange?.changeMode, 0);
  const value = Number(periodicChange?.value || 0);
  const hasRate = modeId === 1 && Number.isFinite(value) && value !== 0;

  return {
    hasRate,
    annualRatePercent: hasRate ? Math.abs(value) : 0,
    balance: Math.abs(Number(account?.startingBalance || 0))
  };
}

function buildAccountGroupLookup(accountGroups = []) {
  const groups = Array.isArray(accountGroups) ? accountGroups : [];
  const validGroups = groups
    .map((group) => ({
      id: Number(group?.id || 0) || null,
      name: String(group?.name || '').trim() || 'Unnamed Group',
      sortOrder: Number(group?.sortOrder || 0) || 0,
      accountIds: Array.isArray(group?.accountIds) ? group.accountIds.map((id) => Number(id || 0)).filter((id) => id > 0) : []
    }))
    .filter((group) => group.id);

  validGroups.sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.name.localeCompare(right.name);
  });

  const byId = new Map(validGroups.map((group) => [group.id, group]));
  const options = validGroups.map((group) => ({ value: String(group.id), label: group.name }));

  const inferPrimaryGroupId = (accountId) => {
    const targetId = Number(accountId || 0);
    if (!targetId) return null;
    const found = validGroups.find((group) => group.accountIds.includes(targetId));
    return found ? found.id : null;
  };

  const labelForId = (groupId) => {
    const id = Number(groupId || 0);
    if (!id) return 'Unassigned';
    return byId.get(id)?.name || `Group ${id}`;
  };

  return {
    options,
    inferPrimaryGroupId,
    labelForId
  };
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

function deriveAccrualDays({ periodicChange, recurrence }) {
  const recurrenceTypeId = extractId(recurrence?.recurrenceType, 1) || 1;
  const recurrenceInterval = Math.max(1, Number(recurrence?.interval || 1) || 1);

  const periodicDays = deriveAccrualDaysFromPeriodicChange(periodicChange);
  const baseDays = periodicDays || RECURRENCE_DAYS[recurrenceTypeId] || RATE_PERIOD_DAYS[2];
  return Math.max(1, Number(baseDays || 0) * recurrenceInterval);
}

function formatDaysLabel(days) {
  if (!Number.isFinite(days)) return 'n/a';
  if (Number.isInteger(days)) return String(days);
  return Number(days).toFixed(2);
}

export function openCompoundTransactionModal({
  accounts = [],
  accountGroups = [],
  defaultPrimaryAccountId = null,
  defaultEffectiveDate = null,
  splitSet = null,
  onSave
} = {}) {
  const today = formatDateOnly(new Date());
  const baseDate = defaultEffectiveDate || today;
  const initial = normalizeInitialSplitSet(splitSet, baseDate);
  const splitSetId = initial.id || createTransactionGroupId();
  const initialMode = initial.mode === 'manual' ? 'manual' : 'top_down';

  const { modal, close } = createModal({ contentClass: 'modal-periodic modal-compound-transaction' });

  modal.innerHTML = `
    <h2 class="modal-periodic-title">${splitSet ? 'Edit Split Payment Set' : 'Create Split Payment Set'}</h2>

    <div class="modal-periodic-form-group">
      <label class="modal-periodic-label">Allocation Strategy:</label>
      <select id="compound-mode" class="modal-periodic-select">
        <option value="top_down">Top-Down (Amount drives principal after derived interest)</option>
        <option value="manual">Manual (enter principal and interest directly)</option>
      </select>
      <div id="compound-mode-hint" class="modal-periodic-hint"></div>
    </div>

    <div class="modal-compound-grid">
      <div class="modal-periodic-form-group">
        <label class="modal-periodic-label">Paying Account (Primary):</label>
        <input id="compound-primary-account-display" class="modal-periodic-input" type="text" readonly>
      </div>
      <div class="modal-periodic-form-group">
        <label class="modal-periodic-label">Description:</label>
        <input id="compound-description" class="modal-periodic-input" type="text" placeholder="Loan Payment" value="${initial.description}">
      </div>
    </div>

    <div class="modal-compound-grid">
      <div class="modal-periodic-form-group">
        <label class="modal-periodic-label">Schedule (Recurrence):</label>
        <button type="button" id="compound-edit-recurrence" class="icon-btn">Edit Recurrence</button>
        <div id="compound-recurrence-summary" class="modal-periodic-hint"></div>
      </div>
      <div class="modal-periodic-form-group">
        <label class="modal-periodic-label">Amount:</label>
        <input id="compound-total" class="modal-periodic-input" type="text" inputmode="decimal" value="${toDisplayMoney(initial.totalAmount)}">
      </div>
    </div>

    <div class="modal-compound-grid">
      <div class="modal-periodic-form-group">
        <label class="modal-periodic-label">Secondary Account (Liability/Principal):</label>
        <select id="compound-target-account" class="modal-periodic-select"></select>
      </div>
      <div class="modal-periodic-form-group" id="compound-target-rate-group">
        <label class="modal-periodic-label">Interest Source:</label>
        <button type="button" id="compound-edit-target-rate" class="icon-btn">Edit Secondary Account Periodic Change</button>
        <div id="compound-rate-summary" class="modal-periodic-hint"></div>
      </div>
    </div>

    <div class="modal-compound-grid" id="compound-principal-interest-row">
      <div class="modal-periodic-form-group">
        <label class="modal-periodic-label">Principal Amount:</label>
        <input id="compound-principal-amount" class="modal-periodic-input" type="text" inputmode="decimal" value="${toDisplayMoney(initial.principalAmount)}">
      </div>
      <div class="modal-periodic-form-group">
        <label class="modal-periodic-label">Interest Amount:</label>
        <input id="compound-interest-amount" class="modal-periodic-input" type="text" inputmode="decimal" value="${toDisplayMoney(initial.interestAmount)}">
      </div>
    </div>

    <div class="modal-compound-grid" id="compound-interest-account-row">
      <div class="modal-periodic-form-group">
        <label class="modal-periodic-label">Interest Account:</label>
        <select id="compound-interest-account" class="modal-periodic-select"></select>
        <div class="modal-periodic-hint">Leave blank to auto-create an interest account on save.</div>
      </div>
    </div>

    <div class="modal-periodic-form-group">
      <div class="modal-compound-inline-title-row">
        <label class="modal-periodic-label">Additional Transactions in This Split Set:</label>
        <button type="button" id="compound-add-component" class="icon-btn" title="Add Additional Transaction">+</button>
      </div>
      <div class="modal-periodic-hint">Additional rows reuse standard transaction fields (type, amount, secondary account, recurrence, periodic change).</div>
      <div class="modal-compound-additional-row modal-compound-additional-row--header" aria-hidden="true">
        <span>Role</span>
        <span>Description</span>
        <span>Secondary</span>
        <span>Type</span>
        <span>Amount</span>
        <span>Split Group</span>
        <span>Rec</span>
        <span>Rate</span>
        <span></span>
      </div>
      <div id="compound-additional-list" class="modal-compound-additional-list"></div>
    </div>

    <div id="compound-preview" class="modal-compound-preview"></div>

    <div class="modal-periodic-actions">
      <button id="compound-cancel" class="icon-btn" title="Cancel">X</button>
      <button id="compound-save" class="icon-btn icon-btn--primary" title="${splitSet ? 'Update' : 'Create'}">Save</button>
    </div>
  `;

  const modeEl = modal.querySelector('#compound-mode');
  const modeHintEl = modal.querySelector('#compound-mode-hint');
  const primaryAccountDisplayEl = modal.querySelector('#compound-primary-account-display');
  const editRecurrenceEl = modal.querySelector('#compound-edit-recurrence');
  const recurrenceSummaryEl = modal.querySelector('#compound-recurrence-summary');
  const descriptionEl = modal.querySelector('#compound-description');
  const totalEl = modal.querySelector('#compound-total');
  const targetAccountEl = modal.querySelector('#compound-target-account');
  const editTargetRateEl = modal.querySelector('#compound-edit-target-rate');
  const rateSummaryEl = modal.querySelector('#compound-rate-summary');
  const principalAmountEl = modal.querySelector('#compound-principal-amount');
  const interestAmountEl = modal.querySelector('#compound-interest-amount');
  const interestAccountEl = modal.querySelector('#compound-interest-account');
  const additionalListEl = modal.querySelector('#compound-additional-list');
  const addComponentBtn = modal.querySelector('#compound-add-component');
  const previewEl = modal.querySelector('#compound-preview');
  const cancelEl = modal.querySelector('#compound-cancel');
  const saveEl = modal.querySelector('#compound-save');

  const selectableAccounts = (accounts || []).filter((account) => account?.name !== 'Select Account');
  const accountById = new Map(
    selectableAccounts
      .map((account) => [Number(account?.id || 0), { ...account }])
      .filter(([id]) => id > 0)
  );
  const accountGroupLookup = buildAccountGroupLookup(accountGroups);
  const additionalMeta = new WeakMap();

  const firstId = Number(selectableAccounts[0]?.id || 0) || null;
  const primaryAccountId = Number(initial.payingAccountId || defaultPrimaryAccountId || firstId || 0) || null;

  setSelectOptions(targetAccountEl, selectableAccounts, { includeBlank: true });
  setSelectOptions(interestAccountEl, selectableAccounts, {
    includeBlank: true,
    blankLabel: 'Auto-create Interest Account'
  });

  targetAccountEl.value = String(Number(initial.targetAccountId || 0) || '');
  interestAccountEl.value = String(Number(initial.interestAccountId || 0) || '');
  modeEl.value = initialMode;

  let targetPeriodicChangeTouched = false;
  let editedTargetPeriodicChange = undefined;
  let recurrenceDraft = normalizeRecurrence(initial.recurrence, initial.effectiveDate || baseDate);

  function applyMoneyFormatOnBlur(inputEl) {
    inputEl.addEventListener('blur', () => {
      inputEl.value = toDisplayMoney(parseAmountInput(inputEl.value));
    });
  }

  [totalEl, principalAmountEl, interestAmountEl].forEach(applyMoneyFormatOnBlur);

  function getTargetAccount() {
    return accountById.get(Number(targetAccountEl.value || 0)) || null;
  }

  function getPrimaryAccount() {
    return accountById.get(Number(primaryAccountId || 0)) || null;
  }

  function updatePrimaryAccountDisplay() {
    const account = getPrimaryAccount();
    primaryAccountDisplayEl.value = account?.name || 'No primary account selected';
  }

  function updateRecurrenceSummary() {
    const summary = getRecurrenceDescription(recurrenceDraft);
    recurrenceSummaryEl.textContent = summary || 'No recurrence set';
  }

  function buildAccrualContext() {
    const targetAccount = getTargetAccount();
    const periodicChange = targetAccount?.periodicChange || null;
    const days = deriveAccrualDays({ periodicChange, recurrence: recurrenceDraft });
    const estimatedInterest = estimateInterestFromAccountRate({
      account: targetAccount,
      days,
      interestSource: 'account_rate'
    });
    return {
      targetAccount,
      periodicChange,
      days,
      estimatedInterest
    };
  }

  function updateRateSummary() {
    const { targetAccount, days } = buildAccrualContext();
    if (!targetAccount) {
      rateSummaryEl.textContent = 'Select a secondary account to use or configure periodic-change interest settings.';
      return;
    }

    const rateInfo = readAccountRateInfo(targetAccount);
    const daysLabel = formatDaysLabel(days);

    if (rateInfo.hasRate) {
      rateSummaryEl.textContent =
        `Rate ready: ${rateInfo.annualRatePercent.toFixed(4)}% annual, balance ${toDisplayMoney(rateInfo.balance)}, derived accrual ${daysLabel} day(s)/cycle.`;
      return;
    }

    if (targetAccount.periodicChange) {
      rateSummaryEl.textContent = `Periodic change is set but not a percentage-rate mode. Derived accrual: ${daysLabel} day(s)/cycle.`;
    } else {
      rateSummaryEl.textContent = `No periodic-change rate set. Derived accrual: ${daysLabel} day(s)/cycle. Use Edit Secondary Account Periodic Change.`;
    }
  }

  function createAdditionalRow({
    role = 'additional',
    accountId = null,
    amount = 0,
    description = '',
    transactionTypeId = 2,
    accountGroupId = null,
    recurrence = null,
    periodicChange = null
  } = {}) {
    const row = document.createElement('div');
    row.className = 'modal-compound-additional-row';

    const roleInput = document.createElement('input');
    roleInput.type = 'text';
    roleInput.className = 'modal-periodic-input';
    roleInput.placeholder = 'fee / extra / tax';
    roleInput.value = String(role || '');
    roleInput.dataset.field = 'role';

    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'modal-periodic-input';
    descInput.placeholder = 'Description';
    descInput.value = String(description || '');
    descInput.dataset.field = 'description';

    const accountSelect = document.createElement('select');
    accountSelect.className = 'modal-periodic-select';
    accountSelect.dataset.field = 'account';
    setSelectOptions(accountSelect, selectableAccounts, { includeBlank: true });
    accountSelect.value = String(Number(accountId || 0) || '');

    const typeSelect = document.createElement('select');
    typeSelect.className = 'modal-periodic-select';
    typeSelect.dataset.field = 'type';
    typeSelect.innerHTML = `
      <option value="2">Money Out</option>
      <option value="1">Money In</option>
    `;
    typeSelect.value = String(Number(transactionTypeId || 2) === 1 ? 1 : 2);

    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.inputMode = 'decimal';
    amountInput.className = 'modal-periodic-input';
    amountInput.placeholder = '0.00';
    amountInput.value = toDisplayMoney(amount);
    amountInput.dataset.field = 'amount';
    applyMoneyFormatOnBlur(amountInput);

    const groupSelect = document.createElement('select');
    groupSelect.className = 'modal-periodic-select';
    groupSelect.dataset.field = 'group';
    groupSelect.innerHTML = '<option value="">Auto Group (from account)</option>';
    accountGroupLookup.options.forEach((option) => {
      const groupOption = document.createElement('option');
      groupOption.value = option.value;
      groupOption.textContent = option.label;
      groupSelect.appendChild(groupOption);
    });
    groupSelect.value = String(Number(accountGroupId || 0) || '');

    const recurrenceBtn = document.createElement('button');
    recurrenceBtn.type = 'button';
    recurrenceBtn.className = 'icon-btn';
    recurrenceBtn.dataset.field = 'recurrence';
    recurrenceBtn.title = 'Configure recurrence';

    const periodicBtn = document.createElement('button');
    periodicBtn.type = 'button';
    periodicBtn.className = 'icon-btn';
    periodicBtn.dataset.field = 'periodic';
    periodicBtn.title = 'Configure periodic change';

    const updateScheduleButtons = () => {
      const meta = additionalMeta.get(row) || { recurrence: null, periodicChange: null };
      recurrenceBtn.textContent = meta.recurrence ? 'Rec: Set' : 'Rec: None';
      periodicBtn.textContent = meta.periodicChange ? 'Rate: Set' : 'Rate: None';
    };

    additionalMeta.set(row, {
      recurrence: recurrence || null,
      periodicChange: periodicChange || null
    });
    updateScheduleButtons();

    recurrenceBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      const meta = additionalMeta.get(row) || { recurrence: null, periodicChange: null };
      await openRecurrenceModal(meta.recurrence || recurrenceDraft, (nextRecurrence) => {
        additionalMeta.set(row, {
          ...meta,
          recurrence: nextRecurrence || null
        });
        updateScheduleButtons();
        recompute();
      });
    });

    periodicBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      const meta = additionalMeta.get(row) || { recurrence: null, periodicChange: null };
      await openPeriodicChangeModal(meta.periodicChange || null, (nextPeriodicChange) => {
        additionalMeta.set(row, {
          ...meta,
          periodicChange: nextPeriodicChange || null
        });
        updateScheduleButtons();
        recompute();
      });
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'icon-btn';
    removeBtn.textContent = 'X';
    removeBtn.title = 'Remove additional transaction';
    removeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      row.remove();
      recompute();
    });

    [roleInput, descInput, accountSelect, typeSelect, amountInput, groupSelect].forEach((el) => {
      el.addEventListener('input', recompute);
      el.addEventListener('change', recompute);
    });

    row.appendChild(roleInput);
    row.appendChild(descInput);
    row.appendChild(accountSelect);
    row.appendChild(typeSelect);
    row.appendChild(amountInput);
    row.appendChild(groupSelect);
    row.appendChild(recurrenceBtn);
    row.appendChild(periodicBtn);
    row.appendChild(removeBtn);
    additionalListEl.appendChild(row);
  }

  (initial.additionalComponents || []).forEach((component) => {
    createAdditionalRow(component);
  });

  function readAdditionalComponents() {
    return Array.from(additionalListEl.querySelectorAll('.modal-compound-additional-row'))
      .map((row, idx) => {
        const role = String(row.querySelector('[data-field="role"]')?.value || '').trim().toLowerCase();
        const accountId = Number(row.querySelector('[data-field="account"]')?.value || 0) || null;
        const typeId = Number(row.querySelector('[data-field="type"]')?.value || 2) === 1 ? 1 : 2;
        const amount = parseAmountInput(row.querySelector('[data-field="amount"]')?.value);
        const description = String(row.querySelector('[data-field="description"]')?.value || '').trim();
        const explicitGroupId = Number(row.querySelector('[data-field="group"]')?.value || 0) || null;
        const meta = additionalMeta.get(row) || { recurrence: null, periodicChange: null };

        return {
          role: role || `additional_${idx + 1}`,
          secondaryAccountId: accountId,
          accountId,
          transactionTypeId: typeId,
          amount,
          value: amount,
          description,
          accountGroupId: explicitGroupId || accountGroupLookup.inferPrimaryGroupId(accountId),
          recurrence: meta.recurrence || null,
          periodicChange: meta.periodicChange || null,
          amountMode: 'fixed',
          order: idx + 2
        };
      })
      .filter((component) => component.amount > 0);
  }

  function updateModeVisibility(nextMode) {
    const manualMode = nextMode === 'manual';
    totalEl.readOnly = manualMode;
    principalAmountEl.readOnly = !manualMode;
    interestAmountEl.readOnly = !manualMode;
  }

  function updateModeHints({ mode: nextMode }) {
    if (nextMode === 'manual') {
      modeHintEl.textContent = 'Manual: enter principal and interest directly. Amount is calculated from components.';
      return;
    }
    modeHintEl.textContent = 'Top-Down: enter Amount; interest is estimated from secondary-account periodic change and principal gets the remainder.';
  }

  function recompute() {
    const nextMode = String(modeEl.value || 'top_down');
    const additionalComponents = readAdditionalComponents();

    updateModeVisibility(nextMode);
    updateModeHints({ mode: nextMode });
    updatePrimaryAccountDisplay();
    updateRecurrenceSummary();
    updateRateSummary();

    const { targetAccount, days, estimatedInterest } = buildAccrualContext();

    let allocation;
    if (nextMode === 'manual') {
      allocation = buildManualAllocation({
        principalAmount: parseAmountInput(principalAmountEl.value),
        interestAmount: parseAmountInput(interestAmountEl.value),
        feeAmount: 0,
        additionalComponents
      });
      totalEl.value = toDisplayMoney(allocation.totalAmount);
    } else {
      allocation = buildTopDownAllocation({
        totalAmount: parseAmountInput(totalEl.value),
        interestAmount: estimatedInterest,
        feeAmount: 0,
        additionalComponents
      });
      interestAmountEl.value = toDisplayMoney(allocation.interestAmount);
      principalAmountEl.value = toDisplayMoney(allocation.principalAmount);
    }

    const additionalAmount = Number(allocation?.additionalAmount || 0);
    const allocationFormula =
      `Allocation: Principal ${toDisplayMoney(allocation.principalAmount)} + ` +
      `Interest ${toDisplayMoney(allocation.interestAmount)} + ` +
      `Additional ${toDisplayMoney(additionalAmount)} = Amount ${toDisplayMoney(allocation.totalAmount)}`;

    let interestFormula = `Interest estimate uses derived accrual ${formatDaysLabel(days)} day(s) per cycle.`;
    if (!targetAccount) {
      interestFormula = 'Interest estimate unavailable: select a secondary account.';
    } else {
      const rateInfo = readAccountRateInfo(targetAccount);
      if (!rateInfo.hasRate) {
        interestFormula = 'Interest estimate unavailable: set a percentage periodic-change rate on the secondary account.';
      }
    }

    previewEl.innerHTML = `
      <div>${allocationFormula}</div>
      <div class="modal-periodic-hint">${interestFormula}</div>
    `;

    return {
      allocation,
      additionalComponents,
      modeValue: nextMode,
      accrualDays: days
    };
  }

  function collectComponents({ additionalComponents, splitRecurrence }) {
    const targetAccountId = Number(targetAccountEl.value || 0) || null;
    const components = [];
    const principalAmount = parseAmountInput(principalAmountEl.value);
    const interestAmount = parseAmountInput(interestAmountEl.value);

    const principalGroupId = accountGroupLookup.inferPrimaryGroupId(targetAccountId);
    const interestAccountId = Number(interestAccountEl.value || 0) || null;
    const interestGroupId = accountGroupLookup.inferPrimaryGroupId(interestAccountId);

    components.push({
      role: 'principal',
      accountId: targetAccountId,
      secondaryAccountId: targetAccountId,
      transactionTypeId: 2,
      amount: principalAmount,
      value: principalAmount,
      amountMode: 'remainder',
      order: 0,
      description: 'Principal',
      accountGroupId: principalGroupId || null,
      recurrence: splitRecurrence,
      periodicChange: null
    });

    components.push({
      role: 'interest',
      accountId: interestAccountId,
      secondaryAccountId: interestAccountId,
      transactionTypeId: 2,
      amount: interestAmount,
      value: interestAmount,
      amountMode: 'derived',
      order: 1,
      description: 'Interest',
      accountGroupId: interestGroupId || null,
      recurrence: splitRecurrence,
      periodicChange: null
    });

    const additionalWithFallback = additionalComponents.map((component) => ({
      ...component,
      recurrence: component?.recurrence || splitRecurrence || null
    }));
    components.push(...additionalWithFallback);

    return components.filter((component) => Number(component.amount || 0) > 0);
  }

  async function editTargetPeriodicChange() {
    const targetAccountId = Number(targetAccountEl.value || 0) || null;
    if (!targetAccountId) {
      notifyError('Select a secondary account first.');
      return;
    }

    const targetAccount = getTargetAccount();
    await openPeriodicChangeModal(targetAccount?.periodicChange || null, (nextPeriodicChange) => {
      const existing = accountById.get(targetAccountId);
      if (!existing) return;
      existing.periodicChange = nextPeriodicChange || null;
      accountById.set(targetAccountId, existing);
      editedTargetPeriodicChange = nextPeriodicChange || null;
      targetPeriodicChangeTouched = true;
      recompute();
    });
  }

  async function editRecurrence() {
    await openRecurrenceModal(recurrenceDraft, (nextRecurrence) => {
      recurrenceDraft = normalizeRecurrence(nextRecurrence || recurrenceDraft, recurrenceDraft?.startDate || baseDate);
      recompute();
    });
  }

  function guardedSave() {
    const { allocation, additionalComponents, modeValue, accrualDays } = recompute();
    const targetAccountId = Number(targetAccountEl.value || 0) || null;
    const splitRecurrence = normalizeRecurrence(recurrenceDraft, baseDate);
    const effectiveDate = String(splitRecurrence?.startDate || '').trim() || baseDate;

    if (!primaryAccountId) {
      notifyError('Select an account in the transactions filter first. That account is used as the paying account.');
      return;
    }

    if (!effectiveDate) {
      notifyError('Set a recurrence start date.');
      return;
    }

    if (!targetAccountId && allocation.principalAmount > 0) {
      notifyError('Select a secondary liability/principal account.');
      return;
    }

    if (allocation.totalAmount <= 0) {
      notifyError('Enter a positive Amount or component amounts.');
      return;
    }

    const components = collectComponents({ additionalComponents, splitRecurrence });
    if (!components.length) {
      notifyError('Add at least one split component with amount and account.');
      return;
    }

    const missingAdditional = additionalComponents.find(
      (component) => component.amount > 0 && !component.secondaryAccountId
    );
    if (missingAdditional) {
      notifyError(`Select a secondary account for additional transaction "${missingAdditional.role}".`);
      return;
    }

    if (modeValue === 'top_down') {
      if (!targetAccountId) {
        notifyError('Select a secondary account for top-down allocation.');
        return;
      }
      const targetAccount = accountById.get(targetAccountId) || null;
      const rateInfo = readAccountRateInfo(targetAccount);
      if (!rateInfo.hasRate) {
        notifyError('Secondary account needs a percentage periodic-change rate for top-down allocation.');
        return;
      }
    }

    const interestAccountId = Number(interestAccountEl.value || 0) || null;

    const payload = {
      mode: modeValue,
      strategy: modeValue,
      transactionGroupId: splitSetId,
      id: splitSetId,
      primaryAccountId,
      payingAccountId: primaryAccountId,
      targetAccountId,
      effectiveDate,
      description: String(descriptionEl.value || '').trim(),
      totalAmount: allocation.totalAmount,
      principalAmount: allocation.principalAmount,
      interestAmount: allocation.interestAmount,
      feeAmount: 0,
      principalAccountId: targetAccountId,
      interestAccountId,
      feeAccountId: null,
      interestSource: 'account_rate',
      customRate: 0,
      days: Math.max(1, Number(accrualDays || 0)),
      components,
      recurrence: splitRecurrence
    };

    if (targetPeriodicChangeTouched) {
      payload.targetPeriodicChange = editedTargetPeriodicChange || null;
    }

    if (typeof onSave === 'function') {
      onSave(payload);
    }
    close();
  }

  addComponentBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    createAdditionalRow();
    recompute();
  });

  editTargetRateEl.addEventListener('click', async (event) => {
    event.stopPropagation();
    await editTargetPeriodicChange();
  });

  editRecurrenceEl.addEventListener('click', async (event) => {
    event.stopPropagation();
    await editRecurrence();
  });

  [
    modeEl,
    targetAccountEl,
    totalEl,
    principalAmountEl,
    interestAmountEl,
    interestAccountEl
  ].forEach((el) => {
    el.addEventListener('input', recompute);
    el.addEventListener('change', recompute);
  });

  cancelEl.addEventListener('click', () => close());
  saveEl.addEventListener('click', guardedSave);

  modal.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      guardedSave();
    }
  });

  updatePrimaryAccountDisplay();
  updateRecurrenceSummary();
  recompute();
  return { close };
}
