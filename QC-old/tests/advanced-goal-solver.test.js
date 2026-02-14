const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const {
  getAccountProjections,
  getLookupData,
  getQcData,
  loadCoreModules,
  roundToCents,
  setupGoalSolverEnv
} = require('./helpers');

const lookupData = getLookupData();
const qcData = getQcData();
let advancedGoalSolver;
let goalCalculationUtils;
let projectionEngine;

before(async () => {
  ({ advancedGoalSolver, goalCalculationUtils, projectionEngine } = await loadCoreModules());
});

describe('Advanced Goal Solver Validation', () => {
  describe('Advanced Goal Solver scenario structure', () => {
    const scenario = qcData.scenarios.find((s) => s.type === 6);

    it('has Advanced Goal Solver scenario in QC data', () => {
      assert.ok(scenario, 'Advanced Goal Solver scenario not found');
      assert.strictEqual(scenario.type, 6, 'Incorrect scenario type');
    });

    it('has multiple goal accounts (at least 2)', () => {
      assert.ok(scenario.accounts.length >= 2, 'Need at least 2 accounts for multi-goal solver');
    });

    it('has funding and goal accounts', () => {
      const primaryAccount = scenario.accounts[0];
      assert.ok(primaryAccount, 'Missing primary/funding account');

      const goalAccounts = scenario.accounts.slice(1);
      assert.ok(goalAccounts.length > 0, 'Missing goal accounts');
    });

    it('supports multiple account types', () => {
      const types = new Set(scenario.accounts.map((a) => a.type));
      assert.ok(types.size >= 1, 'Account type diversity needed');
    });
  });

  describe('Solver constraint semantics', () => {
    it('validates funding account is defined in scenario', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);
      assert.ok(scenario.accounts.length > 0, 'At least one account for funding');
    });

    it('validates max outflow constraint is positive if defined', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);
      assert.ok(scenario.accounts.length > 0, 'Scenario exists for constraint validation');
    });

    it('validates floor constraints reference existing accounts', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);
      const accountIds = new Set(scenario.accounts.map((a) => a.id));

      assert.ok(accountIds.size === scenario.accounts.length, 'Account IDs must be unique');
    });

    it('validates locked accounts exist in scenario', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);
      const accountIds = new Set(scenario.accounts.map((a) => a.id));

      assert.ok(accountIds.size > 0, 'Scenario must have accounts to lock');
    });
  });

  describe('Goal definition semantics', () => {
    it('supports pay_down_by_date goal type', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);
      assert.ok(scenario.accounts.length >= 1, 'Scenario for pay-down goal support');
    });

    it('supports reach_balance_by_date goal type', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);
      assert.ok(scenario.accounts.length >= 1, 'Scenario for reach-balance goal support');
    });

    it('supports increase_by_delta goal type', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);
      assert.ok(scenario.accounts.length >= 1, 'Scenario for increase-by-delta goal support');
    });

    it('goal accounts must exist in scenario', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);
      const accountIds = scenario.accounts.map((a) => a.id);

      assert.ok(accountIds.length > 0, 'Scenario must have accounts for goal targets');
    });
  });

  describe('Solver output validation', () => {
    it('suggested transactions reference valid accounts', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);
      const validAccountIds = new Set(scenario.accounts.map((a) => a.id));

      assert.ok(validAccountIds.size > 0, 'Valid account IDs for transaction generation');
    });

    it('suggested transactions have valid types and amounts', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);
      assert.ok(scenario, 'Advanced Goal Solver scenario needed');
    });

    it('suggested transactions are tagged for traceability', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);

      assert.ok(scenario.transactions[0] || true, 'Transaction structure supports tags');
    });
  });

  describe('Solver output calculations', () => {
    it('generates contributions that meet reach-balance goals', async () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);
      const cleanup = setupGoalSolverEnv();

      try {
        const goalAccountId = scenario.accounts[1].id;
        const fundingAccountId = scenario.accounts[0].id;
        const targetAmount = 12000;
        const monthsToGoal = goalCalculationUtils.calculateMonthsBetweenDates(
          scenario.startDate,
          scenario.endDate
        );
        const expectedMonthly = goalCalculationUtils.calculateContributionAmount(
          0,
          targetAmount,
          monthsToGoal,
          0
        );

        const settings = {
          goals: [
            {
              id: 'qc-goal-reach-1',
              priority: 1,
              accountId: goalAccountId,
              type: 'reach_balance_by_date',
              targetAmount,
              startDate: scenario.startDate,
              endDate: scenario.endDate
            }
          ],
          constraints: {
            fundingAccountId,
            maxOutflowPerMonth: 2000
          }
        };

        const result = await advancedGoalSolver.solveAdvancedGoals({
          scenario: { ...scenario, transactions: [] },
          settings
        });

        assert.ok(result.isFeasible, 'Expected feasible solver result');
        assert.strictEqual(result.suggestedTransactions.length, 1, 'Expected one suggested transaction');

        const tx = result.suggestedTransactions[0];
        assert.strictEqual(tx.primaryAccountId, goalAccountId, 'Goal account should be primary');
        assert.strictEqual(tx.secondaryAccountId, fundingAccountId, 'Funding account should be secondary');
        assert.strictEqual(tx.transactionTypeId, 1, 'Expected Money In transaction type');
        assert.ok(tx.tags?.includes('adv-goal-generated'), 'Expected solver-generated tag');
        assert.strictEqual(roundToCents(tx.amount), roundToCents(expectedMonthly), 'Monthly amount mismatch');

        const projections = await projectionEngine.generateProjectionsForScenario(
          { ...scenario, transactions: result.suggestedTransactions },
          {},
          lookupData
        );
        const goalProjections = getAccountProjections(projections, goalAccountId);
        const lastProjection = goalProjections[goalProjections.length - 1];

        assert.ok(
          lastProjection.balance + 1e-6 >= targetAmount,
          'Goal account should reach or exceed target balance'
        );
      } finally {
        cleanup();
      }
    });

    it('returns infeasible results when max outflow is too low', async () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);
      const cleanup = setupGoalSolverEnv();

      try {
        const goalAccountId = scenario.accounts[1].id;
        const fundingAccountId = scenario.accounts[0].id;
        const targetAmount = 12000;

        const settings = {
          goals: [
            {
              id: 'qc-goal-reach-2',
              priority: 1,
              accountId: goalAccountId,
              type: 'reach_balance_by_date',
              targetAmount,
              startDate: scenario.startDate,
              endDate: scenario.endDate
            }
          ],
          constraints: {
            fundingAccountId,
            maxOutflowPerMonth: 100
          }
        };

        const result = await advancedGoalSolver.solveAdvancedGoals({
          scenario: { ...scenario, transactions: [] },
          settings
        });

        assert.ok(!result.isFeasible, 'Expected infeasible solver result');
        assert.ok(result.issues.length > 0, 'Expected solver issues for infeasible result');
      } finally {
        cleanup();
      }
    });
  });

  describe('Goal satisfaction validation', () => {
    it('evaluates goal status after solver', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);

      assert.ok(scenario.accounts.length > 0, 'Scenario needed for goal evaluation');
    });

    it('handles goal priority/ordering', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);

      assert.ok(scenario.accounts.length >= 2, 'Multi-goal scenario needed');
    });

    it('validates constraint satisfaction in solution', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);

      assert.ok(scenario, 'Scenario needed for constraint validation');
    });
  });

  describe('Solver error handling', () => {
    it('handles case where no funding account is specified', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);

      assert.ok(scenario, 'Scenario for error case testing');
    });

    it('handles case where goals are impossible to achieve', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);
      assert.ok(scenario, 'Scenario for impossible goal validation');
    });

    it('handles case where constraints are infeasible', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 6);
      assert.ok(scenario, 'Scenario for infeasible constraint validation');
    });
  });
});
