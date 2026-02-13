// financial-utils.js
// Utility wrapper for financial calculations
// Uses 'financejs' library for core math to ensure accuracy (Electron only)
// In web, uses fallback implementations

import { parseDateOnly } from './date-utils.js';
import { isElectronEnv } from './core/platform.js';

// Platform detection
const isElectron = isElectronEnv();

let Finance, finance;
if (isElectron) {
  Finance = window.require('financejs');
  finance = new Finance();
}

/**
 * Calculate Future Value (FV)
 * @param {number} rate - Interest rate per period (as percentage, e.g., 5 for 5%)
 * @param {number} nper - Number of periods
 * @param {number} pmt - Payment per period (negative for outflow)
 * @param {number} pv - Present value (negative for outflow)
 * @returns {number} - Future value
 */
export function calculateFutureValue(rate, nper, pmt, pv) {
    if (isElectron && finance) {
        // financejs usage: FV(rate, nper, pmt, pv, type)
        return finance.FV(rate, nper, pmt, pv, 0);
    }
    // Fallback: manual FV calculation
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
    if (isElectron && finance) {
        return finance.PV(rate, nper, pmt, fv, 0);
    }
    // Fallback: manual PV calculation
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
    // Compound interest is simply FV of a lump sum
    // Rate per period
    const ratePerPeriod = rate / frequency;
    // Total periods (e.g. 5 years * 12 months = 60)
    const totalPeriods = periods * frequency;
    
    if (isElectron && finance) {
        // finance.FV(rate, nper, pmt, pv)
        // Excel: FV(5%, 12, 0, -1000) = +1795.
        // We pass -principal to get positive result if principal was positive.
        return finance.FV(ratePerPeriod, totalPeriods, 0, -principal, 0);
    }
    // Fallback: A = P(1 + r/n)^(nt)
    return principal * Math.pow(1 + rate / (100 * frequency), periods * frequency);
}

/**
 * Calculate effective annual rate from nominal rate
 * @param {number} nominalRate - Nominal annual rate (as percentage)
 * @param {number} frequency - Compounding frequency per year
 * @returns {number} - Effective annual rate (as percentage)
 */
export function calculateEffectiveRate(nominalRate, frequency) {
    // FinanceJS does not have EFF, using manual formula
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
    if (isElectron && finance) {
        return finance.PMT(rate, nper, pv, fv, 0);
    }
    // Fallback: PMT = [r*PV*(1+r)^n - r*FV] / [(1+r)^n - 1]
    const r = rate / 100;
    if (r === 0) return -(pv + fv) / nper;
    const factor = Math.pow(1 + r, nper);
    return (r * pv * factor - r * fv) / (factor - 1);
}

/**
 * Apply periodic change to a value
 * @param {number} value - Initial value
 * @param {Object} periodicChange - Periodic change configuration
 * @param {number} periods - Number of periods to apply
 * @returns {number} - Value after periodic change
 */
/**
 * Apply periodic change to a value using ID-only references.
 * Change mode IDs: 1 = PercentageRate, 2 = FixedAmount
 * Change type IDs: 1=Nominal, 2=Monthly, 3=Daily, 4=Quarterly, 5=Annual, 6=Continuous, 7=Custom
 * Frequency IDs: 1=Daily, 2=Weekly, 3=Monthly, 4=Quarterly, 5=Yearly
 * @param {number} value - Initial value
 * @param {Object} periodicChange - Periodic change configuration (ID-based)
 * @param {number} periods - Number of periods to apply (in years)
 * @returns {number} - Value after periodic change
 */
export function applyPeriodicChange(value, periodicChange, periods) {
    if (!periodicChange || periodicChange.value === null || periodicChange.value === undefined || periodicChange.value === 0) {
        return value;
    }
    
    // Extract IDs from periodicChange
    const changeModeId = typeof periodicChange.changeMode === 'number'
        ? periodicChange.changeMode
        : periodicChange.changeMode?.id || 1; // Default to PercentageRate (ID 1)
    const changeValue = periodicChange.value;
    
    // Change mode ID 2 = Fixed Amount
    if (changeModeId === 2) {
        // Extract frequency ID (period of application)
        const frequencyId = typeof periodicChange.frequency === 'number'
            ? periodicChange.frequency
            : periodicChange.frequency?.id || 3; // Default to Monthly (ID 3)
        
        let periodsPerYear = 12; // Default
        switch (frequencyId) {
            case 1: // Daily
                periodsPerYear = 365;
                break;
            case 2: // Weekly
                periodsPerYear = 52;
                break;
            case 3: // Monthly
                periodsPerYear = 12;
                break;
            case 4: // Quarterly
                periodsPerYear = 4;
                break;
            case 5: // Yearly
                periodsPerYear = 1;
                break;
        }
        
        const totalApplications = periods * periodsPerYear;
        return value + (changeValue * totalApplications);
    } 
    
    // Default to change mode ID 1 = Percentage Rate
    const changeTypeId = typeof periodicChange.changeType === 'number'
        ? periodicChange.changeType
        : periodicChange.changeType?.id || 1; // Default to Nominal (ID 1)
    
    switch (changeTypeId) {
        case 1: // Nominal Annual (No Compounding)
            // Simple interest: FV = PV * (1 + r)^t
            if (isElectron && finance) {
                return finance.FV(changeValue, periods, 0, -value, 0);
            }
            // Fallback: V_final = V_initial * (1 + r)^n (in years, r is percent)
            return value * Math.pow(1 + changeValue / 100, periods);
            
        case 2: // Nominal Annual, Compounded Monthly
            // Frequency 12 per year: periods/12 with frequency 12 compounds annually for 12 months
            return calculateCompoundInterest(value, changeValue, periods / 12, 12);
            
        case 3: // Nominal Annual, Compounded Daily
            // Frequency 365 per year
            return calculateCompoundInterest(value, changeValue, periods / 365, 365);
            
        case 4: // Nominal Annual, Compounded Quarterly
            // Frequency 4 per year
            return calculateCompoundInterest(value, changeValue, periods / 4, 4);
            
        case 5: // Nominal Annual, Compounded Annually
            // Frequency 1 per year
            return calculateCompoundInterest(value, changeValue, periods, 1);
            
        case 6: // Nominal Annual, Continuous Compounding
            // e^(r*t)
            const rate = changeValue / 100;
            return value * Math.exp(rate * periods);
            
        case 7: // Custom
            // Extract custom compounding configuration - originallogic uses customCompounding.frequency directly
            const customFrequency = periodicChange.customCompounding?.frequency || 1;
            const customPeriodId = periodicChange.customCompounding?.period || 1; // Default to Annual
            
            // Convert periods (in years) to the specified period type
            let adjustedPeriods = periods;
            if (customPeriodId === 2) { // Monthly
                adjustedPeriods = periods * 12;
            } else if (customPeriodId === 3) { // Quarterly
                adjustedPeriods = periods * 4;
            } else if (customPeriodId === 4) { // Daily
                adjustedPeriods = periods * 365;
            }
            // customPeriodId === 1 (Annual) uses periods as-is
            
            return calculateCompoundInterest(value, changeValue, adjustedPeriods / customFrequency, customFrequency);
            
        default:
            return value;
    }
}

/**
 * Format currency value
 * @param {number} value - Numeric value
 * @param {string} currency - Currency code (default: 'ZAR')
 * @param {number} decimals - Decimal places (default: 2)
 * @returns {string} - Formatted currency string
 */
export function formatCurrency(value, currency = 'ZAR', decimals = 2) {
    const formatted = value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${currency} ${formatted}`;
}

/**
 * Calculate number of periods between two dates
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string} frequency - Period frequency ('Monthly', 'Quarterly', 'Yearly')
 * @returns {number} - Number of periods
 */
export function calculatePeriods(startDate, endDate, frequency) {
    // Ensure date-only strings are parsed as local-midnight Dates
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
 * Calculate Money In / Money Out totals and net from transaction rows
 * @param {Array} rows - Array of transaction row objects
 * @param {Object} opts - Configuration options
 * @param {string} opts.amountField - Field name for amount (default: 'amount')
 * @param {string} opts.typeField - Field name for transaction type object (default: 'transactionType')
 * @param {string} opts.typeNameField - Field name for transaction type name (default: 'transactionTypeName')
 * @param {string} opts.typeIdField - Field name for transaction type ID (default: 'transactionTypeId')
 * @returns {Object} - Object with moneyIn, moneyOut, and net totals
 */
export function calculateCategoryTotals(rows, opts = {}) {
    const amountField = opts.amountField || 'amount';
    const typeField = opts.typeField || 'transactionType';
    const typeNameField = opts.typeNameField || 'transactionTypeName';
    const typeIdField = opts.typeIdField || 'transactionTypeId';

    return rows.reduce((acc, row) => {
        const amount = Number(row?.[amountField] || 0);
        const typeObj = row?.[typeField];
        const name = typeObj?.name || row?.[typeNameField] || '';
        const id = typeObj?.id ?? row?.[typeIdField];
        
        // Determine if it's Money In or Money Out based on transaction type
        const isMoneyIn = name === 'Money In' || id === 1;
        const isMoneyOut = name === 'Money Out' || id === 2;
        
        const absAmount = Math.abs(amount);

        if (isMoneyIn) {
            acc.moneyIn += absAmount;
            acc.net += absAmount; // Money In adds to net
        } else if (isMoneyOut) {
            acc.moneyOut += absAmount;
            acc.net -= absAmount; // Money Out subtracts from net
        }
        
        return acc;
    }, { moneyIn: 0, moneyOut: 0, net: 0 });
}

/**
 * Calculate budget-specific totals including planned outstanding and unplanned amounts
 * @param {Array} rows - Array of budget rows
 * @param {Object} opts - Configuration options
 * @param {string} opts.plannedField - Field name for planned amount (default: 'plannedAmount')
 * @param {string} opts.actualField - Field name for actual amount (default: 'actualAmount')
 * @param {string} opts.typeField - Field name for transaction type (default: 'transactionType')
 * @param {string} opts.typeNameField - Field name for transaction type name (default: 'transactionTypeName')
 * @param {string} opts.typeIdField - Field name for transaction type ID (default: 'transactionTypeId')
 * @returns {Object} - Object with moneyIn, moneyOut, net, plannedOutstanding, and unplanned totals
 */
export function calculateBudgetTotals(rows, opts = {}) {
    const plannedField = opts.plannedField || 'plannedAmount';
    const actualField = opts.actualField || 'actualAmount';
    const typeField = opts.typeField || 'transactionType';
    const typeNameField = opts.typeNameField || 'transactionTypeName';
    const typeIdField = opts.typeIdField || 'transactionTypeId';

    const totals = rows.reduce((acc, row) => {
        const planned = Number(row?.[plannedField] || 0);
        const actual = Number(row?.[actualField] || 0);
        const typeObj = row?.[typeField];
        const name = typeObj?.name || row?.[typeNameField] || '';
        const id = typeObj?.id ?? row?.[typeIdField];
        
        // Determine if it's Money In or Money Out based on transaction type
        const isMoneyIn = name === 'Money In' || id === 1;
        const isMoneyOut = name === 'Money Out' || id === 2;
        
        const absPlanned = Math.abs(planned);
        const absActual = Math.abs(actual);

        // Calculate Money In/Out and Net based on planned amounts
        if (isMoneyIn) {
            acc.moneyIn += absPlanned;
            acc.net += absPlanned;
        } else if (isMoneyOut) {
            acc.moneyOut += absPlanned;
            acc.net -= absPlanned;
        }

        // Calculate Actual Net based on actual amounts
        if (absActual > 0) {
            if (isMoneyIn) {
                acc.actualNet += absActual;
            } else if (isMoneyOut) {
                acc.actualNet -= absActual;
            }
        }

        // Planned Outstanding: planned amounts with no actual or zero actual
        // Money In adds, Money Out subtracts
        if (absPlanned > 0 && absActual === 0) {
            if (isMoneyIn) {
                acc.plannedOutstanding += absPlanned;
            } else if (isMoneyOut) {
                acc.plannedOutstanding -= absPlanned;
            }
        }

        // Unplanned: actual amounts with no planned amount
        // Money In adds, Money Out subtracts
        if (absActual > 0 && absPlanned === 0) {
            if (isMoneyIn) {
                acc.unplanned += absActual;
            } else if (isMoneyOut) {
                acc.unplanned -= absActual;
            }
        }
        
        return acc;
    }, { moneyIn: 0, moneyOut: 0, net: 0, actualNet: 0, plannedOutstanding: 0, unplanned: 0, plannedNetBalance: 0 });

    totals.plannedNetBalance = totals.actualNet - totals.plannedOutstanding;
    return totals;
}

