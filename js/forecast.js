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
    if (recurrence.startDate) return parseDateOnly(recurrence.startDate).getDate();
    return null;
  };

  const formatYearlyAnchor = () => {
    if (!recurrence.startDate) return null;
    const d = parseDateOnly(recurrence.startDate);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
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
    console.log('[Totals] updateTransactionTotals: masterTransactionsTable is null');
    return;
  }
  
  const formatCurrency = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  
  // Get currently visible (filtered) data from provided rows or table
  const visibleData = filteredRows ? filteredRows.map(r => r.getData()) : masterTransactionsTable.getData('active');
  console.log('[Totals] updateTransactionTotals: visibleData count =', visibleData.length);
  console.log('[Totals] updateTransactionTotals: visibleData sample =', visibleData.slice(0, 3).map(d => ({ 
    id: d.id, 
    amount: d.amount, 
    type: d.transactionTypeName,
    perspectiveAccountId: d.perspectiveAccountId 
  })));
  
  // Compute totals from visible data
  const txTotals = computeMoneyTotals(visibleData, {
    amountField: 'amount',
    typeField: 'transactionType',
    typeNameField: 'transactionTypeName',
    typeIdField: 'transactionTypeId'
  });
  console.log('[Totals] updateTransactionTotals: computed =', txTotals);
  
  // Update toolbar totals
  const toolbarTotals = document.querySelector('#transactionsContent .toolbar-totals');
  console.log('[Totals] updateTransactionTotals: toolbarTotals element found =', !!toolbarTotals);
  if (toolbarTotals) {
    toolbarTotals.innerHTML = `
      <span class="toolbar-total-item"><span class="label">Money In:</span> <span class="value positive">${formatCurrency(txTotals.moneyIn)}</span></span>
      <span class="toolbar-total-item"><span class="label">Money Out:</span> <span class="value negative">${formatCurrency(txTotals.moneyOut)}</span></span>
      <span class="toolbar-total-item"><span class="label">Net:</span> <span class="value ${txTotals.net >= 0 ? 'positive' : 'negative'}">${formatCurrency(txTotals.net)}</span></span>
    `;
  }
}

// Update budget totals in toolbar based on current filtered data
function updateBudgetTotals(filteredRows = null) {
  if (!masterBudgetTable) {
    console.log('[Totals] updateBudgetTotals: masterBudgetTable is null');
    return;
  }
  
  const formatCurrency = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  
  // Get currently visible (filtered) data from provided rows or table
  const visibleData = filteredRows ? filteredRows.map(r => r.getData()) : masterBudgetTable.getData('active');
  console.log('[Totals] updateBudgetTotals: visibleData count =', visibleData.length);
  
  // Compute totals from visible data
  const budgetTotals = computeMoneyTotals(visibleData, {
    amountField: 'amount',
    typeField: 'transactionType',
    typeNameField: 'transactionTypeName',
    typeIdField: 'transactionTypeId'
  });
  console.log('[Totals] updateBudgetTotals: computed =', budgetTotals);
  
  // Update toolbar totals
  const toolbarTotals = document.querySelector('#budgetContent .toolbar-totals');
  console.log('[Totals] updateBudgetTotals: toolbarTotals element found =', !!toolbarTotals);
  if (toolbarTotals) {
    toolbarTotals.innerHTML = `
      <span class="toolbar-total-item"><span class="label">Money In:</span> <span class="value positive">${formatCurrency(budgetTotals.moneyIn)}</span></span>
      <span class="toolbar-total-item"><span class="label">Money Out:</span> <span class="value negative">${formatCurrency(budgetTotals.moneyOut)}</span></span>
      <span class="toolbar-total-item"><span class="label">Net:</span> <span class="value ${budgetTotals.net >= 0 ? 'positive' : 'negative'}">${formatCurrency(budgetTotals.net)}</span></span>
    `;
  }
}

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
    
    // Determine if it's Money In or Money Out based on transaction type
    const isMoneyIn = name === 'Money In' || id === 1;
    const isMoneyOut = name === 'Money Out' || id === 2;
    
    const absAmount = Math.abs(amount);

    if (isMoneyIn) {
      acc.moneyIn += absAmount;
      acc.net += absAmount; // Money In adds to net
    } else if (isMoneyOut) {
      acc.moneyOut += absAmount;
      acc.net -= absAmount; // Money Out subtracts from net
    }
    
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

  const isElectron = typeof window !== 'undefined' && typeof window.require !== 'undefined';
  const lookupPath = getSchemaPath('lookup-data.json');

  try {
    let lookupFile;
    
    if (isElectron) {
      const fs = window.require('fs').promises;
      lookupFile = await fs.readFile(lookupPath, 'utf8');
    } else {
      // Web: use fetch
      const response = await fetch(lookupPath);
      lookupFile = await response.text();
    }
    
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
          cssClass: "duplicate-cell",
          headerTooltip: "Duplicate Scenario",
          formatter: function(cell){
            try {
              const rowEl = cell.getRow().getElement();
              if (rowEl && rowEl.classList.contains('tabulator-calcs-row')) return '';
            } catch(e){}
            return '<svg height="14" width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
          },
          cellClick: async function(e, cell) {
            try {
              const row = cell.getRow();
              const rowEl = row.getElement();
              if (rowEl && rowEl.classList.contains('tabulator-calcs-row')) return;
              const rowData = row.getData();
              await ScenarioManager.duplicate(rowData.id);
              await buildScenarioGrid(container);
            } catch (err) {
              console.error('Duplicate scenario cellClick failed', err);
            }
          }
        },
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
    console.log('[ScenarioGrid] Checking initial scenario - currentScenario:', currentScenario, 'scenarios.length:', scenarios.length);
    if (!currentScenario && scenarios.length > 0) {
      console.log('[ScenarioGrid] Loading initial scenario:', scenarios[0].id);
      currentScenario = await getScenario(scenarios[0].id);
      console.log('[ScenarioGrid] Got scenario, now loading data...');
      await loadScenarioData();
      console.log('[ScenarioGrid] Data loaded, selecting row...');
      // Select the first row visually without triggering the handler
      // (data is already loaded above, so we don't want duplicate load)
      const firstRow = scenariosTable.getRows()[0];
      if (firstRow) {
        firstRow.select();
        console.log('[ScenarioGrid] First row selected');
      }
    }
  } catch (err) {
    console.error('[Forecast] Failed to load scenario grid:', err);
  }
}

// Load scenario type configuration
async function loadScenarioTypes() {
  const lookupPath = getSchemaPath('lookup-data.json');

  try {
    // Platform detection - use fetch in web, fs in Electron
    const isElectron = typeof window !== 'undefined' && typeof window.require !== 'undefined';
    let lookupFile;
    
    if (isElectron) {
      const fs = window.require('fs').promises;
      lookupFile = await fs.readFile(lookupPath, 'utf8');
    } else {
      // Web: use fetch to load JSON
      const response = await fetch(lookupPath);
      lookupFile = await response.text();
    }
    
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
 * Transform planned transactions to UI format (transactionType/secondaryAccount) filtered by selected account
 */
function transformPlannedTxForUI(plannedTxs, selectedAccountId) {
  const selIdNum = selectedAccountId != null ? Number(selectedAccountId) : null;

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
function transformActualTxForUI(actualTxs, selectedAccountId) {
  const selIdNum = selectedAccountId != null ? Number(selectedAccountId) : null;

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
function mapTxToUI(tx, selectedAccountId) {
  const selIdNum = selectedAccountId != null ? Number(selectedAccountId) : null;
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
        console.log('[Accounts] Adding new row:', rowData);
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
        console.log('[Accounts] cellEdited - account data:', account);
        console.log('[Accounts] cellEdited - account.id:', account.id);
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
        console.log('[Accounts] rowSelectionChanged fired with rows:', rows.length);
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
          console.log('[Accounts] rowSelectionChanged - Account selected:', account.id, account.name);
          selectedAccountId = Number(account.id);
          lastProcessedAccountId = selectedAccountId; // Mark as processed to prevent duplicate in rowSelected
          console.log('[Accounts] Updated selectedAccountId to:', selectedAccountId);
          
          // Update accordion header
          const accordionHeader = document.querySelector('#transactionsContent').closest('.bg-main').querySelector('.accordion-header h2');
          if (accordionHeader) {
            accordionHeader.textContent = `Transactions - ${account.name}`;
          }
          
          // Apply filter to show transactions from selected account's perspective
          if (masterTransactionsTable) {
            masterTransactionsTable.setFilter((data) => {
              if (!data.perspectiveAccountId) return true;
              return Number(data.perspectiveAccountId) === selectedAccountId;
            });
            // Manually update totals after filter
            updateTransactionTotals();
          }
          
          // Apply filter to budget grid
          if (masterBudgetTable) {
            masterBudgetTable.setFilter((data) => {
              if (!data.perspectiveAccountId) return true;
              return Number(data.perspectiveAccountId) === selectedAccountId;
            });
            // Manually update totals after filter
            updateBudgetTotals();
          }
          
          // Reload projections grid
          await loadProjectionsSection(getEl('projectionsContent'));
        } else {
          // No account selected
          console.log('[Accounts] Clearing account selection');
          selectedAccountId = null;
          
          // Update accordion header
          const accordionHeader = document.querySelector('#transactionsContent').closest('.bg-main').querySelector('.accordion-header h2');
          if (accordionHeader) {
            accordionHeader.textContent = 'Transactions';
          }
          
          // Show only primary perspectives (not flipped)
          if (masterTransactionsTable) {
            masterTransactionsTable.setFilter((data) => {
              return !String(data.id).includes('_flipped');
            });
            // Manually update totals after filter
            updateTransactionTotals();
          }
          
          // Show only primary perspectives in budget grid (not flipped)
          if (masterBudgetTable) {
            masterBudgetTable.setFilter((data) => {
              return !String(data.id).includes('_flipped');
            });
            // Manually update totals after filter
            updateBudgetTotals();
          }
          
          // Reload projections grid
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
    
    // Show empty state if no accounts exist
    accountsTable.on("tableBuilt", function() {
      const rows = accountsTable.getRows();
      if (!rows || rows.length === 0) {
        // If no accounts, clear the "Loading..." message from downstream grids
        const plannedContainer = document.getElementById('transactionsTable');
        if (plannedContainer) plannedContainer.innerHTML = '<div class="empty-message">No accounts found. Create an account to get started.</div>';
      }
    });

    // Fallback for when rowSelectionChanged doesn't fire (Tabulator version compatibility)
    let lastProcessedAccountId = null;
    accountsTable.on("rowSelected", async function(row) {
      try {
        const account = row.getData();
        const accountIdNum = Number(account.id);
        
        // Only process if this is a new selection (avoid duplicate processing)
        if (lastProcessedAccountId === accountIdNum) {
          console.log('[Accounts] rowSelected - already processed account:', accountIdNum);
          return;
        }
        
        console.log('[Accounts] rowSelected - processing account:', accountIdNum, account.name);
        lastProcessedAccountId = accountIdNum;
        selectedAccountId = accountIdNum;
        
        // Update accordion header
        const accordionHeader = document.querySelector('#transactionsContent').closest('.bg-main').querySelector('.accordion-header h2');
        if (accordionHeader) {
          accordionHeader.textContent = `Transactions - ${account.name}`;
        }
        
        // Apply filter to show transactions from selected account's perspective
        if (masterTransactionsTable) {
          console.log('[Accounts] Filtering transactions for accountId:', selectedAccountId);
          masterTransactionsTable.setFilter((data) => {
            if (!data.perspectiveAccountId) return true;
            return Number(data.perspectiveAccountId) === selectedAccountId;
          });
          // Manually update totals after filter
          updateTransactionTotals();
        }
        
        // Apply filter to budget grid
        if (masterBudgetTable) {
          masterBudgetTable.setFilter((data) => {
            if (!data.perspectiveAccountId) return true;
            return Number(data.perspectiveAccountId) === selectedAccountId;
          });
          // Manually update totals after filter
          updateBudgetTotals();
        }
        
        // Reload projections grid
        await loadProjectionsSection(getEl('projectionsContent'));
      } catch (e) {
        logger.error('[AccountsGrid] rowSelected handler error:', e);
      }
    });

    accountsTable.on("rowDeselected", async function(row) {
      try {
        const remaining = accountsTable.getSelectedRows();
        if (!remaining || remaining.length === 0) {
          console.log('[Accounts] All accounts deselected');
          selectedAccountId = null;
          lastProcessedAccountId = null; // Reset tracking flag
          // Show only primary perspectives (not flipped)
          if (masterTransactionsTable) {
            masterTransactionsTable.setFilter((data) => {
              return !String(data.id).includes('_flipped');
            });
            // Manually update totals after filter
            updateTransactionTotals();
          }
          // Show only primary perspectives in budget grid (not flipped)
          if (masterBudgetTable) {
            masterBudgetTable.setFilter((data) => {
              return !String(data.id).includes('_flipped');
            });
            // Manually update totals after filter
            updateBudgetTotals();
          }
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
          accountsTable.setGroupBy(false);
        }
      });
    }
    
    // Store globally for access from transaction grid
    window.accountsTableInstance = accountsTable;

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

  // Update accordion header with filter info
  const accordionHeader = document.querySelector('#transactionsContent').closest('.bg-main').querySelector('.accordion-header h2');
  const selIdNum = selectedAccountId != null ? Number(selectedAccountId) : null;
  
  if (accordionHeader) {
    if (selIdNum) {
      const selectedAccount = currentScenario.accounts?.find(a => a.id === selIdNum);
      accordionHeader.textContent = `Transactions - ${selectedAccount?.name || 'Unknown Account'}`;
    } else {
      accordionHeader.textContent = 'Transactions';
    }
  }

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
      // Require an account to be selected
      if (!selectedAccountId) {
        alert('Please select an account first before adding a transaction.');
        return;
      }
      
      // Create new planned transaction with selected account as primary
      const newTx = await createTransaction(currentScenario.id, {
        primaryAccountId: selectedAccountId,
        secondaryAccountId: null, // User will fill this in
        transactionTypeId: 2, // Default to Money Out
        amount: 0,
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
      <option value="recurrenceSummary">Recurrence Period</option>
      <option value="primaryAccountName">Account</option>
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
  
  // Add toolbar to container FIRST so we can find the select element
  window.add(container, toolbar);
  
  // Set the selected period type from variable
  const periodTypeSelect = document.getElementById('tx-period-type-select');
  if (periodTypeSelect) {
    periodTypeSelect.value = actualPeriodType;
  }
  
  // Calculate periods for current scenario with selected period type
  periods = await getScenarioPeriods(currentScenario.id, actualPeriodType);
  console.log('[Transactions] Calculated periods:', periods);
  
  // Populate period dropdown immediately
  const periodSelect = document.getElementById('actual-period-select');
  if (periodSelect) {
    console.log('[Transactions] Found period select element');
    periodSelect.innerHTML = '<option value="">-- All Periods --</option>';
    periods.forEach((period) => {
      const option = document.createElement('option');
      option.value = period.id;
      option.textContent = period.label || `${formatDateOnly(period.startDate) || ''} to ${formatDateOnly(period.endDate) || ''}`;
      periodSelect.appendChild(option);
      console.log('[Transactions] Added period option:', period.id, option.textContent);
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

    // Transform for UI - create dual-perspective rows
    const transformedData = allTransactions.flatMap(tx => {
      const storedPrimaryId = tx.primaryAccountId;
      const storedSecondaryId = tx.secondaryAccountId;
      const storedTypeId = tx.transactionTypeId || tx.transactionType?.id;
      
      // Handle status as object or string
      const statusName = typeof tx.status === 'object' ? tx.status.name : tx.status;
      const actualAmount = typeof tx.status === 'object' ? tx.status.actualAmount : tx.actualAmount;
      const actualDate = typeof tx.status === 'object' ? tx.status.actualDate : tx.actualDate;
      
      // Display date: only show occurrence date when a specific period is selected; blank for all-period view
      const displayDate = actualPeriod
        ? (statusName === 'actual' && actualDate ? actualDate : tx.effectiveDate)
        : '';

      const recurrenceSummary = getRecurrenceDescription(tx.recurrence);
      
      const baseData = {
        id: tx.id,
        originalTransactionId: tx.id,
        primaryAccountId: storedPrimaryId,
        secondaryAccountId: storedSecondaryId,
        status: statusName || 'planned',
        amount: statusName === 'actual' && actualAmount !== undefined ? actualAmount : tx.amount,
        plannedAmount: tx.amount,
        actualAmount: actualAmount,
        effectiveDate: tx.effectiveDate,
        plannedDate: tx.effectiveDate,
        actualDate: actualDate,
        displayDate,
        description: tx.description,
        recurrence: tx.recurrence,
        recurrenceDescription: recurrenceSummary,
        recurrenceSummary,
        tags: tx.tags || []
      };
      
      const rows = [];
      
      // Perspective 1: From the stored primary account's view (as-is)
      if (storedPrimaryId) {
        const primaryAccount = currentScenario.accounts?.find(a => a.id === storedPrimaryId) || { id: storedPrimaryId };
        const secondaryAccount = storedSecondaryId 
          ? currentScenario.accounts?.find(a => a.id === storedSecondaryId) || { id: storedSecondaryId }
          : null;
        const transactionType = storedTypeId === 1 ? { id: 1, name: 'Money In' } : { id: 2, name: 'Money Out' };
        
        rows.push({
          ...baseData,
          perspectiveAccountId: storedPrimaryId, // Used for filtering
          transactionTypeId: storedTypeId,
          primaryAccount,
          primaryAccountName: primaryAccount?.name || '',
          transactionType,
          transactionTypeName: transactionType?.name || '',
          secondaryAccount
        });
      }
      
      // Perspective 2: From the stored secondary account's view (flipped)
      if (storedSecondaryId) {
        const primaryAccount = currentScenario.accounts?.find(a => a.id === storedSecondaryId) || { id: storedSecondaryId };
        const secondaryAccount = storedPrimaryId
          ? currentScenario.accounts?.find(a => a.id === storedPrimaryId) || { id: storedPrimaryId }
          : null;
        // Flip the transaction type
        const flippedTypeId = storedTypeId === 1 ? 2 : 1;
        const transactionType = flippedTypeId === 1 ? { id: 1, name: 'Money In' } : { id: 2, name: 'Money Out' };
        
        // Flip the amount sign when flipping perspective
        const flippedAmount = -(baseData.amount);
        const flippedPlannedAmount = -(baseData.plannedAmount);
        const flippedActualAmount = baseData.actualAmount !== undefined && baseData.actualAmount !== null 
          ? -(baseData.actualAmount) 
          : baseData.actualAmount;
        
        rows.push({
          ...baseData,
          id: `${tx.id}_flipped`, // Unique ID for flipped perspective
          perspectiveAccountId: storedSecondaryId, // Used for filtering
          transactionTypeId: flippedTypeId,
          amount: flippedAmount,
          plannedAmount: flippedPlannedAmount,
          actualAmount: flippedActualAmount,
          primaryAccount,
          primaryAccountName: primaryAccount?.name || '',
          transactionType,
          transactionTypeName: transactionType?.name || '',
          secondaryAccount
        });
      }
      
      return rows;
    });
    // Note: Filtering is now handled by Tabulator's setFilter() - see account selection handler

    // Compute filtered totals for current transactions view
    const txTotals = computeMoneyTotals(transformedData, {
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

    masterTransactionsTable = createGrid(gridContainer, {
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

          return {
            ...tx,
            transactionType: { id: transactionTypeId, name: transactionTypeId === 1 ? 'Money In' : 'Money Out' },
            transactionTypeId,
            primaryAccountId: tx.primaryAccountId ?? null,
            secondaryAccountId: tx.secondaryAccountId ?? null,
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

                console.log('[Transactions] Created new account:', newAccount);

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
                
                console.log('[Transactions] Updated row data:', currentData);

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
                  console.log('[Transactions] Saved transaction with new account');
                }
                
                // Add new account to accounts grid without reloading
                if (window.accountsTableInstance) {
                  const enrichedAccount = {
                    ...newAccount,
                    accountType: newAccount.type?.name || 'Unknown'
                  };
                  window.accountsTableInstance.addRow(enrichedAccount);
                  console.log('[Transactions] Added account to accounts grid');
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

          // If transaction type changed, update transactionTypeId
          if (field === 'transactionType') {
            updatedTx.transactionTypeId = newValue?.id || (newValue?.name === 'Money In' ? 1 : 2);
            // Keep primaryAccountId and secondaryAccountId as-is
            // The type change just affects how amounts are interpreted
          }

          // If secondary account changed, update secondaryAccountId
          if (field === 'secondaryAccount') {
            updatedTx.secondaryAccountId = newValue?.id || null;
          }

          // If primary account changed (only shown in unfiltered mode), update primaryAccountId
          if (field === 'primaryAccount' && !selectedAccountId) {
            updatedTx.primaryAccountId = newValue?.id || null;
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
      console.log('[Transactions] Applying initial filter for account:', selIdNum);
      if (selIdNum) {
        // If account is selected, show only that account's perspective
        masterTransactionsTable.setFilter((data) => {
          if (!data.perspectiveAccountId) return true;
          return Number(data.perspectiveAccountId) === selIdNum;
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
    
    // Update totals when filter changes
    masterTransactionsTable.on('dataFiltered', function(filters, rows) {
      console.log('[Transactions] dataFiltered - rows:', rows.length);
      updateTransactionTotals(rows);
    });
    
    // Update totals after table is built (initial load)
    masterTransactionsTable.on('tableBuilt', function() {
      console.log('[Transactions] tableBuilt - updating initial totals');
      updateTransactionTotals();
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

    // Update accordion header with filter info
    const accordionHeader = document.getElementById('budgetAccordionHeader')?.querySelector('h2');
    if (accordionHeader) {
      if (selIdNum) {
        const selectedAccount = currentScenario.accounts?.find(a => a.id === selIdNum);
        accordionHeader.textContent = `Budget - ${selectedAccount?.name || 'Unknown Account'}`;
      } else {
        accordionHeader.textContent = 'Budget';
      }
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
        plannedAmount: budget.amount,
        actualAmount: statusObj.actualAmount,
        amount: statusObj.actualAmount !== null && statusObj.actualAmount !== undefined ? statusObj.actualAmount : budget.amount,
        description: budget.description,
        occurrenceDate: budget.occurrenceDate,
        recurrenceDescription: recurrenceSummary,
        status: statusObj,
        actualDateOverride: statusObj.actualDate
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
      
      const rows = [];
      
      // Perspective 1: From the stored primary account's view (as-is)
      if (storedPrimaryId) {
        const primaryAccount = currentScenario.accounts?.find(a => a.id === storedPrimaryId) || { id: storedPrimaryId };
        const secondaryAccount = storedSecondaryId 
          ? currentScenario.accounts?.find(a => a.id === storedSecondaryId) || { id: storedSecondaryId }
          : null;
        const transactionType = storedTypeId === 1 ? { id: 1, name: 'Money In' } : { id: 2, name: 'Money Out' };
        
        rows.push({
          ...baseData,
          perspectiveAccountId: storedPrimaryId, // Used for filtering
          transactionTypeId: storedTypeId,
          primaryAccount,
          primaryAccountName: primaryAccount?.name || '',
          transactionType,
          transactionTypeName: transactionType?.name || '',
          secondaryAccount
        });
      }
      
      // Perspective 2: From the stored secondary account's view (flipped)
      if (storedSecondaryId) {
        const primaryAccount = currentScenario.accounts?.find(a => a.id === storedSecondaryId) || { id: storedSecondaryId };
        const secondaryAccount = storedPrimaryId
          ? currentScenario.accounts?.find(a => a.id === storedPrimaryId) || { id: storedPrimaryId }
          : null;
        // Flip the transaction type
        const flippedTypeId = storedTypeId === 1 ? 2 : 1;
        const transactionType = flippedTypeId === 1 ? { id: 1, name: 'Money In' } : { id: 2, name: 'Money Out' };
        
        // Flip the amount sign when flipping perspective
        const flippedAmount = -(baseData.amount);
        const flippedPlannedAmount = -(baseData.plannedAmount);
        const flippedActualAmount = baseData.actualAmount !== undefined && baseData.actualAmount !== null 
          ? -(baseData.actualAmount) 
          : baseData.actualAmount;
        
        rows.push({
          ...baseData,
          id: `${budget.id}_flipped`, // Unique ID for flipped perspective
          perspectiveAccountId: storedSecondaryId, // Used for filtering
          transactionTypeId: flippedTypeId,
          amount: flippedAmount,
          plannedAmount: flippedPlannedAmount,
          actualAmount: flippedActualAmount,
          primaryAccount,
          primaryAccountName: primaryAccount?.name || '',
          transactionType,
          transactionTypeName: transactionType?.name || '',
          secondaryAccount
        });
      }
      
      return rows;
    });
    // Note: Account filtering is now handled by Tabulator's setFilter() - see account selection handler

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

    // Add grouping control
    const groupingControl = document.createElement('div');
    groupingControl.className = 'toolbar-item grouping-control';
    groupingControl.innerHTML = `
      <label for="budget-grouping-select" class="text-muted control-label">Group By:</label>
      <select id="budget-grouping-select" class="input-select control-select">
        <option value="">None</option>
        <option value="transactionTypeName">Type (Money In/Out)</option>
        <option value="recurrenceDescription">Recurrence Period</option>
        <option value="primaryAccountName">Account</option>
      </select>
    `;
    window.add(toolbar, groupingControl);

    // Add inline totals to toolbar (will be updated dynamically)
    const formatCurrency = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const totalsInline = document.createElement('div');
    totalsInline.className = 'toolbar-item toolbar-totals';
    totalsInline.innerHTML = `
      <span class="toolbar-total-item"><span class="label">Money In:</span> <span class="value positive">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Money Out:</span> <span class="value negative">${formatCurrency(0)}</span></span>
      <span class="toolbar-total-item"><span class="label">Net:</span> <span class="value">${formatCurrency(0)}</span></span>
    `;
    window.add(toolbar, totalsInline);
    window.add(container, toolbar);

    // Create grid container
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid-container budget-grid';
    window.add(container, gridContainer);

    masterBudgetTable = createGrid(gridContainer, {
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

                  return {
                    ...budget,
                    transactionTypeId: typeId,
                    primaryAccountId: budget.primaryAccountId ?? null,
                    secondaryAccountId: budget.secondaryAccountId ?? null,
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

            return {
              ...budget,
              transactionTypeId: typeId,
              primaryAccountId: budget.primaryAccountId ?? null,
              secondaryAccountId: budget.secondaryAccountId ?? null,
              status: typeof budget.status === 'object' ? budget.status : { name: budget.status, actualAmount: null, actualDate: null }
            };
          };

          // Handle field update
          if (field === 'transactionType') {
            updatedBudget.transactionType = newValue;
          } else if (field === 'secondaryAccount') {
            updatedBudget.secondaryAccount = newValue;
            updatedBudget.secondaryAccountId = newValue?.id || null;
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
      console.log('[Budget] Applying initial filter for account:', selIdNum);
      if (selIdNum) {
        // If account is selected, show only that account's perspective
        masterBudgetTable.setFilter((data) => {
          if (!data.perspectiveAccountId) return true;
          return Number(data.perspectiveAccountId) === selIdNum;
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
    
    // Update totals when filter changes
    masterBudgetTable.on('dataFiltered', function(filters, rows) {
      console.log('[Budget] dataFiltered - rows:', rows.length);
      updateBudgetTotals(rows);
    });
    
    // Update totals after table is built (initial load)
    masterBudgetTable.on('tableBuilt', function() {
      console.log('[Budget] tableBuilt - updating initial totals');
      updateBudgetTotals();
    });

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
    const actualDate = actualDateInput.value || null;

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

    // Create toolbar for controls
    const toolbar = document.createElement('div');
    toolbar.className = 'grid-toolbar';

    // Add grouping control
    const projectionsGroupingControl = document.createElement('div');
    projectionsGroupingControl.className = 'toolbar-item grouping-control';
    projectionsGroupingControl.innerHTML = `
      <label for="projections-grouping-select" class="text-muted control-label">Group By:</label>
      <select id="projections-grouping-select" class="input-select control-select">
        <option value="">None</option>
        <option value="account">Account</option>
      </select>
    `;
    window.add(toolbar, projectionsGroupingControl);

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

    // Add inline totals to toolbar
    const formatCurrency = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const totalsInline = document.createElement('div');
    totalsInline.className = 'toolbar-item toolbar-totals';
    totalsInline.innerHTML = `
      <span class="toolbar-total-item"><span class="label">Income:</span> <span class="value positive">${formatCurrency(projectionTotals.income)}</span></span>
      <span class="toolbar-total-item"><span class="label">Expenses:</span> <span class="value negative">${formatCurrency(projectionTotals.expenses)}</span></span>
      <span class="toolbar-total-item"><span class="label">Net Change:</span> <span class="value ${projectionTotals.net >= 0 ? 'positive' : 'negative'}">${formatCurrency(projectionTotals.net)}</span></span>
    `;
    window.add(toolbar, totalsInline);
    window.add(container, toolbar);

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
  
  // Load transactions grid initially (filtering will be applied by account selection)
  // Period calculation happens inside each grid load function
  await loadMasterTransactionsGrid(containers.transactionsTable);
  
  await loadBudgetGrid(containers.budgetTable);
  await loadProjectionsSection(containers.projectionsContent);
}

// Initialize the page
async function init() {
  console.log('[ForecastPage] Starting initialization...');
  
  console.log('[ForecastPage] Loading globals...');
  loadGlobals();
  
  // Run data migration if needed
  try {
    console.log('[ForecastPage] Checking data migration...');
    const { needsMigration, migrateAllScenarios } = await import('./data-migration.js');
    if (await needsMigration()) {
      console.log('[App] Running data migration...');
      await migrateAllScenarios();
      console.log('[App] Data migration completed');
    }
  } catch (error) {
    console.error('[App] Data migration failed:', error);
    console.error('[App] Error message:', error?.message);
    console.error('[App] Error stack:', error?.stack);
  }
  
  console.log('[ForecastPage] Building grid container...');
  const containers = buildGridContainer();
  
  console.log('[ForecastPage] Loading scenario types...');
  await loadScenarioTypes();
  
  console.log('[ForecastPage] Building scenario grid...');
  await buildScenarioGrid(containers.scenarioSelector);
  
  // loadScenarioData is now called from buildScenarioGrid when initial scenario is set
  
  console.log('[ForecastPage] Initializing keyboard shortcuts...');
  initializeKeyboardShortcuts();
  
  console.log('[ForecastPage] Initialization complete!');
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

