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
 *   occurrenceKey: string | null,          // Stable generated/manual occurrence identity
 *   scheduledDate: string,                 // Immutable generated match date
 *   plannedDate: string | null,            // Optional occurrence-only reschedule
 *   baselineAmount: number | null,          // Frozen comparison value
 *   plannedAmount: number,                 // Current plan value
 *   origin: string,                        // 'generated', 'manual', or 'migrated'
 *   isOverride: boolean,                   // Whether stored plan fields override the source rule
 *   periodicChange: object | null,        // Periodic change/escalation data
 *   status: {
 *     name: string,                       // 'planned' or 'actual'
 *     actualAmount: number | null,        // Actual amount if status is actual
 *     actualDate: string | null           // Actual date if status is actual
 *   },
 *   tags: string[]                        // Associated tags
 * }
 * 
 * UI transforms budgets to include resolved objects (primaryAccount, secondaryAccount, etc.)
 * but these are NEVER persisted to disk—only IDs are stored.
 */


import * as DataStore from '../services/storage-service.js';
import { formatDateOnly, parseDateOnly } from '../../shared/date-utils.js';
import { allocateNextId } from '../../shared/app-data-utils.js';
import { getRecurrenceDescription } from '../../domain/calculations/recurrence-utils.js';
import {
    createLinkedOccurrenceKey,
    resolveScenarioOccurrences
} from '../../domain/queries/resolve-scenario-occurrences.js';
import { getScenarioBudgetWindowConfig } from '../../shared/app-data-utils.js';

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

        const existingBudgetsById = new Map(
            (data.scenarios[scenarioIndex].budgets || [])
                .map((budget) => [Number(budget?.id || 0), budget])
                .filter(([id]) => id > 0)
        );
        let nextId = allocateNextId(budgets);

        data.scenarios[scenarioIndex].budgets = budgets.map(budget => {
            const hasValue = (value) => value !== null && value !== undefined && value !== '';
            const assertFiniteAmount = (value, field) => {
                if (!hasValue(value)) return;
                if (!Number.isFinite(Number(value))) {
                    throw new TypeError(`${field} must be a finite number`);
                }
            };
            assertFiniteAmount(budget.amount, 'Budget amount');
            assertFiniteAmount(budget.plannedAmount, 'Budget plannedAmount');
            assertFiniteAmount(budget.baselineAmount, 'Budget baselineAmount');
            assertFiniteAmount(budget.actualAmount, 'Budget actualAmount');
            assertFiniteAmount(budget.status?.actualAmount, 'Budget status.actualAmount');
            assertFiniteAmount(budget.capitalAmount, 'Budget capitalAmount');
            assertFiniteAmount(budget.interestAmount, 'Budget interestAmount');
            const existingBudget = existingBudgetsById.get(Number(budget?.id || 0)) || null;
            // Normalize budget to storage format: only store IDs, not objects
            let statusObj;
            if (budget.status && typeof budget.status === 'object') {
                const actual = hasValue(budget.status.actualAmount)
                    ? Math.abs(Number(budget.status.actualAmount))
                    : null;
                statusObj = {
                    ...budget.status,
                    actualAmount: actual
                };
            } else {
                statusObj = {
                    name: budget.status || 'planned',
                    actualAmount: null,
                    actualDate: null 
                };
            }

            const statusName = String(statusObj?.name || 'planned').toLowerCase();
            const legacyAmount = Math.abs(Number(budget.amount || 0));
            const storedPlannedAmount = hasValue(existingBudget?.plannedAmount)
                ? Math.abs(Number(existingBudget.plannedAmount))
                : Math.abs(Number(existingBudget?.amount || 0));
            const suppliedPlannedAmount = hasValue(budget.plannedAmount)
                ? Math.abs(Number(budget.plannedAmount))
                : null;
            const legacyAmountWasEdited =
                Boolean(existingBudget) &&
                legacyAmount !== Math.abs(Number(existingBudget.amount || 0)) &&
                suppliedPlannedAmount === storedPlannedAmount;
            const plannedAmount = legacyAmountWasEdited
                ? legacyAmount
                : (suppliedPlannedAmount ?? legacyAmount);
            if (statusName === 'actual') {
                if (!hasValue(statusObj.actualAmount)) {
                    statusObj.actualAmount = plannedAmount;
                }
                if (!hasValue(statusObj.actualDate)) {
                    statusObj.actualDate =
                        budget.plannedDate || budget.occurrenceDate || budget.scheduledDate || null;
                }
            } else {
                statusObj.actualAmount = hasValue(statusObj.actualAmount)
                    ? Math.abs(Number(statusObj.actualAmount))
                    : null;
                statusObj.actualDate = hasValue(statusObj.actualDate)
                    ? statusObj.actualDate
                    : null;
            }

            const baselineAmount = hasValue(budget.baselineAmount)
                ? Math.abs(Number(budget.baselineAmount))
                : (statusName === 'actual' ? plannedAmount : null);
            const occurrenceDate = budget.occurrenceDate || budget.plannedDate || budget.scheduledDate || '';
            const sourceTransactionId = budget.sourceTransactionId ?? null;
            const existingIsSameLinkedOccurrence =
                Boolean(existingBudget) &&
                sourceTransactionId !== null &&
                String(existingBudget.sourceTransactionId ?? '') === String(sourceTransactionId);
            const scheduledDate = existingIsSameLinkedOccurrence
                ? (existingBudget.scheduledDate || existingBudget.occurrenceDate || occurrenceDate)
                : (budget.scheduledDate || occurrenceDate);
            const plannedDate =
                occurrenceDate && scheduledDate && occurrenceDate !== scheduledDate
                    ? occurrenceDate
                    : (budget.plannedDate || null);
            const normalizedId = budget.id || nextId++;
            const occurrenceKey =
                (existingIsSameLinkedOccurrence ? existingBudget.occurrenceKey : null) ||
                budget.occurrenceKey ||
                createLinkedOccurrenceKey(
                    sourceTransactionId,
                    scheduledDate,
                    budget.transactionGroupRole
                ) ||
                `budget:${normalizedId}`;
            const comparable = (value) => JSON.stringify(value ?? null);
            const linkedPlanWasEdited = Boolean(existingIsSameLinkedOccurrence) && (
                plannedAmount !== storedPlannedAmount ||
                occurrenceDate !== (existingBudget.occurrenceDate || '') ||
                (budget.plannedDate || null) !== (existingBudget.plannedDate || null) ||
                Number(budget.primaryAccountId || 0) !== Number(existingBudget.primaryAccountId || 0) ||
                Number(budget.secondaryAccountId || 0) !== Number(existingBudget.secondaryAccountId || 0) ||
                Number(budget.transactionTypeId || 0) !== Number(existingBudget.transactionTypeId || 0) ||
                String(budget.description || '') !== String(existingBudget.description || '') ||
                comparable(budget.tags || []) !== comparable(existingBudget.tags || []) ||
                comparable(budget.periodicChange || null) !== comparable(existingBudget.periodicChange || null) ||
                String(budget.transactionGroupId || '') !== String(existingBudget.transactionGroupId || '') ||
                String(budget.transactionGroupRole || '') !== String(existingBudget.transactionGroupRole || '') ||
                Number(budget.transactionGroupAccountGroupId || 0) !==
                    Number(existingBudget.transactionGroupAccountGroupId || 0) ||
                Number(budget.capitalAmount || 0) !== Number(existingBudget.capitalAmount || 0) ||
                Number(budget.interestAmount || 0) !== Number(existingBudget.interestAmount || 0) ||
                statusName !== String(
                    typeof existingBudget.status === 'object'
                        ? existingBudget.status?.name
                        : existingBudget.status || 'planned'
                ).toLowerCase()
            );
            const suppliedOverride =
                typeof budget.isOverride === 'boolean' ? budget.isOverride : null;
            const existingOverride =
                typeof existingBudget?.isOverride === 'boolean' ? existingBudget.isOverride : null;
            const isOverride =
                sourceTransactionId === null ||
                statusName !== 'planned' ||
                linkedPlanWasEdited ||
                (suppliedOverride ?? existingOverride ?? true);

            const normalized = {
                id: normalizedId,
                sourceTransactionId,
                primaryAccountId: budget.primaryAccountId ?? null,
                secondaryAccountId: budget.secondaryAccountId ?? null,
                transactionGroupId: budget.transactionGroupId ?? null,
                transactionGroupRole: budget.transactionGroupRole ?? null,
                transactionGroupAccountGroupId: Number(budget.transactionGroupAccountGroupId || 0) || null,
                transactionTypeId: budget.transactionTypeId ?? null,
                amount: plannedAmount,
                plannedAmount,
                baselineAmount,
                description: budget.description || '',
                recurrenceDescription: budget.recurrenceDescription || '',
                occurrenceDate,
                occurrenceKey,
                scheduledDate,
                plannedDate,
                origin: budget.origin || (sourceTransactionId !== null ? 'generated' : 'manual'),
                isOverride,
                periodicChange: budget.periodicChange || null,
                capitalAmount: hasValue(budget.capitalAmount)
                    ? Math.abs(Number(budget.capitalAmount))
                    : null,
                interestAmount: hasValue(budget.interestAmount)
                    ? Math.abs(Number(budget.interestAmount))
                    : null,
                status: statusObj,
                tags: budget.tags || []
            };
            
            // Explicitly exclude UI-only fields (objects that should never be stored)
            // These may exist in memory for rendering but should never be persisted
            delete normalized.primaryAccount;
            delete normalized.secondaryAccount;
            delete normalized.transactionType;
            delete normalized.primaryAccountName;
            delete normalized.transactionTypeName;
            delete normalized.actualAmount;
            delete normalized.actualDateOverride;

            return normalized;
        });

        return data;
    });
}

/**
 * Create budgets from projections
 * Uses the shared transaction expansion logic over the projection window
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<Array>} - The created budgets (expanded occurrences)
 */
export async function createFromProjections(scenarioId) {
    const data = await DataStore.read();
    const scenario = data.scenarios?.find(s => s.id === scenarioId);

    if (!scenario) {
        throw new Error(`Scenario ${scenarioId} not found`);
    }

    // Budget uses its own independent window configuration
    const budgetWindowConfig = getScenarioBudgetWindowConfig(scenario);
    if (!budgetWindowConfig) {
        throw new Error(`Scenario ${scenarioId} is missing budget window configuration`);
    }

    const windowStart = budgetWindowConfig.startDate;
    const windowEnd = budgetWindowConfig.endDate;
    if (!windowStart || !windowEnd) {
        throw new Error(`Scenario ${scenarioId} budget window must have both start and end dates`);
    }

    // Always use parseDateOnly, never new Date(), to avoid timezone shifts
    const startDate = parseDateOnly(windowStart);
    const endDate = parseDateOnly(windowEnd);

    // Resolve rules without existing Budget overlays so generated rows use the
    // same recurrence, split, and periodic-change amounts as projections.
    const { occurrences: generatedOccurrences } = resolveScenarioOccurrences({
        scenario: { ...scenario, budgets: [] },
        startDate: windowStart,
        endDate: windowEnd
    });

    // Map generated occurrences to compatibility Budget entries.
    const newEntries = generatedOccurrences
      .filter(occurrence => occurrence.status === 'planned' && occurrence.validForProjection)
      .map(occurrence => ({
        id: 0,
        sourceTransactionId: occurrence.sourceTransactionId,
        primaryAccountId: occurrence.primaryAccountId,
        secondaryAccountId: occurrence.secondaryAccountId ?? null,
        transactionGroupId: occurrence.transactionGroupId ?? null,
        transactionGroupRole: occurrence.transactionGroupRole ?? null,
        transactionTypeId: occurrence.transactionTypeId,
        amount: occurrence.plannedAmount,
        plannedAmount: occurrence.plannedAmount,
        baselineAmount: null,
        description: occurrence.description,
        recurrenceDescription: getRecurrenceDescription(occurrence.recurrence),
        occurrenceDate: occurrence.scheduledDate,
        occurrenceKey: occurrence.occurrenceKey,
        scheduledDate: occurrence.scheduledDate,
        plannedDate: null,
        origin: 'generated',
        isOverride: false,
        periodicChange: occurrence.periodicChange,
        transactionGroupAccountGroupId: occurrence.transactionGroupAccountGroupId ?? null,
        capitalAmount: occurrence.capitalAmount ?? null,
        interestAmount: occurrence.interestAmount ?? null,
        status: {
            name: 'planned',
            actualAmount: null,
            actualDate: null
        },
        tags: occurrence.tags || []
      }));

    if (newEntries.length === 0) {
        throw new Error('No planned transactions fall within the selected date range.');
    }

    const existingBudgets = scenario.budgets || [];
    const existingStatusName = (budget) => {
        const s = typeof budget?.status === 'object' ? budget.status?.name : budget?.status;
        return String(s || '').toLowerCase();
    };

    const getOccurrenceIdentity = (budget) => {
        const storedKey = String(budget?.occurrenceKey || '').trim();
        if (storedKey) return storedKey;
        const sourceTransactionId = budget?.sourceTransactionId;
        const occurrenceDate = budget?.scheduledDate || budget?.occurrenceDate;
        if (sourceTransactionId === null || sourceTransactionId === undefined || !occurrenceDate) {
            return null;
        }
        return createLinkedOccurrenceKey(
            sourceTransactionId,
            formatDateOnly(occurrenceDate),
            budget?.transactionGroupRole
        );
    };

    // Preserve all actuals (actual history should never be replaced).
    // A matched actual is the sole state for its occurrence.
    const existingActuals = existingBudgets.filter(budget => existingStatusName(budget) === 'actual');
    const actualKeys = new Set(existingActuals.map(getOccurrenceIdentity).filter(Boolean));
    const existingSkipped = existingBudgets.filter(budget => {
        if (existingStatusName(budget) !== 'skipped') return false;
        const key = getOccurrenceIdentity(budget);
        return !key || !actualKeys.has(key);
    });
    const skippedKeys = new Set(existingSkipped.map(getOccurrenceIdentity).filter(Boolean));
    const cutoff = formatDateOnly(startDate);
    const windowEndCutoff = formatDateOnly(endDate);
    const existingExplicitLinkedPlanned = existingBudgets.filter(budget => {
        if (existingStatusName(budget) !== 'planned') return false;
        if (budget?.sourceTransactionId === null || budget?.sourceTransactionId === undefined) {
            return false;
        }
        if (budget?.isOverride !== true) return false;
        const key = getOccurrenceIdentity(budget);
        return !key || (!actualKeys.has(key) && !skippedKeys.has(key));
    });
    const activeWindowExplicitLinkedPlanned = existingExplicitLinkedPlanned.filter(budget => {
        // Regeneration is keyed to the immutable scheduled occurrence. A
        // rescheduled override can move outside the visible window while still
        // replacing a rule occurrence that belongs to this generation window.
        const scheduledOccurrenceDate =
            budget?.scheduledDate || budget?.occurrenceDate || budget?.plannedDate;
        if (!scheduledOccurrenceDate) return false;
        const normalizedScheduledDate = formatDateOnly(scheduledOccurrenceDate);
        return normalizedScheduledDate >= cutoff && normalizedScheduledDate <= windowEndCutoff;
    });
    const explicitLinkedPlannedKeys = new Set(
        activeWindowExplicitLinkedPlanned.map(getOccurrenceIdentity).filter(Boolean)
    );
    const blockedKeys = new Set([
        ...actualKeys,
        ...skippedKeys,
        ...explicitLinkedPlannedKeys
    ]);
    const existingManualPlanned = existingBudgets.filter(
        budget =>
            existingStatusName(budget) === 'planned' &&
            (budget?.sourceTransactionId === null || budget?.sourceTransactionId === undefined)
    );

    // Preserve historical planned entries before the regeneration window start,
    // unless a matching actual already represents that occurrence.
    const historicalPlanned = existingBudgets.filter(budget => {
        if (existingStatusName(budget) === 'actual') return false;
        if (existingStatusName(budget) === 'skipped') return false;
        if (budget?.sourceTransactionId === null || budget?.sourceTransactionId === undefined) return false;
        if (budget?.isOverride === true) return false;
        const effectiveOccurrenceDate =
            budget?.plannedDate || budget?.occurrenceDate || budget?.scheduledDate;
        if (!effectiveOccurrenceDate) return true;
        const key = getOccurrenceIdentity(budget);
        return formatDateOnly(effectiveOccurrenceDate) < cutoff && (!key || !blockedKeys.has(key));
    });

    // Build a set of already-covered occurrences so regenerating doesn't create a
    // duplicate planned entry alongside an existing actual for the same occurrence.
    const dedupedNew = newEntries.filter(
        entry => {
            const key = getOccurrenceIdentity(entry);
            return !key || !blockedKeys.has(key);
        }
    );

    return await saveAll(scenarioId, [
        ...existingActuals,
        ...existingSkipped,
        ...existingManualPlanned,
        ...historicalPlanned,
        ...existingExplicitLinkedPlanned,
        ...dedupedNew
    ]);
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
