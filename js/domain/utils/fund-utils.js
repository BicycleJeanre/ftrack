// fund-utils.js
// Minimal Funds scenario summary helpers

import { parseDateOnly } from '../../shared/date-utils.js';
import { expandTransactions } from '../calculations/transaction-expander.js';
import { normalizeCanonicalTransaction, transformTransactionToRows } from '../../ui/transforms/transaction-row-transformer.js';

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getAccountTypeId(account) {
  return typeof account?.type === 'number' 
    ? account.type 
    : account?.type?.id || 0;
}

// Map account type names to IDs for scope lookups
const ACCOUNT_TYPE_ID_MAP = {
  'Asset': 1,
  'Liability': 2,
  'Equity': 3,
  'Income': 4,
  'Expense': 5
};

function toDateOrNull(dateStr) {
  if (!dateStr) return null;
  try {
    return parseDateOnly(dateStr);
  } catch {
    return null;
  }
}

function sortByDateAsc(a, b) {
  const da = toDateOrNull(a?.effectiveDate)?.getTime() || 0;
  const db = toDateOrNull(b?.effectiveDate)?.getTime() || 0;
  return da - db;
}

export function getDefaultFundSettings() {
  return {
    shareMode: 'Locked',
    lockedSharesByAccountId: {},
    automaticEffectiveDate: null
  };
}

export function buildProjectionsIndex(projections = []) {
  const byAccountId = new Map();
  for (const p of projections || []) {
    const accountId = p?.accountId;
    if (!accountId) continue;
    if (!byAccountId.has(accountId)) byAccountId.set(accountId, []);
    byAccountId.get(accountId).push(p);
  }
  for (const [id, list] of byAccountId.entries()) {
    list.sort((a, b) => {
      const ta = toDateOrNull(a?.date)?.getTime() || 0;
      const tb = toDateOrNull(b?.date)?.getTime() || 0;
      return ta - tb;
    });
    byAccountId.set(id, list);
  }
  return { byAccountId };
}

export function getBalanceAsOf({ account, projectionsIndex, asOfDate = null }) {
  const starting = safeNumber(account?.startingBalance ?? account?.balance ?? 0);
  const list = projectionsIndex?.byAccountId?.get?.(account?.id) || [];
  if (!list.length) return starting;

  if (!asOfDate) {
    const last = list[list.length - 1];
    const bal = safeNumber(last?.balance);
    return Number.isFinite(bal) ? bal : starting;
  }

  const asOfTime = asOfDate.getTime();
  let candidate = null;
  for (const p of list) {
    const t = toDateOrNull(p?.date)?.getTime();
    if (!t) continue;
    if (t <= asOfTime) candidate = p;
    else break;
  }

  if (!candidate) return starting;
  const bal = safeNumber(candidate?.balance);
  return Number.isFinite(bal) ? bal : starting;
}

export function computeNav({ accounts = [], projectionsIndex, asOfDate = null }) {
  const assets = accounts.filter(a => getAccountTypeId(a) === 1); // Asset ID
  const liabilities = accounts.filter(a => getAccountTypeId(a) === 2); // Liability ID

  const totalAssets = assets.reduce((sum, a) => sum + safeNumber(getBalanceAsOf({ account: a, projectionsIndex, asOfDate })), 0);
  const totalLiabilitiesMagnitude = liabilities.reduce(
    (sum, a) => sum + Math.abs(safeNumber(getBalanceAsOf({ account: a, projectionsIndex, asOfDate }))),
    0
  );

  return {
    nav: totalAssets - totalLiabilitiesMagnitude,
    totalAssets,
    totalLiabilities: totalLiabilitiesMagnitude
  };
}

export function computeMoneyTotalsFromTransactions({
  transactions = [],
  accounts = [],
  scope = 'All'
}) {
  // Minimal, scope-aware inclusion: include a tx if either side is in-scope.
  const accountById = new Map((accounts || []).map(a => [a.id, a]));
  const scopeTypeId = ACCOUNT_TYPE_ID_MAP[scope];

  const isInScope = (accountId) => {
    if (!accountId) return false;
    if (scope === 'All') return true;
    const account = accountById.get(accountId);
    return getAccountTypeId(account) === scopeTypeId;
  };

  let moneyIn = 0;
  let moneyOut = 0;

  for (const tx of transactions || []) {
    const typeId = tx?.transactionTypeId ?? tx?.transactionType?.id;
    const include = isInScope(tx?.primaryAccountId) || isInScope(tx?.secondaryAccountId);
    if (!include) continue;

    const amt = Math.abs(safeNumber(tx?.amount ?? tx?.plannedAmount ?? 0));
    if (typeId === 1) moneyIn += amt;
    else if (typeId === 2) moneyOut += amt;
  }

  return { moneyIn, moneyOut, net: moneyIn - moneyOut };
}

export function computeLockedSharesByAccountId({ equityAccounts = [], fundSettings }) {
  const locked = fundSettings?.lockedSharesByAccountId || {};
  const result = {};
  for (const a of equityAccounts) {
    result[a.id] = safeNumber(locked[a.id] ?? locked[String(a.id)] ?? 0);
  }
  return result;
}

export function computeAutomaticSharesByAccountId({
  scenario,
  accounts = [],
  projectionsIndex,
  asOfDate = null,
  fundSettings
}) {
  const equityAccounts = accounts.filter(a => getAccountTypeId(a) === 3); // Equity ID

  const effectiveDate = toDateOrNull(fundSettings?.automaticEffectiveDate);
  if (!effectiveDate) {
    return computeLockedSharesByAccountId({ equityAccounts, fundSettings });
  }

  const cutoff = asOfDate || toDateOrNull(scenario?.endDate) || new Date();
  if (cutoff.getTime() < effectiveDate.getTime()) {
    return computeLockedSharesByAccountId({ equityAccounts, fundSettings });
  }

  // Start from locked shares as of effective date.
  const shares = computeLockedSharesByAccountId({ equityAccounts, fundSettings });

  const start = effectiveDate;
  const end = cutoff;

  const expanded = expandTransactions(scenario?.transactions || [], start, end, accounts)
    .map(normalizeCanonicalTransaction)
    .sort(sortByDateAsc);

  const navCache = new Map();
  const navAt = (dateStr) => {
    if (navCache.has(dateStr)) return navCache.get(dateStr);
    const d = toDateOrNull(dateStr);
    const computed = computeNav({ accounts, projectionsIndex, asOfDate: d });
    navCache.set(dateStr, computed);
    return computed;
  };

  for (const occurrence of expanded) {
    const txDate = occurrence?.effectiveDate;
    if (!txDate) continue;

    const totalShares = Object.values(shares).reduce((sum, v) => sum + safeNumber(v), 0);
    if (totalShares <= 0) {
      // Cannot price new shares without a share base.
      continue;
    }

    const { nav } = navAt(txDate);
    const price = nav / totalShares;
    if (!Number.isFinite(price) || price === 0) continue;

    const rows = transformTransactionToRows(occurrence, accounts);
    for (const investor of equityAccounts) {
      const row = rows.find(r => Number(r?.perspectiveAccountId) === Number(investor.id));
      if (!row) continue;

      const flow = safeNumber(row.amount);
      if (flow === 0) continue;

      // Shares increase when investor pays into the fund (Money Out => negative flow).
      // Shares decrease when investor receives value (Money In => positive flow).
      const deltaShares = (-flow) / price;
      const next = Math.max(0, safeNumber(shares[investor.id]) + deltaShares);
      shares[investor.id] = next;
    }
  }

  return shares;
}

export function computeInvestorFlows({
  scenario,
  accounts = [],
  asOfDate = null
}) {
  const equityAccounts = accounts.filter(a => getAccountTypeId(a) === 3); // Equity ID
  const start = toDateOrNull(scenario?.startDate) || new Date(0);
  const end = asOfDate || toDateOrNull(scenario?.endDate) || new Date();

  const expanded = expandTransactions(scenario?.transactions || [], start, end, accounts)
    .map(normalizeCanonicalTransaction)
    .sort(sortByDateAsc);

  const flowsById = {};
  for (const a of equityAccounts) {
    flowsById[a.id] = { contributions: 0, redemptions: 0 };
  }

  for (const occurrence of expanded) {
    const rows = transformTransactionToRows(occurrence, accounts);
    for (const investor of equityAccounts) {
      const row = rows.find(r => Number(r?.perspectiveAccountId) === Number(investor.id));
      if (!row) continue;

      const flow = safeNumber(row.amount);
      if (flow < 0) flowsById[investor.id].contributions += Math.abs(flow);
      if (flow > 0) flowsById[investor.id].redemptions += Math.abs(flow);
    }
  }

  return flowsById;
}
