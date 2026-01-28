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
    if (!tx.primaryAccountId || !tx.secondaryAccountId) return;

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
      const txDate = actualDate ? parseDateOnly(actualDate) : (tx.effectiveDate ? parseDateOnly(tx.effectiveDate) : null);
      if (txDate && txDate >= startDate && txDate <= endDate) {
        expandedTransactions.push({
          ...tx,
          effectiveDate: actualDate || tx.effectiveDate
        });
      }
    } else if (statusName === 'planned' && !tx.recurrence) {
      // Non-recurring planned transactions - check their effective date
      const txDate = tx.effectiveDate ? parseDateOnly(tx.effectiveDate) : null;
      if (txDate && txDate >= startDate && txDate <= endDate) {
        expandedTransactions.push({
          ...tx,
          effectiveDate: tx.effectiveDate
        });
      }
    }
  });

  return expandedTransactions;
}
