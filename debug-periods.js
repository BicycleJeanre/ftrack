import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load modules
const dateUtils = await import('./js/shared/date-utils.js');

// Load helpers and expected outputs
const fs = await import('fs');
const expectedOutputsPath = './QC/expected-outputs.json';
const expectedOutputsData = JSON.parse(fs.readFileSync(expectedOutputsPath, 'utf8'));

const testCase = expectedOutputsData.functionTests.recurrenceDates[0];
const startDate = testCase.projectionStart;
const endDate = testCase.projectionEnd;

const parsedStartDate = dateUtils.parseDateOnly(startDate);
const parsedEndDate = dateUtils.parseDateOnly(endDate);

console.log('Start date:', parsedStartDate);
console.log('End date:', parsedEndDate);

// Generate periods (copied from projection engine)
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
console.log('\nGenerated periods:');
periods.forEach((p, i) => {
  const startKey = p.start.getFullYear() * 10000 + (p.start.getMonth() + 1) * 100 + p.start.getDate();
  const endKey = p.end.getFullYear() * 10000 + (p.end.getMonth() + 1) * 100 + p.end.getDate();
  console.log(`Period ${i}: ${dateUtils.formatDateOnly(p.start)} to ${dateUtils.formatDateOnly(p.end)} (keys: ${startKey} - ${endKey})`);
});

// Check if 2026-02-15 falls within first period
const recurrenceDate = dateUtils.parseDateOnly('2026-02-15');
const txnDateKey = recurrenceDate.getFullYear() * 10000 + (recurrenceDate.getMonth() + 1) * 100 + recurrenceDate.getDate();
const firstPeriod = periods[0];
const firstPeriodStartKey = firstPeriod.start.getFullYear() * 10000 + (firstPeriod.start.getMonth() + 1) * 100 + firstPeriod.start.getDate();
const firstPeriodEndKey = firstPeriod.end.getFullYear() * 10000 + (firstPeriod.end.getMonth() + 1) * 100 + firstPeriod.end.getDate();

console.log('\nRecurrence date: 2026-02-15 (key: ' + txnDateKey + ')');
console.log('First period keys: ' + firstPeriodStartKey + ' - ' + firstPeriodEndKey);
console.log('In period?:', txnDateKey >= firstPeriodStartKey && txnDateKey <= firstPeriodEndKey);
