// This script manages the Accounts page (/pages/accounts.html).
// It handles rendering the accounts table, managing the interest settings modal,
// and processing the form for adding or updating accounts.

// --- Standalone/Helper Functions (must be first!) ---
if (typeof window !== 'undefined') {
    if (typeof window.getEl === 'undefined') {
        window.getEl = function(id) { return document.getElementById(id); };
    }
    if (typeof window.toggleAccordion === 'undefined') {
        window.toggleAccordion = function(id) {
            var panel = document.getElementById(id);
            var content = panel.querySelector('.panel-content');
            content.style.display = (content.style.display === 'none') ? 'block' : 'none';
        };
    }
    if (typeof window.updateTxnAccountOptions === 'undefined') {
        window.updateTxnAccountOptions = function() {};
    }
}

// --- Global Account Management State ---
let editingAccount = null;
let newAccountInterest = {};
console.log('hello')
// Always use window.accounts in global functions
function getAccounts() {
    return window.accounts || [];
}

// --- Global Account Management Functions ---
function editAccount(idx) {
    const accounts = getAccounts();
    console.log('[Accounts] editAccount idx', idx, accounts[idx]);
    getEl('acct_name').value = accounts[idx].name;
    getEl('acct_balance').value = accounts[idx].balance;
    // The interest data is now managed by the modal itself.
    // We pass the full account object to the modal, which will handle populating its fields.
    newAccountInterest = {
        interest: accounts[idx].interest ?? 0,
        interest_period: accounts[idx].interest_period || 'year',
        compound_period: accounts[idx].compound_period || 'month',
        interest_type: accounts[idx].interest_type || 'compound'
    };
    editingAccount = idx;
}

function deleteAccount(idx) {
    const accounts = getAccounts();
    accounts.splice(idx, 1);
    console.log('[Accounts] deleteAccount idx', idx);
    window.afterDataChange();
}

import { InterestModal } from './modal-interest.js';

function openInterestModal(idx) {
    const accounts = getAccounts();
    let acct;
    let onSave;
    if (typeof idx === 'number') {
        acct = { ...accounts[idx] };
        onSave = (updated) => {
            // Ensure the name and balance are preserved from the original object
            const originalAcct = accounts[idx];
            accounts[idx] = { 
                name: originalAcct.name, 
                balance: originalAcct.balance, 
                ...updated 
            };
            if (editingAccount === idx) {
                newAccountInterest = { ...updated };
            }
            console.log('[Accounts] openInterestModal save', idx, accounts[idx]);
            window.afterDataChange();
        };
    } else {
        acct = { ...newAccountInterest };
        onSave = (updated) => {
            newAccountInterest = { ...newAccountInterest, ...updated };
            console.log('[Accounts] openInterestModal new interest', newAccountInterest);
        };
    }
    InterestModal.show(
        acct,
        onSave,
        () => {
            console.log('[Accounts] openInterestModal cancel');
        }
    );
}

// --- Main Page Initialization ---
function initializeAccountsPage() {
    // Always use window.accounts for all operations
    window.accounts = window.accounts || [];
    console.log('[Accounts] initializeAccountsPage: window.accounts =', window.accounts);

    // --- Inject Panel Header with Accordion Toggle ---
    const panelHeader = document.createElement('div');
    panelHeader.className = 'panel-header';
    panelHeader.innerHTML = `
        <h2>Accounts</h2>
        <span class="panel-arrow">&#9662;</span>
    `;
    panelHeader.addEventListener('click', function() {
        window.toggleAccordion('panel-accounts');
    });
    const headerContainer = document.getElementById('accounts-panel-header');
    if (headerContainer) headerContainer.replaceWith(panelHeader);

    // --- Account Table Rendering ---
    window.renderAccounts = function() {
        const accountsTable = getEl('accountsTable');
        if (!accountsTable) return;
        const tbody = accountsTable.querySelector('tbody');
        tbody.innerHTML = '';
        console.log('[Accounts] renderAccounts: window.accounts =', window.accounts);
        window.accounts.forEach((acct, idx) => {
            const interest = acct.interest ?? 0;
            const interestPeriod = acct.interest_period || 'year';
            const interestType = acct.interest_type || 'compound';
            const compoundPeriod = acct.compound_period || 'none';

            let interestDisplay;
            if (interest === 0) {
                interestDisplay = '<span style="color:#888">None</span>';
            } else {
                const rate = `${interest}%`;
                if (interestType === 'compound' && interestPeriod === 'year') {
                    let acronym = '';
                    switch (compoundPeriod) {
                        case 'month':   acronym = 'NACM'; break;
                        case 'quarter': acronym = 'NACQ'; break;
                        case 'year':    acronym = 'NACA'; break;
                        case 'week':    acronym = 'NACW'; break;
                        case 'day':     acronym = 'NACD'; break;
                    }
                    interestDisplay = acronym ? `${rate} ${acronym}` : `${rate} Annually, Compounded ${compoundPeriod}`;
                } else {
                    const typeLabel = interestType.charAt(0).toUpperCase() + interestType.slice(1);
                    const periodLabel = interestPeriod.charAt(0).toUpperCase() + interestPeriod.slice(1);
                    interestDisplay = `${rate} ${typeLabel} (per ${periodLabel})`;
                }
            }
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${acct.name}</td>
                <td>${acct.balance}</td>
                <td>${interestDisplay}</td>
                <td>
                    <button class="edit-account-btn">Edit</button>
                    <button class="delete-account-btn">Delete</button>
                    <button class="interest-account-btn">Add/Edit Interest</button>
                </td>
            `;
            const editBtn = tr.querySelector('.edit-account-btn');
            const deleteBtn = tr.querySelector('.delete-account-btn');
            const interestBtn = tr.querySelector('.interest-account-btn');
            editBtn.addEventListener('click', () => editAccount(idx));
            deleteBtn.addEventListener('click', () => deleteAccount(idx));
            interestBtn.addEventListener('click', () => openInterestModal(idx));
            tbody.appendChild(tr);
        });
        window.updateTxnAccountOptions();
    };

    // --- Add/Edit Interest Modal for New Account ---
    const addInterestBtn = document.getElementById('addInterestBtn');
    if (addInterestBtn) {
        addInterestBtn.addEventListener('click', function(e) {
            e.preventDefault();
            // For a new account, we pass a default interest object
            const defaultInterest = { 
                interest: 0, 
                interest_period: 'year', 
                compound_period: 'month', 
                interest_type: 'compound' 
            };
            InterestModal.show(
                newAccountInterest.interest !== undefined ? newAccountInterest : defaultInterest,
                (updated) => {
                    newAccountInterest = { ...newAccountInterest, ...updated };
                },
                () => {}
            );
        });
    }

    // --- Account Form Handling ---
    const accountForm = getEl('accountForm');
    console.log('hello')
    if (accountForm) {
        accountForm.addEventListener('submit', function(e) {
            e.preventDefault();
            console.log('[Accounts] Form submit handler fired');
            const acct = {
                name: getEl('acct_name').value,
                balance: parseFloat(getEl('acct_balance').value),
                ...newAccountInterest
            };
            // Ensure default interest values if none were set
            acct.interest = acct.interest ?? 0;
            acct.interest_period = acct.interest_period || 'year';
            acct.compound_period = acct.compound_period || 'none';
            acct.interest_type = acct.interest_type || 'simple';

            if (editingAccount !== null) {
                window.accounts[editingAccount] = acct;
                console.log('[Accounts] Updated account at index', editingAccount, acct);
                editingAccount = null;
            } else {
                window.accounts.push(acct);
                console.log('[Accounts] Added new account:', acct);
            }
            newAccountInterest = {};
            this.reset();
            window.afterDataChange();
        });
    } else {
        console.error('[Accounts] ERROR: accountForm not found when trying to add submit event listener');
    }

    // --- Data Change Handler Enhancement ---
    if(typeof window.afterDataChange === 'function'){
        const _afterDataChange = window.afterDataChange;
        window.afterDataChange = function() {
            console.log('[Accounts] afterDataChange: saving data', {
                accounts: window.accounts,
                transactions: window.transactions,
                forecast: window.forecast,
                budget: window.budget
            });
            if (window.filemgmt && typeof window.filemgmt.saveAppDataToFile === 'function') {
                window.filemgmt.saveAppDataToFile({
                    accounts: window.accounts,
                    transactions: window.transactions,
                    forecast: window.forecast,
                    budget: window.budget
                });
            }
            _afterDataChange();
            if (document.getElementById('accountsTable')) {
                window.renderAccounts();
            }
        };
    }

    // --- Initial Render ---
    if (document.getElementById('accountsTable')) {
        window.renderAccounts();
    }
}

// --- Initialization: Only after data is loaded ---
function tryInitAccountsPage() {
    document.addEventListener('appDataLoaded', () => {
        initializeAccountsPage();
        console.log('[Accounts] App data loaded, initializing accounts page');
    }, { once: true });
    
    if (window.accounts && Array.isArray(window.accounts)) {
        console.log('[Accounts] Initializing accounts page with existing data');
        initializeAccountsPage();
    }
}

tryInitAccountsPage();
