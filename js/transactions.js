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
}

document.addEventListener('DOMContentLoaded', function() {
    // Provide a minimal transactions array and afterDataChange for demo/standalone
    if (typeof window.transactions === 'undefined') {
        window.transactions = [];
    }
    if (typeof window.editingTxn === 'undefined') {
        window.editingTxn = null;
    }
    if (typeof window.afterDataChange === 'undefined') {
        window.afterDataChange = function() { 
            if(window.filemgmt && typeof window.filemgmt.saveAppDataToFile === 'function') {
                window.filemgmt.saveAppDataToFile({
                    accounts: window.accounts,
                    transactions: window.transactions,
                    forecast: window.forecast,
                    budget: window.budget
                });
            }
            renderTransactions(); 
            updateTxnAccountOptions(); 
        };
    }

    // Attach core functions to window for standalone mode
    window.editTxn = editTxn;
    window.deleteTxn = deleteTxn;
    window.renderTransactions = renderTransactions;

    // Initial render
    if (document.getElementById('transactionsTable')) {
        renderTransactions();
    }

    // --- Transaction Form ---
    var txnForm = getEl('transactionForm');
    if (txnForm) {
        txnForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const txn = {
                name: getEl('txn_name').value,
                account: getEl('txn_account').value,
                amount: parseFloat(getEl('txn_amount').value),
                date: getEl('txn_date').value,
                recurring: getEl('txn_recurring').checked,
                end_date: getEl('txn_end_date').value || null,
                freq: getEl('txn_freq').value,
                pct_change: parseFloat(getEl('txn_pct_change').value),
                apply_to: getEl('txn_apply_to').value
            };
            if (editingTxn !== null) {
                transactions[editingTxn] = txn;
                editingTxn = null;
            } else {
                transactions.push(txn);
            }
            this.reset();
            afterDataChange();
        });
    }
});

// Transactions logic partial
// --- Transaction Table ---
function renderTransactions() {
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
            editable: (t) => t.isRecurring, 
            render: t => {
                if (!t.isRecurring || !t.recurrence) return '<span class="disabled-text">N/A</span>';
                return `${t.recurrence.frequency} on day ${t.recurrence.dayOfMonth}, until ${t.recurrence.endDate}`;
            }
        },
        { 
            field: 'amountChange', 
            header: 'Amount Change', 
            editable: false, // Will be handled by a modal
            render: t => {
                if (!t.amountChange) return 'None';
                return `${t.amountChange.type}: ${t.amountChange.value} per ${t.amountChange.frequency}`;
            }
        },
        { field: 'tags', header: 'Tags', editable: true, type: 'text', render: t => (t.tags || []).join(', ') }
    ];

    const grid = new EditableGrid({
        targetElement: table,
        columns: columns,
        data: getTransactions(),
        onSave: saveTransaction,
        onDelete: deleteTransaction,
        onUpdate: (e, idx, row) => {
            const cell = e.target.closest('td');
            if (cell && cell.dataset.field === 'account') {
                const select = cell.querySelector('select');
                if (select && select.value === '__CREATE_NEW__') {
                    handleCreateNewAccount(row);
                }
            }
        },
        quickAddButton: getEl('quickAddTransactionBtn')
    });

    window.renderTransactions = function() {
        grid.setData(getTransactions());
        grid.render();
    };

    window.renderTransactions();
}

function handleCreateNewAccount(row) {
    // A simple modal could be created here instead of a prompt
    const newAccountName = prompt("Enter the name for the new account:");
    if (newAccountName) {
        const newAccount = {
            name: newAccountName,
            balance: 0,
            current_balance: 0,
            group: "Expense", // Default group
            tags: [],
            interest: 0,
            interest_period: 'year',
            compound_period: 'none',
            interest_type: 'simple'
        };
        getAccounts().push(newAccount);
        window.afterDataChange();
        
        // Re-initialize the page to get fresh data and re-render the grid
        initializeTransactionsPage();
        
        // Ideally, we would find the row that triggered this and set its new value.
        // This is complex because the grid has been entirely rebuilt.
        // For now, the user will have to re-select the new account manually.
    }
}

function getTransactions() {
    return window.transactions || [];
}

function getAccounts() {
    return window.accounts || [];
}

function saveTransaction(idx, data, row) {
    // Custom save logic if needed
    afterDataChange();
}

function deleteTransaction(idx) {
    transactions.splice(idx, 1);
    afterDataChange();
}

// --- Transaction Table ---
function updateTxnAccountOptions() {
    var sel = getEl('txn_account');
    if (!sel) return;
    sel.innerHTML = '';
    (window.accounts || []).forEach(acct => {
        var opt = document.createElement('option');
        opt.value = acct.name;
        opt.textContent = acct.name;
        sel.appendChild(opt);
    });
}
