// projection-engine.js
// Generates financial projections for a scenario based on accounts and planned transactions
// Uses scenario-scoped data and calculation utilities

import { generateRecurrenceDates } from './calculation-utils.js';
import { applyPeriodicChange } from './financial-utils.js';
import { expandPeriodicChangeForCalculation } from './periodic-change-utils.js';
import { getScenario, saveProjections } from './data-manager.js';
import { parseDateOnly, formatDateOnly } from './date-utils.js';
import { expandTransactions } from './transaction-expander.js';
import { loadLookupData } from './config.js';

/**
 * Generate projections for a scenario
 * @param {number} scenarioId - The scenario ID to generate projections for
 * @param {Object} options - Generation options
 * @param {string} options.source - 'transactions' (default) or 'budget'
 * @param {string} options.periodicity - 'daily', 'weekly', 'monthly' (default), 'quarterly', 'yearly'
 * @returns {Promise<Array>} - Array of projection records
 */
export async function generateProjections(scenarioId, options = {}) {
  console.log('[ProjectionEngine] Generating projections for scenario:', scenarioId);
  
  const source = options.source || 'transactions';
  const lookupData = loadLookupData();
  
  // Load scenario data
  const scenario = await getScenario(scenarioId);
  if (!scenario) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  const accounts = scenario.accounts || [];
  let plannedTransactions;
  
  if (source === 'budget') {
    // Use budget occurrences as source instead of transactions
    console.log('[ProjectionEngine] Using budget as projection source');
    const statusName = budget => typeof budget.status === 'object' ? budget.status.name : budget.status;
    plannedTransactions = (scenario.budgets || [])
      .filter(budget => statusName(budget) === 'planned')
      .map(budget => ({
        id: budget.id,
        primaryAccountId: budget.primaryAccountId,
        secondaryAccountId: budget.secondaryAccountId,
        transactionTypeId: budget.transactionTypeId,
        amount: budget.amount,
        description: budget.description,
        recurrence: budget.recurrence,
        periodicChange: null, // Budget occurrences don't typically have periodic changes
        effectiveDate: budget.date,
        status: budget.status
      }));
  } else {
    // Use planned transactions (default) - filter by status.name
    const statusName = tx => typeof tx.status === 'object' ? tx.status.name : tx.status;
    plannedTransactions = (scenario.transactions || []).filter(tx => statusName(tx) === 'planned');
  }
  
  // Parse projection window
  const startDate = parseDateOnly(scenario.startDate);
  const endDate = parseDateOnly(scenario.endDate);
  
  console.log('[ProjectionEngine] Projection window:', startDate, 'to', endDate);
  console.log('[ProjectionEngine] Accounts:', accounts.length);
  console.log('[ProjectionEngine] Planned transactions/budget items:', plannedTransactions.length);
  
  // Initialize account balances from startingBalance
  const accountBalances = new Map();
  accounts.forEach(acc => {
    accountBalances.set(acc.id, acc.startingBalance || 0);
  });
  
  // Use shared transaction expander to generate all occurrences within the projection window
  const expandedTransactions = expandTransactions(plannedTransactions, startDate, endDate, accounts);
  
  console.log('[ProjectionEngine] Expanded to', expandedTransactions.length, 'transaction occurrences');
  
  // Convert expanded transactions to occurrence format for projection calculations
  const transactionOccurrences = expandedTransactions.map(txn => {
    const occDate = txn._occurrenceDate || parseDateOnly(txn.effectiveDate);
    const occKey = occDate.getFullYear() * 10000 + (occDate.getMonth() + 1) * 100 + occDate.getDate();
    
    // Calculate amount for this occurrence (considering periodic changes)
    let amount = txn.amount || 0;
    
    if (txn.periodicChange) {
      const expandedPC = expandPeriodicChangeForCalculation(txn.periodicChange, lookupData);
      if (expandedPC) {
        const txnStartDate = txn.recurrence?.startDate ? parseDateOnly(txn.recurrence.startDate) : startDate;
        const yearsDiff = (occDate - txnStartDate) / (1000 * 60 * 60 * 24 * 365.25);
        amount = applyPeriodicChange(txn.amount, expandedPC, yearsDiff);
      }
    }
    
    return {
      date: occDate,
      dateKey: occKey,
      primaryAccountId: txn.primaryAccountId,
      secondaryAccountId: txn.secondaryAccountId,
      transactionTypeId: txn.transactionTypeId,
      amount: amount,
      description: txn.description || '',
      sourceTransactionId: txn.id
    };
  });
  
  // Sort occurrences by dateKey (date-only)
  transactionOccurrences.sort((a, b) => a.dateKey - b.dateKey);
  
  console.log('[ProjectionEngine] Generated', transactionOccurrences.length, 'transaction occurrences');
  
  // Generate projections - one record per account per period
  const projections = [];
  // Use scenario's projectionPeriod if available, otherwise fall back to options or default
  const scenarioPeriodType = scenario.projectionPeriod?.name || 'Month';
  
  // Map capitalized period names to lowercase periodicity strings
  const periodMap = {
    'Day': 'daily',
    'Week': 'weekly', 
    'Month': 'monthly',
    'Quarter': 'quarterly',
    'Year': 'yearly'
  };
  const periodicity = options.periodicity || periodMap[scenarioPeriodType] || 'monthly';
  
  console.log('[ProjectionEngine] Using periodicity:', periodicity, 'from scenario period type:', scenarioPeriodType);
  
  // Generate period dates
  const periods = generatePeriods(startDate, endDate, periodicity);
  
  console.log('[ProjectionEngine] Generating', periods.length, 'periods');
  
  accounts.forEach(account => {
    let currentBalance = account.startingBalance || 0;
    let lastPeriodEnd = new Date(startDate);
    lastPeriodEnd.setDate(lastPeriodEnd.getDate() - 1); // Start just before first period
    
    periods.forEach((period, periodIndex) => {
      const periodStart = period.start;
      const periodEnd = period.end;
      const periodStartKey = periodStart.getFullYear() * 10000 + (periodStart.getMonth() + 1) * 100 + periodStart.getDate();
      const periodEndKey = periodEnd.getFullYear() * 10000 + (periodEnd.getMonth() + 1) * 100 + periodEnd.getDate();
      
      // Apply interest/growth up to the period START so snapshot is at period start
      if (account.periodicChange) {
        const expandedPC = expandPeriodicChangeForCalculation(account.periodicChange, lookupData);
        if (expandedPC) {
          const yearsDiffToStart = (periodStart - lastPeriodEnd) / (1000 * 60 * 60 * 24 * 365.25);
          if (yearsDiffToStart !== 0) {
            currentBalance = applyPeriodicChange(currentBalance, expandedPC, yearsDiffToStart);
          }
        }
      }

      // Apply transactions in this period to compute income/expenses and update running balance
      let periodIncome = 0;
      let periodExpenses = 0;

      transactionOccurrences.forEach(txn => {
        if (txn.dateKey >= periodStartKey && txn.dateKey <= periodEndKey) {
          // Check if this account is primary or secondary
          const absAmount = Math.abs(txn.amount);
          
          if (txn.primaryAccountId === account.id) {
            // Primary account: Money In adds, Money Out subtracts
            if (txn.transactionTypeId === 1) {
              // Money In
              currentBalance += absAmount;
              periodIncome += absAmount;
            } else {
              // Money Out
              currentBalance -= absAmount;
              periodExpenses += absAmount;
            }
          }
          
          if (txn.secondaryAccountId === account.id) {
            // Secondary account: opposite of primary
            if (txn.transactionTypeId === 1) {
              // Money In (from primary perspective) = Money Out from secondary
              currentBalance -= absAmount;
              periodExpenses += absAmount;
            } else {
              // Money Out (from primary perspective) = Money In from secondary
              currentBalance += absAmount;
              periodIncome += absAmount;
            }
          }
        }
      });

      // After applying transactions for the period, apply periodicChange across the period
      if (account.periodicChange) {
        const expandedPC = expandPeriodicChangeForCalculation(account.periodicChange, lookupData);
        if (expandedPC) {
          const yearsDiffPeriod = (periodEnd - periodStart) / (1000 * 60 * 60 * 24 * 365.25);
          if (yearsDiffPeriod !== 0) {
            currentBalance = applyPeriodicChange(currentBalance, expandedPC, yearsDiffPeriod);
          }
        }
      }

      // Create projection record (date remains period start, balance reflects end-of-period)
      projections.push({
        id: projections.length + 1,
        scenarioId: scenarioId,
        accountId: account.id,
        account: account.name,
        date: formatDateOnly(periodStart),
        balance: Math.round(currentBalance * 100) / 100,
        income: Math.round(periodIncome * 100) / 100,
        expenses: Math.round(periodExpenses * 100) / 100,
        netChange: Math.round((periodIncome - periodExpenses) * 100) / 100,
        period: periodIndex + 1
      });

      // Advance lastPeriodEnd to the period end for next iteration
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
  // Align initial start to period boundary depending on periodicity
  let currentStart = new Date(start);

  switch (periodicity) {
    case 'monthly':
      currentStart = new Date(currentStart.getFullYear(), currentStart.getMonth(), 1);
      break;
    case 'quarterly':
      currentStart = new Date(currentStart.getFullYear(), Math.floor(currentStart.getMonth() / 3) * 3, 1);
      break;
    case 'yearly':
      currentStart = new Date(currentStart.getFullYear(), 0, 1);
      break;
    case 'weekly':
      // Align to Monday as week start (ISO-like); if you prefer Sunday change getDay logic
      const day = currentStart.getDay();
      const diff = (day + 6) % 7; // days since Monday
      currentStart.setDate(currentStart.getDate() - diff);
      currentStart.setHours(0, 0, 0, 0);
      break;
    default:
      // daily and other types: keep provided start
      currentStart.setHours(0, 0, 0, 0);
  }

  // Iterate by stepping to next period start; include periods where the start is <= end
  while (currentStart <= end) {
    let periodStart = new Date(currentStart);
    let periodEnd;

    switch (periodicity) {
      case 'daily':
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate());
        break;
      case 'weekly':
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + 6); // week = 7 days starting at periodStart
        break;
      case 'monthly':
        periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0); // last day of month
        break;
      case 'quarterly':
        periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 3, 0);
        break;
      case 'yearly':
        periodEnd = new Date(periodStart.getFullYear(), 11, 31);
        break;
      default:
        periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);
    }

    // Clip to scenario end
    if (periodEnd > end) periodEnd = new Date(end);

    // Normalize times to local boundaries to avoid UTC formatting shifts
    const ps = new Date(periodStart);
    ps.setHours(0, 0, 0, 0);
    const pe = new Date(periodEnd);
    pe.setHours(23, 59, 59, 999);

    // Only include if periodStart is within the scenario window
    if (ps <= end) {
      periods.push({ start: ps, end: pe });
    }

    // Advance currentStart to the next period's start
    switch (periodicity) {
      case 'daily':
        currentStart.setDate(currentStart.getDate() + 1);
        break;
      case 'weekly':
        currentStart.setDate(currentStart.getDate() + 7);
        break;
      case 'monthly':
        currentStart = new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 1);
        break;
      case 'quarterly':
        currentStart = new Date(currentStart.getFullYear(), currentStart.getMonth() + 3, 1);
        break;
      case 'yearly':
        currentStart = new Date(currentStart.getFullYear() + 1, 0, 1);
        break;
      default:
        currentStart = new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 1);
    }
  }

  return periods;
}

/**
 * Format date as YYYY-MM-DD
 * @param {Date} date - Date to format
 * @returns {string} - Formatted date string
 */
function formatDate(date) {
  // Use local date components to avoid UTC offset causing previous-day dates
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
