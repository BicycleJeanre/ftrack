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
    switch(type) {
        case 'month':
            d.setMonth(d.getMonth() + count);
            break;
        case 'quarter':
            d.setMonth(d.getMonth() + 3 * count);
            break;
        case 'year':
            d.setFullYear(d.getFullYear() + count);
            break;
        case 'week-break': {
            // Advance by week, but break on month
            let startMonth = d.getMonth();
            let startYear = d.getFullYear();
            d.setDate(d.getDate() + 7 * count);
            if (d.getMonth() !== startMonth || d.getFullYear() !== startYear) {
                // Go to first of next month
                d = new Date(startYear, startMonth + 1, 1);
            }
            break;
        }
        case 'week':
            d.setDate(d.getDate() + 7 * count);
            break;
        case 'day':
        default:
            d.setDate(d.getDate() + count);
    }
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
                <button onclick="editAccount(${idx})">Edit</button>
                <button onclick="deleteAccount(${idx})">Delete</button>
                <button onclick="openInterestModal(${idx})">Add/Edit Interest</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    updateTxnAccountOptions();
}

// --- Interest Modal Logic ---
function openInterestModal(idx) {
    const acct = accounts[idx];
    const modal = document.getElementById('interestModal');
    modal.style.display = 'flex';
    modal.dataset.idx = idx;
    getEl('modal_acct_interest').value = acct.interest !== undefined ? acct.interest : 0;
    getEl('modal_acct_interest_period').value = acct.interest_period || 'month';
    getEl('modal_acct_compound_period').value = acct.compound_period || 'month';
    getEl('modal_acct_interest_type').value = acct.interest_type || 'compound';
}
getEl('closeInterestModal').onclick = function() {
    document.getElementById('interestModal').style.display = 'none';
};
getEl('cancelInterestBtn').onclick = function() {
    document.getElementById('interestModal').style.display = 'none';
};
getEl('saveInterestBtn').onclick = function() {
    const idx = document.getElementById('interestModal').dataset.idx;
    if (idx !== undefined && accounts[idx]) {
        accounts[idx].interest = parseFloat(getEl('modal_acct_interest').value);
        accounts[idx].interest_period = getEl('modal_acct_interest_period').value;
        accounts[idx].compound_period = getEl('modal_acct_compound_period').value;
        accounts[idx].interest_type = getEl('modal_acct_interest_type').value;
        afterDataChange();
    }
    document.getElementById('interestModal').style.display = 'none';
};

// --- Account Form ---
getEl('accountForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const acct = {
        name: getEl('acct_name').value,
        balance: parseFloat(getEl('acct_balance').value)
    };
    let newIdx = null;
    if (editingAccount !== null) {
        // preserve interest settings if present
        Object.assign(acct, accounts[editingAccount]);
        acct.name = getEl('acct_name').value;
        acct.balance = parseFloat(getEl('acct_balance').value);
        accounts[editingAccount] = acct;
        newIdx = editingAccount;
        editingAccount = null;
    } else {
        accounts.push(acct);
        newIdx = accounts.length - 1;
    }
    this.reset();
    afterDataChange();
    // Immediately open interest modal for new/edited account
    openInterestModal(newIdx);
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
function getPeriodsPerYear(periodType) {
    switch (periodType) {
        case 'year': return 1;
        case 'quarter': return 4;
        case 'month': return 12;
        case 'week': return 52;
        case 'day': return 365;
        default: return 1;
    }
}
function shouldCompoundThisPeriod(idx, compoundPeriod, periodType) {
    // Returns true if this period is a compounding point
    const periodsPerYear = getPeriodsPerYear(periodType);
    const compoundPerYear = getPeriodsPerYear(compoundPeriod);
    if (compoundPerYear >= periodsPerYear) {
        // e.g. monthly compounding in monthly periods, or less frequent
        return (idx + 1) % Math.round(periodsPerYear / compoundPerYear) === 0;
    } else {
        // e.g. daily compounding in monthly periods (not typical, but handle)
        return true;
    }
}
function runSimulation() {
    console.log('runSimulation called');
    // Determine periods
    const mode = getEl('mode').value;
    let periods = [];
    let periodType = getEl('period_type').value;
    console.log('mode:', mode, 'periodType:', periodType);
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
    console.log('periods:', periods);
    // Initialize account balances
    let acctStates = accounts.map(acct => ({
        name: acct.name,
        balance: new Decimal(acct.balance),
        interest: new Decimal(acct.interest || 0),
        interest_period: acct.interest_period || 'year',
        compound_period: acct.compound_period || 'year',
        interest_type: acct.interest_type || 'compound'
    }));
    let txnStates = transactions.map(txn => ({...txn, currentAmount: new Decimal(txn.amount)}));
    console.log('accounts:', accounts);
    console.log('transactions:', transactions);
    let results = [];
    periods.forEach((period, idx) => {
        // Apply interest to each account
        acctStates.forEach(acct => {
            if (acct.interest && !isNaN(acct.interest)) {
                // Only apply if this is a compounding period
                if (shouldCompoundThisPeriod(idx, acct.compound_period, periodType)) {
                    const periodsPerYear = getPeriodsPerYear(periodType);
                    const compoundPerYear = getPeriodsPerYear(acct.compound_period);
                    // Convert annual rate to per-compound-period rate
                    let r = acct.interest.div(100);
                    let n = compoundPerYear;
                    let ratePerCompound = r.div(n);
                    if (acct.interest_type === 'compound') {
                        acct.balance = acct.balance.times(new Decimal(1).plus(ratePerCompound));
                    } else {
                        // Simple interest: add interest only on original principal
                        // (simulate by storing original principal if needed)
                        if (!acct._principal) acct._principal = acct.balance;
                        acct.balance = acct.balance.plus(acct._principal.times(ratePerCompound));
                    }
                }
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
getEl('mode').addEventListener('change', function() {
    const mode = getEl('mode').value;
    const dateFields = document.getElementById('dateFields');
    const periodFields = document.getElementById('periodFields');
    const periodTypeFields = document.getElementById('periodTypeFields');
    if (mode === 'daterange') {
        dateFields.style.display = '';
        periodFields.style.display = 'none';
        periodTypeFields.style.display = '';
    } else if (mode === 'periods') {
        dateFields.style.display = 'none';
        periodFields.style.display = '';
        periodTypeFields.style.display = '';
    } else if (mode === 'timeless') {
        dateFields.style.display = 'none';
        periodFields.style.display = '';
        periodTypeFields.style.display = '';
    }
});
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

// When loading or processing transactions, use default values for missing fields
function getTransactionWithDefaults(tx) {
  return {
    name: typeof tx.name === 'string' ? tx.name : '',
    account: typeof tx.account === 'string' ? tx.account : '',
    amount: typeof tx.amount === 'number' ? tx.amount : 0.0,
    date: typeof tx.date === 'string' ? tx.date : '',
    recurring: typeof tx.recurring === 'boolean' ? tx.recurring : false,
    end_date: typeof tx.end_date === 'string' || tx.end_date === null ? tx.end_date : null,
    freq: typeof tx.freq === 'string' ? tx.freq : '',
    pct_change: typeof tx.pct_change === 'number' ? tx.pct_change : 0.0,
    apply_to: typeof tx.apply_to === 'string' ? tx.apply_to : ''
  };
}
// Use this function wherever transactions are loaded or displayed
// Example: transactions.map(getTransactionWithDefaults)

function afterDataChange() {
    renderAccounts();
    renderTransactions();
    // Add any other UI updates needed after data changes
}
// --- Financial Calculator ---
const formulaFields = {
    'compound-fv': [
        { id: 'pv', label: 'Present Value (PV)', type: 'number', step: '0.01' },
        { id: 'r', label: 'Annual Rate (%)', type: 'number', step: '0.0001' },
        { id: 'n', label: 'Compounds/Year', type: 'number', step: '1', min: '1' },
        { id: 't', label: 'Years', type: 'number', step: '0.01' }
    ],
    'compound-pv': [
        { id: 'fv', label: 'Future Value (FV)', type: 'number', step: '0.01' },
        { id: 'r', label: 'Annual Rate (%)', type: 'number', step: '0.0001' },
        { id: 'n', label: 'Compounds/Year', type: 'number', step: '1', min: '1' },
        { id: 't', label: 'Years', type: 'number', step: '0.01' }
    ],
    'annuity-fv': [
        { id: 'p', label: 'Payment/Period (P)', type: 'number', step: '0.01' },
        { id: 'r', label: 'Annual Rate (%)', type: 'number', step: '0.0001' },
        { id: 'n', label: 'Compounds/Year', type: 'number', step: '1', min: '1' },
        { id: 't', label: 'Years', type: 'number', step: '0.01' }
    ],
    'annuity-pv': [
        { id: 'p', label: 'Payment/Period (P)', type: 'number', step: '0.01' },
        { id: 'r', label: 'Annual Rate (%)', type: 'number', step: '0.0001' },
        { id: 'n', label: 'Compounds/Year', type: 'number', step: '1', min: '1' },
        { id: 't', label: 'Years', type: 'number', step: '0.01' }
    ],
    'annuity-due-fv': [
        { id: 'p', label: 'Payment/Period (P)', type: 'number', step: '0.01' },
        { id: 'r', label: 'Annual Rate (%)', type: 'number', step: '0.0001' },
        { id: 'n', label: 'Compounds/Year', type: 'number', step: '1', min: '1' },
        { id: 't', label: 'Years', type: 'number', step: '0.01' }
    ],
    'annuity-due-pv': [
        { id: 'p', label: 'Payment/Period (P)', type: 'number', step: '0.01' },
        { id: 'r', label: 'Annual Rate (%)', type: 'number', step: '0.0001' },
        { id: 'n', label: 'Compounds/Year', type: 'number', step: '1', min: '1' },
        { id: 't', label: 'Years', type: 'number', step: '0.01' }
    ],
    'perpetuity-pv': [
        { id: 'p', label: 'Payment/Period (P)', type: 'number', step: '0.01' },
        { id: 'r', label: 'Annual Rate (%)', type: 'number', step: '0.0001' }
    ],
    'ear': [
        { id: 'r', label: 'Annual Rate (%)', type: 'number', step: '0.0001' },
        { id: 'n', label: 'Compounds/Year', type: 'number', step: '1', min: '1' }
    ]
};

function renderCalcFields() {
    const formula = getEl('calc_formula').value;
    const fields = formulaFields[formula] || [];
    const div = getEl('calc-fields');
    div.innerHTML = '';
    fields.forEach(f => {
        const label = document.createElement('label');
        label.htmlFor = 'calc_' + f.id;
        label.textContent = f.label;
        const input = document.createElement('input');
        input.type = f.type;
        input.id = 'calc_' + f.id;
        input.step = f.step;
        if (f.min) input.min = f.min;
        input.required = true;
        div.appendChild(label);
        div.appendChild(input);
    });
}
if (getEl('calc_formula')) {
    getEl('calc_formula').addEventListener('change', renderCalcFields);
    renderCalcFields();
}
if (getEl('calculatorForm')) {
    getEl('calculatorForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const formula = getEl('calc_formula').value;
        let v = {};
        (formulaFields[formula] || []).forEach(f => {
            v[f.id] = parseFloat(getEl('calc_' + f.id).value);
        });
        let result = '';
        switch (formula) {
            case 'compound-fv':
                result = v.pv * Math.pow(1 + v.r/100/v.n, v.n*v.t);
                break;
            case 'compound-pv':
                result = v.fv / Math.pow(1 + v.r/100/v.n, v.n*v.t);
                break;
            case 'annuity-fv':
                result = v.p * ( (Math.pow(1 + v.r/100/v.n, v.n*v.t) - 1) / (v.r/100/v.n) );
                break;
            case 'annuity-pv':
                result = v.p * (1 - Math.pow(1 + v.r/100/v.n, -v.n*v.t)) / (v.r/100/v.n);
                break;
            case 'annuity-due-fv':
                result = v.p * ( (Math.pow(1 + v.r/100/v.n, v.n*v.t) - 1) / (v.r/100/v.n) ) * (1 + v.r/100/v.n);
                break;
            case 'annuity-due-pv':
                result = v.p * (1 - Math.pow(1 + v.r/100/v.n, -v.n*v.t)) / (v.r/100/v.n) * (1 + v.r/100/v.n);
                break;
            case 'perpetuity-pv':
                result = v.p / (v.r/100);
                break;
            case 'ear':
                result = Math.pow(1 + v.r/100/v.n, v.n) - 1;
                break;
            default:
                result = 'N/A';
        }
        getEl('calc-result').textContent = (typeof result === 'number' && !isNaN(result)) ? 'Result: ' + result.toFixed(6) : 'Invalid input.';
    });
}
