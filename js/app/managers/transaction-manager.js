// transaction-manager.js
// Unified business logic for transaction operations

import * as DataStore from '../services/storage-service.js';
import { allocateNextId } from '../../shared/app-data-utils.js';

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

        let nextId = allocateNextId(transactions);

        data.scenarios[scenarioIndex].transactions = transactions.map(txn => {
            const id = (!txn.id || txn.id === 0) ? nextId++ : txn.id;
            
            // Extract transaction type and account IDs
            const transactionTypeId = txn.transactionTypeId ?? 2; // Default to Money Out
            const primaryAccountId = txn.primaryAccountId ?? null;
            const secondaryAccountId = txn.secondaryAccountId ?? null;
            
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

            if (status.actualAmount !== null && status.actualAmount !== undefined) {
                status.actualAmount = Math.abs(Number(status.actualAmount) || 0);
            }
            
            // Store canonical unsigned amount
            const rawAmount = txn.amount || 0;
            const normalizedAmount = Math.abs(rawAmount);
            
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


            return mapped;
        });

        return data;
    });
}

/**
 * Create a new transaction using canonical normalization (matches saveAll rules).
 * @param {number} scenarioId - The scenario ID
 * @param {Object} txnData - The transaction data
 * @returns {Promise<Object>} - Full app-data after creation (extract last transaction from scenario)
 */
export async function create(scenarioId, txnData) {
    return await DataStore.transaction(async (data) => {
        const scenario = data.scenarios.find(s => s.id === scenarioId);
        if (!scenario) throw new Error(`Scenario ${scenarioId} not found`);
        if (!scenario.transactions) scenario.transactions = [];

        const transactionTypeId  = txnData.transactionTypeId  ?? 2;
        const primaryAccountId   = txnData.primaryAccountId   ?? null;
        const secondaryAccountId = txnData.secondaryAccountId ?? null;

        let status;
        if (txnData.status && typeof txnData.status === 'object' && txnData.status.name) {
            status = {
                name:         txnData.status.name,
                actualAmount: txnData.status.actualAmount ?? txnData.actualAmount ?? null,
                actualDate:   txnData.status.actualDate   ?? txnData.actualDate   ?? null
            };
        } else {
            status = {
                name:         txnData.status === 'actual' ? 'actual' : 'planned',
                actualAmount: txnData.actualAmount || null,
                actualDate:   txnData.actualDate   || null
            };
        }
        if (status.actualAmount !== null && status.actualAmount !== undefined) {
            status.actualAmount = Math.abs(Number(status.actualAmount) || 0);
        }

        const newTxn = {
            id:                  allocateNextId(scenario.transactions),
            primaryAccountId,
            secondaryAccountId,
            transactionTypeId,
            amount:              Math.abs(txnData.amount || 0),
            effectiveDate:       txnData.effectiveDate || txnData.plannedDate || txnData.recurrence?.startDate || null,
            description:         txnData.description   || '',
            recurrence:          txnData.recurrence    || null,
            periodicChange:      txnData.periodicChange || null,
            status,
            tags:                txnData.tags || []
        };

        scenario.transactions.push(newTxn);
        return data;
    });
}
