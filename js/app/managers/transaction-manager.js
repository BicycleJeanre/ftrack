// transaction-manager.js
// Unified business logic for transaction operations

import * as DataStore from '../services/storage-service.js';
import { allocateNextId } from '../../shared/app-data-utils.js';
import {
    dispatchPlanChanged,
    markProjectionStale
} from './projection-freshness.js';

const VALID_SPLIT_STRATEGIES = new Set(['auto_rate', 'top_down', 'manual']);
const VALID_INTEREST_SOURCES = new Set(['account_rate', 'custom_rate', 'manual', 'none']);

function occurrenceStatus(occurrence = {}) {
    return String(occurrence?.status || 'planned').trim().toLowerCase();
}

function isHistoricalOccurrence(occurrence = {}) {
    return (
        occurrenceStatus(occurrence) === 'actual' ||
        occurrenceStatus(occurrence) === 'skipped' ||
        occurrence?.baselineAmount !== null &&
        occurrence?.baselineAmount !== undefined
    );
}

function reconcileRemovedRuleOccurrences(scenario, nextTransactions) {
    const nextIds = new Set(
        (Array.isArray(nextTransactions) ? nextTransactions : [])
            .map((transaction) => Number(transaction?.id))
            .filter(Boolean)
    );
    const removedIds = new Set(
        (Array.isArray(scenario?.transactions) ? scenario.transactions : [])
            .map((transaction) => Number(transaction?.id))
            .filter((id) => id && !nextIds.has(id))
    );
    if (!removedIds.size) return;

    const linkedOccurrences = (scenario?.transactionOccurrences || []).filter(
        (occurrence) => removedIds.has(Number(occurrence?.sourceTransactionId))
    );
    const protectedOccurrences = linkedOccurrences.filter(isHistoricalOccurrence);
    if (protectedOccurrences.length) {
        const sourceIds = [...new Set(
            protectedOccurrences.map((occurrence) => Number(occurrence.sourceTransactionId))
        )].sort((left, right) => left - right);
        const error = new Error(
            `Cannot remove transaction rule${sourceIds.length === 1 ? '' : 's'} ` +
            `${sourceIds.join(', ')} because recorded actual, skipped, or frozen baseline history depends on it.`
        );
        error.code = 'rule-history-protected';
        error.details = {
            sourceTransactionIds: sourceIds,
            occurrenceKeys: protectedOccurrences.map((occurrence) => occurrence.occurrenceKey)
        };
        throw error;
    }

    scenario.transactionOccurrences = (scenario?.transactionOccurrences || []).filter(
        (occurrence) => !removedIds.has(Number(occurrence?.sourceTransactionId))
    );
}

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
            actualAmount: txn.actualAmount ?? null,
            actualDate: txn.actualDate ?? null
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
        tags: txn.tags || [],
        seriesRootId: txn.seriesRootId ?? null,
        supersedesTransactionId: txn.supersedesTransactionId ?? null,
        activeFrom: txn.activeFrom ?? txn.recurrence?.startDate ?? txn.effectiveDate ?? null,
        activeTo: txn.activeTo ?? txn.recurrence?.endDate ?? null,
        ...(txn.promotedFromOccurrenceKey
            ? { promotedFromOccurrenceKey: String(txn.promotedFromOccurrenceKey) }
            : {}),
        ...(txn.createdAt ? { createdAt: txn.createdAt } : {}),
        ...(txn.updatedAt ? { updatedAt: txn.updatedAt } : {})
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
        tags: Array.isArray(rawSet.tags) ? rawSet.tags : [],
        seriesRootId: rawSet.seriesRootId ?? null,
        supersedesTransactionGroupId: rawSet.supersedesTransactionGroupId ?? null,
        activeFrom: rawSet.activeFrom ?? rawSet.recurrence?.startDate ?? rawSet.effectiveDate ?? null,
        activeTo: rawSet.activeTo ?? rawSet.recurrence?.endDate ?? null,
        ...(rawSet.createdAt ? { createdAt: rawSet.createdAt } : {}),
        ...(rawSet.updatedAt ? { updatedAt: rawSet.updatedAt } : {})
    };
}

/**
 * Save all transactions for a scenario
 * @param {number} scenarioId - The scenario ID
 * @param {Array} transactions - Array of transaction objects
 * @returns {Promise<void>}
 */
export async function saveAll(scenarioId, transactions) {
    const result = await DataStore.transaction(async (data) => {
        const scenarioIndex = data.scenarios.findIndex(s => s.id === scenarioId);

        if (scenarioIndex === -1) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }

        let nextId = allocateNextId(transactions);

        const scenario = data.scenarios[scenarioIndex];
        const nextTransactions = transactions.map((txn) => {
            const id = (!txn.id || txn.id === 0) ? nextId++ : txn.id;
            return normalizeCanonicalTransactionRecord(txn, id);
        });
        reconcileRemovedRuleOccurrences(scenario, nextTransactions);
        scenario.transactions = nextTransactions;
        markProjectionStale(
            scenario,
            'Transaction rules changed'
        );

        return data;
    });
    dispatchPlanChanged(scenarioId);
    return result;
}

/**
 * Create a new transaction using canonical normalization (matches saveAll rules).
 * @param {number} scenarioId - The scenario ID
 * @param {Object} txnData - The transaction data
 * @returns {Promise<Object>} - Full app-data after creation (extract last transaction from scenario)
 */
export async function create(scenarioId, txnData) {
    const result = await DataStore.transaction(async (data) => {
        const scenario = data.scenarios.find(s => s.id === scenarioId);
        if (!scenario) throw new Error(`Scenario ${scenarioId} not found`);
        if (!scenario.transactions) scenario.transactions = [];

        const newTxn = normalizeCanonicalTransactionRecord(txnData, allocateNextId(scenario.transactions));

        scenario.transactions.push(newTxn);
        markProjectionStale(scenario, 'Transaction rule created');
        return data;
    });
    dispatchPlanChanged(scenarioId);
    return result;
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
    const result = await DataStore.transaction(async (data) => {
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

        reconcileRemovedRuleOccurrences(scenario, nextTransactions);
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
        markProjectionStale(
            scenario,
            removeOnly ? 'Split transaction rule removed' : 'Split transaction rules changed'
        );

        return data;
    });
    dispatchPlanChanged(scenarioId);
    return result;
}
