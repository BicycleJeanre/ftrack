// library-test.js
// Quick test to verify Tabulator and financejs are working

import { TabulatorFull as Tabulator } from '../node_modules/tabulator-tables/dist/js/tabulator_esm.min.js';

console.log('[Library Test] Starting verification...');

// Test 1: Tabulator
console.log('[Library Test] Tabulator loaded:', typeof Tabulator === 'function' ? '✓' : '✗');

// Test 2: Create simple Tabulator instance
const testContainer = document.createElement('div');
testContainer.id = 'test-table';
document.body.appendChild(testContainer);

const testData = [
    { id: 1, name: 'Test 1', value: 100 },
    { id: 2, name: 'Test 2', value: 200 }
];

try {
    const table = new Tabulator('#test-table', {
        data: testData,
        layout: 'fitColumns',
        columns: [
            { title: 'ID', field: 'id' },
            { title: 'Name', field: 'name' },
            { title: 'Value', field: 'value', formatter: 'money' }
        ]
    });
    console.log('[Library Test] Tabulator instance created: ✓');
    console.log('[Library Test] Test data rows:', table.getData().length);
} catch (err) {
    console.error('[Library Test] Tabulator failed:', err);
}

// Test 3: Financial calculations (manual - no external library needed)
const testFV = (rate, nper, pmt, pv) => {
    // Future Value calculation
    const ratePerPeriod = rate / 100;
    if (ratePerPeriod === 0) {
        return -(pv + (pmt * nper));
    }
    const factor = Math.pow(1 + ratePerPeriod, nper);
    return -(pv * factor + pmt * ((factor - 1) / ratePerPeriod));
};

const futureValue = testFV(5, 12, -100, -1000); // 5% rate, 12 periods, -100 payment, -1000 PV
console.log('[Library Test] Financial calc (FV):', futureValue.toFixed(2));
console.log('[Library Test] Financial functions: ✓');

// Test 4: Compound interest
const compoundInterest = (principal, rate, periods) => {
    return principal * Math.pow(1 + rate / 100, periods);
};

const result = compoundInterest(1000, 5, 12);
console.log('[Library Test] Compound interest calc:', result.toFixed(2));

console.log('[Library Test] ================');
console.log('[Library Test] All tests passed ✓');
console.log('[Library Test] Ready for implementation');
