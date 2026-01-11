// grid-factory.js
// Utility wrapper for creating Tabulator grids with consistent configuration

import { TabulatorFull as Tabulator } from '../node_modules/tabulator-tables/dist/js/tabulator_esm.min.js';

/**
 * Default Tabulator configuration for FTrack
 */
const defaultConfig = {
    layout: "fitDataStretch",
    responsiveLayout: "hide",
    selectable: true,
    selectableRangeMode: "click",
    maxHeight: "600px",
    rowHeight: 42,
    headerVisible: true,
    headerFilterPlaceholder: "Filter...",
    
    // Keyboard navigation enabled
    keybindings: {
        "navPrev": "shift + 9",      // Shift + Tab - previous cell
        "navNext": 9,                 // Tab - next cell
        "navUp": 38,                  // Up arrow
        "navDown": 40,                // Down arrow  
        "navLeft": 37,                // Left arrow
        "navRight": 39,               // Right arrow
        "scrollPageUp": 33,           // Page Up
        "scrollPageDown": 34,         // Page Down
        "scrollToStart": 36,          // Home
        "scrollToEnd": 35,            // End
        "undo": false,                // Disable Ctrl+Z (conflicts with browser)
        "redo": false,                // Disable Ctrl+Y
        "copyToClipboard": "ctrl + 67", // Ctrl+C for copy
    },
    
    // Enable tabbing through cells for editing
    tabEndNewRow: false  // Don't create new row when tabbing from last cell
};

/**
 * Create a Tabulator grid with FTrack defaults
 * @param {string|HTMLElement} element - Container element or selector
 * @param {Object} options - Tabulator options (merged with defaults)
 * @returns {Tabulator} - Tabulator instance
 */
export function createGrid(element, options = {}) {
    const config = {
        ...defaultConfig,
        ...options
    };
    
    return new Tabulator(element, config);
}

/**
 * Create column definition for row selection
 * @returns {Object} - Tabulator column config
 */
export function createSelectorColumn() {
    return {
        formatter: "rowSelection",
        titleFormatter: "rowSelection",
        headerSort: false,
        cellClick: function(e, cell) {
            cell.getRow().toggleSelect();
        },
        width: 50,
        hozAlign: "center",
        headerHozAlign: "center"
    };
}

/**
 * Create column definition with header filter
 * @param {string} title - Column title
 * @param {string} field - Data field name
 * @param {Object} options - Additional options
 * @returns {Object} - Tabulator column config
 */
export function createTextColumn(title, field, options = {}) {
    return {
        title,
        field,
        headerSort: true,
        headerFilter: "input",
        headerHozAlign: "left",
        ...options
    };
}

/**
 * Create column definition for object fields (type.name, currency.name, etc)
 * @param {string} title - Column title
 * @param {string} field - Data field name
 * @param {string} subField - Nested field (e.g., 'name')
 * @param {Object} options - Additional options
 * @returns {Object} - Tabulator column config
 */
export function createObjectColumn(title, field, subField = 'name', options = {}) {
    return {
        title,
        field,
        formatter: function(cell) {
            const value = cell.getValue();
            if (value && value[subField]) return value[subField];
            return value || '';
        },
        headerSort: true,
        headerFilter: "input",
        headerFilterFunc: function(headerValue, rowValue, rowData, filterParams) {
            const displayValue = rowValue?.[subField] || '';
            return displayValue.toLowerCase().includes(headerValue.toLowerCase());
        },
        headerHozAlign: "left",
        ...options
    };
}

/**
 * Create column definition for monetary values
 * @param {string} title - Column title
 * @param {string} field - Data field name
 * @param {Object} options - Additional options
 * @returns {Object} - Tabulator column config
 */
export function createMoneyColumn(title, field, options = {}) {
    return {
        title,
        field,
        formatter: "money",
        formatterParams: {
            decimal: ".",
            thousand: ",",
            precision: 2
        },
        hozAlign: "right",
        headerHozAlign: "right",
        ...options
    };
}

/**
 * Create column definition for dates
 * @param {string} title - Column title
 * @param {string} field - Data field name
 * @param {Object} options - Additional options
 * @returns {Object} - Tabulator column config
 */
export function createDateColumn(title, field, options = {}) {
    return {
        title,
        field,
        headerSort: true,
        headerHozAlign: "left",
        ...options
    };
}

/**
 * Standard event handlers
 */
export const gridEvents = {
    /**
     * Handle row selection changes
     */
    onSelectionChanged: function(callback) {
        return function(data, rows) {
            callback(rows.length, rows);
        };
    },
    
    /**
     * Handle cell edits
     */
    onCellEdited: function(callback) {
        return function(cell) {
            const row = cell.getRow();
            const data = row.getData();
            callback(data, cell.getField(), cell.getValue());
        };
    }
};
