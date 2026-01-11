// accounts-poc.js
// Proof of Concept: Accounts page using Tabulator.js
// Demonstrates simplified grid implementation with proper structure

import { TabulatorFull as Tabulator } from '../node_modules/tabulator-tables/dist/js/tabulator_esm.min.js';
import { loadGlobals } from './global-app.js';
import { getAppDataPath } from './app-paths.js';

let accountsTable = null;

/**
 * Build the main container for the accounts grid
 */
function buildGridContainer() {
    const accountsEl = getEl('panel-accounts');

    // Create header with foldable content    
    const panelHeader = document.createElement('div');
    panelHeader.className = 'bg-main bordered rounded shadow-lg pointer flex-between accordion-header';
    panelHeader.innerHTML = `<h2 class="text-main">Accounts</h2><span class="accordion-arrow">&#9662;</span>`;
    panelHeader.addEventListener('click', () => window.toggleAccordion('content'));
    window.add(accountsEl, panelHeader);

    // Foldable content
    const content = document.createElement('div');
    content.id = 'content';
    content.className = 'bg-main rounded shadow-md accordion-content';
    content.style.display = 'block';
    content.style.padding = '18px 20px 20px 20px';
    window.add(accountsEl, content);

    // Toolbar for actions
    const toolbar = document.createElement('div');
    toolbar.id = 'accounts-toolbar';
    toolbar.style.marginBottom = '15px';
    toolbar.style.display = 'flex';
    toolbar.style.gap = '10px';
    toolbar.innerHTML = `
        <span class="text-muted">POC - Read Only View (First Scenario)</span>
        <span style="flex-grow: 1;"></span>
        <span id="selected-count" class="text-muted"></span>
    `;
    window.add(content, toolbar);

    // Create table container
    const tableContainer = document.createElement('div');
    tableContainer.id = 'accountsTable';
    window.add(content, tableContainer);

    return tableContainer;
}

/**
 * Load account types and currencies from schema
 */
async function loadSchemaOptions() {
    const fs = window.require('fs').promises;
    const path = window.require('path');
    const schemaPath = path.join(__dirname, '..', 'assets', 'accounts-grid-unified.json');

    try {
        const schemaFile = await fs.readFile(schemaPath, 'utf8');
        const schema = JSON.parse(schemaFile);
        return {
            accountTypes: schema.accountTypes || [],
            currencies: schema.currencies || [],
            periodicChangeTypes: schema.periodicChangeTypes || [],
            changeModes: schema.changeModes || []
        };
    } catch (err) {
        console.error('Failed to load schema:', err);
        return {
            accountTypes: [],
            currencies: [],
            periodicChangeTypes: [],
            changeModes: []
        };
    }
}

/**
 * Create Tabulator column definitions
 */
function createColumnDefinitions(options) {
    return [
        // Row selector column
        {
            formatter: "rowSelection",
            titleFormatter: "rowSelection",
            headerSort: false,
            cellClick: function(e, cell) {
                cell.getRow().toggleSelect();
            },
            width: 50,
            hozAlign: "center",
            headerHozAlign: "center"
        },
        
        // Account Name
        {
            title: "Account Name",
            field: "name",
            headerSort: true,
            headerFilter: "input",
            widthGrow: 3,
            headerHozAlign: "left"
        },
        
        // Account Type
        {
            title: "Type",
            field: "type",
            formatter: function(cell) {
                const value = cell.getValue();
                if (value && value.name) return value.name;
                return value || '';
            },
            headerSort: true,
            headerFilter: "input",
            headerFilterFunc: function(headerValue, rowValue, rowData, filterParams) {
                const typeName = rowValue?.name || '';
                return typeName.toLowerCase().includes(headerValue.toLowerCase());
            },
            widthGrow: 2,
            headerHozAlign: "left"
        },
        
        // Currency
        {
            title: "Currency",
            field: "currency",
            formatter: function(cell) {
                const value = cell.getValue();
                if (value && value.name) return value.name;
                return value || '';
            },
            headerSort: true,
            headerFilter: "input",
            headerFilterFunc: function(headerValue, rowValue, rowData, filterParams) {
                const currName = rowValue?.name || '';
                return currName.toLowerCase().includes(headerValue.toLowerCase());
            },
            width: 120,
            headerHozAlign: "left"
        },
        
        // Opening Balance
        {
            title: "Opening Balance",
            field: "balance",
            formatter: "money",
            formatterParams: {
                decimal: ".",
                thousand: ",",
                precision: 2
            },
            hozAlign: "right",
            headerHozAlign: "right",
            widthGrow: 2
        },
        
        // Open Date
        {
            title: "Open Date",
            field: "openDate",
            headerSort: true,
            widthGrow: 2,
            headerHozAlign: "left"
        },
        
        // Periodic Change
        {
            title: "Periodic Change",
            field: "periodicChange",
            formatter: function(cell) {
                const value = cell.getValue();
                if (value && value.value !== undefined) {
                    return `${value.value}% (${value.changeType?.name || 'N/A'})`;
                }
                return '<span style="color: #999;">None</span>';
            },
            headerSort: false,
            widthGrow: 2,
            headerHozAlign: "left"
        }
    ];
}

/**
 * Initialize Tabulator grid - POC: just load first scenario's accounts
 */
async function initializeGrid(tableElement) {
    console.log('[Tabulator POC] Initializing grid...');
    
    // Load first scenario from data file directly
    const fs = window.require('fs').promises;
    const dataPath = getAppDataPath();
    const appDataFile = await fs.readFile(dataPath, 'utf8');
    const appData = JSON.parse(appDataFile);
    
    const firstScenario = appData.scenarios[0];
    console.log('[Tabulator POC] Loaded scenario:', firstScenario.name);
    
    const accountsData = firstScenario.accounts || [];
    console.log('[Tabulator POC] Loaded', accountsData.length, 'accounts');
    
    const options = await loadSchemaOptions();

    accountsTable = new Tabulator(tableElement, {
        data: accountsData,
        layout: "fitDataStretch",
        responsiveLayout: "hide",
        columns: createColumnDefinitions(options),
        
        // Selection
        selectable: true,
        selectableRangeMode: "click",
        
        // Row selection handling
        rowSelectionChanged: function(data, rows) {
            updateToolbar(rows.length);
        },
        
        // Filtering
        headerFilterPlaceholder: "Filter...",
        
        // Styling
        maxHeight: "600px",
        rowHeight: 42,
        headerVisible: true,
        
        // Placeholder for empty table
        placeholder: "No accounts found in first scenario."
    });

    console.log('[Tabulator POC] Grid initialized successfully');
}

/**
 * Update toolbar based on selection
 */
function updateToolbar(selectedCount) {
    const deleteBtn = document.getElementById('delete-account-btn');
    const countSpan = document.getElementById('selected-count');
    
    if (deleteBtn) {
        deleteBtn.disabled = selectedCount === 0;
    }
    
    if (countSpan) {
        countSpan.textContent = selectedCount > 0 ? `${selectedCount} selected` : '';
    }
}

/**
 * Wire up toolbar button events - POC: disabled for now
 */
function wireToolbarEvents() {
    const addBtn = document.getElementById('add-account-btn');
    const deleteBtn = document.getElementById('delete-account-btn');
    
    if (addBtn) {
        addBtn.disabled = true;
        addBtn.title = 'POC - Read only';
    }
    
    if (deleteBtn) {
        deleteBtn.disabled = true;
    }
}

// Initialize
loadGlobals();
const tableElement = buildGridContainer();
await initializeGrid(tableElement);

console.log('[Tabulator POC] Accounts grid initialized');
