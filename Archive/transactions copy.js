// This script manages the Transactions page (/pages/transactions.html).
// It uses the EditableGrid module to render and manage the transactions table.

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
    if (typeof window.updateTxnTransactionOptions === 'undefined') {
        window.updateTxnTransactionOptions = () => {};
    }
}

// --- Schema Loading ---
async function loadTransactionsGridSchema() {
    try {
        const response = await fetch('../assets/transactions-grid.json');
        if (!response.ok) throw new Error('Failed to load transactions grid schema');
        return await response.json();
    } catch (error) {
        console.error('Error loading transactions grid schema:', error);
        return null;
    }
}

// // --- Transaction Data Management ---
// function getTransactions() {
//     return window.transactions || [];
// }

// // Map file format to grid format dynamically using schema
// function mapTransactionFromFile(fileTransaction, schemaColumns) {
//     const gridTransaction = {};
//     schemaColumns.forEach(col => {
//         const path = col.field;
//         // Support nested field access (dot notation)
//         const value = path.split('.').reduce((obj, key) => obj && obj[key], fileTransaction);
//         gridTransaction[path] = value !== undefined ? value : (col.default !== undefined ? col.default : '');
//     });
//     return gridTransaction;
// }

// Map grid format back to file format dynamically using schema
function mapTransactionToFile(gridTransaction, schemaColumns, originalFileTransaction = {}) {
    if (!originalFileTransaction) originalFileTransaction = {};
    const fileTransaction = { ...originalFileTransaction };
    schemaColumns.forEach(col => {
        const path = col.field;
        // Support nested field set (dot notation)
        const keys = path.split('.');
        let target = fileTransaction;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!target[keys[i]]) target[keys[i]] = {};
            target = target[keys[i]];
        }
        target[keys[keys.length - 1]] = gridTransaction[path] !== undefined ? gridTransaction[path] : (col.default !== undefined ? col.default : '');
    });
    return fileTransaction;
}

// Generate next available ID
function getNextTransactionId() {
    const transactions = window.globalAppData?.transactions || window.transactions || [];
    const existingIds = transactions.map(acc => acc.id || 0);
    return Math.max(0, ...existingIds) + 1;
}

function saveTransaction(idx, data, row, grid) {
    console.log(`[Transactions] saveTransaction called for idx=${idx}`, 'data:', data);
    console.log('[Transactions] Current window.globalAppData:', window.globalAppData);

    // Get the current transaction from grid data or data parameter for new rows
    let currentTransaction;
    if (idx === -1 || idx === 'new') {
        // New row - use the data parameter
        currentTransaction = data;
        console.log('[Transactions] New row - using data parameter:', currentTransaction);
    } else {
        // Existing row - use grid data
        currentTransaction = grid.data[idx];
        console.log('[Transactions] Existing row - using grid data:', currentTransaction);
    }

    console.log('[Transactions] Final currentTransaction:', currentTransaction);

    // Get schema columns from grid instance
    const schemaColumns = grid.columns || [];

    if (!currentTransaction || !currentTransaction.id) {
        // New transaction - add to global data
        console.log('[Transactions] Adding new transaction');
        if (!window.globalAppData) {
            console.error('[Transactions] window.globalAppData is not initialized!');
            return;
        }
        if (!window.globalAppData.transactions) {
            console.log('[Transactions] Initializing globalAppData.transactions array');
            window.globalAppData.transactions = [];
        }
        // Map grid transaction to file format using schema columns
        const fileTransaction = mapTransactionToFile(currentTransaction, schemaColumns);
        fileTransaction.id = getNextTransactionId();
        console.log('[Transactions] New file transaction:', fileTransaction);
        window.globalAppData.transactions.push(fileTransaction);
        console.log('[Transactions] globalAppData.transactions after push:', window.globalAppData.transactions);
    } else {
        // Update existing transaction - preserve original structure
        console.log('[Transactions] Updating existing transaction with id:', currentTransaction.id);
        const existingIndex = window.globalAppData.transactions.findIndex(a => a.id == currentTransaction.id);
        console.log('[Transactions] Found existing transaction at index:', existingIndex);
        if (existingIndex !== -1) {
            const originalTransaction = window.globalAppData.transactions[existingIndex];
            console.log('[Transactions] Original transaction:', originalTransaction);
            // Map grid transaction to file format using schema columns
            const updatedTransaction = mapTransactionToFile(currentTransaction, schemaColumns, originalTransaction);
            console.log('[Transactions] Updated transaction:', updatedTransaction);
            window.globalAppData.transactions[existingIndex] = updatedTransaction;
            console.log('[Transactions] globalAppData.transactions after update:', window.globalAppData.transactions);
        }
    }

    // Save to file using the filemgmt module
    console.log('[Transactions] Checking filemgmt availability:', !!window.filemgmt, !!window.filemgmt?.saveAppDataToFile);
    if (window.filemgmt && window.filemgmt.saveAppDataToFile) {
        console.log('[Transactions] Calling saveAppDataToFile with:', window.globalAppData);
        try {
            window.filemgmt.saveAppDataToFile(window.globalAppData);
            console.log('[Transactions] saveAppDataToFile completed successfully');
        } catch (error) {
            console.error('[Transactions] Error in saveAppDataToFile:', error);
        }
    } else {
        console.error('[Transactions] filemgmt or saveAppDataToFile not available!');
    }

    console.log('[Transactions] Save process complete for idx=' + idx);
}

function deleteTransaction(idx, row, grid) {
    console.log(`[Transactions] deleteTransaction called for idx=${idx}`);
    // Get the transaction to delete
    const transactionToDelete = grid.data[idx];
    console.log('[Transactions] Transaction to delete:', transactionToDelete);

    if (transactionToDelete && transactionToDelete.id) {
        // Remove from global data
        const existingIndex = window.globalAppData.transactions.findIndex(a => a.id == transactionToDelete.id);
        console.log('[Transactions] Found transaction in globalAppData at index:', existingIndex);
        if (existingIndex !== -1) {
            window.globalAppData.transactions.splice(existingIndex, 1);
            console.log('[Transactions] Removed from globalAppData, new count:', window.globalAppData.transactions.length);
        }
    }

    // Save to file using the filemgmt module
    if (window.filemgmt && window.filemgmt.saveAppDataToFile) {
        console.log('[Transactions] Saving to file after delete');
        window.filemgmt.saveAppDataToFile(window.globalAppData);
    }

    console.log('[Transactions] Delete process complete for idx=' + idx);
}

// --- Main Page Initialization ---
async function initializeTransactionsPage() {
    //.map(fileTransaction => mapTransactionFromFile(fileTransaction));

    // Load the schema
    const schema = await loadTransactionsGridSchema();
    if (!schema) {
        console.error('Failed to load transactions grid schema');
        return;
    }

    const panelHeader = document.createElement('div');
    panelHeader.className = 'panel-header';
    panelHeader.innerHTML = `<h2>Transactions</h2><span class="panel-arrow">&#9662;</span>`;
    panelHeader.addEventListener('click', () => window.toggleAccordion('panel-transactions'));
    const headerEl = getEl('transactions-panel-header');
    if (headerEl) {
        headerEl.replaceWith(panelHeader);
    } else {
        console.warn('[Transactions] transactions-panel-header not found, skipping replaceWith.');
    }

    const table = getEl('transactionsTable');
    if (!table) return;

    // Assign custom render functions dynamically based on schema
    schema.mainGrid.columns.forEach(col => {
        if (col.customDisplay) {
            col.render = (row) => {
                return Object.entries(col.customDisplay)
                    .map(([label, path]) => {
                        // Support nested field access (dot notation)
                        const value = path.split('.').reduce((obj, key) => obj && obj[key], row);
                        return `${label}: ${value ?? ''}`;
                    })
                    .join(' | ');
            };
        } else if (col.type === 'currency') {
            col.render = (row) => {
                const value = row[col.field] ?? 0;
                const currency = row.currency || 'ZAR';
                return value.toLocaleString('en-ZA', { style: 'currency', currency });
            };
        }
    });
    // Convert file format to grid format (in memory only)
    const gridTransactions = window.transactions ? window.transactions : []
    // --- Editable Grid Setup ---
    const grid = new EditableGrid({
        targetElement: table, // Pass the table element as targetElement
        schema: schema, 
        columns: schema.mainGrid.columns,
        data: gridTransactions,
        onSave: saveTransaction,
        onDelete: deleteTransaction,
    });

    grid.render();
    console.log('[Transactions] Grid initialized and rendered');
}

// --- Initialize the page ---
initializeTransactionsPage().catch(error => console.error('Error initializing transactions page:', error));
