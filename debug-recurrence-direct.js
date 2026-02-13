import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load modules as ES modules
const calculationEngine = await import('./js/domain/calculations/calculation-engine.js');
const dateUtils = await import('./js/shared/date-utils.js');
const transactionExpander = await import('./js/domain/calculations/transaction-expander.js');

// Load expected outputs and helpers
const fs = await import('fs');
const expectedOutputsPath = './QC/expected-outputs.json';
const expectedOutputsData = JSON.parse(fs.readFileSync(expectedOutputsPath, 'utf8'));

const testCase = expectedOutputsData.functionTests.recurrenceDates[0];
console.log('Test Case from expected-outputs.json:');
console.log(JSON.stringify(testCase, null, 2));

const startDate = testCase.projectionStart;
const endDate = testCase.projectionEnd;
const recurrence = testCase.recurrence;

console.log('\nRecurrence object:');
console.log(JSON.stringify(recurrence, null, 2));

// Test generateRecurrenceDates directly (this is what the test does)
const generatedDates = calculationEngine.generateRecurrenceDates(
  recurrence,
  dateUtils.parseDateOnly(startDate),
  dateUtils.parseDateOnly(endDate)
);

console.log('\nGenerated recurrence dates:', generatedDates);
console.log('Generated dates count:', generatedDates.length);
console.log('Expected count:', testCase.expectedCount);
console.log('Match:', generatedDates.length === testCase.expectedCount);
