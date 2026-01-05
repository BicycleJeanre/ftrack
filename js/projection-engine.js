// projection-engine.js
// Generates financial projections for a scenario based on accounts and planned transactions
// Uses scenario-scoped data and calculation utilities

import { generateRecurrenceDates, calculatePeriodicChange } from './calculation-utils.js';
import { getScenario, saveProjections } from './data-manager.js';

/**
 * Generate projections for a scenario
 * @param {number} scenarioId - The scenario ID to generate projections for
 * @param {Object} options - Generation options
 * @returns {Promise<Array>} - Array of projection records
 */
export async function generateProjections(scenarioId, options = {}) {
  console.log('[ProjectionEngine] Generating projections for scenario:', scenarioId);
  
  // Load scenario data
  const scenario = await getScenario(scenarioId);
  if (!scenario) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  const accounts = scenario.accounts || [];
  const plannedTransactions = scenario.plannedTransactions || [];
  
  // Parse projection window
  const startDate = new Date(scenario.startDate);
  const endDate = new Date(scenario.endDate);
  
  console.log('[ProjectionEngine] Projection window:', startDate, 'to', endDate);
  console.log('[ProjectionEngine] Accounts:', accounts.length);
  console.log('[ProjectionEngine] Planned transactions:', plannedTransactions.length);
  
  // Initialize account balances
  const accountBalances = new Map();
  accounts.forEach(acc => {
    accountBalances.set(acc.id, acc.balance || 0);
  });
  
  // Generate all transaction occurrences from planned transactions
  const transactionOccurrences = [];
  
  plannedTransactions.forEach(txn => {
    if (!txn.recurrence) {
      console.warn('[ProjectionEngine] Transaction missing recurrence:', txn.id);
      return;
    }
    
    const dates = generateRecurrenceDates(txn.recurrence, startDate, endDate);
    
    dates.forEach(date => {
      // Calculate amount for this occurrence (considering amount changes)
      let amount = txn.amount || 0;
      
      if (txn.amountChange && txn.amountChange.rate && txn.amountChange.rate !== 0) {
        // Calculate periods from transaction start to this occurrence
        const txnStartDate = new Date(txn.recurrence.startDate);
        const yearsDiff = (date - txnStartDate) / (1000 * 60 * 60 * 24 * 365.25);
        amount = calculatePeriodicChange(txn.amount, txn.amountChange, yearsDiff);
      }
      
      transactionOccurrences.push({
        date: date,
        debitAccountId: txn.debitAccount?.id,
        creditAccountId: txn.creditAccount?.id,
        amount: amount,
        description: txn.description || '',
        sourceTransactionId: txn.id
      });
    });
  });
  
  // Sort occurrences by date
  transactionOccurrences.sort((a, b) => a.date - b.date);
  
  console.log('[ProjectionEngine] Generated', transactionOccurrences.length, 'transaction occurrences');
  
  // Generate projections - one record per account per period
  const projections = [];
  const periodicity = options.periodicity || 'monthly'; // daily, weekly, monthly, quarterly, yearly
  
  // Generate period dates
  const periods = generatePeriods(startDate, endDate, periodicity);
  
  console.log('[ProjectionEngine] Generating', periods.length, 'periods');
  
  accounts.forEach(account => {
    let currentBalance = account.balance || 0;
    let lastPeriodEnd = new Date(startDate);
    lastPeriodEnd.setDate(lastPeriodEnd.getDate() - 1); // Start just before first period
    
    periods.forEach((period, periodIndex) => {
      const periodStart = period.start;
      const periodEnd = period.end;
      
      // Apply interest/growth for the period if configured
      if (account.periodicChange && account.periodicChange.rate && account.periodicChange.rate !== 0) {
        const yearsDiff = (periodEnd - lastPeriodEnd) / (1000 * 60 * 60 * 24 * 365.25);
        const newBalance = calculatePeriodicChange(currentBalance, account.periodicChange, yearsDiff);
        currentBalance = newBalance;
      }
      
      // Apply transactions in this period
      let periodIncome = 0;
      let periodExpenses = 0;
      
      transactionOccurrences.forEach(txn => {
        if (txn.date >= periodStart && txn.date <= periodEnd) {
          // Debit from this account (money out)
          if (txn.debitAccountId === account.id) {
            currentBalance -= txn.amount;
            periodExpenses += txn.amount;
          }
          
          // Credit to this account (money in)
          if (txn.creditAccountId === account.id) {
            currentBalance += txn.amount;
            periodIncome += txn.amount;
          }
        }
      });
      
      // Create projection record
      projections.push({
        id: projections.length + 1,
        scenarioId: scenarioId,
        accountId: account.id,
        account: account.name, // Changed from accountName to account
        date: formatDate(periodEnd),
        balance: Math.round(currentBalance * 100) / 100,
        income: Math.round(periodIncome * 100) / 100,
        expenses: Math.round(periodExpenses * 100) / 100,
        netChange: Math.round((periodIncome - periodExpenses) * 100) / 100,
        period: periodIndex + 1
      });
      
      lastPeriodEnd = periodEnd;
    });
  });
  
  console.log('[ProjectionEngine] Generated', projections.length, 'projection records');
  
  // Save projections to scenario
  await saveProjections(scenarioId, projections);
  
  return projections;
}

/**
 * Generate period boundaries based on periodicity
 * @param {Date} start - Start date
 * @param {Date} end - End date
 * @param {string} periodicity - Periodicity type
 * @returns {Array} - Array of {start, end} objects
 */
function generatePeriods(start, end, periodicity) {
  const periods = [];
  let currentStart = new Date(start);
  
  while (currentStart < end) {
    let currentEnd = new Date(currentStart);
    
    switch (periodicity) {
      case 'daily':
        currentEnd.setDate(currentEnd.getDate() + 1);
        break;
      case 'weekly':
        currentEnd.setDate(currentEnd.getDate() + 7);
        break;
      case 'monthly':
        currentEnd.setMonth(currentEnd.getMonth() + 1);
        break;
      case 'quarterly':
        currentEnd.setMonth(currentEnd.getMonth() + 3);
        break;
      case 'yearly':
        currentEnd.setFullYear(currentEnd.getFullYear() + 1);
        break;
      default:
        currentEnd.setMonth(currentEnd.getMonth() + 1);
    }
    
    // Don't exceed end date
    if (currentEnd > end) {
      currentEnd = new Date(end);
    }
    
    periods.push({
      start: new Date(currentStart),
      end: new Date(currentEnd)
    });
    
    currentStart = new Date(currentEnd);
    currentStart.setDate(currentStart.getDate() + 1);
  }
  
  return periods;
}

/**
 * Format date as YYYY-MM-DD
 * @param {Date} date - Date to format
 * @returns {string} - Formatted date string
 */
function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Clear projections for a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<void>}
 */
export async function clearProjections(scenarioId) {
  console.log('[ProjectionEngine] Clearing projections for scenario:', scenarioId);
  await saveProjections(scenarioId, []);
}
