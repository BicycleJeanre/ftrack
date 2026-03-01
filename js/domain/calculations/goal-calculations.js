// goal-calculation-utils.js
// Goal-based planning calculation engine
// Implements FV formula with compound interest for solving goal math

/**
 * Calculate the contribution amount needed to reach a goal
 * FV = PV(1+r)^n + PMT * ((1+r)^n - 1) / r
 * Solving for PMT: PMT = (FV - PV(1+r)^n) / (((1+r)^n - 1) / r)
 * 
 * @param {number} presentValue - Starting balance
 * @param {number} futureValue - Target goal amount
 * @param {number} months - Number of months to goal
 * @param {number} annualRate - Annual interest rate as decimal (e.g., 0.05 for 5%)
 * @returns {number} - Monthly contribution amount
 */
export function calculateContributionAmount(presentValue, futureValue, months, annualRate = 0) {
    if (months <= 0) {
        return 0;
    }
    
    const monthlyRate = annualRate / 12;
    
    // Simple case: no interest
    if (monthlyRate === 0) {
        return (futureValue - presentValue) / months;
    }
    
    // Compound interest case
    const accumulationFactor = Math.pow(1 + monthlyRate, months);
    const numerator = futureValue - presentValue * accumulationFactor;
    const denominator = (accumulationFactor - 1) / monthlyRate;
    
    if (denominator === 0) {
        return 0;
    }
    
    return numerator / denominator;
}

/**
 * Calculate the future value of an account with contributions and interest
 * FV = PV(1+r)^n + PMT * ((1+r)^n - 1) / r
 * 
 * @param {number} presentValue - Starting balance
 * @param {number} monthlyContribution - Recurring monthly contribution
 * @param {number} months - Number of months
 * @param {number} annualRate - Annual interest rate as decimal
 * @returns {number} - Projected future value
 */
export function calculateFutureValue(presentValue, monthlyContribution, months, annualRate = 0) {
    if (months <= 0) {
        return presentValue;
    }
    
    const monthlyRate = annualRate / 12;
    
    // Simple case: no interest
    if (monthlyRate === 0) {
        return presentValue + monthlyContribution * months;
    }
    
    // Compound interest case
    const accumulationFactor = Math.pow(1 + monthlyRate, months);
    const principalFV = presentValue * accumulationFactor;
    const contributionFV = monthlyContribution * (accumulationFactor - 1) / monthlyRate;
    
    return principalFV + contributionFV;
}

/**
 * Calculate the number of months to reach a goal
 * Solves FV = PV(1+r)^n + PMT * ((1+r)^n - 1) / r for n
 * Uses numerical iteration when r != 0, or algebraic solution when r = 0
 * 
 * @param {number} presentValue - Starting balance
 * @param {number} futureValue - Target goal amount
 * @param {number} monthlyContribution - Monthly contribution amount
 * @param {number} annualRate - Annual interest rate as decimal
 * @param {number} maxMonths - Maximum months to search (default 600)
 * @returns {number|null} - Number of months to goal, or null if impossible
 */
export function calculateMonthsToGoal(presentValue, futureValue, monthlyContribution, annualRate = 0, maxMonths = 600) {
    // If already at goal
    if (presentValue >= futureValue) {
        return 0;
    }
    
    // If no contribution and can't reach goal, return null
    if (monthlyContribution <= 0 && futureValue > presentValue) {
        return null;
    }
    
    const monthlyRate = annualRate / 12;
    
    // Simple case: no interest
    if (monthlyRate === 0) {
        const monthsNeeded = (futureValue - presentValue) / monthlyContribution;
        if (monthsNeeded < 0) return null;
        return monthsNeeded;
    }
    
    // Compound interest case: use numerical search
    // Binary search between 1 and maxMonths
    let low = 1;
    let high = maxMonths;
    let result = null;
    
    // First check if goal is reachable within maxMonths
    const maxFV = calculateFutureValue(presentValue, monthlyContribution, maxMonths, annualRate);
    if (maxFV < futureValue) {
        return null; // Goal unreachable
    }
    
    // Binary search for the exact month
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const fv = calculateFutureValue(presentValue, monthlyContribution, mid, annualRate);
        
        if (Math.abs(fv - futureValue) < 0.01) {
            result = mid;
            break;
        } else if (fv < futureValue) {
            low = mid + 1;
        } else {
            high = mid - 1;
            result = mid;
        }
    }
    
    return result;
}

/**
 * Get contribution frequency in months
 * 
 * @param {number} frequencyId - Frequency lookup ID (1=Daily, 2=Weekly, 3=Monthly, 4=Quarterly, 5=Yearly)
 * @returns {number} - Number of months between contributions
 */
function getFrequencyInMonths(frequencyId) {
    const frequencyMap = {
        1: 0.033,    // Daily (1/30 months)
        2: 0.231,    // Weekly (1/4.33 months)
        3: 1,        // Monthly
        4: 3,        // Quarterly
        5: 12        // Yearly
    };
    
    return frequencyMap[frequencyId] || 1;
}

/**
 * Convert contribution amount from one frequency to another
 * 
 * @param {number} amount - Contribution amount
 * @param {number} fromFrequencyId - Source frequency ID
 * @param {number} toFrequencyId - Target frequency ID
 * @returns {number} - Converted amount
 */
export function convertContributionFrequency(amount, fromFrequencyId, toFrequencyId) {
    const fromMonths = getFrequencyInMonths(fromFrequencyId);
    const toMonths = getFrequencyInMonths(toFrequencyId);
    
    return amount * (toMonths / fromMonths);
}

/**
 * Get frequency name from ID
 * 
 * @param {number} frequencyId - Frequency lookup ID
 * @returns {string} - Frequency name
 */
export function getFrequencyName(frequencyId) {
    const nameMap = {
        1: 'Daily',
        2: 'Weekly',
        3: 'Monthly',
        4: 'Quarterly',
        5: 'Yearly'
    };
    
    return nameMap[frequencyId] || 'Monthly';
}

/**
 * Calculate months between two dates
 * 
 * @param {string} startDate - Date in YYYY-MM-DD format
 * @param {string} endDate - Date in YYYY-MM-DD format
 * @returns {number} - Number of months (fractional)
 */
export function calculateMonthsBetweenDates(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const yearDiff = end.getFullYear() - start.getFullYear();
    const monthDiff = end.getMonth() - start.getMonth();
    
    return yearDiff * 12 + monthDiff;
}

