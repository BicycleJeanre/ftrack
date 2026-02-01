// transaction-row-transformer.js
// Shared helpers to map canonical transactions to dual-perspective display rows
// and to map edited display rows back to canonical storage form.

const MONEY_IN = 1;
const MONEY_OUT = 2;

function buildType(typeId = MONEY_OUT) {
  return typeId === MONEY_IN
    ? { id: MONEY_IN, name: 'Money In' }
    : { id: MONEY_OUT, name: 'Money Out' };
}

function signedAmount(typeId, unsignedValue) {
  const amt = Math.abs(Number(unsignedValue) || 0);
  return typeId === MONEY_IN ? amt : -amt;
}

function findAccount(accounts = [], id) {
  if (!id) return null;
  return accounts.find(a => a.id === id) || { id };
}

/**
 * Normalize a transaction-like object to canonical storage form (unsigned amounts).
 */
export function normalizeCanonicalTransaction(tx) {
  const transactionTypeId = tx.transactionTypeId ?? tx.transactionType?.id ?? MONEY_OUT;
  const statusObj = typeof tx.status === 'object'
    ? { name: tx.status.name || 'planned', actualAmount: tx.status.actualAmount ?? tx.actualAmount ?? null, actualDate: tx.status.actualDate ?? tx.actualDate ?? null }
    : { name: tx.status || 'planned', actualAmount: tx.actualAmount ?? null, actualDate: tx.actualDate ?? null };

  return {
    ...tx,
    transactionTypeId,
    transactionType: buildType(transactionTypeId),
    amount: Math.abs(Number(tx.amount ?? 0)),
    plannedAmount: tx.plannedAmount !== undefined ? Math.abs(Number(tx.plannedAmount)) : Math.abs(Number(tx.amount ?? 0)),
    actualAmount: statusObj.actualAmount !== null && statusObj.actualAmount !== undefined ? Math.abs(Number(statusObj.actualAmount)) : statusObj.actualAmount,
    status: statusObj
  };
}

/**
 * Transform a canonical transaction to primary + flipped display rows.
 */
export function transformTransactionToRows(tx, accounts = []) {
  const typeId = tx.transactionTypeId ?? tx.transactionType?.id ?? MONEY_OUT;
  const typeObj = tx.transactionType || buildType(typeId);

  const primaryAccount = findAccount(accounts, tx.primaryAccountId);
  const secondaryAccount = findAccount(accounts, tx.secondaryAccountId);

  const unsignedAmount = Math.abs(Number(tx.amount ?? 0));
  const unsignedPlanned = tx.plannedAmount !== undefined ? Math.abs(Number(tx.plannedAmount)) : unsignedAmount;
  const unsignedActual = tx.actualAmount !== null && tx.actualAmount !== undefined
    ? Math.abs(Number(tx.actualAmount))
    : tx.actualAmount;

  const base = {
    ...tx,
    originalTransactionId: tx.originalTransactionId || tx.id,
    transactionTypeId: typeId,
    transactionType: typeObj,
    transactionTypeName: typeObj.name,
  };

  const rows = [];

  const primaryRow = {
    ...base,
    id: tx.id,
    perspectiveAccountId: tx.primaryAccountId || null,
    primaryAccountId: tx.primaryAccountId || null,
    secondaryAccountId: tx.secondaryAccountId || null,
    primaryAccount,
    secondaryAccount,
    primaryAccountName: primaryAccount?.name || '',
    secondaryAccountName: secondaryAccount?.name || '',
    amount: signedAmount(typeId, unsignedPlanned),
    plannedAmount: signedAmount(typeId, unsignedPlanned),
    actualAmount: unsignedActual === null || unsignedActual === undefined ? unsignedActual : signedAmount(typeId, unsignedActual)
  };

  rows.push(primaryRow);

  if (tx.secondaryAccountId) {
    const flippedTypeId = typeId === MONEY_IN ? MONEY_OUT : MONEY_IN;
    const flippedType = buildType(flippedTypeId);

    rows.push({
      ...base,
      id: `${tx.id}_flipped`,
      perspectiveAccountId: tx.secondaryAccountId,
      primaryAccountId: tx.secondaryAccountId,
      secondaryAccountId: tx.primaryAccountId,
      primaryAccount: secondaryAccount,
      secondaryAccount: primaryAccount,
      primaryAccountName: secondaryAccount?.name || '',
      secondaryAccountName: primaryAccount?.name || '',
      transactionTypeId: flippedTypeId,
      transactionType: flippedType,
      transactionTypeName: flippedType.name,
      amount: -signedAmount(typeId, unsignedPlanned),
      plannedAmount: -signedAmount(typeId, unsignedPlanned),
      actualAmount: unsignedActual === null || unsignedActual === undefined ? unsignedActual : -signedAmount(typeId, unsignedActual)
    });
  }

  return rows;
}

/**
 * Map an edited display row back to canonical storage form (unsigned amounts).
 */
export function mapEditToCanonical(tx, { field, value, isFlipped }) {
  const updated = { ...tx };
  const normalizeAmount = (val) => Math.abs(Number(val ?? 0));
  const resolveTypeId = (val) => {
    if (val && typeof val === 'object') return val.id ?? (val.name === 'Money In' ? MONEY_IN : MONEY_OUT);
    if (val === MONEY_IN || val === MONEY_OUT) return val;
    return MONEY_OUT;
  };

  if (isFlipped) {
    if (field === 'primaryAccount') {
      updated.secondaryAccountId = value?.id || null;
    } else if (field === 'secondaryAccount') {
      updated.primaryAccountId = value?.id || null;
    } else if (field === 'transactionType') {
      const selected = resolveTypeId(value);
      updated.transactionTypeId = selected === MONEY_IN ? MONEY_OUT : MONEY_IN;
    } else if (field === 'amount' || field === 'plannedAmount') {
      updated.amount = normalizeAmount(value);
      updated.plannedAmount = normalizeAmount(value);
    } else {
      updated[field] = value;
    }
  } else {
    if (field === 'primaryAccount') {
      updated.primaryAccountId = value?.id || null;
    } else if (field === 'secondaryAccount') {
      updated.secondaryAccountId = value?.id || null;
    } else if (field === 'transactionType') {
      updated.transactionTypeId = resolveTypeId(value);
    } else if (field === 'amount' || field === 'plannedAmount') {
      updated.amount = normalizeAmount(value);
      updated.plannedAmount = normalizeAmount(value);
    } else {
      updated[field] = value;
    }
  }

  updated.transactionTypeId = updated.transactionTypeId ?? MONEY_OUT;
  updated.transactionType = buildType(updated.transactionTypeId);
  updated.transactionTypeName = updated.transactionType.name;

  return updated;
}
