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

// --- Ensure simulation-storage.js and default-data.js are loaded ---
(function ensureSharedScripts() {
    function loadScript(src) {
        return new Promise(function(resolve, reject) {
            if (document.querySelector('script[src="' + src + '"]')) return resolve();
            var s = document.createElement('script');
            s.src = src;
            s.onload = function() { console.log('[DEBUG] Loaded script:', src); resolve(); };
            s.onerror = function(e) { console.error('[DEBUG] Failed to load script:', src, e); reject(e); };
            document.head.appendChild(s);
        });
    }
    if (!window.getSimulationState || !window.saveSimulationToLocalStorage) {
        console.log('[DEBUG] simulation-storage.js not loaded, loading...');
        loadScript('js/simulation-storage.js');
    }
    if (!window.accounts || !window.transactions) {
        console.log('[DEBUG] default-data.js not loaded, loading...');
        loadScript('js/default-data.js');
    }
})();

// --- LocalStorage Save/Load for full simulation ---
document.addEventListener('DOMContentLoaded', function() {
    // Add Save button to page if not present
    function addSaveButton() {
        if (!document.getElementById('saveTransactionsBtn')) {
            const btn = document.createElement('button');
            btn.id = 'saveTransactionsBtn';
            btn.textContent = 'Save Simulation';
            btn.style = 'margin: 12px 0 24px 0; float:right;';
            btn.onclick = function() {
                console.log('[DEBUG] Save Simulation button clicked');
                if (window.downloadSimulationFile) {
                    window.downloadSimulationFile();
                    console.log('[DEBUG] Simulation state downloaded:', window.getSimulationState());
                } else {
                    console.error('[DEBUG] downloadSimulationFile is not defined');
                }
            };
            const container = document.querySelector('.container');
            if (container) container.insertBefore(btn, container.firstChild.nextSibling);
        }
    }
    addSaveButton();
    // Warn on close if not saved
    let lastSaved = JSON.stringify(window.getSimulationState());
    window.addEventListener('beforeunload', function(e) {
        if (JSON.stringify(window.getSimulationState()) !== lastSaved) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Save before leaving?';
            return e.returnValue;
        }
    });
    // On manual save, update lastSaved
    var saveBtn = document.getElementById('saveTransactionsBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            lastSaved = JSON.stringify(window.getSimulationState());
            console.log('[DEBUG] lastSaved updated:', lastSaved);
        });
    }
    // Load from LocalStorage on page load
    window.loadSimulationFromLocalStorage();
    // Provide a minimal transactions array and afterDataChange for demo/standalone
    if (typeof window.transactions === 'undefined') {
        window.transactions = [
            { name: 'Salary', account: 'Checking', amount: 1000, date: '2025-07-01', recurring: true, end_date: '2025-12-31', freq: 'month', pct_change: 2, apply_to: 'amount' },
            { name: 'Rent', account: 'Checking', amount: -500, date: '2025-07-01', recurring: true, end_date: '2025-12-31', freq: 'month', pct_change: 0, apply_to: 'amount' }
        ];
    }
    if (typeof window.editingTxn === 'undefined') {
        window.editingTxn = null;
    }
    // Call updateTxnAccountOptions after rendering and afterDataChange
    window.renderTransactions = function() {
        const tbody = getEl('transactionsTable').querySelector('tbody');
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
    };
    if (typeof window.afterDataChange === 'undefined') {
        window.afterDataChange = function() { renderTransactions(); updateTxnAccountOptions(); };
    }
    // Attach core functions to window for standalone mode
    window.editTxn = editTxn;
    window.deleteTxn = deleteTxn;
    window.renderTransactions = renderTransactions;
    // Initial render
    renderTransactions();
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
            let newIdx = null;
            if (editingTxn !== null) {
                transactions[editingTxn] = txn;
                newIdx = editingTxn;
                editingTxn = null;
            } else {
                transactions.push(txn);
                newIdx = transactions.length - 1;
            }
            this.reset();
            afterDataChange();
        });
    }
});
// Transactions logic partial
// --- Transaction Table ---
function renderTransactions() {
    const tbody = getEl('transactionsTable').querySelector('tbody');
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
    transactions.splice(idx,1);
    afterDataChange();
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
        if (field === 'freq') input.innerHTML = '<option value="month">Monthly</option><option value="day">Daily</option>';
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
    }
    input.onblur = input.onchange = function() {/* ... */};
    input.onkeydown = function(e) {/* ... */};
    td.textContent = '';
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
// After any data change, save to LocalStorage
const originalAfterDataChange = window.afterDataChange;
window.afterDataChange = function() {
    if (originalAfterDataChange) originalAfterDataChange();
    window.saveSimulationToLocalStorage();
};
