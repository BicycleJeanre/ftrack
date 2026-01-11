// forecast.js
// Manages the Forecast page with scenario-centric model
// Displays accounts, planned transactions, actual transactions, and projections based on scenario type

import { getSchemaPath, getAppDataPath } from './app-paths.js';

import { EditableGrid } from './editable-grid.js';
import { createGrid, createSelectorColumn, createTextColumn, createObjectColumn, createDateColumn, createMoneyColumn } from './grid-factory.js';
import * as ScenarioManager from './managers/scenario-manager.js';
import * as TransactionManager from './managers/transaction-manager.js';
import { loadGlobals } from './global-app.js';
import {
  getScenarios,
  getScenario,
  createAccount,
  saveAccounts,
  savePlannedTransactions,
  saveActualTransactions,
  getScenarioPeriods,
  getPlannedTransactionsForPeriod,
  getActualTransactionsForPeriod,
  saveActualTransaction,
  deleteActualTransaction
} from './data-manager.js';
import { generateProjections, clearProjections } from './projection-engine.js';

let currentScenario = null;
let scenarioTypes = null;
let selectedAccountId = null; // Track selected account for filtering transaction views
let plannedView = 'master'; // 'master' or period ID for planned transactions
let actualPeriod = null; // Selected period for actual transactions
let periods = []; // Calculated periods for current scenario

// Build the main UI container with independent accordions
function buildGridContainer() {
  const forecastEl = getEl('panel-forecast');

  // Scenario selector (always visible, no accordion)
  const scenarioSelector = document.createElement('div');
  scenarioSelector.id = 'scenario-selector';
  scenarioSelector.className = 'bg-main bordered rounded shadow-lg';
  scenarioSelector.style.padding = '18px 20px';
  scenarioSelector.style.marginBottom = '20px';
  window.add(forecastEl, scenarioSelector);

  // Accounts section with accordion
  const accountsSection = document.createElement('div');
  accountsSection.className = 'bg-main bordered rounded shadow-lg';
  accountsSection.style.marginBottom = '20px';
  
  const accountsHeader = document.createElement('div');
  accountsHeader.className = 'pointer flex-between accordion-header';
  accountsHeader.style.padding = '18px 20px';
  accountsHeader.innerHTML = `<h2 class="text-main">Accounts</h2><span class="accordion-arrow">&#9662;</span>`;
  accountsHeader.addEventListener('click', () => window.toggleAccordion('accountsContent'));
  window.add(accountsSection, accountsHeader);
  
  const accountsContent = document.createElement('div');
  accountsContent.id = 'accountsContent';
  accountsContent.className = 'accordion-content';
  accountsContent.style.display = 'none';
  accountsContent.style.padding = '0 20px 20px 20px';
  window.add(accountsSection, accountsContent);
  
  const accountsTable = document.createElement('div');
  accountsTable.id = 'accountsTable';
  window.add(accountsContent, accountsTable);
  window.add(forecastEl, accountsSection);

  // Planned Transactions section with accordion
  const plannedTxSection = document.createElement('div');
  plannedTxSection.className = 'bg-main bordered rounded shadow-lg';
  plannedTxSection.style.marginBottom = '20px';
  
  const plannedTxHeader = document.createElement('div');
  plannedTxHeader.className = 'pointer flex-between accordion-header';
  plannedTxHeader.style.padding = '18px 20px';
  plannedTxHeader.innerHTML = `<h2 class="text-main">Planned Transactions</h2><span class="accordion-arrow">&#9662;</span>`;
  plannedTxHeader.addEventListener('click', () => window.toggleAccordion('plannedTxContent'));
  window.add(plannedTxSection, plannedTxHeader);
  
  const plannedTxContent = document.createElement('div');
  plannedTxContent.id = 'plannedTxContent';
  plannedTxContent.className = 'accordion-content';
  plannedTxContent.style.display = 'none';
  plannedTxContent.style.padding = '20px';
  window.add(plannedTxSection, plannedTxContent);
  
  // View selector for Master vs Period
  const plannedViewSelector = document.createElement('div');
  plannedViewSelector.style.marginBottom = '20px';
  plannedViewSelector.style.display = 'flex';
  plannedViewSelector.style.gap = '12px';
  plannedViewSelector.style.alignItems = 'center';
  plannedViewSelector.style.justifyContent = 'flex-end';
  plannedViewSelector.innerHTML = `
    <button id="planned-view-master-btn" class="btn btn-primary" style="width: auto; min-width: auto; max-width: none; padding: 10px 24px;">Master List</button>
    <select id="planned-period-select" class="form-select" style="min-width: 200px; max-width: 250px;">
      <option value="">-- Select Period --</option>
    </select>
    <button id="planned-prev-period-btn" class="btn">◀</button>
    <button id="planned-next-period-btn" class="btn">▶</button>
  `;
  window.add(plannedTxContent, plannedViewSelector);
  
  const plannedTransactionsTable = document.createElement('div');
  plannedTransactionsTable.id = 'plannedTransactionsTable';
  window.add(plannedTxContent, plannedTransactionsTable);
  
  window.add(forecastEl, plannedTxSection);

  // Actual Transactions section with accordion
  const actualTxSection = document.createElement('div');
  actualTxSection.className = 'bg-main bordered rounded shadow-lg';
  actualTxSection.style.marginBottom = '20px';
  
  const actualTxHeader = document.createElement('div');
  actualTxHeader.className = 'pointer flex-between accordion-header';
  actualTxHeader.style.padding = '18px 20px';
  actualTxHeader.innerHTML = `<h2 class="text-main">Actual Transactions</h2><span class="accordion-arrow">&#9662;</span>`;
  actualTxHeader.addEventListener('click', () => window.toggleAccordion('actualTxContent'));
  window.add(actualTxSection, actualTxHeader);
  
  const actualTxContent = document.createElement('div');
  actualTxContent.id = 'actualTxContent';
  actualTxContent.className = 'accordion-content';
  actualTxContent.style.display = 'none';
  actualTxContent.style.padding = '20px';
  window.add(actualTxSection, actualTxContent);
  
  // Period selector for actual transactions
  const actualPeriodSelector = document.createElement('div');
  actualPeriodSelector.style.marginBottom = '20px';
  actualPeriodSelector.style.display = 'flex';
  actualPeriodSelector.style.gap = '12px';
  actualPeriodSelector.style.alignItems = 'center';
  actualPeriodSelector.style.justifyContent = 'flex-end';
  actualPeriodSelector.innerHTML = `
    <label>Period:</label>
    <select id="actual-period-select" class="form-select" style="min-width: 200px; max-width: 250px;">
      <option value="">-- Select Period --</option>
    </select>
    <button id="actual-prev-period-btn" class="btn">◀</button>
    <button id="actual-next-period-btn" class="btn">▶</button>
  `;
  window.add(actualTxContent, actualPeriodSelector);
  
  const actualTransactionsTable = document.createElement('div');
  actualTransactionsTable.id = 'actualTransactionsTable';
  window.add(actualTxContent, actualTransactionsTable);
  
  window.add(forecastEl, actualTxSection);

  // Projections section with accordion
  const projectionsSection = document.createElement('div');
  projectionsSection.id = 'projectionsSection';
  projectionsSection.className = 'bg-main bordered rounded shadow-lg';
  projectionsSection.style.marginBottom = '20px';
  
  const projectionsHeader = document.createElement('div');
  projectionsHeader.id = 'projectionsAccordionHeader';
  projectionsHeader.className = 'pointer flex-between accordion-header';
  projectionsHeader.style.padding = '18px 20px';
  projectionsHeader.innerHTML = `<h2 class="text-main">Projections</h2><span class="accordion-arrow">&#9662;</span>`;
  projectionsHeader.addEventListener('click', () => window.toggleAccordion('projectionsContent'));
  window.add(projectionsSection, projectionsHeader);
  
  const projectionsContent = document.createElement('div');
  projectionsContent.id = 'projectionsContent';
  projectionsContent.className = 'accordion-content';
  projectionsContent.style.display = 'none';
  projectionsContent.style.padding = '0 20px 20px 20px';
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
  const schemaPath = getSchemaPath('scenario-grid.json');

  try {
    const schemaFile = await fs.readFile(schemaPath, 'utf8');
    const schema = JSON.parse(schemaFile);

    // Load all scenarios
    const scenarios = await ScenarioManager.getAll();

    const scenariosTable = createGrid(container, {
      data: scenarios,
      selectable: 1, // Single selection (radio button behavior)
      columns: [
        {
          title: "",
          field: "selected",
          width: 40,
          hozAlign: "center",
          headerSort: false,
          formatter: "rowSelection",
          titleFormatter: "rowSelection",
          cellClick: function(e, cell) {
            cell.getRow().toggleSelect();
          }
        },
        createTextColumn('Scenario Name', 'name', { widthGrow: 3, editor: "input" }),
        {
          title: "Type",
          field: "type",
          widthGrow: 2,
          editor: "list",
          editorParams: {
            values: schema.scenarioTypes.map(t => ({ label: t.name, value: t })),
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
        createTextColumn('Description', 'description', { widthGrow: 3, editor: "input" }),
        createDateColumn('Start Date', 'startDate', { widthGrow: 2, editor: "date" }),
        createDateColumn('End Date', 'endDate', { widthGrow: 2, editor: "date" }),
        {
          title: "Period Type",
          field: "projectionPeriod",
          widthGrow: 2,
          editor: "list",
          editorParams: {
            values: schema.periodTypes.map(p => ({ label: p.name, value: p })),
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
        if (rows.length > 0) {
          const scenario = rows[0].getData();
          console.log('[Forecast] Scenario selected:', scenario);
          currentScenario = await getScenario(scenario.id);
          selectedAccountId = null; // Clear selected account when switching scenarios
          await loadScenarioData();
        }
      },
      cellEdited: async function(cell) {
        const row = cell.getRow();
        const scenario = row.getData();
        
        try {
          // Update just the edited scenario
          await ScenarioManager.update(scenario.id, scenario);
          console.log('[Forecast] ✓ Scenario updated successfully');
        } catch (err) {
          console.error('[Forecast] ✗ Failed to save scenario:', err);
          alert('Failed to save scenario: ' + err.message);
        }
      }
    });

    // Set initial scenario if not set and load its data
    if (!currentScenario && scenarios.length > 0) {
      currentScenario = await getScenario(scenarios[0].id);
      await loadScenarioData();
      
      // Select the first row
      setTimeout(() => {
        const firstRow = scenariosTable.getRowFromPosition(0, true);
        if (firstRow) {
          firstRow.select();
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
  const typesPath = getSchemaPath('scenario-types.json');

  try {
    const typesFile = await fs.readFile(typesPath, 'utf8');
    const data = JSON.parse(typesFile);
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
  if (!currentScenario) return;

  const typeConfig = getScenarioTypeConfig();
  if (!typeConfig || !typeConfig.showAccounts) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';

  // Add section header
  const sectionHeader = document.createElement('h3');
  sectionHeader.className = 'text-main';
  sectionHeader.textContent = 'Accounts';
  sectionHeader.style.marginBottom = '12px';
  sectionHeader.style.fontSize = '1.22em';
  window.add(container, sectionHeader);

  const gridContainer = document.createElement('div');
  window.add(container, gridContainer);

  const fs = window.require('fs').promises;
  const schemaPath = getSchemaPath('accounts-grid-unified.json');

  try {
    const schemaFile = await fs.readFile(schemaPath, 'utf8');
    const schema = JSON.parse(schemaFile);

    // Inject accounts as options for account selectors
    schema.accounts = currentScenario.accounts || [];

    const grid = new EditableGrid({
      targetElement: gridContainer,
      tableHeader: 'Accounts',
      schema: schema,
      data: currentScenario.accounts || [],
      scenarioContext: currentScenario,
      onSave: async (updatedAccounts) => {
        console.log('[Forecast] Accounts onSave called with:', updatedAccounts);
        console.log('[Forecast] First account details:', JSON.stringify(updatedAccounts[0], null, 2));
        try {
          await saveAccounts(currentScenario.id, updatedAccounts);
          currentScenario = await getScenario(currentScenario.id);
          console.log('[Forecast] ✓ Accounts saved successfully');
          console.log('[Forecast] After reload, first account:', JSON.stringify(currentScenario.accounts[0], null, 2));
          // Reload grid with fresh data from disk
          await loadAccountsGrid(container);
        } catch (err) {
          console.error('[Forecast] ✗ Failed to save accounts:', err);
          alert('Failed to save accounts: ' + err.message);
        }
      },
      onRowClick: async (account) => {
        console.log('[Forecast] Account selected:', account);
        selectedAccountId = account.id;
        console.log('[Forecast] selectedAccountId set to:', selectedAccountId);
        // Reload transaction and projection grids to filter by this account
        const plannedTxContainer = getEl('plannedTransactionsTable');
        const actualTxContainer = getEl('actualTransactionsTable');
        const projectionsContainer = getEl('projectionsContent');
        console.log('[Forecast] Containers:', { plannedTxContainer, actualTxContainer, projectionsContainer });
        await loadPlannedTransactionsGrid(plannedTxContainer);
        await loadActualTransactionsGrid(actualTxContainer);
        console.log('[Forecast] About to call loadProjectionsSection with selectedAccountId:', selectedAccountId);
        await loadProjectionsSection(projectionsContainer);
        console.log('[Forecast] loadProjectionsSection completed');
      }
    });

    await grid.render();
  } catch (err) {
    console.error('[Forecast] Failed to load accounts grid:', err);
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

  // Add section header with selected account info
  const sectionHeader = document.createElement('h3');
  sectionHeader.className = 'text-main';
  sectionHeader.style.marginBottom = '12px';
  sectionHeader.style.fontSize = '1.22em';
  
  if (selectedAccountId) {
    const selectedAccount = currentScenario.accounts?.find(a => a.id === selectedAccountId);
    sectionHeader.textContent = `Planned Transactions - ${selectedAccount?.name || 'Unknown Account'}`;
  } else {
    sectionHeader.textContent = 'Planned Transactions - Select an account to view';
  }
  
  window.add(container, sectionHeader);

  if (!selectedAccountId) {
    return; // Exit early if no account selected
  }

  const gridContainer = document.createElement('div');
  window.add(container, gridContainer);

  try {
    // Get planned transactions for this scenario
    const allTransactions = await TransactionManager.getAllPlanned(currentScenario.id);
    
    // Filter to show only transactions involving the selected account
    const filteredTransactions = allTransactions.filter(tx => {
      return tx.debitAccount?.id === selectedAccountId || tx.creditAccount?.id === selectedAccountId;
    });

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

    const plannedTxTable = createGrid(gridContainer, {
      data: transformedData,
      columns: [
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
          headerFilter: "input",
          headerFilterFunc: "like",
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
              return `${value.recurrenceType.name || 'N/A'}`;
            }
            return '<span style="color: #999;">None</span>';
          },
          headerSort: false,
          headerHozAlign: "left"
        }
      ],
      cellEdited: async function(cell) {
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
      }
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

  container.innerHTML = '';

  // Add section header with selected account info
  const sectionHeader = document.createElement('h3');
  sectionHeader.className = 'text-main';
  sectionHeader.style.marginBottom = '12px';
  sectionHeader.style.fontSize = '1.22em';
  
  if (selectedAccountId) {
    const selectedAccount = currentScenario.accounts?.find(a => a.id === selectedAccountId);
    sectionHeader.textContent = `Actual Transactions - ${selectedAccount?.name || 'Unknown Account'}`;
  } else {
    sectionHeader.textContent = 'Actual Transactions - Select an account to view';
  }
  
  window.add(container, sectionHeader);

  const gridContainer = document.createElement('div');
  window.add(container, gridContainer);

  const fs = window.require('fs').promises;
  const schemaPath = getSchemaPath('actual-transactions-grid.json');

  try {
    const schemaFile = await fs.readFile(schemaPath, 'utf8');
    const schema = JSON.parse(schemaFile);

    // Inject accounts as options for account selectors
    schema.accounts = currentScenario.accounts || [];

    // Transform transactions for UI display based on selected account
    const transformedData = selectedAccountId 
      ? transformActualTxForUI(currentScenario.actualTransactions || [], selectedAccountId)
      : [];

    const grid = new EditableGrid({
      targetElement: gridContainer,
      tableHeader: 'Actual Transactions',
      schema: schema,
      data: transformedData,
      scenarioContext: currentScenario,
      onSave: async (updatedTransactions) => {
        console.log('[Forecast] Actual Txs onSave called with:', updatedTransactions);
        try {
          // Transform back to backend format before saving (async - may create accounts)
          const backendTxsRaw = await Promise.all(
            updatedTransactions.map(tx => transformActualTxForBackend(tx, selectedAccountId))
          );
          
          // Filter out null results (transactions with missing data)
          const backendTxs = backendTxsRaw.filter(tx => tx !== null);
          
          // Merge with existing transactions
          // Get all transactions from scenario
          const allTransactions = currentScenario.actualTransactions || [];
          
          // Keep transactions that DON'T involve the selected account
          const otherAccountTxs = allTransactions.filter(tx => {
            const involvesAccount = 
              tx.debitAccount?.id === selectedAccountId || 
              tx.creditAccount?.id === selectedAccountId;
            return !involvesAccount;
          });
          
          // Combine: other account transactions + ALL transactions from grid (for selected account)
          const mergedTransactions = [...otherAccountTxs, ...backendTxs];
          
          // Track accounts count before save to detect if new accounts were created
          const accountsCountBefore = currentScenario.accounts?.length || 0;
          
          await saveActualTransactions(currentScenario.id, mergedTransactions);
          currentScenario = await getScenario(currentScenario.id);
          console.log('[Forecast] ✓ Actual transactions saved successfully');
          
          // Only reload accounts grid if new accounts were created
          const accountsCountAfter = currentScenario.accounts?.length || 0;
          if (accountsCountAfter > accountsCountBefore) {
            const accountsContainer = getEl('accountsTable');
            await loadAccountsGrid(accountsContainer);
          }
          
          // Reload actual transactions grid with updated data
          await loadActualTransactionsGrid(container);
        } catch (err) {
          console.error('[Forecast] ✗ Failed to save actual transactions:', err);
          alert('Failed to save actual transactions: ' + err.message);
        }
      }
    });

    await grid.render();
  } catch (err) {
    console.error('[Forecast] Failed to load actual transactions grid:', err);
  }
}

// Initialize period selector and attach event listeners
async function initializePeriodSelector() {
  if (!currentScenario) return;
  
  // Calculate periods for the scenario
  periods = await getScenarioPeriods(currentScenario.id);
  
  // Populate PLANNED period select dropdown
  const plannedPeriodSelect = getEl('planned-period-select');
  if (plannedPeriodSelect) {
    plannedPeriodSelect.innerHTML = '<option value="">-- Select Period --</option>';
    periods.forEach(period => {
      const option = document.createElement('option');
      option.value = period.id;
      option.textContent = period.label;
      plannedPeriodSelect.appendChild(option);
    });
    
    plannedPeriodSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        switchPlannedView(e.target.value);
      } else {
        switchPlannedView('master');
      }
    });
  }
  
  // Populate ACTUAL period select dropdown
  const actualPeriodSelect = getEl('actual-period-select');
  if (actualPeriodSelect) {
    actualPeriodSelect.innerHTML = '<option value="">-- Select Period --</option>';
    periods.forEach(period => {
      const option = document.createElement('option');
      option.value = period.id;
      option.textContent = period.label;
      actualPeriodSelect.appendChild(option);
    });
    
    actualPeriodSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        loadActualTransactionsForPeriod(e.target.value);
      }
    });
  }
  
  // Planned view master button
  const masterBtn = getEl('planned-view-master-btn');
  if (masterBtn) {
    masterBtn.addEventListener('click', () => switchPlannedView('master'));
  }
  
  // Planned period navigation
  const plannedPrevBtn = getEl('planned-prev-period-btn');
  const plannedNextBtn = getEl('planned-next-period-btn');
  if (plannedPrevBtn) {
    plannedPrevBtn.addEventListener('click', () => navigatePlannedPeriod(-1));
  }
  if (plannedNextBtn) {
    plannedNextBtn.addEventListener('click', () => navigatePlannedPeriod(1));
  }
  
  // Actual period navigation
  const actualPrevBtn = getEl('actual-prev-period-btn');
  const actualNextBtn = getEl('actual-next-period-btn');
  if (actualPrevBtn) {
    actualPrevBtn.addEventListener('click', () => navigateActualPeriod(-1));
  }
  if (actualNextBtn) {
    actualNextBtn.addEventListener('click', () => navigateActualPeriod(1));
  }
  
  // Default to master view for planned transactions
  switchPlannedView('master');
}

// Switch planned transactions view between master and period
async function switchPlannedView(view) {
  plannedView = view;
  
  const container = getEl('plannedTransactionsTable');
  const masterBtn = getEl('planned-view-master-btn');
  const periodSelect = getEl('planned-period-select');
  
  if (view === 'master') {
    // Show all planned transactions with recurrence rules
    if (masterBtn) {
      masterBtn.classList.add('btn-primary');
      masterBtn.classList.remove('btn-secondary');
    }
    if (periodSelect) periodSelect.value = '';
    await loadPlannedTransactionsGrid(container);
  } else {
    // Show planned transactions for specific period
    if (masterBtn) {
      masterBtn.classList.remove('btn-primary');
      masterBtn.classList.add('btn-secondary');
    }
    if (periodSelect) periodSelect.value = view;
    await loadPlannedTransactionsForPeriodView(container, view);
  }
}

// Navigate planned transactions period
function navigatePlannedPeriod(direction) {
  if (plannedView === 'master' || !periods.length) return;
  
  const currentIndex = periods.findIndex(p => p.id === plannedView);
  const newIndex = currentIndex + direction;
  
  if (newIndex >= 0 && newIndex < periods.length) {
    switchPlannedView(periods[newIndex].id);
  }
}

// Navigate actual transactions period
function navigateActualPeriod(direction) {
  if (!actualPeriod || !periods.length) return;
  
  const currentIndex = periods.findIndex(p => p.id === actualPeriod);
  const newIndex = currentIndex + direction;
  
  if (newIndex >= 0 && newIndex < periods.length) {
    const newPeriod = periods[newIndex].id;
    const periodSelect = getEl('actual-period-select');
    if (periodSelect) periodSelect.value = newPeriod;
    loadActualTransactionsForPeriod(newPeriod);
  }
}

// Load planned transactions for a specific period (calculated instances)
async function loadPlannedTransactionsForPeriodView(container, periodId) {
  if (!currentScenario || !periodId) return;
  
  container.innerHTML = '';
  
  // Add section header with selected account info
  const sectionHeader = document.createElement('h3');
  sectionHeader.className = 'text-main';
  sectionHeader.style.marginBottom = '12px';
  sectionHeader.style.fontSize = '1.22em';
  
  const period = periods.find(p => p.id === periodId);
  const periodLabel = period ? period.label : periodId;
  
  if (selectedAccountId) {
    const selectedAccount = currentScenario.accounts?.find(a => a.id === selectedAccountId);
    sectionHeader.textContent = `${selectedAccount?.name || 'Unknown Account'} - ${periodLabel}`;
  } else {
    sectionHeader.textContent = `${periodLabel} - Select an account to view`;
  }
  
  window.add(container, sectionHeader);
  
  const gridContainer = document.createElement('div');
  window.add(container, gridContainer);
  
  try {
    // Get planned transactions for this period (calculated instances)
    const plannedForPeriod = await getPlannedTransactionsForPeriod(currentScenario.id, periodId);
    
    // Update calculated dates in the original transactions
    const transactionsWithDates = plannedForPeriod.map(tx => ({
      ...tx,
      date: tx.calculatedDate
    }));
    
    // Transform transactions for UI display based on selected account
    const transformedData = selectedAccountId 
      ? transformPlannedTxForUI(transactionsWithDates, selectedAccountId)
      : [];
    
    // Load using existing planned transactions grid config
    const fs = window.require('fs').promises;
    const schemaPath = getSchemaPath('planned-transactions-grid.json');
    const schemaFile = await fs.readFile(schemaPath, 'utf8');
    const schema = JSON.parse(schemaFile);
    
    // Inject accounts as options for account selectors
    schema.accounts = currentScenario.accounts || [];
    
    const grid = new EditableGrid({
      targetElement: gridContainer,
      tableHeader: '',
      schema: schema,
      data: transformedData,
      scenarioContext: currentScenario,
      onSave: async (updatedRows) => {
        // Transform back to backend format
        const backendTxsRaw = await Promise.all(
          updatedRows.map(tx => transformPlannedTxForBackend(tx, selectedAccountId))
        );
        const backendTxs = backendTxsRaw.filter(tx => tx !== null);
        
        // Merge with existing transactions (keep transactions for other accounts)
        const allTransactions = currentScenario.plannedTransactions || [];
        const otherAccountTxs = allTransactions.filter(tx => {
          const involvesAccount = 
            tx.debitAccount?.id === selectedAccountId || 
            tx.creditAccount?.id === selectedAccountId;
          return !involvesAccount;
        });
        
        const mergedTransactions = [...otherAccountTxs, ...backendTxs];
        
        await savePlannedTransactions(currentScenario.id, mergedTransactions);
        currentScenario = await getScenario(currentScenario.id);
        await loadPlannedTransactionsForPeriodView(container, periodId);
      },
      onDelete: async (id) => {
        // Delete from master planned transactions
        const updated = currentScenario.plannedTransactions.filter(tx => tx.id !== id);
        await savePlannedTransactions(currentScenario.id, updated);
        currentScenario = await getScenario(currentScenario.id);
        await loadPlannedTransactionsForPeriodView(container, periodId);
      }
    });
    
    await grid.render();
  } catch (err) {
    console.error('[Forecast] Failed to load planned period view:', err);
    container.innerHTML = `<p>Error loading period data: ${err.message}</p>`;
  }
}

// Load actual transactions for a specific period
async function loadActualTransactionsForPeriod(periodId) {
  actualPeriod = periodId;
  
  const container = getEl('actualTransactionsTable');
  if (!currentScenario || !periodId || !container) return;
  
  container.innerHTML = '';
  
  try {
    // Get planned transactions for this period
    const plannedForPeriod = await getPlannedTransactionsForPeriod(currentScenario.id, periodId);
    
    // Transform to UI format (adds secondaryAccount field)
    const transformedPlanned = selectedAccountId 
      ? transformPlannedTxForUI(plannedForPeriod, selectedAccountId)
      : [];
    
    // Get actual transactions for this period
    const actualsForPeriod = await getActualTransactionsForPeriod(currentScenario.id, periodId);
    
    // Build combined grid data
    const gridData = buildPeriodGridData(transformedPlanned, actualsForPeriod);
    
    // Load grid config
    const fs = window.require('fs').promises;
    const schemaPath = getSchemaPath('actual-transactions-grid.json');
    const schemaFile = await fs.readFile(schemaPath, 'utf8');
    const schema = JSON.parse(schemaFile);
    
    const grid = new EditableGrid({
      targetElement: container,
      tableHeader: `Actual Transactions - ${periodId}`,
      schema: schema,
      data: gridData,
      onSave: async (updatedRows) => {
        await savePeriodActuals(periodId, updatedRows);
        // Don't reload - grid already has the updated data in workingData
      },
      onDelete: async (deletedRow) => {
        // Only delete if it's a saved actual transaction (has numeric ID)
        if (deletedRow.id && !String(deletedRow.id).startsWith('planned-')) {
          await deleteActualTransaction(currentScenario.id, deletedRow.id);
          await loadActualTransactionsForPeriod(periodId);
        }
      }
    });
    
    await grid.render();
  } catch (err) {
    console.error('[Forecast] Failed to load actual transactions:', err);
    container.innerHTML = `<p>Error loading period data: ${err.message}</p>`;
  }
}

// Build grid data combining planned and actual for a period
function buildPeriodGridData(plannedTransactions, actualTransactions) {
  const rows = [];
  
  // Add rows for each planned transaction instance
  plannedTransactions.forEach(planned => {
    // Match actual to this specific instance by plannedTransactionId AND the calculated date
    // This allows multiple instances of the same planned transaction to have separate actuals
    const plannedDateISO = new Date(planned.calculatedDate).toISOString().slice(0, 10);
    const actual = actualTransactions.find(a => 
      a.plannedTransactionId === planned.id && 
      a.date === plannedDateISO
    );
    
    // Use instanceId as the row ID if no actual exists yet
    // instanceId format: "plannedId-YYYY-MM-DD" which uniquely identifies this occurrence
    const rowId = actual?.id || planned.instanceId || `planned-${planned.id}-${plannedDateISO}`;
    
    rows.push({
      id: rowId,
      plannedTransactionId: planned.id,
      instanceDate: plannedDateISO,  // Store the instance date for saving
      executed: actual?.executed || false,
      transactionType: planned.transactionType,  // Pass through for totals calculation
      secondaryAccount: planned.secondaryAccount?.name || '',
      description: planned.description,
      plannedAmount: planned.amount,
      plannedDate: formatDate(planned.calculatedDate),
      actualAmount: actual?.amount || planned.amount,
      actualDate: actual?.date || plannedDateISO,  // Default to planned date
      variance: actual ? (actual.amount - planned.amount) : 0,
      debitAccount: planned.debitAccount,
      creditAccount: planned.creditAccount
    });
  });
  
  // Add unplanned actuals
  actualTransactions
    .filter(a => !a.plannedTransactionId)
    .forEach(actual => {
      // For unplanned, show credit account (typically the expense category)
      const secondaryAccountName = actual.creditAccount?.name || actual.debitAccount?.name || '';
      
      rows.push({
        id: actual.id,
        plannedTransactionId: null,
        executed: true,
        secondaryAccount: secondaryAccountName,
        description: actual.description || 'Unplanned',
        plannedAmount: null,
        plannedDate: null,
        actualAmount: actual.amount,
        actualDate: actual.date,  // Keep as ISO date for date input
        variance: null,
        debitAccount: actual.debitAccount,
        creditAccount: actual.creditAccount
      });
    });
  
  return rows;
}

// Save period actuals
async function savePeriodActuals(periodId, rows) {
  try {
    for (const row of rows) {
      const hasRealId = row.id && !String(row.id).startsWith('planned-');
      
      if (row.executed) {
        // Save or update actual transaction (minimal schema - only what changed from planned)
        // The combination of plannedTransactionId + date makes each instance unique
        const actualTx = {
          id: hasRealId ? row.id : null,
          period: periodId,
          plannedTransactionId: row.plannedTransactionId,
          executed: row.executed,
          amount: row.actualAmount,
          date: row.actualDate  // This is the instance date - makes this occurrence unique
        };
        
        await saveActualTransaction(currentScenario.id, actualTx);
      } else if (hasRealId) {
        // Executed flag was unchecked - delete the actual transaction
        await deleteActualTransaction(currentScenario.id, row.id);
      }
    }
    
    // Reload scenario
    currentScenario = await getScenario(currentScenario.id);
  } catch (err) {
    console.error('[Forecast] Failed to save period actuals:', err);
    throw err;
  }
}

// Format date for display
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

// Load projections section
async function loadProjectionsSection(container) {
  console.log('[Forecast] ➤ loadProjectionsSection called, selectedAccountId:', selectedAccountId);
  if (!currentScenario) return;

  const typeConfig = getScenarioTypeConfig();
  if (!typeConfig || !typeConfig.showProjections) {
    container.innerHTML = '';
    return;
  }
  
  // Clear and rebuild entire section
  container.innerHTML = '';
  console.log('[Forecast] ➤ Projections section cleared, rebuilding with selectedAccountId:', selectedAccountId);

  // Add generate and clear buttons
  const buttonContainer = document.createElement('div');
  buttonContainer.style.marginBottom = '20px';
  buttonContainer.style.display = 'flex';
  buttonContainer.style.flexDirection = 'row';
  buttonContainer.style.gap = '12px';
  buttonContainer.style.alignItems = 'center';
  
  const generateButton = document.createElement('button');
  generateButton.className = 'btn';
  generateButton.textContent = 'Generate Projections';
  generateButton.style.padding = '12px 24px';
  generateButton.style.fontSize = '1.04em';
  generateButton.style.whiteSpace = 'nowrap';
  generateButton.style.minWidth = 'fit-content';
  generateButton.style.width = 'auto';
  generateButton.style.display = 'inline-block';
  generateButton.addEventListener('click', async () => {
    try {
      generateButton.disabled = true;
      generateButton.textContent = 'Generating...';
      
      await generateProjections(currentScenario.id, { periodicity: 'monthly' });
      
      // Reload scenario to get updated projections
      currentScenario = await getScenario(currentScenario.id);
      await loadProjectionsGrid(projectionsGridContainer);
      
      generateButton.textContent = 'Generate Projections';
      generateButton.disabled = false;
    } catch (err) {
      console.error('[Forecast] Failed to generate projections:', err);
      alert('Failed to generate projections: ' + err.message);
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
  window.add(container, projectionsGridContainer);

  // Load projections grid
  await loadProjectionsGrid(projectionsGridContainer);
}

// Load projections grid
async function loadProjectionsGrid(container) {
  if (!currentScenario) return;

  const fs = window.require('fs').promises;
  const schemaPath = getSchemaPath('projections-grid.json');

  try {
    const schemaFile = await fs.readFile(schemaPath, 'utf8');
    const schema = JSON.parse(schemaFile);

    // Filter projections by selected account
    const filteredProjections = selectedAccountId
      ? (currentScenario.projections || []).filter(p => p.accountId === selectedAccountId)
      : currentScenario.projections || [];

    console.log(`[Forecast] Projections filtered: ${filteredProjections.length} of ${currentScenario.projections?.length || 0} for account ${selectedAccountId}`);

    const grid = new EditableGrid({
      targetElement: container,
      tableHeader: 'Projections',
      schema: schema,
      data: filteredProjections,
      scenarioContext: currentScenario,
      onSave: null // Read-only grid
    });

    await grid.render();
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
    accountsSection.style.display = typeConfig.showAccounts ? 'block' : 'none';
    txSection.style.display = (typeConfig.showPlannedTransactions || typeConfig.showActualTransactions) ? 'block' : 'none';
    projectionsSection.style.display = typeConfig.showProjections ? 'block' : 'none';
  }

  await loadAccountsGrid(containers.accountsTable);
  await initializePeriodSelector(); // Initialize period selector and load default view
  await loadProjectionsSection(containers.projectionsContent);
}

// Initialize the page
async function init() {
  loadGlobals();
  
  const containers = buildGridContainer();
  
  await loadScenarioTypes();
  await buildScenarioGrid(containers.scenarioSelector);
  
  // loadScenarioData is now called from buildScenarioGrid when initial scenario is set
}

init();
