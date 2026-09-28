import {
  normalizeCanonicalTransaction,
  transformTransactionToRows
} from '../transforms/transaction-row-transformer.js';

export function toSplitGroupId(value) {
  const id = String(value == null ? '' : value).trim();
  return id || '';
}

export function getStatusName(entry, fallback = 'planned') {
  const status = entry?.status;
  if (status && typeof status === 'object') return status?.name || fallback;
  return status || fallback;
}

export function applySplitSetFilters(rows, {
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

export function collectSplitFilterOptions(transactions = []) {
  const list = Array.isArray(transactions) ? transactions : [];
  const groupIds = Array.from(
    new Set(list.map((txn) => toSplitGroupId(txn?.transactionGroupId)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const roles = Array.from(
    new Set(
      list
        .map((txn) => String(txn?.transactionGroupRole || '').trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const accountGroupIds = Array.from(
    new Set(
      list
        .map((txn) => Number(txn?.transactionGroupAccountGroupId || 0))
        .filter((id) => id > 0)
    )
  ).sort((a, b) => a - b);

  return { groupIds, roles, accountGroupIds };
}

function getVisibleAccounts(accounts = []) {
  return (Array.isArray(accounts) ? accounts : [])
    .filter((account) => account?.name !== 'Select Account');
}

function buildSplitSetsById(splitSets = []) {
  return new Map(
    (Array.isArray(splitSets) ? splitSets : [])
      .map((set) => [toSplitGroupId(set?.id), set])
      .filter(([id]) => Boolean(id))
  );
}

function getSplitComponentAmounts(set) {
  const components = Array.isArray(set?.components) ? set.components : [];
  const findRole = (role) => components
    .find((component) => String(component?.role || '').trim().toLowerCase() === role);

  const principalComponent = findRole('principal');
  const interestComponent = findRole('interest');
  const principalAmount = Math.abs(Number(principalComponent?.value ?? principalComponent?.amount ?? 0)) || 0;
  const interestAmount = Math.abs(Number(interestComponent?.value ?? interestComponent?.amount ?? 0)) || 0;
  const totalAmount = Math.abs(Number(set?.totalAmount || 0)) || (principalAmount + interestAmount);

  return { principalAmount, interestAmount, totalAmount };
}

export function buildPerspectiveRows({
  entries = [],
  accounts = [],
  normalizeEntry = normalizeCanonicalTransaction,
  mapRow = null
} = {}) {
  const visibleAccounts = getVisibleAccounts(accounts);
  const allPerspectiveRows = (Array.isArray(entries) ? entries : []).flatMap((entry) => {
    const normalized = normalizeEntry(entry);
    return transformTransactionToRows(normalized, visibleAccounts);
  });

  const rows = typeof mapRow === 'function'
    ? allPerspectiveRows.map((row) => mapRow(row))
    : allPerspectiveRows;

  return { visibleAccounts, allPerspectiveRows: rows };
}

export function buildTransactionDisplayRows({
  transactions = [],
  accounts = [],
  splitSets = [],
  filterAccountId = null,
  groupByField = '',
  splitGroupFilter = '',
  splitRoleFilter = '',
  splitAccountGroupFilter = '',
  splitAccountGroupLabelLookup = null,
  hideInterestRowsWhenUnscoped = true,
  hidePayingAccountInterestRows = true
} = {}) {
  const { visibleAccounts, allPerspectiveRows } = buildPerspectiveRows({
    entries: transactions,
    accounts,
    normalizeEntry: normalizeCanonicalTransaction,
    mapRow: (row) => ({
      ...row,
      statusName: getStatusName(row),
      transactionGroupAccountGroupLabel: typeof splitAccountGroupLabelLookup?.getLabel === 'function'
        ? splitAccountGroupLabelLookup.getLabel(row?.transactionGroupAccountGroupId)
        : row?.transactionGroupAccountGroupLabel
    })
  });

  const splitSetsById = buildSplitSetsById(splitSets);

  const baseRows = filterAccountId
    ? allPerspectiveRows.filter((row) => Number(row?.perspectiveAccountId) === Number(filterAccountId))
    : allPerspectiveRows.filter((row) => {
        if (String(row?.id || '').endsWith('_flipped')) return false;
        if (!hideInterestRowsWhenUnscoped) return true;
        return String(row?.transactionGroupRole || '').trim().toLowerCase() !== 'interest';
      });

  let displayRows = baseRows.map((row) => {
    const groupId = toSplitGroupId(row?.transactionGroupId);
    const set = groupId ? splitSetsById.get(groupId) : null;
    if (!set) return row;

    const role = String(row?.transactionGroupRole || '').trim().toLowerCase();
    const { principalAmount, interestAmount, totalAmount } = getSplitComponentAmounts(set);
    const next = { ...row };

    if (role === 'interest') {
      const signedInterest = Number(row?.transactionTypeId) === 1 ? interestAmount : -interestAmount;
      next.amount = signedInterest;
      next.plannedAmount = signedInterest;
      next.interestAmount = interestAmount;
      next.capitalAmount = 0;
      return next;
    }

    if (totalAmount > 0) {
      const signedTotal = Number(row?.transactionTypeId) === 1 ? totalAmount : -totalAmount;
      next.amount = signedTotal;
      next.plannedAmount = signedTotal;
    }
    next.capitalAmount = principalAmount;
    next.interestAmount = interestAmount;
    return next;
  });

  if (filterAccountId && hidePayingAccountInterestRows) {
    displayRows = displayRows.filter((row) => {
      const groupId = toSplitGroupId(row?.transactionGroupId);
      const set = groupId ? splitSetsById.get(groupId) : null;
      if (!set) return true;
      const role = String(row?.transactionGroupRole || '').trim().toLowerCase();
      const payingId = Number(set?.payingAccountId || 0) || null;
      return !(role === 'interest' && payingId && Number(row?.perspectiveAccountId) === payingId);
    });
  }

  displayRows = applySplitSetFilters(displayRows, {
    splitGroupFilter,
    splitRoleFilter,
    splitAccountGroupFilter
  });

  if (groupByField) {
    displayRows = [...displayRows].sort((a, b) => (
      String(a?.[groupByField] || '').localeCompare(String(b?.[groupByField] || ''))
    ));
  }

  return { visibleAccounts, displayRows, allPerspectiveRows };
}

export function buildFinancialEntryDisplayRows({
  entries = [],
  accounts = [],
  filterAccountId = null,
  normalizeEntry = normalizeCanonicalTransaction,
  groupByField = '',
  mapRow = null
} = {}) {
  const { visibleAccounts, allPerspectiveRows } = buildPerspectiveRows({
    entries,
    accounts,
    normalizeEntry,
    mapRow
  });

  let displayRows = filterAccountId
    ? allPerspectiveRows.filter((row) => Number(row?.perspectiveAccountId) === Number(filterAccountId))
    : allPerspectiveRows.filter((row) => !String(row?.id || '').endsWith('_flipped'));

  if (groupByField) {
    displayRows = [...displayRows].sort((a, b) => (
      String(a?.[groupByField] || '').localeCompare(String(b?.[groupByField] || ''))
    ));
  }

  return { visibleAccounts, displayRows, allPerspectiveRows };
}
