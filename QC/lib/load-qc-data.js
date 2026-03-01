const fs = require('fs');
const path = require('path');

const DEFAULT_PATHS = {
  qcInput: path.join('QC', 'qc-input-data.json'),
  qcExpected: path.join('QC', 'qc-expected-outputs.json'),
  useCaseMapping: path.join('QC', 'mappings', 'use-case-to-workflow.json')
};

function resolveRepoPath(relativePath) {
  return path.resolve(process.cwd(), relativePath);
}

function readJsonAt(relativePath) {
  const absolutePath = resolveRepoPath(relativePath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  return JSON.parse(raw);
}

function loadQcInputData(customPath = DEFAULT_PATHS.qcInput) {
  const data = readJsonAt(customPath);
  if (!Array.isArray(data.scenarios)) {
    throw new Error(`Invalid QC input file at ${customPath}: missing scenarios[]`);
  }
  return data;
}

function loadQcExpectedOutputs(customPath = DEFAULT_PATHS.qcExpected) {
  const data = readJsonAt(customPath);
  if (!data.assertions || !Array.isArray(data.assertions.scenarios)) {
    throw new Error(`Invalid QC expected file at ${customPath}: missing assertions.scenarios[]`);
  }
  return data;
}

function loadUseCaseMapping(customPath = DEFAULT_PATHS.useCaseMapping) {
  const data = readJsonAt(customPath);
  if (!data.workflowMappings || typeof data.workflowMappings !== 'object') {
    throw new Error(`Invalid use-case mapping file at ${customPath}: missing workflowMappings`);
  }
  return data;
}

function getScenariosByWorkflow(qcInputData, workflowName, useCaseMapping = null) {
  const scenarios = qcInputData.scenarios || [];

  // Schema 43 datasets do not store workflow on scenarios.
  // Use the mapping file's explicit scenarioIds list instead.
  const mapping = useCaseMapping?.workflowMappings?.[workflowName] || null;
  const ids = Array.isArray(mapping?.scenarioIds) ? mapping.scenarioIds : [];
  if (ids.length === 0) {
    throw new Error(
      `QC dataset scenarios do not include a mapping for workflow "${workflowName}" in the use-case mapping file. Expected: useCaseMapping.workflowMappings["${workflowName}"].scenarioIds`
    );
  }

  const wanted = new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)));
  return scenarios.filter((scenario) => wanted.has(Number(scenario?.id)));
}

// Deprecated: use getScenariosByWorkflow instead
function getScenariosByType(qcInputData, scenarioTypeName, useCaseMapping = null) {
  return getScenariosByWorkflow(qcInputData, scenarioTypeName, useCaseMapping);
}

function getMappedUseCasesForWorkflow(useCaseMapping, workflowName) {
  const mapping = useCaseMapping.workflowMappings?.[workflowName];
  if (!mapping) return [];
  return Array.isArray(mapping.useCases) ? mapping.useCases : [];
}

// Deprecated: use getMappedUseCasesForWorkflow instead
function getMappedUseCasesForScenarioType(useCaseMapping, scenarioTypeName) {
  return getMappedUseCasesForWorkflow(useCaseMapping, scenarioTypeName);
}

function getExpectedScenarioAssertion(qcExpectedData, scenarioId) {
  return (qcExpectedData.assertions?.scenarios || []).find((item) => item.scenarioId === scenarioId) || null;
}

function getExpectedUseCaseAssertion(qcExpectedData, useCaseId) {
  return (qcExpectedData.assertions?.useCases || []).find((item) => item.useCaseId === useCaseId) || null;
}

function loadAllQcData(paths = {}) {
  const qcInput = loadQcInputData(paths.qcInput || DEFAULT_PATHS.qcInput);
  const qcExpected = loadQcExpectedOutputs(paths.qcExpected || DEFAULT_PATHS.qcExpected);
  const useCaseMapping = loadUseCaseMapping(paths.useCaseMapping || DEFAULT_PATHS.useCaseMapping);

  return {
    qcInput,
    qcExpected,
    useCaseMapping,
    paths: {
      qcInput: paths.qcInput || DEFAULT_PATHS.qcInput,
      qcExpected: paths.qcExpected || DEFAULT_PATHS.qcExpected,
      useCaseMapping: paths.useCaseMapping || DEFAULT_PATHS.useCaseMapping
    }
  };
}

module.exports = {
  DEFAULT_PATHS,
  getExpectedScenarioAssertion,
  getExpectedUseCaseAssertion,
  getMappedUseCasesForWorkflow,
  getMappedUseCasesForScenarioType, // Deprecated - use getMappedUseCasesForWorkflow
  getScenariosByWorkflow,
  getScenariosByType, // Deprecated - use getScenariosByWorkflow
  loadAllQcData,
  loadQcExpectedOutputs,
  loadQcInputData,
  loadUseCaseMapping,
  readJsonAt,
  resolveRepoPath
};
