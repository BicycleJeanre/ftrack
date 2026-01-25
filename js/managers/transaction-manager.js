// transaction-manager.js
// Unified business logic for transaction operations

import * as DataStore from '../core/data-store.js';

/**
 * Get all transactions for a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<Array>} - Array of transactions
 */
export async function getAll(scenarioId) {
    const data = await DataStore.read();
    const scenario = data.scenarios?.find(s => s.id === scenarioId);
    return scenario?.transactions || [];
}

/**
 * Save all transactions for a scenario
 * @param {number} scenarioId - The scenario ID
 * @param {Array} transactions - Array of transaction objects
 * @returns {Promise<void>}
 */
export async function saveAll(scenarioId, transactions) {
    return await DataStore.transaction(async (data) => {
        const scenarioIndex = data.scenarios.findIndex(s => s.id === scenarioId);

        if (scenarioIndex === -1) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }

        // Assign IDs to new transactions
        const maxId = transactions.length > 0 && transactions.some(t => t.id)
            ? Math.max(...transactions.filter(t => t.id).map(t => t.id))
            : 0;

        let nextId = maxId + 1;

        data.scenarios[scenarioIndex].transactions = transactions.map(txn => {
            if (!txn.id || txn.id === 0) {
                return { ...txn, id: nextId++ };
            }
            return txn;
        });

        return data;
    });
}

/**
 * Get transactions for a specific period
 * @param {number} scenarioId - The scenario ID
 * @param {string} periodId - The period ID (or 'all' for all transactions)
 * @returns {Promise<Array>} - Array of transactions
 */
export async function getByPeriod(scenarioId, periodId) {
    const transactions = await getAll(scenarioId);
    if (periodId === 'all') {
        return transactions;
    }
    // Filter by period - this would need to be implemented based on effectiveDate
    // For now, return all transactions
    return transactions;
}

/**
 * Create a new planned transaction
 * @param {number} scenarioId - The scenario ID
 * @param {Object} txnData - The transaction data
 * @returns {Promise<Object>} - The created transaction
 */
export async function createPlanned(scenarioId, txnData) {
    return await DataStore.transaction(async (data) => {
        const scenario = data.scenarios.find(s => s.id === scenarioId);
        
        if (!scenario) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        
        if (!scenario.plannedTransactions) {
            scenario.plannedTransactions = [];
        }
        
        const maxId = scenario.plannedTransactions.length > 0
            ? Math.max(...scenario.plannedTransactions.map(t => t.id || 0))
            : 0;
        
        const newTxn = {
            id: maxId + 1,
            ...txnData
        };
        
        scenario.plannedTransactions.push(newTxn);
        return data;
    });
}

/**
 * Delete a planned transaction
 * @param {number} scenarioId - The scenario ID
 * @param {number} txnId - The transaction ID
 * @returns {Promise<void>}
 */
export async function deletePlanned(scenarioId, txnId) {
    return await DataStore.transaction(async (data) => {
        const scenario = data.scenarios.find(s => s.id === scenarioId);
        
        if (!scenario) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        
        scenario.plannedTransactions = scenario.plannedTransactions.filter(t => t.id !== txnId);
        return data;
    });
}

/**
 * Delete an actual transaction
 * @param {number} scenarioId - The scenario ID
 * @param {number} txnId - The transaction ID
 * @returns {Promise<void>}
 */
export async function deleteActual(scenarioId, txnId) {
    return await DataStore.transaction(async (data) => {
        const scenario = data.scenarios.find(s => s.id === scenarioId);
        
        if (!scenario) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        
        scenario.actualTransactions = scenario.actualTransactions.filter(t => t.id !== txnId);
        return data;
    });
}
