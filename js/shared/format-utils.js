/**
 * format-utils.js
 * Formatting utilities for display
 */

/**
 * Format a value as currency using the application's standard locale (en-ZA).
 * Produces output consistent with Intl.NumberFormat used across grids and toolbars.
 * @param {number} value - The numeric value to format
 * @param {string} currency - Currency code (default: 'ZAR')
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} - Formatted currency string
 */
/**
 * Returns a CSS class name based on the sign of a numeric value.
 * Use with .positive (green), .negative (red), .zero (blue) utility classes.
 * @param {number} value
 * @returns {'positive'|'negative'|'zero'}
 */
export function numValueClass(value) {
    const n = Number(value) || 0;
    if (n > 0) return 'positive';
    if (n < 0) return 'negative';
    return 'zero';
}

export function formatCurrency(value, currency = 'ZAR', decimals = 2) {
    const numeric = Number(value) || 0;
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(numeric);
}

/**
 * Format a value as a colored currency HTML span for display.
 * Applies .positive (green), .negative (red), or .zero (blue) via status-netchange class.
 * This is the single source of truth for all colored currency display in the application.
 * @param {number} value - The numeric value to format
 * @param {string} currency - Currency code (default: 'ZAR')
 * @returns {string} - HTML string: <span class="status-netchange positive|negative|zero">...</span>
 */
export function formatMoneyDisplay(value, currency = 'ZAR') {
    const numeric = Number(value) || 0;
    const formatted = formatCurrency(numeric, currency);
    const cls = `status-netchange ${numValueClass(numeric)}`;
    return `<span class="${cls}">${formatted}</span>`;
}
