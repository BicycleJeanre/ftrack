const fs = require('fs');
const path = require('path');

const DEFAULT_PATHS = {
  qcInput: path.join('QC', 'qc-input-data.json'),
  qcExpected: path.join('QC', 'qc-expected-outputs.json'),
  useCaseMapping: path.join('QC', 'mappings', 'use-case-to-scenario-type.json')
};

const SCENARIO_TYPE_ID_TO_NAME = {
  1: 'Budget',
  2: 'General',
  3: 'Funds',
  4: 'Debt Repayment',
  5: 'Goal-Based',
  6: 'Advanced Goal Solver'
};

function resolveRepoPath(relativePath) {
  return path.resolve(process.cwd(), relativePath);
}

function readJsonAt(relativePath) {
  const absolutePath = resolveRepoPath(relativePath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  return JSON.parse(raw);
}

function assertScenarioTypeSupported(scenarioTypeName) {
  const supported = new Set(Object.values(SCENARIO_TYPE_ID_TO_NAME));
  if (!supported.has(scenarioTypeName)) {
    throw new Error(
      `Unsupported scenario type "${scenarioTypeName}". Supported types: ${Array.from(supported).join(', ')}`
    );
  }
}

function getScenarioTypeName(scenario) {
  if (!scenario || typeof scenario.type !== 'number') return null;
  return SCENARIO_TYPE_ID_TO_NAME[scenario.type] || null;
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
  if (!data.scenarioTypeMappings || typeof data.scenarioTypeMappings !== 'object') {
    throw new Error(`Invalid use-case mapping file at ${customPath}: missing scenarioTypeMappings`);
  }
  return data;
}

function getScenariosByType(qcInputData, scenarioTypeName) {
  assertScenarioTypeSupported(scenarioTypeName);
  return (qcInputData.scenarios || []).filter((scenario) => getScenarioTypeName(scenario) === scenarioTypeName);
}

function getMappedUseCasesForScenarioType(useCaseMapping, scenarioTypeName) {
  assertScenarioTypeSupported(scenarioTypeName);
  const mapping = useCaseMapping.scenarioTypeMappings?.[scenarioTypeName];
  if (!mapping) return [];
  return Array.isArray(mapping.useCases) ? mapping.useCases : [];
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
  SCENARIO_TYPE_ID_TO_NAME,
  getExpectedScenarioAssertion,
  getExpectedUseCaseAssertion,
  getMappedUseCasesForScenarioType,
  getScenariosByType,
  getScenarioTypeName,
  loadAllQcData,
  loadQcExpectedOutputs,
  loadQcInputData,
  loadUseCaseMapping,
  readJsonAt,
  resolveRepoPath,
  assertScenarioTypeSupported
};
