// --- Financial Forecast Logic ---
// Adapted from simulation.js

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

// --- Helper Functions ---
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
    const periodsPerYear = getPeriodsPerYear(periodType);
    const compoundPerYear = getPeriodsPerYear(compoundPeriod);
    if (compoundPerYear >= periodsPerYear) {
        return (idx + 1) % Math.round(periodsPerYear / compoundPerYear) === 0;
    } else {
        return true;
    }
}
function formatDate(date) {
    return date.toISOString().slice(0,10);
}
function addPeriod(date, periodType, n) {
    let d = new Date(date);
    switch (periodType) {
        case 'day': d.setDate(d.getDate() + n); break;
        case 'week': d.setDate(d.getDate() + 7*n); break;
        case 'month': d.setMonth(d.getMonth() + n); break;
        case 'quarter': d.setMonth(d.getMonth() + 3*n); break;
        case 'year': d.setFullYear(d.getFullYear() + n); break;
        default: d.setDate(d.getDate() + n);
    }
    return d;
}
function dateInRange(period, start, end) {
    if (!start || !end) return false;
    return period >= start && period <= end;
}

// --- Forecast Logic ---
let forecastResults = [];
function runForecast() {
    console.log('[DEBUG] runForecast called');
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
    let acctStates = accounts.map(acct => ({
        name: acct.name,
        balance: new Decimal(acct.balance),
        interest: new Decimal(acct.interest || 0),
        interest_period: acct.interest_period || 'year',
        compound_period: acct.compound_period || 'year',
        interest_type: acct.interest_type || 'compound'
    }));
    let txnStates = transactions.map(txn => ({...txn, currentAmount: new Decimal(txn.amount)}));
    let results = [];
    periods.forEach((period, idx) => {
        // Apply interest to each account
        acctStates.forEach(acct => {
            if (acct.interest && !isNaN(acct.interest)) {
                if (shouldCompoundThisPeriod(idx, acct.compound_period, periodType)) {
                    let r = acct.interest.div(100);
                    let n = getPeriodsPerYear(acct.compound_period);
                    let ratePerCompound = r.div(n);
                    if (acct.interest_type === 'compound') {
                        acct.balance = acct.balance.times(new Decimal(1).plus(ratePerCompound));
                    } else {
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
    forecastResults = results;
    renderResultsTable();
    renderFinancialChart();
    saveForecastData();
}
// --- Results Table ---
function renderResultsTable() {
    const div = getEl('resultsTableDiv');
    let html = '<table><thead><tr><th>Period</th>';
    if (accounts.length) accounts.forEach(a => { html += `<th>${a.name}</th>`; });
    html += '</tr></thead><tbody>';
    forecastResults.forEach(row => {
        html += `<tr><td>${row.period}</td>`;
        row.accounts.forEach(a => { html += `<td>${a.balance}</td>`; });
        html += '</tr>';
    });
    html += '</tbody></table>';
    div.innerHTML = html;
}
// --- Chart ---
function renderFinancialChart() {
    const periods = forecastResults.map(r => r.period);
    let data = accounts.map((acct, idx) => {
        return {
            x: periods,
            y: forecastResults.map(row => {
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
// --- Save/Load Logic ---
function saveForecastData() {
    if (window.saveSimulationToLocalStorage) {
        window.saveSimulationToLocalStorage();
        console.log('[DEBUG] Forecast state saved to LocalStorage.');
    }
}
// --- Add Save Forecast Button ---
function addSaveButton() {
    if (!document.getElementById('saveForecastBtn')) {
        const btn = document.createElement('button');
        btn.id = 'saveForecastBtn';
        btn.textContent = 'Save Forecast';
        btn.style = 'margin: 12px 0 24px 0; float:right;';
        btn.onclick = function() {
            console.log('[DEBUG] Save Forecast button clicked');
            if (window.downloadSimulationFile) {
                window.downloadSimulationFile();
                console.log('[DEBUG] Forecast state downloaded:', window.getSimulationState());
            } else {
                console.error('[DEBUG] downloadSimulationFile is not defined');
            }
        };
        const container = document.querySelector('.container');
        if (container) container.insertBefore(btn, container.firstChild.nextSibling);
    }
}
document.addEventListener('DOMContentLoaded', function() {
    addSaveButton();
    // Set up event listeners
    getEl('runForecastBtn').addEventListener('click', runForecast);
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
    renderAccounts && renderAccounts();
    renderTransactions && renderTransactions();
});
