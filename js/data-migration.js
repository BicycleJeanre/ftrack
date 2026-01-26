// data-migration.js
// One-time migration script to convert old data format to new unified transactions

import { getAppDataPath } from './app-paths.js';

const fs = window.require('fs').promises;
const dataPath = getAppDataPath();

/**
 * Migrate scenario data from separate planned/actual arrays to unified transactions
 * @param {Object} scenario - The scenario object to migrate
 * @returns {Object} - The migrated scenario
 */
export function migrateScenarioTransactions(scenario) {
    if (!scenario.plannedTransactions && !scenario.actualTransactions) {
        // Already migrated or no transactions
        return scenario;
    }

    const transactions = [];

    // Convert planned transactions
    if (scenario.plannedTransactions) {
        scenario.plannedTransactions.forEach(planned => {
            transactions.push({
                id: planned.id,
                status: 'planned',
                debitAccount: planned.debitAccount,
                creditAccount: planned.creditAccount,
                amount: planned.amount,
                actualAmount: undefined,
                effectiveDate: planned.effectiveDate,
                actualDate: undefined,
                description: planned.description,
                recurrence: planned.recurrence,
                periodicChange: planned.periodicChange,
                tags: planned.tags || []
            });
        });
    }

    // Convert actual transactions
    if (scenario.actualTransactions) {
        scenario.actualTransactions.forEach(actual => {
            // Find matching planned transaction if it exists
            const existingIndex = transactions.findIndex(t =>
                t.id === actual.plannedId && t.status === 'planned'
            );

            if (existingIndex >= 0) {
                // Update existing planned transaction to actual
                transactions[existingIndex].status = 'actual';
                transactions[existingIndex].actualAmount = actual.amount;
                transactions[existingIndex].actualDate = actual.actualDate;
            } else {
                // Standalone actual transaction
                transactions.push({
                    id: actual.id,
                    status: 'actual',
                    debitAccount: actual.debitAccount,
                    creditAccount: actual.creditAccount,
                    amount: actual.amount, // This might be the planned amount, but we don't have it
                    actualAmount: actual.amount,
                    effectiveDate: actual.effectiveDate || actual.actualDate,
                    actualDate: actual.actualDate,
                    description: actual.description || '',
                    recurrence: null,
                    periodicChange: null,
                    tags: actual.tags || []
                });
            }
        });
    }

    // Remove old arrays and add new one
    delete scenario.plannedTransactions;
    delete scenario.actualTransactions;
    scenario.transactions = transactions;

    return scenario;
}

/**
 * Ensure scenario has budgets array (migration to v2)
 * @param {Object} scenario - The scenario object to migrate
 * @returns {Object} - The migrated scenario
 */
export function ensureBudgetsArray(scenario) {
    if (!scenario.budgets) {
        scenario.budgets = [];
    }
    return scenario;
}

/**
 * Run migration on all scenarios in the data store
 * @returns {Promise<void>}
 */
export async function migrateAllScenarios() {
    // Read current data
    const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
    
    if (data.scenarios) {
        data.scenarios = data.scenarios.map(scenario => {
            // Apply all migrations in sequence
            scenario = migrateScenarioTransactions(scenario);
            scenario = ensureBudgetsArray(scenario);
            return scenario;
        });
    }
    
    // Mark migration as complete (v2 adds budgets)
    data.migrationVersion = 2;
    
    // Write back
    await fs.writeFile(dataPath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Check if migration is needed
 * @returns {Promise<boolean>}
 */
export async function needsMigration() {
    const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
    return !data.migrationVersion || data.migrationVersion < 2;
}