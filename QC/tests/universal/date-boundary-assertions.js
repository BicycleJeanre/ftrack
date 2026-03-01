function pushMismatch(mismatches, check, details) {
  mismatches.push({ check, ...details });
}

function toDate(value) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

function runDateBoundaryAssertions({ scenarios }) {
  const mismatches = [];
  const allScenarios = scenarios || [];

  allScenarios.forEach((scenario) => {
    const projectionConfig = scenario?.projection?.config || {};
    const windowStart = projectionConfig.startDate;
    const windowEnd = projectionConfig.endDate;

    const start = toDate(windowStart);
    const end = toDate(windowEnd);

    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      pushMismatch(mismatches, 'scenario-date-valid', {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        message: 'Invalid scenario startDate or endDate'
      });
      return;
    }

    if (start > end) {
      pushMismatch(mismatches, 'scenario-date-order', {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        expected: 'startDate <= endDate',
        actual: `${windowStart} > ${windowEnd}`
      });
    }

    (scenario.transactions || []).forEach((tx) => {
      const recurrence = tx.recurrence;
      if (!recurrence) return;

      const recurrenceStart = toDate(recurrence.startDate);

      if (recurrence.recurrenceType !== 8 && recurrenceStart && recurrenceStart > end) {
        pushMismatch(mismatches, 'recurrence-start-inside-window', {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          transactionId: tx.id,
          expected: `recurrence.startDate <= ${windowEnd}`,
          actual: recurrence.startDate
        });
      }

      if (recurrence.recurrenceType === 4 && recurrence.dayOfMonth === 31) {
        if (recurrenceStart && recurrenceStart.getDate() !== 31) {
          pushMismatch(mismatches, 'month-end-day-alignment', {
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            transactionId: tx.id,
            expected: 'startDate day aligns with month-end recurrence intent',
            actual: recurrence.startDate
          });
        }
      }

      if (recurrence.recurrenceType === 7 && recurrence.month === 2 && recurrence.dayOfYear === 60) {
        const startYear = recurrenceStart ? recurrenceStart.getFullYear() : null;
        if (startYear && startYear % 4 !== 0) {
          pushMismatch(mismatches, 'leap-year-compatibility', {
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            transactionId: tx.id,
            expected: 'Leap-year aligned start year for dayOfYear=60 in February',
            actual: startYear
          });
        }
      }

      if (recurrence.recurrenceType === 1 && recurrence.startDate) {
        const oneTimeDate = toDate(recurrence.startDate);
        if (oneTimeDate && (oneTimeDate < start || oneTimeDate > end)) {
          pushMismatch(mismatches, 'one-time-inside-window', {
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            transactionId: tx.id,
            expected: `${windowStart} <= one-time date <= ${windowEnd}`,
            actual: recurrence.startDate
          });
        }
      }
    });
  });

  const checkCount = allScenarios.reduce(
    (sum, scenario) => sum + 1 + (scenario.transactions || []).length,
    0
  );

  return {
    name: 'date-boundary-assertions',
    passed: mismatches.length === 0,
    checkCount,
    mismatchCount: mismatches.length,
    mismatches
  };
}

module.exports = {
  runDateBoundaryAssertions
};
