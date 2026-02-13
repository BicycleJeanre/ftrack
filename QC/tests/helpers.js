const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const qcRoot = path.resolve(__dirname, '..');

const expectedOutputsPath = path.join(qcRoot, 'expected-outputs.json');
const qcDataPath = path.join(qcRoot, 'ftrack-qc-data.json');
const lookupDataPath = path.join(repoRoot, 'assets', 'lookup-data.json');

let expectedOutputsCache;
let qcDataCache;
let lookupDataCache;
let moduleCache;

function getExpectedOutputs() {
  if (!expectedOutputsCache) {
    expectedOutputsCache = JSON.parse(fs.readFileSync(expectedOutputsPath, 'utf8'));
  }
  return expectedOutputsCache;
}

function getQcData() {
  if (!qcDataCache) {
    qcDataCache = JSON.parse(fs.readFileSync(qcDataPath, 'utf8'));
  }
  return qcDataCache;
}

function getLookupData() {
  if (!lookupDataCache) {
    lookupDataCache = JSON.parse(fs.readFileSync(lookupDataPath, 'utf8'));
  }
  return lookupDataCache;
}

function moduleUrl(modulePath) {
  return new URL(`file://${path.resolve(repoRoot, modulePath)}`);
}

async function loadCoreModules() {
  if (!moduleCache) {
    moduleCache = {
      calculationUtils: await import(moduleUrl('js/calculation-utils.js').href),
      dateUtils: await import(moduleUrl('js/date-utils.js').href),
      periodicChangeUtils: await import(moduleUrl('js/periodic-change-utils.js').href),
      recurrenceUtils: await import(moduleUrl('js/recurrence-utils.js').href),
      financialUtils: await import(moduleUrl('js/financial-utils.js').href),
      projectionEngine: await import(moduleUrl('js/projection-engine.js').href),
      transactionExpander: await import(moduleUrl('js/transaction-expander.js').href),
      goalCalculationUtils: await import(moduleUrl('js/goal-calculation-utils.js').href),
      advancedGoalSolver: await import(moduleUrl('js/advanced-goal-solver.js').href)
    };
  }

  return moduleCache;
}

function roundToCents(value) {
  return Math.round(value * 100) / 100;
}

const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;

function toPeriodicChangeIds(periodicChange) {
  if (!periodicChange) return null;

  const result = {
    value: periodicChange.value,
    changeMode: periodicChange.changeMode?.id ?? periodicChange.changeMode,
    changeType: periodicChange.changeType?.id ?? periodicChange.changeType
  };

  if (periodicChange.frequency) {
    result.frequency = periodicChange.frequency?.id ?? periodicChange.frequency;
  }

  if (periodicChange.ratePeriod) {
    result.ratePeriod = periodicChange.ratePeriod?.id ?? periodicChange.ratePeriod;
  }

  if (periodicChange.customCompounding) {
    result.customCompounding = {
      period: periodicChange.customCompounding.period,
      frequency: periodicChange.customCompounding.frequency
    };
  }

  return result;
}

const RECURRENCE_TYPE_NAMES = {
  1: 'One Time',
  2: 'Daily',
  3: 'Weekly',
  4: 'Monthly - Day of Month',
  5: 'Monthly - Week of Month',
  6: 'Quarterly',
  7: 'Yearly',
  8: 'Monthly',
  11: 'Custom Dates'
};

function expandRecurrenceForCalculation(recurrence) {
  if (!recurrence || !recurrence.recurrenceType) return null;

  // If recurrenceType is already an object, return as-is (already expanded)
  if (typeof recurrence.recurrenceType === 'object') {
    return recurrence;
  }

  const typeId = recurrence.recurrenceType;
  const typeName = RECURRENCE_TYPE_NAMES[typeId];

  if (!typeName) return null;

  return {
    ...recurrence,
    recurrenceType: {
      id: typeId,
      name: typeName
    },
    dayOfWeek: recurrence.dayOfWeek && typeof recurrence.dayOfWeek === 'number' 
      ? { id: recurrence.dayOfWeek } 
      : recurrence.dayOfWeek,
    weekOfMonth: recurrence.weekOfMonth && typeof recurrence.weekOfMonth === 'number'
      ? { id: recurrence.weekOfMonth }
      : recurrence.weekOfMonth,
    dayOfWeekInMonth: recurrence.dayOfWeekInMonth && typeof recurrence.dayOfWeekInMonth === 'number'
      ? { id: recurrence.dayOfWeekInMonth }
      : recurrence.dayOfWeekInMonth,
    month: recurrence.month && typeof recurrence.month === 'number'
      ? { id: recurrence.month }
      : recurrence.month
  };
}

function buildScenario({
  startDate,
  endDate,
  projectionPeriodName = 'Month',
  accounts = [],
  transactions = []
}) {
  return {
    id: 999,
    name: 'QC Integration Scenario',
    type: 2,  // General
    description: 'QC projection engine integration checks',
    startDate,
    endDate,
    projectionPeriod: 3,  // Monthly
    accounts,
    transactions,
    projections: [],
    budgets: []
  };
}

function getAccountProjections(projections, accountId) {
  return projections.filter((projection) => projection.accountId === accountId);
}

function setupGoalSolverEnv() {
  const originalFetch = globalThis.fetch;
  const originalSolver = globalThis.solver;

  globalThis.solver = require('javascript-lp-solver');
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (url.includes('lookup-data.json')) {
      const raw = fs.readFileSync(lookupDataPath, 'utf8');
      return { text: async () => raw };
    }
    throw new Error(`QC fetch stub only supports lookup-data.json: ${url}`);
  };

  return () => {
    globalThis.fetch = originalFetch;
    globalThis.solver = originalSolver;
  };
}

module.exports = {
  MS_PER_YEAR,
  buildScenario,
  expandRecurrenceForCalculation,
  getAccountProjections,
  getExpectedOutputs,
  getLookupData,
  getQcData,
  loadCoreModules,
  roundToCents,
  setupGoalSolverEnv,
  toPeriodicChangeIds
};
