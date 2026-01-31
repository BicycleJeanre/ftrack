// budget-manager.js
// Unified business logic for budget operations
// Budgets are snapshots of projections that become editable working datasets

/**
 * Budget Data Model (Storage Format)
 * 
 * Budgets are stored with only ID references (no embedded objects):
 * {
 *   id: number,                           // Unique budget occurrence ID
 *   sourceTransactionId: number | null,   // Reference to planned transaction (ID only)
 *   primaryAccountId: number | null,      // Reference to primary account (ID only)
 *   secondaryAccountId: number | null,    // Reference to secondary account (ID only)
 *   transactionTypeId: number | null,     // Transaction type ID (1=Money In, 2=Money Out)
 *   amount: number,                       // Planned amount
 *   description: string,                  // Transaction description
 *   recurrenceDescription: string,        // Human-readable recurrence pattern
 *   occurrenceDate: string,               // YYYY-MM-DD format
 *   periodicChange: object | null,        // Periodic change/escalation data
 *   status: {
 *     name: string,                       // 'planned' or 'actual'
 *     actualAmount: number | null,        // Actual amount if status is actual
 *     actualDate: string | null           // Actual date if status is actual
 *   },
 *   tags: string[]                        // Associated tags
 * }
 * 
 * UI transforms budgets to include resolved objects (debitAccount, creditAccount, etc.)
 * but these are NEVER persisted to disk—only IDs are stored.
 */


import * as DataStore from '../core/data-store.js';
import { generateRecurrenceDates } from '../calculation-utils.js';
import { formatDateOnly } from '../date-utils.js';
import { getRecurrenceDescription } from '../recurrence-utils.js';

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
            // Normalize budget to storage format: only store IDs, not objects
            const normalized = {
                id: budget.id || nextId++,
                sourceTransactionId: budget.sourceTransactionId || null,
                primaryAccountId: budget.primaryAccountId || null,
                secondaryAccountId: budget.secondaryAccountId || null,
                transactionTypeId: budget.transactionTypeId || null,
                amount: budget.amount || 0,
                description: budget.description || '',
                recurrenceDescription: budget.recurrenceDescription || '',
                occurrenceDate: budget.occurrenceDate || '',
                periodicChange: budget.periodicChange || null,
                status: typeof budget.status === 'object' ? budget.status : { 
                    name: budget.status || 'planned',
                    actualAmount: null,
                    actualDate: null 
                },
                tags: budget.tags || []
            };
            
            // Explicitly exclude UI-only fields (objects that should never be stored)
            // These may exist in memory for rendering but should never be persisted
            delete normalized.debitAccount;
            delete normalized.creditAccount;
            delete normalized.primaryAccount;
            delete normalized.secondaryAccount;
            delete normalized.transactionType;
            delete normalized.primaryAccountName;
            delete normalized.transactionTypeName;
            delete normalized.plannedAmount;
            delete normalized.actualAmount;
            delete normalized.actualDateOverride;

            return normalized;
        });

        return data;
    });
}

/**
 * Create budgets from planned transactions with recurrence expansion
 * Expands each transaction's recurrence into individual dated budget occurrences
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<Array>} - The created budgets (expanded occurrences)
 */
export async function createFromProjections(scenarioId) {
    return await DataStore.transaction(async (data) => {
        const scenario = data.scenarios.find(s => s.id === scenarioId);
        
        if (!scenario) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        
        if (!scenario.budgets) {
            scenario.budgets = [];
        }
        
        // Get scenario date range
        const startDate = new Date(scenario.startDate);
        const endDate = new Date(scenario.endDate);
        
        // Copy planned transactions to budgets and expand by recurrence
        const statusName = tx => typeof tx.status === 'object' ? tx.status.name : tx.status;
        const plannedTransactions = (scenario.transactions || [])
            .filter(tx => statusName(tx) === 'planned' && tx.primaryAccountId && tx.secondaryAccountId);
        
        // Expand each transaction into dated budget occurrences
        const budgets = [];
        plannedTransactions.forEach(tx => {
            const recurrenceDescription = getRecurrenceDescription(tx.recurrence);
            
            // Generate all occurrence dates within scenario range
            const occurrenceDates = generateRecurrenceDates(tx.recurrence, startDate, endDate);
            
            // Create a budget occurrence for each date
            occurrenceDates.forEach(date => {
                budgets.push({
                    id: 0, // Will be auto-assigned by saveAll
                    sourceTransactionId: tx.id,
                    primaryAccountId: tx.primaryAccountId,
                    secondaryAccountId: tx.secondaryAccountId,
                    transactionTypeId: tx.transactionTypeId,
                    amount: tx.amount,
                    description: tx.description,
                    recurrenceDescription: recurrenceDescription,
                    occurrenceDate: formatDateOnly(date),
                    periodicChange: tx.periodicChange,
                    status: {
                        name: 'planned',
                        actualAmount: null,
                        actualDate: null
                    },
                    tags: tx.tags || []
                });
            });
        });
        
        scenario.budgets = budgets;
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
