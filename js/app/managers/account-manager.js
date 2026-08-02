// account-manager.js
// Business logic for account operations within scenarios

import * as DataStore from '../services/storage-service.js';
import { formatDateOnly } from '../../shared/date-utils.js';
import { allocateNextId } from '../../shared/app-data-utils.js';
import {
    dispatchPlanChanged,
    markProjectionStale
} from './projection-freshness.js';

function occurrenceStatus(occurrence = {}) {
    return String(occurrence?.status || 'planned').trim().toLowerCase();
}

function isHistoricalOccurrence(occurrence = {}) {
    const status = occurrenceStatus(occurrence);
    return (
        status === 'actual' ||
        status === 'skipped' ||
        (occurrence?.baselineAmount !== null &&
            occurrence?.baselineAmount !== undefined)
    );
}

function recordReferencesAccount(record, accountId) {
    return (
        Number(record?.primaryAccountId) === accountId ||
        Number(record?.secondaryAccountId) === accountId ||
        Number(record?.baselinePrimaryAccountId) === accountId ||
        Number(record?.baselineSecondaryAccountId) === accountId
    );
}

function splitSetReferencesAccount(splitSet, accountId) {
    return (
        Number(splitSet?.payingAccountId) === accountId ||
        Number(splitSet?.targetAccountId) === accountId ||
        (splitSet?.components || []).some(
            (component) =>
                Number(component?.accountId ?? component?.secondaryAccountId) === accountId
        )
    );
}

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
 * Save all accounts for a scenario (replaces existing)
 * @param {number} scenarioId - The scenario ID
 * @param {Array} accounts - Array of account objects
 * @returns {Promise<void>}
 */
export async function saveAll(scenarioId, accounts) {
    const result = await DataStore.transaction(async (data) => {
        const scenarioIndex = data.scenarios.findIndex(s => s.id === scenarioId);
        
        if (scenarioIndex === -1) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        const scenario = data.scenarios[scenarioIndex];
        const nextExistingIds = new Set(
            (accounts || [])
                .map((account) => Number(account?.id))
                .filter(Boolean)
        );
        const removedIds = (scenario.accounts || [])
            .map((account) => Number(account?.id))
            .filter((id) => id && !nextExistingIds.has(id));
        if (removedIds.length) {
            const error = new Error(
                `Accounts ${removedIds.join(', ')} cannot be removed through a bulk save. ` +
                'Remove each account explicitly so planning and history references can be checked.'
            );
            error.code = 'account-removal-requires-command';
            throw error;
        }
        
        let nextId = allocateNextId(accounts);
        
        scenario.accounts = accounts.map(account => {
            if (!account.id || account.id === 0) {
                return { ...account, id: nextId++ };
            }
            return account;
        });
        markProjectionStale(scenario, 'Accounts changed');
        
        return data;
    });
    dispatchPlanChanged(scenarioId);
    return result;
}

/**
 * Create a new account
 * @param {number} scenarioId - The scenario ID
 * @param {Object} accountData - The account data
 * @returns {Promise<Object>} - The created account
 */
export async function create(scenarioId, accountData) {
    const result = await DataStore.transaction(async (data) => {
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
            ...accountData,
            interestAccountId: accountData.interestAccountId ?? null,
            interestPostingDirection: accountData.interestPostingDirection ?? null
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
        markProjectionStale(scenario, 'Account created');
        
        return data;
    });
    dispatchPlanChanged(scenarioId);
    return result;
}

/**
 * Update an existing account
 * @param {number} scenarioId - The scenario ID
 * @param {number} accountId - The account ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function update(scenarioId, accountId, updates) {
    const result = await DataStore.transaction(async (data) => {
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
        markProjectionStale(scenario, 'Account changed');
        
        return data;
    });
    dispatchPlanChanged(scenarioId);
    return result;
}

/**
 * Delete an account
 * @param {number} scenarioId - The scenario ID
 * @param {number} accountId - The account ID
 * @returns {Promise<void>}
 */
export async function remove(scenarioId, accountId) {
    const result = await DataStore.transaction(async (data) => {
        const scenarioIndex = data.scenarios.findIndex(s => s.id === scenarioId);
        if (scenarioIndex === -1) throw new Error(`Scenario ${scenarioId} not found`);

        const scenario = data.scenarios[scenarioIndex];
        const accountIdNum = Number(accountId);
        if (!(scenario.accounts || []).some((account) => Number(account?.id) === accountIdNum)) {
            throw new Error(`Account ${accountId} not found`);
        }

        const splitGroupIds = new Set(
            (scenario.splitTransactionSets || [])
                .filter((splitSet) => splitSetReferencesAccount(splitSet, accountIdNum))
                .map((splitSet) => String(splitSet?.id || '').trim())
                .filter(Boolean)
        );
        const removedTransactionIds = new Set(
            (scenario.transactions || [])
                .filter(
                    (transaction) =>
                        recordReferencesAccount(transaction, accountIdNum) ||
                        splitGroupIds.has(String(transaction?.transactionGroupId || '').trim())
                )
                .map((transaction) => Number(transaction?.id))
                .filter(Boolean)
        );
        const protectedOccurrences = (scenario.transactionOccurrences || []).filter(
            (occurrence) =>
                isHistoricalOccurrence(occurrence) &&
                (
                    recordReferencesAccount(occurrence, accountIdNum) ||
                    removedTransactionIds.has(Number(occurrence?.sourceTransactionId)) ||
                    splitGroupIds.has(String(occurrence?.transactionGroupId || '').trim())
                )
        );
        if (protectedOccurrences.length) {
            const error = new Error(
                `Account ${accountIdNum} cannot be removed because recorded actual, ` +
                'skipped, or frozen baseline history depends on it.'
            );
            error.code = 'account-history-protected';
            error.details = {
                accountId: accountIdNum,
                occurrenceKeys: protectedOccurrences.map(
                    (occurrence) => occurrence.occurrenceKey
                )
            };
            throw error;
        }

        scenario.transactions = (scenario.transactions || []).filter(
            (transaction) => !removedTransactionIds.has(Number(transaction?.id))
        );
        scenario.transactionOccurrences = (scenario.transactionOccurrences || []).filter(
            (occurrence) =>
                !recordReferencesAccount(occurrence, accountIdNum) &&
                !removedTransactionIds.has(Number(occurrence?.sourceTransactionId)) &&
                !splitGroupIds.has(String(occurrence?.transactionGroupId || '').trim())
        );
        scenario.splitTransactionSets = (scenario.splitTransactionSets || []).filter(
            (splitSet) => !splitGroupIds.has(String(splitSet?.id || '').trim())
        );
        scenario.accountGroups = (scenario.accountGroups || []).map((group) => ({
            ...group,
            accountIds: (group?.accountIds || []).filter(
                (memberId) => Number(memberId) !== accountIdNum
            )
        }));
        scenario.accounts = (scenario.accounts || []).map((account) => (
            Number(account?.interestAccountId) === accountIdNum
                ? { ...account, interestAccountId: null }
                : account
        ));

        scenario.accounts = scenario.accounts.filter(
            (account) => Number(account?.id) !== accountIdNum
        );
        markProjectionStale(scenario, 'Account removed');
        return data;
    });
    dispatchPlanChanged(scenarioId);
    return result;
}
