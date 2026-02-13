// recurrence-utils.js
// Utilities for rendering recurrence descriptions

import { parseDateOnly } from '../../shared/date-utils.js';

// Generate human-readable recurrence description from recurrence object
export function getRecurrenceDescription(recurrence) {
  if (!recurrence || !recurrence.recurrenceType) return '';

  const typeId = recurrence.recurrenceType.id;
  const interval = recurrence.interval && recurrence.interval > 1 ? recurrence.interval : 1;
  const end = recurrence.endDate ? ` until ${recurrence.endDate}` : '';

  const getWeekday = () => {
    if (recurrence.dayOfWeek?.name) return recurrence.dayOfWeek.name;
    if (recurrence.startDate) {
      const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const d = new Date(recurrence.startDate);
      return weekdayNames[d.getUTCDay()];
    }
    return null;
  };

  const getDayOfMonth = () => {
    if (recurrence.dayOfMonth) return recurrence.dayOfMonth;
    if (recurrence.startDate) return parseDateOnly(recurrence.startDate).getDate();
    return null;
  };

  const formatYearlyAnchor = () => {
    if (!recurrence.startDate) return null;
    const d = parseDateOnly(recurrence.startDate);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
  };

  // Descriptions per recurrence type
  switch (typeId) {
    case 1: // One Time
      return recurrence.startDate ? `One time on ${recurrence.startDate}` : 'One time';
    case 2: // Daily
      return interval === 1 ? `Every day${end}` : `Every ${interval} days${end}`;
    case 3: { // Weekly
      const dow = getWeekday();
      const dayPart = dow ? ` on ${dow}` : '';
      return interval === 1 ? `Every week${dayPart}${end}` : `Every ${interval} weeks${dayPart}${end}`;
    }
    case 4: { // Monthly - Day of Month
      const dom = getDayOfMonth();
      const dayPart = dom ? ` on day ${dom}` : '';
      return interval === 1 ? `Every month${dayPart}${end}` : `Every ${interval} months${dayPart}${end}`;
    }
    case 5: { // Monthly - Week of Month (fallback wording)
      const dow = getWeekday();
      const week = recurrence.weekOfMonth ? `${recurrence.weekOfMonth} week` : 'week';
      const dayPart = dow ? ` on ${dow}` : '';
      return interval === 1 ? `Every month (${week}${dayPart})${end}` : `Every ${interval} months (${week}${dayPart})${end}`;
    }
    case 6: { // Quarterly
      const dom = getDayOfMonth();
      const dayPart = dom ? ` on day ${dom}` : '';
      return interval === 1 ? `Every quarter${dayPart}${end}` : `Every ${interval} quarters${dayPart}${end}`;
    }
    case 7: { // Yearly
      const anchor = formatYearlyAnchor();
      const dayPart = anchor ? ` on ${anchor}` : '';
      return interval === 1 ? `Every year${dayPart}${end}` : `Every ${interval} years${dayPart}${end}`;
    }
    case 11: { // Custom Dates
      const count = recurrence.customDates ? recurrence.customDates.split(',').filter(Boolean).length : 0;
      return count > 0 ? `Custom: ${count} dates` : 'Custom dates';
    }
    default:
      return recurrence.recurrenceType.name || 'Recurring';
  }
}
