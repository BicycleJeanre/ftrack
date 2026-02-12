const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const { getExpectedOutputs, loadCoreModules, roundToCents } = require('./helpers');

const expectedOutputs = getExpectedOutputs();
let calculationUtils;
let dateUtils;

before(async () => {
  ({ calculationUtils, dateUtils } = await loadCoreModules());
});

describe('Calculation Utils - Periodic Change', () => {
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

      assert.strictEqual(
        roundToCents(result),
        testCase.expected,
        `Expected ${testCase.expected}, got ${roundToCents(result)}`
      );
    });
  });
});

describe('Calculation Utils - Recurrence Dates', () => {
  expectedOutputs.functionTests.recurrenceDates.forEach((testCase) => {
    it(testCase.description, () => {
      const projectionStart = dateUtils.parseDateOnly(testCase.projectionStart);
      const projectionEnd = dateUtils.parseDateOnly(testCase.projectionEnd);

      const dates = calculationUtils.generateRecurrenceDates(
        testCase.recurrence,
        projectionStart,
        projectionEnd
      );

      assert.strictEqual(
        dates.length,
        testCase.expectedCount,
        `Expected ${testCase.expectedCount} dates, got ${dates.length}`
      );

      if (testCase.expectedFirstDate) {
        const firstDate = dateUtils.formatDateOnly(dates[0]);
        assert.strictEqual(
          firstDate,
          testCase.expectedFirstDate,
          `Expected first date ${testCase.expectedFirstDate}, got ${firstDate}`
        );
      }

      if (testCase.expectedLastDate) {
        const lastDate = dateUtils.formatDateOnly(dates[dates.length - 1]);
        assert.strictEqual(
          lastDate,
          testCase.expectedLastDate,
          `Expected last date ${testCase.expectedLastDate}, got ${lastDate}`
        );
      }
    });
  });

  it('excludes one-time recurrence outside projection range', () => {
    const recurrence = {
      recurrenceType: { id: 1, name: 'One Time' },
      startDate: '2026-05-01'
    };
    const projectionStart = dateUtils.parseDateOnly('2026-06-01');
    const projectionEnd = dateUtils.parseDateOnly('2026-06-30');
    const dates = calculationUtils.generateRecurrenceDates(recurrence, projectionStart, projectionEnd);
    assert.strictEqual(dates.length, 0, 'Expected zero occurrences outside projection range');
  });
});

describe('Calculation Utils - getNthWeekdayOfMonth', () => {
  expectedOutputs.functionTests.getNthWeekdayOfMonth.forEach((testCase) => {
    it(testCase.description, () => {
      const date = dateUtils.parseDateOnly(testCase.date);
      const result = calculationUtils.getNthWeekdayOfMonth(
        date,
        testCase.weekday,
        testCase.n
      );

      const resultStr = dateUtils.formatDateOnly(result);
      assert.strictEqual(
        resultStr,
        testCase.expected,
        `Expected ${testCase.expected}, got ${resultStr}`
      );
    });
  });
});
