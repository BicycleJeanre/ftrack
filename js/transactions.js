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
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    transactions.forEach((txn, idx) => {
        const tr = document.createElement('tr');
        const fields = ['name','account','amount','date','recurring','end_date','freq','pct_change','apply_to'];
        fields.forEach(field => {
            const td = document.createElement('td');
            if (field === 'recurring') {
                td.textContent = txn.recurring ? 'Yes' : 'No';
            } else if (field === 'amount' || field === 'pct_change') {
                td.textContent = txn[field];
            } else {
                td.textContent = txn[field] || '';
            }
            if (field !== 'recurring' && field !== 'account') {
                td.classList.add('editable-cell');
                td.onclick = function() { makeTxnCellEditable(td, idx, field); };
            }
            tr.appendChild(td);
        });
        // Actions
        const tdActions = document.createElement('td');
        tdActions.innerHTML = `
            <button onclick="editTxn(${idx})">Edit</button>
            <button onclick="deleteTxn(${idx})">Delete</button>
        `;
        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });
    updateTxnAccountOptions();
}

function editTxn(idx) {
    const txn = transactions[idx];
    getEl('txn_name').value = txn.name;
    getEl('txn_account').value = txn.account;
    getEl('txn_amount').value = txn.amount;
    getEl('txn_date').value = txn.date;
    getEl('txn_recurring').checked = txn.recurring;
    getEl('txn_end_date').value = txn.end_date || '';
    getEl('txn_freq').value = txn.freq;
    getEl('txn_pct_change').value = txn.pct_change;
    getEl('txn_apply_to').value = txn.apply_to;
    editingTxn = idx;
}

function deleteTxn(idx) {
    transactions.splice(idx, 1);
    afterDataChange();
}

// --- Inline Editing for Transactions Table ---
function makeTxnCellEditable(td, idx, field) {
    if (td.querySelector('input,select')) return;
    const oldValue = transactions[idx][field];
    let input;
    if (field === 'date' || field === 'end_date') {
        input = document.createElement('input');
        input.type = 'date';
        input.value = oldValue || '';
    } else if (field === 'recurring') {
        input = document.createElement('select');
        input.innerHTML = '<option value="true">Yes</option><option value="false">No</option>';
        input.value = oldValue ? 'true' : 'false';
    } else if (field === 'freq' || field === 'apply_to') {
        input = document.createElement('select');
        if (field === 'freq') input.innerHTML = '<option value="week">Weekly</option><option value="bi-week">Bi-Weekly</option><option value="month">Monthly</option><option value="day">Daily</option>';
        if (field === 'apply_to') input.innerHTML = '<option value="amount">Amount</option><option value="balance">Balance</option><option value="both">Both</option>';
        input.value = oldValue;
    } else if (field === 'amount' || field === 'pct_change') {
        input = document.createElement('input');
        input.type = 'number';
        input.value = oldValue;
        input.step = '0.01';
    } else {
        input = document.createElement('input');
        input.type = 'text';
        input.value = oldValue || '';
    }

    const saveChange = () => {
        let newValue = input.value;
        if (input.type === 'number') {
            newValue = parseFloat(newValue);
        } else if (input.type === 'date') {
            // no change
        } else if (input.tagName.toLowerCase() === 'select' && field === 'recurring') {
            newValue = (newValue === 'true');
        }
        
        transactions[idx][field] = newValue;
        td.textContent = field === 'recurring' ? (newValue ? 'Yes' : 'No') : newValue;
        afterDataChange();
    };

    input.onblur = saveChange;
    input.onkeydown = function(e) {
        if (e.key === 'Enter') {
            saveChange();
        } else if (e.key === 'Escape') {
            td.textContent = field === 'recurring' ? (oldValue ? 'Yes' : 'No') : oldValue;
        }
    };

    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
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
