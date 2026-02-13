import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load modules
const calculationEngine = await import('./js/domain/calculations/calculation-engine.js');
const dateUtils = await import('./js/shared/date-utils.js');
const transactionExpander = await import('./js/domain/calculations/transaction-expander.js');

// Load expected outputs
const fs = await import('fs');
const exp = JSON.parse(fs.readFileSync('./QC/expected-outputs.json', 'utf8'));
const testCase = exp.functionTests.recurrenceDates[0];

const scenario = {
  id: 999,
  startDate: testCase.projectionStart,
  endDate: testCase.projectionEnd,
  accounts: [{ id: 1, name: 'A1' }],
  transactions: [{
    id: 1,
    primaryAccountId: 1,
    secondaryAccountId: 1,
    transactionTypeId: 1,
    amount: 100,
    effectiveDate: testCase.projectionStart,
    description: 'test',
    recurrence: testCase.recurrence,
    periodicChange: null,
    status: { name: 'planned', actualAmount: null, actualDate: null },
    tags: []
  }]
};

const startDate = dateUtils.parseDateOnly(scenario.startDate);
const endDate = dateUtils.parseDateOnly(scenario.endDate);

const expanded = transactionExpander.expandTransactions(scenario.transactions, startDate, endDate, scenario.accounts);

console.log('Expanded transactions count:', expanded.length);

// Calculate dateKey for the expanded transaction
if (expanded.length > 0) {
  const txn = expanded[0];
  const occDate = txn._occurrenceDate || dateUtils.parseDateOnly(txn.effectiveDate);
  const dateKey = occDate.getFullYear() * 10000 + (occDate.getMonth() + 1) * 100 + occDate.getDate();
  console.log('First expanded transaction:');
  console.log('  _occurrenceDate:', occDate.toISOString());
  console.log('  dateKey:', dateKey);
  console.log('  primaryAccountId:', txn.primaryAccountId);
  console.log('  transactionTypeId:', txn.transactionTypeId);
  console.log('  amount:', txn.amount);
}

// Now manually check what should happen
// The test uses buildScenario which should pass through the recurrence as-is
// But let me check what buildScenario actually creates:
const helpers = await import('./QC/tests/helpers.js');
const { buildScenario } = helpers;

const scenario2 = buildScenario({
  startDate: testCase.projectionStart,
  endDate: testCase.projectionEnd,
  projectionPeriodName: 'Month',
  accounts: [
    {
      id: 1,
      name: 'A1',
      type: 1,
      currency: 1,
      startingBalance: 0,
      openDate: testCase.projectionStart,
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
      effectiveDate: testCase.projectionStart,
      description: 'QC recurrence integration',
      recurrence: testCase.recurrence,
      periodicChange: null,
      status: { name: 'planned', actualAmount: null, actualDate: null },
      tags: []
    }
  ]
});

console.log('\nbuildScenario transaction recurrence:');
console.log(JSON.stringify(scenario2.transactions[0].recurrence, null, 2));

// Expand with the buildScenario scenario
const expanded2 = transactionExpander.expandTransactions(scenario2.transactions, startDate, endDate, scenario2.accounts);
console.log('\nExpanded transactions from buildScenario:', expanded2.length);
if (expanded2.length > 0) {
  const txn = expanded2[0];
  const occDate = txn._occurrenceDate || dateUtils.parseDateOnly(txn.effectiveDate);
  const dateKey = occDate.getFullYear() * 10000 + (occDate.getMonth() + 1) * 100 + occDate.getDate();
  console.log('dateKey:', dateKey);
}
