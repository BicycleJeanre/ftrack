// forecast.js
// Manages the Forecast page with scenario-centric model
// Displays accounts, planned transactions, actual transactions, and projections based on scenario type

console.log('forecast.js loaded at', new Date().toISOString());

import { getSchemaPath, getAppDataPath } from './app-paths.js';

import { createGrid, createSelectorColumn, createTextColumn, createObjectColumn, createDateColumn, createMoneyColumn, createListEditor, formatMoneyDisplay } from './grid-factory.js';
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
import { generateRecurrenceDates } from './calculation-utils.js';
import { expandTransactions } from './transaction-expander.js';

// Generate human-readable recurrence description from recurrence object
function getRecurrenceDescription(recurrence) {
  if (!recurrence || !recurrence.recurrenceType) return '';

  const typeId = recurrence.recurrenceType.id;
  const interval = recurrence.interval && recurrence.interval > 1 ? recurrence.interval : 1;
  const end = recurrence.endDate ? ` until ${recurrence.endDate}` : '';

  const getWeekday = () => {
    if (recurrence.dayOfWeek?.name) return recurrence.dayOfWeek.name;
    if (recurrence.startDate) {
      const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const d = new Date(recurrence.startDate);
      return weekdayNames[d.getUTCDay()];
    }
    return null;
  };

  const getDayOfMonth = () => {
    if (recurrence.dayOfMonth) return recurrence.dayOfMonth;
    if (recurrence.startDate) return new Date(recurrence.startDate).getUTCDate();
    return null;
  };

  const formatYearlyAnchor = () => {
    if (!recurrence.startDate) return null;
    const d = new Date(recurrence.startDate);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}`;
  };

  // Descriptions per recurrence type
  switch (typeId) {
    case 1: // One Time
      return recurrence.startDate ? `One time on ${recurrence.startDate}` : 'One time';
    case 2: // Daily
      return interval === 1 ? `Every day${end}` : `Every ${interval} days${end}`;
    case 3: { // Weekly
      const dow = getWeekday();
      const dayPart = dow ? ` on ${dow}` : '';
      return interval === 1 ? `Every week${dayPart}${end}` : `Every ${interval} weeks${dayPart}${end}`;
    }
    case 4: { // Monthly - Day of Month
      const dom = getDayOfMonth();
      const dayPart = dom ? ` on day ${dom}` : '';
      return interval === 1 ? `Every month${dayPart}${end}` : `Every ${interval} months${dayPart}${end}`;
    }
    case 5: { // Monthly - Week of Month (fallback wording)
      const dow = getWeekday();
      const week = recurrence.weekOfMonth ? `${recurrence.weekOfMonth} week` : 'week';
      const dayPart = dow ? ` on ${dow}` : '';
      return interval === 1 ? `Every month (${week}${dayPart})${end}` : `Every ${interval} months (${week}${dayPart})${end}`;
    }
    case 6: { // Quarterly
      const dom = getDayOfMonth();
      const dayPart = dom ? ` on day ${dom}` : '';
      return interval === 1 ? `Every quarter${dayPart}${end}` : `Every ${interval} quarters${dayPart}${end}`;
    }
    case 7: { // Yearly
      const anchor = formatYearlyAnchor();
      const dayPart = anchor ? ` on ${anchor}` : '';
      return interval === 1 ? `Every year${dayPart}${end}` : `Every ${interval} years${dayPart}${end}`;
    }
    case 11: { // Custom Dates
      const count = recurrence.customDates ? recurrence.customDates.split(',').filter(Boolean).length : 0;
      return count > 0 ? `Custom: ${count} dates` : 'Custom dates';
    }
    default:
      return recurrence.recurrenceType.name || 'Recurring';
  }
}

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
let budgetPeriod = null; // Selected period for budget view
let periods = []; // Calculated periods for current scenario
let budgetGridLoadToken = 0; // Prevent stale budget renders

// Shared helper: compute Money In / Money Out totals and net using signed amounts
function computeMoneyTotals(rows, opts = {}) {
  const amountField = opts.amountField || 'amount';
  const typeField = opts.typeField || 'transactionType';
  const typeNameField = opts.typeNameField || 'transactionTypeName';
  const typeIdField = opts.typeIdField || 'transactionTypeId';

  return rows.reduce((acc, row) => {
    const amount = Number(row?.[amountField] || 0);
    const typeObj = row?.[typeField];
    const name = typeObj?.name || row?.[typeNameField] || '';
    const id = typeObj?.id ?? row?.[typeIdField];
    const isMoneyOut = name === 'Money Out' || id === 2 || amount < 0;
    const absAmount = Math.abs(amount);

    if (isMoneyOut) {
      acc.moneyOut += absAmount;
    } else {
      acc.moneyIn += absAmount;
    }

    // Net uses the signed amount (Money Out should already be negative)
    acc.net += amount;
    return acc;
  }, { moneyIn: 0, moneyOut: 0, net: 0 });
}

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

  // Period filter controls
  const periodFilter = document.createElement('div');
  periodFilter.className = 'mb-sm period-filter control-layout-wrap';
  periodFilter.innerHTML = `
     <label for="actual-period-select" class="text-muted control-label">Period:</label>
     <select id="actual-period-select" class="input-select control-select"></select>
     <button id="actual-prev-period-btn" class="btn btn-ghost control-button" title="Previous Period">&#9664;</button>
     <button id="actual-next-period-btn" class="btn btn-ghost control-button" title="Next Period">&#9654;</button>
  `;
  window.add(transactionsContent, periodFilter);

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
    transactionType: tx.transactionType || (tx.transactionTypeId === 1 ? { id: 1, name: 'Money In' } : { id: 2, name: 'Money Out' }),
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

  const isSelectedDebit = Number(tx.debitAccount?.id) === selIdNum;
  const isSelectedCredit = Number(tx.creditAccount?.id) === selIdNum;
  if (!isSelectedDebit && !isSelectedCredit) return null;

  const secondaryAccountRef = isSelectedDebit ? tx.creditAccount : tx.debitAccount;
  const secondaryAccount = secondaryAccountRef
    ? currentScenario.accounts?.find(a => a.id === secondaryAccountRef.id) || secondaryAccountRef
    : null;

  const transactionType = isSelectedDebit ? { id: 2, name: 'Money Out' } : { id: 1, name: 'Money In' };
  return { transactionType, secondaryAccount };
}

/**
 * Transform actual transaction from UI back to backend format (same as planned transactions)
 */
async function transformActualTxForBackend(tx, selectedAccountId) {
  const isDebit = tx.transactionType?.id === 2 || tx.transactionType?.name === 'Money Out';
  
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
        startingBalance: 0
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

        // Add grouping control
        const accountGroupingControl = document.createElement('div');
        accountGroupingControl.className = 'mb-sm grouping-control';
        accountGroupingControl.innerHTML = `
            <label for="account-grouping-select" class="text-muted control-label">Group By:</label>
            <select id="account-grouping-select" class="input-select control-select">
            <option value="">None</option>
            <option value="accountType">Type</option>
          </select>
        `;
        window.add(container, accountGroupingControl);


    // Add accountType field for grouping
    const enrichedAccounts = displayAccounts.map(a => ({
      ...a,
      accountType: a.type?.name || 'Unknown'
    }));

    // Mount grid container before initializing Tabulator so layout can measure dimensions
    window.add(container, gridContainer);

    const accountsTable = createGrid(gridContainer, {
      data: enrichedAccounts,
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

        createMoneyColumn('Starting Balance', 'startingBalance', { widthGrow: 1 })
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
          console.log('[Accounts] Account selected:', account.id, account.name);
          selectedAccountId = Number(account.id);
          console.log('[Accounts] Updated selectedAccountId to:', selectedAccountId);
          // Reload immediately to ensure budget grid updates
          await loadMasterTransactionsGrid(getEl('transactionsTable'));
          await loadBudgetGrid(getEl('budgetTable'));
          // Also refresh Projections as they might depend on the account filter (future proofing)
          await loadProjectionsSection(getEl('projectionsContent'));
        } else {
          // No account selected
          console.log('[Accounts] Clearing account selection');
          selectedAccountId = null;
          // Reload downstream grids in unfiltered mode
          await loadMasterTransactionsGrid(getEl('transactionsTable'));
          await loadBudgetGrid(getEl('budgetTable'));
          await loadProjectionsSection(getEl('projectionsContent'));
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
        const accountIdNum = Number(account.id);
        if (selectedAccountId !== accountIdNum) {
          selectedAccountId = accountIdNum;
          setTimeout(async () => {
            await loadMasterTransactionsGrid(document.getElementById('transactionsTable'));
            await loadBudgetGrid(getEl('budgetTable'));
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
          await loadMasterTransactionsGrid(document.getElementById('transactionsTable'));
          await loadBudgetGrid(getEl('budgetTable'));
          await loadProjectionsSection(document.getElementById('projectionsContent'));
        }
      } catch (e) { logger.error('[AccountsGrid] fallback rowDeselected handler error:', e); }
    });

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
          accountsTable.clearGroupBy();
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
    try {
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
  window.add(container, addButtonContainer);

  // Add grouping control
  const groupingControl = document.createElement('div');
  groupingControl.className = 'mb-sm grouping-control';
  groupingControl.innerHTML = `
      <label for="tx-grouping-select" class="text-muted control-label">Group By:</label>
        <select id="tx-grouping-select" class="input-select control-select">
      <option value="">None</option>
      <option value="transactionTypeName">Type (Money In/Out)</option>
      <option value="recurrenceSummary">Recurrence Period</option>
      <option value="primaryAccountName">Account</option>
    </select>
  `;
  window.add(container, groupingControl);

  const gridContainer = document.createElement('div');
  gridContainer.className = 'grid-container master-transactions-grid';
  window.add(container, gridContainer);

  // Show primary account column only when not filtered by a single account
  const showPrimaryColumn = !selIdNum;
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

    // Transform for UI
    const transformedData = allTransactions.map(tx => {
      // Use centralized mapping helper to determine transactionType/secondaryAccount when filtered
      const mapped = mapTxToUI(tx, selectedAccountId);
      
      // Derive transaction type from explicit id/name when not filtered
      const txTypeId = mapped?.transactionType?.id
        || tx.transactionTypeId
        || tx.transactionType?.id
        || (tx.transactionType?.name === 'Money In' ? 1 : (tx.transactionType?.name === 'Money Out' ? 2 : null));
      const transactionType = mapped?.transactionType
        || (txTypeId === 1 ? { id: 1, name: 'Money In' } : { id: 2, name: 'Money Out' });

      // Secondary account resolution when not filtered: Money In -> debitAccount (secondary), Money Out -> creditAccount (secondary)
      const secondaryAccount = mapped?.secondaryAccount
        || (transactionType.id === 1 ? tx.debitAccount : tx.creditAccount);

      // Primary account resolution when not filtered: Money Out -> debitAccount (primary), Money In -> creditAccount (primary)
      const primaryAccount = mapped?.primaryAccount
        || (transactionType.name === 'Money Out' ? tx.debitAccount : tx.creditAccount);

      // Handle status as object or string
      const statusName = typeof tx.status === 'object' ? tx.status.name : tx.status;
      const actualAmount = typeof tx.status === 'object' ? tx.status.actualAmount : tx.actualAmount;
      const actualDate = typeof tx.status === 'object' ? tx.status.actualDate : tx.actualDate;
      
      // Display date: only show occurrence date when a specific period is selected; blank for all-period view
      const displayDate = actualPeriod
        ? (statusName === 'actual' && actualDate ? actualDate : tx.effectiveDate)
        : '';

      const recurrenceSummary = getRecurrenceDescription(tx.recurrence);

      return {
        id: tx.id,
        transactionTypeId: txTypeId,
        status: statusName || 'planned',
        amount: statusName === 'actual' && actualAmount !== undefined ? actualAmount : tx.amount,
        plannedAmount: tx.amount,
        actualAmount: actualAmount,
        effectiveDate: tx.effectiveDate,
        plannedDate: tx.effectiveDate,
        actualDate: actualDate,
        displayDate,
        description: tx.description,
        debitAccount: tx.debitAccount,
        creditAccount: tx.creditAccount,
        primaryAccount,
        primaryAccountName: primaryAccount?.name || '',
        transactionType,
        transactionTypeName: transactionType?.name || '',
        secondaryAccount,
        recurrence: tx.recurrence,
        recurrenceDescription: recurrenceSummary,
        recurrenceSummary,
        tags: tx.tags || []
      };
    }).filter(tx => {
      // Always show transactions with no accounts (incomplete/newly created)
      if (!tx.debitAccount && !tx.creditAccount) {
        return true;
      }
      // If no account filter selected, show all
      if (!selIdNum) {
        return true;
      }
      // Otherwise filter by selected account
      return Number(tx.debitAccount?.id) === selIdNum ||
             Number(tx.creditAccount?.id) === selIdNum;
    });

    // Compute filtered totals for current transactions view
    const txTotals = computeMoneyTotals(transformedData, {
      amountField: 'amount',
      typeField: 'transactionType',
      typeNameField: 'transactionTypeName',
      typeIdField: 'transactionTypeId'
    });

    const txTotalsBar = document.createElement('div');
    txTotalsBar.className = 'grid-totals';
    const formatCurrency = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    txTotalsBar.innerHTML = `
      <div class="grid-total-item">
        <div class="label">Money In</div>
        <div class="value positive">${formatCurrency(txTotals.moneyIn)}</div>
      </div>
      <div class="grid-total-item">
        <div class="label">Money Out</div>
        <div class="value negative">${formatCurrency(txTotals.moneyOut)}</div>
      </div>
      <div class="grid-total-item">
        <div class="label">Net</div>
        <div class="value ${txTotals.net >= 0 ? 'positive' : 'negative'}">${formatCurrency(txTotals.net)}</div>
      </div>
    `;
    container.insertBefore(txTotalsBar, gridContainer);

    const masterTxTable = createGrid(gridContainer, {
      data: transformedData,
      headerWordWrap: false, // Prevent header text wrapping
      autoResize: true, // Enable auto-resize on window changes
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
        ...(showPrimaryColumn ? [{
          title: "Primary Account",
          field: "primaryAccount",
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
        }] : []),
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
        ...(showDateColumn ? [createDateColumn('Date', 'displayDate', { minWidth: 110, widthGrow: 1 })] : []),
        createTextColumn('Description', 'description', { minWidth: 150, widthGrow: 3 })
      ],
      cellEdited: async function(cell) {
        const rowData = cell.getRow().getData();
        const field = cell.getColumn().getField();
        const newValue = cell.getValue();
        console.log('[TransactionsGrid] cellEdited start', { field, newValue, rowId: rowData.id });

        const normalizeForSave = (tx) => {
          const typeName = tx.transactionType?.name
            || (tx.transactionTypeId === 1 ? 'Money In' : 'Money Out');
          const transactionTypeId = tx.transactionType?.id
            ?? tx.transactionTypeId
            ?? (typeName === 'Money In' ? 1 : 2);

          let primaryAccountId = null;
          let secondaryAccountId = null;

          if (transactionTypeId === 1) {
            // Money In: secondary -> primary
            secondaryAccountId = tx.debitAccount?.id ?? tx.secondaryAccountId ?? null;
            primaryAccountId = tx.creditAccount?.id ?? tx.primaryAccountId ?? null;
            if (!tx.debitAccount && secondaryAccountId) tx.debitAccount = { id: secondaryAccountId };
            if (!tx.creditAccount && primaryAccountId) tx.creditAccount = { id: primaryAccountId };
          } else {
            // Money Out: primary -> secondary
            primaryAccountId = tx.debitAccount?.id ?? tx.primaryAccountId ?? null;
            secondaryAccountId = tx.creditAccount?.id ?? tx.secondaryAccountId ?? null;
            if (!tx.debitAccount && primaryAccountId) tx.debitAccount = { id: primaryAccountId };
            if (!tx.creditAccount && secondaryAccountId) tx.creditAccount = { id: secondaryAccountId };
          }

          return {
            ...tx,
            transactionType: { id: transactionTypeId, name: transactionTypeId === 1 ? 'Money In' : 'Money Out' },
            transactionTypeId,
            primaryAccountId,
            secondaryAccountId,
          };
        };

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

                // Update the transaction with the new account
                const allTxs = await getTransactions(currentScenario.id);
                const txIndex = allTxs.findIndex(tx => tx.id === rowData.id);
                if (txIndex >= 0) {
                  if (field === 'primaryAccount') {
                    allTxs[txIndex].debitAccount = newAccount;
                  } else {
                    allTxs[txIndex].secondaryAccount = { id: newAccount.id, name: newAccount.name };
                  }
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

          // Normalize amount sign based on transaction type
          if (field === 'amount') {
            const txType = updatedTx.transactionType?.name || rowData.transactionType?.name;
            const absAmount = Math.abs(newValue);
            if (txType === 'Money Out') {
              updatedTx.amount = -absAmount; // Money Out is always negative
            } else if (txType === 'Money In') {
              updatedTx.amount = absAmount; // Money In is always positive
            }
          }

          // If transaction type changed, normalize amount sign
          if (field === 'transactionType') {
            const currentAmount = updatedTx.amount || allTxs[txIndex].amount || 0;
            const absAmount = Math.abs(currentAmount);
            if (newValue?.name === 'Money Out') {
              updatedTx.amount = -absAmount;
            } else if (newValue?.name === 'Money In') {
              updatedTx.amount = absAmount;
            }
          }

          // Determine current primary/secondary to preserve intent in unfiltered mode
          const currentPrimary = rowData.primaryAccount
            || (rowData.transactionType?.name === 'Money Out' ? rowData.debitAccount || updatedTx.debitAccount : rowData.creditAccount || updatedTx.creditAccount);
          const currentSecondary = rowData.secondaryAccount
            || (rowData.transactionType?.name === 'Money Out' ? rowData.creditAccount || updatedTx.creditAccount : rowData.debitAccount || updatedTx.debitAccount);

          // If transaction type changed, update debit/credit accounts accordingly
          if (field === 'transactionType') {
            const secondaryAccount = rowData.secondaryAccount || updatedTx.secondaryAccount;

            if (selectedAccountId) {
              const selectedAccount = currentScenario.accounts?.find(a => a.id === Number(selectedAccountId));
              if (newValue?.name === 'Money Out') {
                // Money Out: selected account is debit, secondary is credit
                updatedTx.debitAccount = selectedAccount ? { id: selectedAccount.id } : null;
                updatedTx.creditAccount = secondaryAccount ? { id: secondaryAccount.id } : null;
              } else if (newValue?.name === 'Money In') {
                // Money In: selected account is credit, secondary is debit
                updatedTx.debitAccount = secondaryAccount ? { id: secondaryAccount.id } : null;
                updatedTx.creditAccount = selectedAccount ? { id: selectedAccount.id } : null;
              }
            } else {
              // Unfiltered view: preserve current primary/secondary by mapping type
              if (newValue?.name === 'Money Out') {
                updatedTx.debitAccount = currentPrimary ? { id: currentPrimary.id } : null;
                updatedTx.creditAccount = currentSecondary ? { id: currentSecondary.id } : null;
              } else if (newValue?.name === 'Money In') {
                updatedTx.debitAccount = currentSecondary ? { id: currentSecondary.id } : null;
                updatedTx.creditAccount = currentPrimary ? { id: currentPrimary.id } : null;
              }
            }
          }

          // If secondary account changed, update debit/credit accounts accordingly
          if (field === 'secondaryAccount') {
            const transactionType = updatedTx.transactionType;

            if (selectedAccountId) {
              const selectedAccount = currentScenario.accounts?.find(a => a.id === Number(selectedAccountId));
              if (transactionType?.name === 'Money Out') {
                // Money Out: selected account is debit, secondary is credit
                updatedTx.debitAccount = selectedAccount ? { id: selectedAccount.id } : null;
                updatedTx.creditAccount = newValue ? { id: newValue.id } : null;
              } else if (transactionType?.name === 'Money In') {
                // Money In: selected account is credit, secondary is debit
                updatedTx.debitAccount = newValue ? { id: newValue.id } : null;
                updatedTx.creditAccount = selectedAccount ? { id: selectedAccount.id } : null;
              }
            } else {
              // Unfiltered view: update based on transaction type
              if (transactionType?.name === 'Money Out') {
                updatedTx.debitAccount = currentPrimary ? { id: currentPrimary.id } : null;
                updatedTx.creditAccount = newValue ? { id: newValue.id } : null;
              } else if (transactionType?.name === 'Money In') {
                updatedTx.creditAccount = currentPrimary ? { id: currentPrimary.id } : null;
                updatedTx.debitAccount = newValue ? { id: newValue.id } : null;
              }
            }
          }

          // If primary account changed (only shown in unfiltered mode), update debit/credit based on type
          if (field === 'primaryAccount' && !selectedAccountId) {
            const transactionType = updatedTx.transactionType;
            const secondaryAccount = rowData.secondaryAccount || updatedTx.secondaryAccount;

            if (transactionType?.name === 'Money Out') {
              updatedTx.debitAccount = newValue ? { id: newValue.id } : null;
              updatedTx.creditAccount = secondaryAccount ? { id: secondaryAccount.id } : null;
            } else if (transactionType?.name === 'Money In') {
              updatedTx.creditAccount = newValue ? { id: newValue.id } : null;
              updatedTx.debitAccount = secondaryAccount ? { id: secondaryAccount.id } : null;
            }
          }

          allTxs[txIndex] = normalizeForSave(updatedTx);
          console.log('[TransactionsGrid] saveAll ->', { txId: updatedTx.id, field, updatedTx: allTxs[txIndex] });
          await TransactionManager.saveAll(currentScenario.id, allTxs);
          console.log('[TransactionsGrid] saveAll complete', { txId: updatedTx.id });
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
          masterTxTable.setGroupBy(groupField);
          // Add groupHeader with sum for grouped field
          masterTxTable.setGroupHeader((value, count, data, group) => {
            const totalAmount = data.reduce((sum, row) => sum + Number(row.amount || 0), 0);
            const label = formatGroupLabel(value);
            const formatted = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(totalAmount);
            return `${label} (${count} items, Total: ${formatted})`;
          });
        } else {
          masterTxTable.clearGroupBy();
        }
      });
    }

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

  const loadToken = ++budgetGridLoadToken;
  const selectedAccountIdSnapshot = selectedAccountId;
  const budgetPeriodSnapshot = budgetPeriod;
  const selIdNum = selectedAccountIdSnapshot != null ? Number(selectedAccountIdSnapshot) : null;

  console.log('[Budget] loadBudgetGrid start', { loadToken, selectedAccountId: selectedAccountIdSnapshot, budgetPeriod: budgetPeriodSnapshot });

  container.innerHTML = '';

  try {
    // Get budget occurrences
    let budgetOccurrences = await getBudget(currentScenario.id);

    // Abort if a newer load kicked off while we were waiting
    if (loadToken !== budgetGridLoadToken) {
      console.log('[Budget] loadBudgetGrid stale run skipped', { loadToken, latest: budgetGridLoadToken });
      return;
    }

    // Add section header
    const sectionHeader = document.createElement('h3');
    sectionHeader.className = 'text-main section-header';
    if (selIdNum) {
      const selectedAccount = currentScenario.accounts?.find(a => a.id === selIdNum);
      sectionHeader.textContent = `Budget - Filtered by: ${selectedAccount?.name || 'Unknown Account'}`;
    } else {
      sectionHeader.textContent = 'Budget - All Accounts';
    }
    window.add(container, sectionHeader);

    // Add budget action buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'mb-sm';
    
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
          primaryAccountId: selIdNum || null, // Use selected account as primary
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
    
    window.add(container, buttonContainer);

    // Add period filter controls (similar to transactions)
    const periodFilter = document.createElement('div');
    periodFilter.className = 'mb-sm period-filter control-layout-wrap';
    periodFilter.innerHTML = `
        <label for="budget-period-select" class="text-muted control-label">Period:</label>
      <select id="budget-period-select" class="input-select control-select"></select>
        <button id="budget-prev-period-btn" class="btn btn-ghost control-button" title="Previous Period">&#9664;</button>
        <button id="budget-next-period-btn" class="btn btn-ghost control-button" title="Next Period">&#9654;</button>
    `;
    window.add(container, periodFilter);

    // Populate budget period dropdown
    const budgetPeriodSelect = document.getElementById('budget-period-select');
    budgetPeriodSelect.innerHTML = '<option value="">-- All Periods --</option>';
    periods.forEach((period) => {
      const option = document.createElement('option');
      option.value = period.id;
      option.textContent = period.label || `${period.startDate?.toISOString?.().slice(0,10) || ''} to ${period.endDate?.toISOString?.().slice(0,10) || ''}`;
      budgetPeriodSelect.appendChild(option);
    });
    
    // Set current selection if any
    budgetPeriodSelect.value = budgetPeriodSnapshot || '';
    
    // Attach period selector event listeners
    budgetPeriodSelect.addEventListener('change', async (e) => {
      budgetPeriod = e.target.value;
      await loadBudgetGrid(container);
    });
    
    document.getElementById('budget-prev-period-btn').addEventListener('click', async () => {
      const currentIndex = periods.findIndex(p => p.id === budgetPeriod);
      if (currentIndex > 0) {
        budgetPeriod = periods[currentIndex - 1].id;
        budgetPeriodSelect.value = budgetPeriod;
        await loadBudgetGrid(container);
      }
    });
    
    document.getElementById('budget-next-period-btn').addEventListener('click', async () => {
      const currentIndex = periods.findIndex(p => p.id === budgetPeriod);
      if (currentIndex < periods.length - 1) {
        budgetPeriod = periods[currentIndex + 1].id;
        budgetPeriodSelect.value = budgetPeriod;
        await loadBudgetGrid(container);
      }
    });

    // Transform budgets for UI (resolve IDs to full objects) - mirror transactions grid
    const transformedData = budgetOccurrences.map(budget => {
      const primaryAccount = currentScenario.accounts?.find(a => a.id === budget.primaryAccountId);
      const secondaryAccount = currentScenario.accounts?.find(a => a.id === budget.secondaryAccountId);
      
      // Map to UI format based on transaction type
      // transactionTypeId: 1 = Money In (secondary -> primary), 2 = Money Out (primary -> secondary)
      const debitAccount = budget.transactionTypeId === 1 ? secondaryAccount : primaryAccount;
      const creditAccount = budget.transactionTypeId === 1 ? primaryAccount : secondaryAccount;
      const statusObj = typeof budget.status === 'object' ? budget.status : { name: budget.status, actualAmount: null, actualDate: null };
      
      // Get source transaction to extract recurrence for description
      const sourceTransaction = budget.sourceTransactionId 
        ? currentScenario.transactions?.find(tx => tx.id === budget.sourceTransactionId)
        : null;
      const recurrenceSummary = sourceTransaction?.recurrence 
        ? getRecurrenceDescription(sourceTransaction.recurrence)
        : (budget.recurrenceDescription || 'One time');
      
      const transactionTypeName = budget.transactionTypeId === 1 ? 'Money In' : 'Money Out';
      const primaryAccountResolved = debitAccount?.id === primaryAccount?.id ? primaryAccount : creditAccount;

      return {
        id: budget.id,
        sourceTransactionId: budget.sourceTransactionId,
        plannedAmount: budget.amount,
        actualAmount: statusObj.actualAmount,
        amount: statusObj.actualAmount !== null && statusObj.actualAmount !== undefined ? statusObj.actualAmount : budget.amount,
        description: budget.description,
        debitAccount: debitAccount || null,
        creditAccount: creditAccount || null,
        primaryAccount: primaryAccountResolved,
        primaryAccountName: primaryAccountResolved?.name || '',
        secondaryAccount: secondaryAccount || null,
        transactionType: { id: budget.transactionTypeId, name: transactionTypeName },
        transactionTypeName,
        occurrenceDate: budget.occurrenceDate,
        recurrenceDescription: recurrenceSummary,
        status: statusObj,
        actualDateOverride: statusObj.actualDate
      };
    }).filter(budget => {
      console.log('[Budget] Filter:', { selectedAccountId: selectedAccountIdSnapshot, budgetPeriod: budgetPeriodSnapshot, loadToken });
      // Filter by account if selected
      if (selIdNum) {
        const matches = [
          budget.debitAccount?.id,
          budget.creditAccount?.id,
          budget.primaryAccountId,
          budget.secondaryAccountId
        ].some(id => Number(id) === selIdNum);
        console.log('[Budget] Filtering budget', budget.id, '- debit:', budget.debitAccount?.id, 'credit:', budget.creditAccount?.id, 'primaryId:', budget.primaryAccountId, 'secondaryId:', budget.secondaryAccountId, 'selected:', selIdNum, 'matches:', matches, 'loadToken:', loadToken);
        if (!matches) return false;
      }
      
      // Filter by period if selected
      if (budgetPeriodSnapshot) {
        const selectedPeriod = periods.find(p => p.id === budgetPeriodSnapshot);
        if (selectedPeriod) {
          const budgetDate = new Date(budget.occurrenceDate);
          const periodStart = new Date(selectedPeriod.startDate);
          const periodEnd = new Date(selectedPeriod.endDate);
          // Adjust end date to be inclusive (end of day)
          periodEnd.setHours(23, 59, 59, 999);
          if (budgetDate < periodStart || budgetDate > periodEnd) {
            return false;
          }
        }
      }
      return true;
    });

    // Skip render if this run is no longer the latest
    if (loadToken !== budgetGridLoadToken) {
      console.log('[Budget] loadBudgetGrid skipped render for stale run', { loadToken, latest: budgetGridLoadToken });
      return;
    }

    // Show/hide primary account column (only when not filtered by account)
    const showPrimaryColumnBudget = !selIdNum;
    
    // Always show date column - it's essential for budget tracking and planning
    const showBudgetDateColumn = true;

    // Show empty message if no budget data to display
    if (transformedData.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'text-muted';
      emptyMsg.textContent = 'No budget entries found. Click "Add New Entry" to create one.';
      window.add(container, emptyMsg);
      return;
    }

    // Compute filtered totals (money in/out) for the current view
      const budgetTotals = computeMoneyTotals(transformedData, {
        amountField: 'amount',
        typeField: 'transactionType',
        typeNameField: 'transactionTypeName',
        typeIdField: 'transactionTypeId'
      });

    // Render totals summary above the grid
    const budgetTotalsBar = document.createElement('div');
    budgetTotalsBar.className = 'grid-totals';
    const formatCurrency = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    budgetTotalsBar.innerHTML = `
      <div class="grid-total-item">
        <div class="label">Money In</div>
        <div class="value positive">${formatCurrency(budgetTotals.moneyIn)}</div>
      </div>
      <div class="grid-total-item">
        <div class="label">Money Out</div>
        <div class="value negative">${formatCurrency(budgetTotals.moneyOut)}</div>
      </div>
      <div class="grid-total-item">
        <div class="label">Net</div>
        <div class="value ${budgetTotals.net >= 0 ? 'positive' : 'negative'}">${formatCurrency(budgetTotals.net)}</div>
      </div>
    `;
    window.add(container, budgetTotalsBar);

    // Add grouping control
    const groupingControl = document.createElement('div');
    groupingControl.className = 'mb-sm grouping-control';
    groupingControl.innerHTML = `
      <label for="budget-grouping-select" class="text-muted control-label">Group By:</label>
      <select id="budget-grouping-select" class="input-select control-select">
        <option value="">None</option>
        <option value="transactionTypeName">Type (Money In/Out)</option>
        <option value="recurrenceDescription">Recurrence Period</option>
        <option value="primaryAccountName">Account</option>
      </select>
    `;
    window.add(container, groupingControl);

    // Create grid container
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid-container budget-grid';
    window.add(container, gridContainer);

    const budgetTable = createGrid(gridContainer, {
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
        ...(showPrimaryColumnBudget ? [{
          title: "Primary Account",
          field: "primaryAccount",
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
        }] : []),
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
        createMoneyColumn('Planned Amount', 'plannedAmount', { minWidth: 100, widthGrow: 1 }),
        ...(showBudgetDateColumn ? [createDateColumn('Date', 'occurrenceDate', { minWidth: 110, widthGrow: 1 })] : []),
        {
          title: "Schedule",
          field: "recurrenceDescription",
          minWidth: 170,
          widthGrow: 1.2,
          formatter: function(cell) {
            return cell.getValue() || 'One time';
          }
        },
        createTextColumn('Description', 'description', { minWidth: 150, widthGrow: 3 }),
        {
          title: "Status",
          field: "status",
          minWidth: 100,
          widthGrow: 1,
          formatter: function(cell) {
            const rowData = cell.getRow().getData();
            const status = rowData.status;
            const statusName = typeof status === 'object' ? status?.name : status;
            return statusName === 'actual' ? 'Actual' : 'Planned';
          },
          cellClick: async function(e, cell) {
            const rowData = cell.getRow().getData();
            openStatusModal(rowData, async (updates) => {
              // Update budget occurrence with actual amount and date
              const allBudgets = await getBudget(currentScenario.id);
              const budgetIndex = allBudgets.findIndex(b => b.id === rowData.id);
              if (budgetIndex >= 0) {
                const updatedBudget = { ...allBudgets[budgetIndex] };
                
                // Normalize budget for save
                const normalizeBudgetForSave = (budget) => {
                  const typeName = budget.transactionType?.name || 'Money Out';
                  const typeId = budget.transactionType?.id ?? (typeName === 'Money In' ? 1 : 2);

                  let primaryAccountId = null;
                  let secondaryAccountId = null;

                  if (typeId === 1) {
                    secondaryAccountId = budget.debitAccount?.id ?? budget.secondaryAccountId ?? null;
                    primaryAccountId = budget.creditAccount?.id ?? budget.primaryAccountId ?? null;
                  } else {
                    primaryAccountId = budget.debitAccount?.id ?? budget.primaryAccountId ?? null;
                    secondaryAccountId = budget.creditAccount?.id ?? budget.secondaryAccountId ?? null;
                  }

                  return {
                    ...budget,
                    transactionTypeId: typeId,
                    primaryAccountId,
                    secondaryAccountId,
                    status: typeof budget.status === 'object' ? budget.status : { name: budget.status, actualAmount: null, actualDate: null }
                  };
                };
                
                updatedBudget.status = {
                  name: updates.actualAmount !== null && updates.actualAmount !== undefined ? 'actual' : 'planned',
                  actualAmount: updates.actualAmount || null,
                  actualDate: updates.actualDate || null
                };
                
                allBudgets[budgetIndex] = normalizeBudgetForSave(updatedBudget);
                await BudgetManager.saveAll(currentScenario.id, allBudgets);
                currentScenario = await getScenario(currentScenario.id);
                await loadBudgetGrid(container);
              }
            });
          }
        }
      ],
      cellEdited: async function(cell) {
        const rowData = cell.getRow().getData();
        const field = cell.getColumn().getField();
        const newValue = cell.getValue();

        // Update budget occurrence
        const allBudgets = await getBudget(currentScenario.id);
        const budgetIndex = allBudgets.findIndex(b => b.id === rowData.id);

        if (budgetIndex >= 0) {
          const updatedBudget = { ...allBudgets[budgetIndex] };

          // Normalize budget for save (convert UI format to storage format)
          const normalizeBudgetForSave = (budget) => {
            const typeName = budget.transactionType?.name || 'Money Out';
            const typeId = budget.transactionType?.id ?? (typeName === 'Money In' ? 1 : 2);

            let primaryAccountId = null;
            let secondaryAccountId = null;

            if (typeId === 1) {
              // Money In: secondary -> primary
              secondaryAccountId = budget.debitAccount?.id ?? budget.secondaryAccountId ?? null;
              primaryAccountId = budget.creditAccount?.id ?? budget.primaryAccountId ?? null;
            } else {
              // Money Out: primary -> secondary
              primaryAccountId = budget.debitAccount?.id ?? budget.primaryAccountId ?? null;
              secondaryAccountId = budget.creditAccount?.id ?? budget.secondaryAccountId ?? null;
            }

            return {
              ...budget,
              transactionTypeId: typeId,
              primaryAccountId,
              secondaryAccountId,
              status: typeof budget.status === 'object' ? budget.status : { name: budget.status, actualAmount: null, actualDate: null }
            };
          };

          // Handle field update
          if (field === 'transactionType') {
            updatedBudget.transactionType = newValue;
            
            // Update debit/credit based on type change
            if (selectedAccountId) {
              const selectedAccount = currentScenario.accounts?.find(a => a.id === Number(selectedAccountId));
              const secondaryAccount = updatedBudget.secondaryAccount;

              if (newValue?.name === 'Money Out') {
                updatedBudget.debitAccount = selectedAccount || null;
                updatedBudget.creditAccount = secondaryAccount || null;
              } else if (newValue?.name === 'Money In') {
                updatedBudget.debitAccount = secondaryAccount || null;
                updatedBudget.creditAccount = selectedAccount || null;
              }
            }
          } else if (field === 'secondaryAccount') {
            updatedBudget.secondaryAccount = newValue;
            
            // Update debit/credit based on account change
            if (selectedAccountId) {
              const selectedAccount = currentScenario.accounts?.find(a => a.id === Number(selectedAccountId));
              const transactionType = updatedBudget.transactionType;

              if (transactionType?.name === 'Money Out') {
                updatedBudget.debitAccount = selectedAccount || null;
                updatedBudget.creditAccount = newValue || null;
              } else if (transactionType?.name === 'Money In') {
                updatedBudget.debitAccount = newValue || null;
                updatedBudget.creditAccount = selectedAccount || null;
              }
            }
          } else if (field === 'plannedAmount') {
            // Map UI field 'plannedAmount' back to storage field 'amount'
            updatedBudget.amount = newValue;
          } else if (field === 'actualAmount') {
            // Update actual amount in status object
            if (!updatedBudget.status || typeof updatedBudget.status !== 'object') {
              updatedBudget.status = { name: 'planned', actualAmount: null, actualDate: null };
            }
            if (newValue !== null && newValue !== undefined && newValue !== '') {
              updatedBudget.status.actualAmount = newValue;
              if (!updatedBudget.status.actualDate) {
                updatedBudget.status.actualDate = formatDateOnly(new Date());
              }
              updatedBudget.status.name = 'actual';
            }
          } else {
            // Update other fields normally
            updatedBudget[field] = newValue;
          }

          // Normalize and save
          allBudgets[budgetIndex] = normalizeBudgetForSave(updatedBudget);
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
          budgetTable.setGroupBy(groupField);
          // Add groupHeader with sum for grouped field
          budgetTable.setGroupHeader((value, count, data, group) => {
            const totalAmount = data.reduce((sum, row) => sum + Number(row.plannedAmount || 0), 0);
            const label = formatGroupLabel(value);
            const formatted = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(totalAmount);
            return `${label} (${count} items, Total: ${formatted})`;
          });
        } else {
          budgetTable.clearGroupBy();
        }
      });
    }

  } catch (err) {
    console.error('[Forecast] Failed to load budget grid:', err);
  }
}

// Open status modal for editing actual amount and date
function openStatusModal(rowData, onConfirm) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';

  const content = document.createElement('div');
  content.className = 'modal-content';
  content.innerHTML = `
    <h3>Edit Status</h3>
    <form>
      <div class="form-group">
        <label for="actualAmount">Actual Amount:</label>
        <input type="number" id="actualAmount" step="0.01" value="${rowData.status?.actualAmount || ''}" placeholder="Enter actual amount">
      </div>
      <div class="form-group">
        <label for="actualDate">Actual Date:</label>
        <input type="date" id="actualDate" value="${rowData.status?.actualDate ? formatDateOnly(new Date(rowData.status.actualDate)) : ''}">
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-confirm">Confirm</button>
        <button type="button" class="btn btn-cancel">Cancel</button>
      </div>
    </form>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  const confirmBtn = content.querySelector('.btn-confirm');
  const cancelBtn = content.querySelector('.btn-cancel');
  const actualAmountInput = content.querySelector('#actualAmount');
  const actualDateInput = content.querySelector('#actualDate');

  confirmBtn.addEventListener('click', () => {
    const actualAmount = actualAmountInput.value ? parseFloat(actualAmountInput.value) : null;
    const actualDate = actualDateInput.value ? new Date(actualDateInput.value).toISOString().split('T')[0] : null;

    onConfirm({
      actualAmount,
      actualDate,
      name: actualAmount !== null ? 'actual' : 'planned'
    });

    modal.remove();
  });

  cancelBtn.addEventListener('click', () => {
    modal.remove();
  });

  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
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

    // Compute filtered totals for the current projection view
    const projectionTotals = transformedData.reduce((acc, row) => {
      const income = Number(row.income || 0);
      const expenses = Number(row.expenses || 0);
      const netChange = row.netChange !== undefined && row.netChange !== null
        ? Number(row.netChange)
        : (income - expenses);

      acc.income += income;
      acc.expenses += expenses;
      acc.net += netChange;
      return acc;
    }, { income: 0, expenses: 0, net: 0 });

    // Render totals summary above the grid
    const projectionsTotalsBar = document.createElement('div');
    projectionsTotalsBar.className = 'grid-totals';
    const formatCurrency = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    projectionsTotalsBar.innerHTML = `
      <div class="grid-total-item">
        <div class="label">Income</div>
        <div class="value positive">${formatCurrency(projectionTotals.income)}</div>
      </div>
      <div class="grid-total-item">
        <div class="label">Expenses</div>
        <div class="value negative">${formatCurrency(projectionTotals.expenses)}</div>
      </div>
      <div class="grid-total-item">
        <div class="label">Net Change</div>
        <div class="value ${projectionTotals.net >= 0 ? 'positive' : 'negative'}">${formatCurrency(projectionTotals.net)}</div>
      </div>
    `;
    window.add(container, projectionsTotalsBar);

    // Add grouping control
    const projectionsGroupingControl = document.createElement('div');
    projectionsGroupingControl.className = 'mb-sm grouping-control';
    projectionsGroupingControl.innerHTML = `
      <label for="projections-grouping-select" class="text-muted control-label">Group By:</label>
      <select id="projections-grouping-select" class="input-select control-select">
        <option value="">None</option>
        <option value="account">Account</option>
      </select>
    `;
    window.add(container, projectionsGroupingControl);
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
          projectionsTable.clearGroupBy();
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
      await loadMasterTransactionsGrid(document.getElementById('transactionsTable'));
    });
    
    document.getElementById('actual-prev-period-btn')?.addEventListener('click', async () => {
      const currentIndex = periods.findIndex(p => p.id === actualPeriod);
      if (currentIndex > 0) {
        actualPeriod = periods[currentIndex - 1].id;
        periodSelect.value = actualPeriod;
        await loadMasterTransactionsGrid(document.getElementById('transactionsTable'));
      }
    });
    
    document.getElementById('actual-next-period-btn')?.addEventListener('click', async () => {
      const currentIndex = periods.findIndex(p => p.id === actualPeriod);
      if (currentIndex < periods.length - 1) {
        actualPeriod = periods[currentIndex + 1].id;
        periodSelect.value = actualPeriod;
        await loadMasterTransactionsGrid(document.getElementById('transactionsTable'));
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
