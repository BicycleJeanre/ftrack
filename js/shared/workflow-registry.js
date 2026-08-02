// workflow-registry.js
// Code-defined workflow registry (replaces lookup-data.json scenarioTypes as a UI persistence concept).

export const DEFAULT_WORKFLOW_ID = 'general';

export const LEGACY_SCENARIO_TYPE_ID_TO_WORKFLOW_ID = {
  1: 'budget',
  2: 'general',
  3: 'funds',
  4: 'debt-repayment',
  5: 'goal-workshop',
  6: 'goal-workshop'
};

export const WORKFLOWS = [
  {
    id: 'budget',
    name: 'Budget',
    activity: {
      surface: 'planActuals',
      presentation: 'summary',
      defaultView: 'period'
    },
    visibleCards: [
      'scenarioPicker',
      'accounts',
      'planActuals',
      'projections'
    ],
    showAccounts: true,
    showPlannedTransactions: false,
    showActualTransactions: false,
    showBudget: true,
    showPlanActuals: true,
    showProjections: true,
    showGeneratePlan: false,
    showSummaryCards: false,
    summaryMode: null,
    supportsPeriodicChangeSchedule: false
  },
  {
    id: 'general',
    name: 'General',
    activity: {
      surface: 'planActuals',
      presentation: 'summary',
      defaultView: 'recurring'
    },
    visibleCards: [
      'scenarioPicker',
      'summaryCards',
      'accounts',
      'planActuals',
      'projections'
    ],
    showAccounts: true,
    showPlannedTransactions: false,
    showActualTransactions: false,
    showBudget: true,
    showPlanActuals: true,
    showProjections: true,
    showGeneratePlan: false,
    showSummaryCards: true,
    summaryMode: 'general',
    supportsPeriodicChangeSchedule: false
  },
  {
    id: 'funds',
    name: 'Funds',
    activity: {
      surface: 'planActuals',
      presentation: 'summary',
      defaultView: 'recurring'
    },
    visibleCards: [
      'scenarioPicker',
      'summaryCards',
      'accounts',
      'planActuals'
    ],
    showAccounts: true,
    showPlannedTransactions: false,
    showActualTransactions: false,
    showBudget: true,
    showPlanActuals: true,
    showProjections: false,
    showGeneratePlan: false,
    showSummaryCards: true,
    summaryMode: 'funds',
    supportsPeriodicChangeSchedule: false
  },
  {
    id: 'debt-repayment',
    name: 'Debt Repayment',
    activity: {
      surface: 'planActuals',
      presentation: 'summary',
      defaultView: 'recurring'
    },
    visibleCards: [
      'scenarioPicker',
      'summaryCards',
      'accounts',
      'planActuals',
      'projections'
    ],
    showAccounts: true,
    showPlannedTransactions: false,
    showActualTransactions: false,
    showBudget: true,
    showPlanActuals: true,
    showProjections: true,
    showGeneratePlan: false,
    showSummaryCards: true,
    summaryMode: 'debt',
    supportsPeriodicChangeSchedule: true
  },
  {
    id: 'goal-workshop',
    name: 'Goal Workshop',
    activity: {
      surface: 'planActuals',
      presentation: 'summary',
      defaultView: 'recurring'
    },
    visibleCards: [
      'scenarioPicker',
      'accounts',
      'generatePlan',
      'planActuals',
      'projections'
    ],
    showAccounts: true,
    showPlannedTransactions: false,
    showActualTransactions: false,
    showBudget: true,
    showPlanActuals: true,
    showProjections: true,
    showGeneratePlan: true,
    showSummaryCards: false,
    summaryMode: null,
    supportsPeriodicChangeSchedule: false
  },
  {
    id: 'accounts-detail',
    name: 'Accounts (Detail)',
    visibleCards: ['scenarioPicker', 'accounts'],
    showAccounts: true,
    showPlannedTransactions: false,
    showActualTransactions: false,
    showBudget: false,
    showProjections: false,
    showGeneratePlan: false,
    showSummaryCards: false,
    summaryMode: null,
    accountsMode: 'detail',
    supportsPeriodicChangeSchedule: false
  },
  {
    id: 'transactions-detail',
    name: 'Plan Rules (Detail)',
    activity: {
      surface: 'planActuals',
      presentation: 'detail',
      defaultView: 'recurring'
    },
    visibleCards: ['scenarioPicker', 'planActuals'],
    showAccounts: false,
    showPlannedTransactions: false,
    showActualTransactions: false,
    showBudget: true,
    showPlanActuals: true,
    showProjections: false,
    showGeneratePlan: false,
    showSummaryCards: false,
    summaryMode: null,
    budgetMode: 'detail',
    supportsPeriodicChangeSchedule: false
  },
  {
    id: 'budget-detail',
    name: 'Plan & Actuals (Detail)',
    activity: {
      surface: 'planActuals',
      presentation: 'detail',
      defaultView: 'period'
    },
    visibleCards: ['scenarioPicker', 'planActuals'],
    showAccounts: false,
    showPlannedTransactions: false,
    showActualTransactions: false,
    showBudget: true,
    showPlanActuals: true,
    showProjections: false,
    showGeneratePlan: false,
    showSummaryCards: false,
    summaryMode: null,
    budgetMode: 'detail',
    supportsPeriodicChangeSchedule: false
  },
  {
    id: 'projections-detail',
    name: 'Projections (Detail)',
    activity: null,
    visibleCards: ['scenarioPicker', 'projections'],
    showAccounts: false,
    showPlannedTransactions: false,
    showActualTransactions: false,
    showBudget: false,
    showProjections: true,
    showGeneratePlan: false,
    showSummaryCards: false,
    summaryMode: null,
    projectionsMode: 'detail',
    supportsPeriodicChangeSchedule: false
  }
];

export function getWorkflowById(id) {
  if (!id) return WORKFLOWS.find((w) => w.id === DEFAULT_WORKFLOW_ID) || WORKFLOWS[0] || null;
  return WORKFLOWS.find((w) => w.id === id) || WORKFLOWS.find((w) => w.id === DEFAULT_WORKFLOW_ID) || WORKFLOWS[0] || null;
}

/**
 * Return the one authoritative financial-activity surface for a workflow.
 *
 * The legacy showBudget/showTransactions flags remain on registry records while
 * older callers and imported data are phased out. They are translated into the
 * unified Plan & Actuals contract rather than reviving a raw Transactions card.
 */
export function getWorkflowActivity(workflow) {
  if (!workflow) return null;
  if (Object.prototype.hasOwnProperty.call(workflow, 'activity')) {
    return workflow.activity;
  }
  if (workflow.showPlanActuals || workflow.showBudget) {
    return {
      surface: 'planActuals',
      presentation: workflow.budgetMode === 'detail' ? 'detail' : 'summary',
      defaultView: 'period'
    };
  }
  if (workflow.showPlannedTransactions || workflow.showActualTransactions) {
    return {
      surface: 'planActuals',
      presentation: workflow.transactionsMode === 'detail' ? 'detail' : 'summary',
      defaultView: 'recurring'
    };
  }
  return null;
}

export function getWorkflowIdFromLegacyScenarioTypeId(value) {
  const typeId = typeof value === 'object' ? value?.id : value;
  const idNum = Number(typeId);
  if (!Number.isFinite(idNum)) return null;
  return LEGACY_SCENARIO_TYPE_ID_TO_WORKFLOW_ID[idNum] || null;
}
