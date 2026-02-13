import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load modules as ES modules
const transactionExpander = await import('./js/domain/calculations/transaction-expander.js');
const dateUtils = await import('./js/shared/date-utils.js');
const calculationEngine = await import('./js/domain/calculations/calculation-engine.js');

// Load helpers and expected outputs
const fs = await import('fs');
const expectedOutputsPath = './QC/expected-outputs.json';
const expectedOutputsData = JSON.parse(fs.readFileSync(expectedOutputsPath, 'utf8'));

// Parse up the test helpers via dynamic import
const helpers = await import('./QC/tests/helpers.js');
const { buildScenario } = helpers;

// Use first test case
const testCase = expectedOutputsData.functionTests.recurrenceDates[0];
console.log('Test Case:', testCase.description);

const startDate = testCase.projectionStart;
const endDate = testCase.projectionEnd;
const recurrence = testCase.recurrence;

// Create scenario with the correct data
const scenario = buildScenario({
  startDate,
  endDate,
  projectionPeriodName: 'Month',
  accounts: [
    {
      id: 1,
      name: 'A1',
      type: 1,  // Asset
      currency: 1,  // ZAR
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
      recurrence,
      periodicChange: null,
      status: { name: 'planned', actualAmount: null, actualDate: null },
      tags: []
    }
  ]
});

console.log('\nScenario transaction recurrence:', JSON.stringify(scenario.transactions[0].recurrence));

const parsedStartDate = dateUtils.parseDateOnly(startDate);
const parsedEndDate = dateUtils.parseDateOnly(endDate);

console.log('\nParsed start date:', parsedStartDate);
console.log('Parsed end date:', parsedEndDate);

// Test generateRecurrenceDates
const recurrenceDates = calculationEngine.generateRecurrenceDates(
  recurrence,
  parsedStartDate,
  parsedEndDate
);

console.log('\nRecurrence dates from calculator:', recurrenceDates);
console.log('Recurrence dates count:', recurrenceDates.length);

// Test transaction expander
const expandedTxns = transactionExpander.expandTransactions(
  scenario.transactions,
  parsedStartDate,
  parsedEndDate,
  scenario.accounts
);

console.log('\nExpanded transactions:', expandedTxns);
console.log('Expanded transactions count:', expandedTxns.length);

if (expandedTxns.length > 0) {
  console.log('\nFirst expanded transaction:');
  console.log(JSON.stringify(expandedTxns[0], null, 2));
}
