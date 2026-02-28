/**
 * validation-service.js
 * Validates all scenario data in the data store against TECH_DATA_SCHEMA.md rules.
 * Reports structural issues, missing required fields, invalid references, and constraint violations.
 */

import * as DataStore from './storage-service.js';

// Valid enum IDs from assets/lookup-data.json
const VALID_SCENARIO_TYPES     = [1, 2, 3, 4, 5, 6];
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
    } else if (pc.value <= 0) {
        issues.push(issue(`${basePath}.value`, `Must be positive, got ${pc.value}`));
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

    if (tx.secondaryAccountId === null || tx.secondaryAccountId === undefined) {
        issues.push(issue(`${label}.secondaryAccountId`, `Missing secondaryAccountId`));
    } else if (typeof tx.secondaryAccountId !== 'number') {
        issues.push(issue(`${label}.secondaryAccountId`, `Must be a number, got ${typeof tx.secondaryAccountId}`));
    } else if (!accountIds.includes(tx.secondaryAccountId)) {
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

    // Recurrence
    issues.push(...validateRecurrence(tx.recurrence, `${label}.recurrence`));

    // Cross-check transaction start date against scenario window
    if (
        tx.recurrence &&
        isValidDate(tx.recurrence.startDate) &&
        isValidDate(scenario.startDate) &&
        isValidDate(scenario.endDate)
    ) {
        const txStart   = new Date(tx.recurrence.startDate);
        const scenStart = new Date(scenario.startDate);
        const scenEnd   = new Date(scenario.endDate);
        if (txStart < scenStart || txStart > scenEnd) {
            issues.push(issue(
                `${label}.recurrence.startDate`,
                `Date ${tx.recurrence.startDate} is outside scenario range [${scenario.startDate} → ${scenario.endDate}]`
            ));
        }
    }

    if (tx.periodicChange !== null && tx.periodicChange !== undefined) {
        issues.push(...validatePeriodicChange(tx.periodicChange, `${label}.periodicChange`));
    }

    if (!tx.status || typeof tx.status !== 'object') {
        issues.push(issue(`${label}.status`, `Missing required status object`));
    } else if (!['planned', 'actual'].includes(tx.status.name)) {
        issues.push(issue(`${label}.status.name`, `Must be "planned" or "actual", got "${tx.status.name}"`));
    }

    if (tx.tags !== undefined && !Array.isArray(tx.tags)) {
        issues.push(issue(`${label}.tags`, `Must be an array`));
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

    const typeId = extractId(scenario.type);
    if (!VALID_SCENARIO_TYPES.includes(typeId)) {
        issues.push(issue('type', `Must be 1–6, got ${JSON.stringify(scenario.type)}`));
    }

    if (!isValidDate(scenario.startDate)) {
        issues.push(issue('startDate', `Invalid date: "${scenario.startDate}"`));
    }
    if (!isValidDate(scenario.endDate)) {
        issues.push(issue('endDate', `Invalid date: "${scenario.endDate}"`));
    }
    if (isValidDate(scenario.startDate) && isValidDate(scenario.endDate)) {
        if (new Date(scenario.startDate) > new Date(scenario.endDate)) {
            issues.push(issue('startDate/endDate', `startDate (${scenario.startDate}) is after endDate (${scenario.endDate})`));
        }
    }

    const ppId = extractId(scenario.projectionPeriod);
    if (!VALID_PROJECTION_PERIODS.includes(ppId)) {
        issues.push(issue('projectionPeriod', `Must be 1–5, got ${JSON.stringify(scenario.projectionPeriod)}`));
    }

    // Accounts
    if (!Array.isArray(scenario.accounts) || scenario.accounts.length === 0) {
        issues.push(issue('accounts', `Must have at least one account`));
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
export async function validateAllData() {
    const data = await DataStore.read();
    const scenarios = Array.isArray(data?.scenarios) ? data.scenarios : [];

    const results = [];
    let totalIssues = 0;

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
        scenarios:     results
    };
}
