/**
 * Lossless, in-memory repairs for current-schema app data.
 *
 * Repairs in this service never invent financial amounts or delete records.
 * They normalize unambiguous representations and reconstruct required legacy
 * metadata only when the surrounding data supplies one deterministic value.
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
  if (kind === 'currency-inference') return 'Filled a missing currency from the single currency used by the surrounding data.';
  if (kind === 'description-inference') return 'Generated a required description from the transaction accounts.';
  if (kind === 'yearly-date-inference') return 'Derived required yearly recurrence fields from the saved start date.';
  return 'Converted a numeric string to the required number type.';
}

function lookupNumber(value) {
  const raw = value && typeof value === 'object' ? value.id : value;
  if (raw === null || raw === undefined || raw === '') return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function validCurrencyId(value) {
  const number = lookupNumber(value);
  return [1, 2, 3, 4].includes(number) ? number : null;
}

function uniqueValue(values) {
  const unique = [...new Set(values.filter((value) => value !== null))];
  return unique.length === 1 ? unique[0] : null;
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

  const appCurrency = uniqueValue(
    (data.scenarios || []).flatMap((scenario) =>
      (scenario.accounts || []).map((account) => validCurrencyId(account?.currency))
    )
  );

  (data.scenarios || []).forEach((scenario, scenarioIndex) => {
    const accounts = Array.isArray(scenario?.accounts) ? scenario.accounts : [];
    const accountById = new Map(accounts.map((account) => [String(account?.id), account]));
    const scenarioCurrency = uniqueValue(
      accounts.map((account) => validCurrencyId(account?.currency))
    ) || appCurrency;

    accounts.forEach((account, accountIndex) => {
      const missingCurrency = account?.currency === null || account?.currency === undefined || account?.currency === '';
      if (!missingCurrency || !scenarioCurrency) return;
      const path = `scenarios[${scenarioIndex}].accounts[${accountIndex}].currency`;
      const before = account.currency;
      account.currency = scenarioCurrency;
      record(path, before, scenarioCurrency, 'currency-inference');
    });

    (scenario.transactions || []).forEach((transaction, transactionIndex) => {
      const basePath = `scenarios[${scenarioIndex}].transactions[${transactionIndex}]`;
      if (typeof transaction?.description !== 'string' || !transaction.description.trim()) {
        const primary = accountById.get(String(transaction?.primaryAccountId));
        const secondary = accountById.get(String(transaction?.secondaryAccountId));
        const primaryName = String(primary?.name || '').trim();
        const secondaryName = String(secondary?.name || '').trim();
        const description = primaryName && secondaryName
          ? `${primaryName} → ${secondaryName}`
          : (primaryName || secondaryName || `Transaction ${transaction?.id ?? transactionIndex + 1}`);
        const before = transaction.description;
        transaction.description = description;
        record(`${basePath}.description`, before, description, 'description-inference');
      }

      const recurrence = transaction?.recurrence;
      const recurrenceType = lookupNumber(recurrence?.recurrenceType);
      const startMatch = typeof recurrence?.startDate === 'string'
        ? recurrence.startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        : null;
      if (recurrenceType === 7 && startMatch) {
        if (lookupNumber(recurrence.month) === null) {
          const month = Number(startMatch[2]);
          const before = recurrence.month;
          recurrence.month = month;
          record(`${basePath}.recurrence.month`, before, month, 'yearly-date-inference');
        }
        if (lookupNumber(recurrence.dayOfYear) === null) {
          const dayOfMonth = Number(startMatch[3]);
          const before = recurrence.dayOfYear;
          recurrence.dayOfYear = dayOfMonth;
          record(`${basePath}.recurrence.dayOfYear`, before, dayOfMonth, 'yearly-date-inference');
        }
      }
    });
  });

  walk(data);
  return { data, repairs };
}
