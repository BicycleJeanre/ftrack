import { formatDateOnly } from './date-utils.js';

export function toPeriodId(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

export function findPeriodById(periods = [], periodId = null) {
  const targetId = toPeriodId(periodId);
  if (!targetId) return null;
  return (Array.isArray(periods) ? periods : [])
    .find((period) => toPeriodId(period?.id) === targetId) || null;
}

export function findPeriodIndexById(periods = [], periodId = null) {
  const targetId = toPeriodId(periodId);
  if (!targetId) return -1;
  return (Array.isArray(periods) ? periods : [])
    .findIndex((period) => toPeriodId(period?.id) === targetId);
}

export function toDateKey(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatDateOnly(value);
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return formatDateOnly(date);
  return String(value);
}

export function getPeriodDateRange(periods = [], periodId = null) {
  const period = findPeriodById(periods, periodId);
  if (!period?.startDate || !period?.endDate) {
    return { period: period || null, startKey: null, endKey: null };
  }

  return {
    period,
    startKey: toDateKey(period.startDate),
    endKey: toDateKey(period.endDate)
  };
}

export function isDateInRange(value, { startKey = null, endKey = null } = {}) {
  if (!startKey || !endKey) return true;
  const key = toDateKey(value);
  if (!key) return false;
  return key >= startKey && key <= endKey;
}

export function filterByDateRange(rows = [], {
  startKey = null,
  endKey = null,
  dateField = 'effectiveDate'
} = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!startKey || !endKey) return list;
  return list.filter((row) => isDateInRange(row?.[dateField], { startKey, endKey }));
}
