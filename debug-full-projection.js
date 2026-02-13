import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load modules as ES modules
const projectionEngine = await import('./js/domain/calculations/projection-engine.js');
const dateUtils = await import('./js/shared/date-utils.js');

// Load helpers and expected outputs
const fs = await import('fs');
const expectedOutputsPath = './QC/expected-outputs.json';
const expectedOutputsData = JSON.parse(fs.readFileSync(expectedOutputsPath, 'utf8'));

// Parse up the test helpers via dynamic import
const helpers = await import('./QC/tests/helpers.js');
const { buildScenario, getLookupData } = helpers;
const lookupData = getLookupData();

// Use first test case
const testCase = expectedOutputsData.functionTests.recurrenceDates[0];
console.log('Test Case:', testCase.description);

const startDate = testCase.projectionStart;
const endDate = testCase.projectionEnd;
const recurrence = testCase.recurrence;

console.log('Recurrence:', JSON.stringify(recurrence));

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

console.log('Scenario transaction recurrence:', JSON.stringify(scenario.transactions[0].recurrence));

const projections = await projectionEngine.generateProjectionsForScenario(
  scenario,
  { periodicity: 'monthly' },
  lookupData
);

console.log('\nProjections generated:', projections.length);
console.log('Last projection balance:', projections[projections.length - 1]?.balance);
console.log('Expected balance:', testCase.expectedCount * 100);
console.log('Match:', projections[projections.length - 1]?.balance === testCase.expectedCount * 100);
