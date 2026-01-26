// forecast.js
// Manages the Forecast page with scenario-centric model
// Displays accounts, planned transactions, actual transactions, and projections based on scenario type

console.log('forecast.js loaded at', new Date().toISOString());

import { getSchemaPath, getAppDataPath } from './app-paths.js';

import { createGrid, createSelectorColumn, createTextColumn, createObjectColumn, createDateColumn, createMoneyColumn, createListEditor } from './grid-factory.js';
import * as ScenarioManager from './managers/scenario-manager.js';
import * as AccountManager from './managers/account-manager.js';
import * as TransactionManager from './managers/transaction-manager.js';
import * as BudgetManager from './managers/budget-manager.js';
import { openRecurrenceModal } from './modal-recurrence.js';
import { openPeriodicChangeModal } from './modal-periodic-change.js';
import { openTextInputModal } from './modal-text-input.js';
import keyboardShortcuts from './keyboard-shortcuts.js';
import { loadGlobals } from './global-app.js';
import { createLogger } from './logger.js';

const logger = createLogger('ForecastController');

import { formatDateOnly, parseDateOnly } from './date-utils.js';

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
let selectedAccountId = null; // Track selected account for filtering transaction views
let actualPeriod = null; // Selected period for actual transactions
let periods = []; // Calculated periods for current scenario

// Build the main UI container with independent accordions
function buildGridContainer() {
  const forecastEl = getEl('panel-forecast');

  // Top row: Scenarios and Accounts side-by-side
  const topRow = document.createElement('div');
  topRow.classList.add('layout-two-column', 'mb-lg');
  window.add(forecastEl, topRow);

  // Scenario selector (always visible, no accordion)
  const scenarioSection = document.createElement('div');
  scenarioSection.className = 'bg-main bordered rounded shadow-lg section-padding';
  
  const scenarioSelector = document.createElement('div');
  scenarioSelector.id = 'scenario-selector';
  window.add(scenarioSection, scenarioSelector);
  window.add(topRow, scenarioSection);

  // Accounts section with accordion
  const accountsSection = document.createElement('div');
  accountsSection.className = 'bg-main bordered rounded shadow-lg';
  
  const accountsHeader = document.createElement('div');
  accountsHeader.className = 'pointer flex-between accordion-header section-padding';
  accountsHeader.innerHTML = `<h2 class="text-main section-title">Accounts</h2><span class="accordion-arrow">&#9662;</span>`;  
  accountsHeader.addEventListener('click', () => window.toggleAccordion('accountsContent'));
  window.add(accountsSection, accountsHeader);
  
  const accountsContent = document.createElement('div');
  accountsContent.id = 'accountsContent';
  accountsContent.className = 'accordion-content open';
  window.add(accountsSection, accountsContent);
  
  const accountsTable = document.createElement('div');
  accountsTable.id = 'accountsTable';
  window.add(accountsContent, accountsTable);
  window.add(topRow, accountsSection);

  // Middle row: Transactions (unified planned and actual)
  const middleRow = document.createElement('div');
  middleRow.classList.add('mb-lg');
  window.add(forecastEl, middleRow);

  // Transactions section (unified planned and actual)
  const transactionsSection = document.createElement('div');
  transactionsSection.className = 'bg-main bordered rounded shadow-lg';

  const transactionsHeader = document.createElement('div');
  transactionsHeader.className = 'pointer flex-between accordion-header section-padding';
  transactionsHeader.innerHTML = `<h2 class="text-main section-title">Transactions</h2><span class="accordion-arrow">&#9662;</span>`;
  transactionsHeader.addEventListener('click', () => window.toggleAccordion('transactionsContent'));
  window.add(transactionsSection, transactionsHeader);

  const transactionsContent = document.createElement('div');
  transactionsContent.id = 'transactionsContent';
  transactionsContent.className = 'accordion-content open section-content';
  window.add(transactionsSection, transactionsContent);

  const transactionsTable = document.createElement('div');
  transactionsTable.id = 'transactionsTable';
  window.add(transactionsContent, transactionsTable);

  window.add(middleRow, transactionsSection);
  
  // Budget section (between Transactions and Projections)
  const budgetRow = document.createElement('div');
  budgetRow.classList.add('mb-lg');
  window.add(forecastEl, budgetRow);

  const budgetSection = document.createElement('div');
  budgetSection.id = 'budgetSection';
  budgetSection.className = 'bg-main bordered rounded shadow-lg';

  const budgetHeader = document.createElement('div');
  budgetHeader.id = 'budgetAccordionHeader';
  budgetHeader.className = 'pointer flex-between accordion-header section-padding';
  budgetHeader.innerHTML = `<h2 class="text-main section-title">Budget</h2><span class="accordion-arrow">&#9662;</span>`;
  budgetHeader.addEventListener('click', () => window.toggleAccordion('budgetContent'));
  window.add(budgetSection, budgetHeader);

  const budgetContent = document.createElement('div');
  budgetContent.id = 'budgetContent';
  budgetContent.className = 'accordion-content open section-content';
  window.add(budgetSection, budgetContent);

  const budgetTable = document.createElement('div');
  budgetTable.id = 'budgetTable';
  window.add(budgetContent, budgetTable);

  window.add(budgetRow, budgetSection);

  // Bottom row: Projections (full width)
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
  projectionsContent.className = 'accordion-content open';
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

// Build scenario grid for creation and selection
async function buildScenarioGrid(container) {
  container.innerHTML = '';

  const fs = window.require('fs').promises;
  const lookupPath = getSchemaPath('lookup-data.json');

  try {
    const lookupFile = await fs.readFile(lookupPath, 'utf8');
    const lookupData = JSON.parse(lookupFile);

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

    const scenariosTable = createGrid(gridContainer, {
      data: scenarios,
      selectable: 1, // Only allow single row selection
      columns: [
        {
          width: 50,
          hozAlign: "center",
          cssClass: "delete-cell",
          formatter: function(cell){
            try {
              const rowEl = cell.getRow().getElement();
              if (rowEl && rowEl.classList.contains('tabulator-calcs-row')) return '';
            } catch(e){}
            return '<svg enable-background="new 0 0 24 24" height="14" width="14" viewBox="0 0 24 24" xml:space="preserve"><path d="M22.245,4.015c0.313,0.313,0.313,0.826,0,1.139l-6.276,6.27c-0.313,0.312-0.313,0.826,0,1.14l6.273,6.272  c0.313,0.313,0.313,0.826,0,1.14l-2.285,2.277c-0.314,0.312-0.828,0.312-1.142,0l-6.271-6.271c-0.313-0.313-0.828-0.313-1.141,0  l-6.276,6.267c-0.313,0.313-0.828,0.313-1.141,0l-2.282-2.28c-0.313-0.313-0.313-0.826,0-1.14l6.278-6.269  c0.313-0.312,0.313-0.826,0-1.14L1.709,5.147c-0.314-0.313-0.314-0.827,0-1.14l2.284-2.278C4.308,1.417,4.821,1.417,5.135,1.73  L11.405,8c0.314,0.314,0.828,0.314,1.141,0.001l6.276-6.267c0.312-0.312,0.826-0.312,1.141,0L22.245,4.015z"></path0,1.139l-6.276,6.27c-0.313,0.312-0.313,0.826,0,1.14l6.273,6.272  c0.313,0.313,0.313,0.826,0,1.14l-2.285,2.277c-0.314,0.312-0.828,0.312-1.142,0l-6.271-6.271c-0.313-0.313-0.828-0.313-1.141,0  l-6.276,6.267c-0.313,0.313-0.828,0.313-1.141,0l-2.282-2.28c-0.313-0.313-0.313-0.826,0-1.14l6.278-6.269  c0.313-0.312,0.313-0.826,0-1.14L1.709,5.147c-0.314-0.313-0.314-0.827,0-1.14l2.284-2.278C4.308,1.417,4.821,1.417,5.135,1.73  L11.405,8c0.314,0.314,0.828,0.314,1.141,0.001l6.276-6.267c0.312-0.312,0.826-0.312,1.141,0L22.245,4.015z"></path0,1.139l-6.276,6.27c-0.313,0.312-0.313,0.826,0,1.14l6.273,6.272  c0.313,0.313,0.313,0.826,0,1.14l-2.285,2.277c-0.314,0.312-0.828,0.312-1.142,0l-6.271-6.271c-0.313-0.313-0.828-0.313-1.141,0  l-6.276,6.267c-0.313,0.313-0.828,0.313-1.141,0l-2.282-2.28c-0.313-0.313-0.313-0.826,0-1.14l6.278-6.269  c0.313-0.312,0.313-0.826,0-1.14L1.709,5.147c-0.314-0.313-0.314-0.827,0-1.14l2.284-2.278C4.308,1.417,4.821,1.417,5.135,1.73  L11.405,8c0.314,0.314,0.828,0.314,1.141,0.001l6.276-6.267c0.312-0.312,0.826-0.312,1.141,0L22.245,4.015z"></path0,1.139l-6.276,6.27c-0.313,0.312-0.313,0.826,0,1.14l6.273,6.272  c0.313,0.313,0.313,0.826,0,1.14l-2.285,2.277c-0.314,0.312-0.828,0.312-1.142,0l-6.271-6.271c-0.313-0.313-0.828-0.313-1.141,0  l-6.276,6.267c-0.313,0.313-0.828,0.313-1.141,0l-2.282-2.28c-0.313-0.313-0.313-0.826,0-1.14l6.278-6.269  c0.313-0.312,0.313-0.826,0-1.14L1.709,5.147c-0.314-0.313-0.314-0.827,0-1.14l2.284-2.278C4.308,1.417,4.821,1.417,5.135,1.73  L11.405,8c0.314,0.314,0.828,0.314,1.141,0.001l6.276-6.267c0.312-0.312,0.826-0.312,1.141,0L22.245,4.015z"></path></svg>';
          },
          cellClick: async function(e, cell) {
            try {
              const row = cell.getRow();
              const rowEl = row.getElement();
              if (rowEl && rowEl.classList.contains('tabulator-calcs-row')) return; // ignore calc row
              const rowData = row.getData();
              if (confirm(`Delete scenario: ${rowData.name}?`)) {
                await ScenarioManager.remove(rowData.id);
                await buildScenarioGrid(container);
              }
            } catch (err) {
              console.error('Delete scenario cellClick failed', err);
            }
          }
        },
        createTextColumn('Scenario Name', 'name', { widthGrow: 3, editor: "input", editable: true }),
        {
          title: "Type",
          field: "type",
          widthGrow: 2,
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
        createTextColumn('Description', 'description', { widthGrow: 3, editor: "input", editable: true, responsive: 2 }),
        createDateColumn('Start Date', 'startDate', { widthGrow: 2, editor: "date", responsive: 3 }),
        createDateColumn('End Date', 'endDate', { widthGrow: 2, editor: "date", responsive: 3 }),
        {
          title: "Period Type",
          field: "projectionPeriod",
          widthGrow: 2,
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
          selectedAccountId = null; // Clear selected account when switching scenarios
          await loadScenarioData();
        }
      }
    });

    // Also attach handler to Tabulator's rowSelected event to follow recommended pattern
    scenariosTable.on('rowSelected', async function(row){
      try {
        const scenario = row.getData();
        currentScenario = await getScenario(scenario.id);
        selectedAccountId = null;
        await loadScenarioData();
      } catch (err) {
        logger.error('[ScenarioGrid] rowSelected handler failed:', err);
      }
    });

    // Attach direct event listeners to help debug selection behavior
    scenariosTable.on('rowClick', function(e, row) {
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
    });

    scenariosTable.on('rowSelected', function(row) {
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
          selectedAccountId = null;
          await loadScenarioData();
        } catch (err) {
          logger.error('[ScenarioGrid] rowSelected handler failed (delayed):', err);
        }
      }, 40);
    });

    scenariosTable.on('rowDeselected', function(row) {
    });

    // Attach cellEdited event handler
    scenariosTable.on("cellEdited", async function(cell) {
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
    });

    // Set initial scenario if not set and load its data
    if (!currentScenario && scenarios.length > 0) {
      currentScenario = await getScenario(scenarios[0].id);
      await loadScenarioData();
      
      // Select the first row
      setTimeout(() => {
        const rows = scenariosTable.getRows();
        if (rows && rows.length > 0) {
          rows[0].select();
        }
      }, 100);
    }
  } catch (err) {
    console.error('[Forecast] Failed to load scenario grid:', err);
  }
}

// Load scenario type configuration
async function loadScenarioTypes() {
  const fs = window.require('fs').promises;
  const lookupPath = getSchemaPath('lookup-data.json');

  try {
    const lookupFile = await fs.readFile(lookupPath, 'utf8');
    const data = JSON.parse(lookupFile);
    scenarioTypes = data.scenarioTypes;
  } catch (err) {
    console.error('[Forecast] Failed to load scenario types:', err);
    scenarioTypes = [];
  }
}

// Get current scenario type configuration
function getScenarioTypeConfig() {
  if (!currentScenario || !scenarioTypes) return null;
  
  return scenarioTypes.find(st => st.name === currentScenario.type.name);
}

/**
 * Transform planned transactions from backend format (debitAccount/creditAccount)
 * to UI format (transactionType/secondaryAccount) filtered by selected account
 */
function transformPlannedTxForUI(plannedTxs, selectedAccountId) {
  const selIdNum = selectedAccountId != null ? Number(selectedAccountId) : null;

  // logger.debug(`[Transform] transformPlannedTxForUI - Processing ${plannedTxs.length} total transactions for account ${selIdNum}`);

  const result = plannedTxs.map((tx, index) => {
    if (!selIdNum) {
      // Default view when no account is selected: show all transactions
      return {
        ...tx,
        transactionType: { id: 1, name: 'Money Out' },
        secondaryAccount: tx.creditAccount
      };
    }

    const mapped = mapTxToUI(tx, selIdNum);
    if (!mapped) return null;


    return {
      ...tx,
      transactionType: mapped.transactionType,
      secondaryAccount: mapped.secondaryAccount
    };
  }).filter(tx => tx !== null);

  return result;
}

/**
 * Transform planned transaction from UI format (transactionType/secondaryAccount)
 * back to backend format (debitAccount/creditAccount) relative to selected account
 */
async function transformPlannedTxForBackend(tx, selectedAccountId) {
  // Skip transactions with missing required fields (allow zero amount)
  if (!tx.transactionType || !tx.secondaryAccount || tx.amount == null) {
    console.warn('[Forecast] Skipping transaction with missing required fields');
    return null;
  }
  
  const isDebit = tx.transactionType?.id === 1 || tx.transactionType?.name === 'Money Out';
  
  // Get selected account details
  const selectedAccount = currentScenario.accounts?.find(a => a.id === Number(selectedAccountId));
  const selectedAccountObj = selectedAccount 
    ? { id: selectedAccount.id }
    : { id: selectedAccountId };
  
  // Resolve secondary account - accept object, id=null placeholder, or string name
  let secondaryAccountObj = tx.secondaryAccount;
  
  if (typeof secondaryAccountObj === 'string') {
    // lookup or create if string provided
    const foundAccount = currentScenario.accounts?.find(a => a.name === secondaryAccountObj);
    if (foundAccount) {
      secondaryAccountObj = { id: foundAccount.id };
    } else {
      const newAccount = await AccountManager.create(currentScenario.id, {
        name: secondaryAccountObj,
        type: { id: 1, name: 'Asset' },
        currency: { id: 1, name: 'ZAR' },
        balance: 0,
        openDate: formatDateOnly(new Date()),
        periodicChange: null
      });
      currentScenario = await getScenario(currentScenario.id);
      secondaryAccountObj = { id: newAccount.id };
    }
  } else if (secondaryAccountObj && secondaryAccountObj.id === null && secondaryAccountObj.name) {
    const foundAccount = currentScenario.accounts?.find(a => a.name === secondaryAccountObj.name);
    if (foundAccount) {
      secondaryAccountObj = { id: foundAccount.id };
    } else {
      // Account doesn't exist - create it
      const newAccount = await createAccount(currentScenario.id, {
        name: secondaryAccountObj.name,
        type: { id: 1, name: 'Asset' }, // Default to Asset type
        currency: { id: 1, name: 'ZAR' }, // Default currency
        balance: 0,
        openDate: formatDateOnly(new Date()),
        periodicChange: null
      });
      
      // Reload scenario to get the updated accounts list
      currentScenario = await getScenario(currentScenario.id);
      
      secondaryAccountObj = { id: newAccount.id };
    }
  }
  
  const result = {
    ...tx,
    debitAccount: isDebit ? selectedAccountObj : secondaryAccountObj,
    creditAccount: isDebit ? secondaryAccountObj : selectedAccountObj,
    // Remove UI-only fields
    transactionType: undefined,
    secondaryAccount: undefined,
    fromAccount: undefined,
    toAccount: undefined
  };
  
  return result;
}

/**
 * Transform actual transactions for UI (same as planned transactions)
 */
function transformActualTxForUI(actualTxs, selectedAccountId) {
  const selIdNum = selectedAccountId != null ? Number(selectedAccountId) : null;

  // When no account selected, show all actual transactions (default view)
  if (!selIdNum) return actualTxs.map(tx => ({
    ...tx,
    transactionType: { id: 1, name: 'Debit' },
    secondaryAccount: tx.creditAccount
  }));

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
function mapTxToUI(tx, selectedAccountId) {
  const selIdNum = selectedAccountId != null ? Number(selectedAccountId) : null;
  if (!selIdNum) return null;

  const isSelectedDebit = tx.debitAccount?.id === selIdNum;
  const isSelectedCredit = tx.creditAccount?.id === selIdNum;
  if (!isSelectedDebit && !isSelectedCredit) return null;

  const secondaryAccountRef = isSelectedDebit ? tx.creditAccount : tx.debitAccount;
  const secondaryAccount = secondaryAccountRef
    ? currentScenario.accounts?.find(a => a.id === secondaryAccountRef.id) || secondaryAccountRef
    : null;

  const transactionType = isSelectedDebit ? { id: 1, name: 'Money Out' } : { id: 2, name: 'Money In' };
  return { transactionType, secondaryAccount };
}

/**
 * Transform actual transaction from UI back to backend format (same as planned transactions)
 */
async function transformActualTxForBackend(tx, selectedAccountId) {
  const isDebit = tx.transactionType?.id === 1 || tx.transactionType?.name === 'Money Out';
  
  // Get selected account details
  const selectedAccount = currentScenario.accounts?.find(a => a.id === Number(selectedAccountId));
  const selectedAccountObj = selectedAccount 
    ? { id: selectedAccount.id }
    : { id: selectedAccountId };
  
  // Resolve secondary account - if id is null, look up by name or create new account
  let secondaryAccountObj = null;
  
  // If secondary account is missing, default to first available account (excluding selected)
  if (!tx.secondaryAccount || !tx.secondaryAccount.name) {
    const otherAccounts = currentScenario.accounts?.filter(a => a.id !== Number(selectedAccountId)) || [];
    if (otherAccounts.length > 0) {
      secondaryAccountObj = { id: otherAccounts[0].id };
    } else {
      console.warn('[Forecast] No available secondary account, skipping transaction');
      return null;
    }
  } else {
    secondaryAccountObj = tx.secondaryAccount;
  }
  
  if (secondaryAccountObj && secondaryAccountObj.id === null && secondaryAccountObj.name) {
    const foundAccount = currentScenario.accounts?.find(a => a.name === secondaryAccountObj.name);
    if (foundAccount) {
      secondaryAccountObj = { id: foundAccount.id };
    } else {
      // Account doesn't exist - create it
      const newAccount = await createAccount(currentScenario.id, {
        name: secondaryAccountObj.name,
        type: { id: 1, name: 'Asset' }, // Default to Asset type
        currency: { id: 1, name: 'ZAR' }, // Default currency
        balance: 0,
        openDate: formatDateOnly(new Date()),
        periodicChange: null
      });
      
      // Reload scenario to get the updated accounts list
      currentScenario = await getScenario(currentScenario.id);
      
      secondaryAccountObj = { id: newAccount.id };
    }
  }
  
  return {
    ...tx,
    debitAccount: isDebit ? selectedAccountObj : secondaryAccountObj,
    creditAccount: isDebit ? secondaryAccountObj : selectedAccountObj,
    // Remove UI-only fields
    transactionType: undefined,
    secondaryAccount: undefined
  };
}

// Load accounts grid
async function loadAccountsGrid(container) {
  if (!currentScenario) {
    logger.warn('[Forecast] loadAccountsGrid: No current scenario');
    return;
  }


  const typeConfig = getScenarioTypeConfig();
  if (!typeConfig || !typeConfig.showAccounts) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';

  try {
    const accounts = await AccountManager.getAll(currentScenario.id);
    const displayAccounts = accounts.filter(a => a.name !== 'Select Account');
    const fs = window.require('fs').promises;
    const lookupPath = getSchemaPath('lookup-data.json');
    const lookupFile = await fs.readFile(lookupPath, 'utf8');
    const lookupData = JSON.parse(lookupFile);

    // Add "Add Account" button
    // Remove any existing add buttons for accounts (defensive)
    const existingAccountAdds = container.querySelectorAll('.btn-add');
    existingAccountAdds.forEach(el => el.remove());

    const addButton = document.createElement('button');
    addButton.className = 'btn btn-primary btn-add';
    addButton.textContent = '+ Add New';
    addButton.addEventListener('click', async () => {
      const newAccount = await AccountManager.create(currentScenario.id, {
        name: 'New Account',
        type: null,
        currency: null,
        balance: 0
      });
      await loadAccountsGrid(container);
    });
    window.add(container, addButton);

    // Create grid container
    const gridContainer = document.createElement('div');
    gridContainer.id = 'accountsGrid'; // explicit ID for inner accounts grid
    gridContainer.className = 'grid-container accounts-grid';
    // Remove any previous inner accountsGrid if present (defensive)
    const existingInner = container.querySelector('#accountsGrid');
    if (existingInner) existingInner.remove();
    window.add(container, gridContainer);

    const accountsTable = createGrid(gridContainer, {
      data: displayAccounts,
      selectable: 1, // Enable built-in single selection
      columns: [
        {
          width: 50,
          hozAlign: "center",
          cssClass: "delete-cell",
          formatter: function(cell){
            try { const rowEl = cell.getRow().getElement(); if (rowEl && rowEl.classList.contains('tabulator-calcs-row')) return ''; } catch(e){}
            return '<svg enable-background="new 0 0 24 24" height="14" width="14" viewBox="0 0 24 24" xml:space="preserve"><path d="M22.245,4.015c0.313,0.313,0.313,0.826,0,1.139l-6.276,6.27c-0.313,0.312-0.313,0.826,0,1.14l6.273,6.272  c0.313,0.313,0.313,0.826,0,1.14l-2.285,2.277c-0.314,0.312-0.828,0.312-1.142,0l-6.271-6.271c-0.313-0.313-0.828-0.313-1.141,0  l-6.276,6.267c-0.313,0.313-0.828,0.313-1.141,0l-2.282-2.28c-0.313-0.313-0.313-0.826,0-1.14l6.278-6.269  c0.313-0.312,0.313-0.826,0-1.14L1.709,5.147c-0.314-0.313-0.314-0.827,0-1.14l2.284-2.278C4.308,1.417,4.821,1.417,5.135,1.73  L11.405,8c0.314,0.314,0.828,0.314,1.141,0.001l6.276-6.267c0.312-0.312,0.826-0.312,1.141,0L22.245,4.015z"></path></svg>';
          },
          cellClick: async function(e, cell) {
            try {
              const row = cell.getRow();
              const rowEl = row.getElement();
              if (rowEl && rowEl.classList.contains('tabulator-calcs-row')) return; // ignore calc row
              const rowData = row.getData();
              if (confirm(`Delete account: ${rowData.name}?`)) {
                await AccountManager.remove(currentScenario.id, rowData.id);
                await loadAccountsGrid(container);
                await loadMasterTransactionsGrid(document.getElementById('transactionsTable'));
              }
            } catch (err) { console.error('Delete account failed', err); }
          }
        },
        createTextColumn('Account Name', 'name', { widthGrow: 2 }),
        createObjectColumn('Type', 'type', 'name', Object.assign({ widthGrow: 1 }, createListEditor(lookupData.accountTypes))),

        createObjectColumn('Currency', 'currency', 'name', Object.assign({ width: 100, responsive: 2 }, createListEditor(lookupData.currencies))),

        createMoneyColumn('Balance', 'balance', { widthGrow: 1 })
      ],
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
      rowSelectionChanged: async function(data, rows) {
        // Log raw event
        // logger.debug('[Forecast] rowSelectionChanged fired. Length:', rows.length);
        try {
          const table = this;
          const selected = table.getSelectedRows();
          if (selected.length > 1) {
            // Keep the first selected row and deselect the rest
            selected.forEach((r, i) => { if (i > 0) r.deselect(); });
            // Recompute rows array
            rows = table.getSelectedRows();
          }
        } catch (err) {
          logger.error('[Forecast] rowSelectionChanged enforcement failed:', err);
        }
        
        if (rows.length > 0) {
          const account = rows[0].getData();
          if (selectedAccountId !== account.id) {
             selectedAccountId = account.id;
             // Debounce reloads slightly to avoid re-render conflicts
             setTimeout(async () => {
               await loadMasterTransactionsGrid(document.getElementById('transactionsTable'));
               // Also refresh Projections as they might depend on the account filter (future proofing)
               await loadProjectionsSection(document.getElementById('projectionsContent'));
             }, 40);
          }
        } else {
          // No account selected
          selectedAccountId = null;
          // Clear downstream grids
          document.getElementById('transactionsTable').innerHTML = '<div class="empty-message">Select an account to view transactions</div>';
        }
      }
    });

    // Enforce single selection and provide fallback selection on click for accounts
    accountsTable.on('rowClick', function(e, row) {
      try {
        const table = row.getTable();
        if (row.isSelected()) {
          table.deselectRow(row);
          return;
        }
        table.deselectRow();
        row.select();
        setTimeout(() => {
          const selected = table.getSelectedRows();
          if (!row.isSelected()) {
            table.deselectRow();
            row.select();
          } else if (selected.length > 1) {
            selected.forEach(r => { if (r.getData().id !== row.getData().id) r.deselect(); });
          }
        }, 20);
      } catch (err) {
        logger.error('[AccountsGrid] rowClick fallback failed:', err);
      }
    });
    
    // Auto-select first account if accounts exist
    // Use tableBuilt event to ensure rows are rendered before selection
    accountsTable.on("tableBuilt", function() {
      const rows = accountsTable.getRows();
      if (rows && rows.length > 0) {
        rows[0].select();
      } else {
        // If no accounts, clear the "Loading..." message from downstream grids
        const plannedContainer = document.getElementById('transactionsTable');
        if (plannedContainer) plannedContainer.innerHTML = '<div class="empty-message">No accounts found. Create an account to get started.</div>';
      }
    });

    // Robust fallback: ensure selection changes trigger transaction loads
    accountsTable.on("rowSelected", function(row) {
      try {
        const account = row.getData();
        if (selectedAccountId !== account.id) {
          selectedAccountId = account.id;
          setTimeout(async () => {
            await loadMasterTransactionsGrid(document.getElementById('transactionsTable'));
            await loadProjectionsSection(document.getElementById('projectionsContent'));
          }, 40);
        }
      } catch (e) { logger.error('[AccountsGrid] fallback rowSelected handler error:', e); }
    });

    accountsTable.on("rowDeselected", async function(row) {
      try {
        const remaining = accountsTable.getSelectedRows();
        if (!remaining || remaining.length === 0) {
          selectedAccountId = null;
          document.getElementById('transactionsTable').innerHTML = '<div class="empty-message">Select an account to view transactions</div>';
          await loadProjectionsSection(document.getElementById('projectionsContent'));
        }
      } catch (e) { logger.error('[AccountsGrid] fallback rowDeselected handler error:', e); }
    });

  } catch (err) {
    logger.error('[Forecast] Failed to load accounts grid:', err);
  }
}

// Load master transactions grid (unified planned and actual)
async function loadMasterTransactionsGrid(container) {
  if (!currentScenario) return;

  const typeConfig = getScenarioTypeConfig();
  if (!typeConfig || !typeConfig.showPlannedTransactions) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';

  // Add section header
  const sectionHeader = document.createElement('h3');
  sectionHeader.className = 'text-main section-header';

  const selIdNum = selectedAccountId != null ? Number(selectedAccountId) : null;

  if (selIdNum) {
    const selectedAccount = currentScenario.accounts?.find(a => a.id === selIdNum);
    sectionHeader.textContent = `Filtered by: ${selectedAccount?.name || 'Unknown Account'}`;
  } else {
    sectionHeader.textContent = 'All Transactions';
  }

  window.add(container, sectionHeader);

  // Add "Add Transaction" button
  const existingAdds = container.querySelectorAll('.btn-add');
  existingAdds.forEach(el => el.remove());

  const addButtonContainer = document.createElement('div');
  addButtonContainer.className = 'mb-sm';
  const addButton = document.createElement('button');
  addButton.className = 'btn btn-primary btn-add';
  addButton.textContent = '+ Add New Transaction';
  addButton.addEventListener('click', async () => {
    // Create new planned transaction
    const newTx = await createTransaction(currentScenario.id, {
      status: 'planned',
      debitAccount: null,
      creditAccount: null,
      amount: 0,
      description: '',
      effectiveDate: formatDateOnly(new Date()),
      recurrence: null,
      periodicChange: null,
      tags: []
    });

    // Reload grid
    await loadMasterTransactionsGrid(container);
  });
  window.add(addButtonContainer, addButton);
  window.add(container, addButtonContainer);

  const gridContainer = document.createElement('div');
  gridContainer.className = 'grid-container master-transactions-grid';
  window.add(container, gridContainer);

  try {
    // Get all transactions
    let allTransactions = await getTransactions(currentScenario.id);

    // Filter by period if selected
    if (actualPeriod) {
      const selectedPeriod = periods.find(p => p.id === actualPeriod);
      if (selectedPeriod) {
        allTransactions = allTransactions.filter(tx => {
          const txDate = tx.status === 'actual' && tx.actualDate ? parseDateOnly(tx.actualDate) : parseDateOnly(tx.effectiveDate);
          return txDate >= selectedPeriod.startDate && txDate <= selectedPeriod.endDate;
        });
      }
    }

    // Transform for UI
    const transformedData = allTransactions.map(tx => {
      // Use centralized mapping helper to determine transactionType/secondaryAccount
      const mapped = mapTxToUI(tx, selectedAccountId);
      
      return {
        id: tx.id,
        status: tx.status || 'planned',
        amount: tx.status === 'actual' && tx.actualAmount !== undefined ? tx.actualAmount : tx.amount,
        plannedAmount: tx.amount,
        actualAmount: tx.actualAmount,
        effectiveDate: tx.status === 'actual' && tx.actualDate ? tx.actualDate : tx.effectiveDate,
        plannedDate: tx.effectiveDate,
        actualDate: tx.actualDate,
        description: tx.description,
        debitAccount: tx.debitAccount,
        creditAccount: tx.creditAccount,
        transactionType: mapped ? mapped.transactionType : { id: 1, name: 'Money Out' },
        secondaryAccount: mapped ? mapped.secondaryAccount : tx.creditAccount,
        recurrence: tx.recurrence,
        tags: tx.tags || []
      };
    }).filter(tx => !selectedAccountId ||
      tx.debitAccount?.id === selectedAccountId ||
      tx.creditAccount?.id === selectedAccountId
    );

    const masterTxTable = createGrid(gridContainer, {
      data: transformedData,
      columns: [
        {
          width: 50,
          minWidth: 50,
          hozAlign: "center",
          cssClass: "delete-cell",
          resizable: false,
          formatter: function(cell){
            return '<svg enable-background="new 0 0 24 24" height="14" width="14" viewBox="0 0 24 24" xml:space="preserve"><path d="M22.245,4.015c0.313,0.313,0.313,0.826,0,1.139l-6.276,6.27c-0.313,0.312-0.313,0.826,0,1.14l6.273,6.272  c0.313,0.313,0.313,0.826,0,1.14l-2.285,2.277c-0.314,0.312-0.828,0.312-1.142,0l-6.271-6.271c-0.313-0.313-0.828-0.313-1.141,0  l-6.276,6.267c-0.313,0.313-0.828,0.313-1.141,0l-2.282-2.28c-0.313-0.313-0.313-0.826,0-1.14l6.278-6.269  c0.313-0.312,0.313-0.826,0-1.14L1.709,5.147c-0.314-0.313-0.314-0.827,0-1.14l2.284-2.278C4.308,1.417,4.821,1.417,5.135,1.73  L11.405,8c0.314,0.314,0.828,0.314,1.141,0.001l6.276-6.267c0.312-0.312,0.826-0.312,1.141,0L22.245,4.015z"></path></svg>';
          },
          cellClick: async function(e, cell) {
            if (confirm('Delete this transaction?')) {
              // Remove from data
              const allTxs = await getTransactions(currentScenario.id);
              const filteredTxs = allTxs.filter(tx => tx.id !== cell.getRow().getData().id);
              await TransactionManager.saveAll(currentScenario.id, filteredTxs);
              // Reload grid
              await loadMasterTransactionsGrid(container);
            }
          }
        },
        {
          title: "Status",
          field: "status",
          minWidth: 80,
          widthGrow: 0.5,
          formatter: function(cell) {
            const status = cell.getValue();
            return status === 'actual' ? 'Actual' : 'Planned';
          },
          cellClick: function(e, cell) {
            // Open modal for actual transaction details
            openActualTransactionModal(cell.getRow().getData(), container);
          }
        },
        createDateColumn('Date', 'effectiveDate', { minWidth: 110, widthGrow: 1 }),
        createMoneyColumn('Amount', 'amount', { minWidth: 100, widthGrow: 1 }),
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
              { label: 'Money Out', value: { id: 1, name: 'Money Out' } },
              { label: 'Money In', value: { id: 2, name: 'Money In' } }
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
        {
          title: "Recurrence",
          field: "recurrence",
          minWidth: 100,
          widthGrow: 1,
          formatter: function(cell) {
            const value = cell.getValue();
            if (!value) return '';
            return value.type || 'Recurring';
          },
          cellClick: function(e, cell) {
            const rowData = cell.getRow().getData();
            openRecurrenceModal(rowData.recurrence, async (newRecurrence) => {
              // Update the transaction with new recurrence
              const allTxs = await getTransactions(currentScenario.id);
              const txIndex = allTxs.findIndex(tx => tx.id === rowData.id);
              if (txIndex >= 0) {
                allTxs[txIndex].recurrence = newRecurrence;
                await TransactionManager.saveAll(currentScenario.id, allTxs);
                // Reload grid
                await loadMasterTransactionsGrid(container);
              }
            });
          }
        },
        createTextColumn('Description', 'description', { minWidth: 150, widthGrow: 3 }),
      ],
      cellEdited: async function(cell) {
        const rowData = cell.getRow().getData();
        const field = cell.getColumn().getField();
        const newValue = cell.getValue();

        // Handle new account creation
        if (field === 'secondaryAccount' && newValue && newValue.__create__) {
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

                // Update the transaction with the new account
                const allTxs = await getTransactions(currentScenario.id);
                const txIndex = allTxs.findIndex(tx => tx.id === rowData.id);
                if (txIndex >= 0) {
                  allTxs[txIndex].secondaryAccount = { id: newAccount.id, name: newAccount.name };
                  await TransactionManager.saveAll(currentScenario.id, allTxs);
                  // Reload grid to show updated accounts
                  await loadMasterTransactionsGrid(container);
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
        const allTxs = await getTransactions(currentScenario.id);
        const txIndex = allTxs.findIndex(tx => tx.id === rowData.id);

        if (txIndex >= 0) {
          const updatedTx = { ...allTxs[txIndex], [field]: newValue };

          // If transaction type changed, update debit/credit accounts accordingly
          if (field === 'transactionType' && selectedAccountId) {
            const selectedAccount = currentScenario.accounts?.find(a => a.id === Number(selectedAccountId));
            const secondaryAccount = updatedTx.secondaryAccount;

            if (newValue?.name === 'Money Out') {
              // Money Out: selected account is debit, secondary is credit
              updatedTx.debitAccount = selectedAccount ? { id: selectedAccount.id } : null;
              updatedTx.creditAccount = secondaryAccount ? { id: secondaryAccount.id } : null;
            } else if (newValue?.name === 'Money In') {
              // Money In: selected account is credit, secondary is debit
              updatedTx.debitAccount = secondaryAccount ? { id: secondaryAccount.id } : null;
              updatedTx.creditAccount = selectedAccount ? { id: selectedAccount.id } : null;
            }
          }

          // If secondary account changed, update debit/credit accounts accordingly
          if (field === 'secondaryAccount' && selectedAccountId) {
            const selectedAccount = currentScenario.accounts?.find(a => a.id === Number(selectedAccountId));
            const transactionType = updatedTx.transactionType;

            if (transactionType?.name === 'Money Out') {
              // Money Out: selected account is debit, secondary is credit
              updatedTx.debitAccount = selectedAccount ? { id: selectedAccount.id } : null;
              updatedTx.creditAccount = newValue ? { id: newValue.id } : null;
            } else if (transactionType?.name === 'Money In') {
              // Money In: selected account is credit, secondary is debit
              updatedTx.debitAccount = newValue ? { id: newValue.id } : null;
              updatedTx.creditAccount = selectedAccount ? { id: selectedAccount.id } : null;
            }
          }

          allTxs[txIndex] = updatedTx;
          await TransactionManager.saveAll(currentScenario.id, allTxs);
        }
      }
    });

  } catch (err) {
    console.error('[Forecast] Failed to load master transactions grid:', err);
  }
}

// Modal for editing actual transaction details
function openActualTransactionModal(transaction, container) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>Actual Transaction Details</h3>
      <div class="modal-body">
        <div class="form-group">
          <label>Status:</label>
          <select id="statusSelect">
            <option value="planned" ${transaction.status === 'planned' ? 'selected' : ''}>Planned</option>
            <option value="actual" ${transaction.status === 'actual' ? 'selected' : ''}>Actual</option>
          </select>
        </div>
        <div class="form-group">
          <label>Actual Amount:</label>
          <input type="number" id="actualAmount" step="0.01" value="${transaction.actualAmount || transaction.amount || 0}">
        </div>
        <div class="form-group">
          <label>Actual Date:</label>
          <input type="date" id="actualDate" value="${transaction.actualDate || transaction.effectiveDate || ''}">
        </div>
      </div>
      <div class="modal-footer">
        <button id="cancelBtn">Cancel</button>
        <button id="saveBtn">Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Event listeners
  document.getElementById('cancelBtn').addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const status = document.getElementById('statusSelect').value;
    const actualAmount = parseFloat(document.getElementById('actualAmount').value) || null;
    const actualDate = document.getElementById('actualDate').value || null;

    // Update transaction
    const allTxs = await getTransactions(currentScenario.id);
    const txIndex = allTxs.findIndex(tx => tx.id === transaction.id);

    if (txIndex >= 0) {
      allTxs[txIndex].status = status;
      if (status === 'actual') {
        allTxs[txIndex].actualAmount = actualAmount;
        allTxs[txIndex].actualDate = actualDate;
      } else {
        delete allTxs[txIndex].actualAmount;
        delete allTxs[txIndex].actualDate;
      }
      await TransactionManager.saveAll(currentScenario.id, allTxs);
    }

    document.body.removeChild(modal);
    // Reload grid
    await loadMasterTransactionsGrid(container);
  });
}


// Load budget grid
async function loadBudgetGrid(container) {
  if (!currentScenario) return;

  container.innerHTML = '';

  try {
    // Get budget occurrences
    let budgetOccurrences = await getBudget(currentScenario.id);
    
    if (budgetOccurrences.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'text-muted';
      emptyMsg.textContent = 'No budget saved. Generate projections and click "Save as Budget".';
      window.add(container, emptyMsg);
      return;
    }

    // Add section header
    const sectionHeader = document.createElement('h3');
    sectionHeader.className = 'text-main section-header';
    const selIdNum = selectedAccountId != null ? Number(selectedAccountId) : null;
    if (selIdNum) {
      const selectedAccount = currentScenario.accounts?.find(a => a.id === selIdNum);
      sectionHeader.textContent = `Budget - Filtered by: ${selectedAccount?.name || 'Unknown Account'}`;
    } else {
      sectionHeader.textContent = 'Budget - All Accounts';
    }
    window.add(container, sectionHeader);

    // Add Clear Budget button
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'mb-sm';
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
    
    // Add Reproject from Budget button
    const reprojectButton = document.createElement('button');
    reprojectButton.className = 'btn btn-primary';
    reprojectButton.textContent = 'Project from Budget';
    reprojectButton.addEventListener('click', async () => {
      try {
        const confirmed = confirm('Generate new projections using budget as the source?');
        if (!confirmed) return;
        
        reprojectButton.textContent = 'Projecting...';
        reprojectButton.disabled = true;
        
        await generateProjections(currentScenario.id, { 
          periodicity: 'monthly',
          source: 'budget' 
        });
        
        // Reload scenario and projections
        currentScenario = await getScenario(currentScenario.id);
        await loadProjectionsSection(getEl('projectionsContent'));
        
        alert('Projections generated from budget successfully!');
      } catch (err) {
        console.error('[Forecast] Failed to project from budget:', err);
        alert('Failed to project from budget: ' + err.message);
      } finally {
        reprojectButton.textContent = 'Project from Budget';
        reprojectButton.disabled = false;
      }
    });
    window.add(buttonContainer, reprojectButton);
    
    window.add(container, buttonContainer);

    // Transform budget occurrences for UI (same pattern as transactions)
    const transformedData = budgetOccurrences.map(budget => {
      const mapped = mapTxToUI(budget, selectedAccountId);
      return {
        id: budget.id,
        sourceTransactionId: budget.sourceTransactionId,
        date: budget.date,
        amount: budget.actualAmount !== null && budget.actualAmount !== undefined ? budget.actualAmount : budget.amount,
        plannedAmount: budget.amount,
        actualAmount: budget.actualAmount,
        description: budget.description,
        debitAccount: budget.debitAccount,
        creditAccount: budget.creditAccount,
        transactionType: mapped ? mapped.transactionType : { id: 1, name: 'Money Out' },
        secondaryAccount: mapped ? mapped.secondaryAccount : budget.creditAccount,
        status: budget.status || 'planned'
      };
    }).filter(budget => !selectedAccountId ||
      budget.debitAccount?.id === selectedAccountId ||
      budget.creditAccount?.id === selectedAccountId
    );

    // Create grid container
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid-container budget-grid';
    window.add(container, gridContainer);

    const budgetTable = createGrid(gridContainer, {
      data: transformedData,
      columns: [
        {
          width: 50,
          hozAlign: "center",
          cssClass: "delete-cell",
          formatter: function(cell){
            return '<svg enable-background="new 0 0 24 24" height="14" width="14" viewBox="0 0 24 24" xml:space="preserve"><path d="M22.245,4.015c0.313,0.313,0.313,0.826,0,1.139l-6.276,6.27c-0.313,0.312-0.313,0.826,0,1.14l6.273,6.272  c0.313,0.313,0.313,0.826,0,1.14l-2.285,2.277c-0.314,0.312-0.828,0.312-1.142,0l-6.271-6.271c-0.313-0.313-0.828-0.313-1.141,0  l-6.276,6.267c-0.313,0.313-0.828,0.313-1.141,0l-2.282-2.28c-0.313-0.313-0.313-0.826,0-1.14l6.278-6.269  c0.313-0.312,0.313-0.826,0-1.14L1.709,5.147c-0.314-0.313-0.314-0.827,0-1.14l2.284-2.278C4.308,1.417,4.821,1.417,5.135,1.73  L11.405,8c0.314,0.314,0.828,0.314,1.141,0.001l6.276-6.267c0.312-0.312,0.826-0.312,1.141,0L22.245,4.015z"></path></svg>';
          },
          cellClick: async function(e, cell) {
            if (confirm('Delete this budget occurrence?')) {
              try {
                await BudgetManager.remove(currentScenario.id, cell.getRow().getData().id);
                currentScenario = await getScenario(currentScenario.id);
                await loadBudgetGrid(container);
              } catch (err) {
                console.error('[Forecast] Failed to delete budget occurrence:', err);
              }
            }
          }
        },
        {
          title: "Status",
          field: "status",
          width: 80,
          formatter: function(cell) {
            const status = cell.getValue();
            return status === 'actual' ? 'Actual' : 'Planned';
          }
        },
        createDateColumn('Date', 'date', { width: 120 }),
        createMoneyColumn('Planned Amount', 'plannedAmount', { width: 120 }),
        createMoneyColumn('Actual Amount', 'actualAmount', { width: 120 }),
        {
          title: "Type",
          field: "transactionType",
          width: 100,
          formatter: function(cell) {
            const value = cell.getValue();
            return value?.name || '';
          },
          editor: "list",
          editorParams: {
            values: [
              { label: 'Money Out', value: { id: 1, name: 'Money Out' } },
              { label: 'Money In', value: { id: 2, name: 'Money In' } }
            ],
            listItemFormatter: function(value, title) {
              return title;
            }
          }
        },
        {
          title: "Secondary Account",
          field: "secondaryAccount",
          width: 150,
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
          }
        },
        createTextColumn('Description', 'description', { widthGrow: 2 }),
      ],
      cellEdited: async function(cell) {
        const rowData = cell.getRow().getData();
        const field = cell.getColumn().getField();
        const newValue = cell.getValue();

        // Update budget occurrence
        const allBudgets = await getBudget(currentScenario.id);
        const budgetIndex = allBudgets.findIndex(b => b.id === rowData.id);

        if (budgetIndex >= 0) {
          const updatedBudget = { ...allBudgets[budgetIndex], [field]: newValue };

          // If transaction type changed, update debit/credit accounts
          if (field === 'transactionType' && selectedAccountId) {
            const selectedAccount = currentScenario.accounts?.find(a => a.id === Number(selectedAccountId));
            const secondaryAccount = updatedBudget.secondaryAccount;

            if (newValue?.name === 'Money Out') {
              updatedBudget.debitAccount = selectedAccount ? { id: selectedAccount.id } : null;
              updatedBudget.creditAccount = secondaryAccount ? { id: secondaryAccount.id } : null;
            } else if (newValue?.name === 'Money In') {
              updatedBudget.debitAccount = secondaryAccount ? { id: secondaryAccount.id } : null;
              updatedBudget.creditAccount = selectedAccount ? { id: selectedAccount.id } : null;
            }
          }

          // If secondary account changed, update debit/credit accounts
          if (field === 'secondaryAccount' && selectedAccountId) {
            const selectedAccount = currentScenario.accounts?.find(a => a.id === Number(selectedAccountId));
            const transactionType = updatedBudget.transactionType;

            if (transactionType?.name === 'Money Out') {
              updatedBudget.debitAccount = selectedAccount ? { id: selectedAccount.id } : null;
              updatedBudget.creditAccount = newValue ? { id: newValue.id } : null;
            } else if (transactionType?.name === 'Money In') {
              updatedBudget.debitAccount = newValue ? { id: newValue.id } : null;
              updatedBudget.creditAccount = selectedAccount ? { id: selectedAccount.id } : null;
            }
          }

          allBudgets[budgetIndex] = updatedBudget;
          await BudgetManager.saveAll(currentScenario.id, allBudgets);
        }
      }
    });

  } catch (err) {
    console.error('[Forecast] Failed to load budget grid:', err);
  }
}


// Load projections section (buttons and grid)
async function loadProjectionsSection(container) {
  if (!currentScenario) return;

  container.innerHTML = '';

  // Button container and Generate button
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'button-container';

  const generateButton = document.createElement('button');
  generateButton.className = 'btn btn-generate';
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
      await loadProjectionsGrid(projectionsGridContainer);
    } catch (err) {
      console.error('[Forecast] Failed to generate projections:', err);
      alert('Failed to generate projections: ' + err.message);
    } finally {
      generateButton.textContent = 'Generate Projections';
      generateButton.disabled = false;
    }
  });

  window.add(buttonContainer, generateButton);

  // Add clear button
  const clearButton = document.createElement('button');
  clearButton.className = 'btn';
  clearButton.textContent = 'Clear Projections';
  clearButton.style.padding = '12px 24px';
  clearButton.style.fontSize = '1.04em';
  clearButton.style.whiteSpace = 'nowrap';
  clearButton.style.minWidth = 'fit-content';
  clearButton.style.width = 'auto';
  clearButton.style.display = 'inline-block';
  clearButton.addEventListener('click', async () => {
    try {
      await clearProjections(currentScenario.id);
      currentScenario = await getScenario(currentScenario.id);
      await loadProjectionsGrid(projectionsGridContainer);
    } catch (err) {
      console.error('[Forecast] Failed to clear projections:', err);
    }
  });
  window.add(buttonContainer, clearButton);
  
  // Add Save as Budget button
  const saveBudgetButton = document.createElement('button');
  saveBudgetButton.className = 'btn btn-primary';
  saveBudgetButton.textContent = 'Save as Budget';
  saveBudgetButton.style.padding = '12px 24px';
  saveBudgetButton.style.fontSize = '1.04em';
  saveBudgetButton.style.whiteSpace = 'nowrap';
  saveBudgetButton.style.minWidth = 'fit-content';
  saveBudgetButton.style.width = 'auto';
  saveBudgetButton.style.display = 'inline-block';
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
  
  window.add(container, buttonContainer);

  // Update accordion header with selected account
  const accordionHeader = getEl('projectionsAccordionHeader');
  if (accordionHeader) {
    let headerText = 'Projections';
    if (selectedAccountId) {
      const selectedAccount = currentScenario.accounts?.find(a => a.id === Number(selectedAccountId));
      headerText = `Projections - ${selectedAccount?.name || 'Unknown Account'}`;
    } else {
    }
    accordionHeader.innerHTML = `<h2 class="text-main">${headerText}</h2><span class="accordion-arrow">&#9662;</span>`;
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
    const filteredProjections = selectedAccountId
      ? (currentScenario.projections || []).filter(p => p.accountId === selectedAccountId)
      : currentScenario.projections || [];


    if (filteredProjections.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'text-muted';
      emptyMsg.textContent = 'No projections available. Click "Generate Projections" to calculate.';
      window.add(container, emptyMsg);
      return;
    }

    // Transform projections for display
    const transformedData = filteredProjections.map(p => ({
      date: p.date,
      account: currentScenario.accounts?.find(a => a.id === p.accountId)?.name || '',
      balance: p.balance || 0,
      income: p.income || 0,
      expenses: p.expenses || 0,
      netChange: p.netChange || 0
    }));

    const projectionsTable = createGrid(container, {
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
  const txSection = getEl('transactionsTable').closest('.bg-main');
  const budgetSection = getEl('budgetSection');
  const projectionsSection = getEl('projectionsSection');
  
  if (typeConfig) {
    if (typeConfig.showAccounts) accountsSection.classList.remove('hidden'); else accountsSection.classList.add('hidden');
    if (typeConfig.showPlannedTransactions || typeConfig.showActualTransactions) txSection.classList.remove('hidden'); else txSection.classList.add('hidden');
    if (typeConfig.showProjections) projectionsSection.classList.remove('hidden'); else projectionsSection.classList.add('hidden');
    // Budget section is always visible (can be hidden manually by user via accordion)
    budgetSection.classList.remove('hidden');
  }

  // Clear downstream grids to prevent ghost data
  containers.transactionsTable.innerHTML = '<div class="empty-message">Loading...</div>';
  containers.budgetTable.innerHTML = '<div class="empty-message">Loading...</div>';

  await loadAccountsGrid(containers.accountsTable);
  // Note: loadPlannedTransactionsGrid and loadMasterTransactionsGrid
  // are triggered by the auto-selection in loadAccountsGrid
  
  // Initialize period selector for transactions
  await initializePeriodSelector();
  
  await loadBudgetGrid(containers.budgetTable);
  await loadProjectionsSection(containers.projectionsContent);
}

// Initialize period selector dropdown and navigation
async function initializePeriodSelector() {
  if (!currentScenario) return;
  
  try {
    // Calculate periods for current scenario
    periods = await getScenarioPeriods(currentScenario.id);
    
    // Populate period dropdown
    const periodSelect = document.getElementById('actual-period-select');
    if (!periodSelect) return;
    
    periodSelect.innerHTML = '<option value="">-- All Periods --</option>';
    periods.forEach((period, index) => {
      const option = document.createElement('option');
      option.value = period.id;
      option.textContent = period.label || `${period.startDate?.toISOString?.().slice(0,10) || ''} to ${period.endDate?.toISOString?.().slice(0,10) || ''}`;
      periodSelect.appendChild(option);
    });
    
    // Set "All" as default
    actualPeriod = '';
    periodSelect.value = actualPeriod;
    
    // Attach event listeners
    periodSelect.addEventListener('change', async (e) => {
      actualPeriod = e.target.value;
      await loadMasterTransactionsGrid(document.getElementById('transactionsContent'));
    });
    
    document.getElementById('actual-prev-period-btn')?.addEventListener('click', async () => {
      const currentIndex = periods.findIndex(p => p.id === actualPeriod);
      if (currentIndex > 0) {
        actualPeriod = periods[currentIndex - 1].id;
        periodSelect.value = actualPeriod;
        await loadMasterTransactionsGrid(document.getElementById('transactionsContent'));
      }
    });
    
    document.getElementById('actual-next-period-btn')?.addEventListener('click', async () => {
      const currentIndex = periods.findIndex(p => p.id === actualPeriod);
      if (currentIndex < periods.length - 1) {
        actualPeriod = periods[currentIndex + 1].id;
        periodSelect.value = actualPeriod;
        await loadMasterTransactionsGrid(document.getElementById('transactionsContent'));
      }
    });
    
  } catch (err) {
    console.error('[Forecast] Failed to initialize period selector:', err);
  }
}

// Initialize the page
async function init() {
  loadGlobals();
  
  // Run data migration if needed
  try {
    const { needsMigration, migrateAllScenarios } = await import('./data-migration.js');
    if (await needsMigration()) {
      console.log('[App] Running data migration...');
      await migrateAllScenarios();
      console.log('[App] Data migration completed');
    }
  } catch (error) {
    console.error('[App] Data migration failed:', error);
  }
  
  const containers = buildGridContainer();
  
  await loadScenarioTypes();
  await buildScenarioGrid(containers.scenarioSelector);
  
  // loadScenarioData is now called from buildScenarioGrid when initial scenario is set
  
  // Initialize keyboard shortcuts
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

init();
