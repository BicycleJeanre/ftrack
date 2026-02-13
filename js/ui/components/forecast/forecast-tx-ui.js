// forecast-tx-ui.js
// Forecast transaction UI mapping helpers extracted from forecast.js (no behavior change).

/**
 * Transform planned transactions to UI format (transactionType/secondaryAccount)
 * filtered by selected account.
 */
export function transformPlannedTxForUI({ currentScenario, plannedTxs, transactionFilterAccountId }) {
  const selIdNum = transactionFilterAccountId != null ? Number(transactionFilterAccountId) : null;

  const result = (plannedTxs || []).map((tx) => {
    if (!selIdNum) {
      const secondaryAccount = tx.secondaryAccountId
        ? currentScenario?.accounts?.find(a => a.id === tx.secondaryAccountId) || { id: tx.secondaryAccountId }
        : null;
      return {
        ...tx,
        transactionType: { id: 1, name: 'Money Out' },
        secondaryAccount
      };
    }

    const mapped = mapTxToUI({ currentScenario, tx, transactionFilterAccountId: selIdNum });
    if (!mapped) return null;

    return {
      ...tx,
      amount: mapped.amount,
      transactionType: mapped.transactionType,
      secondaryAccount: mapped.secondaryAccount
    };
  }).filter(tx => tx !== null);

  return result;
}

/**
 * Transform actual transactions for UI (same as planned transactions)
 */
export function transformActualTxForUI({ currentScenario, actualTxs, transactionFilterAccountId }) {
  const selIdNum = transactionFilterAccountId != null ? Number(transactionFilterAccountId) : null;

  if (!selIdNum) {
    return (actualTxs || []).map(tx => {
      const secondaryAccount = tx.secondaryAccountId
        ? currentScenario?.accounts?.find(a => a.id === tx.secondaryAccountId) || { id: tx.secondaryAccountId }
        : null;
      return {
        ...tx,
        transactionType: tx.transactionType || (tx.transactionTypeId === 1 ? { id: 1, name: 'Money In' } : { id: 2, name: 'Money Out' }),
        secondaryAccount
      };
    });
  }

  return (actualTxs || []).map(tx => {
    const mapped = mapTxToUI({ currentScenario, tx, transactionFilterAccountId: selIdNum });
    if (!mapped) return null;
    return { ...tx, transactionType: mapped.transactionType, secondaryAccount: mapped.secondaryAccount };
  }).filter(tx => tx !== null);
}

/**
 * Map a backend transaction to UI representation for a selected account.
 * Returns null if the transaction does not involve the selected account.
 */
export function mapTxToUI({ currentScenario, tx, transactionFilterAccountId }) {
  const selIdNum = transactionFilterAccountId != null ? Number(transactionFilterAccountId) : null;
  if (!selIdNum) return null;

  const storedPrimaryId = tx.primaryAccountId;
  const storedSecondaryId = tx.secondaryAccountId;
  const storedTypeId = tx.transactionTypeId || tx.transactionType?.id;

  const isStoredPrimary = Number(storedPrimaryId) === selIdNum;
  const isStoredSecondary = Number(storedSecondaryId) === selIdNum;

  if (!isStoredPrimary && !isStoredSecondary) return null;

  if (isStoredPrimary) {
    const primaryAccount = currentScenario?.accounts?.find(a => a.id === selIdNum) || { id: selIdNum };
    const secondaryAccount = storedSecondaryId
      ? currentScenario?.accounts?.find(a => a.id === storedSecondaryId) || { id: storedSecondaryId }
      : null;
    const transactionType = storedTypeId === 1 ? { id: 1, name: 'Money In' } : { id: 2, name: 'Money Out' };

    return {
      transactionType,
      secondaryAccount,
      primaryAccount,
      amount: tx.amount
    };
  }

  const primaryAccount = currentScenario?.accounts?.find(a => a.id === selIdNum) || { id: selIdNum };
  const secondaryAccount = storedPrimaryId
    ? currentScenario?.accounts?.find(a => a.id === storedPrimaryId) || { id: storedPrimaryId }
    : null;

  const transactionType = storedTypeId === 1 ? { id: 2, name: 'Money Out' } : { id: 1, name: 'Money In' };
  const flippedAmount = -(tx.amount || 0);

  return {
    transactionType,
    secondaryAccount,
    primaryAccount,
    amount: flippedAmount
  };
}
