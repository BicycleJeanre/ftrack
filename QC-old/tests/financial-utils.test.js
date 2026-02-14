const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const { getExpectedOutputs, getLookupData, loadCoreModules, roundToCents } = require('./helpers');

const expectedOutputs = getExpectedOutputs();
const lookupData = getLookupData();
let financialUtils;
let periodicChangeUtils;

before(async () => {
  ({ financialUtils, periodicChangeUtils } = await loadCoreModules());
});

describe('Financial Utils - Apply Periodic Change (Accounts)', () => {
  expectedOutputs.functionTests.applyPeriodicChangeAccounts.forEach((testCase) => {
    it(testCase.description, () => {
      const expandedPeriodicChange = testCase.periodicChange
        ? periodicChangeUtils.expandPeriodicChangeForCalculation(testCase.periodicChange, lookupData)
        : null;

      const result = financialUtils.applyPeriodicChange(
        testCase.principal,
        expandedPeriodicChange,
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
      const expandedPeriodicChange = testCase.periodicChange
        ? periodicChangeUtils.expandPeriodicChangeForCalculation(testCase.periodicChange, lookupData)
        : null;

      const result = financialUtils.applyPeriodicChange(
        testCase.principal,
        expandedPeriodicChange,
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
