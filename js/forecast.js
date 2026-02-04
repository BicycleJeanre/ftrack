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
import { normalizeCanonicalTransaction, transformTransactionToRows, mapEditToCanonical } from './transaction-row-transformer.js';
import { renderMoneyTotals, renderBudgetTotals } from './toolbar-totals.js';
import { loadLookup } from './lookup-loader.js';

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
let budgetPeriod = null; // Selected period for budget view
let budgetPeriodType = 'Month'; // Selected period type for budget view
let periods = []; // Calculated periods for current scenario
let budgetGridLoadToken = 0; // Prevent stale budget renders
let masterTransactionsTable = null; // Store transactions table instance for filtering
let masterBudgetTable = null; // Store budget table instance for filtering

// Update transaction totals in toolbar based on current filtered data
function updateTransactionTotals(filteredRows = null) {
  if (!masterTransactionsTable) {
    return;
  }

  // Get currently visible (filtered) data from provided rows or table
  const visibleData = filteredRows ? filteredRows.map(r => r.getData()) : masterTransactionsTable.getData('active');

  
  // Compute totals from visible data
  const txTotals = calculateCategoryTotals(visibleData, {
    amountField: 'amount',
    typeField: 'transactionType',
    typeNameField: 'transactionTypeName',
    typeIdField: 'transactionTypeId'
  });
  
  // Update toolbar totals
  const toolbarTotals = document.querySelector('#transactionsContent .toolbar-totals');
  renderMoneyTotals(toolbarTotals, txTotals);
}

// Update budget totals in toolbar based on current filtered data
function updateBudgetTotals(filteredRows = null) {
  if (!masterBudgetTable) {
    return;
  }

  // Get currently visible (filtered) data from provided rows or table
  const visibleData = filteredRows ? filteredRows.map(r => r.getData()) : masterBudgetTable.getData('active');
  
  // Compute totals from visible data including budget-specific metrics
  const budgetTotals = calculateBudgetTotals(visibleData, {
    plannedField: 'plannedAmount',
    actualField: 'actualAmount',
    typeField: 'transactionType',
    typeNameField: 'transactionTypeName',
    typeIdField: 'transactionTypeId'
  });
  
  // Update toolbar totals
  const toolbarTotals = document.querySelector('#budgetContent .toolbar-totals');
  renderBudgetTotals(toolbarTotals, budgetTotals);
}



// Build the main UI container with independent accordions
function buildGridContainer() {
  const forecastEl = getEl('panel-forecast');

  // Scenarios section with accordion (at the top)
  const scenarioSection = document.createElement('div');
  scenarioSection.className = 'bg-main bordered rounded shadow-lg mb-lg';
  
  const scenarioHeader = document.createElement('div');
  scenarioHeader.className = 'pointer flex-between accordion-header section-padding';
  scenarioHeader.innerHTML = `<h2 class="text-main section-title">Scenarios</h2><span class="accordion-arrow">&#9662;</span>`;
  scenarioHeader.addEventListener('click', () => window.toggleAccordion('scenarioContent'));
  window.add(scenarioSection, scenarioHeader);
  
  const scenarioContent = document.createElement('div');
  scenarioContent.id = 'scenarioContent';
  scenarioContent.className = 'accordion-content hidden';
  window.add(scenarioSection, scenarioContent);
  
  const scenarioSelector = document.createElement('div');
  scenarioSelector.id = 'scenario-selector';
  window.add(scenarioContent, scenarioSelector);
  window.add(forecastEl, scenarioSection);

  // Accounts section with accordion
  const accountsSection = document.createElement('div');
  accountsSection.className = 'bg-main bordered rounded shadow-lg mb-lg';
  
  const accountsHeader = document.createElement('div');
  accountsHeader.className = 'pointer flex-between accordion-header section-padding';
  accountsHeader.innerHTML = `<h2 class="text-main section-title">Accounts</h2><span class="accordion-arrow">&#9662;</span>`;  
  accountsHeader.addEventListener('click', () => window.toggleAccordion('accountsContent'));
  window.add(accountsSection, accountsHeader);
  
  const accountsContent = document.createElement('div');
  accountsContent.id = 'accountsContent';
  accountsContent.className = 'accordion-content hidden';
  window.add(accountsSection, accountsContent);
  
  const accountsTable = document.createElement('div');
  accountsTable.id = 'accountsTable';
  window.add(accountsContent, accountsTable);
  window.add(forecastEl, accountsSection);

  // Generate Plan section (Goal-Based scenarios only)
  const generatePlanSection = document.createElement('div');
  generatePlanSection.id = 'generatePlanSection';
  generatePlanSection.className = 'bg-main bordered rounded shadow-lg mb-lg';
  generatePlanSection.style.display = 'none'; // Hidden by default
  
  const generatePlanHeader = document.createElement('div');
  generatePlanHeader.className = 'pointer flex-between accordion-header section-padding';
  generatePlanHeader.innerHTML = `<h2 class="text-main section-title">Generate Plan</h2><span class="accordion-arrow">&#9662;</span>`;
  generatePlanHeader.addEventListener('click', () => window.toggleAccordion('generatePlanContent'));
  window.add(generatePlanSection, generatePlanHeader);
  
  const generatePlanContent = document.createElement('div');
  generatePlanContent.id = 'generatePlanContent';
  generatePlanContent.className = 'accordion-content hidden';
  window.add(generatePlanSection, generatePlanContent);
  window.add(forecastEl, generatePlanSection);

  // Transactions section (unified planned and actual)
  const transactionsSection = document.createElement('div');
  transactionsSection.className = 'bg-main bordered rounded shadow-lg mb-lg';

  const transactionsHeader = document.createElement('div');
  transactionsHeader.className = 'pointer flex-between accordion-header section-padding';
  transactionsHeader.innerHTML = `<h2 class="text-main section-title">Transactions</h2><span class="accordion-arrow">&#9662;</span>`;
  transactionsHeader.addEventListener('click', () => window.toggleAccordion('transactionsContent'));
  window.add(transactionsSection, transactionsHeader);

  const transactionsContent = document.createElement('div');
  transactionsContent.id = 'transactionsContent';
  transactionsContent.className = 'accordion-content section-content hidden';
  window.add(transactionsSection, transactionsContent);

  const transactionsTable = document.createElement('div');
  transactionsTable.id = 'transactionsTable';
  window.add(transactionsContent, transactionsTable);

  window.add(forecastEl, transactionsSection);
  
  // Budget section
  const budgetSection = document.createElement('div');
  budgetSection.id = 'budgetSection';
  budgetSection.className = 'bg-main bordered rounded shadow-lg mb-lg';

  const budgetHeader = document.createElement('div');
  budgetHeader.id = 'budgetAccordionHeader';
  budgetHeader.className = 'pointer flex-between accordion-header section-padding';
  budgetHeader.innerHTML = `<h2 class="text-main section-title">Budget</h2><span class="accordion-arrow">&#9662;</span>`;
  budgetHeader.addEventListener('click', () => window.toggleAccordion('budgetContent'));
  window.add(budgetSection, budgetHeader);

  const budgetContent = document.createElement('div');
  budgetContent.id = 'budgetContent';
  budgetContent.className = 'accordion-content section-content hidden';
  window.add(budgetSection, budgetContent);

  const budgetTable = document.createElement('div');
  budgetTable.id = 'budgetTable';
  window.add(budgetContent, budgetTable);

  window.add(forecastEl, budgetSection);

  // Projections section (full width)
  const projectionsSection = document.createElement('div');
  projectionsSection.id = 'projectionsSection';
  projectionsSection.className = 'bg-main bordered rounded shadow-lg';
  projectionsSection.classList.add('mb-lg');

  const projectionsHeader = document.createElement('div');
  projectionsHeader.id = 'projectionsAccordionHeader';
  projectionsHeader.className = 'pointer flex-between accordion-header section-padding';
  projectionsHeader.innerHTML = `<h2 class="text-main section-title">Projections</h2><span class="accordion-arrow">&#9662;</span>`;
  projectionsHeader.addEventListener('click', () => window.toggleAccordion('projectionsContent'));
  window.add(projectionsSection, projectionsHeader);

  const projectionsContent = document.createElement('div');
  projectionsContent.id = 'projectionsContent';
  projectionsContent.className = 'accordion-content hidden';
  window.add(projectionsSection, projectionsContent);
  window.add(forecastEl, projectionsSection);

  return {
    scenarioSelector,
    accountsTable,
    transactionsTable,
    budgetTable,
    projectionsContent
  };
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
        console.error('[Forecast] ✗ Failed to save scenario:', err);
        alert('Failed to save scenario: ' + err.message);
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
      // Select the first row visually without triggering the handler
      // (data is already loaded above, so we don't want duplicate load)
      const firstRow = scenariosTable.getRows()[0];
      if (firstRow) {
        firstRow.select();
      }
    }
  } catch (err) {
    console.error('[Forecast] Failed to load scenario grid:', err);
  }
}

// Load scenario type configuration
async function loadScenarioTypes() {
  try {
    const data = await loadLookup('lookup-data.json');
    scenarioTypes = data.scenarioTypes;
  } catch (err) {
    console.error('[Forecast] Failed to load scenario types:', err);
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
  const selIdNum = transactionFilterAccountId != null ? Number(transactionFilterAccountId) : null;

  // logger.debug(`[Transform] transformPlannedTxForUI - Processing ${plannedTxs.length} total transactions for account ${selIdNum}`);

  const result = plannedTxs.map((tx, index) => {
    if (!selIdNum) {
      // Default view when no account is selected: show all transactions
      const secondaryAccount = tx.secondaryAccountId 
        ? currentScenario.accounts?.find(a => a.id === tx.secondaryAccountId) || { id: tx.secondaryAccountId }
        : null;
      return {
        ...tx,
        transactionType: { id: 1, name: 'Money Out' },
        secondaryAccount
      };
    }

    const mapped = mapTxToUI(tx, selIdNum);
    if (!mapped) return null;

    return {
      ...tx,
      amount: mapped.amount, // Use potentially flipped amount
      transactionType: mapped.transactionType,
      secondaryAccount: mapped.secondaryAccount
    };
  }).filter(tx => tx !== null);

  return result;
}



/**
 * Transform actual transactions for UI (same as planned transactions)
 */
function transformActualTxForUI(actualTxs, transactionFilterAccountId) {
  const selIdNum = transactionFilterAccountId != null ? Number(transactionFilterAccountId) : null;

  // When no account selected, show all actual transactions (default view)
  if (!selIdNum) return actualTxs.map(tx => {
    const secondaryAccount = tx.secondaryAccountId 
      ? currentScenario.accounts?.find(a => a.id === tx.secondaryAccountId) || { id: tx.secondaryAccountId }
      : null;
    return {
      ...tx,
      transactionType: tx.transactionType || (tx.transactionTypeId === 1 ? { id: 1, name: 'Money In' } : { id: 2, name: 'Money Out' }),
      secondaryAccount
    };
  });

  return actualTxs.map(tx => {
    const mapped = mapTxToUI(tx, selIdNum);
    if (!mapped) return null;
    return { ...tx, transactionType: mapped.transactionType, secondaryAccount: mapped.secondaryAccount };
  }).filter(tx => tx !== null);
}

/**
 * Map a backend transaction to UI representation for a selected account.
 * Returns null if the transaction does not involve the selected account.
 */
function mapTxToUI(tx, transactionFilterAccountId) {
  const selIdNum = transactionFilterAccountId != null ? Number(transactionFilterAccountId) : null;
  if (!selIdNum) return null;

  // Check if selected account matches the stored primary or secondary account ID
  const storedPrimaryId = tx.primaryAccountId;
  const storedSecondaryId = tx.secondaryAccountId;
  const storedTypeId = tx.transactionTypeId || tx.transactionType?.id;
  
  const isStoredPrimary = Number(storedPrimaryId) === selIdNum;
  const isStoredSecondary = Number(storedSecondaryId) === selIdNum;
  
  // Only show transactions where the selected account is involved
  if (!isStoredPrimary && !isStoredSecondary) return null;

  if (isStoredPrimary) {
    // Selected account IS the stored primary - show as-is
    const primaryAccount = currentScenario.accounts?.find(a => a.id === selIdNum) || { id: selIdNum };
    const secondaryAccount = storedSecondaryId 
      ? currentScenario.accounts?.find(a => a.id === storedSecondaryId) || { id: storedSecondaryId }
      : null;
    const transactionType = storedTypeId === 1 ? { id: 1, name: 'Money In' } : { id: 2, name: 'Money Out' };
    return { 
      transactionType, 
      secondaryAccount, 
      primaryAccount,
      amount: tx.amount // Keep amount as-is for primary perspective
    };
  } else {
    // Selected account IS the stored secondary - FLIP the perspective
    const primaryAccount = currentScenario.accounts?.find(a => a.id === selIdNum) || { id: selIdNum };
    const secondaryAccount = storedPrimaryId
      ? currentScenario.accounts?.find(a => a.id === storedPrimaryId) || { id: storedPrimaryId }
      : null;
    // Flip the transaction type: Money In becomes Money Out and vice versa
    const transactionType = storedTypeId === 1 ? { id: 2, name: 'Money Out' } : { id: 1, name: 'Money In' };
    // Flip the amount sign for the flipped perspective
    const flippedAmount = -(tx.amount || 0);
    return { 
      transactionType, 
      secondaryAccount, 
      primaryAccount,
      amount: flippedAmount // Flip the sign when viewing from secondary perspective
    };
  }
}

/**
 * Load the Generate Plan section for goal-based scenarios
 */
async function loadGeneratePlanSection(container) {
  if (!currentScenario) {
    container.innerHTML = '<div class="empty-message">No scenario selected</div>';
    return;
  }

  const accounts = currentScenario.accounts || [];
  const displayAccounts = accounts.filter(a => a.name !== 'Select Account' && (a.goalAmount !== null || a.goalAmount !== undefined));
  
  if (displayAccounts.length === 0) {
    container.innerHTML = '<div class="empty-message">No accounts with goals found. Set goal amounts and dates on accounts to generate plans.</div>';
    return;
  }

  container.innerHTML = '';

  const lookupData = await loadLookup('lookup-data.json');

  // Create form container
  const formContainer = document.createElement('div');
  formContainer.className = 'generate-plan-form';
  formContainer.style.padding = '16px';

  // Account selector
  const accountRowDiv = document.createElement('div');
  accountRowDiv.style.marginBottom = '16px';
  accountRowDiv.innerHTML = `
    <label for="goal-account-select" class="control-label">Select Account:</label>
    <select id="goal-account-select" class="input-select" style="width: 100%; padding: 8px;">
      <option value="">-- Choose an account --</option>
      ${displayAccounts.map(acc => `<option value="${acc.id}">${acc.name} (Goal: ${formatMoneyDisplay(acc.goalAmount)} by ${acc.goalDate})</option>`).join('')}
    </select>
  `;
  window.add(formContainer, accountRowDiv);

  // Solve For selector
  const solveForDiv = document.createElement('div');
  solveForDiv.style.marginBottom = '16px';
  solveForDiv.innerHTML = `
    <label for="goal-solve-for" class="control-label">Solve For:</label>
    <select id="goal-solve-for" class="input-select" style="width: 100%; padding: 8px;">
      <option value="contribution">Contribution Amount</option>
      <option value="date">Goal Date</option>
      <option value="amount">Goal Amount</option>
    </select>
  `;
  window.add(formContainer, solveForDiv);

  // Frequency selector
  const frequencyDiv = document.createElement('div');
  frequencyDiv.style.marginBottom = '16px';
  frequencyDiv.innerHTML = `
    <label for="goal-frequency" class="control-label">Contribution Frequency:</label>
    <select id="goal-frequency" class="input-select" style="width: 100%; padding: 8px;">
      <option value="2">Weekly</option>
      <option value="3" selected>Monthly</option>
      <option value="4">Quarterly</option>
      <option value="5">Yearly</option>
    </select>
  `;
  window.add(formContainer, frequencyDiv);

  // Contribution Amount input (editable when solving for date/amount)
  const contributionDiv = document.createElement('div');
  contributionDiv.style.marginBottom = '16px';
  contributionDiv.innerHTML = `
    <label for="goal-contribution" class="control-label">Contribution Amount:</label>
    <input type="number" id="goal-contribution" class="input-text" placeholder="0.00" step="0.01" style="width: 100%; padding: 8px;" />
  `;
  window.add(formContainer, contributionDiv);

  // Results/Summary area
  const summaryDiv = document.createElement('div');
  summaryDiv.id = 'goal-summary';
  summaryDiv.style.marginBottom = '16px';
  summaryDiv.style.padding = '12px';
  summaryDiv.style.backgroundColor = '#f5f5f5';
  summaryDiv.style.borderRadius = '4px';
  summaryDiv.style.minHeight = '40px';
  summaryDiv.innerHTML = '<p class="text-muted">Select an account and adjust parameters to see calculations</p>';
  window.add(formContainer, summaryDiv);

  // Buttons
  const buttonDiv = document.createElement('div');
  buttonDiv.style.display = 'flex';
  buttonDiv.style.gap = '8px';
  buttonDiv.style.marginBottom = '16px';

  const generateBtn = document.createElement('button');
  generateBtn.className = 'btn btn-primary';
  generateBtn.textContent = 'Generate Plan';
  generateBtn.id = 'goal-generate-btn';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn btn-secondary';
  resetBtn.textContent = 'Reset';
  resetBtn.id = 'goal-reset-btn';

  window.add(buttonDiv, generateBtn);
  window.add(buttonDiv, resetBtn);
  window.add(formContainer, buttonDiv);

  window.add(container, formContainer);

  // Store state for generate plan
  let generatePlanState = {
    selectedAccountId: null,
    solveFor: 'contribution',
    frequency: 3, // Monthly
    contribution: 0,
    lookupData: lookupData
  };

  // Attach event listeners
  const accountSelect = document.getElementById('goal-account-select');
  const solveForSelect = document.getElementById('goal-solve-for');
  const frequencySelect = document.getElementById('goal-frequency');
  const contributionInput = document.getElementById('goal-contribution');
  const summaryEl = document.getElementById('goal-summary');
  const generateBtnEl = document.getElementById('goal-generate-btn');
  const resetBtnEl = document.getElementById('goal-reset-btn');

  // Recalculate display whenever inputs change
  async function updateSummary() {
    const selectedId = parseInt(accountSelect.value);
    if (!selectedId) {
      summaryEl.innerHTML = '<p class="text-muted">Select an account to begin</p>';
      return;
    }

    const selectedAccount = displayAccounts.find(a => a.id === selectedId);
    if (!selectedAccount || !selectedAccount.goalAmount || !selectedAccount.goalDate) {
      summaryEl.innerHTML = '<p class="error-message">Selected account does not have goal parameters set</p>';
      return;
    }

    const solveFor = solveForSelect.value;
    const frequency = parseInt(frequencySelect.value);
    const contribution = parseFloat(contributionInput.value) || 0;

    generatePlanState.selectedAccountId = selectedId;
    generatePlanState.solveFor = solveFor;
    generatePlanState.frequency = frequency;
    generatePlanState.contribution = contribution;

    // Calculate the requested value
    const monthsToGoal = calculateMonthsBetweenDates(formatDateOnly(new Date()), selectedAccount.goalDate);
    const startingBalance = selectedAccount.startingBalance || 0;
    const goalAmount = selectedAccount.goalAmount;
    const annualRate = selectedAccount.periodicChange?.rateValue || 0;

    let summary = '';
    let error = '';

    if (solveFor === 'contribution') {
      if (monthsToGoal <= 0) {
        error = 'Goal date must be in the future';
      } else {
        const calculatedContribution = calculateContributionAmount(startingBalance, goalAmount, monthsToGoal, annualRate);
        const displayContribution = convertContributionFrequency(calculatedContribution, 3, frequency); // Convert from monthly
        contributionInput.value = displayContribution.toFixed(2);
        summary = `<strong>${getFrequencyName(frequency).toLowerCase()}</strong> contribution: <strong>${formatMoneyDisplay(displayContribution)}</strong><br/><small>to reach ${formatMoneyDisplay(goalAmount)} by ${selectedAccount.goalDate}</small>`;
      }
    } else if (solveFor === 'date') {
      if (contribution <= 0) {
        error = 'Contribution amount must be greater than 0';
      } else {
        const monthlyContribution = convertContributionFrequency(contribution, frequency, 3); // Convert to monthly
        const monthsNeeded = calculateMonthsToGoal(startingBalance, goalAmount, monthlyContribution, annualRate);
        if (monthsNeeded === null) {
          error = 'Goal is not reachable with the given contribution amount';
        } else {
          const daysInMonths = Math.ceil(monthsNeeded);
          const futureDate = new Date();
          futureDate.setMonth(futureDate.getMonth() + daysInMonths);
          const formattedDate = formatDateOnly(futureDate);
          summary = `<strong>Target date:</strong> ${formattedDate}<br/><small>at ${getFrequencyName(frequency).toLowerCase()} contribution of ${formatMoneyDisplay(contribution)}</small>`;
        }
      }
    } else if (solveFor === 'amount') {
      if (monthsToGoal <= 0) {
        error = 'Goal date must be in the future';
      } else if (contribution <= 0) {
        error = 'Contribution amount must be greater than 0';
      } else {
        const monthlyContribution = convertContributionFrequency(contribution, frequency, 3); // Convert to monthly
        const projectedAmount = calculateFutureValue(startingBalance, monthlyContribution, monthsToGoal, annualRate);
        summary = `<strong>Projected goal amount:</strong> ${formatMoneyDisplay(projectedAmount)}<br/><small>with ${getFrequencyName(frequency).toLowerCase()} contribution of ${formatMoneyDisplay(contribution)} by ${selectedAccount.goalDate}</small>`;
      }
    }

    if (error) {
      summaryEl.innerHTML = `<p class="error-message">${error}</p>`;
      generateBtnEl.disabled = true;
    } else {
      summaryEl.innerHTML = summary;
      generateBtnEl.disabled = false;
    }
  }

  accountSelect.addEventListener('change', updateSummary);
  solveForSelect.addEventListener('change', () => {
    // Reset contribution when changing solve-for
    if (solveForSelect.value !== 'contribution') {
      contributionInput.disabled = false;
      contributionInput.focus();
    } else {
      contributionInput.disabled = true;
    }
    updateSummary();
  });
  frequencySelect.addEventListener('change', updateSummary);
  contributionInput.addEventListener('input', updateSummary);

  // Handle Generate button
  generateBtnEl.addEventListener('click', async () => {
    const selectedId = parseInt(accountSelect.value);
    if (!selectedId) {
      alert('Please select an account');
      return;
    }

    const selectedAccount = displayAccounts.find(a => a.id === selectedId);
    if (!selectedAccount || !selectedAccount.goalAmount || !selectedAccount.goalDate) {
      alert('Account does not have goal parameters set');
      return;
    }

    const solveFor = solveForSelect.value;
    const frequency = parseInt(frequencySelect.value);
    const contribution = parseFloat(contributionInput.value) || 0;
    const monthsToGoal = calculateMonthsBetweenDates(formatDateOnly(new Date()), selectedAccount.goalDate);
    const startingBalance = selectedAccount.startingBalance || 0;
    const goalAmount = selectedAccount.goalAmount;
    const annualRate = selectedAccount.periodicChange?.rateValue || 0;

    let monthlyContribution = contribution;

    // Calculate contribution amount if not already solved for
    if (solveFor === 'contribution') {
      monthlyContribution = calculateContributionAmount(startingBalance, goalAmount, monthsToGoal, annualRate);
    } else {
      monthlyContribution = convertContributionFrequency(contribution, frequency, 3);
    }

    // Create the transaction
    try {
      const frequencyLookup = lookupData.frequencies.find(f => f.id === frequency);
      const transactions = currentScenario.transactions || [];
      
      // Generate recurring transaction
      const newTransaction = {
        id: 0, // Will be assigned by manager
        primaryAccountId: selectedId,
        secondaryAccountId: null,
        transactionTypeId: 1, // Money In
        amount: Math.abs(monthlyContribution),
        effectiveDate: formatDateOnly(new Date()),
        description: `Goal: ${selectedAccount.name}`,
        recurrence: {
          frequency: frequency,
          startDate: formatDateOnly(new Date()),
          endDate: selectedAccount.goalDate
        },
        periodicChange: selectedAccount.periodicChange || null,
        status: { name: 'planned' },
        tags: ['goal-generated']
      };

      transactions.push(newTransaction);
      await TransactionManager.saveAll(currentScenario.id, transactions);

      // Reload everything
      currentScenario = await getScenario(currentScenario.id);
      await loadMasterTransactionsGrid(document.getElementById('transactionsTable'));
      await loadProjectionsSection(document.getElementById('projectionsContent'));

      alert(`Goal plan generated! ${getFrequencyName(frequency).toLowerCase()} transaction of ${formatMoneyDisplay(monthlyContribution)} created.`);
      
      // Reset form
      accountSelect.value = '';
      contributionInput.value = '';
      await updateSummary();
    } catch (err) {
      logger.error('[GeneratePlan] Failed to generate plan:', err);
      alert('Failed to generate plan: ' + err.message);
    }
  });

  // Handle Reset button
  resetBtnEl.addEventListener('click', () => {
    accountSelect.value = '';
    solveForSelect.value = 'contribution';
    frequencySelect.value = '3';
    contributionInput.value = '';
    contributionInput.disabled = true;
    summaryEl.innerHTML = '<p class="text-muted">Select an account to begin</p>';
    generateBtnEl.disabled = true;
  });

  // Set initial state
  contributionInput.disabled = true;
}

/**
 * Build accounts grid columns based on scenario type configuration
 */
function buildAccountsGridColumns(lookupData, typeConfig = null) {
  const columns = [
    createDeleteColumn(async (cell) => {
      const rowData = cell.getRow().getData();
      await AccountManager.remove(currentScenario.id, rowData.id);
      await loadAccountsGrid(document.getElementById('accountsTable'));
      await loadMasterTransactionsGrid(document.getElementById('transactionsTable'));
    }, { confirmMessage: (rowData) => `Delete account: ${rowData.name}?` }),
    createTextColumn('Account Name', 'name', { widthGrow: 2 }),
    {
      title: "Type",
      field: "type",
      minWidth: 120,
      widthGrow: 1,
      formatter: function(cell) {
        const value = cell.getValue();
        return value?.name || '';
      },
      editor: "list",
      editorParams: {
        values: lookupData.accountTypes.map(t => ({ label: t.name, value: t })),
        listItemFormatter: function(value, title) {
          return title;
        }
      }
    },
    createMoneyColumn('Starting Balance', 'startingBalance', { widthGrow: 1 }),
  ];

  // Add goal columns if scenario type includes them
  if (typeConfig && typeConfig.accountColumns && typeConfig.accountColumns.includes('goalAmount')) {
    columns.push(createMoneyColumn('Goal Amount', 'goalAmount', { 
      widthGrow: 1,
      bottomCalc: null // Don't sum goal amounts
    }));
  }

  if (typeConfig && typeConfig.accountColumns && typeConfig.accountColumns.includes('goalDate')) {
    columns.push(createDateColumn('Goal Date', 'goalDate', { 
      widthGrow: 1
    }));
  }

  // Add periodic change column
  columns.push({
    title: "Periodic Change",
    field: "periodicChangeSummary",
    minWidth: 170,
    widthGrow: 1.2,
    formatter: function(cell) {
      const summary = cell.getValue() || 'None';
      const icon = '<svg class="periodic-change-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3h-2v8h-8v2h8v8h2v-8h8v-2h-8V3z"/></svg>';
      return `<span class="periodic-change-cell">${icon}<span class="periodic-change-text">${summary}</span></span>`;
    },
    cellClick: function(e, cell) {
      const rowData = cell.getRow().getData();
      openPeriodicChangeModal(rowData.periodicChange, async (newPeriodicChange) => {
        // Update the account with new periodic change
        const allAccts = await AccountManager.getAll(currentScenario.id);
        const acctIndex = allAccts.findIndex(ac => ac.id === rowData.id);
        if (acctIndex >= 0) {
          allAccts[acctIndex].periodicChange = newPeriodicChange;
          await AccountManager.saveAll(currentScenario.id, allAccts);
          // Reload grid
          await loadAccountsGrid(document.getElementById('accountsTable'));
        }
      });
    }
  });

  columns.push(createTextColumn('Description', 'description', { widthGrow: 2 }));

  return columns;
}

// Load accounts grid
async function loadAccountsGrid(container) {
  if (!currentScenario) {
    logger.warn('[Forecast] loadAccountsGrid: No current scenario');
    return;
  }

  const typeConfig = getScenarioTypeConfig();
  
  // Show message if scenario type is not set
  if (!currentScenario.type) {
    container.innerHTML = '<div class="empty-message">Please select a Scenario Type and Period Type in the scenario grid above to enable accounts.</div>';
    return;
  }
  
  if (!typeConfig.showAccounts) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';

  try {
    const accounts = await AccountManager.getAll(currentScenario.id);
    const displayAccounts = accounts.filter(a => a.name !== 'Select Account');
    
    const lookupData = await loadLookup('lookup-data.json');

    // Add "Add Account" button
    // Remove any existing add buttons for accounts (defensive)
    const existingAccountAdds = container.querySelectorAll('.btn-add');
    existingAccountAdds.forEach(el => el.remove());

    // Create toolbar for controls
    const toolbar = document.createElement('div');
    toolbar.className = 'grid-toolbar';

    // Add button
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'toolbar-item';
    
    const addButton = document.createElement('button');
    addButton.className = 'btn btn-primary';
    addButton.textContent = '+ Add New';
    addButton.addEventListener('click', async () => {
      const data = await AccountManager.create(currentScenario.id, {
        name: 'New Account',
        type: null,
        currency: null,
        startingBalance: 0
      });
      const scenario = data.scenarios.find(s => s.id === currentScenario.id);
      const newAccount = scenario.accounts[scenario.accounts.length - 1];
      // Add to current scenario's accounts array
      if (!currentScenario.accounts) currentScenario.accounts = [];
      currentScenario.accounts.push(newAccount);
      // Add row to table without reloading
      if (accountsTable) {
        const rowData = {
          ...newAccount,
          accountType: newAccount.type?.name || 'Unknown'
        };
        accountsTable.addRow(rowData, false); // false = add to bottom
      }
    });
    window.add(buttonContainer, addButton);
    window.add(toolbar, buttonContainer);

    // Add grouping control
    const accountGroupingControl = document.createElement('div');
    accountGroupingControl.className = 'toolbar-item grouping-control';
    accountGroupingControl.innerHTML = `
      <label for="account-grouping-select" class="text-muted control-label">Group By:</label>
      <select id="account-grouping-select" class="input-select control-select">
        <option value="">None</option>
        <option value="accountType">Type</option>
      </select>
    `;
    window.add(toolbar, accountGroupingControl);
    window.add(container, toolbar);

    // Create grid container
    const gridContainer = document.createElement('div');
    gridContainer.id = 'accountsGrid'; // explicit ID for inner accounts grid
    gridContainer.className = 'grid-container accounts-grid';
    // Remove any previous inner accountsGrid if present (defensive)
    const existingInner = container.querySelector('#accountsGrid');
    if (existingInner) existingInner.remove();


    // Add accountType field for grouping
    const enrichedAccounts = await Promise.all(displayAccounts.map(async a => ({
      ...a,
      accountType: a.type?.name || 'Unknown',
      periodicChangeSummary: await getPeriodicChangeDescription(a.periodicChange)
    })));

    // Mount grid container before initializing Tabulator so layout can measure dimensions
    window.add(container, gridContainer);

    const accountsTable = await createGrid(gridContainer, {
      data: enrichedAccounts,
      columns: buildAccountsGridColumns(lookupData, typeConfig),
      cellEdited: async function(cell) {
        const account = cell.getRow().getData();
        // Normalize primitive ids back to objects for storage
        try {
          if (account.type && typeof account.type !== 'object') {
            const foundType = lookupData.accountTypes.find(t => t.id == account.type);
            if (foundType) account.type = foundType;
          }
          if (account.currency && typeof account.currency !== 'object') {
            const foundCurrency = lookupData.currencies.find(c => c.id == account.currency);
            if (foundCurrency) account.currency = foundCurrency;
          }
        } catch (e) {
          logger.error('[Forecast] Failed to normalize account object before save', e);
        }

        await AccountManager.update(currentScenario.id, account.id, account);
      },
    });

    // Grid will show placeholder if no accounts exist (handled by Tabulator)

    // Attach grouping control handler
    const accountGroupingSelect = document.getElementById('account-grouping-select');
    if (accountGroupingSelect) {
      accountGroupingSelect.addEventListener('change', (e) => {
        const groupField = e.target.value;
        if (groupField) {
          accountsTable.setGroupBy(groupField);
          // Add groupHeader with count (no sum for accounts)
          accountsTable.setGroupHeader((value, count, data, group) => {
            return `${value} (${count} items)`;
          });
        } else {
          accountsTable.setGroupBy(false);
        }
      });
    }

  } catch (err) {
    logger.error('[Forecast] Failed to load accounts grid:', err);
  }
}

// Load master transactions grid (unified planned and actual)
async function loadMasterTransactionsGrid(container) {
  if (!currentScenario) return;

  const typeConfig = getScenarioTypeConfig();
  
  // Show message if scenario type is not set
  if (!currentScenario.type) {
    container.innerHTML = '<div class="empty-message">Please select a Scenario Type and Period Type in the scenario grid above to enable transactions.</div>';
    return;
  }
  
  if (!typeConfig.showPlannedTransactions) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';

  // Create toolbar for controls
  const toolbar = document.createElement('div');
  toolbar.className = 'grid-toolbar';

  // Add "Add Transaction" button
  const existingAdds = container.querySelectorAll('.btn-add');
  existingAdds.forEach(el => el.remove());

  const addButtonContainer = document.createElement('div');
  addButtonContainer.className = 'toolbar-item';
  const addButton = document.createElement('button');
  addButton.className = 'btn btn-primary btn-add';
  addButton.textContent = '+ Add New Transaction';
  addButton.addEventListener('click', async () => {
    try {
      // Prefer the active account filter, fall back to the first account
      const accountIds = (currentScenario.accounts || []).map(acc => acc.id);
      const filteredAccountId = transactionFilterAccountId && accountIds.includes(transactionFilterAccountId)
        ? transactionFilterAccountId
        : null;
      const defaultAccountId = filteredAccountId || (accountIds.length > 0 ? accountIds[0] : null);
      
      if (!defaultAccountId) {
        alert('Please create at least one account before adding a transaction.');
        return;
      }
      
      // Create new planned transaction with default primary account
      const selectedPeriod = actualPeriod ? periods.find(p => p.id === actualPeriod) : null;
      const defaultEffectiveDate = selectedPeriod
        ? formatDateOnly(selectedPeriod.startDate)
        : (currentScenario.startDate || formatDateOnly(new Date()));

      const newTx = await createTransaction(currentScenario.id, {
        primaryAccountId: defaultAccountId,
        secondaryAccountId: null, // User will fill this in
        transactionTypeId: 2, // Default to Money Out
        amount: 0,
        effectiveDate: defaultEffectiveDate,
        description: '',
        recurrence: null,
        periodicChange: null,
        status: 'planned',
        tags: []
      });

      // Refresh currentScenario to ensure grid reflects new transaction
      currentScenario = await getScenario(currentScenario.id);

      // Reload grid
      await loadMasterTransactionsGrid(container);
    } catch (err) {
      console.error('[Forecast] Failed to create transaction:', err);
      alert('Failed to create transaction. Please try again.');
    }
  });
  window.add(addButtonContainer, addButton);
  window.add(toolbar, addButtonContainer);

  // Add grouping control (left side)
  const groupingControl = document.createElement('div');
  groupingControl.className = 'toolbar-item grouping-control';
  groupingControl.innerHTML = `
    <label for="tx-grouping-select" class="text-muted control-label">Group By:</label>
    <select id="tx-grouping-select" class="input-select control-select">
      <option value="">None</option>
      <option value="transactionTypeName">Type (Money In/Out)</option>
      <option value="secondaryAccountTypeName">Account Type</option>
      <option value="recurrenceSummary">Recurrence Period</option>
      <option value="secondaryAccountName">Account</option>
    </select>
  `;
  window.add(toolbar, groupingControl);

  // Add period type selector
  const periodTypeControl = document.createElement('div');
  periodTypeControl.className = 'toolbar-item period-type-control';
  periodTypeControl.innerHTML = `
    <label for="tx-period-type-select" class="text-muted control-label">View By:</label>
    <select id="tx-period-type-select" class="input-select control-select">
      <option value="Day">Day</option>
      <option value="Week">Week</option>
      <option value="Month">Month</option>
      <option value="Quarter">Quarter</option>
      <option value="Year">Year</option>
    </select>
  `;
  window.add(toolbar, periodTypeControl);

  // Add period filter
  const periodFilter = document.createElement('div');
  periodFilter.className = 'toolbar-item period-filter';
  periodFilter.innerHTML = `
    <label for="actual-period-select" class="text-muted control-label">Period:</label>
    <select id="actual-period-select" class="input-select control-select"></select>
    <button id="actual-prev-period-btn" class="btn btn-ghost control-button" title="Previous Period">&#9664;</button>
    <button id="actual-next-period-btn" class="btn btn-ghost control-button" title="Next Period">&#9654;</button>
  `;
  window.add(toolbar, periodFilter);
  
  // Add account filter dropdown
  const accountFilter = document.createElement('div');
  accountFilter.className = 'toolbar-item account-filter';
  accountFilter.innerHTML = `
    <label for="account-filter-select" class="text-muted control-label">Account:</label>
    <select id="account-filter-select" class="input-select control-select">
      <option value="">-- All Accounts --</option>
    </select>
  `;
  window.add(toolbar, accountFilter);
  
  // Add toolbar to container FIRST so we can find the select element
  window.add(container, toolbar);
  
  // Set the selected period type from variable
  const periodTypeSelect = document.getElementById('tx-period-type-select');
  if (periodTypeSelect) {
    periodTypeSelect.value = actualPeriodType;
  }
  
  // Calculate periods for current scenario with selected period type
  periods = await getScenarioPeriods(currentScenario.id, actualPeriodType);
  
  // Populate period dropdown immediately
  const periodSelect = document.getElementById('actual-period-select');
  if (periodSelect) {
    periodSelect.innerHTML = '<option value="">-- All Periods --</option>';
    periods.forEach((period) => {
      const option = document.createElement('option');
      option.value = period.id;
      option.textContent = period.label || `${formatDateOnly(period.startDate) || ''} to ${formatDateOnly(period.endDate) || ''}`;
      periodSelect.appendChild(option);
    });
    
    // Set current selected value
    periodSelect.value = actualPeriod || '';
    
    // Attach event listeners
    periodSelect.addEventListener('change', async (e) => {
      actualPeriod = e.target.value;
      await loadMasterTransactionsGrid(container);
    });
    
    document.getElementById('actual-prev-period-btn')?.addEventListener('click', async () => {
      const currentIndex = periods.findIndex(p => p.id === actualPeriod);
      if (currentIndex > 0) {
        actualPeriod = periods[currentIndex - 1].id;
        await loadMasterTransactionsGrid(container);
      }
    });
    
    document.getElementById('actual-next-period-btn')?.addEventListener('click', async () => {
      const currentIndex = periods.findIndex(p => p.id === actualPeriod);
      if (currentIndex < periods.length - 1) {
        actualPeriod = periods[currentIndex + 1].id;
        await loadMasterTransactionsGrid(container);
      }
    });
    
    // Add period type change handler
    document.getElementById('tx-period-type-select')?.addEventListener('change', async (e) => {
      actualPeriodType = e.target.value; // Save selected type
      actualPeriod = null; // Reset period selection when type changes
      await loadMasterTransactionsGrid(container);
    });
  } else {
    console.error('[Transactions] Could not find period select element!');
  }

  // Populate account filter dropdown
  const accountFilterSelect = document.getElementById('account-filter-select');
  if (accountFilterSelect) {
    accountFilterSelect.innerHTML = '<option value="">-- All Accounts --</option>';
    (currentScenario.accounts || []).forEach((account) => {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = account.name;
      accountFilterSelect.appendChild(option);
    });
    
    // Set current selected value
    accountFilterSelect.value = transactionFilterAccountId || '';
    
    // Attach event listener for filtering transactions
    accountFilterSelect.addEventListener('change', async (e) => {
      transactionFilterAccountId = e.target.value ? Number(e.target.value) : null;
      
      // Apply filter to transactions grid if it exists
      if (masterTransactionsTable) {
        if (transactionFilterAccountId) {
          masterTransactionsTable.setFilter((data) => {
            if (!data.perspectiveAccountId) return true;
            return Number(data.perspectiveAccountId) === transactionFilterAccountId;
          });
        } else {
          // Show only primary perspectives (not flipped)
          masterTransactionsTable.setFilter((data) => {
            return !String(data.id).includes('_flipped');
          });
        }
        updateTransactionTotals();
      }
      
      // Apply filter to budget grid if it exists
      if (masterBudgetTable) {
        if (transactionFilterAccountId) {
          masterBudgetTable.setFilter((data) => {
            if (!data.perspectiveAccountId) return true;
            return Number(data.perspectiveAccountId) === transactionFilterAccountId;
          });
        } else {
          // Show only primary perspectives (not flipped)
          masterBudgetTable.setFilter((data) => {
            return !String(data.id).includes('_flipped');
          });
        }
        updateBudgetTotals();
      }
      
      // Reload projections grid
      await loadProjectionsSection(getEl('projectionsContent'));
    });
  } else {
    console.error('[Transactions] Could not find account filter select element!');
  }

  // Normalize accounts to ensure type field is an object (not primitive ID)
  const normalizedAccounts = (currentScenario.accounts || []).map(account => {
    const normalized = { ...account };
    if (normalized.type && typeof normalized.type !== 'object') {
      const foundType = lookupData.accountTypes.find(t => t.id == normalized.type);
      if (foundType) normalized.type = foundType;
    }
    return normalized;
  });

  const gridContainer = document.createElement('div');
  gridContainer.className = 'grid-container master-transactions-grid';
  window.add(container, gridContainer);

  // Show date column only when a specific period is selected
  const showDateColumn = !!actualPeriod;

  try {
    // Get all transactions
    let allTransactions = await getTransactions(currentScenario.id);

    // If a period is selected, expand transactions by their recurrence within that period
    if (actualPeriod) {
      const selectedPeriod = periods.find(p => p.id === actualPeriod);
      if (selectedPeriod) {
        // Use shared transaction expander utility
        allTransactions = expandTransactions(allTransactions, selectedPeriod.startDate, selectedPeriod.endDate, currentScenario.accounts);
      }
    }

    // Normalize canonical data and transform to dual-perspective display rows
    allTransactions = allTransactions.map(normalizeCanonicalTransaction);

    const transformedData = await Promise.all(allTransactions.flatMap(async tx => {
      // Handle status as object or string
      const statusName = typeof tx.status === 'object' ? tx.status.name : tx.status;
      const actualAmount = typeof tx.status === 'object' ? tx.status.actualAmount : tx.actualAmount;
      const actualDate = typeof tx.status === 'object' ? tx.status.actualDate : tx.actualDate;
      
      // Display date: only show occurrence date when a specific period is selected; blank for all-period view
      const displayDate = actualPeriod
        ? (statusName === 'actual' && actualDate ? actualDate : tx.effectiveDate)
        : '';

      const recurrenceSummary = getRecurrenceDescription(tx.recurrence);
      const periodicChangeSummary = await getPeriodicChangeDescription(tx.periodicChange);
      
      const txForDisplay = {
        ...tx,
        status: statusName || 'planned',
        plannedAmount: tx.plannedAmount ?? Math.abs(Number(tx.amount ?? 0)),
        actualAmount: actualAmount !== undefined && actualAmount !== null ? Math.abs(actualAmount) : tx.actualAmount,
        effectiveDate: tx.effectiveDate,
        plannedDate: tx.effectiveDate,
        actualDate: actualDate,
        displayDate,
        recurrenceDescription: recurrenceSummary,
        recurrenceSummary,
        periodicChangeSummary,
        periodicChange: tx.periodicChange,
        tags: tx.tags || []
      };
      
      return transformTransactionToRows(txForDisplay, normalizedAccounts);
    }));
    
    // Flatten the array of arrays from Promise.all
    const flatTransformedData = transformedData.flat();
    // Note: Filtering is now handled by Tabulator's setFilter() - see account selection handler

    // Compute filtered totals for current transactions view
    const txTotals = calculateCategoryTotals(flatTransformedData, {
      amountField: 'amount',
      typeField: 'transactionType',
      typeNameField: 'transactionTypeName',
      typeIdField: 'transactionTypeId'
    });

    // Add inline totals to toolbar (right side)
    const formatCurrency = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const totalsInline = document.createElement('div');
    totalsInline.className = 'toolbar-item toolbar-totals';
    totalsInline.innerHTML = `
      <span class="toolbar-total-item"><span class="label">Money In:</span> <span class="value positive">${formatCurrency(txTotals.moneyIn)}</span></span>
      <span class="toolbar-total-item"><span class="label">Money Out:</span> <span class="value negative">${formatCurrency(txTotals.moneyOut)}</span></span>
      <span class="toolbar-total-item"><span class="label">Net:</span> <span class="value ${txTotals.net >= 0 ? 'positive' : 'negative'}">${formatCurrency(txTotals.net)}</span></span>
    `;
    toolbar.appendChild(totalsInline);

    masterTransactionsTable = await createGrid(gridContainer, {
      data: flatTransformedData,
      headerWordWrap: false, // Prevent header text wrapping
      autoResize: true, // Enable auto-resize on window changes
      columns: [
        createDeleteColumn(async (cell) => {
          const rowData = cell.getRow().getData();
          // Strip _flipped suffix from ID if present (for flipped perspective rows)
          // Safe for both perspectives: primary IDs unmodified, flipped IDs get suffix removed
          const actualTxId = String(rowData.id).includes('_flipped') 
            ? String(rowData.id).replace('_flipped', '') 
            : rowData.id;
          const allTxs = await getTransactions(currentScenario.id);
          const filteredTxs = allTxs.filter(tx => tx.id !== Number(actualTxId));
          await TransactionManager.saveAll(currentScenario.id, filteredTxs);
          await loadMasterTransactionsGrid(container);
        }, { confirmMessage: () => 'Delete this transaction?' }),
        {
          title: "Type",
          field: "transactionType",
          minWidth: 100,
          widthGrow: 1,
          formatter: function(cell) {
            const value = cell.getValue();
            return value?.name || '';
          },
          editor: "list",
          editorParams: {
            values: [
              { label: 'Money In', value: { id: 1, name: 'Money In' } },
              { label: 'Money Out', value: { id: 2, name: 'Money Out' } }
            ],
            listItemFormatter: function(value, title) {
              return title;
            }
          },
          sorter: function(a, b) {
            const aVal = a?.name || '';
            const bVal = b?.name || '';
            return aVal.localeCompare(bVal);
          }
        },
        {
          title: "Secondary Account",
          field: "secondaryAccount",
          minWidth: 150,
          widthGrow: 1.5,
          formatter: function(cell) {
            const value = cell.getValue();
            return value?.name || '';
          },
          editor: "list",
          editorParams: {
            values: [
              ...((currentScenario.accounts || []).map(acc => ({ label: acc.name, value: acc }))),
              { label: 'Insert New Account...', value: { __create__: true } }
            ],
            listItemFormatter: function(value, title) {
              return title;
            }
          },
          sorter: function(a, b) {
            const aVal = a?.name || '';
            const bVal = b?.name || '';
            return aVal.localeCompare(bVal);
          }
        },
        createMoneyColumn('Amount', 'amount', { minWidth: 100, widthGrow: 1 }),
        {
          title: "Recurrence",
          field: "recurrenceSummary",
          minWidth: 170,
          widthGrow: 1.2,
          formatter: function(cell) {
            const summary = cell.getValue() || 'One time';
            const icon = '<svg class="recurrence-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/></svg>';
            return `<span class="recurrence-cell">${icon}<span class="recurrence-text">${summary}</span></span>`;
          },
          cellClick: function(e, cell) {
            const rowData = cell.getRow().getData();
            openRecurrenceModal(rowData.recurrence, async (newRecurrence) => {
              // Update the transaction with new recurrence
              const allTxs = await getTransactions(currentScenario.id);
              // Strip _flipped suffix from ID if present (for flipped perspective rows)
              const actualTxId = String(rowData.id).replace('_flipped', '');
              const txIndex = allTxs.findIndex(tx => String(tx.id) === actualTxId);
              if (txIndex >= 0) {
                allTxs[txIndex].recurrence = newRecurrence;
                await TransactionManager.saveAll(currentScenario.id, allTxs);
                // Reload grid
                await loadMasterTransactionsGrid(container);
              }
            });
          }
        },
        {
          title: "Periodic Change",
          field: "periodicChangeSummary",
          minWidth: 170,
          widthGrow: 1.2,
          formatter: function(cell) {
            const summary = cell.getValue() || 'None';
            const icon = '<svg class="periodic-change-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3h-2v8h-8v2h8v8h2v-8h8v-2h-8V3z"/></svg>';
            return `<span class="periodic-change-cell">${icon}<span class="periodic-change-text">${summary}</span></span>`;
          },
          cellClick: function(e, cell) {
            const rowData = cell.getRow().getData();
            openPeriodicChangeModal(rowData.periodicChange, async (newPeriodicChange) => {
              // Update the transaction with new periodic change
              const allTxs = await getTransactions(currentScenario.id);
              // Strip _flipped suffix from ID if present (for flipped perspective rows)
              const actualTxId = String(rowData.id).replace('_flipped', '');
              const txIndex = allTxs.findIndex(tx => String(tx.id) === actualTxId);
              if (txIndex >= 0) {
                allTxs[txIndex].periodicChange = newPeriodicChange;
                await TransactionManager.saveAll(currentScenario.id, allTxs);
                // Reload grid
                await loadMasterTransactionsGrid(container);
              }
            });
          }
        },
        ...(showDateColumn ? [createDateColumn('Date', 'displayDate', { minWidth: 110, widthGrow: 1 })] : []),
        createTextColumn('Description', 'description', { widthGrow: 2 }),
      ],
      cellEdited: async function(cell) {
        const rowData = cell.getRow().getData();
        const field = cell.getColumn().getField();
        const newValue = cell.getValue();
        
        // Detect if this is a flipped perspective row
        const isFlipped = String(rowData.id).includes('_flipped');
        const actualTxId = String(rowData.id).replace('_flipped', '');

        // Handle new account creation
        if ((field === 'secondaryAccount' || field === 'primaryAccount') && newValue && newValue.__create__) {
          // Open text input modal to get account name
          openTextInputModal('Create New Account', 'Enter account name:', '', async (accountName) => {
            if (accountName && accountName.trim()) {
              try {
                // Create new account
                const newAccount = await createAccount(currentScenario.id, {
                  name: accountName.trim(),
                  type: { id: 1, name: 'Asset' }, // Default to Asset type
                  currency: { id: 1, name: 'ZAR' }, // Default currency
                  balance: 0,
                  openDate: formatDateOnly(new Date()),
                  periodicChange: null
                });


                // Update the current row data immediately
                const currentRow = cell.getRow();
                const currentData = currentRow.getData();
                
                // Update the field being edited
                if (field === 'primaryAccount') {
                  currentData.primaryAccountId = newAccount.id;
                  currentData.primaryAccount = newAccount;
                } else {
                  currentData.secondaryAccountId = newAccount.id;
                  currentData.secondaryAccount = newAccount;
                }
                
                // Update the row in the table
                currentRow.update(currentData);
                

                // Save all transactions to persist the change
                const allTxs = await getTransactions(currentScenario.id);
                const txIndex = allTxs.findIndex(tx => tx.id === currentData.id);
                if (txIndex >= 0) {
                  // Update using the storage format
                  if (field === 'primaryAccount') {
                    allTxs[txIndex].primaryAccountId = newAccount.id;
                  } else {
                    allTxs[txIndex].secondaryAccountId = newAccount.id;
                  }
                  await TransactionManager.saveAll(currentScenario.id, allTxs);
                }
                
                // Add new account to accounts grid without reloading
                if (window.accountsTableInstance) {
                  const enrichedAccount = {
                    ...newAccount,
                    accountType: newAccount.type?.name || 'Unknown'
                  };
                  window.accountsTableInstance.addRow(enrichedAccount);
                }
              } catch (err) {
                console.error('Failed to create account:', err);
                alert('Failed to create account. Please try again.');
              }
            }
          });
          return; // Don't proceed with normal cell editing
        }

        // Normal cell editing
        const allTxs = (await getTransactions(currentScenario.id)).map(normalizeCanonicalTransaction);
        const txIndex = allTxs.findIndex(tx => String(tx.id) === actualTxId);

        if (txIndex >= 0) {
          const updatedTx = mapEditToCanonical(allTxs[txIndex], { field, value: newValue, isFlipped });

          allTxs[txIndex] = updatedTx;
          await TransactionManager.saveAll(currentScenario.id, allTxs);
          
          // After save, reload the grid to regenerate BOTH perspective rows from canonical storage
          await loadMasterTransactionsGrid(container);
        }
      }
    });

    // Attach grouping control handler
    const groupingSelect = document.getElementById('tx-grouping-select');
    if (groupingSelect) {
      const formatGroupLabel = (val) => {
        if (val === null || val === undefined || val === '') return 'Unspecified';
        if (typeof val === 'object') return val.name || val.label || val.description || 'Unspecified';
        return String(val);
      };

      groupingSelect.addEventListener('change', (e) => {
        const groupField = e.target.value;
        if (groupField) {
          masterTransactionsTable.setGroupBy(groupField);
          // Add groupHeader with sum for grouped field
          masterTransactionsTable.setGroupHeader((value, count, data, group) => {
            const totalAmount = data.reduce((sum, row) => sum + Number(row.amount || 0), 0);
            const label = formatGroupLabel(value);
            const formatted = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(totalAmount);
            return `${label} (${count} items, Total: ${formatted})`;
          });
        } else {
          masterTransactionsTable.setGroupBy(false);
        }
      });
    }
    
    // Apply initial filter after table creation
    setTimeout(() => {
      if (transactionFilterAccountId) {
        // If account is selected, show only that account's perspective
        masterTransactionsTable.setFilter((data) => {
          if (!data.perspectiveAccountId) return true;
          return Number(data.perspectiveAccountId) === transactionFilterAccountId;
        });
      } else {
        // If no account selected, show only primary perspectives (not flipped ones)
        masterTransactionsTable.setFilter((data) => {
          // Show rows that are NOT flipped perspectives (no "_flipped" in ID)
          return !String(data.id).includes('_flipped');
        });
      }
      // Totals will be updated via dataFiltered event
    }, 0);
    
    const handleTransactionsFiltered = function(filters, rows) {
      updateTransactionTotals(rows);
    };
    
    const handleTransactionsBuilt = function() {
      updateTransactionTotals();
    };

    attachGridHandlers(masterTransactionsTable, {
      dataFiltered: handleTransactionsFiltered,
      tableBuilt: handleTransactionsBuilt
    });

  } catch (err) {
    console.error('[Forecast] Failed to load master transactions grid:', err);
  }
}

// Load budget grid
async function loadBudgetGrid(container) {
  if (!currentScenario) return;

  const loadToken = ++budgetGridLoadToken;
  const transactionFilterAccountIdSnapshot = transactionFilterAccountId;
  const budgetPeriodSnapshot = budgetPeriod;
  const selIdNum = transactionFilterAccountIdSnapshot != null ? Number(transactionFilterAccountIdSnapshot) : null;


  container.innerHTML = '';

  try {
    // Get budget occurrences
    let budgetOccurrences = await getBudget(currentScenario.id);

    // Abort if a newer load kicked off while we were waiting
    if (loadToken !== budgetGridLoadToken) {
      return;
    }

    // Create toolbar for controls
    const toolbar = document.createElement('div');
    toolbar.className = 'grid-toolbar';

    // Add budget action buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'toolbar-item';
    
    // Add New Budget Entry button
    const addButton = document.createElement('button');
    addButton.className = 'btn btn-primary';
    addButton.textContent = '+ Add New Entry';
    addButton.addEventListener('click', async () => {
      try {
        // Get current budgets and add a new occurrence
        const currentBudgets = await getBudget(currentScenario.id);
        
        // Determine default date based on selected period or use today
        let defaultDate = formatDateOnly(new Date());
        if (budgetPeriodSnapshot) {
          const selectedPeriod = periods.find(p => p.id === budgetPeriodSnapshot);
          if (selectedPeriod && selectedPeriod.startDate) {
            defaultDate = formatDateOnly(new Date(selectedPeriod.startDate));
          }
        }
        
        // Create new budget occurrence with default values
        const newBudget = {
          id: null, // Will be assigned by saveAll
          sourceTransactionId: null,
          primaryAccountId: transactionFilterAccountIdSnapshot || (currentScenario.accounts && currentScenario.accounts.length > 0 ? currentScenario.accounts[0].id : null),
          secondaryAccountId: null,
          transactionTypeId: 2, // Default to Money Out
          amount: 0,
          description: '',
          occurrenceDate: defaultDate, // Use period-aware default date
          recurrenceDescription: 'One time',
          status: {
            name: 'planned',
            actualAmount: null,
            actualDate: null
          }
        };
        
        currentBudgets.push(newBudget);
        await BudgetManager.saveAll(currentScenario.id, currentBudgets);
        
        // Refresh scenario and reload budget grid
        currentScenario = await getScenario(currentScenario.id);
        await loadBudgetGrid(container);
      } catch (err) {
        console.error('[Forecast] Failed to create budget entry:', err);
        alert('Failed to create budget entry. Please try again.');
      }
    });
    window.add(buttonContainer, addButton);
    
    // Add Clear Budget button
    const clearButton = document.createElement('button');
    clearButton.className = 'btn';
    clearButton.textContent = 'Clear Budget';
    clearButton.addEventListener('click', async () => {
      const confirmed = confirm('Clear all budget occurrences? This cannot be undone.');
      if (!confirmed) return;
      
      try {
        await BudgetManager.clearAll(currentScenario.id);
        currentScenario = await getScenario(currentScenario.id);
        await loadBudgetGrid(container);
      } catch (err) {
        console.error('[Forecast] Failed to clear budget:', err);
        alert('Failed to clear budget: ' + err.message);
      }
    });
    window.add(buttonContainer, clearButton);
    
    window.add(toolbar, buttonContainer);

    // Add period type selector
    const periodTypeControl = document.createElement('div');
    periodTypeControl.className = 'toolbar-item period-type-control';
    periodTypeControl.innerHTML = `
      <label for="budget-period-type-select" class="text-muted control-label">View By:</label>
      <select id="budget-period-type-select" class="input-select control-select">
        <option value="Day">Day</option>
        <option value="Week">Week</option>
        <option value="Month">Month</option>
        <option value="Quarter">Quarter</option>
        <option value="Year">Year</option>
      </select>
    `;
    window.add(toolbar, periodTypeControl);

    // Add period filter controls (similar to transactions)
    const periodFilter = document.createElement('div');
    periodFilter.className = 'toolbar-item period-filter control-layout-wrap';
    periodFilter.innerHTML = `
        <label for="budget-period-select" class="text-muted control-label">Period:</label>
      <select id="budget-period-select" class="input-select control-select"></select>
        <button id="budget-prev-period-btn" class="btn btn-ghost control-button" title="Previous Period">&#9664;</button>
        <button id="budget-next-period-btn" class="btn btn-ghost control-button" title="Next Period">&#9654;</button>
    `;
    window.add(toolbar, periodFilter);
    
    // Add account filter dropdown
    const accountFilter = document.createElement('div');
    accountFilter.className = 'toolbar-item account-filter';
    accountFilter.innerHTML = `
      <label for="budget-account-filter-select" class="text-muted control-label">Account:</label>
      <select id="budget-account-filter-select" class="input-select control-select">
        <option value="">-- All Accounts --</option>
      </select>
    `;
    window.add(toolbar, accountFilter);
    
    // Add toolbar to container FIRST so we can find the select element
    window.add(container, toolbar);

    // Set the selected period type from variable
    const periodTypeSelect = document.getElementById('budget-period-type-select');
    if (periodTypeSelect) {
      periodTypeSelect.value = budgetPeriodType;
    }

    // Calculate periods for current scenario with selected period type
    periods = await getScenarioPeriods(currentScenario.id, budgetPeriodType);

    // Populate budget period dropdown
    const budgetPeriodSelect = document.getElementById('budget-period-select');
    if (budgetPeriodSelect) {
      budgetPeriodSelect.innerHTML = '<option value="">-- All Periods --</option>';
      periods.forEach((period) => {
        const option = document.createElement('option');
        option.value = period.id;
        option.textContent = period.label || `${formatDateOnly(period.startDate) || ''} to ${formatDateOnly(period.endDate) || ''}`;
        budgetPeriodSelect.appendChild(option);
      });
      
      // Set current selection if any
      budgetPeriodSelect.value = budgetPeriodSnapshot || '';
      
      // Attach period selector event listeners
      budgetPeriodSelect.addEventListener('change', async (e) => {
        budgetPeriod = e.target.value;
        await loadBudgetGrid(container);
      });
      
      document.getElementById('budget-prev-period-btn')?.addEventListener('click', async () => {
        const currentIndex = periods.findIndex(p => p.id === budgetPeriod);
        if (currentIndex > 0) {
          budgetPeriod = periods[currentIndex - 1].id;
          await loadBudgetGrid(container);
        }
      });
      
      document.getElementById('budget-next-period-btn')?.addEventListener('click', async () => {
        const currentIndex = periods.findIndex(p => p.id === budgetPeriod);
        if (currentIndex < periods.length - 1) {
          budgetPeriod = periods[currentIndex + 1].id;
          await loadBudgetGrid(container);
        }
      });
      
      // Add period type change handler
      document.getElementById('budget-period-type-select')?.addEventListener('change', async (e) => {
        budgetPeriodType = e.target.value; // Save selected type
        budgetPeriod = null; // Reset period selection when type changes
        await loadBudgetGrid(container);
      });
    }

    // Populate budget account filter dropdown
    const budgetAccountFilterSelect = document.getElementById('budget-account-filter-select');
    if (budgetAccountFilterSelect) {
      budgetAccountFilterSelect.innerHTML = '<option value="">-- All Accounts --</option>';
      (currentScenario.accounts || []).forEach((account) => {
        const option = document.createElement('option');
        option.value = account.id;
        option.textContent = account.name;
        budgetAccountFilterSelect.appendChild(option);
      });
      
      // Set current selected value
      budgetAccountFilterSelect.value = transactionFilterAccountId || '';
      
      // Attach event listener for filtering budget
      budgetAccountFilterSelect.addEventListener('change', async (e) => {
        transactionFilterAccountId = e.target.value ? Number(e.target.value) : null;
        
        // Apply filter to budget grid if it exists
        if (masterBudgetTable) {
          if (transactionFilterAccountId) {
            masterBudgetTable.setFilter((data) => {
              if (!data.perspectiveAccountId) return true;
              return Number(data.perspectiveAccountId) === transactionFilterAccountId;
            });
          } else {
            // Show only primary perspectives (not flipped)
            masterBudgetTable.setFilter((data) => {
              return !String(data.id).includes('_flipped');
            });
          }
          updateBudgetTotals();
        }
        
        // Apply filter to transactions grid if it exists
        if (masterTransactionsTable) {
          if (transactionFilterAccountId) {
            masterTransactionsTable.setFilter((data) => {
              if (!data.perspectiveAccountId) return true;
              return Number(data.perspectiveAccountId) === transactionFilterAccountId;
            });
          } else {
            // Show only primary perspectives (not flipped)
            masterTransactionsTable.setFilter((data) => {
              return !String(data.id).includes('_flipped');
            });
          }
          updateTransactionTotals();
        }
        
        // Reload projections grid
        await loadProjectionsSection(getEl('projectionsContent'));
      });
    } else {
      console.error('[Budget] Could not find account filter select element!');
    }

    // Normalize accounts to ensure type field is an object (not primitive ID)
    const normalizedAccounts = (currentScenario.accounts || []).map(account => {
      const normalized = { ...account };
      if (normalized.type && typeof normalized.type !== 'object') {
        const foundType = lookupData.accountTypes.find(t => t.id == normalized.type);
        if (foundType) normalized.type = foundType;
      }
      return normalized;
    });

    // Transform budgets for UI - create dual-perspective rows (mirror transactions grid)
    const transformedData = budgetOccurrences.flatMap(budget => {
      const storedPrimaryId = budget.primaryAccountId;
      const storedSecondaryId = budget.secondaryAccountId;
      const storedTypeId = budget.transactionTypeId;
      
      const statusObj = typeof budget.status === 'object' ? budget.status : { name: budget.status, actualAmount: null, actualDate: null };
      
      // Get source transaction to extract recurrence for description
      const sourceTransaction = budget.sourceTransactionId 
        ? currentScenario.transactions?.find(tx => tx.id === budget.sourceTransactionId)
        : null;
      const recurrenceSummary = sourceTransaction?.recurrence 
        ? getRecurrenceDescription(sourceTransaction.recurrence)
        : (budget.recurrenceDescription || 'One time');
      
      const baseData = {
        id: budget.id,
        originalBudgetId: budget.id,
        sourceTransactionId: budget.sourceTransactionId,
        primaryAccountId: storedPrimaryId,
        secondaryAccountId: storedSecondaryId,
        transactionTypeId: storedTypeId,
        transactionType: storedTypeId === 1 ? { id: 1, name: 'Money In' } : { id: 2, name: 'Money Out' },
        plannedAmount: budget.amount,
        actualAmount: statusObj.actualAmount,
        actualDate: statusObj.actualDate,
        amount: statusObj.actualAmount !== null && statusObj.actualAmount !== undefined ? statusObj.actualAmount : budget.amount,
        description: budget.description,
        occurrenceDate: budget.occurrenceDate,
        recurrenceDescription: recurrenceSummary,
        status: statusObj
      };
      
      // Filter by period if selected (before creating perspectives)
      if (budgetPeriodSnapshot) {
        const selectedPeriod = periods.find(p => p.id === budgetPeriodSnapshot);
        if (selectedPeriod) {
          const budgetDate = new Date(budget.occurrenceDate);
          const periodStart = new Date(selectedPeriod.startDate);
          const periodEnd = new Date(selectedPeriod.endDate);
          // Adjust end date to be inclusive (end of day)
          periodEnd.setHours(23, 59, 59, 999);
          if (budgetDate < periodStart || budgetDate > periodEnd) {
            return []; // Skip this budget entry
          }
        }
      }
      
      const canonicalBudget = normalizeCanonicalTransaction(baseData);
      return transformTransactionToRows(canonicalBudget, normalizedAccounts);
    });
    // Note: Account filtering is now handled by Tabulator's setFilter() - see account selection handler

    // Skip render if this run is no longer the latest
    if (loadToken !== budgetGridLoadToken) {
      return;
    }

    // Always show primary account column (filtering now handled by dropdown)
    const showPrimaryColumnBudget = true;
    
    // Always show date column - it's essential for budget tracking and planning
    const showBudgetDateColumn = true;

    // Grid will show placeholder if no budget data (handled by Tabulator)

    // Add grouping control
    const groupingControl = document.createElement('div');
    groupingControl.className = 'toolbar-item grouping-control';
    groupingControl.innerHTML = `
      <label for="budget-grouping-select" class="text-muted control-label">Group By:</label>
      <select id="budget-grouping-select" class="input-select control-select">
        <option value="">None</option>
        <option value="transactionTypeName">Type (Money In/Out)</option>
        <option value="secondaryAccountTypeName">Account Type</option>
        <option value="recurrenceDescription">Recurrence Period</option>
        <option value="secondaryAccountName">Account</option>
      </select>
    `;
    window.add(toolbar, groupingControl);

    // Add inline totals to toolbar (will be updated dynamically)
    const formatCurrency = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const totalsInline = document.createElement('div');
    totalsInline.className = 'toolbar-item toolbar-totals';
    totalsInline.innerHTML = `
      <span class="toolbar-total-item"><span class="label">Actual Net:</span> <span class="value">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Money In:</span> <span class="value positive">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Money Out:</span> <span class="value negative">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Net:</span> <span class="value">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Planned Outstanding:</span> <span class="value negative">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Planned Net Balance:</span> <span class="value">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Unplanned:</span> <span class="value negative">${formatCurrency(0)}</span></span>
    `;
    window.add(toolbar, totalsInline);
    window.add(container, toolbar);

    // Create grid container
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid-container budget-grid';
    window.add(container, gridContainer);

    masterBudgetTable = await createGrid(gridContainer, {
      data: transformedData,
      columns: [
        createDeleteColumn(async (cell) => {
          await BudgetManager.remove(currentScenario.id, cell.getRow().getData().id);
          currentScenario = await getScenario(currentScenario.id);
          await loadBudgetGrid(container);
        }, { confirmMessage: () => 'Delete this budget occurrence?' }),
        {
          title: "Secondary Account",
          field: "secondaryAccount",
          minWidth: 150,
          widthGrow: 1.5,
          formatter: function(cell) {
            const value = cell.getValue();
            return value?.name || '';
          },
          editor: "list",
          editorParams: {
            values: (currentScenario.accounts || []).map(acc => ({ label: acc.name, value: acc })),
            listItemFormatter: function(value, title) {
              return title;
            }
          },
          sorter: function(a, b) {
            const aVal = a?.name || '';
            const bVal = b?.name || '';
            return aVal.localeCompare(bVal);
          }
        },
        {
          title: "Type",
          field: "transactionType",
          minWidth: 100,
          widthGrow: 1,
          formatter: function(cell) {
            const value = cell.getValue();
            return value?.name || '';
          },
          editor: "list",
          editorParams: {
            values: [
              { label: 'Money In', value: { id: 1, name: 'Money In' } },
              { label: 'Money Out', value: { id: 2, name: 'Money Out' } }
            ],
            listItemFormatter: function(value, title) {
              return title;
            }
          },
          sorter: function(a, b) {
            const aVal = a?.name || '';
            const bVal = b?.name || '';
            return aVal.localeCompare(bVal);
          }
        },
        createMoneyColumn('Planned Amount', 'plannedAmount', { minWidth: 100, widthGrow: 1 }),
        ...(showBudgetDateColumn ? [createDateColumn('Date', 'occurrenceDate', { minWidth: 110, widthGrow: 1 })] : []),
        {
          title: "Recurrence",
          field: "recurrenceDescription",
          minWidth: 130,
          widthGrow: 1,
          formatter: function(cell) {
            return cell.getValue() || 'One time';
          }
        },
        createTextColumn('Description', 'description', { widthGrow: 2 }),
        createMoneyColumn('Actual Amount', 'actualAmount', { minWidth: 100, widthGrow: 1 }),
        createDateColumn('Actual Date', 'actualDate', { minWidth: 110, widthGrow: 1 })
      ],
      cellEdited: async function(cell) {
        const rowData = cell.getRow().getData();
        const field = cell.getColumn().getField();
        const newValue = cell.getValue();

        const isFlipped = String(rowData.id).includes('_flipped');
        const canonicalId = String(rowData.id).replace('_flipped', '');
        const allBudgets = (await getBudget(currentScenario.id)).map(normalizeCanonicalTransaction);
        const budgetIndex = allBudgets.findIndex(b => String(b.id) === canonicalId);

        if (budgetIndex >= 0) {
          const updatedBudget = mapEditToCanonical(allBudgets[budgetIndex], { field, value: newValue, isFlipped });

          // Normalize actualAmount if set
          if (updatedBudget.actualAmount !== null && updatedBudget.actualAmount !== undefined) {
            updatedBudget.actualAmount = Math.abs(Number(updatedBudget.actualAmount) || 0);
          }

          // If actual amount or actual date is edited, change status to 'actual'
          if (field === 'actualAmount' || field === 'actualDate') {
            const hasActualData = (updatedBudget.actualAmount !== null && updatedBudget.actualAmount !== undefined) || 
                                  (updatedBudget.actualDate !== null && updatedBudget.actualDate !== undefined);
            if (hasActualData) {
              updatedBudget.status = {
                name: 'actual',
                actualAmount: updatedBudget.actualAmount || null,
                actualDate: updatedBudget.actualDate || null
              };
            }
          }

          allBudgets[budgetIndex] = updatedBudget;
          await BudgetManager.saveAll(currentScenario.id, allBudgets);
        }
      }
    });

    // Attach grouping control handler
    const budgetGroupingSelect = document.getElementById('budget-grouping-select');
    if (budgetGroupingSelect) {
      const formatGroupLabel = (val) => {
        if (val === null || val === undefined || val === '') return 'Unspecified';
        if (typeof val === 'object') return val.name || val.label || val.description || 'Unspecified';
        return String(val);
      };

      budgetGroupingSelect.addEventListener('change', (e) => {
        const groupField = e.target.value;
        if (groupField) {
          masterBudgetTable.setGroupBy(groupField);
          // Add groupHeader with sum for grouped field
          masterBudgetTable.setGroupHeader((value, count, data, group) => {
            const totalAmount = data.reduce((sum, row) => sum + Number(row.plannedAmount || 0), 0);
            const label = formatGroupLabel(value);
            const formatted = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(totalAmount);
            return `${label} (${count} items, Total: ${formatted})`;
          });
        } else {
          masterBudgetTable.setGroupBy(false);
        }
      });
    }
    
    // Apply initial filter after table creation
    setTimeout(() => {
      if (transactionFilterAccountIdSnapshot) {
        // If account is selected, show only that account's perspective
        masterBudgetTable.setFilter((data) => {
          if (!data.perspectiveAccountId) return true;
          return Number(data.perspectiveAccountId) === transactionFilterAccountIdSnapshot;
        });
      } else {
        // If no account selected, show only primary perspectives (not flipped ones)
        masterBudgetTable.setFilter((data) => {
          // Show rows that are NOT flipped perspectives (no "_flipped" in ID)
          return !String(data.id).includes('_flipped');
        });
      }
      // Totals will be updated via dataFiltered event
    }, 0);
    
    const handleBudgetFiltered = function(filters, rows) {
      updateBudgetTotals(rows);
    };
    
    const handleBudgetBuilt = function() {
      updateBudgetTotals();
    };

    attachGridHandlers(masterBudgetTable, {
      dataFiltered: handleBudgetFiltered,
      tableBuilt: handleBudgetBuilt
    });

  } catch (err) {
    console.error('[Forecast] Failed to load budget grid:', err);
  }
}

// Load projections section (buttons and grid)
async function loadProjectionsSection(container) {
  if (!currentScenario) return;

  container.innerHTML = '';

  // Create toolbar for controls
  const toolbar = document.createElement('div');
  toolbar.className = 'grid-toolbar';

  // Add button container with Generate, Clear, and Save as Budget buttons
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'toolbar-item';

  const generateButton = document.createElement('button');
  generateButton.className = 'btn btn-primary';
  generateButton.textContent = 'Generate Projections';
  generateButton.addEventListener('click', async () => {
    try {
      generateButton.textContent = 'Generating...';
      generateButton.disabled = true;
      await generateProjections(currentScenario.id, { 
        periodicity: 'monthly',
        source: 'transactions' // Explicitly use transactions as source
      });
      // Reload scenario to get updated projections
      currentScenario = await getScenario(currentScenario.id);
      await loadProjectionsSection(container);
    } catch (err) {
      console.error('[Forecast] Failed to generate projections:', err);
      alert('Failed to generate projections: ' + err.message);
    } finally {
      generateButton.textContent = 'Generate Projections';
      generateButton.disabled = false;
    }
  });
  window.add(buttonContainer, generateButton);

  const clearButton = document.createElement('button');
  clearButton.className = 'btn';
  clearButton.textContent = 'Clear Projections';
  clearButton.addEventListener('click', async () => {
    try {
      await clearProjections(currentScenario.id);
      currentScenario = await getScenario(currentScenario.id);
      await loadProjectionsSection(container);
    } catch (err) {
      console.error('[Forecast] Failed to clear projections:', err);
    }
  });
  window.add(buttonContainer, clearButton);
  
  const saveBudgetButton = document.createElement('button');
  saveBudgetButton.className = 'btn btn-primary';
  saveBudgetButton.textContent = 'Save as Budget';
  saveBudgetButton.addEventListener('click', async () => {
    try {
      if (!currentScenario.projections || currentScenario.projections.length === 0) {
        alert('No projections to save as budget. Generate projections first.');
        return;
      }
      
      const confirmed = confirm('Save current projection as Budget? This will replace any existing budget.');
      if (!confirmed) return;
      
      saveBudgetButton.textContent = 'Saving...';
      saveBudgetButton.disabled = true;
      
      // Create budget from current projections
      await BudgetManager.createFromProjections(currentScenario.id, currentScenario.projections);
      
      // Reload scenario and budget grid
      currentScenario = await getScenario(currentScenario.id);
      await loadBudgetGrid(getEl('budgetTable'));
      
      alert('Budget saved successfully!');
    } catch (err) {
      console.error('[Forecast] Failed to save budget:', err);
      alert('Failed to save budget: ' + err.message);
    } finally {
      saveBudgetButton.textContent = 'Save as Budget';
      saveBudgetButton.disabled = false;
    }
  });
  window.add(buttonContainer, saveBudgetButton);
  
  window.add(toolbar, buttonContainer);

  // Add account filter dropdown
  const accountFilter = document.createElement('div');
  accountFilter.className = 'toolbar-item account-filter';
  accountFilter.innerHTML = `
    <label for="projections-account-filter-select" class="text-muted control-label">Account:</label>
    <select id="projections-account-filter-select" class="input-select control-select">
      <option value="">-- All Accounts --</option>
    </select>
  `;
  window.add(toolbar, accountFilter);
  
  // Add grouping control
  const groupingControl = document.createElement('div');
  groupingControl.className = 'toolbar-item grouping-control';
  groupingControl.innerHTML = `
    <label for="projections-grouping-select" class="text-muted control-label">Group By:</label>
    <select id="projections-grouping-select" class="input-select control-select">
      <option value="">None</option>
      <option value="account">Account</option>
    </select>
  `;
  window.add(toolbar, groupingControl);
  
  // Add toolbar to container
  window.add(container, toolbar);

  // Populate projections account filter dropdown
  const projectionsAccountFilterSelect = document.getElementById('projections-account-filter-select');
  if (projectionsAccountFilterSelect) {
    (currentScenario.accounts || []).forEach((account) => {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = account.name;
      projectionsAccountFilterSelect.appendChild(option);
    });
    
    // Set default to first account if not already filtered, or keep current selection
    const firstAccountId = currentScenario.accounts?.[0]?.id;
    projectionsAccountFilterSelect.value = transactionFilterAccountId || firstAccountId || '';
    
    // If we're setting a default account that wasn't previously selected, update the filter
    if (!transactionFilterAccountId && firstAccountId) {
      transactionFilterAccountId = firstAccountId;
    }
    
    // Attach event listener for filtering projections
    projectionsAccountFilterSelect.addEventListener('change', async (e) => {
      transactionFilterAccountId = e.target.value ? Number(e.target.value) : null;
      
      // Apply filter to all grids
      if (masterTransactionsTable) {
        if (transactionFilterAccountId) {
          masterTransactionsTable.setFilter((data) => {
            if (!data.perspectiveAccountId) return true;
            return Number(data.perspectiveAccountId) === transactionFilterAccountId;
          });
        } else {
          masterTransactionsTable.setFilter((data) => {
            return !String(data.id).includes('_flipped');
          });
        }
        updateTransactionTotals();
      }
      
      if (masterBudgetTable) {
        if (transactionFilterAccountId) {
          masterBudgetTable.setFilter((data) => {
            if (!data.perspectiveAccountId) return true;
            return Number(data.perspectiveAccountId) === transactionFilterAccountId;
          });
        } else {
          masterBudgetTable.setFilter((data) => {
            return !String(data.id).includes('_flipped');
          });
        }
        updateBudgetTotals();
      }
      
      // Reload projections grid to reflect filter (only the grid, not the whole section)
      const gridContainer = document.getElementById('projectionsGrid');
      if (gridContainer) {
        await loadProjectionsGrid(gridContainer);
        
        // Update totals in toolbar
        const filteredProjections = transactionFilterAccountId
          ? (currentScenario.projections || []).filter(p => p.accountId === transactionFilterAccountId)
          : currentScenario.projections || [];
        
        const projectionTotals = filteredProjections.reduce((acc, p) => {
          const income = Number(p.income || 0);
          const expenses = Number(p.expenses || 0);
          const netChange = p.netChange !== undefined && p.netChange !== null
            ? Number(p.netChange)
            : (income - expenses);

          acc.income += income;
          acc.expenses += expenses;
          acc.net += netChange;
          return acc;
        }, { income: 0, expenses: 0, net: 0 });
        
        // Update totals display
        const formatCurrency = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
        const toolbarTotals = container.querySelector('.toolbar-totals');
        if (toolbarTotals) {
          toolbarTotals.innerHTML = `
            <span class="toolbar-total-item"><span class="label">Income:</span> <span class="value positive">${formatCurrency(projectionTotals.income)}</span></span>
            <span class="toolbar-total-item"><span class="label">Expenses:</span> <span class="value negative">${formatCurrency(projectionTotals.expenses)}</span></span>
            <span class="toolbar-total-item"><span class="label">Net:</span> <span class="value ${projectionTotals.net >= 0 ? 'positive' : 'negative'}">${formatCurrency(projectionTotals.net)}</span></span>
          `;
        }
      }
    });
  } else {
    console.error('[Projections] Could not find account filter select element!');
  }

  // Projections grid container
  const projectionsGridContainer = document.createElement('div');
  projectionsGridContainer.id = 'projectionsGrid';
  projectionsGridContainer.className = 'grid-container projections-grid';
  window.add(container, projectionsGridContainer);

  // Load projections grid
  await loadProjectionsGrid(projectionsGridContainer);
}

// Load projections grid
async function loadProjectionsGrid(container) {
  if (!currentScenario) return;

  container.innerHTML = '';

  try {
    // Filter projections by selected account
    const filteredProjections = transactionFilterAccountId
      ? (currentScenario.projections || []).filter(p => p.accountId === transactionFilterAccountId)
      : currentScenario.projections || [];

    // Build account lookup map for O(1) access instead of O(n) find for each projection
    const accountMap = new Map((currentScenario.accounts || []).map(a => [a.id, a]));

    // Grid will show placeholder if no projections (handled by Tabulator)

    // Transform projections for display
    const transformedData = filteredProjections.map(p => ({
      date: p.date,
      account: accountMap.get(p.accountId)?.name || '',
      balance: p.balance || 0,
      income: p.income || 0,
      expenses: p.expenses || 0,
      netChange: p.netChange || 0
    }));

    const projectionsTable = await createGrid(container, {
      data: transformedData,
      layout: "fitColumns",
      columns: [
        createDateColumn('Date', 'date', { widthGrow: 1 }),
        createTextColumn('Account', 'account', { widthGrow: 2 }),
        createMoneyColumn('Projected Balance', 'balance', { widthGrow: 2 }),
        createMoneyColumn('Projected Income', 'income', { widthGrow: 2 }),
        createMoneyColumn('Projected Expenses', 'expenses', { widthGrow: 2 }),
        {
          title: "Net Change",
          field: "netChange",
          widthGrow: 2,
          formatter: function(cell) {
            const value = cell.getValue();
            const formatted = new Intl.NumberFormat('en-ZA', {
              style: 'currency',
              currency: 'ZAR',
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }).format(value);
            
            // Color code: green for positive, red for negative
            const cls = value >= 0 ? 'status-netchange positive' : 'status-netchange negative';
            return `<span class="${cls}">${formatted}</span>`; 
          },
          headerHozAlign: "right",
          hozAlign: "right"
        }
      ]
    });

    // Attach grouping control handler
    const projectionsGroupingSelect = document.getElementById('projections-grouping-select');
    if (projectionsGroupingSelect) {
      const formatGroupLabel = (val) => {
        if (val === null || val === undefined || val === '') return 'Unspecified';
        if (typeof val === 'object') return val.name || val.label || val.description || 'Unspecified';
        return String(val);
      };

      projectionsGroupingSelect.addEventListener('change', (e) => {
        const groupField = e.target.value;
        if (groupField) {
          projectionsTable.setGroupBy(groupField);
          // Add groupHeader with sum of balance
          projectionsTable.setGroupHeader((value, count, data, group) => {
            const totalBalance = data.reduce((sum, row) => sum + Number(row.balance || 0), 0);
            const label = formatGroupLabel(value);
            const formatted = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(totalBalance);
            return `${label} (${count} periods, Total Balance: ${formatted})`;
          });
        } else {
          projectionsTable.setGroupBy(false);
        }
      });
    }

  } catch (err) {
    console.error('[Forecast] Failed to load projections grid:', err);
  }
}

// Load all data for current scenario
async function loadScenarioData() {
  const containers = {
    accountsTable: getEl('accountsTable'),
    transactionsTable: getEl('transactionsTable'),
    budgetTable: getEl('budgetTable'),
    projectionsContent: getEl('projectionsContent')
  };

  const typeConfig = getScenarioTypeConfig();
  
  // Show/hide sections based on scenario type
  const accountsSection = getEl('accountsTable').closest('.bg-main');
  const generatePlanSection = getEl('generatePlanSection');
  const txSection = getEl('transactionsTable').closest('.bg-main');
  const budgetSection = getEl('budgetSection');
  const projectionsSection = getEl('projectionsSection');
  
  if (typeConfig) {
    if (typeConfig.showAccounts) accountsSection.classList.remove('hidden'); else accountsSection.classList.add('hidden');
    if (typeConfig.showGeneratePlan) generatePlanSection.style.display = 'block'; else generatePlanSection.style.display = 'none';
    if (typeConfig.showPlannedTransactions || typeConfig.showActualTransactions) txSection.classList.remove('hidden'); else txSection.classList.add('hidden');
    if (typeConfig.showProjections) projectionsSection.classList.remove('hidden'); else projectionsSection.classList.add('hidden');
    // Budget section is always visible (can be hidden manually by user via accordion)
    budgetSection.classList.remove('hidden');
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
    console.error('[App] Data migration failed:', error);
    console.error('[App] Error message:', error?.message);
    console.error('[App] Error stack:', error?.stack);
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
  console.error('[ForecastPage] Initialization failed:', err);
  logger.error('Page initialization failed', err);
});
