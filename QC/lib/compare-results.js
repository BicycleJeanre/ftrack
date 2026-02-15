function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function compareNumber(expected, actual, tolerance) {
  return Math.abs(Number(expected) - Number(actual)) <= tolerance;
}

function compareValues(expected, actual, options = {}, path = '') {
  const tolerance = options.tolerance ?? 0.01;
  const mismatches = [];

  if (typeof expected === 'number') {
    if (typeof actual !== 'number' || !compareNumber(expected, actual, tolerance)) {
      mismatches.push({ path, expected, actual, message: `Number mismatch (tolerance ${tolerance})` });
    }
    return mismatches;
  }

  if (typeof expected === 'string' || typeof expected === 'boolean' || expected === null) {
    if (expected !== actual) {
      mismatches.push({ path, expected, actual, message: 'Value mismatch' });
    }
    return mismatches;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      mismatches.push({ path, expectedType: 'array', actualType: typeof actual, message: 'Type mismatch' });
      return mismatches;
    }

    if (expected.length !== actual.length) {
      mismatches.push({
        path,
        expectedLength: expected.length,
        actualLength: actual.length,
        message: 'Array length mismatch'
      });
    }

    const min = Math.min(expected.length, actual.length);
    for (let i = 0; i < min; i += 1) {
      mismatches.push(...compareValues(expected[i], actual[i], options, `${path}[${i}]`));
    }

    return mismatches;
  }

  if (isPlainObject(expected)) {
    if (!isPlainObject(actual)) {
      mismatches.push({ path, expectedType: 'object', actualType: typeof actual, message: 'Type mismatch' });
      return mismatches;
    }

    for (const key of Object.keys(expected)) {
      const childPath = path ? `${path}.${key}` : key;
      mismatches.push(...compareValues(expected[key], actual[key], options, childPath));
    }

    return mismatches;
  }

  if (expected !== actual) {
    mismatches.push({ path, expected, actual, message: 'Unhandled value mismatch' });
  }

  return mismatches;
}

function indexBy(array, key) {
  const map = new Map();
  for (const item of array || []) {
    if (item && item[key] !== undefined) {
      map.set(item[key], item);
    }
  }
  return map;
}

function normalizeScenarioForComparison(actualScenario) {
  return {
    scenarioId: actualScenario.scenarioId,
    scenarioName: actualScenario.scenarioName,
    scenarioType: actualScenario.scenarioType,
    timeline: actualScenario.timeline,
    expectedTotals: {
      accountCount: actualScenario.totals?.accountCount,
      transactionCount: actualScenario.totals?.transactionCount,
      projectionCount: actualScenario.totals?.projectionCount,
      scenarioEndingBalanceTotal: round2(actualScenario.totals?.scenarioEndingBalanceTotal)
    },
    expectedEndingAccountBalances: (actualScenario.endingAccountBalances || []).map((row) => ({
      accountId: row.accountId,
      accountName: row.accountName,
      expectedEndingBalance: round2(row.endingBalance),
      lastProjectionDate: row.lastProjectionDate,
      projectionPoints: row.projectionPoints
    }))
  };
}

function compareScenarioAssertions(expectedScenarioAssertions, actualScenarios, options = {}) {
  const mismatches = [];
  const actualById = indexBy(actualScenarios, 'scenarioId');

  for (const expectedScenario of expectedScenarioAssertions || []) {
    const actualScenarioRaw = actualById.get(expectedScenario.scenarioId);

    if (!actualScenarioRaw) {
      mismatches.push({
        path: `scenario:${expectedScenario.scenarioId}`,
        expected: 'scenario present',
        actual: 'missing',
        message: 'Scenario actuals missing'
      });
      continue;
    }

    const actualScenario = normalizeScenarioForComparison(actualScenarioRaw);
    mismatches.push(...compareValues(expectedScenario, actualScenario, options, `scenario:${expectedScenario.scenarioId}`));
  }

  return mismatches;
}

function compareUseCaseAssertions(expectedUseCaseAssertions, actualUseCases, options = {}) {
  const mismatches = [];
  const actualById = new Map(Object.entries(actualUseCases || {}));

  for (const expectedUseCase of expectedUseCaseAssertions || []) {
    const actualPayload = actualById.get(expectedUseCase.useCaseId);

    if (!actualPayload) {
      mismatches.push({
        path: `useCase:${expectedUseCase.useCaseId}`,
        expected: 'use case present',
        actual: 'missing',
        message: 'Use case actuals missing'
      });
      continue;
    }

    const actualComparable = {
      useCaseId: expectedUseCase.useCaseId,
      assertionType: expectedUseCase.assertionType,
      sourceScenarioIds: expectedUseCase.sourceScenarioIds,
      expected: actualPayload
    };

    mismatches.push(...compareValues(expectedUseCase, actualComparable, options, `useCase:${expectedUseCase.useCaseId}`));
  }

  return mismatches;
}

function compareActualsToExpected({ expectedData, actualData, scenarioType, options = {} }) {
  const mappedUseCaseIds = new Set(actualData.useCaseIds || []);

  const expectedScenarioAssertions = (expectedData.assertions?.scenarios || []).filter((expectedScenario) =>
    actualData.scenarios.some((actualScenario) => actualScenario.scenarioId === expectedScenario.scenarioId)
  );

  const expectedUseCaseAssertions = (expectedData.assertions?.useCases || []).filter((expectedUseCase) =>
    mappedUseCaseIds.has(expectedUseCase.useCaseId)
  );

  const scenarioMismatches = compareScenarioAssertions(expectedScenarioAssertions, actualData.scenarios, options);
  const useCaseMismatches = compareUseCaseAssertions(expectedUseCaseAssertions, actualData.useCases, options);
  const mismatches = [...scenarioMismatches, ...useCaseMismatches];

  return {
    scenarioType,
    passed: mismatches.length === 0,
    mismatchCount: mismatches.length,
    checkedScenarioCount: expectedScenarioAssertions.length,
    checkedUseCaseCount: expectedUseCaseAssertions.length,
    mismatches
  };
}

module.exports = {
  compareValues,
  compareScenarioAssertions,
  compareUseCaseAssertions,
  compareActualsToExpected,
  normalizeScenarioForComparison,
  round2
};
