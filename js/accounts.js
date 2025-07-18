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
        const response = await fetch('./assets/accounts-grid.json');
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

function saveAccount(idx, data, row, grid) {
    console.log(`[Accounts] saveAccount called for idx=${idx}`);
    window.accounts = grid.data;
    console.log('[Accounts] window.accounts updated from grid.data');
    if (typeof window.afterDataChange === 'function') {
        console.log('[Accounts] Calling window.afterDataChange()');
        window.afterDataChange();
    }
    console.log('[Accounts] Save process complete for idx=' + idx);
}

function deleteAccount(idx, row, grid) {
    // No UI or confirmation here; UI handled by EditableGrid
    getAccounts().splice(idx, 1);
    window.afterDataChange();
}

// --- Main Page Initialization ---
async function initializeAccountsPage() {
    window.accounts = window.accounts || [];

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
            return balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
        };
    }

    // Add custom render function for balance
    const balanceColumn = schema.mainGrid.columns.find(col => col.field === 'balance');
    if (balanceColumn) {
        balanceColumn.render = (acct) => {
            const balance = acct.balance ?? 0;
            return balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
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
        data: getAccounts(),
        onSave: saveAccount,
        onAfterSave: () => {
            console.log('[Accounts] onAfterSave: refreshing grid from window.accounts');
            grid.data = getAccounts();
            grid.render();
            window.updateTxnAccountOptions();
            console.log('[Accounts] Grid refreshed after save.');
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
        grid.data = getAccounts();
        grid.render();
        window.updateTxnAccountOptions();
    };

    window.renderAccounts();
}

// --- Initialization: Only after data is loaded ---
async function tryInitAccountsPage() {
    const init = async () => {
        // Ensure accounts have current_balance and proper structure
        (window.accounts || []).forEach(acc => {
            if (acc.current_balance === undefined) {
                acc.current_balance = acc.balance;
            }
            // Ensure interest_data field exists for modal schema
            if (!acc.interest_data) {
                acc.interest_data = [];
            }
            // Migrate old interest format to new schema if needed
            if (acc.interest && !acc.interest_data.length) {
                acc.interest_data = [{
                    presetOption: 'Custom',
                    nominalRate: acc.interest || 0,
                    effectiveRate: acc.interest || 0,
                    nominalRatePeriod: 'Annually',
                    calculationMethod: acc.interest_type === 'compound' ? 'Compound' : 'Simple',
                    compoundingInterval: acc.compound_period || 'Monthly'
                }];
            }
        });
        await initializeAccountsPage();
    };

    document.addEventListener('appDataLoaded', init, { once: true });
    if (window.accounts && Array.isArray(window.accounts)) {
        await init();
    }
}

tryInitAccountsPage();
