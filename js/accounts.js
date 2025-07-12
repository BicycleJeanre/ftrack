// This script manages the Accounts page (/pages/accounts.html).
// It uses the EditableGrid module to render and manage the accounts table.

import { InterestModal } from './modal-interest.js';
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

function deleteAccount(idx) {
    if (confirm('Are you sure you want to delete this account?')) {
        getAccounts().splice(idx, 1);
        window.afterDataChange();
    }
}

function openInterestModal(idx, row) {
    const accounts = getAccounts();
    let acct;
    let onSave;

    if (idx === -1 && row) { // New account row
        acct = row.tempInterestData || {
            interest: 0,
            interest_period: 'year',
            compound_period: 'none',
            interest_type: 'simple'
        };
        onSave = (updated) => {
            row.tempInterestData = updated; // Store data on the row temporarily
        };
    } else { // Existing account
        acct = { ...accounts[idx] };
        onSave = (updated) => {
            accounts[idx] = { ...acct, ...updated };
            window.afterDataChange();
        };
    }
    InterestModal.show(acct, onSave);
}

// --- Main Page Initialization ---
function initializeAccountsPage() {
    window.accounts = window.accounts || [];

    const panelHeader = document.createElement('div');
    panelHeader.className = 'panel-header';
    panelHeader.innerHTML = `<h2>Accounts</h2><span class="panel-arrow">&#9662;</span>`;
    panelHeader.addEventListener('click', () => window.toggleAccordion('panel-accounts'));
    getEl('accounts-panel-header').replaceWith(panelHeader);

    const table = getEl('accountsTable');
    if (!table) return;

    const columns = [
        { field: 'name', header: 'Account Name', editable: true, type: 'text' },
        { field: 'balance', header: 'Starting Balance', editable: true, type: 'number' },
        { field: 'current_balance', header: 'Current Balance', editable: false, render: acct => acct.current_balance ?? acct.balance },
        { 
            field: 'interest', 
            header: 'Interest', 
            editable: false, 
            render: (acct) => {
                const interest = acct.interest ?? 0;
                if (interest === 0) return '<span style="color:#888">None</span>';
                
                const rate = `${interest}%`;
                const type = (acct.interest_type || 'simple').charAt(0).toUpperCase() + (acct.interest_type || 'simple').slice(1);
                const period = (acct.interest_period || 'year').charAt(0).toUpperCase() + (acct.interest_period || 'year').slice(1);
                
                if (acct.interest_type === 'compound' && acct.interest_period === 'year') {
                    const acronym = { month: 'NACM', quarter: 'NACQ', year: 'NACA', week: 'NACW', day: 'NACD' }[acct.compound_period];
                    return acronym ? `${rate} ${acronym}` : `${rate} Annually, Compounded ${acct.compound_period}`;
                }
                return `${rate} ${type} (per ${period})`;
            },
            modalIcon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
            modalIconTitle: 'Edit Interest',
            onModalIconClick: ({ idx, row }) => openInterestModal(idx, row)
        }
    ];

    const grid = new EditableGrid({
        targetElement: table,
        columns: columns,
        data: getAccounts(),
        onSave: saveAccount,
        onAfterSave: () => {
            console.log('[Accounts] onAfterSave: refreshing grid from window.accounts');
            grid.data = getAccounts();
            grid.render();
            window.updateTxnAccountOptions();
            console.log('[Accounts] Grid refreshed after save.');
        },
        onDelete: deleteAccount,
        onUpdate: (e, idx, row) => {
            if (e.target.closest('.interest-btn')) {
                openInterestModal(idx, row);
            }
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

document.addEventListener('DOMContentLoaded', initializeAccountsPage);

// --- Initialization: Only after data is loaded ---
function tryInitAccountsPage() {
    const init = () => {
        // Ensure accounts have current_balance
        (window.accounts || []).forEach(acc => {
            if (acc.current_balance === undefined) {
                acc.current_balance = acc.balance;
            }
        });
        initializeAccountsPage();
    };

    document.addEventListener('appDataLoaded', init, { once: true });
    if (window.accounts && Array.isArray(window.accounts)) {
        init();
    }
}

tryInitAccountsPage();
