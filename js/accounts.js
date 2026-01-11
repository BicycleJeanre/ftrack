// accounts.js
// Accounts page using Tabulator and new manager architecture

import { createGrid, createSelectorColumn, createTextColumn, createObjectColumn, createMoneyColumn, createDateColumn } from './grid-factory.js';
import * as AccountManager from './managers/account-manager.js';
import { loadGlobals } from './global-app.js';
import { getSelectedScenarioId } from './config.js';

let accountsTable = null;

/**
 * Build the main container for the accounts grid
 */
function buildGridContainer() {
    const accountsEl = getEl('panel-accounts');

    // Header with accordion
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

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.id = 'accounts-toolbar';
    toolbar.style.marginBottom = '15px';
    toolbar.style.display = 'flex';
    toolbar.style.gap = '10px';
    toolbar.innerHTML = `
        <button id="add-account-btn" class="btn btn-primary">Add Account</button>
        <button id="delete-account-btn" class="btn" disabled>Delete Selected</button>
        <span style="flex-grow: 1;"></span>
        <span id="selected-count" class="text-muted"></span>
    `;
    window.add(content, toolbar);

    // Table container
    const tableContainer = document.createElement('div');
    tableContainer.id = 'accountsTable';
    window.add(content, tableContainer);

    return tableContainer;
}

/**
 * Initialize Tabulator grid
 */
async function initializeGrid(tableElement) {
    const scenarioId = getSelectedScenarioId();
    if (!scenarioId) {
        console.error('[Accounts] No scenario selected');
        return;
    }

    // Define options inline instead of loading from schema file
    const accountTypes = [
        { id: 1, name: 'Asset' },
        { id: 2, name: 'Liability' },
        { id: 3, name: 'Equity' },
        { id: 4, name: 'Income' },
        { id: 5, name: 'Expense' }
    ];

    const currencies = [
        { id: 1, name: 'ZAR' },
        { id: 2, name: 'USD' },
        { id: 3, name: 'EUR' },
        { id: 4, name: 'GBP' }
    ];

    const accountsData = await AccountManager.getAll(scenarioId);

    accountsTable = createGrid(tableElement, {
        data: accountsData,
        columns: [
            createSelectorColumn(),
            createTextColumn('Account Name', 'name', { widthGrow: 3, editor: "input" }),
            {
                title: "Type",
                field: "type",
                widthGrow: 2,
                editor: "list",
                editorParams: {
                    values: accountTypes.map(t => ({ label: t.name, value: t }))
                },
                formatter: (cell) => cell.getValue()?.name || '',
                headerFilter: "input",
                headerFilterFunc: "like",
                headerFilterPlaceholder: "Filter...",
                headerHozAlign: "left"
            },
            {
                title: "Currency",
                field: "currency",
                width: 120,
                editor: "list",
                editorParams: {
                    values: currencies.map(c => ({ label: c.name, value: c }))
                },
                formatter: (cell) => cell.getValue()?.name || '',
                headerFilter: "input",
                headerFilterFunc: "like",
                headerFilterPlaceholder: "Filter...",
                headerHozAlign: "left"
            },
            createMoneyColumn('Opening Balance', 'balance', { widthGrow: 2, editor: "number", editorParams: { step: 0.01 } }),
            createDateColumn('Open Date', 'openDate', { widthGrow: 2, editor: "date" }),
            {
                title: "Periodic Change",
                field: "periodicChange",
                formatter: (cell) => {
                    const value = cell.getValue();
                    if (value?.value !== undefined) {
                        return `${value.value}% (${value.changeType?.name || 'N/A'})`;
                    }
                    return '<span style="color: #999;">None</span>';
                },
                headerSort: false,
                widthGrow: 2,
                headerHozAlign: "left"
            }
        ],
        rowSelectionChanged: (data, rows) => updateToolbar(rows.length),
        cellEdited: async () => {
            try {
                await AccountManager.saveAll(scenarioId, accountsTable.getData());
                console.log('[Accounts] Saved successfully');
            } catch (err) {
                console.error('[Accounts] Save failed:', err);
                alert('Failed to save account: ' + err.message);
            }
        }
    });

    wireToolbarEvents();
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
 * Wire up toolbar button events
 */
function wireToolbarEvents() {
    const addBtn = document.getElementById('add-account-btn');
    const deleteBtn = document.getElementById('delete-account-btn');
    
    if (addBtn) {
        addBtn.addEventListener('click', () => addNewAccount());
    }
    
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => deleteSelectedAccounts());
    }
}

/**
 * Add a new account row
 */
async function addNewAccount() {
    const scenarioId = getSelectedScenarioId();
    
    const newAccount = {
        id: 0,
        name: 'New Account',
        type: { id: 1, name: 'Asset' },
        currency: { id: 1, name: 'ZAR' },
        balance: 0,
        openDate: new Date().toISOString().slice(0, 10),
        periodicChange: null
    };
    
    try {
        const row = await accountsTable.addRow(newAccount, true);
        row.getCell('name').edit();
        await AccountManager.saveAll(scenarioId, accountsTable.getData());
    } catch (err) {
        console.error('[Accounts] Failed to add account:', err);
        alert('Failed to add account: ' + err.message);
    }
}

/**
 * Delete selected accounts
 */
async function deleteSelectedAccounts() {
    const selectedRows = accountsTable.getSelectedRows();
    if (selectedRows.length === 0) return;
    
    if (!window.confirm(`Delete ${selectedRows.length} account(s)?`)) return;
    
    try {
        const scenarioId = getSelectedScenarioId();
        selectedRows.forEach(row => row.delete());
        await AccountManager.saveAll(scenarioId, accountsTable.getData());
        updateToolbar(0);
    } catch (err) {
        console.error('[Accounts] Failed to delete accounts:', err);
        alert('Failed to delete accounts: ' + err.message);
    }
}

// Initialize
loadGlobals();
const tableElement = buildGridContainer();
await initializeGrid(tableElement);
