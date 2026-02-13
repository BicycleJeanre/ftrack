const testCases = [
  { desc: 'Nominal Annual (No Compounding)', type: 1, expected: 10600 },
  { desc: 'Compounded Monthly', type: 2, expected: 10050 },
  { desc: 'Compounded Quarterly', type: 4, expected: 10150 },
  { desc: 'Compounded Annually', type: 5, expected: 10600 }
];

const rate = 0.06;
const principal = 10000;
const periods = 1;

console.log('Checking if expected test values match mathematical formulas:\n');

testCases.forEach(tc => {
  let calculated;
  switch(tc.type) {
    case 1: // No Compounding
      calculated = principal * (1 + rate * periods);
      break;
    case 2: // Monthly
      calculated = principal * Math.pow(1 + rate/12, 12*periods);
      break;
    case 4: // Quarterly
      calculated = principal * Math.pow(1 + rate/4, 4*periods);
      break;
    case 5: // Annually
      calculated = principal * Math.pow(1 + rate, periods);
      break;
  }
  
  const match = Math.abs(calculated - tc.expected) < 0.01 ? '✓ CORRECT' : '✗ WRONG';
  console.log(`${match} ${tc.desc}:`);
  console.log(`     Expected: ${tc.expected}, Calculated: ${calculated.toFixed(2)}, Diff: ${Math.abs(calculated - tc.expected).toFixed(2)}\n`);
});
