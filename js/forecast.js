// forecast.js
// Manages the Forecast page with scenario-centric model
// Displays accounts, planned transactions, actual transactions, and projections based on scenario type


import { createGrid, createSelectorColumn, createTextColumn, createObjectColumn, createDateColumn, createMoneyColumn, createListEditor, formatMoneyDisplay, createDeleteColumn, createDuplicateColumn } from './grid-factory.js';
import { attachGridHandlers } from './grid-handlers.js';
import * as ScenarioManager from './managers/scenario-manager.js';
import * as AccountManager from './managers/account-manager.js';
import * as TransactionManager from './managers/transaction-manager.js';
import * as BudgetManager from './managers/budget-manager.js';
import { openRecurrenceModal } from './modal-recurrence.js';
import { openPeriodicChangeModal } from './modal-periodic-change.js';
import { getPeriodicChangeDescription } from './periodic-change-utils.js';
import { openTextInputModal } from './modal-text-input.js';
import keyboardShortcuts from './keyboard-shortcuts.js';
import { loadGlobals } from './global-app.js';
import { createLogger } from './logger.js';
import { notifyError, notifySuccess } from './notifications.js';
import { normalizeCanonicalTransaction, transformTransactionToRows, mapEditToCanonical } from './transaction-row-transformer.js';
import { renderMoneyTotals, renderBudgetTotals } from './toolbar-totals.js';
import { loadLookup } from './lookup-loader.js';
import { buildGridContainer } from './forecast/forecast-layout.js';
import {
  updateTransactionTotals as updateTransactionTotalsCore,
  updateBudgetTotals as updateBudgetTotalsCore
} from './forecast/forecast-totals.js';
import {
  getFilteredProjections as getFilteredProjectionsCore,
  updateProjectionTotals as updateProjectionTotalsCore
} from './forecast/forecast-projections.js';
import {
  transformPlannedTxForUI as transformPlannedTxForUICore,
  transformActualTxForUI as transformActualTxForUICore,
  mapTxToUI as mapTxToUICore
} from './forecast/forecast-tx-ui.js';
import { loadGeneratePlanSection as loadGeneratePlanSectionCore } from './forecast/forecast-generate-plan.js';
import {
  buildAccountsGridColumns as buildAccountsGridColumnsCore,
  loadAccountsGrid as loadAccountsGridCore
} from './forecast/forecast-accounts-grid.js';
import { loadMasterTransactionsGrid as loadMasterTransactionsGridCore } from './forecast/forecast-transactions-grid.js';
import { loadBudgetGrid as loadBudgetGridCore } from './forecast/forecast-budget-grid.js';
import {
  loadProjectionsSection as loadProjectionsSectionCore,
  loadProjectionsGrid as loadProjectionsGridCore
} from './forecast/forecast-projections-section.js';

const logger = createLogger('ForecastController');

import { formatDateOnly, parseDateOnly } from './date-utils.js';
import { generateRecurrenceDates } from './calculation-utils.js';
import { expandTransactions } from './transaction-expander.js';
import { getRecurrenceDescription } from './recurrence-utils.js';
import { calculateCategoryTotals, calculateBudgetTotals } from './financial-utils.js';
import { calculateContributionAmount, calculateMonthsToGoal, calculateFutureValue, calculateMonthsBetweenDates, getFrequencyName, getFrequencyInMonths, convertContributionFrequency, getGoalSummary } from './goal-calculation-utils.js';

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
} from './data-manager.js';
import { generateProjections, clearProjections } from './projection-engine.js';

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
  
  return scenarioTypes.find(st => st.name === currentScenario.type.name);
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
      loadDebtSummaryCards,
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
  
  await loadBudgetGrid(containers.budgetTable);
  await loadProjectionsSection(containers.projectionsContent);
  
  // Load summary cards AFTER projections so they have data to work with
  if (typeConfig.showSummaryCards) {
    await loadDebtSummaryCards(containers.summaryCardsContent);
  }
}

// Initialize the page
async function init() {
  
  loadGlobals();
  
  // Run data migration if needed
  try {
    const { needsMigration, migrateAllScenarios } = await import('./data-migration.js');
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
