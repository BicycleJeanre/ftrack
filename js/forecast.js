// forecast.js
// Manages the Forecast page with scenario-centric model
// Displays accounts, planned transactions, actual transactions, and projections based on scenario type

import { getSchemaPath, getAppDataPath } from './app-paths.js';

import { createGrid, createSelectorColumn, createTextColumn, createObjectColumn, createDateColumn, createMoneyColumn } from './grid-factory.js';
import * as ScenarioManager from './managers/scenario-manager.js';
import * as AccountManager from './managers/account-manager.js';
import * as TransactionManager from './managers/transaction-manager.js';
import { openRecurrenceModal } from './modal-recurrence.js';
import { openPeriodicChangeModal } from './modal-periodic-change.js';
import keyboardShortcuts from './keyboard-shortcuts.js';
import { loadGlobals } from './global-app.js';
import { createLogger } from './logger.js';

const logger = createLogger('ForecastController');

import {
  getScenarios,
  getScenario,
  createAccount,
  saveAccounts,
  savePlannedTransactions,
  saveActualTransactions,
  getScenarioPeriods,
  getPlannedTransactionsForPeriod
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

  // Middle row: Planned and Actual Transactions side-by-side
  const middleRow = document.createElement('div');
  middleRow.classList.add('layout-two-column', 'mb-lg');
  window.add(forecastEl, middleRow);

  // Planned Transactions section with accordion
  const plannedTxSection = document.createElement('div');
  plannedTxSection.className = 'bg-main bordered rounded shadow-lg';
  
  const plannedTxHeader = document.createElement('div');
  plannedTxHeader.className = 'pointer flex-between accordion-header section-padding';
  plannedTxHeader.innerHTML = `<h2 class="text-main section-title">Planned Transactions</h2><span class="accordion-arrow">&#9662;</span>`;  
  plannedTxHeader.addEventListener('click', () => window.toggleAccordion('plannedTxContent'));
  window.add(plannedTxSection, plannedTxHeader);
  
  const plannedTxContent = document.createElement('div');
  plannedTxContent.id = 'plannedTxContent';
  plannedTxContent.className = 'accordion-content open section-content';
  window.add(plannedTxSection, plannedTxContent);
  
  const plannedTransactionsTable = document.createElement('div');
  plannedTransactionsTable.id = 'plannedTransactionsTable';
  window.add(plannedTxContent, plannedTransactionsTable);
  
  window.add(middleRow, plannedTxSection);

  // Actual Transactions section with accordion
  const actualTxSection = document.createElement('div');
  actualTxSection.className = 'bg-main bordered rounded shadow-lg';
  
  const actualTxHeader = document.createElement('div');
  actualTxHeader.className = 'pointer flex-between accordion-header section-padding';
  actualTxHeader.innerHTML = `<h2 class="text-main section-title">Actual Transactions</h2><span class="accordion-arrow">&#9662;</span>`;
  actualTxHeader.addEventListener('click', () => window.toggleAccordion('actualTxContent'));
  window.add(actualTxSection, actualTxHeader);
  
  const actualTxContent = document.createElement('div');
  actualTxContent.id = 'actualTxContent';
  actualTxContent.className = 'accordion-content open section-content';
  window.add(actualTxSection, actualTxContent);
  
  // Period selector for actual transactions
  const actualPeriodSelector = document.createElement('div');
  actualPeriodSelector.className = 'period-selector';
  actualPeriodSelector.innerHTML = `
    <label>Period:</label>
    <select id="actual-period-select" class="form-select period-select">
      <option value="">-- Select Period --</option>
    </select>
    <button id="actual-prev-period-btn" class="btn">◀</button>
    <button id="actual-next-period-btn" class="btn">▶</button>
  `;
  window.add(actualTxContent, actualPeriodSelector);
  
  const actualTransactionsTable = document.createElement('div');
  actualTransactionsTable.id = 'actualTransactionsTable';
  window.add(actualTxContent, actualTransactionsTable);
  
  window.add(middleRow, actualTxSection);

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
    plannedTransactionsTable,
    actualTransactionsTable,
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
    const addScenarioBtn = document.createElement('button');
    addScenarioBtn.className = 'btn btn-primary btn-add';
    addScenarioBtn.textContent = '+ Add New';
    addScenarioBtn.addEventListener('click', async () => {
      const newScenario = await ScenarioManager.create({
        name: 'New Scenario',
        type: null,
        description: '',
        startDate: new Date().toISOString().slice(0,10),
        endDate: new Date().toISOString().slice(0,10),
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
          formatter: "buttonCross",
          width: 40,
          hozAlign: "center",
          cellClick: async function(e, cell) {
            const row = cell.getRow();
            const rowData = row.getData();
            if (confirm(`Delete scenario: ${rowData.name}?`)) {
              await ScenarioManager.remove(rowData.id);
              await buildScenarioGrid(container);
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
        createTextColumn('Description', 'description', { widthGrow: 3, editor: "input", editable: true }),
        createDateColumn('Start Date', 'startDate', { widthGrow: 2, editor: "date" }),
        createDateColumn('End Date', 'endDate', { widthGrow: 2, editor: "date" }),
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
        logger.debug('[Forecast] scenarios.rowSelectionChanged fired. data length:', data && data.length, 'rows length:', rows && rows.length);
        if (rows.length > 0) {
          const scenario = rows[0].getData();
          logger.info('Scenario selected:', scenario.id, scenario.name);
          currentScenario = await getScenario(scenario.id);
          selectedAccountId = null; // Clear selected account when switching scenarios
          logger.info('Current scenario set to:', currentScenario.id);
          logger.info('Loading scenario data...');
          await loadScenarioData();
          logger.info('Scenario data loaded');
        }
      }
    });

    // Also attach handler to Tabulator's rowSelected event to follow recommended pattern
    scenariosTable.on('rowSelected', async function(row){
      try {
        const scenario = row.getData();
        logger.info('[ScenarioGrid] rowSelected handler executing:', scenario.id, scenario.name);
        currentScenario = await getScenario(scenario.id);
        selectedAccountId = null;
        logger.info('[ScenarioGrid] Loading scenario data via rowSelected');
        await loadScenarioData();
        logger.info('[ScenarioGrid] Scenario data loaded via rowSelected');
      } catch (err) {
        logger.error('[ScenarioGrid] rowSelected handler failed:', err);
      }
    });

    // Attach direct event listeners to help debug selection behavior
    scenariosTable.on('rowClick', function(e, row) {
      logger.info('[ScenarioGrid] rowClick:', row.getData().id, 'target=', e.target && e.target.tagName);
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
      logger.info('[ScenarioGrid] rowSelected:', row.getData().id);
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
          logger.info('[ScenarioGrid] rowSelected handler executing:', scenario.id, scenario.name);
          currentScenario = await getScenario(scenario.id);
          selectedAccountId = null;
          logger.info('[ScenarioGrid] Loading scenario data via rowSelected');
          await loadScenarioData();
          logger.info('[ScenarioGrid] Scenario data loaded via rowSelected');
        } catch (err) {
          logger.error('[ScenarioGrid] rowSelected handler failed (delayed):', err);
        }
      }, 40);
    });

    scenariosTable.on('rowDeselected', function(row) {
      logger.info('[ScenarioGrid] rowDeselected:', row.getData().id);
    });

    // Attach cellEdited event handler
    scenariosTable.on("cellEdited", async function(cell) {
      const row = cell.getRow();
      const scenario = row.getData();
      
      logger.info('Cell edited in scenario:', scenario.id);
      
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
        
        console.log('[Forecast] Sending updates:', updates);
        
        // Update just the edited scenario
        await ScenarioManager.update(scenario.id, updates);
        console.log('[Forecast] ✓ Scenario updated successfully');
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
  if (!selectedAccountId) return [];
  
  console.log(`[Transform] transformPlannedTxForUI - Processing ${plannedTxs.length} total transactions for account ${selectedAccountId}`);
  
  const result = plannedTxs.map((tx, index) => {
    const isSelectedDebit = tx.debitAccount?.id === selectedAccountId;
    const isSelectedCredit = tx.creditAccount?.id === selectedAccountId;
    
    // Only include transactions involving the selected account
    if (!isSelectedDebit && !isSelectedCredit) return null;
    
    // Get the secondary account (the one that's not the selected account)
    const secondaryAccountRef = isSelectedDebit ? tx.creditAccount : tx.debitAccount;
    
    // Resolve secondary account from current scenario accounts by ID
    // This ensures we use the current account object reference, not stale ones
    const secondaryAccount = secondaryAccountRef 
      ? currentScenario.accounts?.find(a => a.id === secondaryAccountRef.id) || secondaryAccountRef
      : null;
    
    console.log(`[Transform] TX ${index} (ID: ${tx.id}): ${isSelectedDebit ? 'Debit' : 'Credit'}, Secondary: ${secondaryAccount?.name || 'NULL'}`);
    
    return {
      ...tx,
      transactionType: isSelectedDebit 
        ? { id: 1, name: 'Debit' }   // Money leaving selected account
        : { id: 2, name: 'Credit' },  // Money entering selected account
      secondaryAccount: secondaryAccount
    };
  }).filter(tx => tx !== null);
  
  console.log(`[Transform] transformPlannedTxForUI - Output: ${result.length} filtered txs with IDs:`, result.map(tx => tx.id));
  return result;
}

/**
 * Transform planned transaction from UI format (transactionType/secondaryAccount)
 * back to backend format (debitAccount/creditAccount) relative to selected account
 */
async function transformPlannedTxForBackend(tx, selectedAccountId) {
  console.log(`[Transform] transformPlannedTxForBackend - Input TX (ID: ${tx.id}):`, { 
    transactionType: tx.transactionType?.name, 
    secondaryAccount: tx.secondaryAccount?.name,
    amount: tx.amount
  });
  
  // Skip transactions with missing required fields
  if (!tx.transactionType || !tx.secondaryAccount || tx.amount == null || tx.amount === 0) {
    console.warn('[Forecast] Skipping transaction with missing required fields');
    return null;
  }
  
  const isDebit = tx.transactionType?.id === 1 || tx.transactionType?.name === 'Debit';
  
  // Get selected account details
  const selectedAccount = currentScenario.accounts?.find(a => a.id === selectedAccountId);
  const selectedAccountObj = selectedAccount 
    ? { id: selectedAccount.id, name: selectedAccount.name }
    : { id: selectedAccountId, name: 'Unknown Account' };
  
  // Resolve secondary account - if id is null, look up by name or create new account
  let secondaryAccountObj = tx.secondaryAccount;
  
  if (secondaryAccountObj && secondaryAccountObj.id === null && secondaryAccountObj.name) {
    const foundAccount = currentScenario.accounts?.find(a => a.name === secondaryAccountObj.name);
    if (foundAccount) {
      secondaryAccountObj = { id: foundAccount.id, name: foundAccount.name };
    } else {
      // Account doesn't exist - create it
      console.log(`[Forecast] Creating new account: ${secondaryAccountObj.name}`);
      const newAccount = await createAccount(currentScenario.id, {
        name: secondaryAccountObj.name,
        type: { id: 1, name: 'Asset' }, // Default to Asset type
        currency: { id: 1, name: 'ZAR' }, // Default currency
        balance: 0,
        openDate: new Date().toISOString().slice(0, 10),
        periodicChange: null
      });
      
      // Reload scenario to get the updated accounts list
      currentScenario = await getScenario(currentScenario.id);
      
      secondaryAccountObj = { id: newAccount.id, name: newAccount.name };
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
  
  console.log(`[Transform] transformPlannedTxForBackend - Output TX (ID: ${result.id}):`, {
    debitAccount: result.debitAccount?.name,
    creditAccount: result.creditAccount?.name,
    amount: result.amount
  });
  
  return result;
}

/**
 * Transform actual transactions for UI (same as planned transactions)
 */
function transformActualTxForUI(actualTxs, selectedAccountId) {
  if (!selectedAccountId) return [];
  
  return actualTxs.map(tx => {
    const isSelectedDebit = tx.debitAccount?.id === selectedAccountId;
    const isSelectedCredit = tx.creditAccount?.id === selectedAccountId;
    
    // Only include transactions involving the selected account
    if (!isSelectedDebit && !isSelectedCredit) return null;
    
    // Get the secondary account (the one that's not the selected account)
    const secondaryAccountRef = isSelectedDebit ? tx.creditAccount : tx.debitAccount;
    
    // Resolve secondary account from current scenario accounts by ID
    // This ensures we use the current account object reference, not stale ones
    const secondaryAccount = secondaryAccountRef 
      ? currentScenario.accounts?.find(a => a.id === secondaryAccountRef.id) || secondaryAccountRef
      : null;
    
    return {
      ...tx,
      transactionType: isSelectedDebit 
        ? { id: 1, name: 'Debit' }   // Money leaving selected account
        : { id: 2, name: 'Credit' },  // Money entering selected account
      secondaryAccount: secondaryAccount
    };
  }).filter(tx => tx !== null);
}

/**
 * Transform actual transaction from UI back to backend format (same as planned transactions)
 */
async function transformActualTxForBackend(tx, selectedAccountId) {
  const isDebit = tx.transactionType?.id === 1 || tx.transactionType?.name === 'Debit';
  
  // Get selected account details
  const selectedAccount = currentScenario.accounts?.find(a => a.id === selectedAccountId);
  const selectedAccountObj = selectedAccount 
    ? { id: selectedAccount.id, name: selectedAccount.name }
    : { id: selectedAccountId, name: 'Unknown Account' };
  
  // Resolve secondary account - if id is null, look up by name or create new account
  let secondaryAccountObj = null;
  
  // If secondary account is missing, default to first available account (excluding selected)
  if (!tx.secondaryAccount || !tx.secondaryAccount.name) {
    const otherAccounts = currentScenario.accounts?.filter(a => a.id !== selectedAccountId) || [];
    if (otherAccounts.length > 0) {
      secondaryAccountObj = { id: otherAccounts[0].id, name: otherAccounts[0].name };
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
      secondaryAccountObj = { id: foundAccount.id, name: foundAccount.name };
    } else {
      // Account doesn't exist - create it
      console.log(`[Forecast] Creating new account: ${secondaryAccountObj.name}`);
      const newAccount = await createAccount(currentScenario.id, {
        name: secondaryAccountObj.name,
        type: { id: 1, name: 'Asset' }, // Default to Asset type
        currency: { id: 1, name: 'ZAR' }, // Default currency
        balance: 0,
        openDate: new Date().toISOString().slice(0, 10),
        periodicChange: null
      });
      
      // Reload scenario to get the updated accounts list
      currentScenario = await getScenario(currentScenario.id);
      
      secondaryAccountObj = { id: newAccount.id, name: newAccount.name };
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

  logger.info('[Forecast] loadAccountsGrid: Loading for scenario', currentScenario.id, currentScenario.name);

  const typeConfig = getScenarioTypeConfig();
  if (!typeConfig || !typeConfig.showAccounts) {
    logger.info('[Forecast] loadAccountsGrid: Type config does not show accounts');
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';

  try {
    const accounts = await AccountManager.getAll(currentScenario.id);
    logger.info('[Forecast] loadAccountsGrid: Loaded', accounts.length, 'accounts');
    const fs = window.require('fs').promises;
    const lookupPath = getSchemaPath('lookup-data.json');
    const lookupFile = await fs.readFile(lookupPath, 'utf8');
    const lookupData = JSON.parse(lookupFile);

    // Add "Add Account" button
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
      data: accounts,
      selectable: 1, // Enable built-in single selection
      columns: [
        {
          formatter: "buttonCross",
          width: 40,
          hozAlign: "center",
          cellClick: async function(e, cell) {
            const row = cell.getRow();
            const rowData = row.getData();
            if (confirm(`Delete account: ${rowData.name}?`)) {
              await AccountManager.remove(currentScenario.id, rowData.id);
              await loadAccountsGrid(container);
            }
          }
        },
        createTextColumn('Account Name', 'name', { widthGrow: 2 }),
        createObjectColumn('Type', 'type', 'name', { 
          widthGrow: 1,
          editor: "list",
          editorParams: {
            values: lookupData.accountTypes,
            listItemFormatter: function(value, title) {
              return value.name;
            },
            valueLookup: true,
            autocomplete: true,
            clearable: false
          }
        }),
        createObjectColumn('Currency', 'currency', 'name', { 
          width: 100,
          editor: "list",
          editorParams: {
            values: lookupData.currencies,
            listItemFormatter: function(value, title) {
              return value.name;
            },
            valueLookup: true,
            autocomplete: true,
            clearable: false
          }
        }),
        createMoneyColumn('Balance', 'balance', { widthGrow: 1 })
      ],
      cellEdited: async function(cell) {
        const account = cell.getRow().getData();
        await AccountManager.update(currentScenario.id, account.id, account);
        logger.info('[Forecast] ✓ Account updated:', account.name);
      },
      rowSelectionChanged: async function(data, rows) {
        // Log raw event
        logger.debug('[Forecast] rowSelectionChanged fired. Length:', rows.length);
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
          logger.info('[Forecast] Account selected:', account.name, account.id);
          if (selectedAccountId !== account.id) {
             selectedAccountId = account.id;
             // Debounce reloads slightly to avoid re-render conflicts
             setTimeout(async () => {
               await loadPlannedTransactionsGrid(document.getElementById('plannedTransactionsTable'));
               await loadActualTransactionsGrid(document.getElementById('actualTransactionsTable'));
               // Also refresh Projections as they might depend on the account filter (future proofing)
               await loadProjectionsSection(document.getElementById('projectionsContent'));
             }, 40);
          }
        } else {
          // No account selected
          logger.info('[Forecast] Account deselected');
          selectedAccountId = null;
          // Clear downstream grids
          document.getElementById('plannedTransactionsTable').innerHTML = '<div class="empty-message">Select an account to view transactions</div>';
          document.getElementById('actualTransactionsTable').innerHTML = '<div class="empty-message">Select an account to view transactions</div>';
        }
      }
    });

    // Enforce single selection and provide fallback selection on click for accounts
    accountsTable.on('rowClick', function(e, row) {
      logger.info('[AccountsGrid] rowClick:', row.getData().id, 'target=', e.target && e.target.tagName);
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
        const plannedContainer = document.getElementById('plannedTransactionsTable');
        if (plannedContainer) plannedContainer.innerHTML = '<div class="empty-message">No accounts found. Create an account to get started.</div>';
      }
    });

  } catch (err) {
    logger.error('[Forecast] Failed to load accounts grid:', err);
  }
}

// Load planned transactions grid
async function loadPlannedTransactionsGrid(container) {
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
  
  if (selectedAccountId) {
    const selectedAccount = currentScenario.accounts?.find(a => a.id === selectedAccountId);
    sectionHeader.textContent = `Filtered by: ${selectedAccount?.name || 'Unknown Account'}`;
  } else {
    sectionHeader.textContent = 'All Accounts';
  }
  
  window.add(container, sectionHeader);

  // Add "Add Transaction" button
  const addButtonContainer = document.createElement('div');
  addButtonContainer.className = 'mb-sm';
  const addButton = document.createElement('button');
  addButton.className = 'btn btn-primary btn-add';
  addButton.textContent = '+ Add New';
  addButton.addEventListener('click', async () => {
    // Add a new blank row to the grid
    if (plannedTxTable) {
      const newTx = {
        id: Date.now(), // Temporary ID
        transactionType: { id: 1, name: 'Debit' },
        secondaryAccount: currentScenario.accounts?.[0] || null,
        amount: 0,
        description: '',
        recurrence: null,
        periodicChange: null,
        tags: []
      };
      
      // Transform to backend format
      let debitAccount, creditAccount;
      if (newTx.transactionType?.name === 'Debit') {
        debitAccount = selectedAccountId 
          ? currentScenario.accounts.find(a => a.id === selectedAccountId)
          : currentScenario.accounts?.[0];
        creditAccount = newTx.secondaryAccount;
      } else {
        debitAccount = newTx.secondaryAccount;
        creditAccount = selectedAccountId 
          ? currentScenario.accounts.find(a => a.id === selectedAccountId)
          : currentScenario.accounts?.[0];
      }
      
      const backendTx = {
        id: newTx.id,
        debitAccount,
        creditAccount,
        amount: 0,
        description: '',
        recurrence: null,
        periodicChange: null,
        tags: []
      };
      
      // Save to backend
      const allTxs = await TransactionManager.getAllPlanned(currentScenario.id);
      await TransactionManager.savePlanned(currentScenario.id, [...allTxs, backendTx]);
      
      // Add to grid
      plannedTxTable.addRow(newTx, true); // true = add to top
      console.log('[Forecast] ✓ New planned transaction added');
    }
  });
  window.add(addButtonContainer, addButton);
  window.add(container, addButtonContainer);

  const gridContainer = document.createElement('div');
  gridContainer.className = 'grid-container planned-grid';
  window.add(container, gridContainer);

  let plannedTxTable = null;

  try {
    // Get planned transactions for this scenario
    const allTransactions = await TransactionManager.getAllPlanned(currentScenario.id);
    
    // Filter to show only transactions involving the selected account (if one is selected)
    const filteredTransactions = selectedAccountId
      ? allTransactions.filter(tx => {
          return tx.debitAccount?.id === selectedAccountId || tx.creditAccount?.id === selectedAccountId;
        })
      : allTransactions;

    // Transform for UI: show "Type" and "Secondary Account"
    const transformedData = filteredTransactions.map(tx => {
      let transactionType, secondaryAccount;
      
      if (tx.debitAccount?.id === selectedAccountId) {
        transactionType = { id: 1, name: 'Debit' };
        secondaryAccount = tx.creditAccount;
      } else {
        transactionType = { id: 2, name: 'Credit' };
        secondaryAccount = tx.debitAccount;
      }

      return {
        id: tx.id,
        transactionType,
        secondaryAccount,
        amount: tx.amount,
        description: tx.description,
        recurrence: tx.recurrence,
        periodicChange: tx.periodicChange,
        tags: tx.tags
      };
    });

    plannedTxTable = createGrid(gridContainer, {
      data: transformedData,
      columns: [
        {
          formatter: "buttonCross",
          width: 40,
          hozAlign: "center",
          cellClick: async function(e, cell) {
            const row = cell.getRow();
            const rowData = row.getData();
            
            if (confirm(`Delete transaction: ${rowData.description || 'Unnamed'}?`)) {
              // Remove from backend
              const allTxs = await TransactionManager.getAllPlanned(currentScenario.id);
              const updatedTxs = allTxs.filter(tx => tx.id !== rowData.id);
              await TransactionManager.savePlanned(currentScenario.id, updatedTxs);
              
              // Remove from grid
              row.delete();
              console.log('[Forecast] ✓ Planned transaction deleted');
            }
          }
        },
        {
          title: "Type",
          field: "transactionType",
          widthGrow: 1,
          editor: "list",
          editorParams: {
            values: [
              { label: 'Debit', value: { id: 1, name: 'Debit' } },
              { label: 'Credit', value: { id: 2, name: 'Credit' } }
            ],
            listItemFormatter: function(value, title) {
              return title;
            }
          },
          formatter: function(cell) {
            const value = cell.getValue();
            return value?.name || '';
          },
          sorter: function(a, b, aRow, bRow, column, dir, sorterParams) {
            const aVal = a?.name || '';
            const bVal = b?.name || '';
            return aVal.localeCompare(bVal);
          },
          headerFilter: "input",
          headerFilterFunc: function(headerValue, rowValue, rowData, filterParams) {
            const name = rowValue?.name || '';
            return name.toLowerCase().includes(headerValue.toLowerCase());
          },
          headerFilterPlaceholder: "Filter...",
          headerHozAlign: "left"
        },
        {
          title: "Secondary Account",
          field: "secondaryAccount",
          widthGrow: 2,
          editor: "list",
          editorParams: {
            values: (currentScenario.accounts || []).map(a => ({ 
              label: a.name, 
              value: a 
            })),
            listItemFormatter: function(value, title) {
              return title;
            }
          },
          formatter: function(cell) {
            const value = cell.getValue();
            return value?.name || '';
          },
          sorter: function(a, b, aRow, bRow, column, dir, sorterParams) {
            const aVal = a?.name || '';
            const bVal = b?.name || '';
            return aVal.localeCompare(bVal);
          },
          headerFilter: "input",
          headerFilterFunc: function(headerValue, rowValue, rowData, filterParams) {
            const name = rowValue?.name || '';
            return name.toLowerCase().includes(headerValue.toLowerCase());
          },
          headerFilterPlaceholder: "Filter...",
          headerHozAlign: "left"
        },
        createMoneyColumn('Amount', 'amount', { widthGrow: 1, editor: "number", editorParams: { step: 0.01 } }),
        createTextColumn('Description', 'description', { widthGrow: 2, editor: "input" }),
        {
          title: "Recurrence",
          field: "recurrence",
          widthGrow: 2,
          formatter: function(cell) {
            const value = cell.getValue();
            if (value && value.recurrenceType) {
              return `<span class="clickable-recurrence">${value.recurrenceType.name || 'N/A'} ✏️</span>`;
            }
            return '<span class="click-to-add">Click to add ✏️</span>'; 
          },
          cellClick: function(e, cell) {
            const currentValue = cell.getValue();
            openRecurrenceModal(currentValue, async (newRecurrence) => {
              cell.setValue(newRecurrence);
              // Trigger save by calling the cellEdited callback manually
              const row = cell.getRow();
              const uiTx = row.getData();
              
              // Transform back to backend format
              let debitAccount, creditAccount;
              if (uiTx.transactionType?.name === 'Debit') {
                debitAccount = currentScenario.accounts.find(a => a.id === selectedAccountId);
                creditAccount = uiTx.secondaryAccount;
              } else {
                debitAccount = uiTx.secondaryAccount;
                creditAccount = currentScenario.accounts.find(a => a.id === selectedAccountId);
              }

              const backendTx = {
                id: uiTx.id,
                debitAccount,
                creditAccount,
                amount: parseFloat(uiTx.amount) || 0,
                description: uiTx.description || '',
                recurrence: uiTx.recurrence || null,
                periodicChange: uiTx.periodicChange || null,
                tags: uiTx.tags || []
              };

              // Get all transactions, update this one, save all
              const allTxs = await TransactionManager.getAllPlanned(currentScenario.id);
              const updatedTxs = allTxs.map(tx => tx.id === backendTx.id ? backendTx : tx);
              
              await TransactionManager.savePlanned(currentScenario.id, updatedTxs);
              console.log('[Forecast] ✓ Recurrence updated');
            });
          },
          headerSort: false,
          headerHozAlign: "left"
        }
      ]
    });
    
    // Attach cellEdited event handler
    plannedTxTable.on("cellEdited", async function(cell) {
      const row = cell.getRow();
      const uiTx = row.getData();
      
      // Transform back to backend format
      let debitAccount, creditAccount;
      if (uiTx.transactionType?.name === 'Debit') {
        debitAccount = currentScenario.accounts.find(a => a.id === selectedAccountId);
        creditAccount = uiTx.secondaryAccount;
      } else {
        debitAccount = uiTx.secondaryAccount;
        creditAccount = currentScenario.accounts.find(a => a.id === selectedAccountId);
      }

      const backendTx = {
        id: uiTx.id,
        debitAccount,
        creditAccount,
        amount: parseFloat(uiTx.amount) || 0,
        description: uiTx.description || '',
        recurrence: uiTx.recurrence || null,
        periodicChange: uiTx.periodicChange || null,
        tags: uiTx.tags || []
      };

      // Get all transactions, update this one, save all
      const allTxs = await TransactionManager.getAllPlanned(currentScenario.id);
      const updatedTxs = allTxs.map(tx => tx.id === backendTx.id ? backendTx : tx);
      
      await TransactionManager.savePlanned(currentScenario.id, updatedTxs);
      console.log('[Forecast] ✓ Planned transaction updated');
    });

  } catch (err) {
    console.error('[Forecast] Failed to load planned transactions grid:', err);
  }
}

// Load actual transactions grid
async function loadActualTransactionsGrid(container) {
  if (!currentScenario) return;

  const typeConfig = getScenarioTypeConfig();
  if (!typeConfig || !typeConfig.showActualTransactions) {
    container.innerHTML = '';
    return;
  }

  try {
    // Check if actualPeriod is selected
    if (!actualPeriod) {
      const gridContainer = document.getElementById('actualTransactionsTable');
      if (gridContainer) {
        const message = document.createElement('div');
        message.className = 'empty-message';
        message.textContent = 'Select a period to view actual transactions';
        gridContainer.innerHTML = '';
        window.add(gridContainer, message);
      }
      return;
    }

    // Get planned transactions for the selected period
    const plannedTransactions = await getPlannedTransactionsForPeriod(currentScenario.id, actualPeriod);
    
    // Get all actual transactions
    const allActual = await TransactionManager.getAllActual(currentScenario.id);

    // Create combined view data
    const combinedData = plannedTransactions.map(planned => {
      // Find matching actual transaction
      const actualTx = allActual.find(a => a.plannedId === planned.id);
      
      // Determine type and secondary account based on selected account
      let transactionType, secondaryAccount;
      if (selectedAccountId) {
        if (planned.debitAccount?.id === selectedAccountId) {
          transactionType = { id: 1, name: 'Debit' };
          secondaryAccount = planned.creditAccount;
        } else {
          transactionType = { id: 2, name: 'Credit' };
          secondaryAccount = planned.debitAccount;
        }
      } else {
        // Default view
        transactionType = { id: 1, name: 'Debit' };
        secondaryAccount = planned.creditAccount;
      }

      return {
        plannedId: planned.id,
        actualId: actualTx?.id,
        executed: !!actualTx,
        transactionType,
        secondaryAccount,
        plannedAmount: planned.amount,
        actualAmount: actualTx?.amount || 0,
        variance: actualTx ? (actualTx.amount - planned.amount) : 0,
        plannedDate: planned.effectiveDate,
        actualDate: actualTx?.actualDate || planned.effectiveDate,
        description: planned.description,
        debitAccount: planned.debitAccount,
        creditAccount: planned.creditAccount
      };
    });

    // Get the grid container
    const gridContainer = document.getElementById('actualTransactionsTable');
    if (!gridContainer) return;
    
    gridContainer.innerHTML = '';

    // Add "Add Actual" button
    const addButton = document.createElement('button');
    addButton.className = 'btn btn-primary btn-add';
    addButton.textContent = '+ Add New';
    addButton.addEventListener('click', async () => {
      // Add a new manual actual transaction (not linked to planned)
      const newActual = {
        id: window.generateUUID(),
        plannedId: null,
        debitAccount: null,
        creditAccount: null,
        amount: 0,
        actualDate: new Date().toISOString().slice(0,10),
        description: '',
        tags: []
      };
      const allActual = await TransactionManager.getAllActual(currentScenario.id);
      await TransactionManager.saveActual(currentScenario.id, [...allActual, newActual]);
      await loadActualTransactionsGrid(container);
    });
    window.add(gridContainer, addButton);

    // Create separate container for the actual grid
    const tableContainer = document.createElement('div');
    tableContainer.classList.add('grid-container', 'projections-grid');
    window.add(gridContainer, tableContainer);

    const actualTxTable = createGrid(tableContainer, {
      data: combinedData,
      columns: [
        {
          formatter: "buttonCross",
          width: 40,
          hozAlign: "center",
          cellClick: async function(e, cell) {
            const row = cell.getRow();
            const rowData = row.getData();
            // Only allow delete for manual actuals (plannedId == null) or executed actuals
            if (rowData.actualId && (rowData.plannedId == null || rowData.executed)) {
              if (confirm('Delete this actual transaction?')) {
                const allActual = await TransactionManager.getAllActual(currentScenario.id);
                const filtered = allActual.filter(tx => tx.id !== rowData.actualId);
                await TransactionManager.saveActual(currentScenario.id, filtered);
                await loadActualTransactionsGrid(container);
              }
            }
          }
        },
        {
          title: "✓",
          field: "executed",
          width: 50,
          hozAlign: "center",
          formatter: "tickCross",
          cellClick: async function(e, cell) {
            const row = cell.getRow();
            const rowData = row.getData();
            
            if (!rowData.executed) {
              // Mark as executed - create actual transaction
              const newActual = {
                id: window.generateUUID(),
                plannedId: rowData.plannedId,
                debitAccount: rowData.debitAccount,
                creditAccount: rowData.creditAccount,
                amount: rowData.plannedAmount,
                actualDate: rowData.plannedDate,
                description: rowData.description,
                tags: []
              };
              const allActual = await TransactionManager.getAllActual(currentScenario.id);
              await TransactionManager.saveActual(currentScenario.id, [...allActual, newActual]);
              row.update({
                executed: true,
                actualId: newActual.id,
                actualAmount: newActual.amount,
                actualDate: newActual.actualDate,
                variance: newActual.amount - rowData.plannedAmount
              });
              console.log('[Forecast] ✓ Actual transaction created');
            } else {
              // Unmark - delete actual transaction
              const allActual = await TransactionManager.getAllActual(currentScenario.id);
              const filtered = allActual.filter(tx => tx.id !== rowData.actualId);
              await TransactionManager.saveActual(currentScenario.id, filtered);
            }
          }
        },
        {
          title: "Type",
          field: "transactionType",
          widthGrow: 1,
          formatter: function(cell) {
            const value = cell.getValue();
            return value?.name || '';
          },
          sorter: function(a, b) {
            const aVal = a?.name || '';
            const bVal = b?.name || '';
            return aVal.localeCompare(bVal);
          },
          headerFilter: "input",
          headerFilterFunc: function(headerValue, rowValue) {
            const name = rowValue?.name || '';
            return name.toLowerCase().includes(headerValue.toLowerCase());
          },
          headerFilterPlaceholder: "Filter...",
          headerHozAlign: "left"
        },
        {
          title: "Secondary Account",
          field: "secondaryAccount",
          widthGrow: 2,
          formatter: function(cell) {
            const value = cell.getValue();
            return value?.name || '';
          },
          sorter: function(a, b) {
            const aVal = a?.name || '';
            const bVal = b?.name || '';
            return aVal.localeCompare(bVal);
          },
          headerFilter: "input",
          headerFilterFunc: function(headerValue, rowValue) {
            const name = rowValue?.name || '';
            return name.toLowerCase().includes(headerValue.toLowerCase());
          },
          headerFilterPlaceholder: "Filter account...",
          headerHozAlign: "left"
        },
        createMoneyColumn('Planned Amount', 'plannedAmount', { widthGrow: 1 }),
        createMoneyColumn('Actual Amount', 'actualAmount', { 
          widthGrow: 1, 
          editor: "number", 
          editorParams: { step: 0.01 } 
        }),
        {
          title: "Variance",
          field: "variance",
          widthGrow: 1,
          formatter: function(cell) {
            const value = cell.getValue() || 0;
            const formatted = new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD'
            }).format(value);
            
            // Color-code variance
            if (value > 0) {
              const el = cell.getElement(); el.classList.remove('status-danger','status-neutral'); el.classList.add('status-success');
            } else if (value < 0) {
              const el = cell.getElement(); el.classList.remove('status-success','status-neutral'); el.classList.add('status-danger');
            } else {
              const el = cell.getElement(); el.classList.remove('status-success','status-danger'); el.classList.add('status-neutral');
            }
            
            return formatted;
          },
          hozAlign: "right",
          headerHozAlign: "right"
        },
        createDateColumn('Planned Date', 'plannedDate', { widthGrow: 1 }),
        createDateColumn('Actual Date', 'actualDate', { 
          widthGrow: 1, 
          editor: "date" 
        }),
        createTextColumn('Description', 'description', { widthGrow: 2 })
      ],
      cellEdited: async function(cell) {
        const row = cell.getRow();
        const rowData = row.getData();

        // Only save if transaction is marked as executed and has an actual id
        if (!rowData.executed || !rowData.actualId) {
          console.log('[Forecast] Cannot edit non-executed transaction');
          return;
        }

        // Determine debit/credit accounts
        let debitAccount, creditAccount;
        if (rowData.transactionType?.name === 'Debit') {
          debitAccount = selectedAccountId ? currentScenario.accounts.find(a => a.id === selectedAccountId) : currentScenario.accounts?.[0];
          creditAccount = rowData.secondaryAccount;
        } else {
          debitAccount = rowData.secondaryAccount;
          creditAccount = selectedAccountId ? currentScenario.accounts.find(a => a.id === selectedAccountId) : currentScenario.accounts?.[0];
        }

        const updatedActual = {
          id: rowData.actualId,
          plannedId: rowData.plannedId,
          debitAccount,
          creditAccount,
          amount: parseFloat(rowData.actualAmount) || 0,
          actualDate: rowData.actualDate,
          description: rowData.description
        };

        const allActual = await TransactionManager.getAllActual(currentScenario.id);
        const updatedList = allActual.map(tx => tx.id === updatedActual.id ? updatedActual : tx);
        await TransactionManager.saveActual(currentScenario.id, updatedList);

        // Recalculate variance
        const variance = updatedActual.amount - rowData.plannedAmount;
        row.update({ variance });

        console.log('[Forecast] ✓ Actual transaction updated');
      }
    });

  } catch (err) {
    console.error('[Forecast] Failed to load actual transactions grid:', err);
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
      await generateProjections(currentScenario.id, { periodicity: 'monthly' });
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
  window.add(container, buttonContainer);

  // Update accordion header with selected account
  const accordionHeader = getEl('projectionsAccordionHeader');
  if (accordionHeader) {
    let headerText = 'Projections';
    if (selectedAccountId) {
      const selectedAccount = currentScenario.accounts?.find(a => a.id === selectedAccountId);
      headerText = `Projections - ${selectedAccount?.name || 'Unknown Account'}`;
      console.log('[Forecast] Setting accordion header:', headerText);
    } else {
      console.log('[Forecast] No selectedAccountId, showing default header');
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

    console.log(`[Forecast] Projections filtered: ${filteredProjections.length} of ${currentScenario.projections?.length || 0} for account ${selectedAccountId}`);

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
    plannedTransactionsTable: getEl('plannedTransactionsTable'),
    actualTransactionsTable: getEl('actualTransactionsTable'),
    projectionsContent: getEl('projectionsContent')
  };

  const typeConfig = getScenarioTypeConfig();
  
  // Show/hide sections based on scenario type
  const accountsSection = getEl('accountsTable').closest('.bg-main');
  const txSection = getEl('plannedTransactionsTable').closest('.bg-main');
  const projectionsSection = getEl('projectionsSection');
  
  if (typeConfig) {
    if (typeConfig.showAccounts) accountsSection.classList.remove('hidden'); else accountsSection.classList.add('hidden');
    if (typeConfig.showPlannedTransactions || typeConfig.showActualTransactions) txSection.classList.remove('hidden'); else txSection.classList.add('hidden');
    if (typeConfig.showProjections) projectionsSection.classList.remove('hidden'); else projectionsSection.classList.add('hidden');
  }

  // Clear downstream grids to prevent ghost data
  containers.plannedTransactionsTable.innerHTML = '<div class="empty-message">Loading...</div>';
  containers.actualTransactionsTable.innerHTML = '';

  await loadAccountsGrid(containers.accountsTable);
  // Note: loadPlannedTransactionsGrid and loadActualTransactionsGrid 
  // are triggered by the auto-selection in loadAccountsGrid
  
  // Initialize period selector for actual transactions
  await initializePeriodSelector();
  
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
    
    periodSelect.innerHTML = '<option value="">-- Select Period --</option>';
    periods.forEach((period, index) => {
      const option = document.createElement('option');
      option.value = period.id;
      option.textContent = period.label || `${period.startDate?.toISOString?.().slice(0,10) || ''} to ${period.endDate?.toISOString?.().slice(0,10) || ''}`;
      periodSelect.appendChild(option);
    });
    
    // Set first period as default if available
    if (periods.length > 0) {
      actualPeriod = periods[0].id;
      periodSelect.value = actualPeriod;
    }
    
    // Attach event listeners
    periodSelect.addEventListener('change', async (e) => {
      actualPeriod = e.target.value;
      await loadActualTransactionsGrid(document.getElementById('actualTxContent'));
    });
    
    document.getElementById('actual-prev-period-btn')?.addEventListener('click', async () => {
      const currentIndex = periods.findIndex(p => p.id === actualPeriod);
      if (currentIndex > 0) {
        actualPeriod = periods[currentIndex - 1].id;
        periodSelect.value = actualPeriod;
        await loadActualTransactionsGrid(document.getElementById('actualTxContent'));
      }
    });
    
    document.getElementById('actual-next-period-btn')?.addEventListener('click', async () => {
      const currentIndex = periods.findIndex(p => p.id === actualPeriod);
      if (currentIndex < periods.length - 1) {
        actualPeriod = periods[currentIndex + 1].id;
        periodSelect.value = actualPeriod;
        await loadActualTransactionsGrid(document.getElementById('actualTxContent'));
      }
    });
    
  } catch (err) {
    console.error('[Forecast] Failed to initialize period selector:', err);
  }
}

// Initialize the page
async function init() {
  loadGlobals();
  
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
    console.log('[Shortcuts] Changes are auto-saved on edit');
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
