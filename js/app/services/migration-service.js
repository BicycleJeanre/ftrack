// migration-service.js
// Data migration utilities for version upgrades
// Web-only implementation

import { parseDateOnly } from '../../shared/date-utils.js';

/**
 * Migrate scenario data from old plannedTransactions/actualTransactions format to unified transactions
 * Old format: plannedTransactions and actualTransactions arrays
 * New format: single transactions array with primaryAccountId/secondaryAccountId/transactionTypeId
 * @param {Object} scenario - The scenario object to migrate
 * @returns {Object} - The migrated scenario
 */
export function migrateScenarioTransactions(scenario) {
    // If already has transactions array, skip this migration
    if (scenario.transactions) {
        return scenario;
    }

    // If has neither old nor new format, nothing to migrate
    if (!scenario.plannedTransactions && !scenario.actualTransactions) {
        scenario.transactions = [];
        return scenario;
    }

    const transactions = [];

    // Convert planned transactions
    if (scenario.plannedTransactions) {
        scenario.plannedTransactions.forEach(planned => {
            transactions.push({
                ...planned
            });
        });
    }

    // Convert actual transactions
    if (scenario.actualTransactions) {
        scenario.actualTransactions.forEach(actual => {
            transactions.push({
                ...actual
            });
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
 * Ensure accounts have goal fields (migration to v4)
 * Add goalAmount and goalDate fields if missing
 * @param {Object} scenario - The scenario object to migrate
 * @returns {Object} - The migrated scenario
 */
export function ensureGoalFields(scenario) {
    if (!scenario.accounts) {
        return scenario;
    }

    scenario.accounts = scenario.accounts.map(account => {
        const updated = { ...account };
        
        // Add goal fields if missing
        if (updated.goalAmount === undefined) {
            updated.goalAmount = null;
        }
        if (updated.goalDate === undefined) {
            updated.goalDate = null;
        }
        
        return updated;
    });

    return scenario;
}

/**
 * Run migration on all scenarios in the data store
 * @returns {Promise<void>}
 */
export async function migrateAllScenarios() {
    // Web-only: No file-based migration needed
    // Data is migrated on-the-fly when loaded from localStorage
    return;
}

/**
 * Check if migration is needed
 * @returns {Promise<boolean>}
 */
export async function needsMigration() {
    // Web-only: Always return false (migrations happen on-the-fly)
    return false;
}

/**
 * Migrate recurrence structure from old to new format
 * Old: { pattern, frequency, recurrenceType, startDate, endDate, interval }
 * New: { recurrenceType, startDate, endDate, interval, dayOfWeek, dayOfMonth, etc. }
 * @param {Object} recurrence - The recurrence object to migrate
 * @returns {Object} - The migrated recurrence object
 */
function migrateRecurrenceStructure(recurrence) {
    if (!recurrence) return null;
    
    // If already has new format (has dayOfMonth or dayOfWeek fields), skip
    if (recurrence.dayOfMonth !== undefined || recurrence.dayOfWeek !== undefined) {
        return recurrence;
    }
    
    // Extract day from startDate string directly - no Date parsing to avoid timezone issues
    let dayOfMonth = null;
    if (recurrence.startDate) {
        // Parse "YYYY-MM-DD" format directly
        const parts = recurrence.startDate.split('-');
        if (parts.length === 3) {
            dayOfMonth = parseInt(parts[2], 10);
        }
    }
    
    // Map old recurrence type IDs to new ones based on the name
    let newRecurrenceType = recurrence.recurrenceType;
    if (recurrence.recurrenceType) {
        const oldName = recurrence.recurrenceType.name;
        
        // Map old recurrence types to new ones
        if (oldName === 'Monthly') {
            newRecurrenceType = {
                id: 4,
                name: 'Monthly - Day of Month'
            };
        } else if (oldName === 'Weekly') {
            newRecurrenceType = {
                id: 2,
                name: 'Weekly'
            };
        } else if (oldName === 'One Time') {
            newRecurrenceType = {
                id: 1,
                name: 'One Time'
            };
        } else if (oldName === 'Daily') {
            newRecurrenceType = {
                id: 6,
                name: 'Daily'
            };
        } else if (oldName === 'Yearly') {
            newRecurrenceType = {
                id: 7,
                name: 'Yearly'
            };
        } else if (oldName === 'Quarterly') {
            newRecurrenceType = {
                id: 5,
                name: 'Quarterly'
            };
        }
        // If no match found, keep the original
    }
    
    // Remove old fields and add new ones
    const { pattern, frequency, ...baseRecurrence } = recurrence;
    
    return {
        ...baseRecurrence,
        recurrenceType: newRecurrenceType,
        dayOfWeek: null,
        dayOfMonth: dayOfMonth,
        weekOfMonth: null,
        dayOfWeekInMonth: null,
        dayOfQuarter: null,
        month: null,
        dayOfYear: null,
        customDates: null,
        id: null
    };
}

/**
 * Migrate account fields to new format
 * - Rename 'balance' to 'startingBalance'
 * - Ensure currency is always an object with id and name, never null
 * @param {Object} scenario - The scenario object to migrate
 * @returns {Object} - The migrated scenario
 */
export function migrateAccountBalanceField(scenario) {
    if (!scenario.accounts) return scenario;

    
    scenario.accounts = scenario.accounts.map((account, idx) => {
        const updated = { ...account };
        let migrated = false;
        
        // Ensure startingBalance exists (balance is now deprecated)
        if (updated.startingBalance === undefined && updated.startingBalance !== null) {
            updated.startingBalance = 0;
        }
        if (updated.balance !== undefined) {
            delete updated.balance;
        }
        
        // Ensure currency is always an object, default to ZAR if null
        if (!updated.currency || updated.currency === null) {
            updated.currency = {
                id: 1,
                name: "ZAR"
            };
            migrated = true;
        }
        
        if (migrated) {
        }
        
        return updated;
    });

    return scenario;
}

// Migration from old repo root file removed - users manually copy app-data.json.backup to userData/assets for testing
