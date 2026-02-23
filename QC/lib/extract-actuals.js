const path = require('path');
const { pathToFileURL } = require('url');

const {
  getMappedUseCasesForScenarioType,
  getScenariosByType
} = require('./load-qc-data');

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function statusName(tx) {
  return typeof tx?.status === 'object' ? tx.status?.name : tx?.status;
}

async function importModule(relativePathFromRepo) {
  const absolutePath = path.resolve(process.cwd(), relativePathFromRepo);
  return import(pathToFileURL(absolutePath).href);
}

async function loadCalculationModules() {
  const [
    projectionEngine,
    transactionExpander,
    dateUtils,
    calculationEngine,
    periodicChangeUtils
  ] = await Promise.all([
    importModule('js/domain/calculations/projection-engine.js'),
    importModule('js/domain/calculations/transaction-expander.js'),
    importModule('js/shared/date-utils.js'),
    importModule('js/domain/calculations/calculation-engine.js'),
    importModule('js/domain/calculations/periodic-change-utils.js')
  ]);

  return {
    generateProjectionsForScenario: projectionEngine.generateProjectionsForScenario,
    expandTransactions: transactionExpander.expandTransactions,
    parseDateOnly: dateUtils.parseDateOnly,
    calculatePeriodicChange: calculationEngine.calculatePeriodicChange,
    expandPeriodicChangeForCalculation: periodicChangeUtils.expandPeriodicChangeForCalculation
  };
}

function buildScenarioActuals(scenario, projections) {
  const projectionConfig = scenario?.projection?.config || {};
  const windowStart = projectionConfig.startDate;
  const windowEnd = projectionConfig.endDate;
  const projectionPeriod = projectionConfig.periodTypeId ?? 3;

  const endingAccountBalances = (scenario.accounts || []).map((account) => {
    const accountRows = projections.filter((row) => row.accountId === account.id);
    const last = accountRows[accountRows.length - 1] || null;

    return {
      accountId: account.id,
      accountName: account.name,
      endingBalance: last ? round2(last.balance) : round2(account.startingBalance || 0),
      lastProjectionDate: last ? last.date : windowEnd,
      projectionPoints: accountRows.length,
      accountType: account.type
    };
  });

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    timeline: {
      startDate: windowStart,
      endDate: windowEnd,
      projectionPeriod
    },
    totals: {
      accountCount: (scenario.accounts || []).length,
      transactionCount: (scenario.transactions || []).length,
      projectionCount: projections.length,
      scenarioEndingBalanceTotal: round2(endingAccountBalances.reduce((sum, row) => sum + row.endingBalance, 0))
    },
    endingAccountBalances,
    projections
  };
}

function buildOccurrencesForScenario(scenario, modules, lookupData) {
  const { expandTransactions, parseDateOnly, calculatePeriodicChange, expandPeriodicChangeForCalculation } = modules;

  const projectionConfig = scenario?.projection?.config || {};
  const windowStart = projectionConfig.startDate;
  const windowEnd = projectionConfig.endDate;

  const startDate = parseDateOnly(windowStart);
  const endDate = parseDateOnly(windowEnd);
  const plannedTransactions = (scenario.transactions || []).filter((tx) => statusName(tx) === 'planned');
  const expandedTransactions = expandTransactions(plannedTransactions, startDate, endDate, scenario.accounts || []);

  return expandedTransactions.map((tx) => {
    const occurrenceDate = tx._occurrenceDate || parseDateOnly(tx.effectiveDate);
    let occurrenceAmount = Math.abs(tx.amount || 0);

    if (tx.periodicChange) {
      const expandedPc = expandPeriodicChangeForCalculation(tx.periodicChange, lookupData);
      if (expandedPc) {
        const txStartDate = tx.recurrence?.startDate ? parseDateOnly(tx.recurrence.startDate) : startDate;
        const yearsDiff = (occurrenceDate - txStartDate) / (1000 * 60 * 60 * 24 * 365.25);
        occurrenceAmount = Math.abs(calculatePeriodicChange(tx.amount, expandedPc, yearsDiff));
      }
    }

    return {
      transactionId: tx.id,
      date: occurrenceDate,
      transactionTypeId: tx.transactionTypeId,
      amount: occurrenceAmount,
      primaryAccountId: tx.primaryAccountId,
      secondaryAccountId: tx.secondaryAccountId,
      tags: tx.tags || [],
      description: tx.description || ''
    };
  });
}

function sumByTransactionType(occurrences, transactionTypeId) {
  return round2(
    occurrences
      .filter((item) => item.transactionTypeId === transactionTypeId)
      .reduce((sum, item) => sum + item.amount, 0)
  );
}

function extractSummaryUseCases({
  allScenarioActualsById,
  allOccurrencesByScenarioId,
  allScenariosById,
  selectedUseCaseIds,
  expectedUseCaseAssertions
}) {
  const getSourceScenarioIds = (useCaseId) => {
    const assertion = (expectedUseCaseAssertions || []).find((item) => item.useCaseId === useCaseId);
    return Array.isArray(assertion?.sourceScenarioIds) ? assertion.sourceScenarioIds : [];
  };

  const getOccurrencesForUseCase = (useCaseId) =>
    getSourceScenarioIds(useCaseId).flatMap((scenarioId) => allOccurrencesByScenarioId.get(scenarioId) || []);

  const getScenarioActualsForUseCase = (useCaseId) =>
    getSourceScenarioIds(useCaseId)
      .map((scenarioId) => allScenarioActualsById.get(scenarioId))
      .filter(Boolean);

  const summaryActuals = {};

  if (selectedUseCaseIds.includes('UC-S1')) {
    const occurrences = getOccurrencesForUseCase('UC-S1');
    summaryActuals['UC-S1'] = {
      totalMoneyIn: sumByTransactionType(occurrences, 1)
    };
  }

  if (selectedUseCaseIds.includes('UC-S2')) {
    const occurrences = getOccurrencesForUseCase('UC-S2');
    summaryActuals['UC-S2'] = {
      totalMoneyOut: sumByTransactionType(occurrences, 2)
    };
  }

  if (selectedUseCaseIds.includes('UC-S3')) {
    const occurrencesIncome = getOccurrencesForUseCase('UC-S1');
    const occurrencesOutflow = getOccurrencesForUseCase('UC-S2');
    const income = summaryActuals['UC-S1']?.totalMoneyIn ?? sumByTransactionType(occurrencesIncome, 1);
    const outflow = summaryActuals['UC-S2']?.totalMoneyOut ?? sumByTransactionType(occurrencesOutflow, 2);
    summaryActuals['UC-S3'] = {
      netTotal: round2(income - outflow),
      formula: 'UC-S1.totalMoneyIn - UC-S2.totalMoneyOut'
    };
  }

  if (selectedUseCaseIds.includes('UC-S4')) {
    const scenarioActuals = getScenarioActualsForUseCase('UC-S4');
    const endingBalances = scenarioActuals.flatMap((scenario) =>
      scenario.endingAccountBalances.map((account) => ({
        scenarioId: scenario.scenarioId,
        accountId: account.accountId,
        accountName: account.accountName,
        endingBalance: account.endingBalance
      }))
    );

    summaryActuals['UC-S4'] = {
      source: 'assertions.scenarios[].expectedEndingAccountBalances',
      endingBalanceTotal: round2(endingBalances.reduce((sum, item) => sum + item.endingBalance, 0)),
      accountEndingBalances: endingBalances
    };
  }

  if (selectedUseCaseIds.includes('UC-S5')) {
    const scenarioActuals = getScenarioActualsForUseCase('UC-S5');
    const interestRows = scenarioActuals.flatMap((scenario) => scenario.projections || []);
    summaryActuals['UC-S5'] = {
      totalInterestEarned: round2(interestRows.reduce((sum, row) => sum + Math.max(0, Number(row.interest) || 0), 0)),
      totalInterestPaid: round2(interestRows.reduce((sum, row) => sum + Math.abs(Math.min(0, Number(row.interest) || 0)), 0))
    };
  }

  if (selectedUseCaseIds.includes('UC-S6')) {
    const occurrences = getOccurrencesForUseCase('UC-S6');
    const transferOccurrences = occurrences.filter((item) => item.tags.includes('UC-A5'));
    summaryActuals['UC-S6'] = {
      transferOccurrenceCount: transferOccurrences.length,
      netWorthDeltaFromTransfers: 0
    };
  }

  if (selectedUseCaseIds.includes('UC-S7')) {
    const debtScenarios = getScenarioActualsForUseCase('UC-S7');
    const debtOccurrences = debtScenarios.flatMap((item) => allOccurrencesByScenarioId.get(item.scenarioId) || []);
    const totalDebtPayments = round2(
      debtOccurrences
        .filter((o) => o.transactionTypeId === 2)
        .reduce((sum, o) => sum + o.amount, 0)
    );

    const endingDebtBalance = round2(
      debtScenarios
        .flatMap((s) => s.endingAccountBalances)
        .filter((a) => a.accountType === 2)
        .reduce((sum, a) => sum + a.endingBalance, 0)
    );

    summaryActuals['UC-S7'] = {
      totalDebtPayments,
      endingDebtBalance,
      payoffAchievedByEndDate: endingDebtBalance <= 0
    };
  }

  if (selectedUseCaseIds.includes('UC-S8')) {
    const fundsScenarios = getScenarioActualsForUseCase('UC-S8');

    const endingNav = round2(
      fundsScenarios
        .flatMap((s) => s.endingAccountBalances)
        .filter((a) => a.accountType === 1)
        .reduce((sum, a) => sum + a.endingBalance, 0)
    );

    summaryActuals['UC-S8'] = {
      endingNav,
      endingEquityBalance: round2(
        fundsScenarios
          .flatMap((s) => s.endingAccountBalances)
          .filter((a) => a.accountType === 3)
          .reduce((sum, a) => sum + a.endingBalance, 0)
      )
    };
  }

  if (selectedUseCaseIds.includes('UC-S9')) {
    const occurrences = getOccurrencesForUseCase('UC-S9');
    summaryActuals['UC-S9'] = {
      totalPlannedInflow: sumByTransactionType(occurrences, 1),
      totalPlannedOutflow: sumByTransactionType(occurrences, 2),
      plannedNet: round2(sumByTransactionType(occurrences, 1) - sumByTransactionType(occurrences, 2))
    };
  }

  if (selectedUseCaseIds.includes('UC-S10')) {
    const sourceScenarioIds = new Set(getSourceScenarioIds('UC-S10'));
    const consistencyRows = Array.from(sourceScenarioIds)
      .map((scenarioId) => allScenarioActualsById.get(scenarioId))
      .filter(Boolean)
      .map((scenario) => {
        const accountChecks = scenario.endingAccountBalances.map((account) => {
          const rows = scenario.projections.filter((p) => p.accountId === account.accountId);
          const sourceScenario = allScenariosById.get(scenario.scenarioId);
          const sourceAccount = (sourceScenario?.accounts || []).find((a) => a.id === account.accountId);
          const start = round2(sourceAccount?.startingBalance || 0);
          const end = round2(account.endingBalance);
          const netFromPeriods = round2(rows.reduce((sum, r) => sum + (Number(r.netChange) || 0), 0));
          const endMinusStart = round2(end - start);
          const deltaGap = round2(netFromPeriods - endMinusStart);
          return {
            accountId: account.accountId,
            accountName: account.accountName,
            netFromPeriods,
            endMinusStart,
            deltaGap,
            consistentWithin1Cent: Math.abs(deltaGap) <= 0.01
          };
        });

        return {
          scenarioId: scenario.scenarioId,
          scenarioName: scenario.scenarioName,
          allAccountsConsistent: accountChecks.every((c) => c.consistentWithin1Cent),
          accountChecks
        };
      });

    summaryActuals['UC-S10'] = {
      scenarios: consistencyRows
    };
  }

  return summaryActuals;
}

async function extractActualsForScenarioType({
  scenarioType,
  qcInputData,
  useCaseMapping,
  lookupData,
  qcExpectedData = null
}) {
  const modules = await loadCalculationModules();
  const allScenarios = qcInputData.scenarios || [];
  const selectedScenarios = getScenariosByType(qcInputData, scenarioType, useCaseMapping);
  const selectedUseCaseIds = getMappedUseCasesForScenarioType(useCaseMapping, scenarioType);

  const scenarioActualsById = new Map();
  const occurrencesByScenarioId = new Map();

  for (const scenario of allScenarios) {
    const projections = await modules.generateProjectionsForScenario(scenario, {}, lookupData);
    const scenarioActual = buildScenarioActuals(scenario, projections);
    scenarioActualsById.set(scenario.id, scenarioActual);

    const occurrences = buildOccurrencesForScenario(scenario, modules, lookupData);
    occurrencesByScenarioId.set(scenario.id, occurrences);
  }

  const scenarioActuals = selectedScenarios
    .map((scenario) => scenarioActualsById.get(scenario.id))
    .filter(Boolean);

  const expectedUseCaseAssertions = qcExpectedData?.assertions?.useCases || [];
  const allScenariosById = new Map(allScenarios.map((scenario) => [scenario.id, scenario]));

  const summaryUseCaseActuals = extractSummaryUseCases({
    allScenarioActualsById: scenarioActualsById,
    allOccurrencesByScenarioId: occurrencesByScenarioId,
    allScenariosById,
    selectedUseCaseIds,
    expectedUseCaseAssertions
  });

  return {
    scenarioType,
    useCaseIds: selectedUseCaseIds,
    scenarios: scenarioActuals,
    useCases: summaryUseCaseActuals
  };
}

module.exports = {
  extractActualsForScenarioType,
  loadCalculationModules,
  buildScenarioActuals,
  buildOccurrencesForScenario,
  extractSummaryUseCases,
  round2
};
