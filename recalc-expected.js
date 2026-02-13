// Generate correct expected values for all applyPeriodicChange test cases
const fs = require('fs');

// Load the current expected outputs
const expectedOutputs = JSON.parse(fs.readFileSync('/Users/Jay/GIT-Repos-Personal/ftrack/QC/expected-outputs.json', 'utf8'));

// Recalculate all applyPeriodicChange test cases
function recalculateExpectedValues() {
  const testCases = expectedOutputs.functionTests.applyPeriodicChangeAccounts;
  
  console.log('Recalculating expected values for applyPeriodicChangeAccounts:\n');
  
  testCases.forEach((tc, index) => {
    const principal = tc.principal;
    const rate = tc.periodicChange.value / 100; // Convert to decimal
    const periods = tc.periods;
    const changeTypeId = tc.periodicChange.changeType;
    
    let calculated;
    let formula = '';
    
    switch(changeTypeId) {
      case 1: // Nominal Annual (No Compounding) - simple interest
        calculated = principal * (1 + rate * periods);
        formula = `PV * (1 + r*t) = ${principal} * (1 + ${rate}*${periods})`;
        break;
        
      case 2: // Nominal Annual, Compounded Monthly
        calculated = principal * Math.pow(1 + rate/12, 12*periods);
        formula = `PV * (1 + r/12)^(12*t) = ${principal} * (1 + ${(rate/12).toFixed(6)})^${12*periods}`;
        break;
        
      case 3: // Nominal Annual, Compounded Daily
        calculated = principal * Math.pow(1 + rate/365, 365*periods);
        formula = `PV * (1 + r/365)^(365*t) = ${principal} * (1 + ${(rate/365).toFixed(6)})^${365*periods}`;
        break;
        
      case 4: // Nominal Annual, Compounded Quarterly
        calculated = principal * Math.pow(1 + rate/4, 4*periods);
        formula = `PV * (1 + r/4)^(4*t) = ${principal} * (1 + ${(rate/4).toFixed(6)})^${4*periods}`;
        break;
        
      case 5: // Nominal Annual, Compounded Annually
        calculated = principal * Math.pow(1 + rate, periods);
        formula = `PV * (1 + r)^t = ${principal} * (1 + ${rate})^${periods}`;
        break;
        
      case 6: // Nominal Annual, Continuous Compounding
        calculated = principal * Math.exp(rate * periods);
        formula = `PV * e^(r*t) = ${principal} * e^(${rate}*${periods})`;
        break;
        
      case 7: // Custom compounding
        const customComp = tc.periodicChange.customCompounding;
        const ratePeriodId = 1; // Assume Annual
        const compoundingFrequency = customComp.frequency;
        
        let annualRate = rate; // For annual rate period
        let compoundingPerYear;
        
        switch(compoundingFrequency) {
          case 1: compoundingPerYear = 365; break; // Daily
          case 2: compoundingPerYear = 52; break;  // Weekly
          case 3: compoundingPerYear = 12; break;  // Monthly
          case 4: compoundingPerYear = 4; break;   // Quarterly
          case 5: compoundingPerYear = 1; break;   // Yearly
          default: compoundingPerYear = 1;
        }
        
        calculated = principal * Math.pow(1 + annualRate / compoundingPerYear, compoundingPerYear * periods);
        formula = `PV * (1 + r/n)^(n*t), n=${compoundingPerYear}`;
        break;
        
      default:
        calculated = principal;
    }
    
    const oldValue = tc.expected;
    const newValue = Math.round(calculated * 100) / 100; // Round to cents
    const changed = Math.abs(oldValue - newValue) > 0.01;
    
    if (changed) {
      console.log(`[${index}] ${tc.description}`);
      console.log(`    Old: ${oldValue}, New: ${newValue.toFixed(2)}`);
      console.log(`    Formula: ${formula}\n`);
    }
  });
}

recalculateExpectedValues();
