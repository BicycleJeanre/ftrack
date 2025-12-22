// forecast-generator.js
// Self-contained module to generate financial forecasts based on app-data.json and grid definitions
// Overwrites the first forecast in app-data.json

import fs from 'fs';
import path from 'path';

// Utility: Parse date string to Date object
function parseDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr);
}

// Utility: Add periods to a date
function addPeriod(date, periodType, count) {
  const d = new Date(date);
  switch (periodType) {
    case 'Day': d.setDate(d.getDate() + count); break;
    case 'Week': d.setDate(d.getDate() + 7 * count); break;
    case 'Month': d.setMonth(d.getMonth() + count); break;
    case 'Quarter': d.setMonth(d.getMonth() + 3 * count); break;
    case 'Year': d.setFullYear(d.getFullYear() + count); break;
    default: d.setDate(d.getDate() + count); break;
  }
  return d;
}

// Utility: Format date as YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

// Compound interest (future value)
function compoundInterestFV(PV, r, n, t) {
  return PV * Math.pow(1 + r / n, n * t);
}

// Simple interest (future value)
function simpleInterestFV(PV, r, t) {
  return PV * (1 + r * t);
}

// Main forecast generator
export async function generateForecast({
  dataPath = '../assets/app-data.json',
  outputPath = '../assets/app-data.json',
  log = false
} = {}) {
  // 1. Load app-data.json
  const resolvedDataPath = path.resolve(__dirname, dataPath);
  const resolvedOutputPath = path.resolve(__dirname, outputPath);
  const raw = fs.readFileSync(resolvedDataPath, 'utf-8');
  const appData = JSON.parse(raw);

  // 2. Use first budget definition
  const budgetDef = appData.budgetDefinitions[0];
  if (!budgetDef) throw new Error('No budget definition found');

  // 3. Get forecast account
  const account = appData.accounts.find(a => a.id === budgetDef.accounts.id);
  if (!account) throw new Error('Forecast account not found');

  // 4. Determine periods
  const periodType = budgetDef.periodType.name;
  let periods = [];
  let startDate = parseDate(budgetDef.startDate);
  let endDate = parseDate(budgetDef.endDate);
  let periodCount = budgetDef.periodCount;
  if (budgetDef.mode.name === 'daterange') {
    let d = new Date(startDate);
    let i = 0;
    while (d <= endDate) {
      periods.push(formatDate(d));
      d = addPeriod(d, periodType, 1);
      i++;
      if (i > 1000) break; // safety
    }
  } else if (budgetDef.mode.name === 'periods') {
    let d = new Date(startDate);
    for (let i = 0; i < periodCount; i++) {
      periods.push(formatDate(d));
      d = addPeriod(d, periodType, 1);
    }
  } else if (budgetDef.mode.name === 'timeless') {
    for (let i = 0; i < periodCount; i++) {
      periods.push('Period ' + (i + 1));
    }
  }

  // 5. Gather relevant transactions
  const relevantTx = appData.transactions.filter(tx => {
    if (!tx.debit_account && !tx.credit_account) return false;
    return (tx.debit_account && tx.debit_account.id === account.id) ||
           (tx.credit_account && tx.credit_account.id === account.id);
  });

  // 6. Prepare interest settings
  const interest = Array.isArray(account.interest) ? account.interest[0] : account.interest;
  const interestType = interest.calculationMethod.name; // 'Compound' or 'Simple'
  const nominalRate = Number(interest.nominalRate) / 100; // as decimal
  const compounding = interest.compoundingInterval ? interest.compoundingInterval.name : periodType;
  const n = {
    'Monthly': 12,
    'Quarterly': 4,
    'Annually': 1,
    'Weekly': 52,
    'Daily': 365
  }[compounding] || 12;

  // 7. Forecast loop
  let runningBalance = Number(account.balance);
  let forecast = [];
  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    // Find transactions for this period
    let periodTx = relevantTx.filter(tx => {
      // If recurring, check if this period matches recurrence (not implemented, so just include all recurring for now)
      if (tx.isRecurring && tx.isRecurring !== false && tx.isRecurring !== '') return true;
      // If not recurring, check if period matches transaction date (not implemented, so just include all for now)
      return true;
    });
    // Apply transactions
    let netMovement = 0;
    periodTx.forEach(tx => {
      if (tx.debit_account && tx.debit_account.id === account.id) {
        netMovement -= Number(tx.amount) || 0;
      }
      if (tx.credit_account && tx.credit_account.id === account.id) {
        netMovement += Number(tx.amount) || 0;
      }
    });
    runningBalance += netMovement;
    // Apply interest after transactions
    if (interestType === 'Compound') {
      runningBalance = compoundInterestFV(runningBalance, nominalRate, n, 1 / n);
    } else {
      runningBalance = simpleInterestFV(runningBalance, nominalRate, 1 / n);
    }
    // Record forecast
    forecast.push({
      id: i + 1,
      movement: { id: netMovement >= 0 ? 2 : 1, name: netMovement >= 0 ? 'Credit' : 'Debit' },
      accountPrimary: { id: account.id, name: account.name },
      accountSecondary: null,
      period: period,
      amount: runningBalance
    });
    if (log) console.log(`Period ${period}: Balance = ${runningBalance.toFixed(2)}`);
  }

  // 8. Overwrite first forecast
  appData.budgetForecasts[0] = forecast[0];
  appData.budgetForecasts = forecast;
  fs.writeFileSync(resolvedOutputPath, JSON.stringify(appData, null, 2));
  if (log) console.log('Forecast written to', resolvedOutputPath);
  return forecast;
}

// If run directly, generate forecast and log output
if (process.argv[1] && process.argv[1].endsWith('forecast-generator.js')) {
  generateForecast({ log: true }).then(forecast => {
    console.log('Forecast complete.');
  });
}
