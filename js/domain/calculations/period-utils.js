/**
 * period-utils.js
 * Pure domain utility: generate period arrays from a date range and period type.
 * No I/O or side effects — safe to call from any layer.
 */

import { parseDateOnly } from '../../shared/date-utils.js';

/** Format a local-time Date to YYYY-MM-DD without timezone conversion */
function dStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Generate period objects for a given date range and period type.
 * @param {string} startDate  - Window start (YYYY-MM-DD)
 * @param {string} endDate    - Window end (YYYY-MM-DD)
 * @param {string} periodType - 'Day' | 'Week' | 'Month' | 'Quarter' | 'Year'
 * @returns {Array<{id: string, label: string, startDate: string, endDate: string}>}
 */
export function generatePeriods(startDate, endDate, periodType) {
  const start = typeof startDate === 'string' ? parseDateOnly(startDate) : startDate;
  const end   = typeof endDate   === 'string' ? parseDateOnly(endDate)   : endDate;
  const periods = [];
  let current = parseDateOnly(dStr(start));

  while (current <= end) {
    if (periodType === 'Day') {
      const periodId = dStr(current);
      const dayName   = current.toLocaleString('default', { weekday: 'long' });
      const monthName = current.toLocaleString('default', { month: 'short' });
      const day  = current.getDate();
      const year = current.getFullYear();
      periods.push({
        id: periodId,
        label: `${dayName}, ${monthName} ${day}, ${year}`,
        startDate: periodId,
        endDate:   periodId
      });
      current.setDate(current.getDate() + 1);

    } else if (periodType === 'Month') {
      const periodId  = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
      const monthName = current.toLocaleString('default', { month: 'long' });
      const year = current.getFullYear();
      const mStart = new Date(current.getFullYear(), current.getMonth(), 1);
      const mEnd   = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      periods.push({
        id: periodId,
        label: `${monthName} ${year}`,
        startDate: dStr(mStart),
        endDate:   dStr(mEnd)
      });
      current.setMonth(current.getMonth() + 1);

    } else if (periodType === 'Week') {
      const weekStart = new Date(current);
      const day  = weekStart.getDay();
      const diff = (day + 6) % 7;
      weekStart.setDate(weekStart.getDate() - diff);
      if (weekStart > end) break;

      const weekEnd    = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const clippedEnd = weekEnd > end ? new Date(end) : weekEnd;

      const weekNum    = Math.ceil(((weekStart - start) / 86400000 + 1) / 7);
      const periodId   = `${weekStart.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
      const startMonth = weekStart.toLocaleString('default', { month: 'short' });
      const endMonth   = clippedEnd.toLocaleString('default', { month: 'short' });
      const label = startMonth === endMonth
        ? `Week ${weekNum}: ${startMonth} ${weekStart.getDate()}-${clippedEnd.getDate()}, ${weekStart.getFullYear()}`
        : `Week ${weekNum}: ${startMonth} ${weekStart.getDate()} - ${endMonth} ${clippedEnd.getDate()}, ${weekStart.getFullYear()}`;
      periods.push({ id: periodId, label, startDate: dStr(weekStart), endDate: dStr(clippedEnd) });
      current.setDate(current.getDate() + 7);

    } else if (periodType === 'Quarter') {
      const quarter      = Math.floor(current.getMonth() / 3) + 1;
      const quarterStart = new Date(current.getFullYear(), (quarter - 1) * 3, 1);
      if (quarterStart > end) break;
      const quarterEndRaw = new Date(current.getFullYear(), quarter * 3, 0);
      const clippedQEnd   = quarterEndRaw > end ? new Date(end) : quarterEndRaw;
      periods.push({
        id:        `${current.getFullYear()}-Q${quarter}`,
        label:     `Q${quarter} ${current.getFullYear()}`,
        startDate: dStr(quarterStart),
        endDate:   dStr(clippedQEnd)
      });
      current.setMonth(current.getMonth() + 3);

    } else if (periodType === 'Year') {
      const yearStart = new Date(current.getFullYear(), 0, 1);
      if (yearStart > end) break;
      const yearEndRaw  = new Date(current.getFullYear(), 11, 31);
      const clippedYEnd = yearEndRaw > end ? new Date(end) : yearEndRaw;
      periods.push({
        id:        `${current.getFullYear()}`,
        label:     `${current.getFullYear()}`,
        startDate: dStr(yearStart),
        endDate:   dStr(clippedYEnd)
      });
      current.setFullYear(current.getFullYear() + 1);

    } else {
      current.setMonth(current.getMonth() + 1);
    }
  }

  return periods;
}
