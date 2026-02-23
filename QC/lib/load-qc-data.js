const fs = require('fs');
const path = require('path');

const DEFAULT_PATHS = {
  qcInput: path.join('QC', 'qc-input-data.json'),
  qcExpected: path.join('QC', 'qc-expected-outputs.json'),
  useCaseMapping: path.join('QC', 'mappings', 'use-case-to-scenario-type.json')
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
  if (!data.scenarioTypeMappings || typeof data.scenarioTypeMappings !== 'object') {
    throw new Error(`Invalid use-case mapping file at ${customPath}: missing scenarioTypeMappings`);
  }
  return data;
}

function getScenariosByType(qcInputData, scenarioTypeName, useCaseMapping = null) {
  const scenarios = qcInputData.scenarios || [];

  // Schema 43 datasets do not store type on scenarios.
  // Use the mapping file's explicit scenarioIds list instead.
  const mapping = useCaseMapping?.scenarioTypeMappings?.[scenarioTypeName] || null;
  const ids = Array.isArray(mapping?.scenarioIds) ? mapping.scenarioIds : [];
  if (ids.length === 0) {
    throw new Error(
      `QC dataset scenarios do not include a mapping for "${scenarioTypeName}" in the use-case mapping file. Expected: useCaseMapping.scenarioTypeMappings["${scenarioTypeName}"].scenarioIds`
    );
  }

  const wanted = new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)));
  return scenarios.filter((scenario) => wanted.has(Number(scenario?.id)));
}

function getMappedUseCasesForScenarioType(useCaseMapping, scenarioTypeName) {
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
  getExpectedScenarioAssertion,
  getExpectedUseCaseAssertion,
  getMappedUseCasesForScenarioType,
  getScenariosByType,
  loadAllQcData,
  loadQcExpectedOutputs,
  loadQcInputData,
  loadUseCaseMapping,
  readJsonAt,
  resolveRepoPath
};
