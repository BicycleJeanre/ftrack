// account-manager.js
// Business logic for account operations within scenarios

import * as DataStore from '../core/data-store.js';
import { deleteAccount } from '../data-manager.js';
import { formatDateOnly } from '../date-utils.js';

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
        
        // Assign IDs to new accounts (id = 0 or undefined)
        const maxId = accounts.length > 0 && accounts.some(a => a.id)
            ? Math.max(...accounts.filter(a => a.id).map(a => a.id))
            : 0;
        
        let nextId = maxId + 1;
        
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
        
        // Generate new ID
        const maxId = scenario.accounts.length > 0
            ? Math.max(...scenario.accounts.map(a => a.id || 0))
            : 0;
        
        const newAccount = {
            id: maxId + 1,
            name: accountData.name || 'New Account',
            type: accountData.type || { id: 1, name: 'Asset' },
            currency: accountData.currency || { id: 1, name: 'ZAR' },
            balance: accountData.balance || 0,
            openDate: accountData.openDate || formatDateOnly(new Date()),
            periodicChange: accountData.periodicChange || null,
            ...accountData
        };
        
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
    return await deleteAccount(scenarioId, accountId);
}
