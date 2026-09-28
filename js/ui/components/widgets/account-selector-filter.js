import { createModal } from '../modals/modal-factory.js';

const ACCOUNT_TYPE_NAMES = new Map([
  [1, 'Asset'],
  [2, 'Liability'],
  [3, 'Equity'],
  [4, 'Income'],
  [5, 'Expense']
]);

const ACCOUNT_SCOPE_PREFIX = '__account_scope__:';
const accountSelectConfigs = new WeakMap();
const enhancedAccountSelects = new WeakSet();
const accountGroupSelectConfigs = new WeakMap();
const enhancedAccountGroupSelects = new WeakSet();
const pickerControls = new WeakMap();
const pendingPickerMounts = new Map();
let pickerMountObserver = null;
let nextPickerId = 1;

function accountTypeId(account) {
  const raw = account?.type ?? account?.accountType ?? null;
  if (raw && typeof raw === 'object') {
    return Number(raw.id || 0) || null;
  }
  const numeric = Number(raw || 0);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const name = String(raw || '').trim().toLowerCase();
  return [...ACCOUNT_TYPE_NAMES.entries()].find(
    ([, label]) => label.toLowerCase() === name
  )?.[0] || null;
}

function accountTypeName(account, typeId) {
  const raw = account?.type ?? account?.accountType ?? null;
  const explicit = raw && typeof raw === 'object'
    ? String(raw.name || '').trim()
    : (typeof raw === 'string' ? raw.trim() : '');
  return explicit || ACCOUNT_TYPE_NAMES.get(Number(typeId)) || `Type ${typeId}`;
}

function normalizedAccounts(accounts = []) {
  return (Array.isArray(accounts) ? accounts : [])
    .filter((account) => account?.name !== 'Select Account')
    .sort((left, right) => (
      String(left?.name || '').localeCompare(String(right?.name || '')) ||
      Number(left?.id || 0) - Number(right?.id || 0)
    ));
}

function accountIdsForGroup(accountGroups, groupId) {
  const group = (Array.isArray(accountGroups) ? accountGroups : []).find(
    (candidate) => Number(candidate?.id || 0) === Number(groupId || 0)
  );
  return new Set(
    (Array.isArray(group?.accountIds) ? group.accountIds : [])
      .map((id) => Number(id || 0))
      .filter((id) => id > 0)
  );
}

function cleanScope(rawScope) {
  const match = String(rawScope || '').match(/^(type|group):(\d+)$/);
  return match && Number(match[2]) > 0 ? `${match[1]}:${Number(match[2])}` : '';
}

function scopeValue(scope) {
  return `${ACCOUNT_SCOPE_PREFIX}${scope || 'all'}`;
}

function decodeScopeValue(value) {
  const raw = String(value || '');
  if (!raw.startsWith(ACCOUNT_SCOPE_PREFIX)) return null;
  const encoded = raw.slice(ACCOUNT_SCOPE_PREFIX.length);
  return encoded === 'all' ? '' : cleanScope(encoded);
}

function scopeDetails(accounts, accountGroups) {
  const list = normalizedAccounts(accounts);
  const visibleAccountIds = new Set(list.map((account) => Number(account?.id || 0)));
  const types = new Map();
  list.forEach((account) => {
    const typeId = accountTypeId(account);
    if (!typeId) return;
    if (!types.has(typeId)) {
      types.set(typeId, {
        id: typeId,
        name: accountTypeName(account, typeId),
        count: 0,
        scope: `type:${typeId}`
      });
    }
    types.get(typeId).count += 1;
  });

  const groups = (Array.isArray(accountGroups) ? accountGroups : [])
    .filter((group) => Number(group?.id || 0) > 0)
    .map((group) => ({
      id: Number(group.id),
      name: String(group?.name || '').trim() || `Group ${group.id}`,
      count: [...accountIdsForGroup(accountGroups, group.id)]
        .filter((accountId) => visibleAccountIds.has(accountId)).length,
      scope: `group:${Number(group.id)}`
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    types: [...types.values()].sort((left, right) => left.name.localeCompare(right.name)),
    groups
  };
}

function scopeLabel(scope, details) {
  if (!scope) return 'All accounts';
  const item = [...details.types, ...details.groups].find((entry) => entry.scope === scope);
  return item?.name || 'Filtered accounts';
}

function appendOption(parent, value, label, { disabled = false } = {}) {
  const option = document.createElement('option');
  option.value = String(value ?? '');
  option.textContent = label;
  option.disabled = disabled;
  parent.appendChild(option);
  return option;
}

function pickerAccessibleName(select, fallback) {
  const explicit = String(select.getAttribute('aria-label') || '').trim();
  if (explicit) return explicit;
  const label = select.labels?.[0]?.textContent?.trim();
  return label || fallback;
}

function selectedOptionLabel(select, fallback) {
  return String(select.selectedOptions?.[0]?.textContent || fallback || 'Choose').trim();
}

function syncPickerTrigger(select) {
  const control = pickerControls.get(select);
  if (!control) return;
  control.label.textContent = selectedOptionLabel(select, control.fallbackLabel);
  control.button.title = control.label.textContent;
  control.button.disabled = Boolean(select.disabled);
  control.wrapper.style.display = select.style.display === 'none' ? 'none' : '';
}

function mountPickerTrigger(select, {
  kind,
  fallbackLabel,
  open
}) {
  if (!select?.isConnected) return false;
  const existing = pickerControls.get(select);
  if (existing) {
    existing.open = open;
    syncPickerTrigger(select);
    return true;
  }

  const wrapper = document.createElement('div');
  wrapper.className = `selection-dialog-control selection-dialog-control--${kind}`;
  const button = document.createElement('button');
  const label = document.createElement('span');
  const caret = document.createElement('span');
  const controlId = select.id || `selection-dialog-native-${nextPickerId}`;
  if (!select.id) select.id = controlId;
  button.id = `${controlId}-dialog-trigger`;
  button.type = 'button';
  button.className = 'selection-dialog-trigger';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-label', pickerAccessibleName(select, fallbackLabel));
  label.className = 'selection-dialog-trigger-label';
  caret.className = 'selection-dialog-trigger-caret';
  caret.setAttribute('aria-hidden', 'true');
  caret.textContent = '▾';
  button.appendChild(label);
  button.appendChild(caret);

  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  wrapper.appendChild(button);
  select.classList.add('selection-dialog-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const visibilityObserver = typeof MutationObserver === 'function'
    ? new MutationObserver(() => syncPickerTrigger(select))
    : null;
  visibilityObserver?.observe(select, {
    attributes: true,
    attributeFilter: ['style', 'disabled']
  });
  const control = { wrapper, button, label, fallbackLabel, open, visibilityObserver };
  pickerControls.set(select, control);
  button.addEventListener('click', () => pickerControls.get(select)?.open?.());
  syncPickerTrigger(select);
  return true;
}

function schedulePickerMount(select, options) {
  pendingPickerMounts.set(select, options);
  const mountPending = () => {
    pendingPickerMounts.forEach((pendingOptions, pendingSelect) => {
      if (mountPickerTrigger(pendingSelect, pendingOptions)) {
        pendingPickerMounts.delete(pendingSelect);
      }
    });
    if (!pendingPickerMounts.size && pickerMountObserver) {
      pickerMountObserver.disconnect();
      pickerMountObserver = null;
    }
  };
  if (typeof queueMicrotask === 'function') queueMicrotask(mountPending);
  else setTimeout(mountPending, 0);
  if (
    !pickerMountObserver &&
    typeof MutationObserver === 'function' &&
    typeof document !== 'undefined' &&
    document.documentElement
  ) {
    pickerMountObserver = new MutationObserver(mountPending);
    pickerMountObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
}

function createPickerDialogShell({ title, subtitle = '' }) {
  const { overlay, modal, close } = createModal({
    contentClass: 'selection-dialog',
    closeOnOverlay: true,
    closeOnEscape: true
  });
  overlay.classList.add('selection-dialog-overlay');
  const header = document.createElement('div');
  header.className = 'selection-dialog-header';
  const heading = document.createElement('div');
  const headingTitle = document.createElement('h2');
  headingTitle.className = 'selection-dialog-title';
  headingTitle.textContent = title;
  heading.appendChild(headingTitle);
  if (subtitle) {
    const headingSubtitle = document.createElement('div');
    headingSubtitle.className = 'selection-dialog-subtitle';
    headingSubtitle.textContent = subtitle;
    heading.appendChild(headingSubtitle);
  }
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'selection-dialog-close';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.textContent = '×';
  closeButton.addEventListener('click', close);
  header.appendChild(heading);
  header.appendChild(closeButton);
  modal.appendChild(header);
  return { modal, close };
}

function openAccountPickerDialog(select) {
  const config = accountSelectConfigs.get(select);
  if (!config) return;
  const trigger = pickerControls.get(select)?.button;
  const title = pickerAccessibleName(select, 'Choose account');
  const { modal, close: closeModal } = createPickerDialogShell({
    title,
    subtitle: 'Filter by account type or account group, then choose an account.'
  });
  let localScope = cleanScope(config.scope);
  let query = '';

  const controls = document.createElement('div');
  controls.className = 'selection-dialog-filters';
  const details = scopeDetails(config.accounts, config.accountGroups);
  const initialTypeScope = localScope.startsWith('type:') ? localScope : '';
  const initialGroupScope = localScope.startsWith('group:') ? localScope : '';

  const typeField = document.createElement('label');
  typeField.className = 'selection-dialog-field';
  const typeLabel = document.createElement('span');
  typeLabel.textContent = 'Account Type';
  const typeSelect = document.createElement('select');
  typeSelect.className = 'input-select selection-dialog-scope selection-dialog-type-filter';
  typeSelect.setAttribute('aria-label', 'Account Type');
  appendOption(typeSelect, '', 'All account types');
  details.types.forEach((type) => appendOption(
    typeSelect,
    type.scope,
    `${type.name} (${type.count})`
  ));
  typeSelect.value = initialTypeScope;
  typeField.appendChild(typeLabel);
  typeField.appendChild(typeSelect);

  const groupField = document.createElement('label');
  groupField.className = 'selection-dialog-field';
  const groupLabel = document.createElement('span');
  groupLabel.textContent = 'Account Group';
  const groupSelect = document.createElement('select');
  groupSelect.className = 'input-select selection-dialog-scope selection-dialog-group-filter';
  groupSelect.setAttribute('aria-label', 'Account Group');
  if (details.groups.length) {
    appendOption(groupSelect, '', 'All account groups');
    details.groups.forEach((group) => appendOption(
      groupSelect,
      group.scope,
      `${group.name} (${group.count})`
    ));
    groupSelect.value = initialGroupScope;
  } else {
    appendOption(groupSelect, '', 'No account groups configured', { disabled: true });
    groupSelect.disabled = true;
    groupSelect.title = 'Create and assign account groups in Accounts (Detail).';
  }
  groupField.appendChild(groupLabel);
  groupField.appendChild(groupSelect);

  const searchField = document.createElement('label');
  searchField.className = 'selection-dialog-field selection-dialog-field--search';
  const searchLabel = document.createElement('span');
  searchLabel.textContent = 'Search';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'selection-dialog-search';
  search.placeholder = 'Search accounts';
  searchField.appendChild(searchLabel);
  searchField.appendChild(search);
  controls.appendChild(typeField);
  controls.appendChild(groupField);
  controls.appendChild(searchField);
  modal.appendChild(controls);

  const list = document.createElement('div');
  list.className = 'selection-dialog-options';
  list.setAttribute('role', 'listbox');
  modal.appendChild(list);

  const commit = (value, label, { action = false } = {}) => {
    const priorScope = cleanScope(config.scope);
    if (action) {
      select.value = String(value);
    } else {
      populateAccountSelect(select, {
        ...config,
        scope: localScope,
        selectedValue: value,
        selectedLabel: label
      });
      if (priorScope !== localScope) {
        accountSelectConfigs.get(select)?.onScopeChange?.(localScope, {
          selectedValue: select.value,
          selectionChanged: String(select.value) !== String(config.selectedValue ?? '')
        });
      }
    }
    closeModal();
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncPickerTrigger(select);
    trigger?.focus?.();
  };

  const addChoice = ({ value, label, meta = '', action = false }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'selection-dialog-option';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(String(value) === String(select.value)));
    const text = document.createElement('span');
    text.className = 'selection-dialog-option-label';
    text.textContent = label;
    button.appendChild(text);
    if (meta) {
      const detail = document.createElement('span');
      detail.className = 'selection-dialog-option-meta';
      detail.textContent = meta;
      button.appendChild(detail);
    }
    button.addEventListener('click', () => commit(value, label, { action }));
    list.appendChild(button);
  };

  const render = () => {
    list.innerHTML = '';
    const normalizedQuery = query.trim().toLowerCase();
    if (config.emptyLabel !== undefined) {
      addChoice({
        value: config.emptyValue ?? '',
        label: config.emptyLabel
      });
    } else if (config.includeAll) {
      addChoice({ value: '', label: 'All Accounts' });
    }
    const matches = filterAccountsByScope(
      config.accounts,
      config.accountGroups,
      localScope
    ).filter((account) => {
      const nativeOption = Array.from(select.options).find(
        (option) => option.value === String(account.id)
      );
      return !nativeOption?.disabled && (
        !normalizedQuery ||
        String(config.getAccountLabel(account) || '').toLowerCase().includes(normalizedQuery)
      );
    });
    matches.forEach((account) => addChoice({
      value: account.id,
      label: config.getAccountLabel(account),
      meta: accountTypeName(account, accountTypeId(account))
    }));
    (config.extraOptions || []).filter((option) => !option.disabled).forEach((option) => {
      addChoice({ value: option.value, label: option.label, action: true });
    });
    if (!matches.length && !config.extraOptions?.length) {
      const empty = document.createElement('div');
      empty.className = 'selection-dialog-empty';
      empty.textContent = 'No accounts match this filter.';
      list.appendChild(empty);
    }
  };

  typeSelect.addEventListener('change', () => {
    localScope = cleanScope(typeSelect.value);
    if (localScope) groupSelect.value = '';
    render();
  });
  groupSelect.addEventListener('change', () => {
    localScope = cleanScope(groupSelect.value);
    if (localScope) typeSelect.value = '';
    render();
  });
  search.addEventListener('input', () => {
    query = search.value;
    render();
  });
  render();
  setTimeout(() => search.focus(), 0);
}

function openSimpleSelectDialog(select, config) {
  const trigger = pickerControls.get(select)?.button;
  const { modal, close } = createPickerDialogShell({
    title: config.title || pickerAccessibleName(select, 'Choose account group'),
    subtitle: config.subtitle || 'Search and choose from the available groups.'
  });
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'selection-dialog-search selection-dialog-search--full';
  search.placeholder = config.searchPlaceholder || 'Search account groups';
  modal.appendChild(search);
  const list = document.createElement('div');
  list.className = 'selection-dialog-options';
  list.setAttribute('role', 'listbox');
  modal.appendChild(list);

  const render = () => {
    list.innerHTML = '';
    const query = search.value.trim().toLowerCase();
    const options = Array.from(select.options).filter((option) => (
      !option.disabled && (!query || option.textContent.toLowerCase().includes(query))
    ));
    options.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'selection-dialog-option';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(option.value === select.value));
      button.textContent = option.textContent;
      button.addEventListener('click', () => {
        select.value = option.value;
        close();
        select.dispatchEvent(new Event('change', { bubbles: true }));
        trigger?.focus?.();
      });
      list.appendChild(button);
    });
    if (!options.length) {
      const empty = document.createElement('div');
      empty.className = 'selection-dialog-empty';
      empty.textContent = 'No account groups match this search.';
      list.appendChild(empty);
    }
  };
  search.addEventListener('input', render);
  render();
  setTimeout(() => search.focus(), 0);
}

function installAccountScopeHandler(select) {
  if (enhancedAccountSelects.has(select)) return;
  enhancedAccountSelects.add(select);
  select.addEventListener('change', (event) => {
    const config = accountSelectConfigs.get(select);
    if (!config) return;
    const nextScope = decodeScopeValue(select.value);
    if (nextScope !== null) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const previousValue = config.selectedValue;
      const previousLabel = config.selectedLabel;
      const nextValue = populateAccountSelect(select, {
        ...config,
        scope: nextScope,
        selectedValue: previousValue,
        selectedLabel: previousLabel
      });
      config.onScopeChange?.(nextScope, {
        selectedValue: nextValue,
        selectionChanged: String(nextValue ?? '') !== String(previousValue ?? '')
      });
      select.dispatchEvent(new CustomEvent('accountscopechange', {
        bubbles: true,
        detail: { scope: nextScope, selectedValue: nextValue }
      }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (!(config.actionValues || []).includes(select.value)) {
      config.selectedValue = select.value;
      config.selectedLabel = select.selectedOptions?.[0]?.textContent || '';
    }
    syncPickerTrigger(select);
  }, { capture: true });
}

export function filterAccountsByScope(
  accounts = [],
  accountGroups = [],
  rawScope = ''
) {
  const list = normalizedAccounts(accounts);
  const scope = cleanScope(rawScope);
  if (!scope) return list;
  const [kind, rawId] = scope.split(':');
  const id = Number(rawId || 0);
  if (kind === 'type') {
    return list.filter((account) => accountTypeId(account) === id);
  }
  if (kind === 'group') {
    const accountIds = accountIdsForGroup(accountGroups, id);
    return list.filter((account) => accountIds.has(Number(account?.id || 0)));
  }
  return list;
}

export function populateAccountSelect(select, {
  accounts = [],
  accountGroups = [],
  scope,
  selectedId,
  selectedValue,
  selectedLabel,
  includeAll = true,
  emptyLabel,
  emptyValue = '',
  getAccountLabel = (account) => account?.name || String(account?.id || ''),
  extraOptions = [],
  actionValues = [],
  preserveCurrentOutsideScope = true,
  onScopeChange = null
} = {}) {
  const previousConfig = accountSelectConfigs.get(select) || {};
  const nextScope = scope === undefined
    ? cleanScope(previousConfig.scope)
    : cleanScope(scope);
  const requested = selectedValue !== undefined
    ? String(selectedValue ?? '')
    : selectedId !== undefined
      ? String(selectedId ?? '')
      : String(previousConfig.selectedValue ?? select.value ?? '');
  const requestedLabel = selectedLabel !== undefined
    ? String(selectedLabel || '')
    : String(previousConfig.selectedLabel || select.selectedOptions?.[0]?.textContent || '');
  const details = scopeDetails(accounts, accountGroups);
  const filtered = filterAccountsByScope(accounts, accountGroups, nextScope);

  const config = {
    ...previousConfig,
    accounts,
    accountGroups,
    scope: nextScope,
    selectedValue: requested,
    selectedLabel: requestedLabel,
    includeAll,
    emptyLabel,
    emptyValue,
    getAccountLabel,
    extraOptions,
    actionValues,
    preserveCurrentOutsideScope,
    onScopeChange
  };
  accountSelectConfigs.set(select, config);
  installAccountScopeHandler(select);

  select.innerHTML = '';
  select.classList.add('account-picker-select');
  if (emptyLabel !== undefined) {
    appendOption(select, emptyValue, emptyLabel);
  } else if (includeAll) {
    appendOption(select, '', 'All Accounts');
  }

  if (details.types.length || details.groups.length) {
    const filters = document.createElement('optgroup');
    filters.label = nextScope
      ? `Filter account list · ${scopeLabel(nextScope, details)}`
      : 'Filter account list';
    appendOption(filters, scopeValue(''), 'All account lists');
    details.types.forEach((type) => {
      appendOption(filters, scopeValue(type.scope), `Type: ${type.name} (${type.count})`);
    });
    details.groups.forEach((group) => {
      appendOption(filters, scopeValue(group.scope), `Group: ${group.name} (${group.count})`);
    });
    select.appendChild(filters);
  }

  const accountOptions = document.createElement('optgroup');
  accountOptions.label = nextScope
    ? `Accounts · ${scopeLabel(nextScope, details)} (${filtered.length})`
    : `Accounts (${filtered.length})`;
  filtered.forEach((account) => {
    appendOption(accountOptions, account.id, getAccountLabel(account));
  });
  select.appendChild(accountOptions);

  (Array.isArray(extraOptions) ? extraOptions : []).forEach((option) => {
    appendOption(select, option.value, option.label, { disabled: option.disabled });
  });

  let selectedExists = Array.from(select.options).some(
    (option) => option.value === requested && decodeScopeValue(option.value) === null
  );
  if (
    !selectedExists &&
    preserveCurrentOutsideScope &&
    requested &&
    requestedLabel &&
    !(actionValues || []).includes(requested)
  ) {
    const current = appendOption(accountOptions, requested, `${requestedLabel} · current`);
    accountOptions.insertBefore(current, accountOptions.firstChild);
    selectedExists = true;
  }

  if (selectedExists) {
    select.value = requested;
  } else if (emptyLabel !== undefined) {
    select.value = String(emptyValue ?? '');
  } else if (includeAll) {
    select.value = '';
  } else {
    select.value = filtered.length ? String(filtered[0].id) : '';
  }
  config.selectedValue = select.value;
  config.selectedLabel = select.selectedOptions?.[0]?.textContent || '';
  select.dataset.accountScope = nextScope;
  schedulePickerMount(select, {
    kind: 'account',
    fallbackLabel: emptyLabel || (includeAll ? 'All Accounts' : 'Choose account'),
    open: () => openAccountPickerDialog(select)
  });
  syncPickerTrigger(select);
  return select.value;
}

export function getAccountSelectScope(select) {
  return cleanScope(accountSelectConfigs.get(select)?.scope || select?.dataset?.accountScope || '');
}

export function enhanceAccountGroupSelect(select, {
  title = 'Choose account group',
  subtitle = 'Search and choose from the available groups.',
  searchPlaceholder = 'Search account groups'
} = {}) {
  if (!select) return select;
  const config = { title, subtitle, searchPlaceholder };
  accountGroupSelectConfigs.set(select, config);
  select.classList.add('account-group-picker-select');
  if (!enhancedAccountGroupSelects.has(select)) {
    enhancedAccountGroupSelects.add(select);
    select.addEventListener('change', () => syncPickerTrigger(select), { capture: true });
  }
  schedulePickerMount(select, {
    kind: 'account-group',
    fallbackLabel: 'Choose account group',
    open: () => openSimpleSelectDialog(select, accountGroupSelectConfigs.get(select) || config)
  });
  syncPickerTrigger(select);
  return select;
}

export function syncSelectionDialog(select) {
  syncPickerTrigger(select);
}
