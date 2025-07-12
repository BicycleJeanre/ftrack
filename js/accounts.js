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
    // Ensure updateTxnAccountOptions is always defined before use
    if (typeof window.updateTxnAccountOptions === 'undefined') {
        window.updateTxnAccountOptions = function() {};
    }
}

// Wait for the DOM to be fully loaded before running any script that interacts with it.
// This ensures that all HTML elements are available to the script.
document.addEventListener('DOMContentLoaded', initializeAccountsPage);

// This function sets up the entire Accounts page. It's called once the DOM is ready.
function initializeAccountsPage() {
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
    // This function dynamically builds the HTML for the accounts table based on the global `accounts` array.
    window.renderAccounts = function() {
        const accountsTable = getEl('accountsTable');
        if (!accountsTable) return;
        const tbody = accountsTable.querySelector('tbody');
        tbody.innerHTML = '';
        accounts.forEach((acct, idx) => {
            const interestPeriod = acct.interest_period || 'month';
            const compoundPeriod = acct.compound_period || 'month';
            const interestType = acct.interest_type || 'compound';
            const interestDisplay = (acct.interest !== undefined && acct.interest !== null && acct.interest !== 0)
                ? `${acct.interest} (${interestPeriod}, ${interestType}, comp: ${compoundPeriod})`
                : '<span style="color:#888">None</span>';
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
            // Attach event listeners for CSP compliance
            const editBtn = tr.querySelector('.edit-account-btn');
            const deleteBtn = tr.querySelector('.delete-account-btn');
            const interestBtn = tr.querySelector('.interest-account-btn');
            editBtn.addEventListener('click', () => editAccount(idx));
            deleteBtn.addEventListener('click', () => deleteAccount(idx));
            interestBtn.addEventListener('click', () => openInterestModal(idx));
            tbody.appendChild(tr);
        });
        updateTxnAccountOptions();
    };

    // --- Account Form Handling ---
    // This section manages the submission of the main form for adding or editing accounts.
    const accountForm = getEl('accountForm');
    if (accountForm) {
        accountForm.addEventListener('submit', function(e) {
            e.preventDefault(); // Prevent the default form submission (page reload)
            const acct = {
                name: getEl('acct_name').value,
                balance: parseFloat(getEl('acct_balance').value),
                interest: 0
            };
            // If `editingAccount` is set, update the existing account; otherwise, add a new one.
            if (editingAccount !== null) {
                accounts[editingAccount] = acct;
                editingAccount = null; // Reset the editing state
            } else {
                accounts.push(acct);
            }
            this.reset(); // Clear the form fields
            window.afterDataChange(); // Notify the app that data has changed
        });
    }

    // --- Data Change Handler Enhancement ---
    // This is a critical piece of the application's architecture.
    // It enhances the global `afterDataChange` function (defined in `data-startup.js`).
    // This ensures that whenever data is changed, it is first saved to localStorage and THEN the UI is updated.
    if(typeof window.afterDataChange === 'function'){
        const _afterDataChange = window.afterDataChange; // Store the original function
        window.afterDataChange = function() {
            _afterDataChange(); // Step 1: Call the original function (saves data to localStorage)
            if (document.getElementById('accountsTable')) {
                window.renderAccounts(); // Step 2: Update the UI by re-rendering the accounts table
            }
        };
    }

    // --- Initial Render ---
    // This ensures that when the page loads, the accounts table is immediately populated with any existing data.
    if (document.getElementById('accountsTable')) {
        window.renderAccounts();
    }
}

// --- Global Account Management Functions ---
// These functions are defined in the global scope so they can be called directly from `onclick` attributes in the HTML.
let editingAccount = null; // A state variable to track which account is being edited.

// Pre-fills the main form with the data of the account to be edited.
function editAccount(idx) {
    const acct = accounts[idx];
    getEl('acct_name').value = acct.name;
    getEl('acct_balance').value = acct.balance;
    editingAccount = idx; // Set the editing state
}

// Deletes an account from the `accounts` array and triggers a data change.
function deleteAccount(idx) {
    accounts.splice(idx, 1);
    window.afterDataChange(); // Notify the app that data has changed
}

// Import the InterestModal object from the modal-interest.js module
import { InterestModal } from './modal-interest.js';

function openInterestModal(idx) {
    const acct = accounts[idx];
    InterestModal.show(
        acct,
        (updated) => {
            // Save changes to the account
            accounts[idx] = { ...acct, ...updated };
            window.afterDataChange();
        },
        () => {
            // Cancel handler (optional)
        }
    );
}
