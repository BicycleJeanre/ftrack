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
    // Handle null originalFileAccount
    if (!originalFileAccount) {
        originalFileAccount = {};
    }
    
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
    
    if (!currentAccount || !currentAccount.id) {
        // New account - add to global data
        console.log('[Accounts] Adding new account');
        
        // Ensure globalAppData exists and has accounts array
        if (!window.globalAppData) {
            console.error('[Accounts] window.globalAppData is not initialized!');
            return;
        }
        if (!window.globalAppData.accounts) {
            console.log('[Accounts] Initializing globalAppData.accounts array');
            window.globalAppData.accounts = [];
        }
        
        const originalAccount = null; // No original for new accounts
        const fileAccount = mapAccountToFile(currentAccount, originalAccount);
        fileAccount.id = getNextAccountId();
        console.log('[Accounts] New file account:', fileAccount);
        window.globalAppData.accounts.push(fileAccount);
        console.log('[Accounts] globalAppData.accounts after push:', window.globalAppData.accounts);
    } else {
        // Update existing account - preserve original structure
        console.log('[Accounts] Updating existing account with id:', currentAccount.id);
        const existingIndex = window.globalAppData.accounts.findIndex(a => a.id == currentAccount.id);
        console.log('[Accounts] Found existing account at index:', existingIndex);
        if (existingIndex !== -1) {
            const originalAccount = window.globalAppData.accounts[existingIndex];
            console.log('[Accounts] Original account:', originalAccount);
            const updatedAccount = mapAccountToFile(currentAccount, originalAccount);
            console.log('[Accounts] Updated account:', updatedAccount);
            window.globalAppData.accounts[existingIndex] = updatedAccount;
            console.log('[Accounts] globalAppData.accounts after update:', window.globalAppData.accounts);
        }
    }
    
    // Update window.accounts with mapped data for grid compatibility
    window.accounts = window.globalAppData.accounts.map(account => mapAccountFromFile(account));
    console.log('[Accounts] Updated window.accounts:', window.accounts);
    
    // Save to file using the filemgmt module
    console.log('[Accounts] Checking filemgmt availability:', !!window.filemgmt, !!window.filemgmt?.saveAppDataToFile);
    if (window.filemgmt && window.filemgmt.saveAppDataToFile) {
        console.log('[Accounts] Calling saveAppDataToFile with:', window.globalAppData);
        try {
            window.filemgmt.saveAppDataToFile(window.globalAppData);
            console.log('[Accounts] saveAppDataToFile completed successfully');
        } catch (error) {
            console.error('[Accounts] Error in saveAppDataToFile:', error);
        }
    } else {
        console.error('[Accounts] filemgmt or saveAppDataToFile not available!');
    }
    
    console.log('[Accounts] window.accounts updated with file format, count:', window.accounts.length);
    

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
    
    // Update window.accounts with mapped data for grid compatibility
    window.accounts = window.globalAppData.accounts.map(account => mapAccountFromFile(account));
    console.log('[Accounts] Updated window.accounts, new count:', window.accounts.length);
    
    // Save to file using the filemgmt module
    if (window.filemgmt && window.filemgmt.saveAppDataToFile) {
        console.log('[Accounts] Saving to file after delete');
        window.filemgmt.saveAppDataToFile(window.globalAppData);
    }
    
    console.log('[Accounts] Delete process complete for idx=' + idx);
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
        onAfterSave: (idx, updatedData, row, gridInstance) => {
            console.log('[Accounts] onAfterSave: updating grid data and transaction options');
            // Update grid data with fresh mapped data after save (especially important for new accounts with generated IDs)
            const gridAccounts = (window.accounts || []).map(fileAccount => mapAccountFromFile(fileAccount));
            gridInstance.data = gridAccounts;
            console.log('[Accounts] Grid data updated after save, new count:', gridAccounts.length);
            
            // Force a complete re-render to ensure new ID is displayed
            gridInstance.render();
            console.log('[Accounts] Grid re-rendered after save');
            
            window.updateTxnAccountOptions();
            console.log('[Accounts] Transaction options updated after save.');
        },
        onDelete: (idx, row, gridInstance) => {
            deleteAccount(idx, row, gridInstance);
        },
        onAfterDelete: (idx, row, gridInstance) => {
            console.log('[Accounts] onAfterDelete: updating grid data');
            // Update grid data with fresh mapped data after delete
            const gridAccounts = (window.accounts || []).map(fileAccount => mapAccountFromFile(fileAccount));
            gridInstance.data = gridAccounts;
            console.log('[Accounts] Grid data updated, new count:', gridAccounts.length);
            
            // Force a complete re-render to ensure deleted row is removed
            gridInstance.render();
            console.log('[Accounts] Grid re-rendered after delete');
            
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
        console.log('[Accounts] Initializing accounts page');
        console.log('[Accounts] window.globalAppData available:', !!window.globalAppData);
        console.log('[Accounts] window.globalAppData content:', window.globalAppData);
        console.log('[Accounts] window.accounts available:', !!window.accounts);
        console.log('[Accounts] window.filemgmt available:', !!window.filemgmt);
        
        // Check if globalAppData is missing and create it from window data
        if (!window.globalAppData && window.accounts) {
            console.log('[Accounts] Creating globalAppData from window data');
            window.globalAppData = {
                profile: "Jeanre", // Default profile
                accounts: window.accounts || [],
                transactions: window.transactions || [],
                forecast: window.forecast || [],
                budget: window.budget || []
            };
            console.log('[Accounts] Created globalAppData:', window.globalAppData);
        }
        
        // No migration needed - mapping handles format conversion
        await initializeAccountsPage();
    };

    document.addEventListener('appDataLoaded', init, { once: true });
    if (window.accounts && Array.isArray(window.accounts)) {
        await init();
    }
}

tryInitAccountsPage();
