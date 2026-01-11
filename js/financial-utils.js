// financial-utils.js
// Utility wrapper for financial calculations
// Provides consistent, tested financial math functions

/**
 * Calculate Future Value (FV)
 * @param {number} rate - Interest rate per period (as percentage, e.g., 5 for 5%)
 * @param {number} nper - Number of periods
 * @param {number} pmt - Payment per period (negative for outflow)
 * @param {number} pv - Present value (negative for outflow)
 * @returns {number} - Future value
 */
export function calculateFutureValue(rate, nper, pmt, pv) {
    const ratePerPeriod = rate / 100;
    
    if (ratePerPeriod === 0) {
        return -(pv + (pmt * nper));
    }
    
    const factor = Math.pow(1 + ratePerPeriod, nper);
    return -(pv * factor + pmt * ((factor - 1) / ratePerPeriod));
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
    const ratePerPeriod = rate / 100;
    
    if (ratePerPeriod === 0) {
        return -(fv + (pmt * nper));
    }
    
    const factor = Math.pow(1 + ratePerPeriod, nper);
    return -(fv / factor + pmt * ((1 - (1 / factor)) / ratePerPeriod));
}

/**
 * Calculate compound interest
 * @param {number} principal - Initial amount
 * @param {number} rate - Annual interest rate (as percentage)
 * @param {number} periods - Number of compounding periods
 * @param {number} frequency - Compounding frequency per year (default: 1)
 * @returns {number} - Final amount after compound interest
 */
export function calculateCompoundInterest(principal, rate, periods, frequency = 1) {
    const ratePerPeriod = (rate / 100) / frequency;
    const totalPeriods = periods * frequency;
    return principal * Math.pow(1 + ratePerPeriod, totalPeriods);
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
    const ratePerPeriod = rate / 100;
    
    if (ratePerPeriod === 0) {
        return -(pv + fv) / nper;
    }
    
    const factor = Math.pow(1 + ratePerPeriod, nper);
    return -(pv * factor * ratePerPeriod + fv * ratePerPeriod) / (factor - 1);
}

/**
 * Apply periodic change to a value
 * @param {number} value - Initial value
 * @param {Object} periodicChange - Periodic change configuration
 * @param {number} periods - Number of periods to apply
 * @returns {number} - Value after periodic change
 */
export function applyPeriodicChange(value, periodicChange, periods) {
    if (!periodicChange || !periodicChange.value) {
        return value;
    }
    
    const changeMode = periodicChange.changeMode?.name || 'Percentage Rate';
    const changeValue = periodicChange.value;
    
    if (changeMode === 'Fixed Amount') {
        // Fixed amount change per period
        return value + (changeValue * periods);
    } else {
        // Percentage rate change
        const changeType = periodicChange.changeType?.name || 'Nominal Annual (No Compounding)';
        
        if (changeType.includes('Compounded')) {
            // Compound interest
            let frequency = 1; // Annual by default
            
            if (changeType.includes('Monthly')) frequency = 12;
            else if (changeType.includes('Quarterly')) frequency = 4;
            else if (changeType.includes('Daily')) frequency = 365;
            
            return calculateCompoundInterest(value, changeValue, periods / frequency, frequency);
        } else {
            // Simple interest / nominal rate
            return value * Math.pow(1 + (changeValue / 100), periods);
        }
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
    const start = new Date(startDate);
    const end = new Date(endDate);
    
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
