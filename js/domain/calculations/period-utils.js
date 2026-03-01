/**
 * period-utils.js
 * Pure domain utility: generate period arrays from a date range and period type.
 * No I/O or side effects — safe to call from any layer.
 */

import { parseDateOnly } from '../../shared/date-utils.js';

/**
 * Generate period objects for a given date window and period type.
 * @param {string|Date} startDate  - Window start (ISO string or Date)
 * @param {string|Date} endDate    - Window end (ISO string or Date)
 * @param {string}      periodType - 'Day' | 'Week' | 'Month' | 'Quarter' | 'Year'
 * @returns {Array<{id: string, label: string, startDate: Date, endDate: Date}>}
 */
export function generatePeriods(startDate, endDate, periodType) {
  const start = typeof startDate === 'string' ? parseDateOnly(startDate) : new Date(startDate);
  const end   = typeof endDate   === 'string' ? parseDateOnly(endDate)   : new Date(endDate);
  const periods = [];
  let current = new Date(start);

  while (current <= end) {
    if (periodType === 'Day') {
      const periodId = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
      const dayName   = current.toLocaleString('default', { weekday: 'long' });
      const monthName = current.toLocaleString('default', { month: 'short' });
      const day  = current.getDate();
      const year = current.getFullYear();
      periods.push({
        id: periodId,
        label: `${dayName}, ${monthName} ${day}, ${year}`,
        startDate: new Date(current),
        endDate:   new Date(current)
      });
      current.setDate(current.getDate() + 1);

    } else if (periodType === 'Month') {
      const periodId  = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
      const monthName = current.toLocaleString('default', { month: 'long' });
      const year = current.getFullYear();
      periods.push({
        id: periodId,
        label: `${monthName} ${year}`,
        startDate: new Date(current.getFullYear(), current.getMonth(), 1),
        endDate:   new Date(current.getFullYear(), current.getMonth() + 1, 0)
      });
      current.setMonth(current.getMonth() + 1);

    } else if (periodType === 'Week') {
      // Align to Monday as week start (ISO week)
      const weekStart = new Date(current);
      const day  = weekStart.getDay();
      const diff = (day + 6) % 7; // days since Monday
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
      periods.push({ id: periodId, label, startDate: weekStart, endDate: clippedEnd });
      current.setDate(current.getDate() + 7);

    } else if (periodType === 'Quarter') {
      const quarter      = Math.floor(current.getMonth() / 3) + 1;
      const quarterStart = new Date(current.getFullYear(), (quarter - 1) * 3, 1);
      if (quarterStart > end) break;
      let quarterEnd = new Date(current.getFullYear(), quarter * 3, 0);
      quarterEnd = quarterEnd > end ? new Date(end) : quarterEnd;
      periods.push({
        id:        `${current.getFullYear()}-Q${quarter}`,
        label:     `Q${quarter} ${current.getFullYear()}`,
        startDate: quarterStart,
        endDate:   quarterEnd
      });
      current.setMonth(current.getMonth() + 3);

    } else if (periodType === 'Year') {
      const yearStart = new Date(current.getFullYear(), 0, 1);
      if (yearStart > end) break;
      let yearEnd = new Date(current.getFullYear(), 11, 31);
      yearEnd = yearEnd > end ? new Date(end) : yearEnd;
      periods.push({
        id:        `${current.getFullYear()}`,
        label:     `${current.getFullYear()}`,
        startDate: yearStart,
        endDate:   yearEnd
      });
      current.setFullYear(current.getFullYear() + 1);

    } else {
      // Unknown type — default advance by one month to avoid infinite loop
      current.setMonth(current.getMonth() + 1);
    }
  }

  return periods;
}
