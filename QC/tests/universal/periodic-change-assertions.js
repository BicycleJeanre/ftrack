function pushMismatch(mismatches, check, details) {
  mismatches.push({ check, ...details });
}

function runPeriodicChangeAssertions({ scenarios }) {
  const mismatches = [];
  const allowedChangeModes = new Set([1, 2]);
  const allowedChangeTypes = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
  const allowedPeriods = new Set([1, 2, 3, 4, 5]);

  const accountPeriodicChanges = (scenarios || []).flatMap((scenario) =>
    (scenario.accounts || [])
      .filter((account) => account.periodicChange)
      .map((account) => ({ scope: 'account', scenarioId: scenario.id, scenarioName: scenario.name, objectId: account.id, periodicChange: account.periodicChange }))
  );

  const transactionPeriodicChanges = (scenarios || []).flatMap((scenario) =>
    (scenario.transactions || [])
      .filter((tx) => tx.periodicChange)
      .map((tx) => ({ scope: 'transaction', scenarioId: scenario.id, scenarioName: scenario.name, objectId: tx.id, periodicChange: tx.periodicChange }))
  );

  const allPeriodicChanges = [...accountPeriodicChanges, ...transactionPeriodicChanges];

  allPeriodicChanges.forEach(({ scope, scenarioId, scenarioName, objectId, periodicChange }) => {
    const mode = periodicChange.changeMode;
    const type = periodicChange.changeType;

    if (!allowedChangeModes.has(mode)) {
      pushMismatch(mismatches, 'change-mode-valid', {
        scope,
        scenarioId,
        scenarioName,
        objectId,
        expected: 'changeMode in [1,2]',
        actual: mode
      });
    }

    if (typeof periodicChange.value !== 'number') {
      pushMismatch(mismatches, 'change-value-numeric', {
        scope,
        scenarioId,
        scenarioName,
        objectId,
        expected: 'numeric value',
        actual: periodicChange.value
      });
    }

    if (mode === 1) {
      if (!allowedChangeTypes.has(type)) {
        pushMismatch(mismatches, 'percentage-change-type-valid', {
          scope,
          scenarioId,
          scenarioName,
          objectId,
          expected: 'changeType in [1..8]',
          actual: type
        });
      }
      if (type === 7) {
        const cc = periodicChange.customCompounding;
        if (!cc || typeof cc !== 'object') {
          pushMismatch(mismatches, 'custom-compounding-required', {
            scope,
            scenarioId,
            scenarioName,
            objectId,
            message: 'customCompounding object required when changeType=7'
          });
        } else {
          if (!allowedPeriods.has(cc.period)) {
            pushMismatch(mismatches, 'custom-compounding-period-valid', {
              scope,
              scenarioId,
              scenarioName,
              objectId,
              expected: 'customCompounding.period in [1..5]',
              actual: cc.period
            });
          }
          if (typeof cc.frequency !== 'number' || cc.frequency <= 0) {
            pushMismatch(mismatches, 'custom-compounding-frequency-valid', {
              scope,
              scenarioId,
              scenarioName,
              objectId,
              expected: 'customCompounding.frequency > 0',
              actual: cc.frequency
            });
          }
        }
      }
    }

    if (mode === 2 && !allowedPeriods.has(periodicChange.period)) {
      pushMismatch(mismatches, 'fixed-period-valid', {
        scope,
        scenarioId,
        scenarioName,
        objectId,
        expected: 'period in [1..5]',
        actual: periodicChange.period
      });
    }
  });

  return {
    name: 'periodic-change-assertions',
    passed: mismatches.length === 0,
    checkCount: allPeriodicChanges.length,
    mismatchCount: mismatches.length,
    mismatches
  };
}

module.exports = {
  runPeriodicChangeAssertions
};
