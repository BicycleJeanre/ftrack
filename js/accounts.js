// This script manages the Accounts page (/pages/accounts.html).
// It uses the EditableGrid module to render and manage the accounts table.

import { EditableGrid } from './editable-grid.js';

// --- Global Helper Functions ---
if (typeof window !== 'undefined') {
    if (typeof window.getEl === 'undefined') {
        window.getEl = (id) => document.getElementById(id);
    }
    if (typeof window.toggleAccordion === 'undefined') {
        window.toggleAccordion = (id) => {
            const panel = document.getElementById(id);
            const content = panel.querySelector('.panel-content');
            content.style.display = (content.style.display === 'none') ? 'block' : 'none';
        };
    }
    if (typeof window.updateTxnAccountOptions === 'undefined') {
        window.updateTxnAccountOptions = () => {};
    }
}

// --- Schema Loading ---
async function loadAccountsGridSchema() {
    try {
        const response = await fetch('../assets/accounts-grid.json');
        if (!response.ok) throw new Error('Failed to load accounts grid schema');
        return await response.json();
    } catch (error) {
        console.error('Error loading accounts grid schema:', error);
        return null;
    }
}

// --- Account Data Management ---
function getAccounts() {
    return window.accounts || [];
}

// Map file format to grid format dynamically using schema
function mapAccountFromFile(fileAccount, schemaColumns) {
    const gridAccount = {};
    schemaColumns.forEach(col => {
        const path = col.field;
        // Support nested field access (dot notation)
        const value = path.split('.').reduce((obj, key) => obj && obj[key], fileAccount);
        gridAccount[path] = value !== undefined ? value : (col.default !== undefined ? col.default : '');
    });
    return gridAccount;
}

// Map grid format back to file format dynamically using schema
function mapAccountToFile(gridAccount, schemaColumns, originalFileAccount = {}) {
    if (!originalFileAccount) originalFileAccount = {};
    const fileAccount = { ...originalFileAccount };
    schemaColumns.forEach(col => {
        const path = col.field;
        // Support nested field set (dot notation)
        const keys = path.split('.');
        let target = fileAccount;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!target[keys[i]]) target[keys[i]] = {};
            target = target[keys[i]];
        }
        target[keys[keys.length - 1]] = gridAccount[path] !== undefined ? gridAccount[path] : (col.default !== undefined ? col.default : '');
    });
    return fileAccount;
}

// Generate next available ID
function getNextAccountId() {
    const accounts = window.globalAppData?.accounts || window.accounts || [];
    const existingIds = accounts.map(acc => acc.id || 0);
    return Math.max(0, ...existingIds) + 1;
}

function saveAccount(idx, data, row, grid) {
    console.log(`[Accounts] saveAccount called for idx=${idx}`, 'data:', data);
    console.log('[Accounts] Current window.globalAppData:', window.globalAppData);

    // Get the current account from grid data or data parameter for new rows
    let currentAccount;
    if (idx === -1 || idx === 'new') {
        // New row - use the data parameter
        currentAccount = data;
        console.log('[Accounts] New row - using data parameter:', currentAccount);
    } else {
        // Existing row - use grid data
        currentAccount = grid.data[idx];
        console.log('[Accounts] Existing row - using grid data:', currentAccount);
    }

    console.log('[Accounts] Final currentAccount:', currentAccount);

    // Get schema columns from grid instance
    const schemaColumns = grid.columns || [];

    if (!currentAccount || !currentAccount.id) {
        // New account - add to global data
        // console.log('[Accounts] Adding new account');
        // // if (!window.globalAppData) {
        // //     console.error('[Accounts] window.globalAppData is not initialized!');
        // //     return;
        // // }
        // // if (!window.globalAppData.accounts) {
        // //     console.log('[Accounts] Initializing globalAppData.accounts array');
        // //     window.globalAppData.accounts = [];
        // // }
        // // Map grid account to file format using schema columns
        // const fileAccount = mapAccountToFile(currentAccount, schemaColumns);
        // fileAccount.id = getNextAccountId();
        // console.log('[Accounts] New file account:', fileAccount);
        // window.globalAppData.accounts.push(fileAccount);
        // console.log('[Accounts] globalAppData.accounts after push:', window.globalAppData.accounts);
    } else {
        // const updatedData = {...schema, schema.mainGrid. }
        // Update existing account - preserve original structure
        // console.log('[Accounts] Updating existing account with id:', currentAccount.id);
        // const existingIndex = window.globalAppData.accounts.findIndex(a => a.id == currentAccount.id);
        // console.log('[Accounts] Found existing account at index:', existingIndex);
        // if (existingIndex !== -1) {
        //     const originalAccount = window.globalAppData.accounts[existingIndex];
        //     console.log('[Accounts] Original account:', originalAccount);
        //     // Map grid account to file format using schema columns
        //     const updatedAccount = mapAccountToFile(currentAccount, schemaColumns, originalAccount);
        //     console.log('[Accounts] Updated account:', updatedAccount);
        //     window.globalAppData.accounts[existingIndex] = updatedAccount;
        //     console.log('[Accounts] globalAppData.accounts after update:', window.globalAppData.accounts);
        // }
    }

    // Save to file using the filemgmt module
    // console.log('[Accounts] Checking filemgmt availability:', !window.filemgmt, !!window.filemgmt?.saveAppDataToFile);
    if (window.filemgmt && window.filemgmt.saveAppDataToFile) {
        // console.log('[Accounts] Calling saveAppDataToFile with:', window.globalAppData);
        try {
            window.filemgmt.saveAppDataToFile(window.globalAppData);
            console.log('[Accounts] saveAppDataToFile completed successfully');
        } catch (error) {
            console.error('[Accounts] Error in saveAppDataToFile:', error);
        }
    } else {
        console.error('[Accounts] filemgmt or saveAppDataToFile not available!');
    }

    console.log('[Accounts] Save process complete for idx=' + idx);
}

function deleteAccount(idx, row, grid) {
    console.log(`[Accounts] deleteAccount called for idx=${idx}`);
    // Get the account to delete
    const accountToDelete = grid.data[idx];
    console.log('[Accounts] Account to delete:', accountToDelete);

    if (accountToDelete && accountToDelete.id) {
        // Remove from global data
        const existingIndex = window.globalAppData.accounts.findIndex(a => a.id == accountToDelete.id);
        console.log('[Accounts] Found account in globalAppData at index:', existingIndex);
        if (existingIndex !== -1) {
            window.globalAppData.accounts.splice(existingIndex, 1);
            console.log('[Accounts] Removed from globalAppData, new count:', window.globalAppData.accounts.length);
        }
    }

    // Save to file using the filemgmt module
    if (window.filemgmt && window.filemgmt.saveAppDataToFile) {
        console.log('[Accounts] Saving to file after delete');
        window.filemgmt.saveAppDataToFile(window.globalAppData);
    }

    console.log('[Accounts] Delete process complete for idx=' + idx);
}

// --- Main Page Initialization ---
async function initializeAccountsPage() {
    //.map(fileAccount => mapAccountFromFile(fileAccount));

    // Load the schema
  

    const panelHeader = document.createElement('div');
    panelHeader.className = 'panel-header';
    panelHeader.innerHTML = `<h2>Accounts</h2><span class="panel-arrow">&#9662;</span>`;
    panelHeader.addEventListener('click', () => window.toggleAccordion('panel-accounts'));
    const headerEl = getEl('accounts-panel-header');
    if (headerEl) {
        headerEl.replaceWith(panelHeader);
    } else {
        console.warn('[Accounts] accounts-panel-header not found, skipping replaceWith.');
    }

    const table = getEl('accountsTable');
    if (!table) return;

    // Assign custom render functions dynamically based on schema
    // schema.mainGrid.columns.forEach(col => {
    //     if (col.customDisplay) {
    //         col.render = (row) => {
    //             return Object.entries(col.customDisplay)
    //                 .map(([label, path]) => {
    //                     // Support nested field access (dot notation)
    //                     const value = path.split('.').reduce((obj, key) => obj && obj[key], row);
    //                     return `${label}: ${value ?? ''}`;
    //                 })
    //                 .join(' | ');
    //         };
    //     } else if (col.type === 'currency') {
    //         col.render = (row) => {
    //             const value = row[col.field] ?? 0;
    //             const currency = row.currency || 'ZAR';
    //             return value.toLocaleString('en-ZA', { style: 'currency', currency });
    //         };
    //     }
    // });
    // Convert file format to grid format (in memory only)
    const gridAccounts = window.accounts ? window.accounts : []
    // --- Editable Grid Setup ---
    const grid = new EditableGrid({
        targetElement: table, // Pass the table element as targetElement
        schema: schema, 
        columns: schema.mainGrid.columns,
        data: gridAccounts,
        onSave: saveAccount,
        onDelete: deleteAccount,
    });

    grid.render();
    console.log('[Accounts] Grid initialized and rendered');
}

// --- Initialize the page ---
  const schema = await loadAccountsGridSchema();
    if (!schema) {
        console.error('Failed to load accounts grid schema');
    }
initializeAccountsPage().catch(error => console.error('Error initializing accounts page:', error));
