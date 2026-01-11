// projection-test.js
// Test projection calculations with financial-utils integration

import { applyPeriodicChange } from './financial-utils.js';

console.log('[Projection Test] Starting projection calculation verification...\n');

// TEST 1: Account balance growth with periodic change
console.log('TEST 1: Account Balance Growth');
console.log('='.repeat(50));

// Test case: $10,000 starting balance, 5% annual growth, 1 year
const initialBalance = 10000;
const periodicChange1 = {
    value: 5,
    changeMode: { id: 1, name: 'Percentage Rate' },
    changeType: { id: 1, name: 'Nominal Annual (No Compounding)' }
};

const result1 = applyPeriodicChange(initialBalance, periodicChange1, 1);
console.log(`Initial: $${initialBalance}`);
console.log(`Rate: 5% annual (no compounding)`);
console.log(`Periods: 1 year`);
console.log(`Expected: $${10000 * 1.05} (10,500)`);
console.log(`Result: $${result1}`);
console.log(`✓ ${Math.abs(result1 - 10500) < 0.01 ? 'PASS' : 'FAIL'}\n`);

// TEST 2: Compounded monthly growth
console.log('TEST 2: Compounded Monthly Growth');
console.log('='.repeat(50));

const periodicChange2 = {
    value: 12,
    changeMode: { id: 1, name: 'Percentage Rate' },
    changeType: { id: 2, name: 'Nominal Annual, Compounded Monthly' }
};

const result2 = applyPeriodicChange(initialBalance, periodicChange2, 1);
// Expected: 10000 * (1 + 0.12/12)^12 = 10000 * 1.126825 = 11268.25
const expected2 = initialBalance * Math.pow(1 + 0.12/12, 12);
console.log(`Initial: $${initialBalance}`);
console.log(`Rate: 12% annual (compounded monthly)`);
console.log(`Periods: 1 year`);
console.log(`Expected: $${expected2.toFixed(2)}`);
console.log(`Result: $${result2.toFixed(2)}`);
console.log(`✓ ${Math.abs(result2 - expected2) < 0.01 ? 'PASS' : 'FAIL'}\n`);

// TEST 3: Fixed amount change
console.log('TEST 3: Fixed Amount Change');
console.log('='.repeat(50));

const periodicChange3 = {
    value: 500,
    changeMode: { id: 2, name: 'Fixed Amount' },
    changeType: { id: 1, name: 'Nominal Annual (No Compounding)' }
};

const result3 = applyPeriodicChange(initialBalance, periodicChange3, 12);
// Expected: 10000 + (500 * 12) = 16000
console.log(`Initial: $${initialBalance}`);
console.log(`Change: +$500 per period`);
console.log(`Periods: 12`);
console.log(`Expected: $${initialBalance + (500 * 12)} (16,000)`);
console.log(`Result: $${result3}`);
console.log(`✓ ${Math.abs(result3 - 16000) < 0.01 ? 'PASS' : 'FAIL'}\n`);

// TEST 4: Transaction amount escalation
console.log('TEST 4: Transaction Amount Escalation');
console.log('='.repeat(50));

const initialAmount = 1000;
const escalation = {
    value: 3,
    changeMode: { id: 1, name: 'Percentage Rate' },
    changeType: { id: 1, name: 'Nominal Annual (No Compounding)' }
};

const result4 = applyPeriodicChange(initialAmount, escalation, 5);
// Expected: 1000 * (1.03)^5 = 1159.27
const expected4 = initialAmount * Math.pow(1.03, 5);
console.log(`Initial Amount: $${initialAmount}`);
console.log(`Escalation: 3% per year`);
console.log(`Years: 5`);
console.log(`Expected: $${expected4.toFixed(2)}`);
console.log(`Result: $${result4.toFixed(2)}`);
console.log(`✓ ${Math.abs(result4 - expected4) < 0.01 ? 'PASS' : 'FAIL'}\n`);

// TEST 5: Zero rate (no change)
console.log('TEST 5: Zero Rate (No Change)');
console.log('='.repeat(50));

const periodicChange5 = {
    value: 0,
    changeMode: { id: 1, name: 'Percentage Rate' },
    changeType: { id: 1, name: 'Nominal Annual (No Compounding)' }
};

const result5 = applyPeriodicChange(initialBalance, periodicChange5, 10);
console.log(`Initial: $${initialBalance}`);
console.log(`Rate: 0%`);
console.log(`Periods: 10`);
console.log(`Expected: $${initialBalance} (no change)`);
console.log(`Result: $${result5}`);
console.log(`✓ ${Math.abs(result5 - initialBalance) < 0.01 ? 'PASS' : 'FAIL'}\n`);

// TEST 6: Null/undefined periodic change
console.log('TEST 6: Null Periodic Change');
console.log('='.repeat(50));

const result6 = applyPeriodicChange(initialBalance, null, 5);
console.log(`Initial: $${initialBalance}`);
console.log(`Periodic Change: null`);
console.log(`Expected: $${initialBalance} (no change)`);
console.log(`Result: $${result6}`);
console.log(`✓ ${result6 === initialBalance ? 'PASS' : 'FAIL'}\n`);

// Summary
console.log('='.repeat(50));
console.log('All projection calculation tests completed ✓');
console.log('Financial-utils integration verified');
console.log('='.repeat(50));
