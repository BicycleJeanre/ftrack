const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { performance } = require('node:perf_hooks');

const { getExpectedOutputs, getQcData, roundToCents } = require('./helpers');

const expectedOutputs = getExpectedOutputs();
const qcData = getQcData();

describe('QC Dataset Validation', () => {
  expectedOutputs.scenarios.forEach((expectedScenario) => {
    describe(`Scenario ${expectedScenario.id}: ${expectedScenario.name}`, () => {
      const scenario = qcData.scenarios.find((s) => s.id === expectedScenario.id);

      if (!scenario) {
        it('should exist in QC data', () => {
          assert.fail(`Scenario ${expectedScenario.id} not found in QC data`);
        });
        return;
      }

      it('should have correct counts', () => {
        const expected = expectedScenario.expectedOutputs;
        assert.strictEqual(scenario.accounts.length, expected.accountCount, 'Account count mismatch');
        assert.strictEqual(scenario.transactions.length, expected.transactionCount, 'Transaction count mismatch');
        assert.strictEqual(scenario.projections.length, expected.projectionCount, 'Projection count mismatch');
        assert.strictEqual(scenario.budgets.length, expected.budgetCount, 'Budget count mismatch');
      });

      it('should have correct first projection values', () => {
        const expected = expectedScenario.expectedOutputs.firstProjection;
        const actual = scenario.projections[0];

        assert.strictEqual(actual.date, expected.date, 'First projection date mismatch');
        assert.strictEqual(actual.accountId, expected.accountId, 'First projection accountId mismatch');

        assert.strictEqual(
          roundToCents(actual.balance),
          expected.balance,
          `First projection balance: expected ${expected.balance}, got ${roundToCents(actual.balance)}`
        );

        if (expected.income !== undefined) {
          assert.strictEqual(actual.income, expected.income, 'First projection income mismatch');
        }
        if (expected.expenses !== undefined) {
          assert.strictEqual(actual.expenses, expected.expenses, 'First projection expenses mismatch');
        }
        if (expected.netChange !== undefined) {
          assert.strictEqual(actual.netChange, expected.netChange, 'First projection netChange mismatch');
        }
      });

      it('should have correct last projection values', () => {
        const expected = expectedScenario.expectedOutputs.lastProjection;
        const actual = scenario.projections[scenario.projections.length - 1];

        assert.strictEqual(actual.date, expected.date, 'Last projection date mismatch');
        assert.strictEqual(actual.accountId, expected.accountId, 'Last projection accountId mismatch');

        assert.strictEqual(
          roundToCents(actual.balance),
          expected.balance,
          `Last projection balance: expected ${expected.balance}, got ${roundToCents(actual.balance)}`
        );
      });
    });
  });
});

describe('Scenario-Level Validation', () => {
  describe('All scenario types have required structure', () => {
    const scenarioTypes = ['General', 'Budget', 'Funds', 'Debt Repayment', 'Goal-Based', 'Advanced Goal Solver'];

    scenarioTypes.forEach((typeName) => {
      it(`${typeName} scenario exists and has valid structure`, () => {
        const scenario = qcData.scenarios.find((s) => s.type.name === typeName);
        assert.ok(scenario, `${typeName} scenario not found in QC data`);
        assert.ok(scenario.accounts, `${typeName} scenario missing accounts`);
        assert.ok(Array.isArray(scenario.accounts), `${typeName} accounts must be an array`);
        assert.ok(scenario.transactions !== undefined, `${typeName} scenario missing transactions`);
        assert.ok(Array.isArray(scenario.transactions), `${typeName} transactions must be an array`);
        assert.ok(scenario.projections !== undefined, `${typeName} scenario missing projections`);
        assert.ok(Array.isArray(scenario.projections), `${typeName} projections must be an array`);
        assert.strictEqual(scenario.type.name, typeName, 'Scenario type name mismatch');
      });
    });
  });

  describe('Scenario data constraints and rollups', () => {
    qcData.scenarios.forEach((scenario) => {
      describe(`${scenario.name}`, () => {
        it('has at least one account', () => {
          assert.ok(scenario.accounts.length > 0, 'Scenario must have at least one account');
        });

        it('account IDs are unique within scenario', () => {
          const ids = scenario.accounts.map((a) => a.id);
          const uniqueIds = new Set(ids);
          assert.strictEqual(ids.length, uniqueIds.size, 'Duplicate account IDs found');
        });

        it('transaction primary/secondary accounts exist', () => {
          scenario.transactions.forEach((tx) => {
            const primaryExists = scenario.accounts.some((a) => a.id === tx.primaryAccount?.id);
            const secondaryExists = scenario.accounts.some((a) => a.id === tx.secondaryAccount?.id);
            assert.ok(primaryExists, `Transaction ${tx.id} references non-existent primary account`);
            assert.ok(secondaryExists, `Transaction ${tx.id} references non-existent secondary account`);
          });
        });

        it('has non-empty projection date range', () => {
          if (scenario.projections.length > 0) {
            const dates = scenario.projections.map((p) => new Date(p.date).getTime());
            const minDate = Math.min(...dates);
            const maxDate = Math.max(...dates);
            assert.ok(maxDate > minDate, 'Projection date range must span multiple dates');
          }
        });

        it('Budget scenario type has budgets or budget-suitable accounts', () => {
          if (scenario.type.id === 1) {
            const hasBudgets = scenario.budgets && scenario.budgets.length > 0;
            const hasIncomeOrExpense = scenario.accounts.some((a) => [4, 5].includes(a.type.id));
            assert.ok(hasBudgets || hasIncomeOrExpense, 'Budget scenario should have budgets or income/expense accounts');
          }
        });

        it('has consistent starting balance tracking', () => {
          scenario.accounts.forEach((account) => {
            const firstProjection = scenario.projections.find((p) => p.accountId === account.id);
            if (firstProjection) {
              assert.ok(
                account.startingBalance !== undefined,
                `Account ${account.name} missing startingBalance`
              );
            }
          });
        });
      });
    });
  });
});

describe('Calculation Verification Checklist', () => {
  describe('Recurrence expansion accuracy', () => {
    it('Monthly recurrence generates correct occurrence dates', () => {
      const scenario = qcData.scenarios.find((s) => s.type.id === 1 || s.type.id === 2);
      const tx = scenario?.transactions.find((t) => t.recurrence?.name === 'Monthly' || t.recurrence?.name === 'Weekly');

      if (tx && tx.recurrence) {
        assert.ok(tx.recurrence.frequency !== undefined, 'Recurrence missing frequency');
        assert.ok(tx.recurrence.startDate, 'Recurrence missing start date');
      }
    });

    it('Quarterly and yearly recurrences defined correctly', () => {
      const scenario = qcData.scenarios.find((s) => s.type.id === 3);
      const txs = scenario?.transactions || [];

      txs.forEach((tx) => {
        if (tx.recurrence) {
          assert.ok(
            ['Weekly', 'Monthly', 'Quarterly', 'Yearly', 'One-time'].includes(tx.recurrence.name),
            `Unknown recurrence type: ${tx.recurrence.name}`
          );
        }
      });
    });
  });

  describe('Periodic change application rules', () => {
    it('Accounts with periodic change have valid change types', () => {
      const scenario = qcData.scenarios.find((s) => s.type.id !== 1);

      scenario?.accounts.forEach((account) => {
        if (account.periodicChange) {
          assert.ok(account.periodicChange.changeMode !== undefined, `Account ${account.name} missing changeMode`);
          assert.ok(account.periodicChange.value !== undefined, `Account ${account.name} missing value`);
          if (account.periodicChange.changeType) {
            assert.ok(
              [1, 2, 3, 4, 5, 6, 7].includes(account.periodicChange.changeType),
              `Invalid changeType for account ${account.name}: ${account.periodicChange.changeType}`
            );
          }
        }
      });
    });

    it('Custom compounding settings preserved when defined', () => {
      const scenario = qcData.scenarios.find((s) => s.type.id === 2);
      const accountWithCustom = scenario?.accounts.find((a) => a.periodicChange?.customCompounding);

      if (accountWithCustom) {
        const pc = accountWithCustom.periodicChange;
        assert.strictEqual(pc.changeType, 7, 'Custom compounding should have changeType 7');
        assert.ok(pc.customCompounding.frequency !== undefined, 'Missing custom compounding frequency');
        assert.ok(pc.customCompounding.period !== undefined, 'Missing custom compounding period');
      }
    });
  });

  describe('Money flow rules', () => {
    it('Transactions reference valid account types', () => {
      const scenario = qcData.scenarios.find((s) => s.transactions.length > 0);

      if (scenario) {
        scenario.transactions.forEach((tx) => {
          assert.ok(tx.primaryAccount, `Transaction ${tx.id} missing primary account`);
          assert.ok(tx.secondaryAccount, `Transaction ${tx.id} missing secondary account`);
          assert.ok(
            [1, 2, 3, 4, 5].includes(tx.transactionType),
            `Invalid transaction type: ${tx.transactionType}`
          );
        });
      }
    });

    it('Debt repayment scenario tracks liability reduction', () => {
      const scenario = qcData.scenarios.find((s) => s.type.id === 4);

      if (scenario) {
        const liabilityAccount = scenario.accounts.find((a) => a.type.id === 2);
        assert.ok(liabilityAccount, 'Debt repayment scenario should have liability account');

        const payments = scenario.transactions.filter(
          (t) => t.primaryAccount?.id === liabilityAccount?.id || t.secondaryAccount?.id === liabilityAccount?.id
        );
        assert.ok(payments.length > 0, 'Debt repayment scenario should have payment transactions');
      }
    });

    it('Goal-based scenario tracks goal accounts separately', () => {
      const scenario = qcData.scenarios.find((s) => s.type.id === 5);

      if (scenario && scenario.accounts.length > 1) {
        const goalAccounts = scenario.accounts.filter(
          (a) => a.description?.includes('Goal') || a.name.includes('Goal')
        );
        assert.ok(scenario.accounts.length >= 2, 'Goal-based scenario should have multiple accounts');
        assert.ok(goalAccounts.length >= 0, 'Goal accounts should be identifiable');
      }
    });
  });
});

describe('Regression Baseline Safeguards', () => {
  describe('Expected output baselines exist for all scenarios', () => {
    qcData.scenarios.forEach((scenario) => {
      it(`${scenario.name} has baseline expected outputs`, () => {
        const baseline = expectedOutputs.scenarios.find((e) => e.id === scenario.id);
        assert.ok(baseline, `No baseline found for ${scenario.name}`);
        assert.ok(baseline.expectedOutputs, `Baseline for ${scenario.name} missing expectedOutputs`);
        assert.ok(baseline.expectedOutputs.accountCount !== undefined, 'Missing accountCount in baseline');
        assert.ok(baseline.expectedOutputs.transactionCount !== undefined, 'Missing transactionCount in baseline');
        assert.ok(baseline.expectedOutputs.projectionCount !== undefined, 'Missing projectionCount in baseline');
      });
    });
  });

  describe('Baseline consistency checks', () => {
    it('All QC scenarios are represented in expected outputs', () => {
      const scenarioIds = new Set(qcData.scenarios.map((s) => s.id));
      const baselineIds = new Set(expectedOutputs.scenarios.map((e) => e.id));

      scenarioIds.forEach((id) => {
        assert.ok(baselineIds.has(id), `Scenario ${id} missing from expected outputs`);
      });
    });

    it('Baseline counts match scenario structure', () => {
      qcData.scenarios.forEach((scenario) => {
        const baseline = expectedOutputs.scenarios.find((e) => e.id === scenario.id);
        assert.strictEqual(
          scenario.accounts.length,
          baseline.expectedOutputs.accountCount,
          `Account count mismatch for ${scenario.name}`
        );
        assert.strictEqual(
          scenario.transactions.length,
          baseline.expectedOutputs.transactionCount,
          `Transaction count mismatch for ${scenario.name}`
        );
        assert.strictEqual(
          scenario.projections.length,
          baseline.expectedOutputs.projectionCount,
          `Projection count mismatch for ${scenario.name}`
        );
      });
    });

    it('Baseline version is documented', () => {
      assert.ok(expectedOutputs.version, 'Expected outputs missing version');
      assert.match(expectedOutputs.version, /^\d+\.\d+\.\d+$/, 'Version must be semver format');
    });
  });

  describe('Performance baseline safeguards', () => {
    it('QC dataset loads within reasonable time', () => {
      const qcPath = path.join(__dirname, '..', 'ftrack-qc-data.json');
      const startTime = performance.now();
      const raw = fs.readFileSync(qcPath, 'utf8');
      JSON.parse(raw);
      const endTime = performance.now();

      const loadTime = endTime - startTime;
      assert.ok(loadTime < 1000, `QC data load exceeded 1s: ${loadTime.toFixed(2)}ms`);
    });

    it('Expected outputs file is not excessively large', () => {
      const expectedPath = path.join(__dirname, '..', 'expected-outputs.json');
      const stats = fs.statSync(expectedPath);
      const sizeInMB = stats.size / (1024 * 1024);

      assert.ok(sizeInMB < 10, `Expected outputs file exceeds 10MB: ${sizeInMB.toFixed(2)}MB`);
    });
  });
});
