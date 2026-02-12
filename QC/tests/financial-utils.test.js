const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const { getExpectedOutputs, loadCoreModules, roundToCents } = require('./helpers');

const expectedOutputs = getExpectedOutputs();
let financialUtils;

before(async () => {
  ({ financialUtils } = await loadCoreModules());
});

describe('Financial Utils - Apply Periodic Change (Accounts)', () => {
  expectedOutputs.functionTests.applyPeriodicChangeAccounts.forEach((testCase) => {
    it(testCase.description, () => {
      const result = financialUtils.applyPeriodicChange(
        testCase.principal,
        testCase.periodicChange,
        testCase.periods
      );

      assert.strictEqual(
        roundToCents(result),
        testCase.expected,
        `Expected ${testCase.expected}, got ${roundToCents(result)}`
      );
    });
  });
});

describe('Financial Utils - Apply Periodic Change (Transactions)', () => {
  expectedOutputs.functionTests.applyPeriodicChangeTransactions.forEach((testCase) => {
    it(testCase.description, () => {
      const result = financialUtils.applyPeriodicChange(
        testCase.principal,
        testCase.periodicChange,
        testCase.periods
      );

      assert.strictEqual(
        roundToCents(result),
        testCase.expected,
        `Expected ${testCase.expected}, got ${roundToCents(result)}`
      );
    });
  });
});
