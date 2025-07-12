// This file was renamed from simulation.js. All logic now uses forecast/Forecast naming conventions.

// --- Financial Forecast Logic ---
// Adapted from simulation.js

// --- Helper Functions ---
if (typeof window.getEl === 'undefined') {
    window.getEl = function(id) { return document.getElementById(id); };
}

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
    window.forecastResults = results;
    renderResultsTable();
    renderFinancialChart();
    saveForecastData();
}
// --- Results Table ---
function renderResultsTable() {
    const div = getEl('resultsTableDiv');
    if (!div) return;
    let html = '<table><thead><tr><th>Period</th>';
    if (window.accounts && window.accounts.length) window.accounts.forEach(a => { html += `<th>${a.name}</th>`; });
    html += '</tr></thead><tbody>';
    if (window.forecastResults) {
        window.forecastResults.forEach(row => {
            html += `<tr><td>${row.period}</td>`;
            if (window.accounts) {
                window.accounts.forEach(acc => {
                    const accountResult = row.accounts.find(a => a.name === acc.name);
                    html += `<td>${accountResult ? accountResult.balance : 'N/A'}</td>`;
                });
            }
            html += '</tr>';
        });
    }
    html += '</tbody></table>';
    div.innerHTML = html;
}
// --- Chart ---
function renderFinancialChart() {
    if (!getEl('financialChart')) return;
    if (!window.forecastResults || window.forecastResults.length === 0) {
        Plotly.newPlot('financialChart', [], { title: 'Account Balances Over Time' });
        return;
    }
    const periods = window.forecastResults.map(r => r.period);
    let data = [];
    if (window.accounts) {
        data = window.accounts.map((acct, idx) => {
            return {
                x: periods,
                y: window.forecastResults.map(row => {
                    let a = row.accounts.find(x => x.name === acct.name);
                    return a ? parseFloat(a.balance) : 0;
                }),
                mode: 'lines+markers',
                name: acct.name
            };
        });
    }
    Plotly.newPlot('financialChart', data, { title: 'Account Balances Over Time', xaxis: { title: 'Period' }, yaxis: { title: 'Balance' } }, { responsive: true });
}
// --- Panel Toggling ---
function toggleAccordion(panelId) {
    const panel = document.getElementById(panelId);
    panel.classList.toggle('collapsed-panel');
}
// --- Save/Load Logic ---
function saveForecastData() {
    if(window.filemgmt && typeof window.filemgmt.saveAppDataToFile === 'function') {
        window.filemgmt.saveAppDataToFile({
            accounts: window.accounts,
            transactions: window.transactions,
            forecast: window.forecast,
            budget: window.budget
        });
        console.log('[DEBUG] Forecast state saved to file.');
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
            if (window.downloadForecastFile) {
                window.downloadForecastFile();
                console.log('[DEBUG] Forecast state downloaded:', window.getForecastState());
            } else {
                console.error('[DEBUG] downloadForecastFile is not defined');
            }
        };
        const container = document.querySelector('.container');
        if (container) container.insertBefore(btn, container.firstChild.nextSibling);
    }
}

// --- On Load ---
window.addEventListener('load', () => {
    console.log('[DEBUG] Window loaded');
    // --- Account and Transaction Setup ---
    if (typeof window.accounts === 'undefined' || !window.accounts.length) {
        window.accounts = [
            { name: 'Checking', balance: 1000, interest: 2, interest_period: 'year', compound_period: 'year', interest_type: 'compound' },
            { name: 'Savings', balance: 5000, interest: 5, interest_period: 'year', compound_period: 'year', interest_type: 'compound' }
        ];
    }
    if (typeof window.transactions === 'undefined' || !window.transactions.length) {
        window.transactions = [
            { account: 'Checking', amount: 100, date: '2023-01-01', recurring: false, apply_to: 'balance', pct_change: 0 },
            { account: 'Savings', amount: 200, date: '2023-01-01', recurring: false, apply_to: 'balance', pct_change: 0 }
        ];
    }
    // --- Forecast and Budget Setup ---
    if (typeof window.forecast === 'undefined') {
        window.forecast = { /* default forecast settings */ };
    }
    if (typeof window.budget === 'undefined') {
        window.budget = { /* default budget settings */ };
    }
    // --- UI Initialization ---
    renderResultsTable();
    renderFinancialChart();
    addSaveButton();
    console.log('[DEBUG] Initialization complete');
});
