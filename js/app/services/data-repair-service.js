/**
 * Lossless, in-memory repairs for current-schema app data.
 *
 * Repairs in this service never guess missing financial values or delete
 * records. They only normalize values whose intended representation is
 * unambiguous (for example, "1250.50" -> 1250.5).
 */

const ID_FIELDS = new Set([
  'id',
  'primaryAccountId',
  'secondaryAccountId',
  'transactionTypeId',
  'seriesRootId',
  'supersedesTransactionId',
  'transactionGroupAccountGroupId',
  'sourceTransactionId',
  'baselinePrimaryAccountId',
  'baselineSecondaryAccountId',
  'baselineTransactionTypeId',
  'actualSnapshotVersion',
  'baselineSnapshotVersion',
  'periodTypeId'
]);

const AMOUNT_FIELDS = new Set([
  'startingBalance',
  'amount',
  'baselineAmount',
  'plannedAmount',
  'actualAmount',
  'capitalAmount',
  'interestAmount',
  'value'
]);

const RECURRENCE_NUMBER_FIELDS = new Set([
  'interval',
  'dayOfWeek',
  'dayOfMonth',
  'weekOfMonth',
  'dayOfWeekInMonth',
  'dayOfQuarter',
  'month',
  'dayOfYear',
  'frequency'
]);

const LOOKUP_FIELDS = new Set([
  'type',
  'currency',
  'recurrenceType',
  'changeMode',
  'changeType',
  'period',
  'ratePeriod'
]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function numericString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

function lookupId(value) {
  return numericString(value);
}

function describeReason(kind) {
  if (kind === 'lookup') return 'Converted a numeric lookup ID string to the required number type.';
  return 'Converted a numeric string to the required number type.';
}

/**
 * Prepare safe repairs without mutating the provided data.
 *
 * @returns {{data: Object, repairs: Array}}
 */
export function prepareSafeAppDataRepairs(input) {
  const data = cloneJson(input);
  const repairs = [];

  function record(path, before, after, kind) {
    repairs.push({
      path,
      before,
      after,
      kind,
      reason: describeReason(kind)
    });
  }

  function walk(value, path = '') {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;

    for (const [field, current] of Object.entries(value)) {
      const nextPath = path ? `${path}.${field}` : field;
      if (nextPath === 'migrationReport') continue;
      const isFinancialPath = /^scenarios\[\d+\]\.(accounts|transactions|transactionOccurrences|baselinePeriods|projection)(?:\.|\[|$)/.test(nextPath);
      if (!isFinancialPath) {
        walk(current, nextPath);
        continue;
      }
      let replacement = null;
      let kind = null;

      const isAccountLookup = /\.accounts\[\d+\]\.(type|currency)$/.test(nextPath);
      const isNestedLookup = /\.(recurrence|periodicChange|customCompounding)(?:\.|\[)/.test(nextPath);
      if (LOOKUP_FIELDS.has(field) && (isAccountLookup || isNestedLookup)) {
        replacement = lookupId(current);
        kind = replacement !== null ? 'lookup' : null;
      }
      const isNestedNumber = RECURRENCE_NUMBER_FIELDS.has(field) &&
        /\.(recurrence|periodicChange|customCompounding)(?:\.|\[)/.test(nextPath);
      if (kind === null && (ID_FIELDS.has(field) || AMOUNT_FIELDS.has(field) || isNestedNumber)) {
        replacement = numericString(current);
        kind = replacement !== null ? 'number' : null;
      }
      if (kind !== null && !Object.is(current, replacement)) {
        value[field] = replacement;
        record(nextPath, current, replacement, kind);
      } else {
        walk(current, nextPath);
      }
    }
  }

  walk(data);
  return { data, repairs };
}
