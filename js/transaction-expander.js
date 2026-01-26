// transaction-expander.js
// Shared utility for expanding transactions based on recurrence patterns

import { generateRecurrenceDates } from './calculation-utils.js';
import { parseDateOnly, formatDateOnly } from './date-utils.js';

/**
 * Expand transactions by their recurrence patterns within a date range
 * @param {Array} transactions - Array of transaction objects with recurrence
 * @param {Date} startDate - Start date of the period
 * @param {Date} endDate - End date of the period
 * @param {Array} accounts - Array of account objects for resolving IDs
 * @returns {Array} - Array of expanded transaction occurrences
 */
export function expandTransactions(transactions, startDate, endDate, accounts = []) {
  const expandedTransactions = [];

  transactions.forEach(tx => {
    // Ignore transactions that are not fully linked to accounts
    if (!tx.debitAccount || !tx.creditAccount) return;

    const statusName = typeof tx.status === 'object' ? tx.status.name : tx.status;
    
    if (statusName === 'planned' && tx.recurrence) {
      // Generate occurrences for this transaction within the period
      const occurrenceDates = generateRecurrenceDates(tx.recurrence, startDate, endDate);
      
      occurrenceDates.forEach(date => {
        expandedTransactions.push({
          ...tx,
          effectiveDate: formatDateOnly(date),
          _occurrenceDate: date,
          _isExpanded: true
        });
      });
    } else if (statusName === 'actual') {
      // For actual transactions, check if they fall within the period
      const actualDate = typeof tx.status === 'object' ? tx.status.actualDate : tx.actualDate;
      const txDate = actualDate ? parseDateOnly(actualDate) : (tx.recurrence?.startDate ? parseDateOnly(tx.recurrence.startDate) : null);
      if (txDate && txDate >= startDate && txDate <= endDate) {
        expandedTransactions.push({
          ...tx,
          effectiveDate: actualDate || tx.recurrence?.startDate
        });
      }
    } else {
      // Non-recurring planned transactions - check their recurrence start date
      const txDate = tx.recurrence?.startDate ? parseDateOnly(tx.recurrence.startDate) : null;
      if (txDate && txDate >= startDate && txDate <= endDate) {
        expandedTransactions.push({
          ...tx,
          effectiveDate: tx.recurrence.startDate
        });
      }
    }
  });

  return expandedTransactions;
}

/**
 * Resolve account IDs to full account objects for UI display
 * This transforms primaryAccountId/secondaryAccountId to debitAccount/creditAccount
 * based on transactionTypeId
 * @param {Array} transactions - Array of transactions with account IDs
 * @param {Array} accounts - Array of account objects
 * @returns {Array} - Transactions with resolved account objects
 */
export function resolveTransactionAccounts(transactions, accounts) {
  return transactions.map(tx => {
    const primaryAccount = accounts.find(a => a.id === tx.primaryAccountId);
    const secondaryAccount = accounts.find(a => a.id === tx.secondaryAccountId);
    
    // Map to legacy debitAccount/creditAccount based on transaction type
    // transactionTypeId: 1 = Money In (secondary → primary), 2 = Money Out (primary → secondary)
    const debitAccount = tx.transactionTypeId === 1 ? secondaryAccount : primaryAccount;
    const creditAccount = tx.transactionTypeId === 1 ? primaryAccount : secondaryAccount;
    
    return {
      ...tx,
      debitAccount: debitAccount || null,
      creditAccount: creditAccount || null
    };
  });
}
