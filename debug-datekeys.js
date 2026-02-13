import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load modules as ES modules
const fs = await import('fs');
const parseDateOnly_fn = (dateStr) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date;
};

const expectedOutputsPath = './QC/expected-outputs.json';
const expectedOutputsData = JSON.parse(fs.readFileSync(expectedOutputsPath, 'utf8'));

const testCase = expectedOutputsData.functionTests.recurrenceDates[0];
console.log('Test Case:', testCase.description);

const startDate = testCase.projectionStart;
const endDate = testCase.projectionEnd;

const parsedStartDate = parseDateOnly_fn(startDate);
const parsedEndDate = parseDateOnly_fn(endDate);

console.log('\nParsed dates:');
console.log('Start:', parsedStartDate.toISOString());
console.log('End:', parsedEndDate.toISOString());

// Check period boundaries 
// Period 1: 2026-02-01 to 2026-02-28
const period1Start = parseDateOnly_fn('2026-02-01');
const period1End = parseDateOnly_fn('2026-03-01');
console.log('\nPeriod 1 (February):');
console.log('Start:', period1Start.toISOString());
console.log('End:', period1End.toISOString());

// Recurrence date: 2026-02-15
const recurrenceDate = parseDateOnly_fn('2026-02-15');
console.log('\nRecurrence date:', recurrenceDate.toISOString());

// Calculate dateKeys
const txnDateKey = recurrenceDate.getFullYear() * 10000 + (recurrenceDate.getMonth() + 1) * 100 + recurrenceDate.getDate();
const periodStartKey = period1Start.getFullYear() * 10000 + (period1Start.getMonth() + 1) * 100 + period1Start.getDate();
const periodEndKey = period1End.getFullYear() * 10000 + (period1End.getMonth() + 1) * 100 + period1End.getDate();

console.log('\nDateKeys:');
console.log('Transaction dateKey:', txnDateKey);
console.log('Period start dateKey:', periodStartKey);
console.log('Period end dateKey:', periodEndKey);
console.log('Txn in period?:', txnDateKey >= periodStartKey && txnDateKey <= periodEndKey);

// Let me also check what the period end key should be
const feb28 = parseDateOnly_fn('2026-02-28');
const feb28Key = feb28.getFullYear() * 10000 + (feb28.getMonth() + 1) * 100 + feb28.getDate();
const mar1 = parseDateOnly_fn('2026-03-01');
const mar1Key = mar1.getFullYear() * 10000 + (mar1.getMonth() + 1) * 100 + mar1.getDate();

console.log('\nAlternate calculation:');
console.log('2026-02-28 dateKey:', feb28Key);
console.log('2026-03-01 dateKey:', mar1Key);
console.log('Is txn in Feb 28-Mar1 period?:', txnDateKey >= feb28Key && txnDateKey <= mar1Key);
