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
getEl('transactionForm').addEventListener('submit', function(e) {
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
