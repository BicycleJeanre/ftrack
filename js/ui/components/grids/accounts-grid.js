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
import { notifyError, confirmDialog } from '../../../shared/notifications.js';
import { GridStateManager } from './grid-state.js';
import { formatCurrency } from '../../../shared/format-utils.js';

const accountsGridState = new GridStateManager('accounts');
let lastAccountsTable = null;

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
  workflowConfig,
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
    const balanceVal = Number(account?.startingBalance || 0);
    const currency = account?.currency?.code || account?.currency?.name || 'ZAR';
    balanceEl.className = `account-card-balance ${balanceVal > 0 ? 'positive' : balanceVal < 0 ? 'negative' : 'zero'}`;
    balanceEl.textContent = formatCurrency(balanceVal, currency);

    meta.appendChild(typeEl);
    meta.appendChild(balanceEl);

    content.appendChild(nameEl);
    content.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'account-card-actions';

    const duplicateBtn = document.createElement('button');
    duplicateBtn.className = 'icon-btn';
    duplicateBtn.title = 'Duplicate Account';
    duplicateBtn.textContent = '⧉';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn';
    deleteBtn.title = 'Delete Account';
    deleteBtn.textContent = '⨉';

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

    const descriptionInput = document.createElement('input');
    descriptionInput.type = 'text';
    descriptionInput.className = 'accounts-detail-input';
    descriptionInput.value = account?.description || '';
    descriptionInput.placeholder = 'Add a description';

    let goalAmountInput = null;
    let goalDateInput = null;
    if (workflowConfig?.showGeneratePlan) {
      goalAmountInput = document.createElement('input');
      goalAmountInput.type = 'number';
      goalAmountInput.step = '0.01';
      goalAmountInput.className = 'accounts-detail-input';
      goalAmountInput.value = account?.goalAmount ?? '';
      goalAmountInput.placeholder = '0.00';

      goalDateInput = document.createElement('input');
      goalDateInput.type = 'date';
      goalDateInput.className = 'accounts-detail-input';
      goalDateInput.value = account?.goalDate || '';
    }

    // Periodic Change — clickable value field opens the modal
    const periodicValueEl = document.createElement('div');
    periodicValueEl.className = 'accounts-detail-value accounts-detail-value--clickable';
    periodicValueEl.title = 'Click to edit periodic change';
    periodicValueEl.textContent = account?.periodicChangeSummary || 'None';
    periodicValueEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openPeriodicChangeModal(account?.periodicChange, async (newPeriodicChange) => {
        const scenario = scenarioState?.get?.();
        if (!scenario) return;
        try {
          const summary = await getPeriodicChangeDescription(newPeriodicChange);
          await AccountManager.update(scenario.id, account.id, { periodicChange: newPeriodicChange });
          account.periodicChange = newPeriodicChange;
          account.periodicChangeSummary = summary;
          periodicValueEl.textContent = summary || 'None';
        } catch (err) {
          logger?.error?.('[AccountsGrid] Failed to update periodic change', err);
        }
      });
    });
    const periodicFormField = document.createElement('div');
    periodicFormField.className = 'accounts-detail-field form-field--full';
    const periodicFormLabel = document.createElement('label');
    periodicFormLabel.className = 'accounts-detail-label';
    periodicFormLabel.textContent = 'Periodic Change';
    periodicFormField.appendChild(periodicFormLabel);
    periodicFormField.appendChild(periodicValueEl);

    // Tags — inline editor
    const cardTags = [...(account?.tags || [])];
    const tagSuggestions = ['checking', 'savings', 'investment', 'credit-card', 'mortgage', 'auto-loan', 'primary', 'secondary', 'inactive', 'joint'];

    const tagsChipsEl = document.createElement('div');
    tagsChipsEl.className = 'tag-chips';

    const renderCardTags = () => {
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
        chip.querySelector('.tag-remove').addEventListener('click', (e) => {
          e.stopPropagation();
          cardTags.splice(idx, 1);
          renderCardTags();
        });
        tagsChipsEl.appendChild(chip);
      });
    };
    renderCardTags();

    const tagInputRow = document.createElement('div');
    tagInputRow.className = 'tag-input-row';

    const tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.className = 'accounts-detail-input';
    tagInput.placeholder = 'Add tag…';
    tagInput.autocomplete = 'off';
    const tagDatalistId = `tag-suggestions-${account.id}`;
    const tagDatalist = document.createElement('datalist');
    tagDatalist.id = tagDatalistId;
    tagSuggestions.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      tagDatalist.appendChild(opt);
    });
    tagInput.setAttribute('list', tagDatalistId);

    const addTagFn = () => {
      const val = tagInput.value.trim().toLowerCase();
      if (val && !cardTags.includes(val)) {
        cardTags.push(val);
        renderCardTags();
      }
      tagInput.value = '';
    };
    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addTagFn(); }
    });

    const addTagBtn = document.createElement('button');
    addTagBtn.type = 'button';
    addTagBtn.className = 'btn';
    addTagBtn.textContent = 'Add';
    addTagBtn.addEventListener('click', (e) => { e.stopPropagation(); addTagFn(); });

    tagInputRow.appendChild(tagInput);
    tagInputRow.appendChild(tagDatalist);
    tagInputRow.appendChild(addTagBtn);

    const tagsFormField = document.createElement('div');
    tagsFormField.className = 'accounts-detail-field form-field--full';
    const tagsFormLabel = document.createElement('label');
    tagsFormLabel.className = 'accounts-detail-label';
    tagsFormLabel.textContent = 'Tags';
    tagsFormField.appendChild(tagsFormLabel);
    tagsFormField.appendChild(tagsChipsEl);
    tagsFormField.appendChild(tagInputRow);

    // Periodic Change Schedule — auto-saves via modal (conditional)
    let scheduleFormField = null;
    let scheduleValueEl = null;
    if (workflowConfig?.supportsPeriodicChangeSchedule) {
      scheduleValueEl = document.createElement('div');
      scheduleValueEl.className = 'accounts-detail-value';
      scheduleValueEl.textContent = account?.periodicChangeScheduleSummary || 'None';
      const scheduleEditBtn = document.createElement('button');
      scheduleEditBtn.type = 'button';
      scheduleEditBtn.className = 'btn accounts-detail-btn';
      scheduleEditBtn.textContent = 'Edit Schedule';
      scheduleEditBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPeriodicChangeScheduleModal(
          { basePeriodicChange: account?.periodicChange ?? null, schedule: account?.periodicChangeSchedule ?? [] },
          async (newSchedule) => {
            const scenario = scenarioState?.get?.();
            if (!scenario) return;
            try {
              const nextSummary =
                Array.isArray(newSchedule) && newSchedule.length
                  ? `${newSchedule.length} scheduled change${newSchedule.length === 1 ? '' : 's'}`
                  : 'None';
              await AccountManager.update(scenario.id, account.id, { periodicChangeSchedule: newSchedule });
              account.periodicChangeSchedule = newSchedule;
              account.periodicChangeScheduleSummary = nextSummary;
              scheduleValueEl.textContent = nextSummary;
            } catch (err) {
              logger?.error?.('[AccountsGrid] Failed to update periodic change schedule', err);
            }
          }
        );
      });
      scheduleFormField = document.createElement('div');
      scheduleFormField.className = 'accounts-detail-field form-field--full';
      const scheduleFormLabel = document.createElement('label');
      scheduleFormLabel.className = 'accounts-detail-label';
      scheduleFormLabel.textContent = 'Periodic Change Schedule';
      scheduleFormField.appendChild(scheduleFormLabel);
      scheduleFormField.appendChild(scheduleValueEl);
      scheduleFormField.appendChild(scheduleEditBtn);
    }

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
    form.appendChild(createDetailField({ label: 'Description', inputEl: descriptionInput }));
    if (goalAmountInput) form.appendChild(createDetailField({ label: 'Goal Amount', inputEl: goalAmountInput }));
    if (goalDateInput) form.appendChild(createDetailField({ label: 'Goal Date', inputEl: goalDateInput }));
    form.appendChild(periodicFormField);
    form.appendChild(tagsFormField);
    if (scheduleFormField) form.appendChild(scheduleFormField);
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
      if (!await confirmDialog(`Delete account: ${account?.name || 'Untitled'}?`)) return;
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
      descriptionInput.value = account?.description || '';
      if (goalAmountInput) goalAmountInput.value = account?.goalAmount ?? '';
      if (goalDateInput) goalDateInput.value = account?.goalDate || '';
      cardTags.splice(0, cardTags.length, ...(account?.tags || []));
      renderCardTags();
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
      const nextDescription = descriptionInput.value.trim();
      const nextGoalAmountRaw = goalAmountInput?.value;
      const nextGoalAmount = nextGoalAmountRaw === undefined ? undefined
        : nextGoalAmountRaw === '' ? null
        : Number(nextGoalAmountRaw);
      const nextGoalDate = goalDateInput !== null
        ? (goalDateInput?.value || null)
        : undefined;

      const updatePayload = {
        name: nextName,
        type: nextType,
        startingBalance: Number.isNaN(nextBalance) ? 0 : nextBalance,
        description: nextDescription,
        tags: [...cardTags]
      };
      if (nextGoalAmount !== undefined) updatePayload.goalAmount = Number.isNaN(nextGoalAmount) ? null : nextGoalAmount;
      if (nextGoalDate !== undefined) updatePayload.goalDate = nextGoalDate;

      try {
        await AccountManager.update(scenario.id, account.id, updatePayload);

        account.name = nextName;
        account.type = nextType;
        account.startingBalance = Number.isNaN(nextBalance) ? 0 : nextBalance;
        account.description = nextDescription;
        account.tags = [...cardTags];
        if (nextGoalAmount !== undefined) account.goalAmount = updatePayload.goalAmount;
        if (nextGoalDate !== undefined) account.goalDate = nextGoalDate;

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

    const addButton = document.createElement('button');
    addButton.className = 'icon-btn';
    addButton.title = 'Add Account';
    addButton.textContent = '+';

    const refreshButton = document.createElement('button');
    refreshButton.className = 'icon-btn';
    refreshButton.title = 'Refresh Accounts';
    refreshButton.textContent = '⟳';

    if (workflowConfig?.accountsMode === 'detail') {
      accountsHeader.classList.add('card-header--filters-inline');

      const groupByItem = document.createElement('div');
      groupByItem.className = 'header-filter-item';
      const groupByLabel = document.createElement('label');
      groupByLabel.htmlFor = 'account-grouping-select';
      groupByLabel.textContent = 'Group By:';
      const groupBySelect = document.createElement('select');
      groupBySelect.id = 'account-grouping-select';
      groupBySelect.className = 'input-select';
      [
        { value: '', label: 'None' },
        { value: 'accountType', label: 'Account Type' }
      ].forEach(({ value, label }) => {
        const opt = document.createElement('option');
        opt.value = value; opt.textContent = label;
        groupBySelect.appendChild(opt);
      });
      groupByItem.appendChild(groupByLabel);
      groupByItem.appendChild(groupBySelect);
      controls.appendChild(groupByItem);

      const iconActions = document.createElement('div');
      iconActions.className = 'header-icon-actions';
      iconActions.appendChild(addButton);
      iconActions.appendChild(refreshButton);
      controls.appendChild(iconActions);

      groupBySelect.addEventListener('change', () => {
        const field = groupBySelect.value;
        lastAccountsTable?.setGroupBy?.(field ? [field] : []);
      });
    } else {
      accountsHeader.classList.remove('card-header--filters-inline');
      controls.appendChild(addButton);
      controls.appendChild(refreshButton);
    }

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

    const accounts = await AccountManager.getAll(currentScenario.id);
    const displayAccounts = accounts.filter((a) => a.name !== 'Select Account');

    // Enrich with computed summaries so the card form shows correct initial values.
    await Promise.all(
      displayAccounts.map(async (a) => {
        a.periodicChangeSummary = await getPeriodicChangeDescription(a.periodicChange);
        a.periodicChangeScheduleSummary =
          Array.isArray(a.periodicChangeSchedule) && a.periodicChangeSchedule.length
            ? `${a.periodicChangeSchedule.length} scheduled change${a.periodicChangeSchedule.length === 1 ? '' : 's'}`
            : 'None';
      })
    );

    const lookupData = await loadLookup('lookup-data.json');

    let accountsTable = lastAccountsTable;

    // Summary card list for all workflows except those requesting the full detail grid.
    if (workflowConfig?.accountsMode !== 'detail') {
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
      return;
    }

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
      mode: workflowConfig?.accountsMode === 'detail' ? 'detail' : 'summary',
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
