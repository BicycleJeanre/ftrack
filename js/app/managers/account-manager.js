// account-manager.js
// Business logic for account operations within scenarios

import * as DataStore from '../services/storage-service.js';
import { formatDateOnly } from '../../shared/date-utils.js';
import { allocateNextId } from '../../shared/app-data-utils.js';

/**
 * Get all accounts for a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<Array>} - Array of accounts
 */
export async function getAll(scenarioId) {
    const data = await DataStore.read();
    const scenario = data.scenarios?.find(s => s.id === scenarioId);
    return scenario?.accounts || [];
}

/**
 * Get a specific account by ID
 * @param {number} scenarioId - The scenario ID
 * @param {number} accountId - The account ID
 * @returns {Promise<Object|null>} - The account or null
 */
export async function getById(scenarioId, accountId) {
    const accounts = await getAll(scenarioId);
    return accounts.find(a => a.id === accountId) || null;
}

/**
 * Save all accounts for a scenario (replaces existing)
 * @param {number} scenarioId - The scenario ID
 * @param {Array} accounts - Array of account objects
 * @returns {Promise<void>}
 */
export async function saveAll(scenarioId, accounts) {
    return await DataStore.transaction(async (data) => {
        const scenarioIndex = data.scenarios.findIndex(s => s.id === scenarioId);
        
        if (scenarioIndex === -1) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        
        let nextId = allocateNextId(accounts);
        
        data.scenarios[scenarioIndex].accounts = accounts.map(account => {
            if (!account.id || account.id === 0) {
                return { ...account, id: nextId++ };
            }
            return account;
        });
        
        return data;
    });
}

/**
 * Create a new account
 * @param {number} scenarioId - The scenario ID
 * @param {Object} accountData - The account data
 * @returns {Promise<Object>} - The created account
 */
export async function create(scenarioId, accountData) {
    return await DataStore.transaction(async (data) => {
        const scenarioIndex = data.scenarios.findIndex(s => s.id === scenarioId);
        
        if (scenarioIndex === -1) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        
        const scenario = data.scenarios[scenarioIndex];
        if (!scenario.accounts) {
            scenario.accounts = [];
        }
        
        const newAccount = {
            id: allocateNextId(scenario.accounts),
            name: accountData.name || 'New Account',
            type: accountData.type || { id: 1, name: 'Asset' },
            currency: accountData.currency || { id: 1, name: 'ZAR' },
            startingBalance: accountData.startingBalance || 0,
            openDate: accountData.openDate || formatDateOnly(new Date()),
            periodicChange: accountData.periodicChange || null,
            ...accountData
        };

        // Ensure goal fields persist consistently for new accounts.
        // (Used by goal-based scenarios and should be stable regardless of where the account was created.)
        if (newAccount.goalAmount === undefined || newAccount.goalAmount === '') {
            newAccount.goalAmount = 0;
        }
        if (newAccount.goalDate === undefined) {
            newAccount.goalDate = null;
        }
        
        scenario.accounts.push(newAccount);
        
        return data;
    });
}

/**
 * Update an existing account
 * @param {number} scenarioId - The scenario ID
 * @param {number} accountId - The account ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function update(scenarioId, accountId, updates) {
    return await DataStore.transaction(async (data) => {
        const scenario = data.scenarios.find(s => s.id === scenarioId);
        
        if (!scenario) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        
        const accountIndex = scenario.accounts.findIndex(a => a.id === accountId);
        
        if (accountIndex === -1) {
            throw new Error(`Account ${accountId} not found`);
        }

        // If a goal date is being set, ensure goalAmount is persisted as a number (default 0)
        // even when the user doesn't touch the goal amount input.
        if (updates && Object.prototype.hasOwnProperty.call(updates, 'goalDate')) {
            const nextGoalDate = updates.goalDate;
            const nextGoalAmount = updates.goalAmount;
            const isSettingGoalDate = nextGoalDate !== null && nextGoalDate !== undefined && String(nextGoalDate) !== '';
            const goalAmountBlank = nextGoalAmount === null || nextGoalAmount === undefined || nextGoalAmount === '';
            if (isSettingGoalDate && goalAmountBlank) {
                updates = { ...updates, goalAmount: 0 };
            }
        }
        
        scenario.accounts[accountIndex] = {
            ...scenario.accounts[accountIndex],
            ...updates
        };
        
        return data;
    });
}

/**
 * Delete an account
 * @param {number} scenarioId - The scenario ID
 * @param {number} accountId - The account ID
 * @returns {Promise<void>}
 */
export async function remove(scenarioId, accountId) {
    return await DataStore.transaction(async (data) => {
        const scenarioIndex = data.scenarios.findIndex(s => s.id === scenarioId);
        if (scenarioIndex === -1) throw new Error(`Scenario ${scenarioId} not found`);

        const scenario = data.scenarios[scenarioIndex];
        const accountIdNum = Number(accountId);

        // Cascade delete: Remove all transactions that reference this account (primary or secondary)
        if (scenario.transactions) {
            scenario.transactions = scenario.transactions.filter(tx => {
                const hasPrimary = tx.primaryAccountId && Number(tx.primaryAccountId) === accountIdNum;
                const hasSecondary = tx.secondaryAccountId && Number(tx.secondaryAccountId) === accountIdNum;
                return !hasPrimary && !hasSecondary;
            });
        }

        // Delete the account
        scenario.accounts = (scenario.accounts || []).filter(a => a.id !== accountIdNum);
        return data;
    });
}
/**
 * Update account goal parameters
 * @param {number} scenarioId - The scenario ID
 * @param {number} accountId - The account ID
 * @param {number|null} goalAmount - Target goal amount (null to clear)
 * @param {string|null} goalDate - Target goal date (null to clear)
 * @returns {Promise<void>}
 */
export async function updateGoal(scenarioId, accountId, goalAmount, goalDate) {
    return await update(scenarioId, accountId, { goalAmount, goalDate });
}