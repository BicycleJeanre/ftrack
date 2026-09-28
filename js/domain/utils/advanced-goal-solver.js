// advanced-goal-solver.js

import { calculateMonthsBetweenDates } from '../calculations/goal-calculations.js';
import { formatDateOnly, parseDateOnly } from '../../shared/date-utils.js';

let projectionEngineModulePromise = null;

let lpSolverPromise = null;

function isElectronLike() {
  return typeof window !== 'undefined' && typeof window.require === 'function';
}

function buildSolveFailureResult({ title, err, hints = [] }) {
  const message = err?.message ? String(err.message) : String(err || 'Unknown error');
  const issues = [title, message];
  const explanation = [title, message];

  if (hints.length > 0) {
    explanation.push('');
    explanation.push('What to check next:');
    hints.forEach((h) => explanation.push(`- ${h}`));
  }

  return {
    suggestedTransactions: [],
    explanation,
    warnings: [],
    issues,
    isFeasible: false
  };
}

function getProjectionEngineModule() {
  if (projectionEngineModulePromise) return projectionEngineModulePromise;

  const version = globalThis.__ftrackModuleVersion || Date.now();
  projectionEngineModulePromise = import(`../calculations/projection-engine.js?v=${version}`);
  return projectionEngineModulePromise;
}

async function generateProjectionsForScenarioSafe(scenario, options = {}) {
  const mod = await getProjectionEngineModule();
  const fn = mod?.generateProjectionsForScenario || mod?.default?.generateProjectionsForScenario;
  if (typeof fn !== 'function') {
    throw new Error('Projection engine does not expose generateProjectionsForScenario');
  }
  return fn(scenario, options);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = Array.from(document.getElementsByTagName('script')).find((s) => s.src === src);
    if (existing) {
      if (globalThis.solver) return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', (e) => reject(e));
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
}

async function getLpSolver() {
  if (lpSolverPromise) return lpSolverPromise;

  lpSolverPromise = (async () => {
    // Electron: nodeIntegration true exposes window.require
    if (isElectronLike()) {
      try {
        return window.require('javascript-lp-solver');
      } catch (err) {
        throw new Error(
          'LP solver dependency is not available in Electron. Run `npm install` and restart the app.'
        );
      }
    }

    // Web: use UMD build from CDN which registers window.solver
    if (globalThis.solver && typeof globalThis.solver.Solve === 'function') {
      return globalThis.solver;
    }

    const cdnUrl = 'https://cdn.jsdelivr.net/npm/javascript-lp-solver@0.4.24/prod/solver.js';
    try {
      const timeoutMs = 8000;
      await Promise.race([
        loadScript(cdnUrl),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out loading solver script')), timeoutMs))
      ]);
    } catch (err) {
      throw new Error(
        'LP solver failed to load in the browser. Ensure you have internet access and that the page allows loading scripts from cdn.jsdelivr.net.'
      );
    }

    if (!globalThis.solver || typeof globalThis.solver.Solve !== 'function') {
      throw new Error('LP solver loaded but did not initialize correctly.');
    }
    return globalThis.solver;
  })();

  return lpSolverPromise;
}

function asNumber(val, fallback = 0) {
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

function toDateKey(dateStr) {
  const d = parseDateOnly(dateStr);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function getAccountById(accounts, id) {
  const numId = id != null ? Number(id) : null;
  return (accounts || []).find((a) => Number(a.id) === numId) || null;
}

function getStartingBalance(account) {
  if (!account) return 0;
  if (account.startingBalance !== undefined && account.startingBalance !== null) return asNumber(account.startingBalance, 0);
  return 0;
}

function buildMonthlyRecurrence({ startDate, endDate }) {
  const anchor = startDate ? parseDateOnly(startDate) : new Date();
  return {
    recurrenceType: { id: 4, name: 'Monthly - Day of Month' },
    startDate,
    endDate,
    interval: 1,
    dayOfWeek: null,
    dayOfMonth: anchor.getDate(),
    weekOfMonth: null,
    dayOfWeekInMonth: null,
    dayOfQuarter: null,
    month: null,
    dayOfYear: null,
    customDates: null
  };
}

function startOfMonth(dateStr) {
  const date = parseDateOnly(dateStr);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonthsClamped(dateStr, monthsToAdd, preferredDay = null) {
  const date = parseDateOnly(dateStr);
  const day = preferredDay || date.getDate();
  const monthStart = new Date(date.getFullYear(), date.getMonth() + monthsToAdd, 1);
  const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  return formatDateOnly(new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(day, lastDay)));
}

function monthKey(dateStr) {
  return String(dateStr || '').slice(0, 7);
}

function isNextMonth(previousDate, nextDate) {
  return monthKey(addMonthsClamped(previousDate, 1)) === monthKey(nextDate);
}

function normalizeAllocationStrategy(value) {
  return value === 'cascade' ? 'cascade' : 'parallel';
}

function normalizePayoffOrder(value) {
  if (value === 'snowball' || value === 'avalanche') return value;
  return 'priority';
}

function resolveSolverStrategy(settings) {
  const explicit = String(settings?.strategy || '');
  if (['balanced', 'priority-cascade', 'snowball', 'avalanche'].includes(explicit)) {
    return explicit;
  }
  if (normalizeAllocationStrategy(settings?.allocationStrategy) === 'parallel') return 'balanced';
  if (settings?.payoffOrder === 'snowball') return 'snowball';
  if (settings?.payoffOrder === 'avalanche') return 'avalanche';
  return 'priority-cascade';
}

function getStrategyFields(strategy) {
  if (strategy === 'balanced') return { allocationStrategy: 'parallel', payoffOrder: 'priority' };
  if (strategy === 'snowball') return { allocationStrategy: 'cascade', payoffOrder: 'snowball' };
  if (strategy === 'avalanche') return { allocationStrategy: 'cascade', payoffOrder: 'avalanche' };
  return { allocationStrategy: 'cascade', payoffOrder: 'priority' };
}

function getPeriodicChangeRatePercent(account) {
  const periodicChange = account?.periodicChange;
  const changeModeId = typeof periodicChange?.changeMode === 'object'
    ? periodicChange.changeMode?.id
    : periodicChange?.changeMode;
  if (changeModeId !== 1) return 0;
  return Math.abs(asNumber(periodicChange?.value, 0));
}

function getStoredOccurrenceStatus(occurrence) {
  if (typeof occurrence?.status === 'string') return occurrence.status.toLowerCase();
  if (typeof occurrence?.status?.name === 'string') return occurrence.status.name.toLowerCase();
  return '';
}

function isGoalGeneratedTransaction(transaction) {
  return Array.isArray(transaction?.tags) && transaction.tags.includes('adv-goal-generated');
}

/**
 * Remove the previous Goal Workshop plan rules before calculating a replacement.
 * Retain realized actual occurrences from those rules so a re-solve starts from
 * what really happened, not from the superseded planned schedule.
 */
function buildRebaseScenario(scenario) {
  const generatedIds = new Set(
    (scenario?.transactions || [])
      .filter(isGoalGeneratedTransaction)
      .map((transaction) => Number(transaction?.id || 0))
      .filter(Boolean)
  );

  return {
    ...scenario,
    transactions: (scenario?.transactions || []).filter((transaction) => !isGoalGeneratedTransaction(transaction)),
    transactionOccurrences: (scenario?.transactionOccurrences || []).filter((occurrence) => {
      const sourceId = Number(occurrence?.sourceTransactionId || 0);
      return !generatedIds.has(sourceId) || getStoredOccurrenceStatus(occurrence) === 'actual';
    })
  };
}

function buildGoalTransaction({ requirement, fundingAccountId, amount, startDate, endDate = null, recurring = false, phase = 1 }) {
  const goal = requirement.goal;
  const isPaydown = goal.type === 'pay_down_by_date';
  const action = isPaydown
    ? 'Pay down'
    : goal.type === 'increase_by_delta'
      ? 'Increase'
      : 'Reach';
  const recurrence = recurring ? buildMonthlyRecurrence({ startDate, endDate }) : null;

  return {
    id: 0,
    primaryAccountId: goal.accountId,
    secondaryAccountId: fundingAccountId || null,
    transactionTypeId: 1,
    amount: Math.abs(amount),
    effectiveDate: startDate,
    description: `Advanced Goal: ${action} ${requirement.account.name}`,
    recurrence,
    periodicChange: null,
    tags: [
      'adv-goal-generated',
      `adv-goal-${goal.type}`,
      `adv-goal-id:${goal.id}`,
      `adv-goal-phase:${phase}`
    ]
  };
}

/**
 * Build a month-by-month cascade allocation. Contractual minimums are reserved
 * first, then the selected strategy controls where extra capacity goes:
 * manual priority, smallest remaining balance, or highest interest rate.
 * Capacity left after a goal is funded rolls forward immediately.
 *
 * Exported for deterministic regression tests; callers normally use
 * solveAdvancedGoals().
 */
export function buildCascadeAllocationPlan({ requirements = [], constraints = {}, payoffOrder = 'priority' } = {}) {
  const normalizedPayoffOrder = normalizePayoffOrder(payoffOrder);
  const priorityOrdered = [...requirements].sort((a, b) => {
    const priorityDiff = asNumber(a?.goal?.priority, 999) - asNumber(b?.goal?.priority, 999);
    if (priorityDiff !== 0) return priorityDiff;
    const dateDiff = toDateKey(a.endDate) - toDateKey(b.endDate);
    if (dateDiff !== 0) return dateDiff;
    return String(a?.goal?.id || '').localeCompare(String(b?.goal?.id || ''));
  });

  const configuredCapacity = constraints?.maxOutflowPerMonth != null
    ? Math.max(0, asNumber(constraints.maxOutflowPerMonth, 0))
    : null;
  const derivedCapacity = priorityOrdered.reduce(
    (sum, requirement) => sum + Math.max(
      0,
      asNumber(requirement.requiredMonthly, 0),
      asNumber(requirement.goal?.minimumMonthlyAmount, 0)
    ),
    0
  );
  const monthlyCapacity = configuredCapacity ?? derivedCapacity;
  const capacityWasDerived = configuredCapacity == null;
  const lockedAccountIds = new Set((constraints?.lockedAccountIds || []).map(Number));
  const accountCaps = constraints?.maxMovementByAccountId || {};

  const workByGoalId = new Map();
  for (const requirement of priorityOrdered) {
    const months = Math.max(1, asNumber(requirement.monthsToGoal, 1));
    workByGoalId.set(
      String(requirement.goal.id),
      Math.max(0, asNumber(requirement.totalRequiredMovement, asNumber(requirement.requiredMonthly, 0) * months))
    );
  }

  const allocations = [];
  let minimumCapacityShortfall = 0;
  const addAllocation = ({ requirement, date, amount }) => {
    if (amount <= 0.005) return;
    const goalId = String(requirement.goal.id);
    const existing = allocations.find((allocation) => allocation.goalId === goalId && allocation.date === date);
    if (existing) {
      existing.amount += amount;
      return;
    }
    allocations.push({
      goalId,
      accountId: Number(requirement.goal.accountId),
      date,
      amount,
      requirement
    });
  };

  if (priorityOrdered.length > 0 && monthlyCapacity > 0) {
    const firstMonth = priorityOrdered.reduce(
      (earliest, requirement) => toDateKey(requirement.startDate) < toDateKey(earliest) ? requirement.startDate : earliest,
      priorityOrdered[0].startDate
    );
    const lastMonth = priorityOrdered.reduce(
      (latest, requirement) => toDateKey(requirement.endDate) > toDateKey(latest) ? requirement.endDate : latest,
      priorityOrdered[0].endDate
    );
    let cursor = startOfMonth(firstMonth);
    const finalMonth = startOfMonth(lastMonth);

    while (cursor <= finalMonth) {
      const cursorKey = formatDateOnly(cursor);
      let remainingCapacity = monthlyCapacity;
      const movementByAccountId = new Map();
      const eligible = priorityOrdered.filter((requirement) => {
        const goalId = String(requirement.goal.id);
        const accountId = Number(requirement.goal.accountId);
        return (workByGoalId.get(goalId) || 0) > 0.005 &&
          !lockedAccountIds.has(accountId) &&
          monthKey(cursorKey) >= monthKey(requirement.startDate) &&
          monthKey(cursorKey) <= monthKey(requirement.endDate);
      });

      const allocationDateFor = (requirement) => {
        const preferredDay = parseDateOnly(requirement.startDate).getDate();
        let allocationDate = addMonthsClamped(cursorKey, 0, preferredDay);
        if (monthKey(allocationDate) === monthKey(requirement.startDate) && toDateKey(allocationDate) < toDateKey(requirement.startDate)) {
          allocationDate = requirement.startDate;
        }
        if (monthKey(allocationDate) === monthKey(requirement.endDate) && toDateKey(allocationDate) > toDateKey(requirement.endDate)) {
          allocationDate = requirement.endDate;
        }
        return allocationDate;
      };

      const allocateToRequirement = (requirement, requestedAmount) => {
        if (remainingCapacity <= 0.005 || requestedAmount <= 0.005) return 0;
        const goalId = String(requirement.goal.id);
        const accountId = Number(requirement.goal.accountId);
        const remainingWork = workByGoalId.get(goalId) || 0;
        const rawAccountCap = accountCaps[String(accountId)];
        const accountCap = rawAccountCap == null
          ? Number.POSITIVE_INFINITY
          : Math.max(0, asNumber(rawAccountCap, 0));
        const usedForAccount = movementByAccountId.get(accountId) || 0;
        const availableForAccount = Math.max(0, accountCap - usedForAccount);
        const amount = Math.min(remainingWork, remainingCapacity, availableForAccount, requestedAmount);
        if (amount <= 0.005) return 0;

        addAllocation({ requirement, date: allocationDateFor(requirement), amount });
        workByGoalId.set(goalId, Math.max(0, remainingWork - amount));
        movementByAccountId.set(accountId, usedForAccount + amount);
        remainingCapacity -= amount;
        return amount;
      };

      // Contractual minimums consume capacity first. Only the remainder is
      // available to the selected payoff ordering.
      for (const requirement of eligible) {
        const minimum = Math.max(0, asNumber(requirement.goal?.minimumMonthlyAmount, 0));
        if (minimum <= 0.005) continue;
        const workBefore = workByGoalId.get(String(requirement.goal.id)) || 0;
        const expectedMinimum = Math.min(minimum, workBefore);
        const allocated = allocateToRequirement(requirement, expectedMinimum);
        minimumCapacityShortfall += Math.max(0, expectedMinimum - allocated);
      }

      const extraOrdered = [...eligible].sort((a, b) => {
        if (normalizedPayoffOrder === 'snowball') {
          const debtTypeDiff = Number(b?.goal?.type === 'pay_down_by_date') - Number(a?.goal?.type === 'pay_down_by_date');
          if (debtTypeDiff !== 0) return debtTypeDiff;
          const balanceDiff = (workByGoalId.get(String(a.goal.id)) || 0) - (workByGoalId.get(String(b.goal.id)) || 0);
          if (Math.abs(balanceDiff) > 0.005) return balanceDiff;
        } else if (normalizedPayoffOrder === 'avalanche') {
          const debtTypeDiff = Number(b?.goal?.type === 'pay_down_by_date') - Number(a?.goal?.type === 'pay_down_by_date');
          if (debtTypeDiff !== 0) return debtTypeDiff;
          const rateDiff = asNumber(b.accountRatePercent, 0) - asNumber(a.accountRatePercent, 0);
          if (Math.abs(rateDiff) > 1e-9) return rateDiff;
        }
        const priorityDiff = asNumber(a?.goal?.priority, 999) - asNumber(b?.goal?.priority, 999);
        if (priorityDiff !== 0) return priorityDiff;
        const dateDiff = toDateKey(a.endDate) - toDateKey(b.endDate);
        if (dateDiff !== 0) return dateDiff;
        return String(a?.goal?.id || '').localeCompare(String(b?.goal?.id || ''));
      });

      for (const requirement of extraOrdered) {
        if (remainingCapacity <= 0.005) break;
        allocateToRequirement(requirement, remainingCapacity);
      }

      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }

  const unfulfilled = priorityOrdered
    .map((requirement) => ({
      goalId: String(requirement.goal.id),
      accountId: Number(requirement.goal.accountId),
      accountName: requirement.account?.name || `Account ${requirement.goal.accountId}`,
      shortfall: Math.max(0, workByGoalId.get(String(requirement.goal.id)) || 0)
    }))
    .filter((item) => item.shortfall > 0.005);

  return {
    allocations,
    unfulfilled,
    monthlyCapacity,
    capacityWasDerived,
    payoffOrder: normalizedPayoffOrder,
    minimumMonthlyTotal: priorityOrdered.reduce(
      (sum, requirement) => sum + Math.max(0, asNumber(requirement.goal?.minimumMonthlyAmount, 0)),
      0
    ),
    minimumCapacityShortfall
  };
}

function buildCascadeSuggestedTransactions({ requirements, constraints, payoffOrder = 'priority' }) {
  const plan = buildCascadeAllocationPlan({ requirements, constraints, payoffOrder });
  const fundingAccountId = constraints?.fundingAccountId != null
    ? Number(constraints.fundingAccountId)
    : null;
  const transactions = [];

  for (const requirement of requirements) {
    const goalAllocations = plan.allocations
      .filter((allocation) => allocation.goalId === String(requirement.goal.id))
      .sort((a, b) => toDateKey(a.date) - toDateKey(b.date));
    if (goalAllocations.length === 0) continue;

    const phases = [];
    for (const allocation of goalAllocations) {
      const current = phases[phases.length - 1];
      if (
        current &&
        Math.abs(current.amount - allocation.amount) <= 0.005 &&
        isNextMonth(current.endDate, allocation.date)
      ) {
        current.endDate = allocation.date;
        current.count += 1;
      } else {
        phases.push({
          startDate: allocation.date,
          endDate: allocation.date,
          amount: allocation.amount,
          count: 1
        });
      }
    }

    phases.forEach((phase, index) => {
      transactions.push(buildGoalTransaction({
        requirement,
        fundingAccountId,
        amount: phase.amount,
        startDate: phase.startDate,
        endDate: phase.endDate,
        recurring: phase.count > 1,
        phase: index + 1
      }));
    });
  }

  return { transactions, ...plan };
}

// Calculate one-off adjustment to ensure goal is reached
function calculateOneOffAdjustment({ requirement, recurringAmount, monthlyCount }) {
  if (!requirement || !requirement.goal) return 0;

  // Calculate total from recurring transactions
  const recurringTotal = recurringAmount * monthlyCount;
  const requiredTravel = Math.max(
    0,
    asNumber(
      requirement.totalRequiredMovement,
      asNumber(requirement.requiredMonthly, 0) * Math.max(1, asNumber(requirement.monthsToGoal, monthlyCount))
    )
  );
  
  // Calculate shortfall
  const shortfall = Math.max(0, requiredTravel - recurringTotal);
  
  return shortfall > 0.01 ? shortfall : 0; // Only if more than 1 cent shortfall
}

function normalizeGoal(goal) {
  return {
    id: goal?.id || String(Date.now()),
    priority: Math.max(1, asNumber(goal?.priority, 1)),
    accountId: goal?.accountId != null ? Number(goal.accountId) : null,
    type: goal?.type || 'reach_balance_by_date',
    targetAmount: goal?.targetAmount != null ? asNumber(goal.targetAmount, null) : null,
    deltaAmount: goal?.deltaAmount != null ? asNumber(goal.deltaAmount, null) : null,
    floorAmount: goal?.floorAmount != null ? asNumber(goal.floorAmount, null) : null,
    minimumMonthlyAmount: goal?.minimumMonthlyAmount != null
      ? Math.max(0, asNumber(goal.minimumMonthlyAmount, 0))
      : null,
    startDate: goal?.startDate || null,
    endDate: goal?.endDate || null
  };
}

function sortGoals(goals) {
  return [...goals].sort((a, b) => {
    const pa = asNumber(a.priority, 999);
    const pb = asNumber(b.priority, 999);
    if (pa !== pb) return pa - pb;
    return String(a.id).localeCompare(String(b.id));
  });
}

function mergeFloorConstraints({ goals, constraints }) {
  const floors = { ...(constraints?.minBalanceFloorsByAccountId || {}) };
  for (const goal of goals) {
    if (goal.type !== 'maintain_floor') continue;
    if (!goal.accountId || goal.floorAmount == null) continue;
    const key = String(goal.accountId);
    const existing = floors[key] != null ? asNumber(floors[key], null) : null;
    floors[key] = existing == null ? goal.floorAmount : Math.max(existing, goal.floorAmount);
  }
  return floors;
}

function getAdvancedGoalSolverWindow(scenario) {
  const projectionConfig = scenario?.projection?.config || {};
  const fallbackStart = projectionConfig.startDate || formatDateOnly(new Date());
  const fallbackEnd = projectionConfig.endDate || fallbackStart;

  const planning = scenario?.planning && typeof scenario.planning === 'object' ? scenario.planning : {};
  const raw = planning?.advancedGoalSolver && typeof planning.advancedGoalSolver === 'object' ? planning.advancedGoalSolver : {};

  const startDate = raw.startDate || fallbackStart;
  const endDate = raw.endDate || fallbackEnd;

  return startDate <= endDate ? { startDate, endDate } : { startDate: endDate, endDate: startDate };
}

function getSolverProjectionOptions(scenario) {
  const window = getAdvancedGoalSolverWindow(scenario);
  const projectionConfig = scenario?.projection?.config || {};
  const asOfDate =
    projectionConfig.asOfDate >= window.startDate &&
    projectionConfig.asOfDate <= window.endDate
      ? projectionConfig.asOfDate
      : null;
  const openCommitmentStartDate =
    projectionConfig.openCommitmentStartDate &&
    projectionConfig.openCommitmentStartDate <= window.startDate
      ? projectionConfig.openCommitmentStartDate
      : null;
  return {
    startDate: window.startDate,
    endDate: window.endDate,
    periodTypeId: 3, // Month (solver constraints are monthly)
    source: 'transactions',
    ...(asOfDate ? { asOfDate } : {}),
    ...(openCommitmentStartDate ? { openCommitmentStartDate } : {})
  };
}

export function buildGoalRequirements({ scenario, goals, baselineProjectionsByAccountId = new Map() }) {
  const accounts = scenario?.accounts || [];
  const solverWindow = getAdvancedGoalSolverWindow(scenario);
  const scenarioStart = solverWindow.startDate;
  const scenarioEnd = solverWindow.endDate;
  const scenarioStartKey = toDateKey(scenarioStart);
  const scenarioEndKey = toDateKey(scenarioEnd);

  const requirements = [];
  const issues = [];

  for (const goal of goals) {
    if (goal.type === 'maintain_floor') continue;
    if (!goal.accountId) {
      issues.push('A goal is missing an account selection.');
      continue;
    }
    const account = getAccountById(accounts, goal.accountId);
    if (!account) {
      issues.push(`Goal account not found: accountId=${goal.accountId}`);
      continue;
    }

    const startDate = goal.startDate || scenarioStart;
    const endDate = goal.endDate || scenarioEnd;

    // Goals must be solvable within the scenario projection window.
    // If goal dates fall outside the scenario range, projections cannot validate the goal correctly.
    if (toDateKey(startDate) < scenarioStartKey) {
      issues.push(
        `Goal start date (${startDate}) is before the scenario start date (${scenarioStart}) for account: ${account.name}`
      );
      continue;
    }
    if (toDateKey(endDate) > scenarioEndKey) {
      issues.push(
        `Goal end date (${endDate}) is after the scenario end date (${scenarioEnd}) for account: ${account.name}`
      );
      continue;
    }

    const monthsToGoal = calculateMonthsBetweenDates(startDate, endDate);
    if (!monthsToGoal || monthsToGoal <= 0) {
      issues.push(`Goal end date must be after start date for account: ${account.name}`);
      continue;
    }

    const accountStartingBalance = getStartingBalance(account);
    const baselineRecords = baselineProjectionsByAccountId.get(Number(goal.accountId)) || [];
    const baselineStartBalance = getBalanceBefore(
      baselineRecords,
      startDate,
      accountStartingBalance
    );
    const baselineEndBalance = getBalanceAtOrBefore(
      baselineRecords,
      endDate,
      accountStartingBalance
    );

    let totalRequiredMovement = 0;

    if (goal.type === 'reach_balance_by_date') {
      if (goal.targetAmount == null) {
        issues.push(`Reach-balance goal missing target amount for account: ${account.name}`);
        continue;
      }
      totalRequiredMovement = Math.max(0, goal.targetAmount - baselineEndBalance);
    } else if (goal.type === 'increase_by_delta') {
      if (goal.deltaAmount == null) {
        issues.push(`Increase-by-delta goal missing delta amount for account: ${account.name}`);
        continue;
      }
      const target = baselineStartBalance + goal.deltaAmount;
      totalRequiredMovement = Math.max(0, target - baselineEndBalance);
    } else if (goal.type === 'pay_down_by_date') {
      const target = goal.targetAmount != null ? goal.targetAmount : 0;
      // Accounts are often modeled with negative balances for liabilities.
      // "Pay down" means move the balance toward the target from whichever side it's on.
      totalRequiredMovement = baselineStartBalance < target
        ? Math.max(0, target - baselineEndBalance)
        : Math.max(0, baselineEndBalance - target);
    } else if (goal.type === 'minimize_payment') {
      if (goal.targetAmount == null) {
        issues.push(`Minimize-payment goal missing target amount for account: ${account.name}`);
        continue;
      }
      // Force endDate to scenario end; ignore user input
      const forcedEndDate = scenarioEnd;
      const forcedMonthsToGoal = calculateMonthsBetweenDates(startDate, forcedEndDate);
      if (!forcedMonthsToGoal || forcedMonthsToGoal <= 0) {
        issues.push(`Goal cannot be solved: scenario must extend past start date for account: ${account.name}`);
        continue;
      }
      const forcedBaselineEndBalance = getBalanceAtOrBefore(
        baselineRecords,
        forcedEndDate,
        accountStartingBalance
      );
      totalRequiredMovement = Math.max(0, goal.targetAmount - forcedBaselineEndBalance);
      const requiredMonthly = totalRequiredMovement / forcedMonthsToGoal;
      // Update monthsToGoal and endDate for this requirement
      const req = {
        goal,
        account,
        startDate,
        endDate: forcedEndDate,
        monthsToGoal: forcedMonthsToGoal,
        requiredMonthly,
        totalRequiredMovement,
        startingBalance: baselineStartBalance,
        baselineStartBalance,
        baselineEndBalance: forcedBaselineEndBalance,
        accountRatePercent: getPeriodicChangeRatePercent(account)
      };
      requirements.push(req);
      continue;  // Skip the default push below
    } else {
      issues.push(`Unknown goal type: ${goal.type}`);
      continue;
    }

    let requiredMonthly = totalRequiredMovement / monthsToGoal;
    if (!Number.isFinite(requiredMonthly)) {
      issues.push(`Failed to compute a required monthly amount for: ${account.name}`);
      continue;
    }
    requiredMonthly = Math.max(0, requiredMonthly);

    requirements.push({
      goal,
      account,
      startDate,
      endDate,
      monthsToGoal,
      requiredMonthly,
      totalRequiredMovement,
      startingBalance: baselineStartBalance,
      baselineStartBalance,
      baselineEndBalance,
      accountRatePercent: getPeriodicChangeRatePercent(account)
    });
  }

  return { requirements, issues };
}

function solveWithLp({ lp, requirements, constraints, lockedAccountIds, effectiveMaxOutflowPerMonth }) {

  const model = {
    optimize: 'cost',
    opType: 'min',
    constraints: {},
    variables: {}
  };

  if (effectiveMaxOutflowPerMonth != null) {
    model.constraints.totalOutflow = { max: Math.max(0, asNumber(effectiveMaxOutflowPerMonth, 0)) };
  }

  const maxMovementByAccountId = constraints?.maxMovementByAccountId || {};

  for (const req of requirements) {
    const varName = `g_${String(req.goal.id).replaceAll('-', '_')}`;
    const goalAccountId = req.goal.accountId;

    const perAccountCap = maxMovementByAccountId[String(goalAccountId)];
    const cap = perAccountCap != null ? Math.max(0, asNumber(perAccountCap, 0)) : null;

    const isLocked = lockedAccountIds.has(Number(goalAccountId));

    // Min requirement constraint
    const minKey = `${varName}_min`;
    const contractualMinimum = asNumber(req.totalRequiredMovement, 0) > 0.005
      ? asNumber(req.goal?.minimumMonthlyAmount, 0)
      : 0;
    model.constraints[minKey] = {
      min: Math.max(0, asNumber(req.requiredMonthly, 0), contractualMinimum)
    };

    // Optional max constraint
    const maxKey = `${varName}_max`;
    model.constraints[maxKey] = { max: isLocked ? 0 : cap != null ? cap : 1e15 };

    model.variables[varName] = {
      cost: 1,
      [minKey]: 1,
      [maxKey]: 1
    };
    if (model.constraints.totalOutflow) {
      model.variables[varName].totalOutflow = 1;
    }
  }

  // Build account-level constraints for movement caps (enforces total per account, not per goal)
  const accountsByAccountId = {};
  for (const req of requirements) {
    const accountId = String(req.goal.accountId);
    if (!accountsByAccountId[accountId]) {
      accountsByAccountId[accountId] = [];
    }
    accountsByAccountId[accountId].push(req);
  }

  for (const [accountId, reqs] of Object.entries(accountsByAccountId)) {
    const perAccountCap = maxMovementByAccountId[accountId];
    if (perAccountCap == null) continue;
    
    // Create account-level constraint
    const accountCapKey = `acct_cap_${accountId}`;
    model.constraints[accountCapKey] = { max: Math.max(0, asNumber(perAccountCap, 0)) };
    
    // Add variables to this constraint (sum of all goals on this account)
    for (const req of reqs) {
      const varName = `g_${String(req.goal.id).replaceAll('-', '_')}`;
      if (!model.variables[varName]) continue;
      model.variables[varName][accountCapKey] = 1;
    }
  }

  const result = lp.Solve(model);
  return { result, variables: Object.keys(model.variables) };
}

function buildSuggestedTransactions({ scenario, requirements, amountsByGoalId, constraints }) {
  const suggested = [];
  const accounts = scenario?.accounts || [];
  const fundingAccountId = constraints?.fundingAccountId != null ? Number(constraints.fundingAccountId) : null;

  for (const req of requirements) {
    const amt = asNumber(amountsByGoalId[req.goal.id], 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;

    const startDate = req.startDate;
    const endDate = req.endDate;
    const recurrence = buildMonthlyRecurrence({ startDate, endDate });
    
    // Calculate number of months of recurrence
    const monthlyCount = calculateMonthsBetweenDates(startDate, endDate);

    if (req.goal.type === 'pay_down_by_date') {
      // Model paydown as a transfer from the funding account to the goal account.
      // This reduces the funding account and moves the goal account toward the target.
      if (!fundingAccountId) continue;

      suggested.push({
        id: 0,
        primaryAccountId: req.goal.accountId,
        secondaryAccountId: fundingAccountId,
        transactionTypeId: 1,
        amount: Math.abs(amt),
        effectiveDate: startDate,
        description: `Advanced Goal: Pay down ${req.account.name}`,
        recurrence,
        periodicChange: null,
        tags: ['adv-goal-generated', `adv-goal-${req.goal.type}`, `adv-goal-id:${req.goal.id}`]
      });

      // Add one-off adjustment if needed for paydown
      const paydownAdjustment = calculateOneOffAdjustment({ 
        requirement: req, 
        recurringAmount: amt, 
        monthlyCount 
      });
      if (paydownAdjustment > 0.01) {
        suggested.push({
          id: 0,
          primaryAccountId: req.goal.accountId,
          secondaryAccountId: fundingAccountId,
          transactionTypeId: 1,
          amount: paydownAdjustment,
          effectiveDate: endDate,
          description: `Advanced Goal: Pay down adjustment ${req.account.name}`,
          recurrence: null,
          periodicChange: null,
          tags: ['adv-goal-generated', `adv-goal-${req.goal.type}`, `adv-goal-id:${req.goal.id}`, 'adjustment']
        });
      }

      continue;
    }

    // Reach/increase: transfer from funding to goal account.
    suggested.push({
      id: 0,
      primaryAccountId: req.goal.accountId,
      secondaryAccountId: fundingAccountId || null,
      transactionTypeId: 1,
      amount: Math.abs(amt),
      effectiveDate: startDate,
      description:
        req.goal.type === 'increase_by_delta'
          ? `Advanced Goal: Increase ${req.account.name}`
          : `Advanced Goal: Reach ${req.account.name}`,
      recurrence,
      periodicChange: null,
      tags: ['adv-goal-generated', `adv-goal-${req.goal.type}`, `adv-goal-id:${req.goal.id}`]
    });

    // Add one-off adjustment if needed for reach/increase
    const reachAdjustment = calculateOneOffAdjustment({ 
      requirement: req, 
      recurringAmount: amt, 
      monthlyCount 
    });
    if (reachAdjustment > 0.01) {
      suggested.push({
        id: 0,
        primaryAccountId: req.goal.accountId,
        secondaryAccountId: fundingAccountId || null,
        transactionTypeId: 1,
        amount: reachAdjustment,
        effectiveDate: endDate,
        description:
          req.goal.type === 'increase_by_delta'
            ? `Advanced Goal: Increase adjustment ${req.account.name}`
            : `Advanced Goal: Reach adjustment ${req.account.name}`,
        recurrence: null,
        periodicChange: null,
        tags: ['adv-goal-generated', `adv-goal-${req.goal.type}`, `adv-goal-id:${req.goal.id}`, 'adjustment']
      });
    }
  }

  return suggested;
}

function indexProjectionsByAccountId(projections) {
  const map = new Map();
  for (const p of projections || []) {
    const key = Number(p.accountId);
    const list = map.get(key) || [];
    list.push(p);
    map.set(key, list);
  }
  for (const [k, list] of map.entries()) {
    list.sort((a, b) => toDateKey(a.date) - toDateKey(b.date));
    map.set(k, list);
  }
  return map;
}

function getBalanceAtOrBefore(records, dateStr, startingBalanceFallback = 0) {
  const targetKey = toDateKey(dateStr);
  let last = null;
  for (const r of records || []) {
    if (toDateKey(r.date) <= targetKey) last = r;
    else break;
  }
  return last ? asNumber(last.balance, startingBalanceFallback) : startingBalanceFallback;
}

function getBalanceBefore(records, dateStr, startingBalanceFallback = 0) {
  const targetKey = toDateKey(dateStr);
  let last = null;
  for (const record of records || []) {
    if (toDateKey(record.date) < targetKey) last = record;
    else break;
  }
  return last ? asNumber(last.balance, startingBalanceFallback) : startingBalanceFallback;
}

function evaluateGoals({ scenario, goals, requirements, projectionsByAccountId, floorsByAccountId }) {
  const accounts = scenario?.accounts || [];
  const solverWindow = getAdvancedGoalSolverWindow(scenario);
  const scenarioStart = solverWindow.startDate;
  const scenarioEnd = solverWindow.endDate;

  const failures = [];

  for (const goal of goals) {
    const account = getAccountById(accounts, goal.accountId);
    const startingBalance = getStartingBalance(account);
    const records = projectionsByAccountId.get(Number(goal.accountId)) || [];
    const startDate = goal.startDate || scenarioStart;
    const endDate = goal.endDate || scenarioEnd;
    const startBal = getBalanceAtOrBefore(records, startDate, startingBalance);
    const endBal = getBalanceAtOrBefore(records, endDate, startingBalance);

    if (goal.type === 'reach_balance_by_date') {
      if (goal.targetAmount == null) continue;
      if (endBal + 1e-6 < goal.targetAmount) {
        failures.push({ goalId: goal.id, type: goal.type, shortfall: goal.targetAmount - endBal });
      }
    } else if (goal.type === 'pay_down_by_date') {
      const target = goal.targetAmount != null ? goal.targetAmount : 0;
      // "Pay down" means move the balance toward the target.
      // If balance starts below target (common for negative liabilities), success means end balance >= target.
      // If balance starts above target, success means end balance <= target.
      if (startBal < target) {
        if (endBal + 1e-6 < target) {
          failures.push({ goalId: goal.id, type: goal.type, shortfall: target - endBal });
        }
      } else {
        if (endBal - 1e-6 > target) {
          failures.push({ goalId: goal.id, type: goal.type, shortfall: endBal - target });
        }
      }
    } else if (goal.type === 'increase_by_delta') {
      if (goal.deltaAmount == null) continue;
      const delta = endBal - startBal;
      if (delta + 1e-6 < goal.deltaAmount) {
        failures.push({ goalId: goal.id, type: goal.type, shortfall: goal.deltaAmount - delta });
      }
    } else if (goal.type === 'maintain_floor') {
      const floor = goal.floorAmount != null ? goal.floorAmount : null;
      if (floor == null) continue;
      const minBal = Math.min(startingBalance, ...records.map((r) => asNumber(r.balance, startingBalance)));
      if (minBal + 1e-6 < floor) {
        failures.push({ goalId: goal.id, type: goal.type, shortfall: floor - minBal });
      }
    } else if (goal.type === 'minimize_payment') {
      if (goal.targetAmount == null) continue;
      if (endBal + 1e-6 < goal.targetAmount) {
        failures.push({ goalId: goal.id, type: goal.type, shortfall: goal.targetAmount - endBal });
      }
    }
  }

  // Also validate explicit floors
  for (const [accountIdStr, floorVal] of Object.entries(floorsByAccountId || {})) {
    const accountId = Number(accountIdStr);
    const floor = asNumber(floorVal, null);
    if (floor == null) continue;

    const account = getAccountById(accounts, accountId);
    const startingBalance = getStartingBalance(account);
    const records = projectionsByAccountId.get(accountId) || [];
    const minBal = Math.min(startingBalance, ...records.map((r) => asNumber(r.balance, startingBalance)));
    if (minBal + 1e-6 < floor) {
      failures.push({ goalId: `floor:${accountId}`, type: 'floor', shortfall: floor - minBal });
    }
  }

  return { failures, ok: failures.length === 0 };
}

function scaleAmounts(amountsByGoalId, scale) {
  const next = {};
  for (const [k, v] of Object.entries(amountsByGoalId || {})) {
    next[k] = asNumber(v, 0) * scale;
  }
  return next;
}

async function findFloorSafeScale({
  scenario,
  requirements,
  amountsByGoalId,
  constraints,
  floorsByAccountId,
  projectionOptions = null,
  allocationStrategy = 'parallel',
  payoffOrder = 'priority'
}) {
  let lo = 0;
  let hi = 1;
  let best = 0;

  const options = projectionOptions || getSolverProjectionOptions(scenario);

  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    const scaled = scaleAmounts(amountsByGoalId, mid);
    const txs = allocationStrategy === 'cascade'
      ? buildCascadeSuggestedTransactions({ requirements: requirements.map((requirement) => ({
          ...requirement,
          requiredMonthly: asNumber(requirement.requiredMonthly, 0) * mid,
          totalRequiredMovement: asNumber(
            requirement.totalRequiredMovement,
            asNumber(requirement.requiredMonthly, 0) * Math.max(1, asNumber(requirement.monthsToGoal, 1))
          ) * mid
        })), constraints, payoffOrder }).transactions
      : buildSuggestedTransactions({ scenario, requirements, amountsByGoalId: scaled, constraints });
    const scenarioForCheck = { ...scenario, transactions: [...(scenario.transactions || []), ...txs] };
    const projections = await generateProjectionsForScenarioSafe(scenarioForCheck, options);
    const idx = indexProjectionsByAccountId(projections);
    const { ok } = evaluateGoals({ scenario: scenarioForCheck, goals: [], requirements, projectionsByAccountId: idx, floorsByAccountId });
    if (ok) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return best;
}

export async function solveAdvancedGoals({ scenario, settings }) {
  try {
    const strategy = resolveSolverStrategy(settings);
    const { allocationStrategy, payoffOrder } = getStrategyFields(strategy);
    const lp = allocationStrategy === 'parallel' ? await getLpSolver() : null;
    const projectionOptions = getSolverProjectionOptions(scenario);
    const rebaseScenario = buildRebaseScenario(scenario);

    const goals = sortGoals((settings?.goals || []).map(normalizeGoal));
    const constraints = settings?.constraints || {};

    const lockedAccountIds = new Set((constraints.lockedAccountIds || []).map((id) => Number(id)));
    const fundingAccountId = constraints.fundingAccountId != null ? Number(constraints.fundingAccountId) : null;

    const warnings = [];
    const issues = [];

    if (!fundingAccountId) {
      issues.push('Funding account is required to solve. Select a funding account under Constraints.');
    }

    let floorsByAccountId = mergeFloorConstraints({ goals, constraints });

    let effectiveMaxOutflowPerMonth = constraints.maxOutflowPerMonth != null ? asNumber(constraints.maxOutflowPerMonth, null) : null;

    const baselineProjections = await generateProjectionsForScenarioSafe(rebaseScenario, projectionOptions);
    const baselineProjectionsByAccountId = indexProjectionsByAccountId(baselineProjections);
    const { requirements, issues: requirementIssues } = buildGoalRequirements({
      scenario: rebaseScenario,
      goals,
      baselineProjectionsByAccountId
    });
    issues.push(...requirementIssues);

    if (issues.length > 0) {
      return {
        suggestedTransactions: [],
        explanation: ['Issues:', ...issues.map((i) => `- ${i}`)],
        warnings,
        issues,
        isFeasible: false,
        strategy,
        allocationStrategy,
        payoffOrder
      };
    }

    const priorities = Array.from(new Set(requirements.map((r) => r.goal.priority))).sort((a, b) => a - b);
    let selectedRequirements = requirements.map((requirement) => ({ ...requirement }));
    let bestSolution = null;
    let bestIncludedPriority = null;

    const amountsByGoalId = {};
    if (allocationStrategy === 'parallel') {
      // Try to satisfy goals in priority order, stopping at first infeasible tier.
      for (const p of priorities) {
        const tierReqs = requirements.filter((r) => r.goal.priority <= p);
        const { result, variables } = solveWithLp({
          lp,
          requirements: tierReqs,
          constraints,
          lockedAccountIds,
          effectiveMaxOutflowPerMonth
        });

        if (!result || result.feasible === false) break;

        bestSolution = { result, variables, tierReqs };
        bestIncludedPriority = p;
      }

      if (!bestSolution) {
        return {
          suggestedTransactions: [],
          explanation: [
            'Issues:',
            '- No feasible solution found for Priority 1 goals with the given constraints.',
            '',
            'What to check next:',
            '- Increase Max Outflow Per Month (or remove it)',
            '- Unlock accounts that need to move',
            '- Extend goal dates to reduce required monthly movement'
          ],
          warnings,
          issues: ['No feasible solution found for Priority 1 goals with the given constraints.'],
          isFeasible: false,
          isComplete: false,
          strategy,
          allocationStrategy,
          payoffOrder
        };
      }

      selectedRequirements = bestSolution.tierReqs.map((requirement) => ({ ...requirement }));
      for (const req of selectedRequirements) {
        const varName = `g_${String(req.goal.id).replaceAll('-', '_')}`;
        const val = asNumber(bestSolution.result[varName], 0);
        amountsByGoalId[req.goal.id] = Math.max(0, val);
      }
    } else {
      bestIncludedPriority = priorities.length > 0 ? Math.max(...priorities) : null;
      selectedRequirements.forEach((requirement) => {
        amountsByGoalId[requirement.goal.id] = Math.max(0, asNumber(requirement.requiredMonthly, 0));
      });
    }

    // Projection-based validation and refinement loop.
    let refinedAmounts = { ...amountsByGoalId };
    let validationFailures = [];
    let cascadePlan = null;

    for (let iter = 0; iter < 5; iter++) {
      cascadePlan = allocationStrategy === 'cascade'
        ? buildCascadeSuggestedTransactions({ requirements: selectedRequirements, constraints, payoffOrder })
        : null;
      const txs = cascadePlan
        ? cascadePlan.transactions
        : buildSuggestedTransactions({ scenario: rebaseScenario, requirements: selectedRequirements, amountsByGoalId: refinedAmounts, constraints });
      const scenarioForCheck = {
        ...rebaseScenario,
        transactions: [...(rebaseScenario.transactions || []), ...txs]
      };
      const projections = await generateProjectionsForScenarioSafe(scenarioForCheck, projectionOptions);
      const idx = indexProjectionsByAccountId(projections);

      const evalRes = evaluateGoals({
        scenario: scenarioForCheck,
        goals,
        requirements: selectedRequirements,
        projectionsByAccountId: idx,
        floorsByAccountId
      });

      validationFailures = evalRes.failures;
      if (evalRes.ok) break;

      // If floors are violated, attempt to scale down until floors pass.
      const floorFailures = validationFailures.filter((f) => f.type === 'floor' || f.type === 'maintain_floor');
      if (floorFailures.length > 0) {
        const scale = await findFloorSafeScale({
          scenario: rebaseScenario,
          requirements: selectedRequirements,
          amountsByGoalId: refinedAmounts,
          constraints,
          floorsByAccountId,
          projectionOptions,
          allocationStrategy,
          payoffOrder
        });
        if (allocationStrategy === 'cascade') {
          selectedRequirements = selectedRequirements.map((requirement) => ({
            ...requirement,
            requiredMonthly: asNumber(requirement.requiredMonthly, 0) * scale,
            totalRequiredMovement: asNumber(
              requirement.totalRequiredMovement,
              asNumber(requirement.requiredMonthly, 0) * Math.max(1, asNumber(requirement.monthsToGoal, 1))
            ) * scale
          }));
        } else {
          refinedAmounts = scaleAmounts(refinedAmounts, scale);
        }
        warnings.push('Min-balance floors required scaling down suggested contributions.');
        continue;
      }

      // Increase requirements for failed goals based on shortfall.
      const updatedReqs = selectedRequirements.map((r) => ({ ...r }));
      const byId = new Map(updatedReqs.map((r) => [r.goal.id, r]));
      for (const failure of validationFailures) {
        const req = byId.get(failure.goalId);
        if (!req) continue;
        const bump = Math.max(0, asNumber(failure.shortfall, 0)) / Math.max(1, req.monthsToGoal);
        req.requiredMonthly = Math.max(req.requiredMonthly, asNumber(refinedAmounts[req.goal.id], 0) + bump);
        req.totalRequiredMovement = req.requiredMonthly * Math.max(1, asNumber(req.monthsToGoal, 1));
      }

      if (allocationStrategy === 'cascade') {
        selectedRequirements = updatedReqs;
      } else {
        const { result } = solveWithLp({
          lp,
          requirements: updatedReqs,
          constraints,
          lockedAccountIds,
          effectiveMaxOutflowPerMonth
        });
        if (!result || result.feasible === false) {
          warnings.push('Solver became infeasible after projection-based refinement.');
          break;
        }

        for (const req of updatedReqs) {
          const varName = `g_${String(req.goal.id).replaceAll('-', '_')}`;
          refinedAmounts[req.goal.id] = Math.max(0, asNumber(result[varName], 0));
        }
      }
    }

    cascadePlan = allocationStrategy === 'cascade'
      ? buildCascadeSuggestedTransactions({ requirements: selectedRequirements, constraints, payoffOrder })
      : null;
    const suggestedTransactions = cascadePlan
      ? cascadePlan.transactions
      : buildSuggestedTransactions({
          scenario: rebaseScenario,
          requirements: selectedRequirements,
          amountsByGoalId: refinedAmounts,
          constraints
        });

    if (cascadePlan?.unfulfilled?.length) {
      for (const item of cascadePlan.unfulfilled) {
        if (!validationFailures.some((failure) => String(failure.goalId) === item.goalId)) {
          validationFailures.push({
            goalId: item.goalId,
            type: 'capacity',
            shortfall: item.shortfall
          });
        }
      }
    }

    const explanation = [];
    const strategyLabel = strategy === 'avalanche'
      ? 'Debt Avalanche — highest interest first'
      : strategy === 'snowball'
        ? 'Debt Snowball — smallest remaining balance first'
        : strategy === 'priority-cascade'
          ? 'Priority Cascade — manual goal priority'
          : 'Balanced Monthly — steady allocations across goals';
    explanation.push(`Allocation strategy: ${strategyLabel}`);
    explanation.push('Requirements were recalculated from the current plan and retained actual results; previous Goal Workshop rules were excluded.');
    explanation.push(`Solved priorities up to: ${bestIncludedPriority}`);
    const displayedCapacity = cascadePlan?.monthlyCapacity ?? effectiveMaxOutflowPerMonth;
    if (displayedCapacity != null) {
      explanation.push(`Effective max outflow per month: ${displayedCapacity}${cascadePlan?.capacityWasDerived ? ' (derived from goal requirements)' : ''}`);
    }
    if (cascadePlan?.minimumMonthlyTotal > 0) {
      explanation.push(`Contractual minimums reserved first each month: ${cascadePlan.minimumMonthlyTotal.toFixed(2)}`);
    }
    if (cascadePlan?.minimumCapacityShortfall > 0.005) {
      warnings.push('Monthly capacity or account caps are too low to fund every contractual minimum.');
    }
    if (Object.keys(constraints.maxMovementByAccountId || {}).length > 0) explanation.push('Applied per-account movement caps.');
    if (Object.keys(floorsByAccountId || {}).length > 0) explanation.push('Validated min-balance floors against projections.');
    if (validationFailures.length > 0) {
      if (effectiveMaxOutflowPerMonth != null) {
        explanation.push('One or more goals could not be fully met under the current max outflow cap once projections (including interest and existing scenario transactions) were applied.');
      }
      explanation.push('Validation issues:');
      validationFailures.slice(0, 10).forEach((f) => explanation.push(`- ${f.type} shortfall: ${asNumber(f.shortfall, 0).toFixed(2)}`));
      explanation.push('');
      explanation.push('What to check next:');
      explanation.push('- Reduce constraints, extend dates, or increase max outflow');
    } else {
      explanation.push('All configured goals and constraints validated against projections.');
    }
    explanation.push('Applying this solution replaces earlier Goal Workshop-generated plan rules; manually created rules are left unchanged.');

    const allGoalsIncluded = selectedRequirements.length === requirements.length;
    const isComplete = allGoalsIncluded && validationFailures.length === 0;
    const requirementsByGoalId = new Map(
      selectedRequirements.map((requirement) => [String(requirement.goal.id), requirement])
    );
    const solverWindow = getAdvancedGoalSolverWindow(scenario);
    const goalResults = goals.map((goal) => {
      const requirement = requirementsByGoalId.get(String(goal.id));
      const account = getAccountById(scenario?.accounts || [], goal.accountId);
      const goalTransactions = suggestedTransactions.filter((transaction) =>
        transaction.tags?.includes(`adv-goal-id:${goal.id}`)
      );
      const failure = validationFailures.find((item) => String(item.goalId) === String(goal.id));
      return {
        goalId: goal.id,
        priority: goal.priority,
        accountId: goal.accountId,
        accountName: account?.name || `Account ${goal.accountId}`,
        type: goal.type,
        startDate: requirement?.startDate || goal.startDate || solverWindow.startDate,
        endDate: requirement?.endDate || goal.endDate || solverWindow.endDate,
        baselineStartBalance: requirement?.baselineStartBalance ?? null,
        baselineEndBalance: requirement?.baselineEndBalance ?? null,
        minimumMonthlyAmount: goal.minimumMonthlyAmount ?? null,
        ruleCount: goalTransactions.length,
        status: failure ? 'needs-attention' : 'ready',
        shortfall: failure ? asNumber(failure.shortfall, 0) : 0
      };
    });

    return {
      suggestedTransactions,
      explanation,
      warnings,
      issues: [],
      isFeasible: isComplete,
      isComplete,
      strategy,
      allocationStrategy,
      payoffOrder,
      rebasedFromActuals: true,
      effectiveMonthlyCapacity: displayedCapacity,
      capacityWasDerived: Boolean(cascadePlan?.capacityWasDerived),
      minimumMonthlyTotal: cascadePlan?.minimumMonthlyTotal || 0,
      goalResults,
      validationFailures
    };
  } catch (err) {
    const hints = [];
    if (!isElectronLike()) {
      hints.push('If running on localhost/offline, the LP solver must be loaded from the internet.');
      hints.push('Alternatively run the Electron app via `npm run dev` so the solver can be loaded from node_modules.');
    } else {
      hints.push('If this persists in Electron, run `npm install` and restart `npm run dev`.');
    }
    hints.push('Open DevTools Console for the original stack trace.');

    // Special-case the most common integration failures.
    const msg = String(err?.message || '');
    if (msg.toLowerCase().includes('projection engine')) {
      hints.unshift('Hard reload the Forecast page to refresh cached modules.');
    }
    if (msg.toLowerCase().includes('lp solver')) {
      hints.unshift('Solver library could not be initialized.');
    }

    return buildSolveFailureResult({
      title: 'Solve failed in Advanced Goal Solver',
      err,
      hints
    });
  }
}
