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
  const raw = account?.type;
  if (raw && typeof raw === 'object') {
    const id = Number(raw?.id);
    return Number.isFinite(id) ? id : 0;
  }
  const id = Number(raw);
  return Number.isFinite(id) ? id : 0;
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

function previousDay(dateStr) {
  const d = toDateOrNull(dateStr);
  if (!d) return null;
  return new Date(d.getTime() - 24 * 60 * 60 * 1000);
}

function sortByDateAsc(a, b) {
  const da = toDateOrNull(a?.effectiveDate)?.getTime() || 0;
  const db = toDateOrNull(b?.effectiveDate)?.getTime() || 0;
  return da - db;
}

function getStatusName(tx) {
  const raw = tx?.status;
  if (!raw) return 'planned';
  if (typeof raw === 'object') return raw?.name || 'planned';
  return String(raw);
}

export function getDefaultFundSettings() {
  return {
    totalShares: null
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
  // Standard NAV: assets - liabilities.
  // Use absolute value for liability balances so NAV decreases regardless of sign convention.
  const assets = accounts.filter(a => getAccountTypeId(a) === 1); // Asset ID
  const liabilities = accounts.filter(a => getAccountTypeId(a) === 2); // Liability ID

  const totalAssets = assets.reduce(
    (sum, a) => sum + safeNumber(getBalanceAsOf({ account: a, projectionsIndex, asOfDate })),
    0
  );
  const totalLiabilities = liabilities.reduce(
    (sum, a) => sum + Math.abs(safeNumber(getBalanceAsOf({ account: a, projectionsIndex, asOfDate }))),
    0
  );

  return { nav: totalAssets - totalLiabilities, totalAssets, totalLiabilities };
}

export function computeMoneyTotalsFromTransactions({
  scenario,
  transactions = [],
  accounts = [],
  scope = 'All',
  asOfDate = null
}) {
  const sourceTransactions = scenario?.transactions || transactions || [];

  const start = toDateOrNull(scenario?.projection?.config?.startDate) || new Date(0);
  const end = asOfDate || toDateOrNull(scenario?.projection?.config?.endDate) || new Date();

  const occurrences = expandTransactions(sourceTransactions, start, end, accounts)
    .map(normalizeCanonicalTransaction)
    .sort(sortByDateAsc);

  // Scope-aware totals:
  // - Scope = All: compute fund-level Money In/Out from the Asset-side flow (cross-type only).
  //   This avoids relying on the stored transactionTypeId convention, which can vary by entry style.
  // - Scoped: include only cross-scope flows and compute direction from the in-scope perspective row.
  const accountById = new Map((accounts || []).map(a => [Number(a.id), a]));
  const scopeTypeId = ACCOUNT_TYPE_ID_MAP[scope];

  const getAccount = (accountId) => {
    const id = Number(accountId);
    if (!Number.isFinite(id) || id === 0) return null;
    return accountById.get(id) || null;
  };

  const isInScope = (accountId) => {
    const id = Number(accountId);
    if (!Number.isFinite(id) || id === 0) return false;
    if (scope === 'All') return true;
    const account = accountById.get(id);
    return getAccountTypeId(account) === scopeTypeId;
  };

  let moneyIn = 0;
  let moneyOut = 0;

  for (const tx of occurrences) {
    const primaryId = Number(tx?.primaryAccountId);
    const secondaryId = Number(tx?.secondaryAccountId);
    const inPrimary = isInScope(primaryId);
    const inSecondary = isInScope(secondaryId);

    if (scope === 'All') {
      const typeId = Number(tx?.transactionTypeId ?? tx?.transactionType?.id);
      const amt = Math.abs(safeNumber(tx?.amount ?? tx?.plannedAmount ?? 0));
      if (typeId === 1) moneyIn += amt;
      else if (typeId === 2) moneyOut += amt;
      continue;
    }

    // Only count cross-scope flows.
    if (inPrimary === inSecondary) continue;

    const rows = transformTransactionToRows(tx, accounts);
    const inScopeAccountId = inPrimary ? primaryId : secondaryId;
    const row = rows.find(r => Number(r?.perspectiveAccountId) === Number(inScopeAccountId));
    if (!row) continue;

    const flow = safeNumber(row.amount);
    const amt = Math.abs(flow);
    if (amt === 0) continue;
    if (flow > 0) moneyIn += amt;
    else if (flow < 0) moneyOut += amt;
  }

  return { moneyIn, moneyOut, net: moneyIn - moneyOut };
}

export function computeContributionRedemptionTotals({
  scenario,
  accounts = [],
  asOfDate = null
}) {
  const flowsByInvestorId = computeInvestorFlows({ scenario, accounts, asOfDate });

  let contributions = 0;
  let redemptions = 0;

  for (const f of Object.values(flowsByInvestorId || {})) {
    contributions += safeNumber(f?.contributions);
    redemptions += safeNumber(f?.redemptions);
  }

  return {
    contributions,
    redemptions,
    net: contributions - redemptions
  };
}

export function computeFixedSharesReport({
  scenario,
  accounts = [],
  projectionsIndex,
  asOfDate = null,
  fundSettings
}) {
  const equityAccounts = accounts.filter(a => getAccountTypeId(a) === 3); // Equity ID
  const totalShares = safeNumber(fundSettings?.totalShares);
  const sharesById = Object.fromEntries(equityAccounts.map(a => [a.id, 0]));

  const flows = computeInvestorFlows({ scenario, accounts, asOfDate });
  const netById = {};
  let totalNet = 0;

  for (const a of equityAccounts) {
    const f = flows?.[a.id] || { contributions: 0, redemptions: 0 };
    const net = safeNumber(f.contributions) - safeNumber(f.redemptions);
    const netPositive = Math.max(0, net);
    netById[a.id] = netPositive;
    totalNet += netPositive;
  }

  const debug = {
    model: 'net-contributions',
    totalShares,
    totalNetContributions: totalNet
  };

  if (totalShares <= 0 || equityAccounts.length === 0 || totalNet <= 0) {
    return { sharesById, debug };
  }

  for (const a of equityAccounts) {
    sharesById[a.id] = (totalShares * safeNumber(netById[a.id])) / totalNet;
  }

  return { sharesById, debug };
}

export function computeInvestorFlows({
  scenario,
  accounts = [],
  asOfDate = null
}) {
  const equityAccounts = accounts.filter(a => getAccountTypeId(a) === 3); // Equity ID
  const start = toDateOrNull(scenario?.projection?.config?.startDate) || new Date(0);
  const end = asOfDate || toDateOrNull(scenario?.projection?.config?.endDate) || new Date();

  // Authoritative model: scenario.transactions with status.name = planned.
  const planned = (scenario?.transactions || []).filter((tx) => getStatusName(tx) === 'planned');
  const expanded = expandTransactions(planned, start, end, accounts)
    .map(normalizeCanonicalTransaction)
    .sort(sortByDateAsc);

  const flowsById = {};
  for (const a of equityAccounts) {
    flowsById[a.id] = { contributions: 0, redemptions: 0 };
  }

  for (const occurrence of expanded) {
    const rows = transformTransactionToRows(occurrence, accounts);

    const primaryAccount = accounts.find(a => Number(a?.id) === Number(occurrence?.primaryAccountId)) || null;
    const secondaryAccount = accounts.find(a => Number(a?.id) === Number(occurrence?.secondaryAccountId)) || null;
    const primaryTypeId = getAccountTypeId(primaryAccount);
    const secondaryTypeId = getAccountTypeId(secondaryAccount);

    const primaryIsEquity = primaryTypeId === 3;
    const secondaryIsEquity = secondaryTypeId === 3;
    if (primaryIsEquity === secondaryIsEquity) continue;

    const investorId = primaryIsEquity ? Number(primaryAccount?.id) : Number(secondaryAccount?.id);
    if (!Number.isFinite(investorId) || investorId === 0) continue;
    if (!flowsById[investorId]) continue;

    const primaryIsAsset = primaryTypeId === 1;
    const secondaryIsAsset = secondaryTypeId === 1;

    // Strict definition: contributions/redemptions are ONLY Equity ↔ Asset flows.
    // This keeps investor flows separate from operating flows and liability movements.
    if (primaryIsAsset === secondaryIsAsset) continue;

    const assetAccountId = primaryIsAsset ? Number(primaryAccount?.id) : Number(secondaryAccount?.id);
    if (!Number.isFinite(assetAccountId) || assetAccountId === 0) continue;

    const assetRow = rows.find(r => Number(r?.perspectiveAccountId) === Number(assetAccountId));
    if (!assetRow) continue;

    const assetFlow = safeNumber(assetRow.amount);
    const absFlow = Math.abs(assetFlow);
    if (absFlow === 0) continue;

    if (assetFlow > 0) flowsById[investorId].contributions += absFlow;
    else if (assetFlow < 0) flowsById[investorId].redemptions += absFlow;
  }

  return flowsById;
}
