// forecast.js
// Manages the Forecast page with scenario-centric model
// Displays accounts, planned transactions, actual transactions, and projections based on scenario type

import { EditableGrid } from './editable-grid.js';
import { loadGlobals } from './global-app.js';
import {
  getScenarios,
  getScenario,
  saveAccounts,
  savePlannedTransactions,
  saveActualTransactions
} from './data-manager.js';
import { generateProjections, clearProjections } from './projection-engine.js';

let currentScenario = null;
let scenarioTypes = null;

// Build the main UI container
function buildGridContainer() {
  const forecastEl = getEl('panel-forecast');

  // Create header
  const panelHeader = document.createElement('div');
  panelHeader.className = 'bg-main bordered rounded shadow-lg pointer flex-between accordion-header';
  panelHeader.innerHTML = `<h2 class="text-main">Financial Forecast</h2><span class="accordion-arrow">&#9662;</span>`;
  panelHeader.addEventListener('click', () => window.toggleAccordion('content'));
  window.add(forecastEl, panelHeader);

  // Foldable content
  const content = document.createElement('div');
  content.id = 'content';
  content.className = 'bg-main rounded shadow-md accordion-content';
  content.style.display = 'block';
  content.style.padding = '18px 20px 20px 20px';
  window.add(forecastEl, content);

  // Scenario selector
  const scenarioSelector = document.createElement('div');
  scenarioSelector.id = 'scenario-selector';
  scenarioSelector.style.marginBottom = '20px';
  window.add(content, scenarioSelector);

  // Accounts table section
  const accountsTable = document.createElement('div');
  accountsTable.id = 'accountsTable';
  accountsTable.style.marginBottom = '30px';
  window.add(content, accountsTable);

  // Planned Transactions table section
  const plannedTransactionsTable = document.createElement('div');
  plannedTransactionsTable.id = 'plannedTransactionsTable';
  plannedTransactionsTable.style.marginBottom = '30px';
  window.add(content, plannedTransactionsTable);

  // Actual Transactions table section
  const actualTransactionsTable = document.createElement('div');
  actualTransactionsTable.id = 'actualTransactionsTable';
  actualTransactionsTable.style.marginBottom = '30px';
  window.add(content, actualTransactionsTable);

  // Projections section
  const projectionsSection = document.createElement('div');
  projectionsSection.id = 'projectionsSection';
  projectionsSection.style.marginBottom = '30px';
  window.add(content, projectionsSection);

  return {
    scenarioSelector,
    accountsTable,
    plannedTransactionsTable,
    actualTransactionsTable,
    projectionsSection
  };
}

// Build scenario selector dropdown
async function buildScenarioSelector(container) {
  container.innerHTML = '';

  const label = document.createElement('label');
  label.textContent = 'Select Scenario: ';
  label.style.marginRight = '10px';
  label.style.fontSize = '1.08em';
  window.add(container, label);

  const select = document.createElement('select');
  select.className = 'scenario-select';
  select.style.fontSize = '1.08em';
  select.style.padding = '8px 12px';
  select.style.borderRadius = '6px';
  select.style.border = '1px solid #232a23';
  select.style.backgroundColor = '#202223';
  select.style.color = '#ededed';

  // Load scenarios
  const scenarios = await getScenarios();
  
  scenarios.forEach(scenario => {
    const option = document.createElement('option');
    option.value = scenario.id;
    option.textContent = `${scenario.name} (${scenario.type.name})`;
    if (currentScenario && currentScenario.id === scenario.id) {
      option.selected = true;
    }
    window.add(select, option);
  });

  select.addEventListener('change', async (e) => {
    const scenarioId = parseInt(e.target.value);
    currentScenario = await getScenario(scenarioId);
    await loadScenarioData();
  });

  window.add(container, select);

  // Set initial scenario if not set
  if (!currentScenario && scenarios.length > 0) {
    currentScenario = scenarios[0];
  }
}

// Load scenario type configuration
async function loadScenarioTypes() {
  const fs = window.require('fs').promises;
  const typesPath = process.cwd() + '/assets/scenario-types.json';

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

// Load accounts grid
async function loadAccountsGrid(container) {
  if (!currentScenario) return;

  const typeConfig = getScenarioTypeConfig();
  if (!typeConfig || !typeConfig.showAccounts) {
    container.innerHTML = '';
    return;
  }

  const fs = window.require('fs').promises;
  const schemaPath = process.cwd() + '/assets/accounts-grid-unified.json';

  try {
    const schemaFile = await fs.readFile(schemaPath, 'utf8');
    const schema = JSON.parse(schemaFile);

    // Inject accounts as options for account selectors
    schema.accounts = currentScenario.accounts || [];

    const grid = new EditableGrid({
      targetElement: container,
      tableHeader: 'Accounts',
      schema: schema,
      data: currentScenario.accounts || [],
      scenarioContext: currentScenario, // Pass scenario context for conditional visibility
      onSave: async (updatedAccounts) => {
        await saveAccounts(currentScenario.id, updatedAccounts);
        console.log('[Forecast] Accounts saved');
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

  const fs = window.require('fs').promises;
  const schemaPath = process.cwd() + '/assets/planned-transactions-grid.json';

  try {
    const schemaFile = await fs.readFile(schemaPath, 'utf8');
    const schema = JSON.parse(schemaFile);

    // Inject accounts as options for account selectors
    schema.accounts = currentScenario.accounts || [];

    const grid = new EditableGrid({
      targetElement: container,
      tableHeader: 'Planned Transactions',
      schema: schema,
      data: currentScenario.plannedTransactions || [],
      scenarioContext: currentScenario, // Pass scenario context for conditional visibility
      onSave: async (updatedTransactions) => {
        await savePlannedTransactions(currentScenario.id, updatedTransactions);
        console.log('[Forecast] Planned transactions saved');
      }
    });

    await grid.render();
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

  const fs = window.require('fs').promises;
  const schemaPath = process.cwd() + '/assets/actual-transactions-grid.json';

  try {
    const schemaFile = await fs.readFile(schemaPath, 'utf8');
    const schema = JSON.parse(schemaFile);

    // Inject accounts as options for account selectors
    schema.accounts = currentScenario.accounts || [];

    const grid = new EditableGrid({
      targetElement: container,
      tableHeader: 'Actual Transactions',
      schema: schema,
      data: currentScenario.actualTransactions || [],
      scenarioContext: currentScenario, // Pass scenario context
      onSave: async (updatedTransactions) => {
        await saveActualTransactions(currentScenario.id, updatedTransactions);
        console.log('[Forecast] Actual transactions saved');
      }
    });

    await grid.render();
  } catch (err) {
    console.error('[Forecast] Failed to load actual transactions grid:', err);
  }
}

// Load projections section
async function loadProjectionsSection(container) {
  if (!currentScenario) return;

  const typeConfig = getScenarioTypeConfig();
  if (!typeConfig || !typeConfig.showProjections) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';

  // Add generate button
  const generateButton = document.createElement('button');
  generateButton.className = 'btn';
  generateButton.textContent = 'Generate Projections';
  generateButton.style.marginBottom = '20px';
  generateButton.style.padding = '12px 24px';
  generateButton.style.fontSize = '1.04em';
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
  window.add(container, generateButton);

  // Add clear button
  const clearButton = document.createElement('button');
  clearButton.className = 'btn';
  clearButton.textContent = 'Clear Projections';
  clearButton.style.marginBottom = '20px';
  clearButton.style.marginLeft = '10px';
  clearButton.style.padding = '12px 24px';
  clearButton.style.fontSize = '1.04em';
  clearButton.addEventListener('click', async () => {
    try {
      await clearProjections(currentScenario.id);
      currentScenario = await getScenario(currentScenario.id);
      await loadProjectionsGrid(projectionsGridContainer);
    } catch (err) {
      console.error('[Forecast] Failed to clear projections:', err);
    }
  });
  window.add(container, clearButton);

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
  const schemaPath = process.cwd() + '/assets/projections-grid.json';

  try {
    const schemaFile = await fs.readFile(schemaPath, 'utf8');
    const schema = JSON.parse(schemaFile);

    const grid = new EditableGrid({
      targetElement: container,
      tableHeader: 'Projections',
      schema: schema,
      data: currentScenario.projections || [],
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
    projectionsSection: getEl('projectionsSection')
  };

  await loadAccountsGrid(containers.accountsTable);
  await loadPlannedTransactionsGrid(containers.plannedTransactionsTable);
  await loadActualTransactionsGrid(containers.actualTransactionsTable);
  await loadProjectionsSection(containers.projectionsSection);
}

// Initialize the page
async function init() {
  loadGlobals();
  
  const containers = buildGridContainer();
  
  await loadScenarioTypes();
  await buildScenarioSelector(containers.scenarioSelector);
  
  if (currentScenario) {
    await loadScenarioData();
  }
}

init();
