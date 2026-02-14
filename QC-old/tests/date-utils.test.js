const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const { getExpectedOutputs, loadCoreModules } = require('./helpers');

const expectedOutputs = getExpectedOutputs();
let dateUtils;

before(async () => {
  ({ dateUtils } = await loadCoreModules());
});

describe('Date Utils', () => {
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
