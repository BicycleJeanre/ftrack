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
    console.log('[TransactionManager.saveAll] start', { scenarioId, count: transactions?.length });
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

        // Convert UI format (debitAccount/creditAccount) to storage format (primaryAccountId/secondaryAccountId/transactionTypeId)
        data.scenarios[scenarioIndex].transactions = transactions.map(txn => {
            const id = (!txn.id || txn.id === 0) ? nextId++ : txn.id;
            
            // Determine transaction type and account IDs
            let transactionTypeId, primaryAccountId, secondaryAccountId;
            
            // If already has the new format, preserve it
            if (txn.primaryAccountId !== undefined && txn.secondaryAccountId !== undefined && txn.transactionTypeId !== undefined) {
                transactionTypeId = txn.transactionTypeId;
                primaryAccountId = txn.primaryAccountId;
                secondaryAccountId = txn.secondaryAccountId;
            } else {
                // Convert from debitAccount/creditAccount format
                // Infer transaction type from transactionType field or default to Money Out (2)
                const transactionTypeName = txn.transactionType?.name;
                
                if (transactionTypeName === 'Money In') {
                    // Money In: secondary → primary (debit=secondary, credit=primary)
                    transactionTypeId = 1;
                    primaryAccountId = txn.creditAccount?.id || null;
                    secondaryAccountId = txn.debitAccount?.id || null;
                } else {
                    // Money Out: primary → secondary (debit=primary, credit=secondary)
                    transactionTypeId = 2;
                    primaryAccountId = txn.debitAccount?.id || null;
                    secondaryAccountId = txn.creditAccount?.id || null;
                }
            }
            
            // Normalize status to object format, preserving actual fields when provided
            let status;
            if (txn.status && typeof txn.status === 'object' && txn.status.name) {
                status = {
                    name: txn.status.name,
                    actualAmount: txn.status.actualAmount ?? txn.actualAmount ?? null,
                    actualDate: txn.status.actualDate ?? txn.actualDate ?? null
                };
            } else {
                status = {
                    name: txn.status === 'actual' ? 'actual' : 'planned',
                    actualAmount: txn.actualAmount || null,
                    actualDate: txn.actualDate || null
                };
            }
            
            // Normalize amount sign based on transaction type
            const rawAmount = txn.amount || 0;
            const absAmount = Math.abs(rawAmount);
            const normalizedAmount = transactionTypeId === 1
                ? absAmount  // Money In: always positive
                : -absAmount; // Money Out: always negative
            
            const mapped = {
                id,
                primaryAccountId,
                secondaryAccountId,
                transactionTypeId,
                amount: normalizedAmount,
                effectiveDate: txn.effectiveDate || txn.plannedDate || txn.recurrence?.startDate || null,
                description: txn.description || '',
                recurrence: txn.recurrence || null,
                periodicChange: txn.periodicChange || null,
                status,
                tags: txn.tags || []
            };

            if (txn.__logOnce !== false) {
                console.log('[TransactionManager.saveAll] mapped txn', { id, primaryAccountId, secondaryAccountId, transactionTypeId, effectiveDate: mapped.effectiveDate });
            }

            return mapped;
        });

        console.log('[TransactionManager.saveAll] mapped for write', {
            scenarioId,
            count: data.scenarios[scenarioIndex].transactions.length
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
