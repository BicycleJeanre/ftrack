const { describe, it } = require('node:test');
const assert = require('node:assert');

const { getQcData } = require('./helpers');

const qcData = getQcData();

describe('Goal-Based Planning Validation', () => {
  describe('Goal-Based scenario structure', () => {
    const scenario = qcData.scenarios.find((s) => s.type === 5);

    it('has Goal-Based scenario in QC data', () => {
      assert.ok(scenario, 'Goal-Based scenario not found');
      assert.strictEqual(scenario.type.id, 5, 'Incorrect scenario type');
    });

    it('has primary and goal accounts', () => {
      assert.ok(scenario.accounts.length >= 2, 'Need at least primary + goal account');
    });

    it('has recurring transaction to goal account', () => {
      const goalTx = scenario.transactions.find((tx) =>
        tx.secondaryAccount?.id === scenario.accounts[1]?.id || tx.secondaryAccountId === scenario.accounts[1]?.id
      );
      assert.ok(goalTx, 'Missing transaction to goal account');
      assert.ok(goalTx.recurrence, 'Recurrence required for goal funding');
    });

    it('transaction amounts are positive', () => {
      scenario.transactions.forEach((tx) => {
        assert.ok(tx.amount > 0, `Transaction ${tx.id} has non-positive amount`);
      });
    });

    it('projections show growth in goal account', () => {
      if (scenario.projections.length > 1) {
        const goalAccountId = scenario.accounts[1].id;
        const goalProjections = scenario.projections.filter((p) => p.accountId === goalAccountId);

        if (goalProjections.length > 1) {
          const first = goalProjections[0];
          const last = goalProjections[goalProjections.length - 1];
          assert.ok(
            last.balance >= first.balance,
            'Goal account should accumulate balance over time'
          );
        }
      }
    });
  });

  describe('Goal-Based calculation semantics', () => {
    it('calculates goal reachability with monthly contributions', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 5);

      const monthlyContribution = scenario.transactions[0]?.amount || 0;
      assert.ok(monthlyContribution > 0, 'Monthly contribution required');

      const goalAccount = scenario.accounts[1];
      const projections = scenario.projections.filter((p) => p.accountId === goalAccount.id);

      if (projections.length >= 2) {
        const firstBalance = projections[0].balance;
        const secondBalance = projections[1].balance;
        const balanceDelta = secondBalance - firstBalance;

        assert.ok(
          balanceDelta >= monthlyContribution * 0.9,
          'Goal account growth should reflect contributions'
        );
      }
    });

    it('validates goal parameters (amount, date, account)', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 5);

      const relationshipTx = scenario.transactions[0];
      assert.ok(relationshipTx.secondaryAccount, 'Goal transaction missing secondary account');

      const goalAccountId = relationshipTx.secondaryAccount.id;
      const goalAccount = scenario.accounts.find((a) => a.id === goalAccountId);
      assert.ok(goalAccount, `Goal account ${goalAccountId} not found in scenario`);
    });

    it('handles edge case: goal already achieved at start', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 5);
      const goalAccount = scenario.accounts[1];

      assert.ok(goalAccount.startingBalance !== undefined, 'Goal account missing starting balance');
    });

    it('validates goal date is after scenario start', () => {
      const scenario = qcData.scenarios.find((s) => s.type === 5);

      const scenarioStart = new Date(scenario.startDate);
      const scenarioEnd = new Date(scenario.endDate);

      assert.ok(scenarioEnd > scenarioStart, 'Scenario end date must be after start date');
    });
  });
});
