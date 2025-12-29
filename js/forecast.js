// Budget & Forecast System UI
// Manages scenarios, planned transactions, and projections with primary account filtering

import { EditableGrid } from './editable-grid.js';
import { dataManager } from './data-manager.js';
import { ProjectionEngine } from './projection-engine.js';

// Global state
let scenarioGrid;
let plannedTransactionsGrid;
let projectionsGrid;
let activeScenarioId = null;
let activePrimaryAccountId = null;
let projectionEngine;

// Helper functions
function getEl(id) {
    return document.getElementById(id);
}

/**
 * Build the 3-section UI container
 */
function buildGridContainer() {
    const container = getEl('panel-forecast');
    if (!container) {
        console.error('panel-forecast element not found');
        return null;
    }

    container.innerHTML = `
        <div class="forecast-sections">
            <!-- Section 1: Scenarios -->
            <div class="section">
                <div class="section-header bg-main bordered rounded shadow-lg pointer flex-between accordion-header" id="scenarioHeader">
                    <h2 class="text-main">Scenarios</h2>
                    <div class="header-controls">
                        <button id="generateProjectionBtn" class="btn-primary" disabled>
                            Generate Projection
                        </button>
                        <span class="accordion-arrow">&#9662;</span>
                    </div>
                </div>
                <div class="section-content bg-main rounded shadow-md accordion-content" id="scenarioContent" style="display: block; padding: 18px 20px 20px 20px; margin-bottom: 20px;">
                    <div id="scenarioTableDiv"></div>
                </div>
            </div>

            <!-- Section 2: Planned Transactions -->
            <div class="section">
                <div class="section-header bg-main bordered rounded shadow-lg pointer flex-between accordion-header" id="plannedTxHeader">
                    <h2 class="text-main">Planned Transactions</h2>
                    <div class="filter-controls">
                        <label>Primary Account:</label>
                        <select id="primaryAccountFilter" disabled>
                            <option value="">Select scenario first...</option>
                        </select>
                        <span class="accordion-arrow">&#9662;</span>
                    </div>
                </div>
                <div class="section-content bg-main rounded shadow-md accordion-content" id="plannedTxContent" style="display: block; padding: 18px 20px 20px 20px; margin-bottom: 20px;">
                    <div id="plannedTxTableDiv"></div>
                </div>
            </div>

            <!-- Section 3: Projections -->
            <div class="section">
                <div class="section-header bg-main bordered rounded shadow-lg pointer flex-between accordion-header" id="projectionsHeader">
                    <h2 class="text-main">Projections</h2>
                    <div class="filter-info">
                        <span id="projectionInfo">No projections generated</span>
                        <span class="accordion-arrow">&#9662;</span>
                    </div>
                </div>
                <div class="section-content bg-main rounded shadow-md accordion-content" id="projectionsContent" style="display: block; padding: 18px 20px 20px 20px;">
                    <div id="projectionsTableDiv"></div>
                </div>
            </div>
        </div>
    `;

    // Add event listeners
    getEl('scenarioHeader').addEventListener('click', () => window.toggleAccordion('scenarioContent'));
    getEl('plannedTxHeader').addEventListener('click', () => window.toggleAccordion('plannedTxContent'));
    getEl('projectionsHeader').addEventListener('click', () => window.toggleAccordion('projectionsContent'));
    getEl('generateProjectionBtn').addEventListener('click', generateProjection);
    getEl('primaryAccountFilter').addEventListener('change', onPrimaryAccountFilterChange);

    return {
        scenarioTableDiv: getEl('scenarioTableDiv'),
        plannedTxTableDiv: getEl('plannedTxTableDiv'),
        projectionsTableDiv: getEl('projectionsTableDiv')
    };
}

/**
 * Initialize grids with schemas
 */
async function initializeGrids() {
    try {
        await dataManager.loadData();
        
        // Initialize projection engine
        projectionEngine = new ProjectionEngine(dataManager);

        // Load schemas
        const fs = window.require('fs').promises;
        const scenarioSchemaPath = process.cwd() + '/assets/scenario-grid.json';
        const plannedTxSchemaPath = process.cwd() + '/assets/planned-transactions-grid.json';
        const projectionsSchemaPath = process.cwd() + '/assets/projections-grid.json';

        const scenarioSchemaFile = await fs.readFile(scenarioSchemaPath, 'utf8');
        const scenarioSchema = JSON.parse(scenarioSchemaFile);

        const plannedTxSchemaFile = await fs.readFile(plannedTxSchemaPath, 'utf8');
        const plannedTxSchema = JSON.parse(plannedTxSchemaFile);

        const projectionsSchemaFile = await fs.readFile(projectionsSchemaPath, 'utf8');
        const projectionsSchema = JSON.parse(projectionsSchemaFile);

        // Inject dynamic account options
        const accounts = dataManager.cachedData.accounts || [];
        scenarioSchema.accounts = accounts.map(a => ({ id: a.id, name: a.name }));
        plannedTxSchema.accounts = accounts.map(a => ({ id: a.id, name: a.name }));

        // Create scenario grid
        const scenarioGridData = {
            targetElement: 'scenarioTableDiv',
            tableHeader: 'Scenarios',
            schema: scenarioSchema,
            data: dataManager.cachedData.scenarios || [],
            onSave: onScenarioSave,
            onDelete: onScenarioDelete,
            onRowSelect: onScenarioSelect,
            showActions: false
        };
        scenarioGrid = new EditableGrid(scenarioGridData);
        scenarioGrid.render();

        // Create planned transactions grid
        const plannedTxGridData = {
            targetElement: 'plannedTxTableDiv',
            tableHeader: 'Planned Transactions',
            schema: plannedTxSchema,
            data: [],
            onSave: onPlannedTransactionsSave,
            onDelete: onPlannedTransactionsDelete,
            showActions: false
        };
        plannedTransactionsGrid = new EditableGrid(plannedTxGridData);
        plannedTransactionsGrid.render();

        // Create projections grid (read-only)
        const projectionsGridData = {
            targetElement: 'projectionsTableDiv',
            tableHeader: 'Projections',
            schema: projectionsSchema,
            data: [],
            showActions: false
        };
        projectionsGrid = new EditableGrid(projectionsGridData);
        projectionsGrid.render();

        console.log('Forecast grids initialized successfully');
    } catch (err) {
        console.error('Failed to initialize forecast grids:', err);
    }
}

/**
 * Handle scenario selection
 */
async function onScenarioSelect(scenario) {
    console.log('Scenario selected:', scenario);
    activeScenarioId = scenario.id;

    // Enable controls
    getEl('generateProjectionBtn').disabled = false;
    getEl('primaryAccountFilter').disabled = false;

    // Populate primary account filter
    const accountFilter = getEl('primaryAccountFilter');
    accountFilter.innerHTML = '<option value="">All accounts</option>';

    if (scenario.accounts && scenario.accounts.length > 0) {
        scenario.accounts.forEach(acc => {
            const option = document.createElement('option');
            option.value = acc.id;
            option.textContent = acc.name + (acc.isPrimary ? ' (Primary)' : '');
            accountFilter.appendChild(option);
        });

        // Auto-select primary account
        const primaryAccount = scenario.accounts.find(a => a.isPrimary);
        if (primaryAccount) {
            accountFilter.value = primaryAccount.id;
            activePrimaryAccountId = primaryAccount.id;
        }
    }

    // Load planned transactions and projections
    await loadPlannedTransactions();
    await loadProjections();
}

/**
 * Handle primary account filter change
 */
async function onPrimaryAccountFilterChange(e) {
    activePrimaryAccountId = e.target.value ? parseInt(e.target.value) : null;
    await loadPlannedTransactions();
    await loadProjections();
}

/**
 * Load planned transactions for active scenario
 */
async function loadPlannedTransactions() {
    if (!activeScenarioId) {
        plannedTransactionsGrid.loadData([]);
        return;
    }

    let plannedTxs = dataManager.getPlannedTransactions(activeScenarioId);

    // Filter by primary account if selected
    if (activePrimaryAccountId) {
        plannedTxs = plannedTxs.filter(pt =>
            (pt.fromAccount && pt.fromAccount.id === activePrimaryAccountId) ||
            (pt.toAccount && pt.toAccount.id === activePrimaryAccountId)
        );
    }

    plannedTransactionsGrid.loadData(plannedTxs);
}

/**
 * Load projections for active scenario
 */
async function loadProjections() {
    if (!activeScenarioId) {
        projectionsGrid.loadData([]);
        getEl('projectionInfo').textContent = 'No projections generated';
        return;
    }

    let projections = dataManager.getProjections(activeScenarioId);

    // Filter by primary account and related accounts if selected
    if (activePrimaryAccountId) {
        // Get all accounts involved in transactions with primary account
        const plannedTxs = dataManager.getPlannedTransactions(activeScenarioId);
        const relatedAccountIds = new Set([activePrimaryAccountId]);

        plannedTxs.forEach(pt => {
            if (pt.fromAccount && pt.fromAccount.id === activePrimaryAccountId) {
                if (pt.toAccount) relatedAccountIds.add(pt.toAccount.id);
            }
            if (pt.toAccount && pt.toAccount.id === activePrimaryAccountId) {
                if (pt.fromAccount) relatedAccountIds.add(pt.fromAccount.id);
            }
        });

        projections = projections.filter(p => relatedAccountIds.has(p.accountId));
    }

    projectionsGrid.loadData(projections);

    if (projections.length > 0) {
        const scenario = dataManager.getScenario(activeScenarioId);
        const lastCalc = scenario?.lastCalculated
            ? new Date(scenario.lastCalculated).toLocaleString()
            : 'Unknown';
        getEl('projectionInfo').textContent =
            `${projections.length} projections | Last calculated: ${lastCalc}`;
    } else {
        getEl('projectionInfo').textContent = 'No projections generated';
    }
}

/**
 * Generate projection for active scenario
 */
async function generateProjection() {
    if (!activeScenarioId) {
        alert('Please select a scenario first');
        return;
    }

    const btn = getEl('generateProjectionBtn');
    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
        console.log('Starting projection generation...');
        await projectionEngine.generateProjections(activeScenarioId);
        await dataManager.loadData(); // Reload to get updated lastCalculated
        await loadProjections();
        alert('Projection generated successfully!');
    } catch (error) {
        console.error('Projection generation failed:', error);
        alert(`Projection generation failed: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Projection';
    }
}

/**
 * Handle scenario save
 */
async function onScenarioSave(updatedScenarios) {
    await dataManager.saveScenarios(updatedScenarios);
    // Reload if active scenario was modified
    if (activeScenarioId) {
        const scenario = dataManager.getScenario(activeScenarioId);
        if (scenario) {
            await onScenarioSelect(scenario);
        }
    }
}

/**
 * Handle scenario delete
 */
async function onScenarioDelete(scenarioId) {
    // Clear projections for deleted scenario
    await dataManager.clearProjections(scenarioId);

    // Remove planned transactions for deleted scenario
    await dataManager.loadData();
    dataManager.cachedData.plannedTransactions =
        (dataManager.cachedData.plannedTransactions || []).filter(pt => pt.scenarioId !== scenarioId);
    await dataManager.saveData();

    // Clear active scenario if it was deleted
    if (activeScenarioId === scenarioId) {
        activeScenarioId = null;
        activePrimaryAccountId = null;
        getEl('generateProjectionBtn').disabled = true;
        getEl('primaryAccountFilter').disabled = true;
        await loadPlannedTransactions();
        await loadProjections();
    }
}

/**
 * Handle planned transactions save
 */
async function onPlannedTransactionsSave(updatedPlannedTxs) {
    await dataManager.savePlannedTransactions(updatedPlannedTxs, activeScenarioId);
    await loadPlannedTransactions();
}

/**
 * Handle planned transactions delete
 */
async function onPlannedTransactionsDelete(plannedTxId) {
    // Reload - delete handled by grid
    await loadPlannedTransactions();
}

/**
 * Initialize the forecast page
 */
async function initialize() {
    console.log('Initializing Budget & Forecast System...');
    buildGridContainer();
    await initializeGrids();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
