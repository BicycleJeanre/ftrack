// calculation-utils.js
// Utility functions for recurrence date generation and periodic change calculations

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
  const startDate = new Date(recurrence.startDate || projectionStart);
  const endDate = recurrence.endDate ? new Date(recurrence.endDate) : projectionEnd;
  
  // Ensure we're working with the projection window
  const effectiveStart = startDate > projectionStart ? startDate : projectionStart;
  const effectiveEnd = endDate < projectionEnd ? endDate : projectionEnd;
  
  switch (recurrence.recurrenceType) {
    case 'One Time':
      if (startDate >= projectionStart && startDate <= projectionEnd) {
        dates.push(new Date(startDate));
      }
      break;
      
    case 'Daily':
      const interval = recurrence.interval || 1;
      let currentDate = new Date(effectiveStart);
      while (currentDate <= effectiveEnd) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + interval);
      }
      break;
      
    case 'Weekly':
      const weekInterval = recurrence.interval || 1;
      const dayOfWeek = recurrence.dayOfWeek?.id || 1; // Monday default
      
      // Find first occurrence on or after effective start
      let weekDate = new Date(effectiveStart);
      const currentDayOfWeek = weekDate.getDay();
      const daysUntilTarget = (dayOfWeek - currentDayOfWeek + 7) % 7;
      weekDate.setDate(weekDate.getDate() + daysUntilTarget);
      
      while (weekDate <= effectiveEnd) {
        if (weekDate >= effectiveStart) {
          dates.push(new Date(weekDate));
        }
        weekDate.setDate(weekDate.getDate() + (7 * weekInterval));
      }
      break;
      
    case 'Monthly - Day of Month':
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
      
    case 'Monthly - Week of Month':
      const weekOfMonth = recurrence.weekOfMonth?.id || 1;
      const dayOfWeekInMonth = recurrence.dayOfWeekInMonth?.id || 1;
      let monthWeekDate = new Date(effectiveStart.getFullYear(), effectiveStart.getMonth(), 1);
      
      while (monthWeekDate <= effectiveEnd) {
        const nthDay = getNthWeekdayOfMonth(monthWeekDate, dayOfWeekInMonth, weekOfMonth);
        if (nthDay && nthDay >= effectiveStart && nthDay <= effectiveEnd) {
          dates.push(nthDay);
        }
        monthWeekDate.setMonth(monthWeekDate.getMonth() + 1);
      }
      break;
      
    case 'Quarterly':
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
      
    case 'Yearly':
      const month = recurrence.month?.id || 1;
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
      
    case 'Custom Dates':
      if (recurrence.customDates) {
        const customDateStrings = recurrence.customDates.split(',').map(d => d.trim());
        customDateStrings.forEach(dateStr => {
          const customDate = new Date(dateStr);
          if (customDate >= effectiveStart && customDate <= effectiveEnd) {
            dates.push(customDate);
          }
        });
      }
      break;
  }
  
  return dates.sort((a, b) => a - b);
}

/**
 * Calculate periodic change (interest/growth) for a given amount
 * @param {number} principal - Starting amount
 * @param {Object} periodicChange - Periodic change configuration
 * @param {number} periods - Number of periods to calculate
 * @returns {number} - Final amount after periodic change
 */
export function calculatePeriodicChange(principal, periodicChange, periods) {
  if (!periodicChange || !periodicChange.rate || periodicChange.rate === 0) {
    return principal;
  }
  
  const rate = periodicChange.rate / 100; // Convert percentage to decimal
  const changeType = periodicChange.changeType || 'Nominal Annual';
  
  switch (changeType) {
    case 'Nominal Annual':
      // Simple interest: FV = PV * (1 + r * t)
      return principal * (1 + rate * periods);
      
    case 'Monthly Compounded':
      // FV = PV * (1 + r/12)^(12*t)
      // Assuming periods are in years
      return principal * Math.pow(1 + rate / 12, 12 * periods);
      
    case 'Daily Compounded':
      // FV = PV * (1 + r/365)^(365*t)
      return principal * Math.pow(1 + rate / 365, 365 * periods);
      
    case 'Quarterly Compounded':
      // FV = PV * (1 + r/4)^(4*t)
      return principal * Math.pow(1 + rate / 4, 4 * periods);
      
    case 'Annual Compounded':
      // FV = PV * (1 + r)^t
      return principal * Math.pow(1 + rate, periods);
      
    case 'Continuous':
      // FV = PV * e^(r*t)
      return principal * Math.exp(rate * periods);
      
    case 'Custom':
      const frequency = periodicChange.frequency?.name || 'Monthly';
      let n; // Compounding frequency per year
      
      switch (frequency) {
        case 'Daily':
          n = 365;
          break;
        case 'Weekly':
          n = 52;
          break;
        case 'Monthly':
          n = 12;
          break;
        case 'Quarterly':
          n = 4;
          break;
        case 'Yearly':
          n = 1;
          break;
        default:
          n = 12;
      }
      
      // FV = PV * (1 + r/n)^(n*t)
      return principal * Math.pow(1 + rate / n, n * periods);
      
    default:
      return principal;
  }
}
