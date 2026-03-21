/**
 * data-aggregators.js
 * Data aggregation utilities for UI display
 * Extracted from financial-utils.js
 */

const MONEY_IN_ID = 1;
const MONEY_OUT_ID = 2;

function getRowTypeId(row, opts = {}) {
    const typeField = opts.typeField || 'transactionType';
    const typeNameField = opts.typeNameField || 'transactionTypeName';
    const typeIdField = opts.typeIdField || 'transactionTypeId';
    const typeObj = row?.[typeField];
    const name = typeObj?.name || row?.[typeNameField] || '';
    const id = typeObj?.id ?? row?.[typeIdField];

    if (id === MONEY_IN_ID || name === 'Money In') return MONEY_IN_ID;
    if (id === MONEY_OUT_ID || name === 'Money Out') return MONEY_OUT_ID;
    return null;
}

function clampMoney(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    const rounded = Math.round(n * 100) / 100;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function resolveCapitalInterestAmounts(row, opts = {}) {
    const amountField = opts.amountField || 'amount';
    const capitalField = opts.capitalField || 'capitalAmount';
    const interestField = opts.interestField || 'interestAmount';
    const roleField = opts.roleField || 'transactionGroupRole';

    const amountAbs = Math.abs(Number(row?.[amountField] || 0));

    const hasCapital = row?.[capitalField] !== undefined && row?.[capitalField] !== null;
    const hasInterest = row?.[interestField] !== undefined && row?.[interestField] !== null;

    if (hasCapital || hasInterest) {
        const rawCapital = hasCapital ? Math.abs(Number(row?.[capitalField] || 0)) : null;
        const rawInterest = hasInterest ? Math.abs(Number(row?.[interestField] || 0)) : null;

        if (rawCapital === null && rawInterest === null) {
            return { capital: amountAbs, interest: 0 };
        }
        if (rawCapital === null) {
            const interest = Math.min(amountAbs, rawInterest);
            return { capital: amountAbs - interest, interest };
        }
        if (rawInterest === null) {
            const capital = Math.min(amountAbs, rawCapital);
            return { capital, interest: amountAbs - capital };
        }

        const total = rawCapital + rawInterest;
        if (total <= amountAbs || total === 0) {
            return { capital: rawCapital, interest: rawInterest };
        }

        // Normalize overflowing explicit splits to the row amount.
        const scale = amountAbs / total;
        return {
            capital: rawCapital * scale,
            interest: rawInterest * scale
        };
    }

    const role = String(row?.[roleField] || '').toLowerCase();
    if (role === 'interest') {
        return { capital: 0, interest: amountAbs };
    }

    return { capital: amountAbs, interest: 0 };
}

function appendDirectionBuckets(acc, { isIn, capital, interest }) {
    if (isIn) {
        acc.capitalIn += capital;
        acc.interestIn += interest;
    } else {
        acc.capitalOut += capital;
        acc.interestOut += interest;
    }
}

function finalizeCapitalInterestTotals(acc) {
    const normalized = {
        capitalIn: clampMoney(acc.capitalIn),
        capitalOut: clampMoney(acc.capitalOut),
        interestIn: clampMoney(acc.interestIn),
        interestOut: clampMoney(acc.interestOut)
    };

    const moneyIn = normalized.capitalIn + normalized.interestIn;
    const moneyOut = normalized.capitalOut + normalized.interestOut;
    const net = moneyIn - moneyOut;

    return {
        ...normalized,
        moneyIn: clampMoney(moneyIn),
        moneyOut: clampMoney(moneyOut),
        net: clampMoney(net),
        total: clampMoney(net)
    };
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

    return rows.reduce((acc, row) => {
        const amount = Number(row?.[amountField] || 0);
        const id = getRowTypeId(row, opts);
        
        // Determine if it's Money In or Money Out based on transaction type
        const isMoneyIn = id === MONEY_IN_ID;
        const isMoneyOut = id === MONEY_OUT_ID;
        
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
 * Calculate capital/interest buckets for rows that use transaction direction
 * semantics (Money In / Money Out).
 * @param {Array} rows
 * @param {Object} opts
 * @returns {{capitalIn:number,capitalOut:number,interestIn:number,interestOut:number,moneyIn:number,moneyOut:number,net:number,total:number}}
 */
export function calculateCapitalInterestTotals(rows, opts = {}) {
    const seed = {
        capitalIn: 0,
        capitalOut: 0,
        interestIn: 0,
        interestOut: 0
    };

    const reduced = (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
        const typeId = getRowTypeId(row, opts);
        if (typeId !== MONEY_IN_ID && typeId !== MONEY_OUT_ID) {
            return acc;
        }
        const { capital, interest } = resolveCapitalInterestAmounts(row, opts);
        appendDirectionBuckets(acc, { isIn: typeId === MONEY_IN_ID, capital, interest });
        return acc;
    }, seed);

    return finalizeCapitalInterestTotals(reduced);
}

/**
 * Calculate capital/interest totals for projection-style rows that already carry
 * directional bucket fields.
 * @param {Array} rows
 * @param {Object} opts
 */
export function calculateCapitalInterestFlowTotals(rows, opts = {}) {
    const capitalInField = opts.capitalInField || 'capitalIn';
    const capitalOutField = opts.capitalOutField || 'capitalOut';
    const interestInField = opts.interestInField || 'interestIn';
    const interestOutField = opts.interestOutField || 'interestOut';

    const reduced = (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
        acc.capitalIn += Math.abs(Number(row?.[capitalInField] || 0));
        acc.capitalOut += Math.abs(Number(row?.[capitalOutField] || 0));
        acc.interestIn += Math.abs(Number(row?.[interestInField] || 0));
        acc.interestOut += Math.abs(Number(row?.[interestOutField] || 0));
        return acc;
    }, {
        capitalIn: 0,
        capitalOut: 0,
        interestIn: 0,
        interestOut: 0
    });

    return finalizeCapitalInterestTotals(reduced);
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

    const totals = rows.reduce((acc, row) => {
        const planned = Number(row?.[plannedField] || 0);
        const actual = Number(row?.[actualField] || 0);
        const id = getRowTypeId(row, opts);
        
        // Determine if it's Money In or Money Out based on transaction type
        const isMoneyIn = id === MONEY_IN_ID;
        const isMoneyOut = id === MONEY_OUT_ID;
        
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
