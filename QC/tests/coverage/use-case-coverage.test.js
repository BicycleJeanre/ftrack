const fs = require('fs');
const path = require('path');

const mapping = require('../../mappings/use-case-to-workflow.json');
const expected = require('../../qc-expected-outputs.json');
const input = require('../../qc-input-data.json');

function fail(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function uniq(values) {
  return Array.from(new Set(values));
}

function workflowScenarioIds(useCaseId) {
  return uniq(
    Object.values(mapping.workflowMappings || {})
      .filter((workflow) => (workflow.useCases || []).includes(useCaseId))
      .flatMap((workflow) => workflow.scenarioIds || [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
  );
}

function collectExactMatches(value, needle, pathName = '$', matches = []) {
  if (typeof value === 'string') {
    const escapedNeedle = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const useCasePattern = new RegExp(`(^|[^A-Z0-9-])${escapedNeedle}([^A-Z0-9-]|$)`);
    if (useCasePattern.test(value)) {
      matches.push(pathName);
    }
    return matches;
  }

  if (value === needle) {
    matches.push(pathName);
    return matches;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectExactMatches(item, needle, `${pathName}[${index}]`, matches));
    return matches;
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => collectExactMatches(item, needle, `${pathName}.${key}`, matches));
  }

  return matches;
}

function assertNoItems(label, items) {
  if (items.length > 0) {
    fail(`${label}: ${items.join(', ')}`, { [label]: items });
  }
}

function buildCoverageRows() {
  const repoRoot = process.cwd();
  const useCaseIds = Object.keys(mapping.useCaseDetails || {}).sort();
  const trackerByUseCase = new Map((expected.useCaseAssertionTracker || []).map((row) => [row.useCaseId, row]));
  const expectedUseCaseById = new Map((expected.assertions?.useCases || []).map((row) => [row.useCaseId, row]));
  const expectedScenarioIds = new Set((expected.assertions?.scenarios || []).map((row) => Number(row.scenarioId)));
  const inputScenarioIds = new Set((input.scenarios || []).map((row) => Number(row.id)));

  return useCaseIds.map((useCaseId) => {
    const detail = mapping.useCaseDetails[useCaseId];
    const scenarioIds = workflowScenarioIds(useCaseId);
    const inputMatches = collectExactMatches(input, useCaseId);
    const tracker = trackerByUseCase.get(useCaseId) || null;
    const expectedUseCase = expectedUseCaseById.get(useCaseId) || null;
    const workflows = detail.workflow || [];
    const workflowTestFiles = workflows.map((workflowName) => mapping.workflowMappings?.[workflowName]?.testFile).filter(Boolean);

    return {
      useCaseId,
      category: detail.category,
      workflows,
      workflowTestFiles,
      workflowTestsExist: workflowTestFiles.every((file) => fs.existsSync(path.resolve(repoRoot, file))),
      scenarioIds,
      scenariosExist: scenarioIds.every((id) => inputScenarioIds.has(id)),
      scenariosHaveExpectedAssertions: scenarioIds.every((id) => expectedScenarioIds.has(id)),
      hasExpectedUseCaseAssertion: Boolean(expectedUseCase),
      hasTracker: Boolean(tracker),
      trackerStatus: tracker?.assertionStatus || null,
      trackerAssertionType: tracker?.assertionType || null,
      inputMatchCount: inputMatches.length
    };
  });
}

function runUseCaseCoverageTest() {
  const rows = buildCoverageRows();
  const mappingUseCases = Object.keys(mapping.useCaseDetails || {}).sort();
  const trackerUseCases = (expected.useCaseAssertionTracker || []).map((row) => row.useCaseId).sort();
  const expectedSummaryUseCases = (expected.assertions?.useCases || []).map((row) => row.useCaseId).sort();

  assertNoItems(
    'Use cases missing from expected-output tracker',
    mappingUseCases.filter((id) => !trackerUseCases.includes(id))
  );
  assertNoItems(
    'Tracker rows missing from use-case mapping',
    trackerUseCases.filter((id) => !mappingUseCases.includes(id))
  );

  const missingWorkflowTests = rows
    .filter((row) => !row.workflowTestsExist)
    .map((row) => `${row.useCaseId} (${row.workflowTestFiles.join(', ') || 'no test file mapped'})`);
  assertNoItems('Use cases with missing workflow test files', missingWorkflowTests);

  const missingInputScenarios = rows
    .filter((row) => !row.scenariosExist)
    .map((row) => `${row.useCaseId} (${row.scenarioIds.join(', ') || 'no scenarios mapped'})`);
  assertNoItems('Use cases with missing mapped QC input scenarios', missingInputScenarios);

  const missingScenarioAssertions = rows
    .filter((row) => !row.scenariosHaveExpectedAssertions)
    .map((row) => `${row.useCaseId} (${row.scenarioIds.join(', ') || 'no scenarios mapped'})`);
  assertNoItems('Use cases with mapped scenarios missing expected scenario assertions', missingScenarioAssertions);

  const uncoveredTrackerRows = rows
    .filter((row) => row.trackerStatus !== 'covered')
    .map((row) => `${row.useCaseId} (${row.trackerStatus || 'missing'})`);
  assertNoItems('Use cases not marked covered in expected-output tracker', uncoveredTrackerRows);

  const missingInputReferences = rows
    .filter((row) => row.inputMatchCount === 0 && row.category !== 'Summary')
    .map((row) => row.useCaseId);
  assertNoItems('Non-summary use cases missing explicit references in QC input data', missingInputReferences);

  const summaryUseCases = rows.filter((row) => row.category === 'Summary').map((row) => row.useCaseId);
  assertNoItems(
    'Summary use cases missing direct expected assertions',
    summaryUseCases.filter((id) => !expectedSummaryUseCases.includes(id))
  );

  const output = {
    passed: true,
    checkedUseCaseCount: rows.length,
    directExpectedUseCaseAssertionCount: expectedSummaryUseCases.length,
    workflowCount: Object.keys(mapping.workflowMappings || {}).length,
    coverage: rows.map((row) => ({
      useCaseId: row.useCaseId,
      category: row.category,
      workflows: row.workflows,
      scenarioIds: row.scenarioIds,
      assertionType: row.hasExpectedUseCaseAssertion ? 'direct-use-case' : row.trackerAssertionType
    }))
  };

  console.log(JSON.stringify(output, null, 2));
  return output;
}

if (require.main === module) {
  try {
    runUseCaseCoverageTest();
  } catch (error) {
    console.error('[QC][Use Case Coverage] Fatal error:', error.message);
    if (error.details) {
      console.error(JSON.stringify(error.details, null, 2));
    }
    process.exit(1);
  }
}

module.exports = {
  buildCoverageRows,
  runUseCaseCoverageTest
};
