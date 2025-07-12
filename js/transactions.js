// This script manages the Transactions page (/pages/transactions.html).
// It uses the EditableGrid module to render and manage the transactions table.

import { EditableGrid } from './editable-grid.js';
import { RecurrenceModal } from './modal-recurrence.js';
import { AmountChangeModal } from './modal-amount-change.js';
import { CreateAccountModal } from './modal-create-account.js';

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
}

// --- Transaction Data Management ---
function getTransactions() {
    return window.transactions || [];
}

function getAccounts() {
    return window.accounts || [];
}

function saveTransaction(idx, data, row) {
    const transactions = getTransactions();
    
    if (idx === -1) { // New transaction
        const newTxn = {
            description: data.description || 'New Transaction',
            amount: data.amount || 0,
            account: data.account || '',
            isRecurring: data.isRecurring || false,
            executionDate: data.isRecurring ? null : (new Date().toISOString().split('T')[0]),
            recurrence: data.isRecurring ? { frequency: 'monthly', dayOfMonth: 1, endDate: '' } : null,
            amountChange: null,
            tags: []
        };
        transactions.push(newTxn);
    } else { // Existing transaction
        const txn = transactions[idx];
        Object.assign(txn, data);
        // Ensure consistency after edit
        if (txn.isRecurring) {
            txn.executionDate = null;
            if (!txn.recurrence) {
                txn.recurrence = { frequency: 'monthly', dayOfMonth: 1, endDate: '' };
            }
        } else {
            txn.recurrence = null;
        }
    }
    
    window.afterDataChange();
}

function deleteTransaction(idx) {
    if (confirm('Are you sure you want to delete this transaction?')) {
        getTransactions().splice(idx, 1);
        window.afterDataChange();
    }
}

let grid; // Module-level variable to hold the grid instance

// --- Main Page Initialization ---
function initializeTransactionsPage() {
    window.transactions = window.transactions || [];

    const panelHeader = document.createElement('div');
    panelHeader.className = 'panel-header';
    panelHeader.innerHTML = `<h2>Transactions</h2><span class="panel-arrow">&#9662;</span>`;
    panelHeader.addEventListener('click', () => window.toggleAccordion('panel-transactions'));
    getEl('transactions-panel-header').replaceWith(panelHeader);

    const table = getEl('transactionsTable');
    if (!table) return;

    const accountOptions = getAccounts().map(acc => ({ value: acc.name, text: acc.name }));

    const columns = [
        { field: 'description', header: 'Description', editable: true, type: 'text' },
        { field: 'amount', header: 'Amount', editable: true, type: 'number' },
        { 
            field: 'account', 
            header: 'Account', 
            editable: true, 
            type: 'select',
            options: [
                ...accountOptions,
                { value: '__CREATE_NEW__', text: '-- Create New Account --' }
            ]
        },
        { 
            field: 'isRecurring', 
            header: 'Recurring', 
            editable: true, 
            type: 'checkbox',
            render: t => t.isRecurring ? '✔️' : '❌'
        },
        { 
            field: 'executionDate', 
            header: 'Execution Date', 
            editable: (t) => !t.isRecurring, 
            type: 'date',
            render: t => t.isRecurring ? '<span class="disabled-text">N/A</span>' : (t.executionDate || '')
        },
        { 
            field: 'recurrence', 
            header: 'Recurrence', 
            editable: false, // Handled by modal
            render: t => {
                if (!t.isRecurring || !t.recurrence) return '<span class="disabled-text">N/A</span>';
                return `<span class="editable-cell-link">${t.recurrence.frequency} on day ${t.recurrence.dayOfMonth}, until ${t.recurrence.endDate || '...'}</span>`;
            }
        },
        { 
            field: 'amountChange', 
            header: 'Amount Change', 
            editable: false, // Handled by modal
            render: t => {
                if (!t.amountChange) return '<span class="editable-cell-link">None</span>';
                return `<span class="editable-cell-link">${t.amountChange.type}: ${t.amountChange.value} per ${t.amountChange.frequency}</span>`;
            }
        },
        { field: 'tags', header: 'Tags', editable: true, type: 'text', render: t => (t.tags || []).join(', ') }
    ];

    grid = new EditableGrid({
        targetElement: table,
        columns: columns,
        data: getTransactions(),
        onSave: saveTransaction,
        onDelete: deleteTransaction,
        onUpdate: (e, idx, row) => {
            const cell = e.target.closest('td');
            if (!cell) return;

            const transactions = getTransactions();
            const txn = transactions[idx];
            if (!txn) return;

            // Handle creating a new account from the dropdown
            if (cell.dataset.field === 'account') {
                const select = cell.querySelector('select');
                if (select && select.value === '__CREATE_NEW__') {
                    // When 'Create New' is selected, we need to find the actual row being edited.
                    // The `row` parameter from the event handler is the correct one.
                    handleCreateNewAccount(row);
                }
            }

            // Handle opening the recurrence modal
            if (cell.dataset.field === 'recurrence' && txn.isRecurring) {
                RecurrenceModal.show(txn.recurrence, (updatedRecurrence) => {
                    txn.recurrence = updatedRecurrence;
                    window.afterDataChange();
                });
            }

            // Handle opening the amount change modal
            if (cell.dataset.field === 'amountChange') {
                AmountChangeModal.show(txn.amountChange, (updatedAmountChange) => {
                    txn.amountChange = updatedAmountChange;
                    window.afterDataChange();
                });
            }
        },
        quickAddButton: getEl('quickAddTransactionBtn'),
        actions: { add: true, edit: true, delete: true }
    });

    window.renderTransactions = function() {
        grid.data = getTransactions();
        grid.render();
    };

    window.renderTransactions();
}

function handleCreateNewAccount(row) {
    CreateAccountModal.show((newAccount) => {
        // 1. Add account to global data
        getAccounts().push(newAccount);
        
        // 2. Notify system of data change
        window.afterDataChange();

        // 3. Update the grid's column definition dynamically
        const accountColumn = grid.columns.find(c => c.field === 'account');
        if (accountColumn) {
            const newOption = { value: newAccount.name, text: newAccount.name };
            // Insert before the '-- Create New --' option
            accountColumn.options.splice(accountColumn.options.length - 1, 0, newOption);
        }

        // 4. Update the select element in the currently editing row
        const select = row.querySelector('td[data-field="account"] select');
        if (select) {
            const option = document.createElement('option');
            option.value = newAccount.name;
            option.text = newAccount.name;
            // Insert it before the 'Create New' option
            select.insertBefore(option, select.options[select.options.length - 1]);
            
            // Set the value to the newly created account
            select.value = newAccount.name;
        }
    });
}

document.addEventListener('DOMContentLoaded', initializeTransactionsPage);
