// advanced-goal-solver.js

import { calculateContributionAmount, calculateMonthsBetweenDates } from './goal-calculation-utils.js';
import { formatDateOnly, parseDateOnly } from './date-utils.js';

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
  projectionEngineModulePromise = import(`./projection-engine.js?v=${version}`);
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
  if (account.balance !== undefined && account.balance !== null) return asNumber(account.balance, 0);
  return 0;
}

function buildMonthlyRecurrence({ startDate, endDate }) {
  return {
    recurrenceType: { id: 4, name: 'Monthly - Day of Month' },
    startDate,
    endDate,
    interval: 1,
    dayOfWeek: null,
    dayOfMonth: new Date().getDate(),
    weekOfMonth: null,
    dayOfWeekInMonth: null,
    dayOfQuarter: null,
    month: null,
    dayOfYear: null,
    customDates: null
  };
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

function buildGoalRequirements({ scenario, goals }) {
  const accounts = scenario?.accounts || [];
  const scenarioStart = scenario?.startDate || formatDateOnly(new Date());
  const scenarioEnd = scenario?.endDate || scenarioStart;

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
    const monthsToGoal = calculateMonthsBetweenDates(startDate, endDate);
    if (!monthsToGoal || monthsToGoal <= 0) {
      issues.push(`Goal end date must be after start date for account: ${account.name}`);
      continue;
    }

    const startingBalance = getStartingBalance(account);
    const annualRate = account.periodicChange?.rateValue || 0;

    let requiredMonthly = 0;

    if (goal.type === 'reach_balance_by_date') {
      if (goal.targetAmount == null) {
        issues.push(`Reach-balance goal missing target amount for account: ${account.name}`);
        continue;
      }
      requiredMonthly = calculateContributionAmount(startingBalance, goal.targetAmount, monthsToGoal, annualRate);
    } else if (goal.type === 'increase_by_delta') {
      if (goal.deltaAmount == null) {
        issues.push(`Increase-by-delta goal missing delta amount for account: ${account.name}`);
        continue;
      }
      const target = startingBalance + goal.deltaAmount;
      requiredMonthly = calculateContributionAmount(startingBalance, target, monthsToGoal, annualRate);
    } else if (goal.type === 'pay_down_by_date') {
      const target = goal.targetAmount != null ? goal.targetAmount : 0;
      const toPay = Math.max(0, startingBalance - target);
      requiredMonthly = toPay / monthsToGoal;
    } else {
      issues.push(`Unknown goal type: ${goal.type}`);
      continue;
    }

    if (!Number.isFinite(requiredMonthly) || requiredMonthly < 0) {
      issues.push(`Failed to compute a required monthly amount for: ${account.name}`);
      continue;
    }

    requirements.push({
      goal,
      account,
      startDate,
      endDate,
      monthsToGoal,
      requiredMonthly
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
    model.constraints[minKey] = { min: Math.max(0, req.requiredMonthly) };

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

    if (req.goal.type === 'pay_down_by_date') {
      // Reduce funding (cash) and reduce liability separately, due to the current transaction model.
      if (fundingAccountId) {
        suggested.push({
          id: 0,
          primaryAccountId: fundingAccountId,
          secondaryAccountId: null,
          transactionTypeId: 2,
          amount: Math.abs(amt),
          effectiveDate: startDate,
          description: `Advanced Goal: Funding for payoff ${req.account.name}`,
          recurrence,
          periodicChange: null,
          status: { name: 'planned' },
          tags: ['adv-goal-generated', `adv-goal-${req.goal.type}`, `adv-goal-id:${req.goal.id}`]
        });
      }

      suggested.push({
        id: 0,
        primaryAccountId: req.goal.accountId,
        secondaryAccountId: null,
        transactionTypeId: 2,
        amount: Math.abs(amt),
        effectiveDate: startDate,
        description: `Advanced Goal: Pay down ${req.account.name}`,
        recurrence,
        periodicChange: null,
        status: { name: 'planned' },
        tags: ['adv-goal-generated', `adv-goal-${req.goal.type}`, `adv-goal-id:${req.goal.id}`]
      });

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
      status: { name: 'planned' },
      tags: ['adv-goal-generated', `adv-goal-${req.goal.type}`, `adv-goal-id:${req.goal.id}`]
    });
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

function evaluateGoals({ scenario, goals, requirements, projectionsByAccountId, floorsByAccountId }) {
  const accounts = scenario?.accounts || [];
  const scenarioStart = scenario?.startDate || formatDateOnly(new Date());
  const scenarioEnd = scenario?.endDate || scenarioStart;

  const failures = [];

  for (const goal of goals) {
    if (!goal.accountId) continue;
    const account = getAccountById(accounts, goal.accountId);
    const startingBalance = getStartingBalance(account);
    const records = projectionsByAccountId.get(Number(goal.accountId)) || [];
    const startDate = goal.startDate || scenarioStart;
    const endDate = goal.endDate || scenarioEnd;
    const endBal = getBalanceAtOrBefore(records, endDate, startingBalance);

    if (goal.type === 'reach_balance_by_date') {
      if (goal.targetAmount == null) continue;
      if (endBal + 1e-6 < goal.targetAmount) {
        failures.push({ goalId: goal.id, type: goal.type, shortfall: goal.targetAmount - endBal });
      }
    } else if (goal.type === 'pay_down_by_date') {
      const target = goal.targetAmount != null ? goal.targetAmount : 0;
      if (endBal - 1e-6 > target) {
        failures.push({ goalId: goal.id, type: goal.type, shortfall: endBal - target });
      }
    } else if (goal.type === 'increase_by_delta') {
      if (goal.deltaAmount == null) continue;
      const startBal = getBalanceAtOrBefore(records, startDate, startingBalance);
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

async function findFloorSafeScale({ scenario, requirements, amountsByGoalId, constraints, floorsByAccountId }) {
  let lo = 0;
  let hi = 1;
  let best = 0;

  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    const scaled = scaleAmounts(amountsByGoalId, mid);
    const txs = buildSuggestedTransactions({ scenario, requirements, amountsByGoalId: scaled, constraints });
    const scenarioForCheck = { ...scenario, transactions: [...(scenario.transactions || []), ...txs] };
    const projections = await generateProjectionsForScenarioSafe(scenarioForCheck);
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
    const lp = await getLpSolver();
    const nowDate = formatDateOnly(new Date());
    const scenarioStart = scenario?.startDate || nowDate;
    const scenarioEnd = scenario?.endDate || scenarioStart;

    const goals = sortGoals((settings?.goals || []).map(normalizeGoal));
    const constraints = settings?.constraints || {};

    const lockedAccountIds = new Set((constraints.lockedAccountIds || []).map((id) => Number(id)));
    const fundingAccountId = constraints.fundingAccountId != null ? Number(constraints.fundingAccountId) : null;

    const warnings = [];
    const issues = [];

    if (!fundingAccountId) {
      issues.push('Funding account is required to solve. Select a funding account under Constraints.');
    }

    const floorsByAccountId = mergeFloorConstraints({ goals, constraints });

    // Baseline projections for floor-derived outflow cap (funding account only)
    let effectiveMaxOutflowPerMonth = constraints.maxOutflowPerMonth != null ? asNumber(constraints.maxOutflowPerMonth, null) : null;
    if (fundingAccountId && floorsByAccountId[String(fundingAccountId)] != null) {
      const baselineProjections = await generateProjectionsForScenarioSafe(scenario);
      const idx = indexProjectionsByAccountId(baselineProjections);
      const fundingAcc = getAccountById(scenario.accounts || [], fundingAccountId);
      const startingBalance = getStartingBalance(fundingAcc);
      const records = idx.get(fundingAccountId) || [];
      const minBaseline = Math.min(startingBalance, ...records.map((r) => asNumber(r.balance, startingBalance)));
      const floor = asNumber(floorsByAccountId[String(fundingAccountId)], 0);
      const derivedCap = Math.max(0, minBaseline - floor);
      effectiveMaxOutflowPerMonth = effectiveMaxOutflowPerMonth == null ? derivedCap : Math.min(effectiveMaxOutflowPerMonth, derivedCap);

      if (derivedCap <= 0) {
        issues.push('Funding account floor leaves no room for additional outflow. Reduce the floor or extend the goal dates.');
      }
    }

    const { requirements, issues: requirementIssues } = buildGoalRequirements({ scenario, goals });
    issues.push(...requirementIssues);

    if (issues.length > 0) {
      return {
        suggestedTransactions: [],
        explanation: ['Issues:', ...issues.map((i) => `- ${i}`)],
        warnings,
        issues,
        isFeasible: false
      };
    }

    const priorities = Array.from(new Set(requirements.map((r) => r.goal.priority))).sort((a, b) => a - b);
    let selectedRequirements = requirements;
    let bestSolution = null;
    let bestIncludedPriority = null;

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

      if (!result || result.feasible === false) {
        break;
      }

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
        isFeasible: false
      };
    }

    selectedRequirements = bestSolution.tierReqs;

    const amountsByGoalId = {};
    for (const req of selectedRequirements) {
      const varName = `g_${String(req.goal.id).replaceAll('-', '_')}`;
      const val = asNumber(bestSolution.result[varName], 0);
      amountsByGoalId[req.goal.id] = Math.max(0, val);
    }

    // Projection-based validation and refinement loop.
    let refinedAmounts = { ...amountsByGoalId };
    let validationFailures = [];

    for (let iter = 0; iter < 5; iter++) {
      const txs = buildSuggestedTransactions({ scenario, requirements: selectedRequirements, amountsByGoalId: refinedAmounts, constraints });
      const scenarioForCheck = { ...scenario, transactions: [...(scenario.transactions || []), ...txs] };
      const projections = await generateProjectionsForScenarioSafe(scenarioForCheck);
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
          scenario,
          requirements: selectedRequirements,
          amountsByGoalId: refinedAmounts,
          constraints,
          floorsByAccountId
        });
        refinedAmounts = scaleAmounts(refinedAmounts, scale);
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
      }

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

    const suggestedTransactions = buildSuggestedTransactions({
      scenario,
      requirements: selectedRequirements,
      amountsByGoalId: refinedAmounts,
      constraints
    });

    const explanation = [];
    explanation.push(`Solved priorities up to: ${bestIncludedPriority}`);
    if (effectiveMaxOutflowPerMonth != null) explanation.push(`Effective max outflow per month: ${effectiveMaxOutflowPerMonth}`);
    if (Object.keys(constraints.maxMovementByAccountId || {}).length > 0) explanation.push('Applied per-account movement caps.');
    if (Object.keys(floorsByAccountId || {}).length > 0) explanation.push('Validated min-balance floors against projections.');
    if (validationFailures.length > 0) {
      explanation.push('Validation issues:');
      validationFailures.slice(0, 10).forEach((f) => explanation.push(`- ${f.type} shortfall: ${asNumber(f.shortfall, 0).toFixed(2)}`));
      explanation.push('');
      explanation.push('What to check next:');
      explanation.push('- Reduce constraints, extend dates, or increase max outflow');
    } else {
      explanation.push('All configured goals and constraints validated against projections.');
    }

    return {
      suggestedTransactions,
      explanation,
      warnings,
      issues: [],
      isFeasible: suggestedTransactions.length > 0 && validationFailures.length === 0
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
