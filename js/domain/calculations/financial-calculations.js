/**
 * financial-calculations.js
 * Core financial calculations - single source of truth
 * Web-only implementation using standard math (no external dependencies)
 */

import { parseDateOnly } from '../../shared/date-utils.js';

/**
 * Calculate Future Value (FV)
 * @param {number} rate - Interest rate per period (as percentage, e.g., 5 for 5%)
 * @param {number} nper - Number of periods
 * @param {number} pmt - Payment per period (negative for outflow)
 * @param {number} pv - Present value (negative for outflow)
 * @returns {number} - Future value
 */
export function calculateFutureValue(rate, nper, pmt, pv) {
    // FV = PV * (1 + r)^n + PMT * [((1 + r)^n - 1) / r]
    const r = rate / 100;
    if (r === 0) return -(pv + pmt * nper);
    const factor = Math.pow(1 + r, nper);
    return -(pv * factor + pmt * ((factor - 1) / r));
}

/**
 * Calculate Present Value (PV)
 * @param {number} rate - Interest rate per period (as percentage)
 * @param {number} nper - Number of periods
 * @param {number} pmt - Payment per period
 * @param {number} fv - Future value
 * @returns {number} - Present value
 */
export function calculatePresentValue(rate, nper, pmt, fv = 0) {
    const r = rate / 100;
    if (r === 0) return -(fv + pmt * nper);
    const factor = Math.pow(1 + r, nper);
    return -(fv / factor + pmt * ((factor - 1) / r) / factor);
}

/**
 * Calculate compound interest
 * @param {number} principal - Initial amount
 * @param {number} rate - Annual interest rate (as percentage)
 * @param {number} periods - Number of compounding periods (Years)
 * @param {number} frequency - Compounding frequency per year (default: 1)
 * @returns {number} - Final amount after compound interest
 */
export function calculateCompoundInterest(principal, rate, periods, frequency = 1) {
    // A = P(1 + r/n)^(nt)
    return principal * Math.pow(1 + rate / (100 * frequency), periods * frequency);
}

/**
 * Calculate effective annual rate from nominal rate
 * @param {number} nominalRate - Nominal annual rate (as percentage)
 * @param {number} frequency - Compounding frequency per year
 * @returns {number} - Effective annual rate (as percentage)
 */
export function calculateEffectiveRate(nominalRate, frequency) {
    const ratePerPeriod = (nominalRate / 100) / frequency;
    return (Math.pow(1 + ratePerPeriod, frequency) - 1) * 100;
}

/**
 * Calculate payment amount for a loan
 * @param {number} rate - Interest rate per period (as percentage)
 * @param {number} nper - Number of periods
 * @param {number} pv - Present value (loan amount, negative)
 * @param {number} fv - Future value (default: 0)
 * @returns {number} - Payment amount per period
 */
export function calculatePayment(rate, nper, pv, fv = 0) {
    // PMT = [r*PV*(1+r)^n - r*FV] / [(1+r)^n - 1]
    const r = rate / 100;
    if (r === 0) return -(pv + fv) / nper;
    const factor = Math.pow(1 + r, nper);
    return (r * pv * factor - r * fv) / (factor - 1);
}

/**
 * Calculate number of periods between two dates
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string} frequency - Period frequency ('Monthly', 'Quarterly', 'Yearly')
 * @returns {number} - Number of periods
 */
export function calculatePeriods(startDate, endDate, frequency) {
    const start = typeof startDate === 'string' ? parseDateOnly(startDate) : new Date(startDate);
    const end = typeof endDate === 'string' ? parseDateOnly(endDate) : new Date(endDate);
    
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    
    switch (frequency) {
        case 'Monthly':
            return months;
        case 'Quarterly':
            return Math.floor(months / 3);
        case 'Yearly':
            return Math.floor(months / 12);
        case 'Weekly':
            const days = (end - start) / (1000 * 60 * 60 * 24);
            return Math.floor(days / 7);
        default:
            return months;
    }
}

/**
 * Calculate periodic change (interest/growth) for a given amount
 * This is the WORKING implementation from calculation-utils.js
 * 
 * @param {number} principal - Starting amount
 * @param {Object} periodicChange - Periodic change configuration
 * @param {number} periods - Number of periods to calculate (in years)
 * @returns {number} - Final amount after periodic change
 */
export function calculatePeriodicChange(principal, periodicChange, periods) {
  if (!periodicChange || periodicChange.value === null || periodicChange.value === undefined || periodicChange.value === 0) {
    return principal;
  }
  
  // Extract IDs from periodicChange - handle both numeric IDs and expanded objects
  const changeModeId = typeof periodicChange.changeMode === 'object' ? periodicChange.changeMode.id : periodicChange.changeMode;
  const changeTypeId = typeof periodicChange.changeType === 'object' ? periodicChange.changeType.id : (periodicChange.changeType || 1);
  const ratePeriodId = typeof periodicChange.ratePeriod === 'object' ? periodicChange.ratePeriod.id : (periodicChange.ratePeriod || 1);
  
  // Extract custom compounding settings for custom change type
  const compoundingFrequency = typeof periodicChange.customCompounding?.frequency === 'object' 
    ? periodicChange.customCompounding.frequency.id 
    : (periodicChange.customCompounding?.frequency || 1);
  
  const value = periodicChange.value;
  
  // Change mode ID 2 = Fixed Amount
  if (changeModeId === 2) {
    const periodId = typeof periodicChange.period === 'object' ? periodicChange.period.id : (periodicChange.period || 3);
    
    // Calculate number of periods based on period type ID
    let numPeriods;
    switch (periodId) {
      case 1: // Daily
        numPeriods = periods * 365;
        break;
      case 2: // Weekly
        numPeriods = periods * 52;
        break;
      case 3: // Monthly
        numPeriods = periods * 12;
        break;
      case 4: // Quarterly
        numPeriods = periods * 4;
        break;
      case 5: // Yearly
        numPeriods = periods;
        break;
      default:
        numPeriods = periods * 12; // Default to monthly
    }
    
    // Fixed amount: FV = PV + (amount × number of periods)
    return principal + (value * numPeriods);
  }
  
  // Default to change mode ID 1 = Percentage Rate
  const rate = value / 100; // Convert percentage to decimal
  
  switch (changeTypeId) {
    case 1: // Nominal Annual (No Compounding)
      // Simple interest: FV = PV * (1 + r * t)
      return principal * (1 + rate * periods);
      
    case 2: // Nominal Annual, Compounded Monthly
      // FV = PV * (1 + r/12)^(12*t)
      return principal * Math.pow(1 + rate / 12, 12 * periods);
      
    case 3: // Nominal Annual, Compounded Daily
      // FV = PV * (1 + r/365)^(365*t)
      return principal * Math.pow(1 + rate / 365, 365 * periods);
      
    case 4: // Nominal Annual, Compounded Quarterly
      // FV = PV * (1 + r/4)^(4*t)
      return principal * Math.pow(1 + rate / 4, 4 * periods);
      
    case 5: // Nominal Annual, Compounded Annually
      // FV = PV * (1 + r)^t
      return principal * Math.pow(1 + rate, periods);
      
    case 6: // Nominal Annual, Continuous Compounding
      // FV = PV * e^(r*t)
      return principal * Math.exp(rate * periods);
      
    case 7: // Custom
      // Custom: convert rate based on rate period ID, compound at custom frequency
      // Rate period IDs: 1=Annual, 2=Monthly, 3=Quarterly, 4=Daily
      let annualRate;
      switch (ratePeriodId) {
        case 1: // Annual
          annualRate = rate;
          break;
        case 2: // Monthly: multiply by 12 to convert to annual
          annualRate = rate * 12;
          break;
        case 3: // Quarterly: multiply by 4 to convert to annual
          annualRate = rate * 4;
          break;
        case 4: // Daily: multiply by 365 to convert to annual
          annualRate = rate * 365;
          break;
        default:
          annualRate = rate;
      }
      
      // Convert compounding frequency ID to count per year
      let compoundingPerYear;
      switch (compoundingFrequency) {
        case 1: // Daily
          compoundingPerYear = 365;
          break;
        case 2: // Weekly
          compoundingPerYear = 52;
          break;
        case 3: // Monthly
          compoundingPerYear = 12;
          break;
        case 4: // Quarterly
          compoundingPerYear = 4;
          break;
        case 5: // Yearly
          compoundingPerYear = 1;
          break;
        default:
          compoundingPerYear = 1;
      }
      
      // FV = PV * (1 + r / n)^(n*t), where n = compounding frequency per year
      return principal * Math.pow(1 + annualRate / compoundingPerYear, compoundingPerYear * periods);
      
    default:
      return principal;
  }
}

// Backward compatibility alias for legacy code/tests
export { calculatePeriodicChange as applyPeriodicChange };
