/**
 * format-utils.js
 * Formatting utilities for display
 */

/**
 * Format a value as currency
 * @param {number} value - The numeric value to format
 * @param {string} currency - Currency code (default: 'ZAR')
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} - Formatted currency string
 */
export function formatCurrency(value, currency = 'ZAR', decimals = 2) {
    const formatted = value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${currency} ${formatted}`;
}
