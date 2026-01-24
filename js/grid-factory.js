// grid-factory.js
// Utility wrapper for creating Tabulator grids with consistent configuration

import { TabulatorFull as Tabulator } from '../node_modules/tabulator-tables/dist/js/tabulator_esm.min.js';
import { createLogger } from './logger.js';

const logger = createLogger('GridFactory');

/**
 * Default Tabulator configuration for FTrack
 */
const defaultConfig = {
    layout: "fitColumns",
    responsiveLayout: "hide",
    selectable: false, // Disable by default - grids can override if needed
    selectableRangeMode: false, // Disable to allow cell editing
    // Allow grids to decide if a row is selectable. Log calls for debugging.
    selectableCheck: function(row) {
        try { logger.debug('selectableCheck: row id', row.getData() && row.getData().id); } catch (e) { /* noop */ }
        return true; // Default to selectable
    },
    editTriggerEvent: "dblclick", // Double-click to edit cells (allows single-click for row selection)
    maxHeight: "100%",
    rowHeight: 42,
    headerVisible: true,
    headerFilterPlaceholder: "Filter...",
    
    // Keyboard navigation enabled
    keybindings: {
        "navPrev": "shift + 9",      // Shift + Tab - previous cell
        "navNext": 9,                 // Tab - next cell
        "navUp": 38,                  // Up arrow
        "navDown": 40,                // Down arrow  
        "navLeft": 37,               // Left arrow
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
    // Extract cellEdited before merging
    const { cellEdited, ...tabulatorOptions } = options;
    
    // Merge options - specific options override defaults
    const config = {
        ...defaultConfig,
        ...tabulatorOptions
    };
    
    // Explicitly validate selectable option
    if (config.selectable === 1 || config.selectable === true) {
        // Ensure dependent options are set for robust single selection
        // For Tabulator 6, we prefer integer 1 for single row
        if (config.selectable === true) config.selectable = 1;
        
        config.selectableRangeMode = false;
        // selectableRollingSelection: true allows re-selecting the same row (triggers event) or different row
        config.selectableRollingSelection = true; 
        config.selectablePersistence = false; // Important: Clear selection on reload
    }
    
    logger.info(`Creating grid on element ID: ${element.id || 'N/A'}`, { 
        selectable: config.selectable, 
        selector: element.id || element 
    });
    
    const table = new Tabulator(element, config);

    // Instrument selection events for debugging
    table.on("rowSelected", function(row){
        logger.info(`Row Selected in ${element.id||'Grid'}:`, row.getData().id);
        try {
            const el = row.getElement();
            if (el && el.classList) el.classList.add('custom-selected');
            logger.debug(`Row element classes: ${el ? el.className : 'no-el'}`);
        } catch (e) { logger.error('rowSelected diagnostics failed', e); }
    });
    
    table.on("rowDeselected", function(row){
        logger.debug(`Row Deselected in ${element.id||'Grid'}:`, row.getData().id);
        try {
            const el = row.getElement();
            if (el && el.classList) el.classList.remove('custom-selected');
        } catch (e) { logger.error('rowDeselected diagnostics failed', e); }
    });

    // Additional instrumentation: clicks and table lifecycle
    table.on("rowClick", function(e, row){
        try { logger.info(`Row Click in ${element.id||'Grid'}:`, row.getData().id, 'target=', e.target && e.target.tagName); } catch (err) { logger.info('Row Click in Grid (no id)'); }
    });

    table.on("cellClick", function(e, cell){
        try { logger.debug(`Cell Click in ${element.id||'Grid'}:`, cell.getField(), 'target=', e.target && e.target.tagName); } catch (err) { logger.debug('Cell Click in Grid'); }
    });

    table.on("tableBuilt", function(){
        logger.info(`Table built: ${element.id||'Grid'}`);
    });
    
    if (cellEdited) {
        table.on("cellEdited", (cell) => {
            logger.info(`Cell Edited in ${element.id||'Grid'}:`, cell.getField(), cell.getValue());
            cellEdited(cell);
        });
    }
    
    return table;
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
        editor: "input",
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
 * Create a minimal list editor config for Tabulator
 * Accepts an array of objects and maps them to {label, value} pairs
 * Keeps the underlying value as the original object so it can be stored directly
 */
export function createListEditor(values = []) {
    const mapValues = values.map(v => {
        if (typeof v === 'string') return { label: v, value: v };
        if (v && (v.label || v.name)) return { label: v.label || v.name, value: v };
        return { label: String(v), value: v };
    });

    return {
        editor: 'list',
        editorParams: {
            values: mapValues
        }
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
        editor: "number",
        editorParams: { step: 0.01 },
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
        editor: "date",
        headerSort: true,
        headerHozAlign: "left",
        ...options
    };
}

// Consolidated list editor helper: use the single `createListEditor(values)`
// defined earlier which returns editorParams with array of {label, value} entries
// (value is the full object) and includes autocomplete/clearable settings.
// This avoids duplicated helpers and keeps behavior consistent across grids.


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
