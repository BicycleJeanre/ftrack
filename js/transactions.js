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

function saveTransaction(idx, data, row, grid) {
    console.log(`[Transactions] saveTransaction called for idx=${idx}`);
    window.transactions = grid.data;
    console.log('[Transactions] window.transactions updated from grid.data');
    if (typeof window.afterDataChange === 'function') {
        console.log('[Transactions] Calling window.afterDataChange()');
        window.afterDataChange();
    }
    console.log('[Transactions] Save process complete for idx=' + idx);
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
            options: accountOptions,
            // Add modal icon for creating new account
            modalIcon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>',
            modalIconTitle: 'Create New Account',
            onModalIconClick: ({ row }) => handleCreateNewAccount(row)
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
            },
            modalIcon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line></svg>',
            modalIconTitle: 'Edit Recurrence',
            onModalIconClick: ({ idx }) => {
                const txn = getTransactions()[idx];
                RecurrenceModal.show(txn.recurrence, (updatedRecurrence) => {
                    txn.recurrence = updatedRecurrence;
                    window.afterDataChange();
                });
            }
        },
        { 
            field: 'amountChange', 
            header: 'Amount Change', 
            editable: false, // Handled by modal
            render: t => {
                if (!t.amountChange) return '<span class="editable-cell-link">None</span>';
                return `<span class="editable-cell-link">${t.amountChange.type}: ${t.amountChange.value} per ${t.amountChange.frequency}</span>`;
            },
            modalIcon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4l3 3"></path></svg>',
            modalIconTitle: 'Edit Amount Change',
            onModalIconClick: ({ idx }) => {
                const txn = getTransactions()[idx];
                AmountChangeModal.show(txn.amountChange, (updatedAmountChange) => {
                    txn.amountChange = updatedAmountChange;
                    window.afterDataChange();
                });
            }
        },
        { field: 'tags', header: 'Tags', editable: true, type: 'text', render: t => (t.tags || []).join(', ') }
    ];

    grid = new EditableGrid({
        targetElement: table,
        columns: columns,
        data: getTransactions(),
        onSave: saveTransaction,
        onAfterSave: () => {
            console.log('[Transactions] onAfterSave: refreshing grid from window.transactions');
            grid.data = getTransactions();
            grid.render();
            console.log('[Transactions] Grid refreshed after save.');
        },
        onDelete: deleteTransaction,
        onUpdate: (e, idx, row) => {
            const cell = e.target.closest('td');
            if (!cell) return;

            const transactions = getTransactions();
            const txn = transactions[idx];
            if (!txn) return;

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
