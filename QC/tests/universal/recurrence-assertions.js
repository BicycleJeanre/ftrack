function inRange(value, min, max) {
  return typeof value === 'number' && value >= min && value <= max;
}

function pushMismatch(mismatches, check, details) {
  mismatches.push({ check, ...details });
}

function runRecurrenceAssertions({ scenarios }) {
  const mismatches = [];
  const allowedTypes = new Set([1, 2, 3, 4, 5, 6, 7, 8]);

  const allTransactions = (scenarios || []).flatMap((scenario) =>
    (scenario.transactions || []).map((tx) => ({ scenarioId: scenario.id, scenarioName: scenario.name, tx }))
  );

  allTransactions.forEach(({ scenarioId, scenarioName, tx }) => {
    const recurrence = tx.recurrence;

    if (!recurrence) {
      pushMismatch(mismatches, 'recurrence-required', {
        scenarioId,
        scenarioName,
        transactionId: tx.id,
        message: 'Transaction is missing recurrence object'
      });
      return;
    }

    if (!allowedTypes.has(recurrence.recurrenceType)) {
      pushMismatch(mismatches, 'recurrence-type-valid', {
        scenarioId,
        scenarioName,
        transactionId: tx.id,
        expected: 'recurrenceType in [1..8]',
        actual: recurrence.recurrenceType
      });
    }

    if (recurrence.recurrenceType !== 8 && !recurrence.startDate) {
      pushMismatch(mismatches, 'recurrence-start-date-required', {
        scenarioId,
        scenarioName,
        transactionId: tx.id,
        message: 'startDate is required for non-custom recurrence'
      });
    }

    if (recurrence.recurrenceType === 2 && !inRange(recurrence.interval, 1, 366)) {
      pushMismatch(mismatches, 'daily-interval-valid', {
        scenarioId,
        scenarioName,
        transactionId: tx.id,
        expected: 'interval between 1 and 366',
        actual: recurrence.interval
      });
    }

    if (recurrence.recurrenceType === 3) {
      if (!inRange(recurrence.dayOfWeek, 0, 6)) {
        pushMismatch(mismatches, 'weekly-day-of-week-valid', {
          scenarioId,
          scenarioName,
          transactionId: tx.id,
          expected: 'dayOfWeek between 0 and 6',
          actual: recurrence.dayOfWeek
        });
      }
      if (!inRange(recurrence.interval, 1, 52)) {
        pushMismatch(mismatches, 'weekly-interval-valid', {
          scenarioId,
          scenarioName,
          transactionId: tx.id,
          expected: 'interval between 1 and 52',
          actual: recurrence.interval
        });
      }
    }

    if (recurrence.recurrenceType === 4 && !inRange(recurrence.dayOfMonth, 1, 31)) {
      pushMismatch(mismatches, 'monthly-day-of-month-valid', {
        scenarioId,
        scenarioName,
        transactionId: tx.id,
        expected: 'dayOfMonth between 1 and 31',
        actual: recurrence.dayOfMonth
      });
    }

    if (recurrence.recurrenceType === 5) {
      if (!inRange(recurrence.weekOfMonth, 1, 5)) {
        pushMismatch(mismatches, 'month-week-valid', {
          scenarioId,
          scenarioName,
          transactionId: tx.id,
          expected: 'weekOfMonth between 1 and 5',
          actual: recurrence.weekOfMonth
        });
      }
      if (!inRange(recurrence.dayOfWeekInMonth, 1, 7)) {
        pushMismatch(mismatches, 'day-of-week-in-month-valid', {
          scenarioId,
          scenarioName,
          transactionId: tx.id,
          expected: 'dayOfWeekInMonth between 1 and 7',
          actual: recurrence.dayOfWeekInMonth
        });
      }
    }

    if (recurrence.recurrenceType === 6 && !inRange(recurrence.dayOfQuarter, 1, 92)) {
      pushMismatch(mismatches, 'quarterly-day-valid', {
        scenarioId,
        scenarioName,
        transactionId: tx.id,
        expected: 'dayOfQuarter between 1 and 92',
        actual: recurrence.dayOfQuarter
      });
    }

    if (recurrence.recurrenceType === 7) {
      if (!inRange(recurrence.month, 1, 12)) {
        pushMismatch(mismatches, 'yearly-month-valid', {
          scenarioId,
          scenarioName,
          transactionId: tx.id,
          expected: 'month between 1 and 12',
          actual: recurrence.month
        });
      }
      if (!inRange(recurrence.dayOfYear, 1, 366)) {
        pushMismatch(mismatches, 'yearly-day-of-year-valid', {
          scenarioId,
          scenarioName,
          transactionId: tx.id,
          expected: 'dayOfYear between 1 and 366',
          actual: recurrence.dayOfYear
        });
      }
    }

    if (recurrence.recurrenceType === 8 && typeof recurrence.customDates !== 'string') {
      pushMismatch(mismatches, 'custom-dates-required', {
        scenarioId,
        scenarioName,
        transactionId: tx.id,
        expected: 'customDates as comma-separated string',
        actual: recurrence.customDates
      });
    }
  });

  return {
    name: 'recurrence-assertions',
    passed: mismatches.length === 0,
    checkCount: allTransactions.length,
    mismatchCount: mismatches.length,
    mismatches
  };
}

module.exports = {
  runRecurrenceAssertions
};
