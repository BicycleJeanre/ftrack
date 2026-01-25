// forecast.js
// Manages the Forecast page with scenario-centric model
// Displays accounts, planned transactions, actual transactions, and projections based on scenario type

console.log('forecast.js loaded at', new Date().toISOString());

import { getSchemaPath, getAppDataPath } from './app-paths.js';

import { createGrid, createSelectorColumn, createTextColumn, createObjectColumn, createDateColumn, createMoneyColumn, createListEditor } from './grid-factory.js';
import * as ScenarioManager from './managers/scenario-manager.js';
import * as AccountManager from './managers/account-manager.js';
import * as TransactionManager from './managers/transaction-manager.js';
import { openRecurrenceModal } from './modal-recurrence.js';
import { openPeriodicChangeModal } from './modal-periodic-change.js';
import { openTextInputModal } from './modal-text-input.js';
import keyboardShortcuts from './keyboard-shortcuts.js';
import { loadGlobals } from './global-app.js';
import { createLogger } from './logger.js';

const logger = createLogger('ForecastController');

import { formatDateOnly } from './date-utils.js';

import {
  getScenarios,
  getScenario,
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
  
  // Summary totals for actual transactions (moved above grid)
  const actualSummary = document.createElement('div');
  actualSummary.id = 'actualTransactionsSummary';
  actualSummary.className = 'transaction-summary';
  actualSummary.innerHTML = `
    <div class="summary-row">
      <span class="summary-label">Planned Totals:</span>
      <span class="summary-value" id="planned-credits">Money In: R0.00</span>
      <span class="summary-value" id="planned-debits">Money Out: R0.00</span>
      <span class="summary-value" id="planned-balance">Balance: R0.00</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Actual Totals:</span>
      <span class="summary-value" id="actual-credits">Money In: R0.00</span>
      <span class="summary-value" id="actual-debits">Money Out: R0.00</span>
      <span class="summary-value" id="actual-balance">Balance: R0.00</span>
    </div>
  `;
  window.add(actualTxContent, actualSummary);
  
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
                await loadPlannedTransactionsGrid(document.getElementById('plannedTransactionsTable'));
                await loadActualTransactionsGrid(document.getElementById('actualTransactionsTable'));
              }
            } catch (err) { console.error('Delete account failed', err); }
          }
        },
        createTextColumn('Account Name', 'name', { widthGrow: 2 }),
        createObjectColumn('Type', 'type', 'name', Object.assign({ widthGrow: 1 }, createListEditor(lookupData.accountTypes))),

        createObjectColumn('Currency', 'currency', 'name', Object.assign({ width: 100 }, createListEditor(lookupData.currencies))),

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
               await loadPlannedTransactionsGrid(document.getElementById('plannedTransactionsTable'));
               await loadActualTransactionsGrid(document.getElementById('actualTransactionsTable'));
               // Also refresh Projections as they might depend on the account filter (future proofing)
               await loadProjectionsSection(document.getElementById('projectionsContent'));
             }, 40);
          }
        } else {
          // No account selected
          selectedAccountId = null;
          // Clear downstream grids
          document.getElementById('plannedTransactionsTable').innerHTML = '<div class="empty-message">Select an account to view transactions</div>';
          document.getElementById('actualTransactionsTable').innerHTML = '<div class="empty-message">Select an account to view transactions</div>';
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
        const plannedContainer = document.getElementById('plannedTransactionsTable');
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
            await loadPlannedTransactionsGrid(document.getElementById('plannedTransactionsTable'));
            await loadActualTransactionsGrid(document.getElementById('actualTransactionsTable'));
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
          document.getElementById('plannedTransactionsTable').innerHTML = '<div class="empty-message">Select an account to view transactions</div>';
          document.getElementById('actualTransactionsTable').innerHTML = '<div class="empty-message">Select an account to view transactions</div>';
          await loadProjectionsSection(document.getElementById('projectionsContent'));
        }
      } catch (e) { logger.error('[AccountsGrid] fallback rowDeselected handler error:', e); }
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
  
  const selIdNum = selectedAccountId != null ? Number(selectedAccountId) : null;

  if (selIdNum) {
    const selectedAccount = currentScenario.accounts?.find(a => a.id === selIdNum);
    sectionHeader.textContent = `Filtered by: ${selectedAccount?.name || 'Unknown Account'}`;
  } else {
    sectionHeader.textContent = 'All Accounts';
  }
  
  window.add(container, sectionHeader);

  // Add "Add Transaction" button
  // Remove existing add buttons (defensive)
  const existingPlannedAdds = container.querySelectorAll('.btn-add');
  existingPlannedAdds.forEach(el => el.remove());

  const addButtonContainer = document.createElement('div');
  addButtonContainer.className = 'mb-sm';
  const addButton = document.createElement('button');
  addButton.className = 'btn btn-primary btn-add';
  addButton.textContent = '+ Add New';
  addButton.addEventListener('click', async () => {
    // Ensure "Select Account" placeholder exists
    let selectAccount = currentScenario.accounts?.find(a => a.name === 'Select Account');
    if (!selectAccount) {
      selectAccount = await AccountManager.create(currentScenario.id, {
        name: 'Select Account',
        type: { id: 1, name: 'Asset' },
        currency: { id: 1, name: 'ZAR' },
        balance: 0,
        openDate: formatDateOnly(new Date()),
        periodicChange: null
      });
      // Reload scenario to include the new account
      currentScenario = await getScenario(currentScenario.id);
    }

    // Add a new blank row to the grid
    if (plannedTxTable) {
      const newTx = {
        id: Date.now(), // Temporary ID
        transactionType: { id: 1, name: 'Money Out' },
        secondaryAccount: selectAccount,
        amount: 0,
        description: '',
        recurrence: null,
        periodicChange: null,
        tags: []
      };
      
      // Transform to backend format
      let debitAccount, creditAccount;
      const selIdNumLocal = selectedAccountId != null ? Number(selectedAccountId) : null;
      if (newTx.transactionType?.name === 'Money Out') {
        debitAccount = selIdNumLocal 
          ? currentScenario.accounts.find(a => a.id === selIdNumLocal)
          : currentScenario.accounts?.find(a => a.name !== 'Select Account') || currentScenario.accounts?.[0];
        creditAccount = newTx.secondaryAccount;
      } else {
        debitAccount = newTx.secondaryAccount;
        creditAccount = selIdNumLocal 
          ? currentScenario.accounts.find(a => a.id === selIdNumLocal)
          : currentScenario.accounts?.find(a => a.name !== 'Select Account') || currentScenario.accounts?.[0];
      }

      // Validate: debit and credit accounts must be different
      if (!debitAccount || !creditAccount || debitAccount.id === creditAccount.id) {
        alert('Invalid transaction: Money out and money in accounts must be different.');
        return;
      }

      const backendTx = {
        id: newTx.id,
        debitAccount: { id: debitAccount.id },
        creditAccount: { id: creditAccount.id },
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
    
    // Use centralized transformer to filter and map transactions consistently
    const transformedData = transformPlannedTxForUI(allTransactions, selectedAccountId);

    plannedTxTable = createGrid(gridContainer, {
      data: transformedData,
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
              if (confirm(`Delete transaction: ${rowData.description || 'Unnamed'}?`)) {
                const allTxs = await TransactionManager.getAllPlanned(currentScenario.id);
                const updatedTxs = allTxs.filter(tx => tx.id !== rowData.id);
                await TransactionManager.savePlanned(currentScenario.id, updatedTxs);
                row.delete();
              }
            } catch (err) { console.error('Delete planned tx failed', err); }
          }
        },
        {
          title: "Type",
          field: "transactionType",
          widthGrow: 1,
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
          ...createListEditor((currentScenario.accounts || []).filter(a => a.name !== 'Select Account'), { creatable: true, createLabel: 'Insert New Account...' }),
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
                debitAccount = currentScenario.accounts.find(a => a.id === Number(selectedAccountId));
                creditAccount = uiTx.secondaryAccount;
              } else {
                debitAccount = uiTx.secondaryAccount;
                creditAccount = currentScenario.accounts.find(a => a.id === Number(selectedAccountId));
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
            });
          },
          headerSort: false,
          headerHozAlign: "left"
        }
      ]
    });
    
    // Log when table finishes building and how many rows it has
    plannedTxTable.on('tableBuilt', function(){
    });

    // Also attach rowClick/selection handlers similar to other grids
    plannedTxTable.on('rowClick', function(e, row){
    });

    plannedTxTable.on('rowSelected', function(row){
    });


    // Attach cellEdited event handler
    plannedTxTable.on("cellEdited", async function(cell) {
      const row = cell.getRow();

      // Handle sentinel 'create new' selection for secondaryAccount
      if (cell.getField() === 'secondaryAccount') {
        const val = cell.getValue();
        if (val && val.__create__) {
          // Use modal input (prompt is unsupported in electron renderer)
          openTextInputModal('Create New Account', '', 'Account name', async (name) => {
            try {
                const newAccount = await AccountManager.create(currentScenario.id, {
                name: name,
                type: null,
                currency: null,
                balance: 0
              });

              // Reload scenario and accounts grid so data is consistent everywhere
              currentScenario = await getScenario(currentScenario.id);
              try { await loadAccountsGrid(document.getElementById('accountsTable')); } catch (e) { logger.error('[PlannedTx] Failed to reload accounts grid after create', e); }

              // Update the row with the real account object
              row.update({ secondaryAccount: newAccount });

              // Persist the transaction immediately using the backend transformer to ensure both sides exist
              try {
                const updatedUiTx = row.getData();
                const backendTx = await transformPlannedTxForBackend(updatedUiTx, selectedAccountId);
                if (backendTx) {
                  const allTxs = await TransactionManager.getAllPlanned(currentScenario.id);
                  let updatedTxs = allTxs.map(tx => tx.id === backendTx.id ? backendTx : tx);
                  // If the transaction is new and not in the list, add it
                  if (!updatedTxs.some(tx => tx.id === backendTx.id)) {
                    updatedTxs.push(backendTx);
                  }
                  await TransactionManager.savePlanned(currentScenario.id, updatedTxs);
                }
              } catch (err) {
                logger.error('[PlannedTx] Failed to save planned transaction after creating account:', err);
              }

            } catch (err) {
              logger.error('[PlannedTx] Failed to create new account from sentinel (modal):', err);
              row.update({ secondaryAccount: null });
            }
          });

          return; // Wait for the next cellEdited invocation to continue save flow
        }
      }

      try {
        const uiTx = row.getData();

        // Reuse centralized transform which handles creating secondary accounts or resolving strings
        const backendTx = await transformPlannedTxForBackend(uiTx, selectedAccountId);
        if (!backendTx) {
          logger.warn('[PlannedTx] Skipping save: transformPlannedTxForBackend returned null');
          return;
        }

        const allTxs = await TransactionManager.getAllPlanned(currentScenario.id);
        const updatedTxs = allTxs.map(tx => tx.id === backendTx.id ? backendTx : tx);
        await TransactionManager.savePlanned(currentScenario.id, updatedTxs);
      } catch (err) {
        logger.error('[PlannedTx] Failed to persist planned transaction after edit:', err);
      }
    });

  } catch (err) {
    console.error('[Forecast] Failed to load planned transactions grid:', err);
  }
}

// Load actual transactions grid
async function loadActualTransactionsGrid(container) {
  console.log('loadActualTransactionsGrid called');
  if (!currentScenario) {
    console.log('No current scenario');
    return;
  }

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

    const selIdNum = selectedAccountId != null ? Number(selectedAccountId) : null;
    // Create combined view data (use centralized mapping)
    let combinedData = plannedTransactions.map(planned => {
      // Find matching actual transaction
      const actualTx = allActual.find(a => a.plannedId === planned.id);

      // Use centralized mapping helper to determine transactionType/secondaryAccount
      const mapped = mapTxToUI(planned, selectedAccountId);
      if (selectedAccountId && !mapped) return null; // filtered out

      const transactionType = mapped ? mapped.transactionType : { id: 1, name: 'Debit' };
      const secondaryAccount = mapped ? mapped.secondaryAccount : planned.creditAccount;

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
    }).filter(row => row !== null);

    // Add standalone actual transactions (not linked to planned)
    const standaloneActual = allActual.filter(actual => !actual.plannedId).map(actual => {
      // For standalone actual transactions, we need to map them to UI format
      // This is more complex as we need to determine transaction type from debit/credit accounts
      const mapped = mapTxToUI({
        debitAccount: actual.debitAccount,
        creditAccount: actual.creditAccount,
        amount: actual.amount,
        description: actual.description
      }, selectedAccountId);
      
      if (selectedAccountId && !mapped) return null; // filtered out

      return {
        plannedId: null,
        actualId: actual.id,
        executed: true, // standalone actuals are always "executed"
        transactionType: mapped ? mapped.transactionType : { id: 1, name: 'Debit' },
        secondaryAccount: mapped ? mapped.secondaryAccount : actual.creditAccount,
        plannedAmount: 0, // no planned amount
        actualAmount: actual.amount,
        variance: actual.amount, // variance is the actual amount since no planned
        plannedDate: actual.actualDate,
        actualDate: actual.actualDate,
        description: actual.description,
        debitAccount: actual.debitAccount,
        creditAccount: actual.creditAccount
      };
    }).filter(row => row !== null);

    combinedData = [...combinedData, ...standaloneActual];

    // Get the grid container
    const gridContainer = document.getElementById('actualTransactionsTable');
    if (!gridContainer) return;
    
    gridContainer.innerHTML = '';

    // Add "Add Actual" button
    const addButton = document.createElement('button');
    addButton.className = 'btn btn-primary btn-add';
    addButton.textContent = '+ Add New';
    console.log('Add button created:', addButton);
    addButton.addEventListener('click', async () => {
      console.log('Add New button clicked');
      try {
        // Determine accounts for the new transaction
        let debitAccount = null;
        let creditAccount = null;
        if (selectedAccountId) {
          // If account selected, debit from selected, credit to first other account
          debitAccount = { id: Number(selectedAccountId) };
          const otherAccounts = currentScenario.accounts?.filter(a => a.id !== Number(selectedAccountId)) || [];
          if (otherAccounts.length > 0) {
            creditAccount = { id: otherAccounts[0].id };
          }
        } else {
          // If no account selected, use first two accounts
          if (currentScenario.accounts && currentScenario.accounts.length >= 2) {
            debitAccount = { id: currentScenario.accounts[0].id };
            creditAccount = { id: currentScenario.accounts[1].id };
          }
        }

        // Add a new manual actual transaction (not linked to planned)
        const newActual = {
          plannedId: null,
          debitAccount: debitAccount,
          creditAccount: creditAccount,
          amount: 0,
          actualDate: formatDateOnly(new Date()),
          description: '',
          tags: []
        };
        console.log('Created new transaction:', newActual);
        const allActual = await TransactionManager.getAllActual(currentScenario.id);
        console.log('Existing transactions:', allActual.length);
        await TransactionManager.saveActual(currentScenario.id, [...allActual, newActual]);
        console.log('Transaction saved, reloading grid...');
        
        // Reload the grid to show the new transaction
        await loadActualTransactionsGrid(container);
        console.log('Grid reloaded');
      } catch (error) {
        console.error('Error adding new transaction:', error);
      }
    });
    window.add(gridContainer, addButton);
    console.log('Add button added to container');

    // Create separate container for the actual grid
    const tableContainer = document.createElement('div');
    tableContainer.classList.add('grid-container', 'projections-grid');
    window.add(gridContainer, tableContainer);

    const actualTxTable = createGrid(tableContainer, {
      data: combinedData,
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
              if (rowData.actualId && (rowData.plannedId == null || rowData.executed)) {
                if (confirm('Delete this actual transaction?')) {
                  const allActual = await TransactionManager.getAllActual(currentScenario.id);
                  const filtered = allActual.filter(tx => tx.id !== rowData.actualId);
                  await TransactionManager.saveActual(currentScenario.id, filtered);
                  await loadActualTransactionsGrid(container);
                }
              }
            } catch (err) { console.error('Delete actual tx failed', err); }
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
          return;
        }

        // Determine debit/credit accounts
        let debitAccount, creditAccount;
        if (rowData.transactionType?.name === 'Money Out') {
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

      }
    });

    // Calculate and display totals
    const plannedCredits = combinedData.reduce((sum, row) => {
      if (row.transactionType?.name === 'Money In') {
        return sum + (parseFloat(row.plannedAmount) || 0);
      }
      return sum;
    }, 0);
    const plannedDebits = combinedData.reduce((sum, row) => {
      if (row.transactionType?.name === 'Money Out') {
        return sum + (parseFloat(row.plannedAmount) || 0);
      }
      return sum;
    }, 0);
    const plannedBalance = plannedCredits - plannedDebits;

    const actualCredits = combinedData.reduce((sum, row) => {
      if (row.transactionType?.name === 'Money In') {
        return sum + (parseFloat(row.actualAmount) || 0);
      }
      return sum;
    }, 0);
    const actualDebits = combinedData.reduce((sum, row) => {
      if (row.transactionType?.name === 'Money Out') {
        return sum + (parseFloat(row.actualAmount) || 0);
      }
      return sum;
    }, 0);
    const actualBalance = actualCredits - actualDebits;

    // Update summary elements
    const formatCurrency = (value) => {
      const formatted = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
      const cls = value >= 0 ? 'status-netchange positive' : 'status-netchange negative';
      return `<span class="${cls}">${formatted}</span>`;
    };
    document.getElementById('planned-credits').innerHTML = `Money In: ${formatCurrency(plannedCredits)}`;
    document.getElementById('planned-debits').innerHTML = `Money Out: ${formatCurrency(-plannedDebits)}`;
    document.getElementById('planned-balance').innerHTML = `Balance: ${formatCurrency(plannedBalance)}`;
    document.getElementById('actual-credits').innerHTML = `Money In: ${formatCurrency(actualCredits)}`;
    document.getElementById('actual-debits').innerHTML = `Money Out: ${formatCurrency(-actualDebits)}`;
    document.getElementById('actual-balance').innerHTML = `Balance: ${formatCurrency(actualBalance)}`;

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
