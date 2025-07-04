// Functions for Account & Transaction Financial Simulation
// --- Data Structures ---
let accounts = [];
let transactions = [];
let editingAccount = null;
let editingTxn = null;
let simulationResults = [];

// --- Helpers ---
const getEl = id => document.getElementById(id);
function formatDate(date) { return date.toISOString().slice(0,10); }
function addPeriod(date, type, count=1) {
    let d = new Date(date);
    if (type === 'month') d.setMonth(d.getMonth() + count);
    else if (type === 'day') d.setDate(d.getDate() + count);
    return d;
}
function dateInRange(date, start, end) {
    return (!start || date >= start) && (!end || date <= end);
}
function updateTxnAccountOptions() {
    const sel = getEl('txn_account');
    sel.innerHTML = '';
    accounts.forEach((acct, idx) => {
        const opt = document.createElement('option');
        opt.value = acct.name;
        opt.textContent = acct.name;
        sel.appendChild(opt);
    });
}
function saveSimulationData() {
    const data = {
        accounts,
        transactions,
        simulationResults
    };
    try {
        // Save to local file using File System Access API if available
        if (window.showSaveFilePicker) {
            window.showSaveFilePicker({
                suggestedName: 'simulation-data.json',
                types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
            }).then(async (handle) => {
                const writable = await handle.createWritable();
                await writable.write(JSON.stringify(data, null, 2));
                await writable.close();
                alert('Simulation data saved!');
            });
        } else {
            // Fallback: download as file
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'simulation-data.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert('Simulation data downloaded!');
        }
    } catch (e) {
        alert('Failed to save simulation data: ' + e.message);
    }
}
// --- Account Table ---
function renderAccounts() {
    const tbody = getEl('accountsTable').querySelector('tbody');
    tbody.innerHTML = '';
    accounts.forEach((acct, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${acct.name}</td>
            <td>${acct.balance}</td>
            <td>${acct.interest}</td>
            <td>
                <button onclick="editAccount(${idx})">Edit</button>
                <button onclick="deleteAccount(${idx})">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    updateTxnAccountOptions();
}
function editAccount(idx) {
    const acct = accounts[idx];
    getEl('acct_name').value = acct.name;
    getEl('acct_balance').value = acct.balance;
    getEl('acct_interest').value = acct.interest;
    editingAccount = idx;
}
function deleteAccount(idx) {
    accounts.splice(idx,1);
    afterDataChange();
}
// --- Account Form ---
getEl('accountForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const acct = {
        name: getEl('acct_name').value,
        balance: parseFloat(getEl('acct_balance').value),
        interest: parseFloat(getEl('acct_interest').value)
    };
    if (editingAccount !== null) {
        accounts[editingAccount] = acct;
        editingAccount = null;
    } else {
        accounts.push(acct);
    }
    this.reset();
    afterDataChange();
});
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
// --- Simulation Logic ---
function runSimulation() {
    // Determine periods
    const mode = getEl('mode').value;
    let periods = [];
    let periodType = getEl('period_type').value;
    if (mode === 'daterange') {
        let date = new Date(getEl('start_date').value);
        const end = new Date(getEl('end_date').value);
        while (date <= end) {
            periods.push(formatDate(date));
            date = addPeriod(date, periodType, 1);
        }
    } else if (mode === 'periods' || mode === 'timeless') {
        let count = parseInt(getEl('period_count').value);
        let date = new Date();
        for (let i=0; i<count; i++) {
            periods.push(mode === 'timeless' ? `Period ${i+1}` : formatDate(date));
            date = addPeriod(date, periodType, 1);
        }
    }
    // Initialize account balances
    let acctStates = accounts.map(acct => ({ name: acct.name, balance: new Decimal(acct.balance), interest: new Decimal(acct.interest) }));
    let txnStates = transactions.map(txn => ({...txn, currentAmount: new Decimal(txn.amount)}));
    let results = [];
    periods.forEach((period, idx) => {
        // Apply interest to each account
        acctStates.forEach(acct => {
            if (acct.interest && !isNaN(acct.interest)) {
                acct.balance = acct.balance.times(new Decimal(1).plus(acct.interest.div(100)));
            }
        });
        // Apply transactions
        txnStates.forEach(txn => {
            let apply = false;
            let txnDate = txn.date;
            let endDate = txn.end_date;
            if (txn.recurring) {
                if (dateInRange(period, txnDate, endDate)) {
                    apply = true;
                }
            } else if (txnDate === period) {
                apply = true;
            }
            if (apply) {
                let acct = acctStates.find(a => a.name === txn.account);
                if (!acct) return;
                let amt = txn.currentAmount;
                if (txn.apply_to === 'amount' || txn.apply_to === 'both') {
                    txn.currentAmount = txn.currentAmount.times(new Decimal(1).plus(new Decimal(txn.pct_change).div(100)));
                }
                if (txn.apply_to === 'balance' || txn.apply_to === 'both') {
                    amt = amt.plus(acct.balance.times(new Decimal(txn.pct_change).div(100)));
                }
                acct.balance = acct.balance.plus(amt);
            }
        });
        // Record snapshot
        results.push({ period, accounts: acctStates.map(a => ({ name: a.name, balance: a.balance.toFixed(2) })) });
    });
    simulationResults = results;
    renderResultsTable();
    renderFinancialChart();
    saveSimulationData();
}
// --- Results Table ---
function renderResultsTable() {
    const div = getEl('resultsTableDiv');
    let html = '<table><thead><tr><th>Period</th>';
    if (accounts.length) accounts.forEach(a => { html += `<th>${a.name}</th>`; });
    html += '</tr></thead><tbody>';
    simulationResults.forEach(row => {
        html += `<tr><td>${row.period}</td>`;
        row.accounts.forEach(a => { html += `<td>${a.balance}</td>`; });
        html += '</tr>';
    });
    html += '</tbody></table>';
    div.innerHTML = html;
}
// --- Chart ---
function renderFinancialChart() {
    const periods = simulationResults.map(r => r.period);
    let data = accounts.map((acct, idx) => {
        return {
            x: periods,
            y: simulationResults.map(row => {
                let a = row.accounts.find(x => x.name === acct.name);
                return a ? parseFloat(a.balance) : 0;
            }),
            mode: 'lines+markers',
            name: acct.name
        };
    });
    Plotly.newPlot('financialChart', data, { title: 'Account Balances Over Time', xaxis: { title: 'Period' }, yaxis: { title: 'Balance' } }, { responsive: true });
}
// --- Panel Toggling ---
function toggleAccordion(panelId) {
    const panel = document.getElementById(panelId);
    panel.classList.toggle('collapsed-panel');
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
// --- Event Listeners ---
getEl('runSimulationBtn').addEventListener('click', runSimulation);
getEl('mode').addEventListener('change', function() {});
// Set default start/end date
getEl('start_date').value = new Date().toISOString().slice(0,10);
let d = new Date(); d.setMonth(d.getMonth()+11);
getEl('end_date').value = d.toISOString().slice(0,10);
renderAccounts();
renderTransactions();
// --- Patch import event to use simple import logic ---
const importInput = document.getElementById('importJsonInput');
if (importInput) {
    importInput.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (data.accounts && data.transactions && data.simulationResults) {
                    accounts = data.accounts;
                    transactions = data.transactions;
                    simulationResults = data.simulationResults;
                    afterDataChange();
                    alert('Simulation data imported!');
                } else {
                    alert('Invalid simulation data file.');
                }
            } catch (err) {
                alert('Error reading file: ' + err.message);
            }
        };
        reader.readAsText(file);
    });
}
