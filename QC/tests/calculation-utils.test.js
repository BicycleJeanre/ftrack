const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const { expandRecurrenceForCalculation, getExpectedOutputs, getLookupData, loadCoreModules, roundToCents } = require('./helpers');

const expectedOutputs = getExpectedOutputs();
const lookupData = getLookupData();
let calculationUtils;
let dateUtils;
let periodicChangeUtils;

before(async () => {
  ({ calculationUtils, dateUtils, periodicChangeUtils } = await loadCoreModules());
});

describe('Calculation Utils - Periodic Change', () => {
  it('should return principal when no periodic change', () => {
    const result = calculationUtils.calculatePeriodicChange(10000, null, 1);
    assert.strictEqual(result, 10000);
  });

  expectedOutputs.functionTests.periodicChange.forEach((testCase) => {
    it(testCase.description, () => {
      const expandedPeriodicChange = testCase.periodicChange
        ? periodicChangeUtils.expandPeriodicChangeForCalculation(testCase.periodicChange, lookupData)
        : null;

      const result = calculationUtils.calculatePeriodicChange(
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

describe('Calculation Utils - Recurrence Dates', () => {
  expectedOutputs.functionTests.recurrenceDates.forEach((testCase) => {
    it(testCase.description, () => {
      const projectionStart = dateUtils.parseDateOnly(testCase.projectionStart);
      const projectionEnd = dateUtils.parseDateOnly(testCase.projectionEnd);

      const expandedRecurrence = expandRecurrenceForCalculation(testCase.recurrence);

      const dates = calculationUtils.generateRecurrenceDates(
        expandedRecurrence,
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
      recurrenceType: 1,  // One Time
      startDate: '2026-05-01',
      endDate: null,
      interval: null,
      dayOfWeek: null,
      dayOfMonth: null,
      weekOfMonth: null,
      dayOfWeekInMonth: null,
      dayOfQuarter: null,
      month: null,
      dayOfYear: null,
      customDates: null,
      id: null
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
