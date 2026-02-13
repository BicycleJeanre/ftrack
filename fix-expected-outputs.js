// Fix expected-outputs.json with correct calculated values
const fs = require('fs');

const expectedOutputs = JSON.parse(fs.readFileSync('/Users/Jay/GIT-Repos-Personal/ftrack/QC/expected-outputs.json', 'utf8'));

// Function to calculate correct periodic change
function calculatePeriodicChange(principal, periodicChange, periods) {
  if (!periodicChange || periodicChange.value === null || periodicChange.value === undefined || periodicChange.value === 0) {
    return principal;
  }
  
  const changeModeId = typeof periodicChange.changeMode === 'number'
    ? periodicChange.changeMode
    : periodicChange.changeMode?.id;
  
  const changeTypeId = typeof periodicChange.changeType === 'number'
    ? periodicChange.changeType
    : periodicChange.changeType?.id || 1;
  
  const ratePeriodId = typeof periodicChange.ratePeriod === 'number'
    ? periodicChange.ratePeriod
    : periodicChange.ratePeriod?.id || 1;
  
  const compoundingFrequency = periodicChange.customCompounding?.frequency || 1;
  const value = periodicChange.value;
  
  // Fixed Amount mode
  if (changeModeId === 2) {
    const periodId = typeof periodicChange.period === 'number'
      ? periodicChange.period
      : periodicChange.period?.id || 3;
    
    let numPeriods;
    switch (periodId) {
      case 1: numPeriods = periods * 365; break;
      case 2: numPeriods = periods * 52; break;
      case 3: numPeriods = periods * 12; break;
      case 4: numPeriods = periods * 4; break;
      case 5: numPeriods = periods; break;
      default: numPeriods = periods * 12;
    }
    
    return principal + (value * numPeriods);
  }
  
  // Percentage Rate mode
  const rate = value / 100;
  
  switch (changeTypeId) {
    case 1: // Nominal Annual (No Compounding)
      return principal * (1 + rate * periods);
      
    case 2: // Nominal Annual, Compounded Monthly
      return principal * Math.pow(1 + rate / 12, 12 * periods);
      
    case 3: // Nominal Annual, Compounded Daily
      return principal * Math.pow(1 + rate / 365, 365 * periods);
      
    case 4: // Nominal Annual, Compounded Quarterly
      return principal * Math.pow(1 + rate / 4, 4 * periods);
      
    case 5: // Nominal Annual, Compounded Annually
      return principal * Math.pow(1 + rate, periods);
      
    case 6: // Nominal Annual, Continuous Compounding
      return principal * Math.exp(rate * periods);
      
    case 7: // Custom compounding
      let annualRate;
      switch (ratePeriodId) {
        case 1: annualRate = rate; break; // Annual
        case 2: annualRate = rate * 12; break; // Monthly to annual
        case 3: annualRate = rate * 4; break; // Quarterly to annual
        case 4: annualRate = rate * 365; break; // Daily to annual
        default: annualRate = rate;
      }
      
      let compoundingPerYear;
      switch (compoundingFrequency) {
        case 1: compoundingPerYear = 365; break;
        case 2: compoundingPerYear = 52; break;
        case 3: compoundingPerYear = 12; break;
        case 4: compoundingPerYear = 4; break;
        case 5: compoundingPerYear = 1; break;
        default: compoundingPerYear = 1;
      }
      
      return principal * Math.pow(1 + annualRate / compoundingPerYear, compoundingPerYear * periods);
      
    default:
      return principal;
  }
}

// Fix applyPeriodicChangeAccounts
const accountTestCases = expectedOutputs.functionTests.applyPeriodicChangeAccounts;
let accountsChanged = 0;

accountTestCases.forEach((tc) => {
  const oldExpected = tc.expected;
  const calculated = calculatePeriodicChange(tc.principal, tc.periodicChange, tc.periods);
  tc.expected = Math.round(calculated * 100) / 100; // Round to cents
  
  if (Math.abs(oldExpected - tc.expected) > 0.01) {
    accountsChanged++;
  }
});

// Fix applyPeriodicChangeTransactions
const transactionTestCases = expectedOutputs.functionTests.applyPeriodicChangeTransactions;
let transactionsChanged = 0;

transactionTestCases.forEach((tc) => {
  const oldExpected = tc.expected;
  const calculated = calculatePeriodicChange(tc.principal, tc.periodicChange, tc.periods);
  tc.expected = Math.round(calculated * 100) / 100; // Round to cents
  
  if (Math.abs(oldExpected - tc.expected) > 0.01) {
    transactionsChanged++;
  }
});

// Write back the fixed data
fs.writeFileSync(
  '/Users/Jay/GIT-Repos-Personal/ftrack/QC/expected-outputs.json',
  JSON.stringify(expectedOutputs, null, 2)
);

console.log(`✓ Fixed ${accountsChanged} applyPeriodicChangeAccounts test cases`);
console.log(`✓ Fixed ${transactionsChanged} applyPeriodicChangeTransactions test cases`);
console.log(`✓ Total: ${accountsChanged + transactionsChanged} test cases corrected`);
