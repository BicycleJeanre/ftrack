// This script manages the Accounts page (/pages/accounts.html).
// It handles rendering the accounts table with inline editing and quick-add functionality.

import { InterestModal } from './modal-interest.js';

// --- Standalone/Helper Functions ---
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

// --- SVG Icons for Actions ---
const ICONS = {
    edit: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
    delete: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>',
    save: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>',
    cancel: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    interest: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>'
};

// --- Global Account Management Functions ---
function getAccounts() {
    return window.accounts || [];
}

function toggleEditState(row, isEditing) {
    const nameCell = row.querySelector('td[data-field="name"]');
    const balanceCell = row.querySelector('td[data-field="balance"]');
    
    nameCell.contentEditable = isEditing;
    balanceCell.contentEditable = isEditing;
    
    row.querySelector('.edit-btn').style.display = isEditing ? 'none' : 'inline-block';
    row.querySelector('.delete-btn').style.display = isEditing ? 'none' : 'inline-block';
    row.querySelector('.save-btn').style.display = isEditing ? 'inline-block' : 'none';
    row.querySelector('.cancel-btn').style.display = isEditing ? 'inline-block' : 'none';
    
    row.classList.toggle('editing', isEditing);
    if (isEditing) {
        nameCell.focus();
        // Select all text in the cell to allow for immediate typing
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(nameCell);
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

function saveAccount(idx, row) {
    const name = row.querySelector('td[data-field="name"]').textContent;
    const balance = parseFloat(row.querySelector('td[data-field="balance"]').textContent);
    const accounts = getAccounts();
    const transactions = window.transactions || [];

    if (idx === -1) { // This is a new account
        const tempInterestData = row.tempInterestData || {};
        const newAccount = {
            name,
            balance,
            current_balance: balance, // For a new account, current balance is the starting balance
            interest: tempInterestData.interest ?? 0,
            interest_period: tempInterestData.interest_period || 'year',
            compound_period: tempInterestData.compound_period || 'none',
            interest_type: tempInterestData.interest_type || 'simple'
        };
        accounts.push(newAccount);
    } else { // This is an existing account
        const accountToUpdate = accounts[idx];
        accountToUpdate.name = name;
        accountToUpdate.balance = balance;

        // Recalculate current_balance based on the new starting balance and existing transactions
        const netTransactions = transactions
            .filter(t => t.account === accountToUpdate.name)
            .reduce((sum, t) => sum + t.amount, 0);
        
        accountToUpdate.current_balance = balance + netTransactions;
    }
    
    window.afterDataChange();
}

function deleteAccount(idx) {
    if (confirm('Are you sure you want to delete this account?')) {
        getAccounts().splice(idx, 1);
        window.afterDataChange();
    }
}

function openInterestModal(idx, row = null) {
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

    window.renderAccounts = function() {
        const table = getEl('accountsTable');
        if (!table) return;
        const tbody = table.querySelector('tbody');
        tbody.innerHTML = '';

        getAccounts().forEach((acct, idx) => {
            const interest = acct.interest ?? 0;
            let interestDisplay = '<span style="color:#888">None</span>';
            if (interest !== 0) {
                const rate = `${interest}%`;
                const type = (acct.interest_type || 'simple').charAt(0).toUpperCase() + (acct.interest_type || 'simple').slice(1);
                const period = (acct.interest_period || 'year').charAt(0).toUpperCase() + (acct.interest_period || 'year').slice(1);
                if (acct.interest_type === 'compound' && acct.interest_period === 'year') {
                    const acronym = { month: 'NACM', quarter: 'NACQ', year: 'NACA', week: 'NACW', day: 'NACD' }[acct.compound_period];
                    interestDisplay = acronym ? `${rate} ${acronym}` : `${rate} Annually, Compounded ${acct.compound_period}`;
                } else {
                    interestDisplay = `${rate} ${type} (per ${period})`;
                }
            }

            const tr = document.createElement('tr');
            tr.dataset.idx = idx;
            tr.innerHTML = `
                <td data-field="name">${acct.name}</td>
                <td data-field="balance">${acct.balance}</td>
                <td data-field="current_balance">${acct.current_balance ?? acct.balance}</td>
                <td data-field="interest">${interestDisplay}</td>
                <td class="actions">
                    <button class="icon-btn edit-btn" title="Edit">${ICONS.edit}</button>
                    <button class="icon-btn delete-btn" title="Delete">${ICONS.delete}</button>
                    <button class="icon-btn save-btn" title="Save" style="display:none;">${ICONS.save}</button>
                    <button class="icon-btn cancel-btn" title="Cancel" style="display:none;">${ICONS.cancel}</button>
                    <button class="icon-btn interest-btn" title="Interest Settings">${ICONS.interest}</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        window.updateTxnAccountOptions();
    };

    const accountsTable = getEl('accountsTable');
    if (accountsTable) {
        accountsTable.querySelector('tbody').addEventListener('click', (e) => {
            const btn = e.target.closest('.icon-btn');
            if (!btn) return;
            
            const row = btn.closest('tr');
            const isNew = row.dataset.idx === 'new';
            const idx = isNew ? -1 : parseInt(row.dataset.idx, 10);

            if (btn.classList.contains('edit-btn')) {
                toggleEditState(row, true);
            } else if (btn.classList.contains('delete-btn')) {
                deleteAccount(idx);
            } else if (btn.classList.contains('save-btn')) {
                saveAccount(idx, row);
                if (isNew) {
                    window.renderAccounts(); // Re-render to fix index and add new row correctly
                } else {
                    toggleEditState(row, false);
                }
            } else if (btn.classList.contains('cancel-btn')) {
                if (isNew) {
                    row.remove();
                } else {
                    toggleEditState(row, false);
                    window.renderAccounts(); // Re-render to restore original values
                }
            } else if (btn.classList.contains('interest-btn')) {
                openInterestModal(idx, row);
            }
        });

        // Add keydown listener for Enter key submission
        accountsTable.querySelector('tbody').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.isContentEditable) {
                e.preventDefault(); // Prevent adding a new line
                const row = e.target.closest('tr');
                const saveBtn = row.querySelector('.save-btn');
                if (saveBtn) {
                    saveBtn.click();
                }
            }
        });

        const quickAddBtn = document.createElement('button');
        quickAddBtn.id = 'quickAddAccountBtn';
        quickAddBtn.textContent = '+ Add Account';
        accountsTable.insertAdjacentElement('afterend', quickAddBtn);

        quickAddBtn.addEventListener('click', () => {
            const tbody = accountsTable.querySelector('tbody');
            const tr = document.createElement('tr');
            tr.dataset.idx = 'new';
            tr.innerHTML = `
                <td data-field="name">New Account</td>
                <td data-field="balance">0</td>
                <td data-field="current_balance">0</td>
                <td data-field="interest"><span style="color:#888">None</span></td>
                <td class="actions">
                    <button class="icon-btn edit-btn" style="display:none;">${ICONS.edit}</button>
                    <button class="icon-btn delete-btn" style="display:none;">${ICONS.delete}</button>
                    <button class="icon-btn save-btn" title="Save">${ICONS.save}</button>
                    <button class="icon-btn cancel-btn" title="Cancel">${ICONS.cancel}</button>
                    <button class="icon-btn interest-btn" title="Interest Settings">${ICONS.interest}</button>
                </td>
            `;
            tbody.appendChild(tr);
            toggleEditState(tr, true);
        });
    }

    if(typeof window.afterDataChange === 'function'){
        const _afterDataChange = window.afterDataChange;
        window.afterDataChange = function() {
            if (window.filemgmt && typeof window.filemgmt.saveAppDataToFile === 'function') {
                window.filemgmt.saveAppDataToFile({
                    accounts: getAccounts(),
                    transactions: window.transactions || [],
                    forecast: window.forecast || [],
                    budget: window.budget || []
                });
            }
            _afterDataChange();
            if (getEl('accountsTable')) {
                window.renderAccounts();
            }
        };
    }

    if (getEl('accountsTable')) {
        window.renderAccounts();
    }
}

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
