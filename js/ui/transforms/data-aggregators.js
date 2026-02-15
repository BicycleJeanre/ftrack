/**
 * data-aggregators.js
 * Data aggregation utilities for UI display
 * Extracted from financial-utils.js
 */

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
