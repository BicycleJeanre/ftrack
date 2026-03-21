// account-group-modal.js
// Modal for creating, editing, and deleting account groups.

import { createModal } from './modal-factory.js';
import { notifyError, confirmDialog } from '../../../shared/notifications.js';
import * as DataService from '../../../app/services/data-service.js';
import { buildAccountGroupIndex, resolveDescendantGroupIds, validateAccountGroups } from '../../../domain/utils/account-group-utils.js';

function toPositiveId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function buildGroupPathMap(groups = []) {
  const index = buildAccountGroupIndex(groups);
  const cache = new Map();

  const getPathLabel = (groupId, seen = new Set()) => {
    const id = toPositiveId(groupId);
    if (!id) return '';
    if (cache.has(id)) return cache.get(id);

    const group = index.get(id);
    if (!group) return '';
    if (seen.has(id)) return group.name || `Group ${id}`;

    const nextSeen = new Set(seen);
    nextSeen.add(id);
    const parentLabel = toPositiveId(group.parentGroupId)
      ? getPathLabel(group.parentGroupId, nextSeen)
      : '';
    const label = parentLabel ? `${parentLabel} / ${group.name || `Group ${id}`}` : (group.name || `Group ${id}`);
    cache.set(id, label);
    return label;
  };

  return { index, getPathLabel };
}

function sortGroups(groups = [], getPathLabel = null) {
  return [...(Array.isArray(groups) ? groups : [])].sort((left, right) => {
    const leftOrder = Number(left?.sortOrder || 0);
    const rightOrder = Number(right?.sortOrder || 0);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    const leftLabel = getPathLabel ? getPathLabel(left.id) : (left?.name || '');
    const rightLabel = getPathLabel ? getPathLabel(right.id) : (right?.name || '');
    return String(leftLabel).localeCompare(String(rightLabel));
  });
}

function normalizeMembershipIds(accountIds = []) {
  return Array.from(new Set((Array.isArray(accountIds) ? accountIds : []).map(toPositiveId).filter(Boolean)));
}

function readFormState({ nameInput, parentSelect, sortOrderInput, memberInputs }) {
  return {
    name: String(nameInput?.value || '').trim(),
    parentGroupId: toPositiveId(parentSelect?.value),
    sortOrder: Number.isFinite(Number(sortOrderInput?.value)) ? Number(sortOrderInput.value) : 0,
    accountIds: normalizeMembershipIds(
      (Array.isArray(memberInputs) ? memberInputs : [])
        .filter((input) => input?.checked)
        .map((input) => input.value)
    )
  };
}

export async function openAccountGroupModal({
  scenarioId,
  accounts = [],
  defaultAccountId = null,
  startInCreateMode = false,
  onSaved
} = {}) {
  if (!scenarioId) {
    notifyError('Missing scenario id for account group manager.');
    return { close: () => {} };
  }

  const { modal, close } = createModal({ contentClass: 'modal-periodic modal-account-groups' });
  let accountGroups = await DataService.getAccountGroups(scenarioId);
  const accountList = [...(Array.isArray(accounts) ? accounts : [])]
    .filter((account) => account?.name !== 'Select Account')
    .sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || '')));

  const { getPathLabel } = buildGroupPathMap(accountGroups);
  let selectedGroupId = !startInCreateMode && accountGroups.length > 0 ? Number(accountGroups[0].id) : null;

  modal.innerHTML = `
    <h2 class="modal-periodic-title">Manage Account Groups</h2>
    <div class="modal-account-groups-hint">
      Groups are rollups, not postable accounts. Use them to organize accounts and reuse the same grouping in account workflows.
    </div>
    <div class="modal-account-groups-layout">
      <section class="modal-account-groups-sidebar">
        <div class="modal-account-groups-toolbar">
          <button id="account-group-new" class="icon-btn icon-btn--primary" title="Create Group">New</button>
          <button id="account-group-delete" class="icon-btn icon-btn--danger" title="Delete Group">Delete</button>
        </div>
        <div id="account-group-list" class="modal-account-groups-list"></div>
      </section>

      <section class="modal-account-groups-editor">
        <div class="modal-periodic-form-group">
          <label class="modal-periodic-label" for="account-group-name">Group Name:</label>
          <input id="account-group-name" class="modal-periodic-input" type="text" placeholder="Loan Group">
        </div>

        <div class="modal-periodic-form-group">
          <label class="modal-periodic-label" for="account-group-parent">Parent Group:</label>
          <select id="account-group-parent" class="modal-periodic-select"></select>
          <div class="modal-periodic-hint">Optional. Use this for nested rollups.</div>
        </div>

        <div class="modal-periodic-form-group">
          <label class="modal-periodic-label" for="account-group-sort-order">Sort Order:</label>
          <input id="account-group-sort-order" class="modal-periodic-input" type="number" step="1" value="0">
        </div>

        <div class="modal-account-groups-members">
          <div class="modal-account-groups-members-header">Member Accounts</div>
          <div id="account-group-members" class="modal-account-groups-member-list"></div>
        </div>

        <div class="modal-periodic-actions">
          <button id="account-group-cancel" class="icon-btn" title="Close">✕</button>
          <button id="account-group-save" class="icon-btn icon-btn--primary" title="Save Group">✓</button>
        </div>
      </section>
    </div>
  `;

  const groupListEl = modal.querySelector('#account-group-list');
  const newBtn = modal.querySelector('#account-group-new');
  const deleteBtn = modal.querySelector('#account-group-delete');
  const nameInput = modal.querySelector('#account-group-name');
  const parentSelect = modal.querySelector('#account-group-parent');
  const sortOrderInput = modal.querySelector('#account-group-sort-order');
  const membersEl = modal.querySelector('#account-group-members');
  const cancelBtn = modal.querySelector('#account-group-cancel');
  const saveBtn = modal.querySelector('#account-group-save');

  const loadGroups = async () => {
    accountGroups = await DataService.getAccountGroups(scenarioId);
    const pathMap = buildGroupPathMap(accountGroups);
    return pathMap;
  };

  const buildParentOptions = (groups, pathMap) => {
    const options = [
      `<option value="">No Parent</option>`
    ];

    const blockedIds = selectedGroupId
      ? new Set([selectedGroupId, ...resolveDescendantGroupIds(groups, selectedGroupId)])
      : new Set();

    sortGroups(groups, pathMap?.getPathLabel).forEach((group) => {
      const id = Number(group.id);
      if (!id || blockedIds.has(id)) return;
      const label = pathMap?.getPathLabel?.(id) || group?.name || `Group ${id}`;
      options.push(`<option value="${id}">${label}</option>`);
    });

    parentSelect.innerHTML = options.join('');
  };

  const renderMembers = (selectedAccountIds = []) => {
    membersEl.innerHTML = '';
    if (accountList.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'modal-account-groups-empty';
      empty.textContent = 'Create accounts first, then assign them to groups here.';
      membersEl.appendChild(empty);
      return [];
    }

    const memberInputs = [];
    accountList.forEach((account) => {
      const row = document.createElement('label');
      row.className = 'modal-account-groups-member';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = String(account.id);
      checkbox.checked = selectedAccountIds.includes(Number(account.id));

      const text = document.createElement('span');
      text.textContent = account.name || `Account ${account.id}`;

      row.appendChild(checkbox);
      row.appendChild(text);
      membersEl.appendChild(row);
      memberInputs.push(checkbox);
    });

    return memberInputs;
  };

  const renderGroupList = async () => {
    const pathMap = await loadGroups();
    const groups = sortGroups(accountGroups, pathMap.getPathLabel);

    groupListEl.innerHTML = '';
    if (groups.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'modal-account-groups-empty';
      empty.textContent = 'No groups yet. Create one to get started.';
      groupListEl.appendChild(empty);
    } else {
      groups.forEach((group) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `modal-account-groups-item${Number(group.id) === Number(selectedGroupId) ? ' modal-account-groups-item--active' : ''}`;
        item.dataset.groupId = String(group.id);

        const title = document.createElement('span');
        title.className = 'modal-account-groups-item-title';
        title.textContent = pathMap.getPathLabel(group.id) || group.name || `Group ${group.id}`;

        const meta = document.createElement('span');
        meta.className = 'modal-account-groups-item-meta';
        meta.textContent = `${(group.accountIds || []).length} account${(group.accountIds || []).length === 1 ? '' : 's'}`;

        item.appendChild(title);
        item.appendChild(meta);
        item.addEventListener('click', () => {
          selectedGroupId = Number(group.id);
          renderEditor();
        });

        groupListEl.appendChild(item);
      });
    }

    buildParentOptions(groups, pathMap);
    return pathMap;
  };

  const renderEditor = async () => {
    const pathMap = await renderGroupList();
    const selectedGroup = selectedGroupId
      ? accountGroups.find((group) => Number(group.id) === Number(selectedGroupId))
      : null;
    const isNew = !selectedGroup;
    const nextSortOrder = isNew
      ? (accountGroups.reduce((max, group) => Math.max(max, Number(group.sortOrder) || 0), 0) + 1)
      : Number(selectedGroup.sortOrder || 0);
    const selectedAccountIds = selectedGroup?.accountIds || (defaultAccountId ? [Number(defaultAccountId)] : []);

    nameInput.value = selectedGroup?.name || 'New Group';
    sortOrderInput.value = String(nextSortOrder);
    parentSelect.value = selectedGroup?.parentGroupId ? String(selectedGroup.parentGroupId) : '';
    const memberInputs = renderMembers(selectedAccountIds);

    if (memberInputs.length > 0 && defaultAccountId && isNew) {
      const defaultMatch = memberInputs.find((input) => Number(input.value) === Number(defaultAccountId));
      if (defaultMatch) {
        defaultMatch.checked = true;
      }
    }

    deleteBtn.disabled = isNew || accountGroups.length === 0;
    saveBtn.textContent = isNew ? 'Create' : 'Save';

    return pathMap;
  };

  const createNewDraft = async () => {
    selectedGroupId = null;
    await renderEditor();
    nameInput.focus();
    nameInput.select();
  };

  newBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await createNewDraft();
  });

  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });

  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!selectedGroupId) return;

    const group = accountGroups.find((item) => Number(item.id) === Number(selectedGroupId));
    if (!group) return;

    const confirmed = await confirmDialog(`Delete account group: ${group.name || `Group ${group.id}`}?`);
    if (!confirmed) return;

    try {
      await DataService.removeAccountGroup(scenarioId, selectedGroupId);
      accountGroups = await DataService.getAccountGroups(scenarioId);
      selectedGroupId = accountGroups[0]?.id || null;
      await renderEditor();
      await onSaved?.();
    } catch (err) {
      notifyError('Failed to delete account group: ' + (err?.message || String(err)));
    }
  });

  saveBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const draft = readFormState({
      nameInput,
      parentSelect,
      sortOrderInput,
      memberInputs: Array.from(membersEl.querySelectorAll('input[type="checkbox"]'))
    });

    if (!draft.name) {
      notifyError('Enter a group name.');
      return;
    }

    const nextGroups = selectedGroupId
      ? accountGroups.map((group) => (
        Number(group.id) === Number(selectedGroupId)
          ? {
            ...group,
            name: draft.name,
            parentGroupId: draft.parentGroupId,
            sortOrder: draft.sortOrder,
            accountIds: draft.accountIds
          }
          : group
      ))
      : [...accountGroups, {
        ...draft,
        id: (accountGroups.reduce((max, group) => Math.max(max, Number(group.id) || 0), 0) + 1)
      }];

    const duplicateName = nextGroups.find((group) => (
      Number(group.id) !== Number(selectedGroupId || 0) &&
      String(group?.name || '').trim().toLowerCase() === draft.name.toLowerCase()
    ));
    if (duplicateName) {
      notifyError(`A group named "${draft.name}" already exists.`);
      return;
    }

    const validationResult = validateAccountGroups(nextGroups);
    if (validationResult.length > 0) {
      notifyError(validationResult[0]?.message || 'Invalid account group configuration.');
      return;
    }

    try {
      if (selectedGroupId) {
        await DataService.updateAccountGroup(scenarioId, selectedGroupId, {
          name: draft.name,
          parentGroupId: draft.parentGroupId,
          sortOrder: draft.sortOrder,
          accountIds: draft.accountIds
        });
      } else {
        const created = await DataService.createAccountGroup(scenarioId, {
          name: draft.name,
          parentGroupId: draft.parentGroupId,
          sortOrder: draft.sortOrder,
          accountIds: draft.accountIds
        });
        selectedGroupId = Number(created?.id || 0) || null;
      }

      accountGroups = await DataService.getAccountGroups(scenarioId);
      await renderEditor();
      await onSaved?.();
    } catch (err) {
      notifyError('Failed to save account group: ' + (err?.message || String(err)));
    }
  });

  if (!startInCreateMode && accountGroups.length === 0) {
    await createNewDraft();
  } else {
    await renderEditor();
  }

  return { close };
}
