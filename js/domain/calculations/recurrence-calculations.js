/**
 * recurrence-calculations.js
 * Date recurrence generation for planned transactions
 */

import { parseDateOnly } from '../../shared/date-utils.js';

/**
 * Get the Nth occurrence of a weekday in a month
 * @param {Date} date - The month/year to search in
 * @param {number} weekday - Day of week (0=Sunday, 6=Saturday)
 * @param {number} n - Which occurrence (1-4, or -1 for last)
 * @returns {Date} - The date of the Nth weekday
 */
export function getNthWeekdayOfMonth(date, weekday, n) {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  if (n === -1) {
    // Last occurrence - start from end of month and work backwards
    const lastDay = new Date(year, month + 1, 0);
    let currentDay = lastDay.getDate();
    
    while (currentDay > 0) {
      const testDate = new Date(year, month, currentDay);
      if (testDate.getDay() === weekday) {
        return testDate;
      }
      currentDay--;
    }
  } else {
    // Nth occurrence - start from beginning of month
    let count = 0;
    for (let day = 1; day <= 31; day++) {
      const testDate = new Date(year, month, day);
      if (testDate.getMonth() !== month) break; // Moved to next month
      if (testDate.getDay() === weekday) {
        count++;
        if (count === n) {
          return testDate;
        }
      }
    }
  }
  
  return null;
}

/**
 * Get number of quarters between two dates
 * @param {Date} start - Start date
 * @param {Date} end - End date
 * @returns {number} - Number of quarters (returns 0 if end is before start)
 */
export function getQuartersBetween(start, end) {
  // Handle edge case where end is before start
  if (end < start) {
    return 0;
  }
  
  const startYear = start.getFullYear();
  const startQuarter = Math.floor(start.getMonth() / 3);
  const endYear = end.getFullYear();
  const endQuarter = Math.floor(end.getMonth() / 3);
  
  return (endYear - startYear) * 4 + (endQuarter - startQuarter);
}

/**
 * Get number of periods between two dates
 * @param {Date} start - Start date
 * @param {Date} end - End date
 * @param {string} frequency - Frequency type (Daily, Weekly, Monthly, Quarterly, Yearly)
 * @returns {number} - Number of periods
 */
export function getPeriodsBetween(start, end, frequency) {
  const diffMs = end - start;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  
  switch (frequency) {
    case 'Daily':
      return Math.floor(diffDays);
    case 'Weekly':
      return Math.floor(diffDays / 7);
    case 'Monthly':
      const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      return months;
    case 'Quarterly':
      return getQuartersBetween(start, end);
    case 'Yearly':
      return end.getFullYear() - start.getFullYear();
    default:
      return 0;
  }
}

/**
 * Generate recurrence dates based on recurrence configuration
 * @param {Object} recurrence - Recurrence configuration object
 * @param {Date} projectionStart - Start date for projections
 * @param {Date} projectionEnd - End date for projections
 * @returns {Date[]} - Array of dates when transaction should occur
 */
export function generateRecurrenceDates(recurrence, projectionStart, projectionEnd) {
  if (!recurrence || !recurrence.recurrenceType) {
    return [];
  }
  
  const dates = [];
  const startDate = recurrence.startDate ? parseDateOnly(recurrence.startDate) : new Date(projectionStart);
  const endDate = recurrence.endDate ? parseDateOnly(recurrence.endDate) : new Date(projectionEnd);
  
  // Ensure we're working with the projection window
  const effectiveStart = startDate > projectionStart ? startDate : projectionStart;
  const effectiveEnd = endDate < projectionEnd ? endDate : projectionEnd;
  
  const recurrenceTypeId = typeof recurrence.recurrenceType === 'number'
    ? recurrence.recurrenceType
    : recurrence.recurrenceType?.id;

  if (!recurrenceTypeId) {
    return [];
  }

  switch (recurrenceTypeId) {
    case 1: // One Time
      if (startDate >= projectionStart && startDate <= projectionEnd) {
        dates.push(new Date(startDate));
      }
      break;

    case 2: // Daily
      const interval = recurrence.interval || 1;
      let currentDate = new Date(effectiveStart);
      while (currentDate <= effectiveEnd) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + interval);
      }
      break;

    case 3: { // Weekly
      const weekInterval = recurrence.interval || 1;
      const dayOfWeekId = typeof recurrence.dayOfWeek === 'number'
        ? recurrence.dayOfWeek
        : recurrence.dayOfWeek?.id;
      
      // If no day of week specified, use the day of week from startDate
      let targetDayOfWeek;
      if (dayOfWeekId !== undefined && dayOfWeekId !== null) {
        // dayOfWeek.id mapping: 0=Sunday, 1=Monday, 2=Tuesday, ..., 6=Saturday
        // This matches JavaScript's getDay() directly
        targetDayOfWeek = dayOfWeekId;
      } else {
        // Use the day of week from the recurrence start date
        targetDayOfWeek = startDate.getDay();
      }
      
      // Start from the recurrence anchor date and find the first occurrence of the target day
      let weekDate = new Date(startDate);
      
      // Adjust weekDate to the target day of week if it's not already on that day
      const currentDay = weekDate.getDay();
      if (currentDay !== targetDayOfWeek) {
        const daysToAdd = (targetDayOfWeek - currentDay + 7) % 7;
        weekDate.setDate(weekDate.getDate() + daysToAdd);
      }
      
      // If the first occurrence is before effectiveStart, advance by the interval to find the first one in range
      if (weekDate < effectiveStart) {
        const daysDiff = Math.floor((effectiveStart - weekDate) / (1000 * 60 * 60 * 24));
        const weeksDiff = Math.floor(daysDiff / 7);
        // Calculate how many intervals to skip to get into the range
        const intervalsToSkip = Math.ceil(weeksDiff / weekInterval);
        weekDate.setDate(weekDate.getDate() + (intervalsToSkip * 7 * weekInterval));
      }
      
      // Generate all occurrences within the effective range
      while (weekDate <= effectiveEnd) {
        if (weekDate >= effectiveStart) {
          dates.push(new Date(weekDate));
        }
        weekDate.setDate(weekDate.getDate() + (7 * weekInterval));
      }
      break;
    }

    case 4: { // Monthly - Day of Month
      const dayOfMonth = recurrence.dayOfMonth || 1;
      let monthDate = new Date(effectiveStart.getFullYear(), effectiveStart.getMonth(), 1);
      
      while (monthDate <= effectiveEnd) {
        // Handle day of month (1-31, or -1 for last day)
        let targetDay;
        if (dayOfMonth === -1) {
          targetDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
        } else {
          targetDay = Math.min(dayOfMonth, new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate());
        }
        
        const occurrenceDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), targetDay);
        if (occurrenceDate >= effectiveStart && occurrenceDate <= effectiveEnd) {
          dates.push(occurrenceDate);
        }
        
        monthDate.setMonth(monthDate.getMonth() + 1);
      }
      break;
    }

    case 5: { // Monthly - Week of Month
      const weekOfMonthId = typeof recurrence.weekOfMonth === 'number'
        ? recurrence.weekOfMonth
        : recurrence.weekOfMonth?.id;
      const rawDayOfWeekInMonth = typeof recurrence.dayOfWeekInMonth === 'number'
        ? recurrence.dayOfWeekInMonth
        : recurrence.dayOfWeekInMonth?.id;
      const weekOfMonth = weekOfMonthId === 5 ? -1 : (weekOfMonthId || 1);
      const dayOfWeekInMonth = rawDayOfWeekInMonth === 7
        ? 0
        : (rawDayOfWeekInMonth || 1);
      let monthWeekDate = new Date(effectiveStart.getFullYear(), effectiveStart.getMonth(), 1);
      
      while (monthWeekDate <= effectiveEnd) {
        const nthDay = getNthWeekdayOfMonth(monthWeekDate, dayOfWeekInMonth, weekOfMonth);
        if (nthDay && nthDay >= effectiveStart && nthDay <= effectiveEnd) {
          dates.push(nthDay);
        }
        monthWeekDate.setMonth(monthWeekDate.getMonth() + 1);
      }
      break;
    }

    case 6: { // Quarterly
      const dayOfQuarter = recurrence.dayOfQuarter || 1;
      let quarterDate = new Date(effectiveStart.getFullYear(), Math.floor(effectiveStart.getMonth() / 3) * 3, 1);
      
      while (quarterDate <= effectiveEnd) {
        // Add dayOfQuarter - 1 days to start of quarter
        const occurrenceDate = new Date(quarterDate);
        occurrenceDate.setDate(occurrenceDate.getDate() + dayOfQuarter - 1);
        
        if (occurrenceDate >= effectiveStart && occurrenceDate <= effectiveEnd) {
          dates.push(occurrenceDate);
        }
        
        quarterDate.setMonth(quarterDate.getMonth() + 3);
      }
      break;
    }

    case 7: { // Yearly
      const monthId = typeof recurrence.month === 'number'
        ? recurrence.month
        : recurrence.month?.id;
      const month = monthId || 1;
      const dayOfYear = recurrence.dayOfYear || 1;
      let yearDate = new Date(effectiveStart.getFullYear(), month - 1, dayOfYear);
      
      // If first occurrence is before effective start, move to next year
      if (yearDate < effectiveStart) {
        yearDate.setFullYear(yearDate.getFullYear() + 1);
      }
      
      while (yearDate <= effectiveEnd) {
        if (yearDate >= effectiveStart) {
          dates.push(new Date(yearDate));
        }
        yearDate.setFullYear(yearDate.getFullYear() + 1);
      }
      break;
    }

    case 11: // Custom Dates
      if (recurrence.customDates) {
        const customDateStrings = recurrence.customDates.split(',').map(value => value.trim()).filter(Boolean);
        customDateStrings.forEach(dateStr => {
          const customDate = parseDateOnly(dateStr);
          if (customDate && customDate >= effectiveStart && customDate <= effectiveEnd) {
            dates.push(customDate);
          }
        });
      }
      break;
  }
  
  // Ensure all generated dates are Date objects at local midnight
  return dates.sort((a, b) => a - b);
}
