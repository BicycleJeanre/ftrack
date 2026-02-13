// projection-engine.js
// Generates financial projections for a scenario based on accounts and planned transactions
// Uses scenario-scoped data and calculation utilities

import { generateRecurrenceDates } from './calculation-utils.js';
import { applyPeriodicChange } from './financial-utils.js';
import { expandPeriodicChangeForCalculation } from './periodic-change-utils.js';
import { getScenario, saveProjections } from './data-manager.js';
import { parseDateOnly, formatDateOnly } from './date-utils.js';
import { expandTransactions } from './transaction-expander.js';
import { loadLookup } from './lookup-loader.js';

/**
 * Generate projections for a scenario
 * @param {number} scenarioId - The scenario ID to generate projections for
 * @param {Object} options - Generation options
 * @param {string} options.source - 'transactions' (default) or 'budget'
 * @param {string} options.periodicity - 'daily', 'weekly', 'monthly' (default), 'quarterly', 'yearly'
 * @returns {Promise<Array>} - Array of projection records
 */
export async function generateProjections(scenarioId, options = {}) {
  const lookupData = await loadLookup('lookup-data.json');
  const scenario = await getScenario(scenarioId);
  if (!scenario) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }

  const projections = await generateProjectionsForScenario(scenario, options, lookupData);
  await saveProjections(scenarioId, projections);
  return projections;
}

export async function generateProjectionsForScenario(scenario, options = {}, lookupDataOverride = null) {
  const source = options.source || 'transactions';
  const lookupData = lookupDataOverride || (await loadLookup('lookup-data.json'));

  const accounts = scenario.accounts || [];
  let plannedTransactions;

  if (source === 'budget') {
    const statusName = (budget) => (typeof budget.status === 'object' ? budget.status.name : budget.status);
    plannedTransactions = (scenario.budgets || [])
      .filter((budget) => statusName(budget) === 'planned')
      .map((budget) => ({
        id: budget.id,
        primaryAccountId: budget.primaryAccountId,
        secondaryAccountId: budget.secondaryAccountId,
        transactionTypeId: budget.transactionTypeId,
        amount: budget.amount,
        description: budget.description,
        recurrence: budget.recurrence,
        periodicChange: null,
        effectiveDate: budget.date,
        status: budget.status
      }));
  } else {
    const statusName = (tx) => (typeof tx.status === 'object' ? tx.status.name : tx.status);
    plannedTransactions = (scenario.transactions || []).filter((tx) => statusName(tx) === 'planned');
  }

  const startDate = parseDateOnly(scenario.startDate);
  const endDate = parseDateOnly(scenario.endDate);

  const expandedTransactions = expandTransactions(plannedTransactions, startDate, endDate, accounts);

  const transactionOccurrences = expandedTransactions.map((txn) => {
    const occDate = txn._occurrenceDate || parseDateOnly(txn.effectiveDate);
    const occKey = occDate.getFullYear() * 10000 + (occDate.getMonth() + 1) * 100 + occDate.getDate();

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

  transactionOccurrences.sort((a, b) => a.dateKey - b.dateKey);

  const projections = [];
  
  // Extract period type ID (1=Day, 2=Week, 3=Month, 4=Quarter, 5=Year)
  const periodTypeId = typeof scenario.projectionPeriod === 'number'
    ? scenario.projectionPeriod
    : scenario.projectionPeriod?.id || 3; // Default to Month (ID 3)
  
  const periodIdToString = {
    1: 'daily',
    2: 'weekly',
    3: 'monthly',
    4: 'quarterly',
    5: 'yearly'
  };
  
  const periodicity = options.periodicity || periodIdToString[periodTypeId] || 'monthly';
  const periods = generatePeriods(startDate, endDate, periodicity);

  accounts.forEach((account) => {
    let currentBalance = account.startingBalance || 0;
    let lastPeriodEnd = new Date(startDate);
    lastPeriodEnd.setDate(lastPeriodEnd.getDate() - 1);

    periods.forEach((period, periodIndex) => {
      const periodStart = period.start;
      const periodEnd = period.end;
      const periodStartKey =
        periodStart.getFullYear() * 10000 + (periodStart.getMonth() + 1) * 100 + periodStart.getDate();
      const periodEndKey = periodEnd.getFullYear() * 10000 + (periodEnd.getMonth() + 1) * 100 + periodEnd.getDate();

      let periodIncome = 0;
      let periodExpenses = 0;
      let periodInterest = 0;

      if (account.periodicChange) {
        const expandedPC = expandPeriodicChangeForCalculation(account.periodicChange, lookupData);
        if (expandedPC) {
          const yearsDiffToStart = (periodStart - lastPeriodEnd) / (1000 * 60 * 60 * 24 * 365.25);
          if (yearsDiffToStart !== 0) {
            const beforeBalance = currentBalance;
            currentBalance = applyPeriodicChange(currentBalance, expandedPC, yearsDiffToStart);
            const interestDelta = currentBalance - beforeBalance;
            periodInterest += interestDelta;
            if (interestDelta >= 0) periodIncome += interestDelta;
            else periodExpenses += Math.abs(interestDelta);
          }
        }
      }

      transactionOccurrences.forEach((txn) => {
        if (txn.dateKey >= periodStartKey && txn.dateKey <= periodEndKey) {
          const absAmount = Math.abs(txn.amount);

          if (txn.primaryAccountId === account.id) {
            if (txn.transactionTypeId === 1) {
              currentBalance += absAmount;
              periodIncome += absAmount;
            } else {
              currentBalance -= absAmount;
              periodExpenses += absAmount;
            }
          }

          if (txn.secondaryAccountId === account.id) {
            if (txn.transactionTypeId === 1) {
              currentBalance -= absAmount;
              periodExpenses += absAmount;
            } else {
              currentBalance += absAmount;
              periodIncome += absAmount;
            }
          }
        }
      });

      if (account.periodicChange) {
        const expandedPC = expandPeriodicChangeForCalculation(account.periodicChange, lookupData);
        if (expandedPC) {
          const yearsDiffPeriod = (periodEnd - periodStart) / (1000 * 60 * 60 * 24 * 365.25);
          if (yearsDiffPeriod !== 0) {
            const beforeBalance = currentBalance;
            currentBalance = applyPeriodicChange(currentBalance, expandedPC, yearsDiffPeriod);
            const interestDelta = currentBalance - beforeBalance;
            periodInterest += interestDelta;
            if (interestDelta >= 0) periodIncome += interestDelta;
            else periodExpenses += Math.abs(interestDelta);
          }
        }
      }

      projections.push({
        id: projections.length + 1,
        scenarioId: scenario.id,
        accountId: account.id,
        account: account.name,
        date: formatDateOnly(periodStart),
        balance: Math.round(currentBalance * 100) / 100,
        income: Math.round(periodIncome * 100) / 100,
        expenses: Math.round(periodExpenses * 100) / 100,
        netChange: Math.round((periodIncome - periodExpenses) * 100) / 100,
        interest: Math.round(periodInterest * 100) / 100,
        period: periodIndex + 1
      });

      lastPeriodEnd = periodEnd;
    });
  });

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
  // Start from the scenario start date (do NOT align to period boundary for first period)
  // This ensures we only calculate projections for dates where transactions can actually occur
  let currentStart = new Date(start);
  currentStart.setHours(0, 0, 0, 0);
  
  let isFirstPeriod = true;

  // Iterate by stepping to next period start; include periods where the start is <= end
  while (currentStart <= end) {
    let periodStart = new Date(currentStart);
    let periodEnd;

    // Calculate period end based on periodicity
    if (isFirstPeriod) {
      // For the first period, extend to the end of the current period boundary
      switch (periodicity) {
        case 'daily':
          periodEnd = new Date(periodStart);
          break;
        case 'weekly':
          // Find the end of the week (Sunday) from the start date
          const daysToWeekEnd = 6 - periodStart.getDay();
          periodEnd = new Date(periodStart);
          periodEnd.setDate(periodEnd.getDate() + daysToWeekEnd);
          break;
        case 'monthly':
          periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0); // last day of month
          break;
        case 'quarterly':
          const startQuarter = Math.floor(periodStart.getMonth() / 3);
          periodEnd = new Date(periodStart.getFullYear(), (startQuarter + 1) * 3, 0);
          break;
        case 'yearly':
          periodEnd = new Date(periodStart.getFullYear(), 11, 31);
          break;
        default:
          periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);
      }
    } else {
      // For subsequent periods, use standard period lengths
      switch (periodicity) {
        case 'daily':
          periodEnd = new Date(periodStart);
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
    // After the first period, align to period boundaries
    if (isFirstPeriod) {
      isFirstPeriod = false;
      // Move to the start of the next period boundary
      switch (periodicity) {
        case 'daily':
          currentStart = new Date(periodEnd);
          currentStart.setDate(currentStart.getDate() + 1);
          break;
        case 'weekly':
          currentStart = new Date(periodEnd);
          currentStart.setDate(currentStart.getDate() + 1);
          // Align to Monday (start of week)
          const day = currentStart.getDay();
          const daysToMonday = (1 - day + 7) % 7; // days forward to reach Monday
          currentStart.setDate(currentStart.getDate() + daysToMonday);
          break;
        case 'monthly':
          currentStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 1);
          break;
        case 'quarterly':
          currentStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 1);
          // Align to quarter boundary
          currentStart = new Date(currentStart.getFullYear(), Math.floor(currentStart.getMonth() / 3) * 3, 1);
          break;
        case 'yearly':
          currentStart = new Date(periodEnd.getFullYear() + 1, 0, 1);
          break;
        default:
          currentStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 1);
      }
    } else {
      // Standard period advancement for aligned periods
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
  await saveProjections(scenarioId, []);
}
