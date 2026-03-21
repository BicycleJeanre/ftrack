// projection-engine.js
// Generates financial projections for a scenario based on accounts and planned transactions
// Uses scenario-scoped data and calculation utilities

import { generateRecurrenceDates, calculatePeriodicChange } from './calculation-engine.js';
import { expandPeriodicChangeForCalculation } from './periodic-change-utils.js';
import { getScenario, saveProjectionBundle } from '../../app/services/data-service.js';
import { parseDateOnly, formatDateOnly } from '../../shared/date-utils.js';
import { expandTransactions } from './transaction-expander.js';
import { loadLookup } from '../../app/services/lookup-service.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAYS_PER_YEAR = 365.25;

function toDateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.valueOf());
}

function getInclusiveDayCount(startDate, endDate) {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.floor((end - start) / MS_PER_DAY) + 1;
}

function getId(value) {
  return typeof value === 'object' ? value?.id : value;
}

function normalizePeriodicChangeScheduleEntries(scheduleEntries = []) {
  if (!Array.isArray(scheduleEntries)) return [];

  const normalized = scheduleEntries
    .map((entry) => {
      const startDate = entry?.startDate ? parseDateOnly(entry.startDate) : null;
      const endDate = entry?.endDate ? parseDateOnly(entry.endDate) : null;

      return {
        startDate,
        endDate,
        periodicChange: entry?.periodicChange ?? null,
        _raw: entry
      };
    })
    .filter((entry) => isValidDate(entry.startDate));

  normalized.sort((a, b) => a.startDate - b.startDate);
  return normalized;
}

function getScheduledPeriodicChangeForDate({ account, normalizedScheduleEntries, date }) {
  for (const entry of normalizedScheduleEntries) {
    if (date < entry.startDate) break;
    if (!entry.endDate || date <= entry.endDate) {
      return entry.periodicChange;
    }
  }
  return account.periodicChange ?? null;
}

function toDateKey(date) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function roundMoney(value) {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function resolveOccurrenceSplit(occurrence, absAmount) {
  const hasCapital = occurrence?.capitalAmount !== undefined && occurrence?.capitalAmount !== null;
  const hasInterest = occurrence?.interestAmount !== undefined && occurrence?.interestAmount !== null;

  if (hasCapital || hasInterest) {
    const rawCapital = hasCapital ? Math.abs(Number(occurrence.capitalAmount || 0)) : null;
    const rawInterest = hasInterest ? Math.abs(Number(occurrence.interestAmount || 0)) : null;

    if (rawCapital === null && rawInterest === null) {
      return { capital: absAmount, interest: 0 };
    }
    if (rawCapital === null) {
      const interest = Math.min(absAmount, rawInterest);
      return { capital: absAmount - interest, interest };
    }
    if (rawInterest === null) {
      const capital = Math.min(absAmount, rawCapital);
      return { capital, interest: absAmount - capital };
    }

    const total = rawCapital + rawInterest;
    if (!total || total <= absAmount) {
      return { capital: rawCapital, interest: rawInterest };
    }

    const scale = absAmount / total;
    return {
      capital: rawCapital * scale,
      interest: rawInterest * scale
    };
  }

  const role = String(occurrence?.transactionGroupRole || '').toLowerCase();
  if (role === 'interest' || occurrence?.source === 'derivedPeriodicChange') {
    return { capital: 0, interest: absAmount };
  }

  return { capital: absAmount, interest: 0 };
}

function applyOccurrenceToStates({
  occurrence,
  accountStateById,
  periodStatsByAccountId
}) {
  if (!occurrence) return;

  const amount = Math.abs(Number(occurrence.amount || 0));
  if (!amount) return;

  const split = resolveOccurrenceSplit(occurrence, amount);
  const transactionTypeId = Number(occurrence.transactionTypeId) === 1 ? 1 : 2;
  const primaryAccountId = Number(occurrence.primaryAccountId || 0);
  const secondaryAccountId = Number(occurrence.secondaryAccountId || 0);

  const applyToAccount = (accountId, isIn) => {
    if (!accountId) return;

    const state = accountStateById.get(accountId);
    const stats = periodStatsByAccountId.get(accountId);
    if (!state || !stats) return;

    if (isIn) {
      state.balance += amount;
      stats.income += amount;
      stats.capitalIn += split.capital;
      stats.interestIn += split.interest;
      return;
    }

    state.balance -= amount;
    stats.expenses += amount;
    stats.capitalOut += split.capital;
    stats.interestOut += split.interest;
  };

  // Primary side: Money In => in, Money Out => out.
  applyToAccount(primaryAccountId, transactionTypeId === 1);

  // Secondary side mirrors direction (Money In => out, Money Out => in).
  if (secondaryAccountId && secondaryAccountId !== primaryAccountId) {
    applyToAccount(secondaryAccountId, transactionTypeId === 2);
  }
}

function createDerivedPeriodicChangeOccurrence({
  account,
  delta,
  date,
  accountIdsSet
}) {
  const amount = Math.abs(Number(delta || 0));
  if (!amount) return null;

  const direction = String(account?.interestPostingDirection || '').trim().toLowerCase();
  let transactionTypeId;
  if (direction === 'expense' || direction === 'out' || direction === 'outflow' || direction === 'debit') {
    transactionTypeId = 2;
  } else if (direction === 'income' || direction === 'in' || direction === 'inflow' || direction === 'credit') {
    transactionTypeId = 1;
  } else {
    transactionTypeId = delta >= 0 ? 1 : 2;
  }

  const primaryAccountId = Number(account?.id || 0);
  const candidateSecondaryId = Number(account?.interestAccountId || 0);
  const secondaryAccountId =
    candidateSecondaryId &&
    candidateSecondaryId !== primaryAccountId &&
    accountIdsSet.has(candidateSecondaryId)
      ? candidateSecondaryId
      : null;

  return {
    date,
    dateKey: toDateKey(date),
    primaryAccountId,
    secondaryAccountId,
    transactionTypeId,
    amount,
    description: 'Derived periodic change posting',
    source: 'derivedPeriodicChange',
    sourceTransactionId: null,
    transactionGroupRole: 'interest',
    capitalAmount: 0,
    interestAmount: amount
  };
}

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

  const projectionConfig = getProjectionConfig({ scenario, options });
  const projections = await generateProjectionsForScenario(scenario, options, lookupData);

  await saveProjectionBundle(scenarioId, {
    config: projectionConfig,
    rows: projections,
    generatedAt: new Date().toISOString()
  });

  return projections;
}

function coercePeriodTypeId(value) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const id = Number(value.id);
    return Number.isFinite(id) ? id : null;
  }
  const str = value != null ? String(value).toLowerCase() : '';
  if (str === 'day' || str === 'daily') return 1;
  if (str === 'week' || str === 'weekly') return 2;
  if (str === 'month' || str === 'monthly') return 3;
  if (str === 'quarter' || str === 'quarterly') return 4;
  if (str === 'year' || str === 'yearly') return 5;
  return null;
}

function getProjectionConfig({ scenario, options = {} }) {
  const config = scenario?.projection?.config || {};
  const startDate = options.startDate || config.startDate || null;
  const endDate = options.endDate || config.endDate || null;
  const periodTypeIdRaw = options.periodTypeId ?? config.periodTypeId ?? 3;
  const periodTypeId = coercePeriodTypeId(periodTypeIdRaw) || 3;
  const source = options.source || config.source || 'transactions';

  return {
    startDate,
    endDate,
    periodTypeId,
    source: source === 'budget' ? 'budget' : 'transactions'
  };
}

export async function generateProjectionsForScenario(scenario, options = {}, lookupDataOverride = null) {
  const projectionConfig = getProjectionConfig({ scenario, options });
  const source = projectionConfig.source || 'transactions';
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
        status: budget.status,
        transactionGroupId: budget.transactionGroupId ?? null,
        transactionGroupRole: budget.transactionGroupRole ?? null
      }));
  } else {
    const statusName = (tx) => (typeof tx.status === 'object' ? tx.status.name : tx.status);
    plannedTransactions = (scenario.transactions || []).filter((tx) => statusName(tx) === 'planned');
  }

  const startDate = parseDateOnly(projectionConfig.startDate);
  const endDate = parseDateOnly(projectionConfig.endDate);
  if (!startDate || !endDate) {
    throw new Error('Scenario projection config missing startDate or endDate');
  }

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
        amount = calculatePeriodicChange(txn.amount, expandedPC, yearsDiff);
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
      sourceTransactionId: txn.id,
      source: 'transaction',
      transactionGroupId: txn.transactionGroupId ?? null,
      transactionGroupRole: txn.transactionGroupRole ?? null,
      capitalAmount: txn.capitalAmount ?? null,
      interestAmount: txn.interestAmount ?? null
    };
  });

  transactionOccurrences.sort((a, b) => a.dateKey - b.dateKey);

  // Projection period type is an engine-only concept (not tied to UI view period controls).
  const periodTypeId = Number(projectionConfig.periodTypeId) || 3;
  const periodIdToString = {
    1: 'daily',
    2: 'weekly',
    3: 'monthly',
    4: 'quarterly',
    5: 'yearly'
  };
  const periodicity = options.periodicity || periodIdToString[periodTypeId] || 'monthly';
  const periods = generatePeriods(startDate, endDate, periodicity);

  const accountIdsSet = new Set(
    (accounts || []).map((a) => Number(a?.id || 0)).filter(Boolean)
  );

  const accountStateById = new Map();
  (accounts || []).forEach((account) => {
    const accountId = Number(account?.id || 0);
    if (!accountId) return;
    accountStateById.set(accountId, {
      balance: Number(account?.startingBalance || 0),
      simpleInterestState: {
        principalBase: Number(account?.startingBalance || 0),
        elapsedYears: 0
      },
      normalizedScheduleEntries: normalizePeriodicChangeScheduleEntries(account?.periodicChangeSchedule)
    });
  });

  const projections = [];
  let nextProjectionId = 1;
  let occurrenceCursor = 0;

  periods.forEach((period, periodIndex) => {
    const periodStart = period.start;
    const periodEnd = period.end;
    const periodStartKey = toDateKey(periodStart);
    const periodEndKey = toDateKey(periodEnd);

    const periodStatsByAccountId = new Map();
    (accounts || []).forEach((account) => {
      const accountId = Number(account?.id || 0);
      if (!accountId) return;
      periodStatsByAccountId.set(accountId, {
        income: 0,
        expenses: 0,
        capitalIn: 0,
        capitalOut: 0,
        interestIn: 0,
        interestOut: 0
      });
    });

    while (
      occurrenceCursor < transactionOccurrences.length &&
      transactionOccurrences[occurrenceCursor].dateKey < periodStartKey
    ) {
      occurrenceCursor += 1;
    }

    let periodOccurrenceIndex = occurrenceCursor;
    while (
      periodOccurrenceIndex < transactionOccurrences.length &&
      transactionOccurrences[periodOccurrenceIndex].dateKey <= periodEndKey
    ) {
      applyOccurrenceToStates({
        occurrence: transactionOccurrences[periodOccurrenceIndex],
        accountStateById,
        periodStatsByAccountId
      });
      periodOccurrenceIndex += 1;
    }
    occurrenceCursor = periodOccurrenceIndex;

    // Convert account periodic change deltas into derived posting occurrences.
    (accounts || []).forEach((account) => {
      const accountId = Number(account?.id || 0);
      if (!accountId) return;

      const accountState = accountStateById.get(accountId);
      if (!accountState) return;

      const normalizedScheduleEntries = accountState.normalizedScheduleEntries || [];

      if (normalizedScheduleEntries.length > 0) {
        const changePoints = [toDateOnly(periodStart)];

        normalizedScheduleEntries.forEach((entry) => {
          if (entry.startDate > periodStart && entry.startDate <= periodEnd) {
            changePoints.push(toDateOnly(entry.startDate));
          }
          if (entry.endDate) {
            const nextDay = addDays(entry.endDate, 1);
            if (nextDay > periodStart && nextDay <= periodEnd) {
              changePoints.push(toDateOnly(nextDay));
            }
          }
        });

        const uniquePoints = Array.from(
          new Map(changePoints.map((d) => [d.valueOf(), d])).values()
        ).sort((a, b) => a - b);

        uniquePoints.forEach((segmentStart, idx) => {
          const segmentEnd =
            idx + 1 < uniquePoints.length ? addDays(uniquePoints[idx + 1], -1) : toDateOnly(periodEnd);
          if (segmentStart > segmentEnd) return;

          const pcForSegment = getScheduledPeriodicChangeForDate({
            account,
            normalizedScheduleEntries,
            date: segmentStart
          });
          if (!pcForSegment) return;

          const expandedPC = expandPeriodicChangeForCalculation(pcForSegment, lookupData);
          if (!expandedPC) return;

          const yearsDiff = getInclusiveDayCount(segmentStart, segmentEnd) / DAYS_PER_YEAR;
          if (!yearsDiff) return;

          const beforeBalance = Number(accountState.balance || 0);
          const changeModeId = getId(expandedPC.changeMode);
          const changeTypeId = getId(expandedPC.changeType);

          let afterBalance;
          if (changeModeId === 1 && changeTypeId === 1) {
            const rate = (expandedPC.value || 0) / 100;
            const simpleInterestDelta = accountState.simpleInterestState.principalBase * rate * yearsDiff;
            afterBalance = beforeBalance + simpleInterestDelta;
          } else {
            afterBalance = calculatePeriodicChange(beforeBalance, expandedPC, yearsDiff);
          }

          const delta = afterBalance - beforeBalance;
          if (!delta) return;

          const derivedOccurrence = createDerivedPeriodicChangeOccurrence({
            account,
            delta,
            date: segmentEnd,
            accountIdsSet
          });

          applyOccurrenceToStates({
            occurrence: derivedOccurrence,
            accountStateById,
            periodStatsByAccountId
          });
        });
      } else if (account.periodicChange) {
        const expandedPC = expandPeriodicChangeForCalculation(account.periodicChange, lookupData);
        if (!expandedPC) return;

        const yearsDiffPeriod = getInclusiveDayCount(periodStart, periodEnd) / DAYS_PER_YEAR;
        if (!yearsDiffPeriod) return;

        const beforeBalance = Number(accountState.balance || 0);
        const changeModeId = getId(expandedPC.changeMode);
        const changeTypeId = getId(expandedPC.changeType);

        let delta = 0;
        if (changeModeId === 1 && changeTypeId === 1) {
          const rate = (expandedPC.value || 0) / 100;
          const previousInterest = accountState.simpleInterestState.principalBase * rate * accountState.simpleInterestState.elapsedYears;
          const nextElapsedYears = accountState.simpleInterestState.elapsedYears + yearsDiffPeriod;
          const nextInterest = accountState.simpleInterestState.principalBase * rate * nextElapsedYears;
          delta = nextInterest - previousInterest;
          accountState.simpleInterestState.elapsedYears = nextElapsedYears;
        } else {
          const afterBalance = calculatePeriodicChange(beforeBalance, expandedPC, yearsDiffPeriod);
          delta = afterBalance - beforeBalance;
        }

        if (!delta) return;

        const derivedOccurrence = createDerivedPeriodicChangeOccurrence({
          account,
          delta,
          date: periodEnd,
          accountIdsSet
        });

        applyOccurrenceToStates({
          occurrence: derivedOccurrence,
          accountStateById,
          periodStatsByAccountId
        });
      }
    });

    (accounts || []).forEach((account) => {
      const accountId = Number(account?.id || 0);
      if (!accountId) return;

      const state = accountStateById.get(accountId);
      const stats = periodStatsByAccountId.get(accountId);
      if (!state || !stats) return;

      const income = roundMoney(stats.income);
      const expenses = roundMoney(stats.expenses);
      const capitalIn = roundMoney(stats.capitalIn);
      const capitalOut = roundMoney(stats.capitalOut);
      const interestIn = roundMoney(stats.interestIn);
      const interestOut = roundMoney(stats.interestOut);
      const interest = roundMoney(interestIn - interestOut);
      const netChange = roundMoney(income - expenses);

      projections.push({
        id: nextProjectionId++,
        scenarioId: scenario.id,
        accountId: account.id,
        account: account.name,
        date: formatDateOnly(periodStart),
        balance: roundMoney(state.balance),
        income,
        expenses,
        netChange,
        interest,
        capitalIn,
        capitalOut,
        interestIn,
        interestOut,
        period: periodIndex + 1
      });
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
    pe.setHours(0, 0, 0, 0);

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
 * Clear projections for a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<void>}
 */
export async function clearProjections(scenarioId) {
  await saveProjectionBundle(scenarioId, { rows: [], generatedAt: null });
}
