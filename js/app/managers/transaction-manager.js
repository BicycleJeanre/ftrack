// transaction-manager.js
// Unified business logic for transaction operations

import * as DataStore from '../services/storage-service.js';
import { allocateNextId } from '../../shared/app-data-utils.js';

const VALID_SPLIT_STRATEGIES = new Set(['auto_rate', 'top_down', 'manual']);
const VALID_INTEREST_SOURCES = new Set(['account_rate', 'custom_rate', 'manual', 'none']);

function normalizeStatus(txn = {}) {
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

    return status;
}

function normalizeCanonicalTransactionRecord(txn = {}, id) {
    const transactionTypeId = txn.transactionTypeId ?? 2; // Default to Money Out
    const primaryAccountId = txn.primaryAccountId ?? null;
    const secondaryAccountId = txn.secondaryAccountId ?? null;
    const transactionGroupId = txn.transactionGroupId ?? null;
    const transactionGroupRole = txn.transactionGroupRole ?? null;
    const transactionGroupAccountGroupId = Number(txn.transactionGroupAccountGroupId || 0) || null;
    const status = normalizeStatus(txn);
    const rawAmount = txn.amount || 0;
    const normalizedAmount = Math.abs(rawAmount);

    return {
        id,
        primaryAccountId,
        secondaryAccountId,
        transactionGroupId,
        transactionGroupRole,
        transactionGroupAccountGroupId,
        transactionTypeId,
        amount: normalizedAmount,
        effectiveDate: txn.effectiveDate || txn.plannedDate || txn.recurrence?.startDate || null,
        description: txn.description || '',
        recurrence: txn.recurrence || null,
        periodicChange: txn.periodicChange || null,
        status,
        tags: txn.tags || []
    };
}

function normalizeSplitTransactionSet(rawSet) {
    if (!rawSet || typeof rawSet !== 'object') return null;
    const id = String(rawSet.id || rawSet.transactionGroupId || '').trim();
    if (!id) return null;

    const strategy = VALID_SPLIT_STRATEGIES.has(String(rawSet.strategy || '').trim())
        ? String(rawSet.strategy).trim()
        : 'manual';
    const interestSource = VALID_INTEREST_SOURCES.has(String(rawSet.interestSource || '').trim())
        ? String(rawSet.interestSource).trim()
        : 'none';

    const toPositiveNumber = (value) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        const abs = Math.abs(n);
        return Object.is(abs, -0) ? 0 : abs;
    };

    const toOptionalId = (value) => {
        const idVal = Number(value || 0);
        return Number.isFinite(idVal) && idVal > 0 ? idVal : null;
    };

    const components = Array.isArray(rawSet.components)
        ? rawSet.components.map((component, index) => {
            const role = String(component?.role || '').trim().toLowerCase() || 'adhoc';
            const accountId = toOptionalId(component?.accountId);
            const transactionTypeId = Number(component?.transactionTypeId || 2) === 1 ? 1 : 2;
            const accountGroupId = toOptionalId(component?.accountGroupId);
            const amountModeRaw = String(component?.amountMode || '').trim().toLowerCase();
            const amountMode =
                amountModeRaw === 'derived' || amountModeRaw === 'remainder' || amountModeRaw === 'fixed'
                    ? amountModeRaw
                    : 'fixed';
            const value = toPositiveNumber(component?.value ?? component?.amount ?? null);
            return {
                role,
                accountId,
                transactionTypeId,
                accountGroupId,
                description: String(component?.description || '').trim(),
                recurrence: component?.recurrence || null,
                periodicChange: component?.periodicChange || null,
                amountMode,
                value,
                order: Number.isFinite(Number(component?.order)) ? Number(component.order) : index
            };
        })
        : [];

    return {
        id,
        description: String(rawSet.description || '').trim(),
        payingAccountId: toOptionalId(rawSet.payingAccountId ?? rawSet.primaryAccountId),
        effectiveDate: rawSet.effectiveDate || null,
        strategy,
        targetAccountId: toOptionalId(rawSet.targetAccountId),
        interestSource,
        customRate: toPositiveNumber(rawSet.customRate),
        totalAmount: toPositiveNumber(rawSet.totalAmount) || 0,
        components,
        recurrence: rawSet.recurrence || null,
        tags: Array.isArray(rawSet.tags) ? rawSet.tags : []
    };
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

        data.scenarios[scenarioIndex].transactions = transactions.map((txn) => {
            const id = (!txn.id || txn.id === 0) ? nextId++ : txn.id;
            return normalizeCanonicalTransactionRecord(txn, id);
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

        const newTxn = normalizeCanonicalTransactionRecord(txnData, allocateNextId(scenario.transactions));

        scenario.transactions.push(newTxn);
        return data;
    });
}

/**
 * Atomically replace/create all child transactions for a split transaction set and upsert split-set metadata.
 * @param {number} scenarioId
 * @param {Object} payload
 * @param {Object} payload.splitSet
 * @param {Array} payload.componentTransactions
 * @param {string|null} payload.replaceTransactionGroupId
 * @param {boolean} payload.removeOnly
 * @returns {Promise<Object>}
 */
export async function upsertSplitTransactionSet(
    scenarioId,
    { splitSet = null, componentTransactions = [], replaceTransactionGroupId = null, removeOnly = false } = {}
) {
    return await DataStore.transaction(async (data) => {
        const scenario = data.scenarios.find((s) => s.id === scenarioId);
        if (!scenario) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }

        const normalizedSet = normalizeSplitTransactionSet(splitSet);
        const groupIdFromSet = normalizedSet?.id || null;
        const groupIdToReplace = String(replaceTransactionGroupId || groupIdFromSet || '').trim() || null;

        const existingTransactions = Array.isArray(scenario.transactions) ? scenario.transactions : [];
        let nextTransactions = existingTransactions;
        if (groupIdToReplace) {
            nextTransactions = existingTransactions.filter(
                (txn) => String(txn?.transactionGroupId || '') !== groupIdToReplace
            );
        }

        if (!removeOnly) {
            let nextId = allocateNextId(nextTransactions);
            const normalizedComponents = (Array.isArray(componentTransactions) ? componentTransactions : []).map((txn) => {
                const id = (!txn.id || txn.id === 0) ? nextId++ : txn.id;
                return normalizeCanonicalTransactionRecord(txn, id);
            });
            nextTransactions = [...nextTransactions, ...normalizedComponents];
        }

        scenario.transactions = nextTransactions;

        const existingSets = Array.isArray(scenario.splitTransactionSets) ? scenario.splitTransactionSets : [];
        let nextSets = existingSets;
        if (groupIdToReplace) {
            nextSets = existingSets.filter((set) => String(set?.id || '') !== groupIdToReplace);
        }
        if (!removeOnly && normalizedSet) {
            nextSets.push(normalizedSet);
        }
        scenario.splitTransactionSets = nextSets;

        return data;
    });
}
