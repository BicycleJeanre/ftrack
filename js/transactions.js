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
        { field: 'account_primary', header: 'Primary Account', editable: true, type: 'select', options: accountOptions, default: accountOptions[0]?.value || '' },
        { field: 'account_secondary', header: 'Secondary Account', editable: true, type: 'select', options: accountOptions, default: accountOptions[0]?.value || '' },
        { field: 'debit', header: 'Debit', editable: true, type: 'number', default: 0, tooltip: 'Money moving from primary to secondary account.' },
        { field: 'credit', header: 'Credit', editable: true, type: 'number', default: 0, tooltip: 'Money moving from secondary to primary account.' },
        { 
            field: 'isRecurring', 
            header: 'Recurring', 
            editable: true, 
            type: 'checkbox',
            default: false,
            render: t => t.isRecurring ? '✔️' : '❌'
        },
        { 
            field: 'recurrence', 
            header: 'Recurrence', 
            editable: false, // Handled by modal
            default: null,
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
            default: null,
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
        { field: 'tags', header: 'Tags', editable: true, type: 'text', default: '', render: t => (t.tags || []).join(', ') }
    ];

    console.log('[Transactions] Initializing EditableGrid with data:', getTransactions());

    grid = new EditableGrid({
       targetElement: table,
        columns: columns,
        data: getTransactions(),
        onSave: (idx, data, row, gridInstance) => {
            console.log(`[Transactions] onSave called for idx=${idx}, data=`, data);
            console.log('[Transactions] Grid data before save:', gridInstance.data);
            // Read latest values from the row's input/select elements
            const updatedData = { ...data };
            row.querySelectorAll('td').forEach(td => {
                const field = td.dataset.field;
                if (!field) return;
                const input = td.querySelector('input, select, textarea');
                if (input) {
                    if (input.type === 'checkbox') {
                        updatedData[field] = input.checked;
                    } else if (input.type === 'number') {
                        const parsed = parseFloat(input.value);
                        updatedData[field] = isNaN(parsed) ? 0 : parsed;
                    } else {
                        updatedData[field] = input.value;
                    }
                }
            });
            // Validation
            const errors = validateTransaction(updatedData, getAccounts());
            if (errors.length) {
                alert('Transaction validation failed:\n' + errors.join('\n'));
                return;
            }
            // Only update for edits, not for new rows (handled by EditableGrid)
            if (idx !== -1) {
                gridInstance.data[idx] = updatedData;
            }
            saveTransaction(idx, updatedData, row, gridInstance);
            grid.data = getTransactions();
            grid.render();
        },
        onAfterSave: () => {
            console.log('[Transactions] onAfterSave: refreshing grid from window.transactions');
            console.log('[Transactions] window.transactions before grid refresh:', window.transactions);
            grid.data = getTransactions();
            grid.render();
            console.log('[Transactions] Grid refreshed after save.');
            console.log('[Transactions] grid.data after refresh:', grid.data);
        },
        onDelete: (idx) => {
            console.log(`[Transactions] onDelete called for idx=${idx}`);
            console.log('[Transactions] window.transactions before delete:', window.transactions);
            deleteTransaction(idx);
            console.log('[Transactions] window.transactions after delete:', window.transactions);
            grid.data = getTransactions();
            grid.render();
        },
        onUpdate: (e, idx, row) => {
            const cell = e.target.closest('td');
            if (!cell) return;

            const transactions = getTransactions();
            const txn = transactions[idx];
            if (!txn) return;

            console.log(`[Transactions] onUpdate called for idx=${idx}, field=${cell.dataset.field}`);
            console.log('[Transactions] Transaction before update:', txn);

            // Handle opening the recurrence modal
            if (cell.dataset.field === 'recurrence' && txn.isRecurring) {
                console.log('[Transactions] Opening RecurrenceModal for transaction:', txn);
                RecurrenceModal.show(txn.recurrence, (updatedRecurrence) => {
                    console.log('[Transactions] RecurrenceModal callback, updatedRecurrence:', updatedRecurrence);
                    txn.recurrence = updatedRecurrence;
                    window.afterDataChange();
                    console.log('[Transactions] Transaction after recurrence update:', txn);
                    // Refresh grid after update
                    grid.data = getTransactions();
                    grid.render();
                });
            }

            // Handle opening the amount change modal
            if (cell.dataset.field === 'amountChange') {
                console.log('[Transactions] Opening AmountChangeModal for transaction:', txn);
                AmountChangeModal.show(txn.amountChange, (updatedAmountChange) => {
                    console.log('[Transactions] AmountChangeModal callback, updatedAmountChange:', updatedAmountChange);
                    txn.amountChange = updatedAmountChange;
                    window.afterDataChange();
                    console.log('[Transactions] Transaction after amountChange update:', txn);
                    // Refresh grid after update
                    grid.data = getTransactions();
                    grid.render();
                });
            }
        },
        actions: { add: true, edit: true, delete: true }
    });

    console.log('[Transactions] EditableGrid initialized:', grid);

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

function validateTransaction(txn, accountsList) {
    const errors = [];
    // Check both accounts exist
    const primaryExists = accountsList.some(acc => acc.name === txn.account_primary);
    const secondaryExists = accountsList.some(acc => acc.name === txn.account_secondary);
    if (!primaryExists) errors.push('Primary account does not exist.');
    if (!secondaryExists) errors.push('Secondary account does not exist.');
    // Accounts must differ
    if (txn.account_primary === txn.account_secondary) errors.push('Primary and secondary accounts must differ.');
    // At least one of debit/credit must be nonzero
    if (!(Number(txn.debit) > 0 || Number(txn.credit) > 0)) errors.push('Either debit or credit must be greater than zero.');
    return errors;
}
