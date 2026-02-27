// workflow-registry.js
// Code-defined workflow registry (replaces lookup-data.json scenarioTypes as a UI persistence concept).

export const DEFAULT_WORKFLOW_ID = 'general';

export const LEGACY_SCENARIO_TYPE_ID_TO_WORKFLOW_ID = {
  1: 'budget',
  2: 'general',
  3: 'funds',
  4: 'debt-repayment',
  5: 'goal-based',
  6: 'advanced-goal-solver'
};

export const WORKFLOWS = [
  {
    id: 'budget',
    name: 'Budget',
    visibleCards: [
      'scenarioPicker',
      'accounts',
      'transactions',
      'budget',
      'projections'
    ],
    showAccounts: true,
    showPlannedTransactions: true,
    showActualTransactions: true,
    showBudget: true,
    showProjections: true,
    showGeneratePlan: false,
    showSummaryCards: false,
    summaryMode: null,
    supportsPeriodicChangeSchedule: false
  },
  {
    id: 'general',
    name: 'General',
    visibleCards: [
      'scenarioPicker',
      'summaryCards',
      // Keep only summary in this workflow; detailed grids moved to detail workflows
    ],
    showAccounts: false,
    showPlannedTransactions: false,
    showActualTransactions: false,
    showBudget: false,
    showProjections: false,
    showGeneratePlan: false,
    showSummaryCards: true,
    summaryMode: 'general',
    supportsPeriodicChangeSchedule: false
  },
  {
    id: 'funds',
    name: 'Funds',
    visibleCards: [
      'scenarioPicker',
      'summaryCards',
      // Keep only summary in this workflow; detailed grids moved to detail workflows
    ],
    showAccounts: false,
    showPlannedTransactions: false,
    showActualTransactions: false,
    showBudget: false,
    showProjections: false,
    showGeneratePlan: false,
    showSummaryCards: true,
    summaryMode: 'funds',
    supportsPeriodicChangeSchedule: false
  },
  {
    id: 'debt-repayment',
    name: 'Debt Repayment',
    visibleCards: [
      'scenarioPicker',
      'summaryCards',
      // Keep only summary in this workflow; detailed grids moved to detail workflows
    ],
    showAccounts: false,
    showPlannedTransactions: false,
    showActualTransactions: false,
    showBudget: false,
    showProjections: false,
    showGeneratePlan: false,
    showSummaryCards: true,
    summaryMode: 'debt',
    supportsPeriodicChangeSchedule: true
  },
  {
    id: 'goal-based',
    name: 'Goal-Based',
    visibleCards: [
      'scenarioPicker',
      'accounts',
      'generatePlan',
      'transactions',
      'projections'
    ],
    showAccounts: true,
    showPlannedTransactions: true,
    showActualTransactions: false,
    showBudget: false,
    showProjections: true,
    showGeneratePlan: true,
    showSummaryCards: false,
    summaryMode: null,
    supportsPeriodicChangeSchedule: false
  },
  {
    id: 'advanced-goal-solver',
    name: 'Advanced Goal Solver',
    visibleCards: [
      'scenarioPicker',
      'accounts',
      'generatePlan',
      'transactions',
      'projections'
    ],
    showAccounts: true,
    showPlannedTransactions: true,
    showActualTransactions: false,
    showBudget: false,
    showProjections: true,
    showGeneratePlan: true,
    showSummaryCards: false,
    summaryMode: null,
    supportsPeriodicChangeSchedule: false
  }
  ,
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
    name: 'Transactions (Detail)',
    visibleCards: ['scenarioPicker', 'transactions'],
    showAccounts: false,
    showPlannedTransactions: true,
    showActualTransactions: true,
    showBudget: false,
    showProjections: false,
    showGeneratePlan: false,
    showSummaryCards: false,
    summaryMode: null,
    supportsPeriodicChangeSchedule: false
  },
  {
    id: 'budget-detail',
    name: 'Budget (Detail)',
    visibleCards: ['scenarioPicker', 'budget'],
    showAccounts: false,
    showPlannedTransactions: false,
    showActualTransactions: false,
    showBudget: true,
    showProjections: false,
    showGeneratePlan: false,
    showSummaryCards: false,
    summaryMode: null,
    supportsPeriodicChangeSchedule: false
  },
  {
    id: 'projections-detail',
    name: 'Projections (Detail)',
    visibleCards: ['scenarioPicker', 'projections'],
    showAccounts: false,
    showPlannedTransactions: false,
    showActualTransactions: false,
    showBudget: false,
    showProjections: true,
    showGeneratePlan: false,
    showSummaryCards: false,
    summaryMode: null,
    supportsPeriodicChangeSchedule: false
  }
];

export function getWorkflowById(id) {
  if (!id) return WORKFLOWS.find((w) => w.id === DEFAULT_WORKFLOW_ID) || WORKFLOWS[0] || null;
  return WORKFLOWS.find((w) => w.id === id) || WORKFLOWS.find((w) => w.id === DEFAULT_WORKFLOW_ID) || WORKFLOWS[0] || null;
}

export function getWorkflowIdFromLegacyScenarioTypeId(value) {
  const typeId = typeof value === 'object' ? value?.id : value;
  const idNum = Number(typeId);
  if (!Number.isFinite(idNum)) return null;
  return LEGACY_SCENARIO_TYPE_ID_TO_WORKFLOW_ID[idNum] || null;
}

