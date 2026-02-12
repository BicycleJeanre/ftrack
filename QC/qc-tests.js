const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Load expected outputs synchronously at module load
const expectedPath = path.join(__dirname, 'expected-outputs.json');
const expectedOutputs = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));

// Import functions to test
// NOTE: These modules use ES6 imports, so we'll need to load them differently
// For now, we'll create a simple loader that uses dynamic import

let calculationUtils;
let dateUtils;
let periodicChangeUtils;
let recurrenceUtils;

async function loadModules() {
  const moduleUrl = (modulePath) => new URL(`file://${path.resolve(__dirname, '..', modulePath)}`);
  calculationUtils = await import(moduleUrl('js/calculation-utils.js').href);
  dateUtils = await import(moduleUrl('js/date-utils.js').href);
  periodicChangeUtils = await import(moduleUrl('js/periodic-change-utils.js').href);
  recurrenceUtils = await import(moduleUrl('js/recurrence-utils.js').href);
}

describe('QC Function Tests', async () => {
  await loadModules();

  describe('Periodic Change Calculations', () => {
    it('should return principal when no periodic change', () => {
      const result = calculationUtils.calculatePeriodicChange(10000, null, 1);
      assert.strictEqual(result, 10000);
    });

    expectedOutputs.functionTests.periodicChange.forEach((testCase) => {
      it(testCase.description, () => {
        const result = calculationUtils.calculatePeriodicChange(
          testCase.principal,
          testCase.periodicChange,
          testCase.periods
        );
        
        const tolerance = testCase.tolerance || 0;
        if (tolerance > 0) {
          assert.ok(
            Math.abs(result - testCase.expected) <= tolerance,
            `Expected ${testCase.expected} ± ${tolerance}, got ${result}`
          );
        } else {
          assert.strictEqual(result, testCase.expected);
        }
      });
    });
  });

  describe('Recurrence Date Generation', () => {
    expectedOutputs.functionTests.recurrenceDates.forEach((testCase) => {
      it(testCase.description, () => {
        const projectionStart = dateUtils.parseDateOnly(testCase.projectionStart);
        const projectionEnd = dateUtils.parseDateOnly(testCase.projectionEnd);
        
        const dates = calculationUtils.generateRecurrenceDates(
          testCase.recurrence,
          projectionStart,
          projectionEnd
        );
        
        assert.strictEqual(dates.length, testCase.expectedCount, 
          `Expected ${testCase.expectedCount} dates, got ${dates.length}`);
        
        if (testCase.expectedFirstDate) {
          const firstDate = dateUtils.formatDateOnly(dates[0]);
          assert.strictEqual(firstDate, testCase.expectedFirstDate,
            `Expected first date ${testCase.expectedFirstDate}, got ${firstDate}`);
        }
        
        if (testCase.expectedLastDate) {
          const lastDate = dateUtils.formatDateOnly(dates[dates.length - 1]);
          assert.strictEqual(lastDate, testCase.expectedLastDate,
            `Expected last date ${testCase.expectedLastDate}, got ${lastDate}`);
        }
      });
    });
  });

  describe('Date Utilities', () => {
    expectedOutputs.functionTests.dateUtils.forEach((testCase) => {
      it(testCase.description, () => {
        if (testCase.function === 'formatDateOnly') {
          const result = dateUtils.formatDateOnly(new Date(testCase.input));
          assert.strictEqual(result, testCase.expected);
        } else if (testCase.function === 'parseDateOnly') {
          const result = dateUtils.parseDateOnly(testCase.input);
          assert.strictEqual(result.getFullYear(), testCase.expectedYear);
          assert.strictEqual(result.getMonth(), testCase.expectedMonth);
          assert.strictEqual(result.getDate(), testCase.expectedDate);
        }
      });
    });
  });

  describe('getNthWeekdayOfMonth', () => {
    expectedOutputs.functionTests.getNthWeekdayOfMonth.forEach((testCase) => {
      it(testCase.description, () => {
        const date = dateUtils.parseDateOnly(testCase.date);
        const result = calculationUtils.getNthWeekdayOfMonth(
          date,
          testCase.weekday,
          testCase.n
        );
        
        const resultStr = dateUtils.formatDateOnly(result);
        assert.strictEqual(resultStr, testCase.expected,
          `Expected ${testCase.expected}, got ${resultStr}`);
      });
    });
  });

  describe('QC Dataset Validation', () => {
    const qcPath = path.join(__dirname, 'ftrack-qc-data.json');
    const qcData = JSON.parse(fs.readFileSync(qcPath, 'utf8'));

    expectedOutputs.scenarios.forEach((expectedScenario) => {
      describe(`Scenario ${expectedScenario.id}: ${expectedScenario.name}`, () => {
        const scenario = qcData.scenarios.find(s => s.id === expectedScenario.id);
        
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
          
          const tolerance = expected.tolerance || 0.01;
          assert.ok(
            Math.abs(actual.balance - expected.balance) <= tolerance,
            `First projection balance: expected ${expected.balance} ± ${tolerance}, got ${actual.balance}`
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
          
          const tolerance = expected.tolerance || 0.01;
          assert.ok(
            Math.abs(actual.balance - expected.balance) <= tolerance,
            `Last projection balance: expected ${expected.balance} ± ${tolerance}, got ${actual.balance}`
          );
        });
      });
    });
  });
});
