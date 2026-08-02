/**
 * validation-service.js
 * Validates all scenario data in the data store against TECH_DATA_SCHEMA.md rules.
 * Reports structural issues, missing required fields, invalid references, and constraint violations.
 */

import * as DataStore from './storage-service.js';
import { CURRENT_SCHEMA_VERSION } from '../../shared/app-data-utils.js';

// Valid enum IDs from assets/lookup-data.json
const VALID_ACCOUNT_TYPES      = [1, 2, 3, 4, 5];
const VALID_CURRENCIES         = [1, 2, 3, 4];
const VALID_PROJECTION_PERIODS = [1, 2, 3, 4, 5];
const VALID_TRANSACTION_TYPES  = [1, 2];
// 1–7 from schema, 8 = Custom (schema), 11 = Custom (UI legacy mapping)
const VALID_RECURRENCE_TYPES   = [1, 2, 3, 4, 5, 6, 7, 8, 11];
const VALID_CHANGE_MODES       = [1, 2];
const VALID_CHANGE_TYPES       = [1, 2, 3, 4, 5, 6, 7, 8];
const VALID_PERIODS            = [1, 2, 3, 4, 5];
const VALID_RATE_PERIODS       = [1, 2, 3, 4, 5];
const VALID_OCCURRENCE_STATUSES = ['planned', 'actual', 'skipped'];
const VALID_OCCURRENCE_ORIGINS = ['generated', 'manual', 'migrated'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a numeric ID from a value that may be a plain number or {id, name} object.
 */
function extractId(val) {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'object' && typeof val.id === 'number') return val.id;
    return null;
}

/**
 * Return true if the string is a valid ISO-format date (YYYY-MM-DD …).
 */
function isValidDate(str) {
    if (typeof str !== 'string' || !str.trim()) return false;
    const d = new Date(str);
    return !isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(str);
}

/**
 * Create an issue object.
 */
function issue(path, message) {
    return { path, message };
}

// ---------------------------------------------------------------------------
// PeriodicChange validator
// ---------------------------------------------------------------------------

function validatePeriodicChange(pc, basePath) {
    const issues = [];
    if (pc === null || pc === undefined) return issues;

    if (typeof pc !== 'object') {
        issues.push(issue(basePath, `Must be an object or null, got ${typeof pc}`));
        return issues;
    }

    if (typeof pc.value !== 'number') {
        issues.push(issue(`${basePath}.value`, `Required number field missing or non-numeric`));
    } else if (pc.value === 0) {
        issues.push(issue(`${basePath}.value`, `Must be non-zero`));
    }

    const modeId = extractId(pc.changeMode);
    if (!VALID_CHANGE_MODES.includes(modeId)) {
        issues.push(issue(`${basePath}.changeMode`, `Must be 1 (Percentage) or 2 (Fixed), got ${JSON.stringify(pc.changeMode)}`));
    }

    if (modeId === 1) {
        const changeTypeId = extractId(pc.changeType);
        if (!VALID_CHANGE_TYPES.includes(changeTypeId)) {
            issues.push(issue(`${basePath}.changeType`, `Must be 1–8 for percentage mode, got ${JSON.stringify(pc.changeType)}`));
        }
        if (changeTypeId === 7 && pc.customCompounding) {
            if (!VALID_PERIODS.includes(extractId(pc.customCompounding.period))) {
                issues.push(issue(`${basePath}.customCompounding.period`, `Must be 1–5, got ${JSON.stringify(pc.customCompounding.period)}`));
            }
            if (typeof pc.customCompounding.frequency !== 'number' || pc.customCompounding.frequency <= 0) {
                issues.push(issue(`${basePath}.customCompounding.frequency`, `Must be a positive number`));
            }
        }
    }

    if (modeId === 2) {
        const periodId = extractId(pc.period);
        if (periodId !== null && periodId !== undefined && !VALID_PERIODS.includes(periodId)) {
            issues.push(issue(`${basePath}.period`, `Must be 1–5 for fixed amount mode, got ${JSON.stringify(pc.period)}`));
        }
    }

    if (pc.ratePeriod !== null && pc.ratePeriod !== undefined) {
        const rpId = extractId(pc.ratePeriod);
        if (!VALID_RATE_PERIODS.includes(rpId)) {
            issues.push(issue(`${basePath}.ratePeriod`, `Must be 1–5, got ${JSON.stringify(pc.ratePeriod)}`));
        }
    }

    return issues;
}

// ---------------------------------------------------------------------------
// Recurrence validator
// ---------------------------------------------------------------------------

function validateRecurrence(rec, basePath) {
    const issues = [];

    if (!rec || typeof rec !== 'object') {
        issues.push(issue(basePath, `Missing required recurrence object`));
        return issues;
    }

    const typeId = extractId(rec.recurrenceType);
    if (!VALID_RECURRENCE_TYPES.includes(typeId)) {
        issues.push(issue(`${basePath}.recurrenceType`, `Must be 1–8 (or 11 for custom), got ${JSON.stringify(rec.recurrenceType)}`));
        return issues; // Can't validate type-specific fields without a valid type
    }

    if (!isValidDate(rec.startDate)) {
        issues.push(issue(`${basePath}.startDate`, `Missing or invalid date, got "${rec.startDate}"`));
    }

    if (rec.endDate !== null && rec.endDate !== undefined && rec.endDate !== '') {
        if (!isValidDate(rec.endDate)) {
            issues.push(issue(`${basePath}.endDate`, `Invalid date format, got "${rec.endDate}"`));
        } else if (isValidDate(rec.startDate) && new Date(rec.endDate) < new Date(rec.startDate)) {
            issues.push(issue(`${basePath}.endDate`, `endDate (${rec.endDate}) is before startDate (${rec.startDate})`));
        }
    }

    // Type-specific required field checks
    if (typeId === 2) {
        // Daily
        if (typeof rec.interval !== 'number' || rec.interval < 1) {
            issues.push(issue(`${basePath}.interval`, `Required for Daily recurrence, must be >= 1`));
        }
    }

    if (typeId === 3) {
        // Weekly
        if (typeof rec.interval !== 'number' || rec.interval < 1) {
            issues.push(issue(`${basePath}.interval`, `Required for Weekly recurrence, must be >= 1`));
        }
        if (rec.dayOfWeek === null || rec.dayOfWeek === undefined || rec.dayOfWeek < 0 || rec.dayOfWeek > 6) {
            issues.push(issue(`${basePath}.dayOfWeek`, `Required for Weekly recurrence (0=Sun … 6=Sat), got ${rec.dayOfWeek}`));
        }
    }

    if (typeId === 4) {
        // Monthly - Day of Month
        if (rec.dayOfMonth === null || rec.dayOfMonth === undefined) {
            issues.push(issue(`${basePath}.dayOfMonth`, `Required for Monthly (Day of Month) recurrence`));
        } else if ((rec.dayOfMonth < 1 || rec.dayOfMonth > 31) && rec.dayOfMonth !== -1) {
            issues.push(issue(`${basePath}.dayOfMonth`, `Must be 1–31 or -1 (last day), got ${rec.dayOfMonth}`));
        }
    }

    if (typeId === 5) {
        // Monthly - Week of Month
        if (!rec.weekOfMonth || rec.weekOfMonth < 1 || rec.weekOfMonth > 5) {
            issues.push(issue(`${basePath}.weekOfMonth`, `Required for Monthly (Week of Month) recurrence (1–5), got ${rec.weekOfMonth}`));
        }
        if (rec.dayOfWeekInMonth === null || rec.dayOfWeekInMonth === undefined || rec.dayOfWeekInMonth < 1 || rec.dayOfWeekInMonth > 7) {
            issues.push(issue(`${basePath}.dayOfWeekInMonth`, `Required for Monthly (Week of Month) recurrence (1–7), got ${rec.dayOfWeekInMonth}`));
        }
    }

    if (typeId === 6) {
        // Quarterly
        if (rec.dayOfQuarter === null || rec.dayOfQuarter === undefined || rec.dayOfQuarter < 1 || rec.dayOfQuarter > 92) {
            issues.push(issue(`${basePath}.dayOfQuarter`, `Required for Quarterly recurrence (1–92), got ${rec.dayOfQuarter}`));
        }
    }

    if (typeId === 7) {
        // Yearly
        if (rec.month === null || rec.month === undefined || rec.month < 1 || rec.month > 12) {
            issues.push(issue(`${basePath}.month`, `Required for Yearly recurrence (1–12), got ${rec.month}`));
        }
        if (rec.dayOfYear === null || rec.dayOfYear === undefined || rec.dayOfYear < 1 || rec.dayOfYear > 366) {
            issues.push(issue(`${basePath}.dayOfYear`, `Required for Yearly recurrence (1–366), got ${rec.dayOfYear}`));
        }
    }

    if (typeId === 8 || typeId === 11) {
        // Custom Dates
        if (!rec.customDates || typeof rec.customDates !== 'string' || !rec.customDates.trim()) {
            issues.push(issue(`${basePath}.customDates`, `Required for Custom Dates recurrence`));
        }
    }

    return issues;
}

// ---------------------------------------------------------------------------
// Account validator
// ---------------------------------------------------------------------------

function validateAccount(acc, index) {
    const issues = [];
    const label = `account[${index}] (id=${acc.id}, "${acc.name}")`;

    if (typeof acc.id !== 'number') {
        issues.push(issue(`${label}.id`, `Missing or non-numeric id`));
    }
    if (typeof acc.name !== 'string' || !acc.name.trim()) {
        issues.push(issue(`${label}.name`, `Missing or empty name`));
    }

    const typeId = extractId(acc.type);
    if (!VALID_ACCOUNT_TYPES.includes(typeId)) {
        issues.push(issue(`${label}.type`, `Must be 1–5, got ${JSON.stringify(acc.type)}`));
    }

    const currencyId = extractId(acc.currency);
    if (!VALID_CURRENCIES.includes(currencyId)) {
        issues.push(issue(`${label}.currency`, `Must be 1–4, got ${JSON.stringify(acc.currency)}`));
    }

    if (typeof acc.startingBalance !== 'number') {
        issues.push(issue(`${label}.startingBalance`, `Missing or non-numeric startingBalance`));
    }

    if (!isValidDate(acc.openDate)) {
        issues.push(issue(`${label}.openDate`, `Missing or invalid date, got "${acc.openDate}"`));
    }

    if (acc.periodicChange !== null && acc.periodicChange !== undefined) {
        const pcIssues = validatePeriodicChange(acc.periodicChange, `${label}.periodicChange`);
        issues.push(...pcIssues);
    }

    if (acc.periodicChangeSchedule !== null && acc.periodicChangeSchedule !== undefined) {
        if (!Array.isArray(acc.periodicChangeSchedule)) {
            issues.push(issue(`${label}.periodicChangeSchedule`, `Must be an array if provided`));
        } else {
            acc.periodicChangeSchedule.forEach((entry, ei) => {
                const ePath = `${label}.periodicChangeSchedule[${ei}]`;
                if (!isValidDate(entry.startDate)) {
                    issues.push(issue(`${ePath}.startDate`, `Invalid date, got "${entry.startDate}"`));
                }
                if (entry.endDate !== null && entry.endDate !== undefined && !isValidDate(entry.endDate)) {
                    issues.push(issue(`${ePath}.endDate`, `Invalid date, got "${entry.endDate}"`));
                }
                if (entry.periodicChange) {
                    issues.push(...validatePeriodicChange(entry.periodicChange, `${ePath}.periodicChange`));
                }
            });
        }
    }

    return issues;
}

// ---------------------------------------------------------------------------
// Transaction validator
// ---------------------------------------------------------------------------

function validateTransaction(tx, index, scenario) {
    const issues = [];
    const label = `transaction[${index}] (id=${tx.id}, "${tx.description}")`;
    const accountIds = (scenario.accounts || []).map(a => a.id);

    if (typeof tx.id !== 'number') {
        issues.push(issue(`${label}.id`, `Missing or non-numeric id`));
    }

    if (tx.primaryAccountId === null || tx.primaryAccountId === undefined) {
        issues.push(issue(`${label}.primaryAccountId`, `Missing primaryAccountId`));
    } else if (typeof tx.primaryAccountId !== 'number') {
        issues.push(issue(`${label}.primaryAccountId`, `Must be a number, got ${typeof tx.primaryAccountId}`));
    } else if (!accountIds.includes(tx.primaryAccountId)) {
        issues.push(issue(`${label}.primaryAccountId`, `Account ID ${tx.primaryAccountId} not found in this scenario's accounts`));
    }

    if (
        tx.secondaryAccountId !== null &&
        tx.secondaryAccountId !== undefined &&
        typeof tx.secondaryAccountId !== 'number'
    ) {
        issues.push(issue(`${label}.secondaryAccountId`, `Must be a number, got ${typeof tx.secondaryAccountId}`));
    } else if (
        tx.secondaryAccountId !== null &&
        tx.secondaryAccountId !== undefined &&
        !accountIds.includes(tx.secondaryAccountId)
    ) {
        issues.push(issue(`${label}.secondaryAccountId`, `Account ID ${tx.secondaryAccountId} not found in this scenario's accounts`));
    }

    const txTypeId = extractId(tx.transactionTypeId);
    if (!VALID_TRANSACTION_TYPES.includes(txTypeId)) {
        issues.push(issue(`${label}.transactionTypeId`, `Must be 1 (Income) or 2 (Expense), got ${JSON.stringify(tx.transactionTypeId)}`));
    }

    if (typeof tx.amount !== 'number') {
        issues.push(issue(`${label}.amount`, `Missing or non-numeric amount`));
    } else if (tx.amount <= 0) {
        issues.push(issue(`${label}.amount`, `Must be positive, got ${tx.amount}`));
    }

    if (typeof tx.description !== 'string' || !tx.description.trim()) {
        issues.push(issue(`${label}.description`, `Missing or empty description`));
    }

    if (tx.recurrence !== null && tx.recurrence !== undefined) {
        issues.push(...validateRecurrence(tx.recurrence, `${label}.recurrence`));
    } else if (!isValidDate(tx.effectiveDate)) {
        issues.push(issue(
            `${label}.effectiveDate`,
            `A rule without recurrence must have a valid effectiveDate`
        ));
    }

    if (tx.periodicChange !== null && tx.periodicChange !== undefined) {
        issues.push(...validatePeriodicChange(tx.periodicChange, `${label}.periodicChange`));
    }

    if (Object.prototype.hasOwnProperty.call(tx, 'status')) {
        issues.push(issue(`${label}.status`, `Legacy status is not allowed on schemaVersion 44 rules`));
    }
    if (
        tx.activeFrom !== null &&
        tx.activeFrom !== undefined &&
        !isValidDate(tx.activeFrom)
    ) {
        issues.push(issue(`${label}.activeFrom`, `Invalid date "${tx.activeFrom}"`));
    }
    if (
        tx.activeTo !== null &&
        tx.activeTo !== undefined &&
        !isValidDate(tx.activeTo)
    ) {
        issues.push(issue(`${label}.activeTo`, `Invalid date "${tx.activeTo}"`));
    }
    if (
        isValidDate(tx.activeFrom) &&
        isValidDate(tx.activeTo) &&
        new Date(tx.activeFrom) > new Date(tx.activeTo)
    ) {
        issues.push(issue(`${label}.activeFrom/activeTo`, `activeFrom must be on or before activeTo`));
    }

    if (tx.tags !== undefined && !Array.isArray(tx.tags)) {
        issues.push(issue(`${label}.tags`, `Must be an array`));
    }

    return issues;
}

function validateOccurrence(occurrence, index, scenario) {
    const issues = [];
    const label = `transactionOccurrence[${index}] (id=${occurrence?.id})`;
    const accountIds = new Set((scenario.accounts || []).map((account) => Number(account?.id)));
    const transactionIds = new Set((scenario.transactions || []).map((transaction) => Number(transaction?.id)));

    if (!Number.isInteger(Number(occurrence?.id)) || Number(occurrence.id) <= 0) {
        issues.push(issue(`${label}.id`, `Must be a positive integer`));
    }
    if (typeof occurrence?.occurrenceKey !== 'string' || !occurrence.occurrenceKey.trim()) {
        issues.push(issue(`${label}.occurrenceKey`, `Missing stable occurrence key`));
    }
    if (!isValidDate(occurrence?.scheduledDate)) {
        issues.push(issue(`${label}.scheduledDate`, `Missing or invalid YYYY-MM-DD date`));
    }
    for (const field of ['plannedDate', 'actualDate']) {
        const value = occurrence?.[field];
        if (value !== null && value !== undefined && !isValidDate(value)) {
            issues.push(issue(`${label}.${field}`, `Invalid date "${value}"`));
        }
    }

    if (!VALID_OCCURRENCE_STATUSES.includes(occurrence?.status)) {
        issues.push(issue(
            `${label}.status`,
            `Must be ${VALID_OCCURRENCE_STATUSES.join(', ')}, got "${occurrence?.status}"`
        ));
    }
    if (!VALID_OCCURRENCE_ORIGINS.includes(occurrence?.origin)) {
        issues.push(issue(
            `${label}.origin`,
            `Must be ${VALID_OCCURRENCE_ORIGINS.join(', ')}, got "${occurrence?.origin}"`
        ));
    }

    const sourceId = occurrence?.sourceTransactionId;
    if (sourceId !== null && sourceId !== undefined) {
        if (!transactionIds.has(Number(sourceId))) {
            issues.push(issue(
                `${label}.sourceTransactionId`,
                `Transaction rule ID ${sourceId} was not found`
            ));
        }
        const role = String(occurrence?.transactionGroupRole || '').trim().toLowerCase() || 'none';
        const expectedKey = `tx:${Number(sourceId)}|date:${occurrence?.scheduledDate}|role:${role}`;
        if (occurrence?.occurrenceKey !== expectedKey) {
            issues.push(issue(
                `${label}.occurrenceKey`,
                `Linked occurrence key must be "${expectedKey}"`
            ));
        }
    } else if (!/^occurrence:\d+$/.test(String(occurrence?.occurrenceKey || ''))) {
        issues.push(issue(
            `${label}.occurrenceKey`,
            `Manual occurrence keys must use occurrence:<id>`
        ));
    }

    for (const field of ['baselineAmount', 'plannedAmount', 'actualAmount', 'capitalAmount', 'interestAmount']) {
        const value = occurrence?.[field];
        if (value !== null && value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
            issues.push(issue(`${label}.${field}`, `Must be a non-negative number or null`));
        }
    }
    for (const field of ['primaryAccountId', 'secondaryAccountId']) {
        const value = occurrence?.[field];
        if (value !== null && value !== undefined && !accountIds.has(Number(value))) {
            issues.push(issue(`${label}.${field}`, `Account ID ${value} was not found`));
        }
    }
    for (const field of ['baselinePrimaryAccountId', 'baselineSecondaryAccountId']) {
        const value = occurrence?.[field];
        if (value !== null && value !== undefined && !accountIds.has(Number(value))) {
            issues.push(issue(`${label}.${field}`, `Account ID ${value} was not found`));
        }
    }
    if (
        occurrence?.transactionTypeId !== null &&
        occurrence?.transactionTypeId !== undefined &&
        !VALID_TRANSACTION_TYPES.includes(Number(occurrence.transactionTypeId))
    ) {
        issues.push(issue(`${label}.transactionTypeId`, `Must be 1, 2, or null`));
    }
    if (
        occurrence?.isOverride !== null &&
        occurrence?.isOverride !== undefined &&
        typeof occurrence.isOverride !== 'boolean'
    ) {
        issues.push(issue(`${label}.isOverride`, `Must be boolean or null`));
    }
    for (const field of ['actualSnapshotVersion', 'baselineSnapshotVersion']) {
        const value = occurrence?.[field];
        if (value !== null && value !== undefined && Number(value) !== 1) {
            issues.push(issue(`${label}.${field}`, `Must be 1 or null`));
        }
    }
    if (
        occurrence?.baselineTransactionTypeId !== null &&
        occurrence?.baselineTransactionTypeId !== undefined &&
        !VALID_TRANSACTION_TYPES.includes(Number(occurrence.baselineTransactionTypeId))
    ) {
        issues.push(issue(`${label}.baselineTransactionTypeId`, `Must be 1, 2, or null`));
    }
    if (occurrence?.baselineAmount !== null && occurrence?.baselineAmount !== undefined) {
        if (Number(occurrence?.baselineSnapshotVersion) !== 1) {
            issues.push(issue(
                `${label}.baselineSnapshotVersion`,
                `Stored baselines require snapshot version 1`
            ));
        }
        if (!accountIds.has(Number(occurrence?.baselinePrimaryAccountId))) {
            issues.push(issue(
                `${label}.baselinePrimaryAccountId`,
                `Stored baselines require a valid primary account`
            ));
        }
        if (!VALID_TRANSACTION_TYPES.includes(Number(occurrence?.baselineTransactionTypeId))) {
            issues.push(issue(
                `${label}.baselineTransactionTypeId`,
                `Stored baselines require direction 1 or 2`
            ));
        }
    }

    if (occurrence?.status === 'actual') {
        if (Number(occurrence?.actualSnapshotVersion) !== 1) {
            issues.push(issue(
                `${label}.actualSnapshotVersion`,
                `Actual occurrences require snapshot version 1`
            ));
        }
        if (!accountIds.has(Number(occurrence?.primaryAccountId))) {
            issues.push(issue(`${label}.primaryAccountId`, `Actual occurrences require a valid primary account`));
        }
        if (!VALID_TRANSACTION_TYPES.includes(Number(occurrence?.transactionTypeId))) {
            issues.push(issue(`${label}.transactionTypeId`, `Actual occurrences require direction 1 or 2`));
        }
        if (!isValidDate(occurrence.actualDate)) {
            issues.push(issue(`${label}.actualDate`, `Actual occurrences require actualDate`));
        }
        if (!Number.isFinite(Number(occurrence.actualAmount)) || Number(occurrence.actualAmount) < 0) {
            issues.push(issue(`${label}.actualAmount`, `Actual occurrences require actualAmount`));
        }
    } else if (occurrence?.actualAmount !== null || occurrence?.actualDate !== null) {
        issues.push(issue(
            `${label}.actualAmount/actualDate`,
            `Only actual occurrences may contain actual values`
        ));
    }

    if (sourceId == null) {
        if (!accountIds.has(Number(occurrence?.primaryAccountId))) {
            issues.push(issue(`${label}.primaryAccountId`, `Manual occurrences require a valid primary account`));
        }
        if (!VALID_TRANSACTION_TYPES.includes(Number(occurrence?.transactionTypeId))) {
            issues.push(issue(`${label}.transactionTypeId`, `Manual occurrences require direction 1 or 2`));
        }
        const currentAmount =
            occurrence?.status === 'actual' ? occurrence?.actualAmount : occurrence?.plannedAmount;
        if (!Number.isFinite(Number(currentAmount)) || Number(currentAmount) < 0) {
            issues.push(issue(`${label}.plannedAmount`, `Manual occurrences require an amount`));
        }
    }

    return issues;
}

function validateBaselinePeriod(period, index) {
    const issues = [];
    const label = `baselinePeriod[${index}]`;
    if (!VALID_PROJECTION_PERIODS.includes(Number(period?.periodTypeId))) {
        issues.push(issue(`${label}.periodTypeId`, `Must be 1–5`));
    }
    if (!isValidDate(period?.startDate)) {
        issues.push(issue(`${label}.startDate`, `Missing or invalid date`));
    }
    if (!isValidDate(period?.endDate)) {
        issues.push(issue(`${label}.endDate`, `Missing or invalid date`));
    }
    if (
        isValidDate(period?.startDate) &&
        isValidDate(period?.endDate) &&
        new Date(period.startDate) > new Date(period.endDate)
    ) {
        issues.push(issue(`${label}.startDate/endDate`, `startDate must be on or before endDate`));
    }
    if (
        typeof period?.frozenAt !== 'string' ||
        !period.frozenAt ||
        Number.isNaN(Date.parse(period.frozenAt))
    ) {
        issues.push(issue(`${label}.frozenAt`, `Must be an ISO datetime string`));
    }
    return issues;
}

function validateProjection(projection) {
    const issues = [];
    if (!projection || typeof projection !== 'object') {
        issues.push(issue('projection', `Missing projection bundle`));
        return issues;
    }
    const config = projection.config;
    if (!config || typeof config !== 'object') {
        issues.push(issue('projection.config', `Missing projection config`));
        return issues;
    }
    if (!isValidDate(config.startDate) || !isValidDate(config.endDate)) {
        issues.push(issue('projection.config', `startDate and endDate must be valid dates`));
    } else if (new Date(config.startDate) > new Date(config.endDate)) {
        issues.push(issue('projection.config', `startDate must be on or before endDate`));
    }
    if (!VALID_PROJECTION_PERIODS.includes(Number(config.periodTypeId))) {
        issues.push(issue('projection.config.periodTypeId', `Must be 1–5`));
    }
    if (Object.prototype.hasOwnProperty.call(config, 'source')) {
        issues.push(issue('projection.config.source', `Legacy projection source is not allowed`));
    }
    if (
        config.openCommitmentStartDate &&
        (
            !isValidDate(config.openCommitmentStartDate) ||
            config.openCommitmentStartDate > config.startDate
        )
    ) {
        issues.push(issue(
            'projection.config.openCommitmentStartDate',
            `Must be a valid date on or before projection start`
        ));
    }
    if (!Array.isArray(projection.rows)) {
        issues.push(issue('projection.rows', `Must be an array`));
    }
    if (typeof projection.stale !== 'boolean') {
        issues.push(issue('projection.stale', `Must be boolean`));
    }
    if (projection.stale) {
        if (typeof projection.staleAt !== 'string' || Number.isNaN(Date.parse(projection.staleAt))) {
            issues.push(issue('projection.staleAt', `Stale projections require an ISO datetime`));
        }
        if (typeof projection.staleReason !== 'string' || !projection.staleReason.trim()) {
            issues.push(issue('projection.staleReason', `Stale projections require a reason`));
        }
    }
    return issues;
}

// ---------------------------------------------------------------------------
// Scenario validator
// ---------------------------------------------------------------------------

function validateScenario(scenario) {
    const issues = [];

    if (typeof scenario.id !== 'number') {
        issues.push(issue('id', `Missing or non-numeric id`));
    }
    if (typeof scenario.name !== 'string' || !scenario.name.trim()) {
        issues.push(issue('name', `Missing or empty name`));
    }

    if (!Number.isInteger(Number(scenario.version)) || Number(scenario.version) < 1) {
        issues.push(issue('version', `Must be a positive integer`));
    }
    if (Object.prototype.hasOwnProperty.call(scenario, 'budgets')) {
        issues.push(issue('budgets', `Legacy budgets are not allowed in schemaVersion 44`));
    }
    if (Object.prototype.hasOwnProperty.call(scenario, 'budgetWindow')) {
        issues.push(issue('budgetWindow', `Legacy budgetWindow is not allowed in schemaVersion 44`));
    }

    // Accounts
    if (!Array.isArray(scenario.accounts)) {
        issues.push(issue('accounts', `Must be an array`));
    } else {
        const ids = scenario.accounts.map(a => a.id);
        const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
        if (dupIds.length > 0) {
            issues.push(issue('accounts', `Duplicate account IDs: ${[...new Set(dupIds)].join(', ')}`));
        }
        scenario.accounts.forEach((acc, i) => {
            issues.push(...validateAccount(acc, i));
        });
    }

    // Transactions
    if (scenario.transactions !== undefined) {
        if (!Array.isArray(scenario.transactions)) {
            issues.push(issue('transactions', `Must be an array`));
        } else {
            const txIds = scenario.transactions.map(t => t.id);
            const dupTxIds = txIds.filter((id, i) => txIds.indexOf(id) !== i);
            if (dupTxIds.length > 0) {
                issues.push(issue('transactions', `Duplicate transaction IDs: ${[...new Set(dupTxIds)].join(', ')}`));
            }
            scenario.transactions.forEach((tx, i) => {
                issues.push(...validateTransaction(tx, i, scenario));
            });
        }
    }

    if (!Array.isArray(scenario.transactionOccurrences)) {
        issues.push(issue('transactionOccurrences', `Must be an array`));
    } else {
        const ids = scenario.transactionOccurrences.map((occurrence) => occurrence?.id);
        const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
        if (duplicateIds.length) {
            issues.push(issue(
                'transactionOccurrences',
                `Duplicate occurrence IDs: ${[...new Set(duplicateIds)].join(', ')}`
            ));
        }
        const keys = scenario.transactionOccurrences.map((occurrence) => occurrence?.occurrenceKey);
        const duplicateKeys = keys.filter((key, index) => keys.indexOf(key) !== index);
        if (duplicateKeys.length) {
            issues.push(issue(
                'transactionOccurrences',
                `Duplicate occurrence keys: ${[...new Set(duplicateKeys)].join(', ')}`
            ));
        }
        scenario.transactionOccurrences.forEach((occurrence, index) => {
            issues.push(...validateOccurrence(occurrence, index, scenario));
        });
    }

    if (!Array.isArray(scenario.baselinePeriods)) {
        issues.push(issue('baselinePeriods', `Must be an array`));
    } else {
        const keys = scenario.baselinePeriods.map(
            (period) => `${period?.periodTypeId}|${period?.startDate}|${period?.endDate}`
        );
        const duplicateKeys = keys.filter((key, index) => keys.indexOf(key) !== index);
        if (duplicateKeys.length) {
            issues.push(issue(
                'baselinePeriods',
                `Duplicate frozen period keys: ${[...new Set(duplicateKeys)].join(', ')}`
            ));
        }
        scenario.baselinePeriods.forEach((period, index) => {
            issues.push(...validateBaselinePeriod(period, index));
        });
    }

    issues.push(...validateProjection(scenario.projection));

    return issues;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate every scenario in the data store.
 *
 * @returns {Promise<{isValid: boolean, totalIssues: number, scenarioCount: number, scenarios: Array}>}
 *   Each entry in `scenarios` has { id, name, issues: [{path, message}] }
 */
export function validateAppData(data) {
    const scenarios = Array.isArray(data?.scenarios) ? data.scenarios : [];
    const rootIssues = [];
    if (data?.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        rootIssues.push(issue(
            'schemaVersion',
            `Expected ${CURRENT_SCHEMA_VERSION}, got ${String(data?.schemaVersion ?? 'missing')}`
        ));
    }
    if (!Array.isArray(data?.scenarios)) {
        rootIssues.push(issue('scenarios', `Must be an array`));
    }
    if (!data?.uiState || typeof data.uiState !== 'object') {
        rootIssues.push(issue('uiState', `Must be an object`));
    }
    if (data?.migrationReport !== undefined && data.migrationReport !== null) {
        const report = data.migrationReport;
        if (!report || typeof report !== 'object') {
            rootIssues.push(issue('migrationReport', `Must be an object or null`));
        } else {
            if (Number(report.toSchemaVersion) !== CURRENT_SCHEMA_VERSION) {
                rootIssues.push(issue(
                    'migrationReport.toSchemaVersion',
                    `Expected ${CURRENT_SCHEMA_VERSION}`
                ));
            }
            if (typeof report.migratedAt !== 'string' || Number.isNaN(Date.parse(report.migratedAt))) {
                rootIssues.push(issue('migrationReport.migratedAt', `Must be an ISO datetime`));
            }
            if (!report.summary || typeof report.summary !== 'object') {
                rootIssues.push(issue('migrationReport.summary', `Must be an object`));
            }
            if (!Array.isArray(report.scenarios)) {
                rootIssues.push(issue('migrationReport.scenarios', `Must be an array`));
            }
        }
    }

    const results = [];
    let totalIssues = rootIssues.length;

    for (const scenario of scenarios) {
        const scenarioIssues = validateScenario(scenario);
        totalIssues += scenarioIssues.length;
        results.push({
            id:     scenario.id,
            name:   typeof scenario.name === 'string' ? scenario.name : `Scenario ${scenario.id}`,
            issues: scenarioIssues
        });
    }

    return {
        isValid:       totalIssues === 0,
        totalIssues,
        scenarioCount: scenarios.length,
        rootIssues,
        scenarios:     results
    };
}

export async function validateAllData() {
    return validateAppData(await DataStore.read());
}
