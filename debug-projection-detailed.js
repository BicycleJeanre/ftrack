import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load modules
const projectionEngine = await import('./js/domain/calculations/projection-engine.js');
const dateUtils = await import('./js/shared/date-utils.js');
const calculationEngine = await import('./js/domain/calculations/calculation-engine.js');
const transactionExpander = await import('./js/domain/calculations/transaction-expander.js');

// Load expected outputs
const fs = await import('fs');
const exp = JSON.parse(fs.readFileSync('./QC/expected-outputs.json', 'utf8'));
const testCase = exp.functionTests.recurrenceDates[0];

// Load helpers
const helpers = await import('./QC/tests/helpers.js');
const { buildScenario, getLookupData } = helpers;
const lookupData = getLookupData();

const startDate = testCase.projectionStart;
const endDate = testCase.projectionEnd;

const scenario = buildScenario({
  startDate,
  endDate,
  projectionPeriodName: 'Month',
  accounts: [
    {
      id: 1,
      name: 'A1',
      type: 1,
      currency: 1,
      startingBalance: 0,
      openDate: startDate,
      periodicChange: null,
      goalAmount: null,
      goalDate: null
    }
  ],
  transactions: [
    {
      id: 1,
      primaryAccountId: 1,
      secondaryAccountId: 1,
      transactionTypeId: 1,
      amount: 100,
      effectiveDate: startDate,
      description: 'QC recurrence integration',
      recurrence: testCase.recurrence,
      periodicChange: null,
      status: { name: 'planned', actualAmount: null, actualDate: null },
      tags: []
    }
  ]
});

console.log('=== SCENARIO ===');
console.log('Start:', scenario.startDate, 'End:', scenario.endDate);
console.log('Transaction recurrence:', JSON.stringify(scenario.transactions[0].recurrence));

// Manually debug the projection engine logic
const parsedStartDate = dateUtils.parseDateOnly(scenario.startDate);
const parsedEndDate = dateUtils.parseDateOnly(scenario.endDate);

console.log('\n=== PARSED DATES ===');
console.log('Start:', parsedStartDate.toISOString());
console.log('End:', parsedEndDate.toISOString());

// Expand transactions
const expandedTransactions = transactionExpander.expandTransactions(
  scenario.transactions,
  parsedStartDate,
  parsedEndDate,
  scenario.accounts
);

console.log('\n=== EXPANDED TRANSACTIONS ===');
console.log('Count:', expandedTransactions.length);
expandedTransactions.forEach((txn, i) => {
  const occDate = txn._occurrenceDate || dateUtils.parseDateOnly(txn.effectiveDate);
  const dateKey = occDate.getFullYear() * 10000 + (occDate.getMonth() + 1) * 100 + occDate.getDate();
  console.log(`[${i}] dateKey=${dateKey}, primaryAccountId=${txn.primaryAccountId}, transactionTypeId=${txn.transactionTypeId}, amount=${txn.amount}`);
});

// Create transactionOccurrences like projection engine does
const transactionOccurrences = expandedTransactions.map((txn) => {
  const occDate = txn._occurrenceDate || dateUtils.parseDateOnly(txn.effectiveDate);
  const occKey = occDate.getFullYear() * 10000 + (occDate.getMonth() + 1) * 100 + occDate.getDate();
  return {
    dateKey: occKey,
    primaryAccountId: txn.primaryAccountId,
    secondaryAccountId: txn.secondaryAccountId,
    transactionTypeId: txn.transactionTypeId,
    amount: txn.amount,
    description: txn.description,
    sourceTransactionId: txn.id
  };
});

console.log('\n=== TRANSACTION OCCURRENCES ===');
transactionOccurrences.forEach((txn, i) => {
  console.log(`[${i}] dateKey=${txn.dateKey}, primaryAccountId=${txn.primaryAccountId}, transactionTypeId=${txn.transactionTypeId}, amount=${txn.amount}`);
});

// Generate periods
function generatePeriods(startDate, endDate, periodicity) {
  const periods = [];
  let currentStart = new Date(startDate);

  while (currentStart < endDate) {
    const currentEnd = new Date(currentStart);

    if (periodicity === 'daily') {
      currentEnd.setDate(currentEnd.getDate() + 1);
    } else if (periodicity === 'weekly') {
      currentEnd.setDate(currentEnd.getDate() + 7);
    } else if (periodicity === 'monthly') {
      currentEnd.setMonth(currentEnd.getMonth() + 1);
    } else if (periodicity === 'quarterly') {
      currentEnd.setMonth(currentEnd.getMonth() + 3);
    } else if (periodicity === 'yearly') {
      currentEnd.setFullYear(currentEnd.getFullYear() + 1);
    }

    periods.push({
      start: new Date(currentStart),
      end: new Date(currentEnd)
    });

    currentStart = new Date(currentEnd);
  }

  return periods;
}

const periods = generatePeriods(parsedStartDate, parsedEndDate, 'monthly');

console.log('\n=== PERIODS ===');
periods.forEach((p, i) => {
  const startKey = p.start.getFullYear() * 10000 + (p.start.getMonth() + 1) * 100 + p.start.getDate();
   const endKey = p.end.getFullYear() * 10000 + (p.end.getMonth() + 1) * 100 + p.end.getDate();
  console.log(`[${i}] ${dateUtils.formatDateOnly(p.start)} to ${dateUtils.formatDateOnly(p.end)} (keys: ${startKey} - ${endKey})`);
});

// Check for transaction matching in first period
console.log('\n=== TRANSACTION MATCHING ===');
const firstPeriod = periods[0];
const periodStartKey = firstPeriod.start.getFullYear() * 10000 + (firstPeriod.start.getMonth() + 1) * 100 + firstPeriod.start.getDate();
const periodEndKey = firstPeriod.end.getFullYear() * 10000 + (firstPeriod.end.getMonth() + 1) * 100 + firstPeriod.end.getDate();

console.log(`Period 0: keys ${periodStartKey} - ${periodEndKey}`);

transactionOccurrences.forEach((txn, i) => {
  const match = txn.dateKey >= periodStartKey && txn.dateKey <= periodEndKey;
  console.log(`  TXN[${i}] dateKey=${txn.dateKey}: ${match ? 'MATCHES' : 'NO MATCH'}`);
});

// Run the actual projection engine
console.log('\n=== RUNNING PROJECTION ENGINE ===');
const projections = await projectionEngine.generateProjectionsForScenario(
  scenario,
  { periodicity: 'monthly' },
  lookupData
);

console.log('Projections count:', projections.length);
console.log('Last projection balance:', projections[projections.length - 1]?.balance);
console.log('First 3 projections:');
projections.slice(0, 3).forEach((p, i) => {
  console.log(`  [${i}] ${p.date}: balance=${p.balance}, income=${p.income}, expenses=${p.expenses}`);
});
