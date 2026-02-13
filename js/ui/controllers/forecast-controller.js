// forecast-controller.js
// Manages the Forecast page with scenario-centric model
// Displays accounts, planned transactions, actual transactions, and projections based on scenario type


import { createGrid, createSelectorColumn, createTextColumn, createObjectColumn, createDateColumn, createMoneyColumn, createListEditor, formatMoneyDisplay, createDeleteColumn, createDuplicateColumn } from '../components/grids/grid-factory.js';
import { attachGridHandlers } from '../components/grids/grid-handlers.js';
import * as ScenarioManager from '../../app/managers/scenario-manager.js';
import * as AccountManager from '../../app/managers/account-manager.js';
import * as TransactionManager from '../../app/managers/transaction-manager.js';
import * as BudgetManager from '../../app/managers/budget-manager.js';
import { openRecurrenceModal } from '../components/modals/recurrence-modal.js';
import { openPeriodicChangeModal } from '../components/modals/periodic-change-modal.js';
import { getPeriodicChangeDescription } from '../../domain/calculations/periodic-change-utils.js';
import { openTextInputModal } from '../components/modals/text-input-modal.js';
import keyboardShortcuts from '../../shared/keyboard-shortcuts.js';
import { loadGlobals } from '../../global-app.js';
import { createLogger } from '../../shared/logger.js';
import { notifyError, notifySuccess } from '../../shared/notifications.js';
import { normalizeCanonicalTransaction, transformTransactionToRows, mapEditToCanonical } from '../transforms/transaction-row-transformer.js';
import { renderMoneyTotals, renderBudgetTotals } from '../components/widgets/toolbar-totals.js';
import { loadLookup } from '../../app/services/lookup-service.js';
import { buildGridContainer } from '../components/forecast/forecast-layout.js';
import {
  updateTransactionTotals as updateTransactionTotalsCore,
  updateBudgetTotals as updateBudgetTotalsCore
} from '../components/forecast/forecast-totals.js';
import {
  getFilteredProjections as getFilteredProjectionsCore,
  updateProjectionTotals as updateProjectionTotalsCore
} from '../components/forecast/forecast-projections.js';
import {
  transformPlannedTxForUI as transformPlannedTxForUICore,
  transformActualTxForUI as transformActualTxForUICore,
  mapTxToUI as mapTxToUICore
} from '../components/forecast/forecast-tx-ui.js';
import { loadGeneratePlanSection as loadGeneratePlanSectionCore } from '../components/forecast/forecast-generate-plan.js';
import {
  buildAccountsGridColumns as buildAccountsGridColumnsCore,
  loadAccountsGrid as loadAccountsGridCore
} from '../components/grids/accounts-grid.js';
import { loadMasterTransactionsGrid as loadMasterTransactionsGridCore } from '../components/grids/transactions-grid.js';
import { loadBudgetGrid as loadBudgetGridCore } from '../components/grids/budget-grid.js';
import {
  loadProjectionsSection as loadProjectionsSectionCore,
  loadProjectionsGrid as loadProjectionsGridCore
} from '../components/forecast/forecast-projections-section.js';

const logger = createLogger('ForecastController');

import { formatDateOnly, parseDateOnly } from '../../shared/date-utils.js';
import { generateRecurrenceDates } from '../../domain/calculations/calculation-engine.js';
import { expandTransactions } from '../../domain/calculations/transaction-expander.js';
import { getRecurrenceDescription } from '../../domain/calculations/recurrence-utils.js';
import { calculateCategoryTotals, calculateBudgetTotals } from '../transforms/data-aggregators.js';
import { calculateContributionAmount, calculateMonthsToGoal, calculateFutureValue, calculateMonthsBetweenDates, getFrequencyName, getFrequencyInMonths, convertContributionFrequency, getGoalSummary } from '../../domain/calculations/goal-calculations.js';
import {
  getDefaultFundSettings,
  buildProjectionsIndex,
  getBalanceAsOf,
  computeNav,
  computeMoneyTotalsFromTransactions,
  computeLockedSharesByAccountId,
  computeAutomaticSharesByAccountId,
  computeInvestorFlows
} from '../../domain/utils/fund-utils.js';

import {
  getScenarios,
  getScenario,
  saveAccounts,
  getTransactions,
  createTransaction,
  createAccount,
  getScenarioPeriods,
  getBudget,
  saveBudget
} from '../../app/services/data-service.js';
import { generateProjections, clearProjections } from '../../domain/calculations/projection-engine.js';

let currentScenario = null;
let scenarioTypes = null;
let transactionFilterAccountId = null; // Track account filter for transactions view (independent of account grid selection)
let actualPeriod = null; // Selected period for actual transactions
let actualPeriodType = 'Month'; // Selected period type for transactions view
let projectionPeriod = null; // Selected period for projections view
let projectionPeriodType = 'Month'; // Selected period type for projections view
let budgetPeriod = null; // Selected period for budget view
let budgetPeriodType = 'Month'; // Selected period type for budget view
let periods = []; // Calculated periods for current scenario
let projectionPeriods = []; // Calculated periods for projections view
let budgetGridLoadToken = 0; // Prevent stale budget renders
let masterTransactionsTable = null; // Store transactions table instance for filtering
let masterBudgetTable = null; // Store budget table instance for filtering
let summaryCardsAccountTypeFilter = 'All';

function isDebtScenario(typeConfig) {
  return typeConfig?.id === 4; // Debt Repayment scenario type
}

function isGeneralScenario(typeConfig) {
  return typeConfig?.id === 2; // General scenario type
}

function isFundsScenario(typeConfig) {
  return typeConfig?.id === 3; // Funds scenario type
}

let fundSummaryScope = 'All';
let fundSummaryAsOfDate = '';

// Update transaction totals in toolbar based on current filtered data
function updateTransactionTotals(filteredRows = null) {
  updateTransactionTotalsCore(masterTransactionsTable, filteredRows);
}

// Update budget totals in toolbar based on current filtered data
function updateBudgetTotals(filteredRows = null) {
  updateBudgetTotalsCore(masterBudgetTable, filteredRows);
}

function getFilteredProjections() {
  return getFilteredProjectionsCore({
    currentScenario,
    transactionFilterAccountId,
    projectionPeriod,
    projectionPeriods
  });
}

function updateProjectionTotals(container, projections = null) {
  const data = projections || getFilteredProjections();
  updateProjectionTotalsCore(container, data);
}
async function buildScenarioGrid(container) {
  container.innerHTML = '';

  try {
    const lookupData = await loadLookup('lookup-data.json');

    // Add "Add Scenario" button
    // Remove any existing add buttons (defensive)
    const existingScenarioAdds = container.querySelectorAll('.btn-add');
    existingScenarioAdds.forEach(el => el.remove());

    const addScenarioBtn = document.createElement('button');
    addScenarioBtn.className = 'btn btn-primary btn-add';
    addScenarioBtn.textContent = '+ Add New';
    addScenarioBtn.addEventListener('click', async () => {
      const newScenario = await ScenarioManager.create({
        name: 'New Scenario',
        type: null,
        description: '',
        startDate: formatDateOnly(new Date()),
          endDate: formatDateOnly(new Date()),
        projectionPeriod: null
      });
      await buildScenarioGrid(container);
    });
    window.add(container, addScenarioBtn);

    // Create grid container
    const gridContainer = document.createElement('div');
    gridContainer.id = 'scenariosTable'; // explicit ID for logging and testing
    gridContainer.className = 'grid-container scenarios-grid';
    window.add(container, gridContainer);

    // Load all scenarios
    const scenarios = await ScenarioManager.getAll();

    const scenariosTable = await createGrid(gridContainer, {
      data: scenarios,
      selectable: 1, // Only allow single row selection
      columns: [
        createDuplicateColumn(async (cell) => {
          const rowData = cell.getRow().getData();
          await ScenarioManager.duplicate(rowData.id);
          await buildScenarioGrid(container);
        }, { headerTooltip: 'Duplicate Scenario' }),
        createDeleteColumn(async (cell) => {
          const rowData = cell.getRow().getData();
          await ScenarioManager.remove(rowData.id);
          await buildScenarioGrid(container);
        }, { confirmMessage: (rowData) => `Delete scenario: ${rowData.name}?` }),
        createTextColumn('Scenario Name', 'name', { widthGrow: 3, editor: "input", editable: true }),
        {
          title: "Type",
          field: "type",
          widthGrow: 2,
          responsive: 0,
          editor: "list",
          editorParams: {
            values: lookupData.scenarioTypes.map(t => ({ label: t.name, value: t })),
            listItemFormatter: function(value, title) {
              return title;
            }
          },
          formatter: function(cell) {
            const value = cell.getValue();
            return value?.name || '';
          },
          headerFilter: "input",
          headerFilterFunc: "like",
          headerFilterPlaceholder: "Filter...",
          headerHozAlign: "left"
        },
        createTextColumn('Description', 'description', { widthGrow: 3, editor: "input", editable: true, responsive: 3 }),
        createDateColumn('Start Date', 'startDate', { widthGrow: 2, editor: "date", responsive: 1 }),
        createDateColumn('End Date', 'endDate', { widthGrow: 2, editor: "date", responsive: 2 }),
        {
          title: "Period Type",
          field: "projectionPeriod",
          widthGrow: 2,
          responsive: 0,
          editor: "list",
          editorParams: {
            values: lookupData.periodTypes.map(p => ({ label: p.name, value: p })),
            listItemFormatter: function(value, title) {
              return title;
            }
          },
          formatter: function(cell) {
            const value = cell.getValue();
            return value?.name || '';
          },
          headerHozAlign: "left"
        }
      ],
      rowSelectionChanged: async function(data, rows) {
        // logger.debug('[Forecast] scenarios.rowSelectionChanged fired. data length:', data && data.length, 'rows length:', rows && rows.length);
        if (rows.length > 0) {
          const scenario = rows[0].getData();
          currentScenario = await getScenario(scenario.id);
          transactionFilterAccountId = null; // Clear transaction filter when switching scenarios
          await loadScenarioData();
        }
      }
    });

    const handleScenarioRowSelectedPrimary = async function(row) {
      try {
        const scenario = row.getData();
        currentScenario = await getScenario(scenario.id);
        transactionFilterAccountId = null;
        await loadScenarioData();
      } catch (err) {
        logger.error('[ScenarioGrid] rowSelected handler failed:', err);
      }
    };

    const handleScenarioRowSelectedEnforce = function(row) {
      try {
        const table = row.getTable();
        const selected = table.getSelectedRows();
        if (selected.length > 1) {
          // Deselect others, keep this one
          selected.forEach(r => { if (r.getData().id !== row.getData().id) r.deselect(); });
        }
      } catch (err) {
        logger.error('[ScenarioGrid] rowSelected enforcement failed:', err);
      }
      // Debounce reload to avoid re-render races
      setTimeout(async () => {
        try {
          const scenario = row.getData();
          if (currentScenario && currentScenario.id === scenario.id) return; // already set
          currentScenario = await getScenario(scenario.id);
          transactionFilterAccountId = null;
          await loadScenarioData();
        } catch (err) {
          logger.error('[ScenarioGrid] rowSelected handler failed (delayed):', err);
        }
      }, 40);
    };

    const handleScenarioRowClick = function(e, row) {
      // Ensure single-selection by deselecting others then selecting this row
      try {
        const table = row.getTable();
        // If clicking an already selected row, toggle it off
        if (row.isSelected()) {
          table.deselectRow(row);
          return;
        }
        table.deselectRow();
        row.select();
        // Safety check after a tiny delay
        setTimeout(() => {
          const selected = table.getSelectedRows();
          if (!row.isSelected()) {
            table.deselectRow();
            row.select();
          } else if (selected.length > 1) {
            // enforce single selection
            selected.forEach(r => { if (r.getData().id !== row.getData().id) r.deselect(); });
          }
        }, 20);
      } catch (err) {
        logger.error('[ScenarioGrid] rowClick fallback failed:', err);
      }
    };

    const handleScenarioCellEdited = async function(cell) {
      const row = cell.getRow();
      const scenario = row.getData();
      
      try {
        // Extract only the fields that should be saved (exclude Tabulator-specific fields)
        const updates = {
          name: scenario.name,
          type: scenario.type,
          description: scenario.description,
          startDate: scenario.startDate,
          endDate: scenario.endDate,
          projectionPeriod: scenario.projectionPeriod
        };
        
        // Update just the edited scenario
        await ScenarioManager.update(scenario.id, updates);
      } catch (err) {
        notifyError('Failed to save scenario: ' + err.message);
      }
    };

    attachGridHandlers(scenariosTable, {
      rowSelected: [handleScenarioRowSelectedPrimary, handleScenarioRowSelectedEnforce],
      rowClick: handleScenarioRowClick,
      cellEdited: handleScenarioCellEdited
    });

    // Set initial scenario if not set and load its data
    if (!currentScenario && scenarios.length > 0) {
      currentScenario = await getScenario(scenarios[0].id);
      await loadScenarioData();
      // Select the first row visually after grid is fully initialized
      // Use a small delay to ensure the grid is ready
      setTimeout(() => {
        const firstRow = scenariosTable.getRows()[0];
        if (firstRow && !firstRow.isSelected()) {
          firstRow.select();
        }
      }, 100);
    }
  } catch (err) {
  }
}

// Load scenario type configuration
async function loadScenarioTypes() {
  try {
    const data = await loadLookup('lookup-data.json');
    scenarioTypes = data.scenarioTypes;
  } catch (err) {
    scenarioTypes = [];
  }
}

// Get current scenario type configuration
function getScenarioTypeConfig() {
  if (!currentScenario || !scenarioTypes) return null;
  if (!currentScenario.type) return null;
  
  const typeId = typeof currentScenario.type === 'number' 
    ? currentScenario.type 
    : currentScenario.type?.id;
  
  return scenarioTypes.find(st => st.id === typeId);
}

/**
 * Transform planned transactions to UI format (transactionType/secondaryAccount) filtered by selected account
 */
function transformPlannedTxForUI(plannedTxs, transactionFilterAccountId) {
  return transformPlannedTxForUICore({
    currentScenario,
    plannedTxs,
    transactionFilterAccountId
  });
}



/**
 * Transform actual transactions for UI (same as planned transactions)
 */
function transformActualTxForUI(actualTxs, transactionFilterAccountId) {
  return transformActualTxForUICore({
    currentScenario,
    actualTxs,
    transactionFilterAccountId
  });
}

/**
 * Map a backend transaction to UI representation for a selected account.
 * Returns null if the transaction does not involve the selected account.
 */
function mapTxToUI(tx, transactionFilterAccountId) {
  return mapTxToUICore({
    currentScenario,
    tx,
    transactionFilterAccountId
  });
}

/**
 * Load the Generate Plan section for goal-based scenarios
 */
async function loadGeneratePlanSection(container) {
  return loadGeneratePlanSectionCore({
    container,
    scenarioState: {
      get: () => currentScenario,
      set: (nextScenario) => {
        currentScenario = nextScenario;
      }
    },
    loadMasterTransactionsGrid,
    loadProjectionsSection,
    logger
  });
}

/**
 * Build accounts grid columns based on scenario type configuration
 */
function buildAccountsGridColumns(lookupData, typeConfig = null) {
  return buildAccountsGridColumnsCore({
    lookupData,
    typeConfig,
    scenarioState: {
      get: () => currentScenario,
      set: (nextScenario) => {
        currentScenario = nextScenario;
      }
    },
    reloadAccountsGrid: loadAccountsGrid,
    reloadMasterTransactionsGrid: loadMasterTransactionsGrid,
    logger
  });
}

// Load accounts grid
async function loadAccountsGrid(container) {
  return loadAccountsGridCore({
    container,
    scenarioState: {
      get: () => currentScenario,
      set: (nextScenario) => {
        currentScenario = nextScenario;
      }
    },
    getScenarioTypeConfig,
    reloadMasterTransactionsGrid: loadMasterTransactionsGrid,
    logger
  });
}

// Load master transactions grid (unified planned and actual)
async function loadMasterTransactionsGrid(container) {
  return loadMasterTransactionsGridCore({
    container,
    scenarioState: {
      get: () => currentScenario,
      set: (nextScenario) => {
        currentScenario = nextScenario;
      }
    },
    getScenarioTypeConfig,
    state: {
      getTransactionFilterAccountId: () => transactionFilterAccountId,
      setTransactionFilterAccountId: (nextId) => {
        transactionFilterAccountId = nextId;
      },
      getActualPeriod: () => actualPeriod,
      setActualPeriod: (nextPeriod) => {
        actualPeriod = nextPeriod;
      },
      getActualPeriodType: () => actualPeriodType,
      setActualPeriodType: (nextType) => {
        actualPeriodType = nextType;
      },
      getPeriods: () => periods,
      setPeriods: (nextPeriods) => {
        periods = nextPeriods;
      }
    },
    tables: {
      getMasterTransactionsTable: () => masterTransactionsTable,
      setMasterTransactionsTable: (nextTable) => {
        masterTransactionsTable = nextTable;
      },
      getMasterBudgetTable: () => masterBudgetTable
    },
    callbacks: {
      updateTransactionTotals,
      updateBudgetTotals,
      loadProjectionsSection,
      refreshSummaryCards,
      getEl
    },
    logger
  });
}

// Load budget grid
async function loadBudgetGrid(container) {
  return loadBudgetGridCore({
    container,
    scenarioState: {
      get: () => currentScenario,
      set: (nextScenario) => {
        currentScenario = nextScenario;
      }
    },
    state: {
      getTransactionFilterAccountId: () => transactionFilterAccountId,
      setTransactionFilterAccountId: (nextId) => {
        transactionFilterAccountId = nextId;
      },
      getBudgetPeriod: () => budgetPeriod,
      setBudgetPeriod: (nextPeriod) => {
        budgetPeriod = nextPeriod;
      },
      getBudgetPeriodType: () => budgetPeriodType,
      setBudgetPeriodType: (nextType) => {
        budgetPeriodType = nextType;
      },
      getPeriods: () => periods,
      setPeriods: (nextPeriods) => {
        periods = nextPeriods;
      },
      bumpBudgetGridLoadToken: () => ++budgetGridLoadToken,
      getBudgetGridLoadToken: () => budgetGridLoadToken
    },
    tables: {
      getMasterBudgetTable: () => masterBudgetTable,
      setMasterBudgetTable: (nextTable) => {
        masterBudgetTable = nextTable;
      },
      getMasterTransactionsTable: () => masterTransactionsTable
    },
    callbacks: {
      updateBudgetTotals,
      updateTransactionTotals,
      loadProjectionsSection,
      getEl
    },
    logger
  });
}

// Load debt summary cards (per-account + overall total)
async function loadDebtSummaryCards(container) {
  if (!container) {
    return;
  }
  if (!currentScenario || !currentScenario.accounts) {
    container.innerHTML = '<div class="empty-message">No accounts added yet.</div>';
    return;
  }

  const { accounts, projections } = currentScenario;
  if (!accounts.length) {
    container.innerHTML = '<div class="empty-message">No accounts added yet.</div>';
    return;
  }

  container.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'grid-toolbar summary-cards-toolbar';

  const filterItem = document.createElement('div');
  filterItem.className = 'toolbar-item';
  filterItem.innerHTML = `
    <label for="summary-cards-type-filter" class="text-muted control-label">Account Type:</label>
    <select id="summary-cards-type-filter" class="input-select control-select">
      <option value="All">All</option>
      <option value="Liability">Liability</option>
      <option value="Asset">Asset</option>
    </select>
  `;
  toolbar.appendChild(filterItem);
  container.appendChild(toolbar);

  const filterSelect = filterItem.querySelector('#summary-cards-type-filter');
  if (filterSelect) {
    filterSelect.value = summaryCardsAccountTypeFilter;
    filterSelect.addEventListener('change', () => {
      summaryCardsAccountTypeFilter = filterSelect.value;
      loadDebtSummaryCards(container);
    });
  }

  const getAccountTypeName = (account) => account?.type?.name || 'Unknown';
  const filteredAccounts = summaryCardsAccountTypeFilter === 'All'
    ? accounts
    : accounts.filter(account => getAccountTypeName(account) === summaryCardsAccountTypeFilter);

  if (!filteredAccounts.length) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'empty-message';
    emptyMessage.textContent = 'No accounts match this filter.';
    container.appendChild(emptyMessage);
    return;
  }

  // Create per-account cards
  let totalStarting = 0;
  let totalProjectedEnd = 0;
  let totalInterestEarned = 0;
  let totalInterestPaid = 0;

  const groupedAccounts = filteredAccounts.reduce((groups, account) => {
    const typeName = getAccountTypeName(account);
    if (!groups[typeName]) {
      groups[typeName] = [];
    }
    groups[typeName].push(account);
    return groups;
  }, {});

  const orderedGroupKeys = (() => {
    const preferredOrder = ['Liability', 'Asset'];
    const remaining = Object.keys(groupedAccounts).filter(key => !preferredOrder.includes(key)).sort();
    if (summaryCardsAccountTypeFilter !== 'All') {
      return Object.keys(groupedAccounts);
    }
    return [...preferredOrder.filter(key => groupedAccounts[key]), ...remaining];
  })();

  const groupWrapper = document.createElement('div');
  groupWrapper.className = 'summary-cards-groups';

  for (const groupKey of orderedGroupKeys) {
    const groupContainer = document.createElement('div');
    groupContainer.className = 'summary-cards-group';

    const groupTitle = document.createElement('div');
    groupTitle.className = 'summary-cards-group-title';
    groupTitle.textContent = groupKey;
    groupContainer.appendChild(groupTitle);

    const grid = document.createElement('div');
    grid.className = 'summary-cards-grid';

    for (const account of groupedAccounts[groupKey]) {
    const startingBalance = account.startingBalance ?? 0;
    totalStarting += startingBalance;

    // Find projections for this account
    const accountProjections = projections ? projections.filter(p => p.accountId === account.id) : [];
    
    // Calculate metrics
    const projectedEnd = accountProjections.length ? (accountProjections[accountProjections.length - 1].balance || 0) : startingBalance;
    totalProjectedEnd += projectedEnd;

    // Sum interest earned and paid from projection records
    let interestEarned = 0;
    let interestPaid = 0;
    
    accountProjections.forEach(p => {
      const interest = Number(p.interest || 0);
      if (interest >= 0) {
        interestEarned += interest;
      } else {
        interestPaid += interest; // Keep as negative
      }
    });
    
    totalInterestEarned += interestEarned;
    totalInterestPaid += interestPaid;

    // Find zero crossing date (when balance goes from negative to positive)
    let zeroCrossingDate = null;
    let previousBalance = startingBalance;
    for (const p of accountProjections) {
      const currentBalance = Number(p.balance || 0);
      if (previousBalance < 0 && currentBalance >= 0) {
        zeroCrossingDate = p.date;
        break;
      }
      previousBalance = currentBalance;
    }

    // Format values for display
    const startingStr = formatMoneyDisplay(startingBalance);
    const projectedStr = formatMoneyDisplay(projectedEnd);
    const interestEarnedStr = formatMoneyDisplay(interestEarned);
    const interestPaidStr = formatMoneyDisplay(interestPaid);
    const zeroCrossingStr = zeroCrossingDate ? formatDateOnly(parseDateOnly(zeroCrossingDate)) : 'N/A';

    // Create card
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML = `
      <div class="summary-card-title">${account.name || 'Unnamed'}</div>
      <div class="summary-card-row">
        <span class="label">Starting Balance:</span>
        <span class="value">${startingStr}</span>
      </div>
      <div class="summary-card-row">
        <span class="label">Projected End:</span>
        <span class="value">${projectedStr}</span>
      </div>
      <div class="summary-card-row">
        <span class="label">Interest Earned:</span>
        <span class="value interest-earned">${interestEarnedStr}</span>
      </div>
      <div class="summary-card-row">
        <span class="label">Interest Paid:</span>
        <span class="value interest-paid">${interestPaidStr}</span>
      </div>
      <div class="summary-card-row">
        <span class="label">Zero Date:</span>
        <span class="value">${zeroCrossingStr}</span>
      </div>
    `;
    grid.appendChild(card);
    }

    groupContainer.appendChild(grid);
    groupWrapper.appendChild(groupContainer);
  }

  // Create overall total card (only when multiple accounts exist)
  if (filteredAccounts.length > 1) {
    const totalCard = document.createElement('div');
    totalCard.className = 'summary-card overall-total';
    totalCard.innerHTML = `
      <div class="summary-card-title">OVERALL TOTAL</div>
      <div class="summary-card-row">
        <span class="label">Starting Balance:</span>
        <span class="value">${formatMoneyDisplay(totalStarting)}</span>
      </div>
      <div class="summary-card-row">
        <span class="label">Projected End:</span>
        <span class="value">${formatMoneyDisplay(totalProjectedEnd)}</span>
      </div>
      <div class="summary-card-row">
        <span class="label">Interest Earned:</span>
        <span class="value interest-earned">${formatMoneyDisplay(totalInterestEarned)}</span>
      </div>
      <div class="summary-card-row">
        <span class="label">Interest Paid:</span>
        <span class="value interest-paid">${formatMoneyDisplay(totalInterestPaid)}</span>
      </div>
      <div class="summary-card-row">
        <span class="label">Accounts:</span>
        <span class="value">${filteredAccounts.length}</span>
      </div>
    `;
    groupWrapper.appendChild(totalCard);
  }

  container.appendChild(groupWrapper);
}

async function ensureFundSettingsInitialized() {
  const typeConfig = getScenarioTypeConfig();
  if (!isFundsScenario(typeConfig)) {
    return;
  }

  const current = currentScenario?.fundSettings;
  const hasLocked = current && typeof current.lockedSharesByAccountId === 'object';
  const hasMode = current && typeof current.shareMode === 'string';

  if (hasLocked && hasMode) {
    return;
  }

  const nextFundSettings = {
    ...getDefaultFundSettings(),
    ...(current || {})
  };

  await ScenarioManager.update(currentScenario.id, { fundSettings: nextFundSettings });
  currentScenario = await getScenario(currentScenario.id);
}

async function loadFundsSummaryCards(container) {
  if (!container) {
    return;
  }

  if (!currentScenario) {
    container.innerHTML = '';
    return;
  }

  await ensureFundSettingsInitialized();

  const accounts = currentScenario.accounts || [];
  const projectionsIndex = buildProjectionsIndex(currentScenario.projections || []);
  const fundSettings = currentScenario.fundSettings || getDefaultFundSettings();

  const scopeOptions = ['All', 'Asset', 'Liability', 'Equity', 'Income', 'Expense'];

  container.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'grid-toolbar summary-cards-toolbar';

  const scopeItem = document.createElement('div');
  scopeItem.className = 'toolbar-item';
  scopeItem.innerHTML = `
    <label for="fund-summary-scope" class="text-muted control-label">Scope:</label>
    <select id="fund-summary-scope" class="input-select control-select">
      ${scopeOptions.map(o => `<option value="${o}">${o}</option>`).join('')}
    </select>
  `;

  const modeItem = document.createElement('div');
  modeItem.className = 'toolbar-item';
  modeItem.innerHTML = `
    <label for="fund-share-mode" class="text-muted control-label">Shares:</label>
    <select id="fund-share-mode" class="input-select control-select">
      <option value="Locked">Locked</option>
      <option value="Automatic">Automatic</option>
    </select>
  `;

  const asOfItem = document.createElement('div');
  asOfItem.className = 'toolbar-item';
  asOfItem.innerHTML = `
    <label for="fund-asof-date" class="text-muted control-label">As of:</label>
    <input id="fund-asof-date" class="input control-input" type="date" />
  `;

  const effectiveItem = document.createElement('div');
  effectiveItem.className = 'toolbar-item';
  effectiveItem.innerHTML = `
    <label for="fund-auto-effective" class="text-muted control-label">Auto from:</label>
    <input id="fund-auto-effective" class="input control-input" type="date" />
  `;

  const refreshItem = document.createElement('div');
  refreshItem.className = 'toolbar-item';
  const refreshButton = document.createElement('button');
  refreshButton.className = 'btn btn-primary';
  refreshButton.textContent = 'Refresh';

  refreshButton.addEventListener('click', async () => {
    await loadFundsSummaryCards(container);
  });

  refreshItem.appendChild(refreshButton);

  toolbar.appendChild(scopeItem);
  toolbar.appendChild(modeItem);
  toolbar.appendChild(asOfItem);
  toolbar.appendChild(effectiveItem);
  toolbar.appendChild(refreshItem);
  container.appendChild(toolbar);

  const scopeSelect = scopeItem.querySelector('#fund-summary-scope');
  const modeSelect = modeItem.querySelector('#fund-share-mode');
  const asOfInput = asOfItem.querySelector('#fund-asof-date');
  const effectiveInput = effectiveItem.querySelector('#fund-auto-effective');

  if (scopeSelect) {
    scopeSelect.value = scopeOptions.includes(fundSummaryScope) ? fundSummaryScope : 'All';
    scopeSelect.addEventListener('change', async () => {
      fundSummaryScope = scopeSelect.value;
      await loadFundsSummaryCards(container);
    });
  }

  if (modeSelect) {
    modeSelect.value = fundSettings.shareMode || 'Locked';
    modeSelect.addEventListener('change', async () => {
      const nextMode = modeSelect.value;
      const next = {
        ...getDefaultFundSettings(),
        ...(currentScenario.fundSettings || {}),
        shareMode: nextMode
      };
      if (nextMode === 'Automatic' && !next.automaticEffectiveDate) {
        next.automaticEffectiveDate = currentScenario.startDate || null;
      }
      await ScenarioManager.update(currentScenario.id, { fundSettings: next });
      currentScenario = await getScenario(currentScenario.id);
      await loadFundsSummaryCards(container);
    });
  }

  if (asOfInput) {
    asOfInput.value = fundSummaryAsOfDate || '';
    asOfInput.addEventListener('change', async () => {
      fundSummaryAsOfDate = asOfInput.value || '';
      await loadFundsSummaryCards(container);
    });
  }

  if (effectiveInput) {
    effectiveInput.value = fundSettings.automaticEffectiveDate || '';
    const isAuto = (fundSettings.shareMode || 'Locked') === 'Automatic';
    effectiveInput.disabled = !isAuto;

    effectiveInput.addEventListener('change', async () => {
      const next = {
        ...getDefaultFundSettings(),
        ...(currentScenario.fundSettings || {}),
        automaticEffectiveDate: effectiveInput.value || null
      };
      await ScenarioManager.update(currentScenario.id, { fundSettings: next });
      currentScenario = await getScenario(currentScenario.id);
      await loadFundsSummaryCards(container);
    });
  }

  const asOfDate = fundSummaryAsOfDate ? parseDateOnly(fundSummaryAsOfDate) : null;
  const { nav } = computeNav({ accounts, projectionsIndex, asOfDate });

  const equityAccounts = accounts.filter(a => a?.type?.name === 'Equity');
  const sharesById = (fundSettings.shareMode === 'Automatic')
    ? computeAutomaticSharesByAccountId({ scenario: currentScenario, accounts, projectionsIndex, asOfDate, fundSettings })
    : computeLockedSharesByAccountId({ equityAccounts, fundSettings });

  const totalShares = Object.values(sharesById).reduce((sum, v) => sum + Number(v || 0), 0);
  const sharePrice = totalShares > 0 ? (nav / totalShares) : null;

  const moneyTotals = computeMoneyTotalsFromTransactions({
    transactions: currentScenario.transactions || [],
    accounts,
    scope: fundSummaryScope
  });

  const totalsCard = document.createElement('div');
  totalsCard.className = 'summary-card overall-total';
  totalsCard.innerHTML = `
    <div class="summary-card-title">FUND TOTALS</div>
    <div class="summary-card-row"><span class="label">NAV:</span><span class="value">${formatMoneyDisplay(nav)}</span></div>
    <div class="summary-card-row"><span class="label">Total shares:</span><span class="value">${Number.isFinite(totalShares) ? totalShares.toFixed(4) : '0.0000'}</span></div>
    <div class="summary-card-row"><span class="label">Share price:</span><span class="value">${sharePrice === null ? 'N/A' : formatMoneyDisplay(sharePrice)}</span></div>
    <div class="summary-card-row"><span class="label">Money In:</span><span class="value">${formatMoneyDisplay(moneyTotals.moneyIn)}</span></div>
    <div class="summary-card-row"><span class="label">Money Out:</span><span class="value">${formatMoneyDisplay(moneyTotals.moneyOut)}</span></div>
    <div class="summary-card-row"><span class="label">Net:</span><span class="value">${formatMoneyDisplay(moneyTotals.net)}</span></div>
  `;
  container.appendChild(totalsCard);

  const detailWrap = document.createElement('div');
  detailWrap.className = 'summary-cards-group';
  const detailTitle = document.createElement('div');
  detailTitle.className = 'summary-cards-group-title';
  detailTitle.textContent = fundSummaryScope === 'All' ? 'All Accounts' : `${fundSummaryScope} Accounts`;
  detailWrap.appendChild(detailTitle);

  const detailGrid = document.createElement('div');
  detailGrid.className = 'grid-container';
  detailWrap.appendChild(detailGrid);
  container.appendChild(detailWrap);

  if (fundSummaryScope === 'Equity') {
    const flows = computeInvestorFlows({ scenario: currentScenario, accounts, asOfDate });
    const rows = equityAccounts.map(a => {
      const shares = Number(sharesById[a.id] || 0);
      const ownership = totalShares > 0 ? (shares / totalShares) : 0;
      const impliedValue = sharePrice === null ? 0 : shares * sharePrice;
      const f = flows[a.id] || { contributions: 0, redemptions: 0 };
      return {
        accountId: a.id,
        name: a.name || 'Unnamed',
        shares,
        ownershipPct: ownership * 100,
        impliedValue,
        contributions: f.contributions,
        redemptions: f.redemptions
      };
    });

    const isLocked = (fundSettings.shareMode || 'Locked') === 'Locked';

    await createGrid(detailGrid, {
      data: rows,
      headerWordWrap: false,
      columns: [
        { title: 'Investor', field: 'name', headerSort: false },
        {
          title: 'Shares',
          field: 'shares',
          headerSort: false,
          hozAlign: 'right',
          editor: isLocked ? 'number' : false,
          editorParams: isLocked ? { step: 0.0001 } : undefined,
          formatter: (cell) => {
            const v = Number(cell.getValue() || 0);
            return v.toFixed(4);
          }
        },
        {
          title: 'Ownership %',
          field: 'ownershipPct',
          headerSort: false,
          hozAlign: 'right',
          formatter: (cell) => {
            const v = Number(cell.getValue() || 0);
            return v.toFixed(2) + '%';
          }
        },
        {
          title: 'Implied Value',
          field: 'impliedValue',
          headerSort: false,
          formatter: (cell) => formatMoneyDisplay(cell.getValue() || 0)
        },
        {
          title: 'Net Contributions',
          field: 'contributions',
          headerSort: false,
          formatter: (cell) => formatMoneyDisplay(cell.getValue() || 0)
        },
        {
          title: 'Net Redemptions',
          field: 'redemptions',
          headerSort: false,
          formatter: (cell) => formatMoneyDisplay(cell.getValue() || 0)
        }
      ],
      cellEdited: async (cell) => {
        if (!isLocked) return;
        if (cell.getField() !== 'shares') return;

        const row = cell.getRow().getData();
        const nextShares = Number(cell.getValue() || 0);

        const next = {
          ...getDefaultFundSettings(),
          ...(currentScenario.fundSettings || {})
        };
        next.lockedSharesByAccountId = { ...(next.lockedSharesByAccountId || {}) };
        next.lockedSharesByAccountId[row.accountId] = Number.isFinite(nextShares) ? nextShares : 0;

        await ScenarioManager.update(currentScenario.id, { fundSettings: next });
        currentScenario = await getScenario(currentScenario.id);
        await loadFundsSummaryCards(container);
      }
    });
  } else {
    const filteredAccounts = fundSummaryScope === 'All'
      ? accounts
      : accounts.filter(a => a?.type?.name === fundSummaryScope);

    const data = filteredAccounts.map(a => {
      const balance = getBalanceAsOf({ account: a, projectionsIndex, asOfDate });
      return {
        name: a.name || 'Unnamed',
        type: a?.type?.name || '',
        balance
      };
    });

    await createGrid(detailGrid, {
      data,
      headerWordWrap: false,
      ...(fundSummaryScope === 'All' ? { groupBy: 'type' } : {}),
      columns: [
        { title: 'Account', field: 'name', headerSort: false },
        ...(fundSummaryScope === 'All' ? [{ title: 'Type', field: 'type', headerSort: false }] : []),
        { title: 'Balance', field: 'balance', headerSort: false, formatter: (cell) => formatMoneyDisplay(cell.getValue() || 0) }
      ]
    });
  }
}

async function loadGeneralSummaryCards(container) {
  if (!container) {
    return;
  }

  if (!currentScenario || !currentScenario.type) {
    container.innerHTML = '';
    return;
  }

  if (!masterTransactionsTable) {
    container.innerHTML = '<div class="empty-message">No transactions to summarize yet.</div>';
    return;
  }

  const rows = masterTransactionsTable.getData('active') || [];
  if (!rows.length) {
    container.innerHTML = '<div class="empty-message">No transactions to summarize yet.</div>';
    return;
  }

  const totals = calculateCategoryTotals(rows, {
    amountField: 'amount',
    typeField: 'transactionType',
    typeNameField: 'transactionTypeName',
    typeIdField: 'transactionTypeId'
  });

  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'summary-cards-groups';

  const card = document.createElement('div');
  card.className = 'summary-card overall-total';
  card.innerHTML = `
    <div class="summary-card-title">OVERALL TOTAL</div>
    <div class="summary-card-row">
      <span class="label">Money In:</span>
      <span class="value positive">${formatMoneyDisplay(totals.moneyIn || 0)}</span>
    </div>
    <div class="summary-card-row">
      <span class="label">Money Out:</span>
      <span class="value negative">${formatMoneyDisplay(totals.moneyOut || 0)}</span>
    </div>
    <div class="summary-card-row">
      <span class="label">Net:</span>
      <span class="value ${totals.net >= 0 ? 'positive' : 'negative'}">${formatMoneyDisplay(totals.net || 0)}</span>
    </div>
  `;

  wrapper.appendChild(card);
  container.appendChild(wrapper);
}

async function loadSummaryCards(container) {
  const typeConfig = getScenarioTypeConfig();
  if (!typeConfig?.showSummaryCards) {
    if (container) container.innerHTML = '';
    return;
  }

  if (isDebtScenario(typeConfig)) {
    await loadDebtSummaryCards(container);
    return;
  }

  if (isGeneralScenario(typeConfig)) {
    await loadGeneralSummaryCards(container);
    return;
  }

  if (isFundsScenario(typeConfig)) {
    await loadFundsSummaryCards(container);
    return;
  }
}

async function refreshSummaryCards() {
  const typeConfig = getScenarioTypeConfig();
  if (!typeConfig?.showSummaryCards) {
    return;
  }

  // Minimal plan requirement: General + Funds summaries refresh after edits.
  if (!isGeneralScenario(typeConfig) && !isFundsScenario(typeConfig)) {
    return;
  }

  await loadSummaryCards(getEl('summaryCardsContent'));
}

// Load projections section (buttons and grid)
async function loadProjectionsSection(container) {
  return loadProjectionsSectionCore({
    container,
    scenarioState: {
      get: () => currentScenario,
      set: (nextScenario) => {
        currentScenario = nextScenario;
      }
    },
    getScenarioTypeConfig,
    state: {
      getTransactionFilterAccountId: () => transactionFilterAccountId,
      setTransactionFilterAccountId: (nextId) => {
        transactionFilterAccountId = nextId;
      },
      getProjectionPeriod: () => projectionPeriod,
      setProjectionPeriod: (nextPeriod) => {
        projectionPeriod = nextPeriod;
      },
      getProjectionPeriodType: () => projectionPeriodType,
      setProjectionPeriodType: (nextType) => {
        projectionPeriodType = nextType;
      },
      getProjectionPeriods: () => projectionPeriods,
      setProjectionPeriods: (nextPeriods) => {
        projectionPeriods = nextPeriods;
      }
    },
    tables: {
      getMasterTransactionsTable: () => masterTransactionsTable,
      getMasterBudgetTable: () => masterBudgetTable
    },
    callbacks: {
      loadBudgetGrid,
      loadSummaryCards,
      updateTransactionTotals,
      updateBudgetTotals,
      updateProjectionTotals,
      getFilteredProjections,
      getEl
    },
    logger
  });
}

// Load projections grid
async function loadProjectionsGrid(container) {
  return loadProjectionsGridCore({
    container,
    scenarioState: {
      get: () => currentScenario,
      set: (nextScenario) => {
        currentScenario = nextScenario;
      }
    },
    state: {
      getTransactionFilterAccountId: () => transactionFilterAccountId,
      setTransactionFilterAccountId: (nextId) => {
        transactionFilterAccountId = nextId;
      },
      getProjectionPeriod: () => projectionPeriod,
      setProjectionPeriod: (nextPeriod) => {
        projectionPeriod = nextPeriod;
      },
      getProjectionPeriodType: () => projectionPeriodType,
      setProjectionPeriodType: (nextType) => {
        projectionPeriodType = nextType;
      },
      getProjectionPeriods: () => projectionPeriods,
      setProjectionPeriods: (nextPeriods) => {
        projectionPeriods = nextPeriods;
      }
    },
    tables: {
      getMasterTransactionsTable: () => masterTransactionsTable,
      getMasterBudgetTable: () => masterBudgetTable
    },
    callbacks: {
      getFilteredProjections,
      updateProjectionTotals,
      getEl
    },
    logger
  });
}

// Load all data for current scenario
async function loadScenarioData() {
  const containers = {
    accountsTable: getEl('accountsTable'),
    transactionsTable: getEl('transactionsTable'),
    budgetTable: getEl('budgetTable'),
    projectionsContent: getEl('projectionsContent'),
    summaryCardsContent: getEl('summaryCardsContent')
  };

  const typeConfig = getScenarioTypeConfig();

  if (typeConfig?.id === 3) { // Funds scenario type
    await ensureFundSettingsInitialized();
  }
  
  // Show/hide sections based on scenario type
  const accountsSection = getEl('accountsTable').closest('.bg-main');
  const generatePlanSection = getEl('generatePlanSection');
  const txSection = getEl('transactionsTable').closest('.bg-main');
  const budgetSection = getEl('budgetSection');
  const projectionsSection = getEl('projectionsSection');
  const summaryCardsSection = getEl('summaryCardsSection');
  
  if (typeConfig) {
    if (typeConfig.showAccounts) accountsSection.classList.remove('hidden'); else accountsSection.classList.add('hidden');
    if (typeConfig.showGeneratePlan) generatePlanSection.style.display = 'block'; else generatePlanSection.style.display = 'none';
    if (typeConfig.showPlannedTransactions || typeConfig.showActualTransactions) txSection.classList.remove('hidden'); else txSection.classList.add('hidden');
    if (typeConfig.showProjections) projectionsSection.classList.remove('hidden'); else projectionsSection.classList.add('hidden');
    if (typeConfig.showBudget !== false) budgetSection.classList.remove('hidden'); else budgetSection.classList.add('hidden');
    if (typeConfig.showSummaryCards) summaryCardsSection.classList.remove('hidden'); else summaryCardsSection.classList.add('hidden');
  }

  // Clear downstream grids to prevent ghost data
  containers.transactionsTable.innerHTML = '<div class="empty-message">Loading...</div>';
  containers.budgetTable.innerHTML = '<div class="empty-message">Loading...</div>';

  await loadAccountsGrid(containers.accountsTable);
  
  // Load Generate Plan section if applicable
  if (typeConfig && typeConfig.showGeneratePlan) {
    await loadGeneratePlanSection(getEl('generatePlanContent'));
  }
  
  // Load transactions grid initially (filtering will be applied by account selection)
  // Period calculation happens inside each grid load function
  await loadMasterTransactionsGrid(containers.transactionsTable);

  if (typeConfig.showBudget !== false) {
    await loadBudgetGrid(containers.budgetTable);
  } else {
    containers.budgetTable.innerHTML = '';
  }
  await loadProjectionsSection(containers.projectionsContent);
  
  // Load summary cards AFTER projections so they have data to work with
  if (typeConfig.showSummaryCards) {
    await loadSummaryCards(containers.summaryCardsContent);
  }
}

// Initialize the page
async function init() {
  
  loadGlobals();
  
  // Run data migration if needed
  try {
    const { needsMigration, migrateAllScenarios } = await import('../../app/services/migration-service.js');
    if (await needsMigration()) {
      await migrateAllScenarios();
    }
  } catch (error) {
    notifyError('Data migration failed: ' + (error?.message || 'Unknown error'));
  }
  
  const containers = buildGridContainer();
  
  await loadScenarioTypes();
  
  await buildScenarioGrid(containers.scenarioSelector);
  
  // loadScenarioData is now called from buildScenarioGrid when initial scenario is set
  
  initializeKeyboardShortcuts();

  document.addEventListener('forecast:accountsUpdated', async () => {
    try {
      await refreshSummaryCards();
    } catch (e) {
      // keep existing behavior: ignore
    }
  });
  
}

/**
 * Initialize keyboard shortcut event listeners
 */
function initializeKeyboardShortcuts() {
  // Listen for shortcut events
  document.addEventListener('shortcut:generateProjections', async () => {
    if (currentScenario) {
      const projectionsContainer = document.getElementById('projectionsContent');
      if (projectionsContainer) {
        await loadProjectionsSection(projectionsContainer);
      }
    }
  });

  document.addEventListener('shortcut:save', async () => {
    // Save is automatic on cell edit, so just show feedback
  });

  // Add visual indicator for keyboard shortcuts
  const shortcutsBtn = document.createElement('button');
  shortcutsBtn.className = 'btn btn-secondary';
  shortcutsBtn.innerHTML = '⌨️ Shortcuts';
  shortcutsBtn.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 100; padding: 10px 16px; border-radius: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);';
  shortcutsBtn.title = 'View keyboard shortcuts (or press ?)';
  shortcutsBtn.addEventListener('click', () => {
    keyboardShortcuts.showHelp();
  });
  document.body.appendChild(shortcutsBtn);
}

init().catch(err => {
  notifyError('Initialization failed: ' + (err?.message || 'Unknown error'));
});
