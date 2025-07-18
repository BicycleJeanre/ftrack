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

// Map file format to grid format
function mapAccountFromFile(fileAccount) {
    const gridAccount = {
        id: fileAccount.id,
        name: fileAccount.name,
        type: fileAccount.type,
        currency: fileAccount.currency || 'ZAR',
        balance: fileAccount.balance || fileAccount.start_amount || 0,
        current_balance: fileAccount.current_balance || fileAccount.balance || fileAccount.start_amount || 0,
        interest_data: []
    };

    // Map interest data if it exists
    if (fileAccount.interest_data && Array.isArray(fileAccount.interest_data)) {
        gridAccount.interest_data = fileAccount.interest_data;
    } else if (fileAccount.interest && typeof fileAccount.interest === 'object') {
        // Convert old interest format to new format
        gridAccount.interest_data = [{
            presetOption: fileAccount.interest.presetOption || 'Custom',
            nominalRate: fileAccount.interest.nominalRate || 0,
            effectiveRate: fileAccount.interest.effectiveRate || 0,
            nominalRatePeriod: fileAccount.interest.nominalRatePeriod || 'Annually',
            calculationMethod: fileAccount.interest.calculationMethod || 'Simple',
            compoundingInterval: fileAccount.interest.compoundingInterval || 'Monthly'
        }];
    }

    return gridAccount;
}

// Map grid format back to file format
function mapAccountToFile(gridAccount, originalFileAccount = {}) {
    const fileAccount = {
        // Preserve original file fields
        id: gridAccount.id || originalFileAccount.id || getNextAccountId(),
        name: gridAccount.name,
        type: gridAccount.type,
        currency: gridAccount.currency || 'ZAR',
        
        // Preserve original file structure and only update what's needed
        start_amount: originalFileAccount.start_amount !== undefined ? originalFileAccount.start_amount : gridAccount.balance || 0,
        balance: gridAccount.balance || 0,
        current_balance: gridAccount.current_balance || gridAccount.balance || 0,
        balance_as_of: originalFileAccount.balance_as_of || new Date().toISOString().split('T')[0],
        date_created: originalFileAccount.date_created || new Date().toISOString().split('T')[0]
    };

    // Handle interest data - only save the interest object (not interest_data array)
    if (gridAccount.interest_data && gridAccount.interest_data.length > 0) {
        // Use the first interest data item to create the interest object
        fileAccount.interest = gridAccount.interest_data[0];
    } else if (originalFileAccount.interest && typeof originalFileAccount.interest === 'object') {
        // Keep the original interest structure
        fileAccount.interest = originalFileAccount.interest;
    } else {
        // Default interest structure
        fileAccount.interest = {
            presetOption: 'Custom',
            nominalRate: 0,
            effectiveRate: 0,
            nominalRatePeriod: 'Annually',
            calculationMethod: 'Simple',
            compoundingInterval: 'Monthly'
        };
    }

    // Don't save interest_data to file - only the interest object
    // This prevents the duplication issue

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
    
    // Get the current account from grid data
    const currentAccount = grid.data[idx];
    
    if (!currentAccount.id) {
        // New account - add to global data
        const originalAccount = null; // No original for new accounts
        const fileAccount = mapAccountToFile(currentAccount, originalAccount);
        fileAccount.id = getNextAccountId();
        window.globalAppData.accounts.push(fileAccount);
    } else {
        // Update existing account - preserve original structure
        const existingIndex = window.globalAppData.accounts.findIndex(a => a.id == currentAccount.id);
        if (existingIndex !== -1) {
            const originalAccount = window.globalAppData.accounts[existingIndex];
            const updatedAccount = mapAccountToFile(currentAccount, originalAccount);
            window.globalAppData.accounts[existingIndex] = updatedAccount;
        }
    }
    
    // Update window.accounts with mapped data for grid compatibility
    window.accounts = window.globalAppData.accounts.map(account => mapAccountFromFile(account));
    
    // Save to file using the filemgmt module
    if (window.filemgmt && window.filemgmt.saveAppDataToFile) {
        window.filemgmt.saveAppDataToFile(window.globalAppData);
    }
    
    console.log('[Accounts] window.accounts updated with file format, count:', window.accounts.length);
    
    // Don't call afterDataChange here as it will also trigger a save
    // if (typeof window.afterDataChange === 'function') {
    //     console.log('[Accounts] Calling window.afterDataChange()');
    //     window.afterDataChange();
    // }
    console.log('[Accounts] Save process complete for idx=' + idx);
}

function deleteAccount(idx, row, grid) {
    // Get the account to delete
    const accountToDelete = grid.data[idx];
    
    if (accountToDelete.id) {
        // Remove from global data
        const existingIndex = window.globalAppData.accounts.findIndex(a => a.id == accountToDelete.id);
        if (existingIndex !== -1) {
            window.globalAppData.accounts.splice(existingIndex, 1);
        }
    }
    
    // Update window.accounts with mapped data for grid compatibility
    window.accounts = window.globalAppData.accounts.map(account => mapAccountFromFile(account));
    
    // Save to file using the filemgmt module
    if (window.filemgmt && window.filemgmt.saveAppDataToFile) {
        window.filemgmt.saveAppDataToFile(window.globalAppData);
    }
    
    // Don't call afterDataChange here as it will also trigger a save
    // if (typeof window.afterDataChange === 'function') {
    //     window.afterDataChange();
    // }
}

// --- Main Page Initialization ---
async function initializeAccountsPage() {
    // Convert file format to grid format (in memory only)
    const gridAccounts = (window.accounts || []).map(fileAccount => mapAccountFromFile(fileAccount));

    // Load the schema
    const schema = await loadAccountsGridSchema();
    if (!schema) {
        console.error('Failed to load accounts grid schema');
        return;
    }

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

    // Add custom render function for current_balance
    const currentBalanceColumn = schema.mainGrid.columns.find(col => col.field === 'current_balance');
    if (currentBalanceColumn) {
        currentBalanceColumn.render = (acct) => {
            const balance = acct.current_balance ?? acct.balance ?? 0;
            const currency = acct.currency || 'ZAR'; // Default to South African Rands
            return balance.toLocaleString('en-ZA', { style: 'currency', currency: currency });
        };
    }

    // Add custom render function for balance
    const balanceColumn = schema.mainGrid.columns.find(col => col.field === 'balance');
    if (balanceColumn) {
        balanceColumn.render = (acct) => {
            const balance = acct.balance ?? 0;
            const currency = acct.currency || 'ZAR'; // Default to South African Rands
            return balance.toLocaleString('en-ZA', { style: 'currency', currency: currency });
        };
    }

    // Add custom render function for interest
    const interestColumn = schema.mainGrid.columns.find(col => col.field === 'interest');
    if (interestColumn) {
        interestColumn.render = (acct) => {
            // Check if account has interest data
            if (!acct.interest_data || acct.interest_data.length === 0) {
                return '<span style="color:#888">None</span>';
            }
            
            const interestData = acct.interest_data[0]; // Use first interest setting
            const rate = interestData.nominalRate || interestData.effectiveRate || 0;
            if (rate === 0) return '<span style="color:#888">None</span>';
            
            const method = interestData.calculationMethod || 'Simple';
            const preset = interestData.presetOption || 'Custom';
            
            if (preset !== 'Custom') {
                return `${rate}% ${preset}`;
            }
            
            return `${rate}% ${method}`;
        };
    }

    const grid = new EditableGrid({
        targetElement: table,
        schema: schema,
        data: gridAccounts, // Use the mapped grid format data
        onSave: saveAccount,
        onAfterSave: () => {
            console.log('[Accounts] onAfterSave: updating transaction options');
            window.updateTxnAccountOptions();
            console.log('[Accounts] Transaction options updated after save.');
        },
        onDelete: (idx, row, gridInstance) => {
            deleteAccount(idx, row, gridInstance);
        },
        onAfterDelete: (idx, row, gridInstance) => {
            window.updateTxnAccountOptions();
        },
        actions: { add: true, edit: true, delete: true }
    });

    window.renderAccounts = function() {
        // Map file format to grid format when rendering
        const gridAccounts = (window.accounts || []).map(fileAccount => mapAccountFromFile(fileAccount));
        grid.data = gridAccounts;
        grid.render();
        window.updateTxnAccountOptions();
    };

    window.renderAccounts();
}

// --- Initialization: Only after data is loaded ---
async function tryInitAccountsPage() {
    const init = async () => {
        // No migration needed - mapping handles format conversion
        await initializeAccountsPage();
    };

    document.addEventListener('appDataLoaded', init, { once: true });
    if (window.accounts && Array.isArray(window.accounts)) {
        await init();
    }
}

tryInitAccountsPage();
