// date-utils.js
// Helper to format and parse date-only (YYYY-MM-DD) values

/**
 * Format a Date (or date string) as YYYY-MM-DD
 * @param {Date|string} d
 * @returns {string}
 */
export function formatDateOnly(d) {
  if (!d) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  if (typeof d === 'string') {
    // If already in YYYY-MM-DD format, return as-is to avoid UTC parsing
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    // Otherwise parse and format
    const parsed = parseDateOnly(d);
    if (parsed) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }

  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string into a Date at local midnight
 * @param {string} s
 * @returns {Date}
 */
export function parseDateOnly(s) {
  if (!s) return null;
  const parts = s.split('-').map(p => Number(p));
  return new Date(parts[0], parts[1] - 1, parts[2]);
}
