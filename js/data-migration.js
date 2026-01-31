// data-migration.js
// One-time migration script to convert old data format to new unified transactions
// NOTE: Only runs in Electron, not in web

import { getAppDataPath } from './app-paths.js';
import { parseDateOnly } from './date-utils.js';
import { getFsPromises, getPathModule, isElectronEnv } from './core/platform.js';

const isElectron = isElectronEnv();
const fs = isElectron ? getFsPromises() : null;
const path = isElectron ? getPathModule() : null;

let dataPath, oldDataPath;
if (isElectron && path) {
  dataPath = getAppDataPath();
  oldDataPath = path.join(path.dirname(path.dirname(dataPath)), 'app-data.json');
}

/**
 * Migrate scenario data from old plannedTransactions/actualTransactions format to unified transactions
 * Old format: plannedTransactions and actualTransactions arrays with debitAccount/creditAccount
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

    // Convert planned transactions - copy exactly, preserving debitAccount/creditAccount
    // (they will be converted in migrateToUnifiedAccountModel)
    if (scenario.plannedTransactions) {
        scenario.plannedTransactions.forEach(planned => {
            transactions.push({
                ...planned
            });
        });
    }

    // Convert actual transactions - copy exactly, preserving debitAccount/creditAccount
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
 * Run migration on all scenarios in the data store
 * @returns {Promise<void>}
 */
export async function migrateAllScenarios() {
    if (!isElectron) {
        console.log('[Migration] Skipping migration in web environment');
        return;
    }
    if (!fs || !dataPath) {
        throw new Error('[Migration] Filesystem unavailable for migration');
    }
    try {
        // Read current data
        const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
        
        console.log('[Migration] Current data migrationVersion:', data.migrationVersion);
        
        // Check if migration is needed
        if (data.migrationVersion >= 3) {
            console.log('[Migration] Data already at version 3, skipping migration');
            return;
        }
        
        console.log('[Migration] Running migrations on userData app-data.json...');
        console.log('[Migration] Found', data.scenarios?.length || 0, 'scenarios');
        
        if (data.scenarios) {
            data.scenarios = data.scenarios.map((scenario, idx) => {
                console.log(`[Migration] Migrating scenario ${idx + 1}: ${scenario.name}`);
                // Apply all migrations in sequence
                scenario = migrateScenarioTransactions(scenario);
                scenario = ensureBudgetsArray(scenario);
                scenario = migrateAccountBalanceField(scenario);
                scenario = migrateToUnifiedAccountModel(scenario);
                return scenario;
            });
        }
        
        // Mark migration as complete (v3 includes unified account model)
        data.migrationVersion = 3;
        
        // Write back
        await fs.writeFile(dataPath, JSON.stringify(data, null, 2), 'utf8');
        console.log('[Migration] Successfully migrated userData app-data.json');
        console.log('[Migration] Migration version set to:', data.migrationVersion);
    } catch (err) {
        console.error('[Migration] Error in migrateAllScenarios:', err);
        throw err;
    }
}

/**
 * Check if migration is needed
 * @returns {Promise<boolean>}
 */
export async function needsMigration() {
    if (!isElectron) {
        console.log('[Migration] No migration needed in web environment');
        return false;
    }
    if (!fs || !dataPath) {
        console.error('[Migration] Filesystem unavailable for migration check');
        return false;
    }
    try {
        const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
        return !data.migrationVersion || data.migrationVersion < 3;
    } catch (err) {
        console.error('[Migration] Failed to check migration status:', err);
        return false;
    }
}

/**
 * Migrate from old debit/credit account format to new primary/secondary account format
 * Old format: debitAccount and creditAccount objects
 * New format: primaryAccountId, secondaryAccountId, transactionTypeId
 * Also migrates recurrence structure and adds status field
 * @param {Object} scenario - The scenario object to migrate
 * @returns {Object} - The migrated scenario
 */
export function migrateToUnifiedAccountModel(scenario) {
    if (!scenario.transactions) return scenario;

    scenario.transactions = scenario.transactions.map(tx => {
        const updated = { ...tx };
        
        // Skip if already migrated (has primaryAccountId)
        if (updated.primaryAccountId !== undefined && updated.secondaryAccountId !== undefined) {
            // Still need to check recurrence and status
            updated.recurrence = migrateRecurrenceStructure(updated.recurrence);
            if (!updated.status) {
                updated.status = {
                    name: "planned",
                    actualAmount: null,
                    actualDate: null
                };
            }
            return updated;
        }

        // Skip if no old format fields
        if (!tx.debitAccount && !tx.creditAccount) {
            return updated;
        }

        // Extract account IDs from old format
        const debitAccountId = tx.debitAccount?.id || null;
        const creditAccountId = tx.creditAccount?.id || null;

        // Determine transaction type based on account types
        let primaryAccountId, secondaryAccountId, transactionTypeId;

        const debitAccount = scenario.accounts?.find(a => a.id === debitAccountId);
        const creditAccount = scenario.accounts?.find(a => a.id === creditAccountId);

        const debitType = debitAccount?.type?.name;
        const creditType = creditAccount?.type?.name;

        // Money In: Debit is Income, Credit is Asset/Liability
        if (debitType === 'Income') {
            primaryAccountId = creditAccountId;
            secondaryAccountId = debitAccountId;
            transactionTypeId = 1; // Money In
        }
        // Money Out: Debit is Expense, Credit is Asset/Liability
        else if (debitType === 'Expense') {
            primaryAccountId = creditAccountId;
            secondaryAccountId = debitAccountId;
            transactionTypeId = 2; // Money Out
        }
        // Transfer or other: use credit as primary
        else {
            primaryAccountId = creditAccountId;
            secondaryAccountId = debitAccountId;
            // Use amount sign to determine type
            transactionTypeId = (tx.amount >= 0) ? 1 : 2;
        }

        // Create new transaction preserving ALL original fields except debitAccount/creditAccount
        const { debitAccount: _, creditAccount: __, ...rest } = tx;

        return {
            ...rest,
            primaryAccountId,
            secondaryAccountId,
            transactionTypeId,
            recurrence: migrateRecurrenceStructure(rest.recurrence),
            status: rest.status || {
                name: "planned",
                actualAmount: null,
                actualDate: null
            }
        };
    });

    return scenario;
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

    console.log(`[Migration] Migrating ${scenario.accounts.length} accounts for scenario: ${scenario.name}`);
    
    scenario.accounts = scenario.accounts.map((account, idx) => {
        const updated = { ...account };
        let migrated = false;
        
        // Migrate balance to startingBalance if needed
        if (account.balance !== undefined && account.startingBalance === undefined) {
            console.log(`[Migration]   Account ${idx} (${account.name}): balance ${account.balance} -> startingBalance`);
            updated.startingBalance = account.balance;
            delete updated.balance;
            migrated = true;
        }
        
        // Ensure currency is always an object, default to ZAR if null
        if (!updated.currency || updated.currency === null) {
            console.log(`[Migration]   Account ${idx} (${account.name}): currency null -> ZAR`);
            updated.currency = {
                id: 1,
                name: "ZAR"
            };
            migrated = true;
        }
        
        if (migrated) {
            console.log(`[Migration]   Account ${idx} migrated successfully`);
        }
        
        return updated;
    });

    return scenario;
}

// Migration from old repo root file removed - users manually copy app-data.json.backup to userData/assets for testing
