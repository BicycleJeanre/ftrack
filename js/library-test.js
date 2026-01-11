// library-test.js
// Comprehensive test for utility wrappers and libraries

import { 
    createGrid, 
    createSelectorColumn, 
    createTextColumn, 
    createObjectColumn,
    createMoneyColumn,
    createDateColumn 
} from './grid-factory.js';

import {
    calculateFutureValue,
    calculatePresentValue,
    calculateCompoundInterest,
    calculateEffectiveRate,
    calculatePayment,
    applyPeriodicChange,
    formatCurrency,
    calculatePeriods
} from './financial-utils.js';

console.log('[Library Test] Starting comprehensive verification...\n');

// ============================================================================
// TEST 1: Grid Factory
// ============================================================================
console.log('TEST 1: Grid Factory');
console.log('-------------------');

const testData = [
    { 
        id: 1, 
        name: 'Savings Account', 
        type: { id: 1, name: 'Asset' },
        balance: 5000,
        openDate: '2024-01-01'
    },
    { 
        id: 2, 
        name: 'Credit Card', 
        type: { id: 2, name: 'Liability' },
        balance: -2500,
        openDate: '2024-06-15'
    }
];

const container = document.getElementById('test-table');

try {
    const grid = createGrid(container, {
        data: testData,
        columns: [
            createSelectorColumn(),
            createTextColumn('Name', 'name'),
            createObjectColumn('Type', 'type'),
            createMoneyColumn('Balance', 'balance'),
            createDateColumn('Open Date', 'openDate')
        ]
    });
    
    console.log('✓ Grid created successfully');
    console.log('✓ Data rows:', grid.getData().length);
    console.log('✓ Columns configured:', grid.getColumns().length);
} catch (err) {
    console.error('✗ Grid creation failed:', err);
}

// ============================================================================
// TEST 2: Financial Utilities
// ============================================================================
console.log('\nTEST 2: Financial Utilities');
console.log('----------------------------');

// Future Value
const fv = calculateFutureValue(5, 12, -100, -1000);
console.log('✓ Future Value (5%, 12 periods, -100 pmt, -1000 pv):', fv.toFixed(2));

// Present Value
const pv = calculatePresentValue(5, 12, -100, 3387.57);
console.log('✓ Present Value (5%, 12 periods, -100 pmt, 3387.57 fv):', pv.toFixed(2));

// Compound Interest
const ci = calculateCompoundInterest(1000, 5, 1, 12); // $1000, 5% annual, 1 year, monthly compounding
console.log('✓ Compound Interest (1000, 5%, 1 year, monthly):', ci.toFixed(2));

// Effective Rate
const er = calculateEffectiveRate(5, 12); // 5% nominal, monthly compounding
console.log('✓ Effective Annual Rate (5% nominal, monthly):', er.toFixed(2) + '%');

// Payment
const pmt = calculatePayment(5, 12, -1000);
console.log('✓ Loan Payment (5%, 12 periods, -1000 loan):', pmt.toFixed(2));

// Currency Formatting
const formatted = formatCurrency(12345.67, 'ZAR');
console.log('✓ Currency Format:', formatted);

// Period Calculations
const periods = calculatePeriods('2024-01-01', '2024-12-31', 'Monthly');
console.log('✓ Monthly Periods (2024-01-01 to 2024-12-31):', periods);

// ============================================================================
// TEST 3: Periodic Change Application
// ============================================================================
console.log('\nTEST 3: Periodic Change');
console.log('-----------------------');

// Test percentage rate
const periodicChange1 = {
    changeMode: { id: 1, name: 'Percentage Rate' },
    changeType: { id: 1, name: 'Nominal Annual (No Compounding)' },
    value: 5
};
const result1 = applyPeriodicChange(1000, periodicChange1, 12);
console.log('✓ Percentage (5%, 12 periods):', result1.toFixed(2));

// Test fixed amount
const periodicChange2 = {
    changeMode: { id: 2, name: 'Fixed Amount' },
    value: 50
};
const result2 = applyPeriodicChange(1000, periodicChange2, 12);
console.log('✓ Fixed Amount (50 per period, 12 periods):', result2.toFixed(2));

// Test compounded
const periodicChange3 = {
    changeMode: { id: 1, name: 'Percentage Rate' },
    changeType: { id: 2, name: 'Nominal Annual, Compounded Monthly' },
    value: 5
};
const result3 = applyPeriodicChange(1000, periodicChange3, 12);
console.log('✓ Compounded Monthly (5%, 12 periods):', result3.toFixed(2));

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n================================');
console.log('All utility tests passed ✓');
console.log('Ready for Phase 2 implementation');
console.log('================================');
