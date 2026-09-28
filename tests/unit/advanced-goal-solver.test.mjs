import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCascadeAllocationPlan,
  buildGoalRequirements
} from '../../js/domain/utils/advanced-goal-solver.js';

function requirement({
  id,
  priority,
  accountId,
  requiredMonthly,
  minimumMonthlyAmount = null,
  accountRatePercent = 0,
  monthsToGoal = 4,
  startDate = '2026-01-01',
  endDate = '2026-04-30'
}) {
  return {
    goal: { id, priority, accountId, type: 'pay_down_by_date', minimumMonthlyAmount },
    account: { id: accountId, name: `Account ${accountId}` },
    requiredMonthly,
    accountRatePercent,
    monthsToGoal,
    startDate,
    endDate
  };
}

test('cascade allocation rolls the monthly capacity from one priority into the next', () => {
  const result = buildCascadeAllocationPlan({
    requirements: [
      requirement({ id: 'first', priority: 1, accountId: 10, requiredMonthly: 50 }),
      requirement({ id: 'second', priority: 2, accountId: 20, requiredMonthly: 50 })
    ],
    constraints: { maxOutflowPerMonth: 100 }
  });

  assert.equal(result.monthlyCapacity, 100);
  assert.equal(result.capacityWasDerived, false);
  assert.deepEqual(
    result.allocations.map(({ goalId, date, amount }) => ({ goalId, date, amount })),
    [
      { goalId: 'first', date: '2026-01-01', amount: 100 },
      { goalId: 'first', date: '2026-02-01', amount: 100 },
      { goalId: 'second', date: '2026-03-01', amount: 100 },
      { goalId: 'second', date: '2026-04-01', amount: 100 }
    ]
  );
  assert.deepEqual(result.unfulfilled, []);
});

test('cascade allocation uses remaining capacity in the payoff month', () => {
  const result = buildCascadeAllocationPlan({
    requirements: [
      requirement({ id: 'first', priority: 1, accountId: 10, requiredMonthly: 37.5 }),
      requirement({ id: 'second', priority: 2, accountId: 20, requiredMonthly: 37.5 })
    ],
    constraints: { maxOutflowPerMonth: 100 }
  });

  assert.deepEqual(
    result.allocations.map(({ goalId, date, amount }) => ({ goalId, date, amount })),
    [
      { goalId: 'first', date: '2026-01-01', amount: 100 },
      { goalId: 'first', date: '2026-02-01', amount: 50 },
      { goalId: 'second', date: '2026-02-01', amount: 50 },
      { goalId: 'second', date: '2026-03-01', amount: 100 }
    ]
  );
});

test('cascade allocation reports deadline shortfalls instead of silently dropping goals', () => {
  const result = buildCascadeAllocationPlan({
    requirements: [
      requirement({ id: 'first', priority: 1, accountId: 10, requiredMonthly: 100 }),
      requirement({ id: 'second', priority: 2, accountId: 20, requiredMonthly: 100 })
    ],
    constraints: { maxOutflowPerMonth: 100 }
  });

  assert.equal(result.unfulfilled.length, 1);
  assert.equal(result.unfulfilled[0].goalId, 'second');
  assert.equal(result.unfulfilled[0].shortfall, 400);
});

test('cascade allocation respects locked accounts and per-account monthly caps', () => {
  const result = buildCascadeAllocationPlan({
    requirements: [
      requirement({ id: 'locked', priority: 1, accountId: 10, requiredMonthly: 25 }),
      requirement({ id: 'capped', priority: 2, accountId: 20, requiredMonthly: 25 })
    ],
    constraints: {
      maxOutflowPerMonth: 100,
      lockedAccountIds: [10],
      maxMovementByAccountId: { '20': 40 }
    }
  });

  assert.equal(result.allocations.every((allocation) => allocation.goalId === 'capped'), true);
  assert.equal(result.allocations.every((allocation) => allocation.amount <= 40), true);
  assert.equal(result.unfulfilled.some((item) => item.goalId === 'locked'), true);
});

test('cascade allocation reserves every contractual minimum before using extra capacity', () => {
  const result = buildCascadeAllocationPlan({
    requirements: [
      requirement({ id: 'first', priority: 1, accountId: 10, requiredMonthly: 50, minimumMonthlyAmount: 20 }),
      requirement({ id: 'second', priority: 2, accountId: 20, requiredMonthly: 50, minimumMonthlyAmount: 20 })
    ],
    constraints: { maxOutflowPerMonth: 100 }
  });

  const firstMonth = result.allocations.filter((allocation) => allocation.date === '2026-01-01');
  assert.deepEqual(
    firstMonth.map(({ goalId, amount }) => ({ goalId, amount })),
    [
      { goalId: 'first', amount: 80 },
      { goalId: 'second', amount: 20 }
    ]
  );
  assert.equal(result.minimumMonthlyTotal, 40);
  assert.equal(result.minimumCapacityShortfall, 0);
});

test('avalanche ordering directs extra capacity to the highest-rate goal in a priority tier', () => {
  const result = buildCascadeAllocationPlan({
    requirements: [
      requirement({ id: 'low-rate', priority: 1, accountId: 10, requiredMonthly: 50, minimumMonthlyAmount: 10, accountRatePercent: 5 }),
      requirement({ id: 'high-rate', priority: 1, accountId: 20, requiredMonthly: 50, minimumMonthlyAmount: 10, accountRatePercent: 19 })
    ],
    constraints: { maxOutflowPerMonth: 100 },
    payoffOrder: 'avalanche'
  });

  const firstMonthByGoal = Object.fromEntries(
    result.allocations
      .filter((allocation) => allocation.date === '2026-01-01')
      .map((allocation) => [allocation.goalId, allocation.amount])
  );
  assert.equal(firstMonthByGoal['high-rate'], 90);
  assert.equal(firstMonthByGoal['low-rate'], 10);
  assert.equal(result.payoffOrder, 'avalanche');
});

test('snowball ordering targets the smallest debt ahead of manual goal priority', () => {
  const result = buildCascadeAllocationPlan({
    requirements: [
      requirement({ id: 'large-priority', priority: 1, accountId: 10, requiredMonthly: 100 }),
      requirement({ id: 'small-later', priority: 3, accountId: 20, requiredMonthly: 25 })
    ],
    constraints: { maxOutflowPerMonth: 100 },
    payoffOrder: 'snowball'
  });

  const firstMonthByGoal = Object.fromEntries(
    result.allocations
      .filter((allocation) => allocation.date === '2026-01-01')
      .map((allocation) => [allocation.goalId, allocation.amount])
  );
  assert.equal(firstMonthByGoal['small-later'], 100);
  assert.equal(firstMonthByGoal['large-priority'], undefined);
  assert.equal(result.payoffOrder, 'snowball');
});

test('avalanche ordering targets the highest-rate debt ahead of manual goal priority', () => {
  const result = buildCascadeAllocationPlan({
    requirements: [
      requirement({ id: 'low-rate-priority', priority: 1, accountId: 10, requiredMonthly: 50, accountRatePercent: 5 }),
      requirement({ id: 'high-rate-later', priority: 4, accountId: 20, requiredMonthly: 50, accountRatePercent: 19 })
    ],
    constraints: { maxOutflowPerMonth: 100 },
    payoffOrder: 'avalanche'
  });

  const firstMonthByGoal = Object.fromEntries(
    result.allocations
      .filter((allocation) => allocation.date === '2026-01-01')
      .map((allocation) => [allocation.goalId, allocation.amount])
  );
  assert.equal(firstMonthByGoal['high-rate-later'], 100);
  assert.equal(firstMonthByGoal['low-rate-priority'], undefined);
});

test('goal requirements use projected plan and actual balances instead of raw starting balances', () => {
  const scenario = {
    projection: { config: { startDate: '2026-01-01', endDate: '2026-12-31' } },
    accounts: [{ id: 10, name: 'Savings', startingBalance: 100, periodicChange: null }]
  };
  const goals = [{
    id: 'goal',
    priority: 1,
    accountId: 10,
    type: 'reach_balance_by_date',
    targetAmount: 500,
    startDate: '2026-01-01',
    endDate: '2026-04-30'
  }];
  const baselineProjectionsByAccountId = new Map([[
    10,
    [
      { accountId: 10, date: '2026-01-01', balance: 130 },
      { accountId: 10, date: '2026-02-01', balance: 160 },
      { accountId: 10, date: '2026-03-01', balance: 190 },
      { accountId: 10, date: '2026-04-01', balance: 200 }
    ]
  ]]);

  const result = buildGoalRequirements({ scenario, goals, baselineProjectionsByAccountId });
  assert.deepEqual(result.issues, []);
  assert.equal(result.requirements[0].baselineStartBalance, 100);
  assert.equal(result.requirements[0].baselineEndBalance, 200);
  assert.equal(result.requirements[0].totalRequiredMovement, 300);
  assert.equal(result.requirements[0].requiredMonthly, 100);
});
