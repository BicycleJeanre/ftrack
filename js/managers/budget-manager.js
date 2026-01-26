// budget-manager.js
// Unified business logic for budget operations
// Budgets are snapshots of projections that become editable working datasets

import * as DataStore from '../core/data-store.js';

/**
 * Get all budget occurrences for a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<Array>} - Array of budget occurrences
 */
export async function getAll(scenarioId) {
    const data = await DataStore.read();
    const scenario = data.scenarios?.find(s => s.id === scenarioId);
    return scenario?.budgets || [];
}

/**
 * Save all budget occurrences for a scenario
 * @param {number} scenarioId - The scenario ID
 * @param {Array} budgets - Array of budget occurrence objects
 * @returns {Promise<void>}
 */
export async function saveAll(scenarioId, budgets) {
    return await DataStore.transaction(async (data) => {
        const scenarioIndex = data.scenarios.findIndex(s => s.id === scenarioId);

        if (scenarioIndex === -1) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }

        // Assign IDs to new budget occurrences
        const maxId = budgets.length > 0 && budgets.some(b => b.id)
            ? Math.max(...budgets.filter(b => b.id).map(b => b.id))
            : 0;

        let nextId = maxId + 1;

        data.scenarios[scenarioIndex].budgets = budgets.map(budget => {
            if (!budget.id || budget.id === 0) {
                return { ...budget, id: nextId++ };
            }
            return budget;
        });

        return data;
    });
}

/**
 * Create a budget snapshot from projection data
 * @param {number} scenarioId - The scenario ID
 * @param {Array} projectionData - Array of projection objects to convert to budget
 * @returns {Promise<Array>} - The created budget occurrences
 */
export async function createFromProjections(scenarioId, projectionData) {
    return await DataStore.transaction(async (data) => {
        const scenario = data.scenarios.find(s => s.id === scenarioId);
        
        if (!scenario) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        
        if (!scenario.budgets) {
            scenario.budgets = [];
        }
        
        // Convert projection data to budget occurrences
        // Each projection period becomes budget occurrences for that period's transactions
        const budgetOccurrences = [];
        let nextId = 1;
        
        // Generate budget occurrences from planned transactions with amounts from projections
        const statusName = tx => typeof tx.status === 'object' ? tx.status.name : tx.status;
        const plannedTransactions = (scenario.transactions || []).filter(tx => statusName(tx) === 'planned');
        
        plannedTransactions.forEach(tx => {
            // Create a budget occurrence for each planned transaction
            // Store reference to source transaction for traceability
            budgetOccurrences.push({
                id: nextId++,
                sourceTransactionId: tx.id,
                primaryAccountId: tx.primaryAccountId,
                secondaryAccountId: tx.secondaryAccountId,
                transactionTypeId: tx.transactionTypeId,
                amount: tx.amount,
                description: tx.description,
                recurrence: tx.recurrence,
                periodicChange: tx.periodicChange,
                status: {
                    name: 'planned',
                    actualAmount: null,
                    actualDate: null
                },
                tags: tx.tags || []
            });
        });
        
        scenario.budgets = budgetOccurrences;
        return data;
    });
}

/**
 * Update a specific budget occurrence
 * @param {number} scenarioId - The scenario ID
 * @param {number} budgetId - The budget occurrence ID
 * @param {Object} updates - The fields to update
 * @returns {Promise<Object>} - The updated budget occurrence
 */
export async function update(scenarioId, budgetId, updates) {
    return await DataStore.transaction(async (data) => {
        const scenario = data.scenarios.find(s => s.id === scenarioId);
        
        if (!scenario) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        
        if (!scenario.budgets) {
            scenario.budgets = [];
        }
        
        const budgetIndex = scenario.budgets.findIndex(b => b.id === budgetId);
        
        if (budgetIndex === -1) {
            throw new Error(`Budget occurrence ${budgetId} not found`);
        }
        
        scenario.budgets[budgetIndex] = {
            ...scenario.budgets[budgetIndex],
            ...updates
        };
        
        return data;
    });
}

/**
 * Delete a budget occurrence
 * @param {number} scenarioId - The scenario ID
 * @param {number} budgetId - The budget occurrence ID
 * @returns {Promise<void>}
 */
export async function remove(scenarioId, budgetId) {
    return await DataStore.transaction(async (data) => {
        const scenario = data.scenarios.find(s => s.id === scenarioId);
        
        if (!scenario) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        
        if (!scenario.budgets) {
            return data;
        }
        
        scenario.budgets = scenario.budgets.filter(b => b.id !== budgetId);
        return data;
    });
}

/**
 * Clear all budgets for a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<void>}
 */
export async function clearAll(scenarioId) {
    return await DataStore.transaction(async (data) => {
        const scenario = data.scenarios.find(s => s.id === scenarioId);
        
        if (!scenario) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        
        scenario.budgets = [];
        return data;
    });
}
