// grid-factory.js
// Utility wrapper for creating Tabulator grids with consistent configuration

import { createLogger } from '../../../shared/logger.js';
import { notifyError, confirmDialog } from '../../../shared/notifications.js';
// formatMoneyDisplay is the canonical colored currency HTML function — defined in format-utils.js
import { formatMoneyDisplay } from '../../../shared/format-utils.js';
export { formatMoneyDisplay };

const logger = createLogger('GridFactory');

// Get Tabulator - from global CDN (loaded in forecast.html as UMD)
async function getTabulatorLib() {
  if (!window.Tabulator) {
    throw new Error('Tabulator library not loaded. Check if CDN script is included.');
  }
  return window.Tabulator;
}

/**
 * Default Tabulator configuration for FTrack
 */
const defaultConfig = {
    layout: "fitColumns",
    responsiveLayout: "hide",
    index: "id",
    // NO height or maxHeight - let Tabulator grow to fit all rows
    // Container will handle scrolling
    selectable: false, // Disable by default - grids can override if needed
    selectableRangeMode: false, // Disable to allow cell editing
    // Allow grids to decide if a row is selectable. Log calls for debugging.
    selectableCheck: function(row) {
        return true; // Default to selectable
    },
    editTriggerEvent: "dblclick", // Double-click to edit cells (allows single-click for row selection)
    rowHeight: 42,
    headerVisible: true,
    headerFilterPlaceholder: "Filter...",
    headerWordWrap: true,
    placeholderHeaderFilter: "No matching data", // Message when filter returns no results
    
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
 * @returns {Promise<Tabulator>} - Tabulator instance
 */
export async function createGrid(element, options = {}) {
    const TabulatorLib = await getTabulatorLib();
    
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
    
    const table = new TabulatorLib(element, config);

    // Instrument selection events for debugging
    table.on("rowSelected", function(row){
        try {
            const el = row.getElement();
            if (el && el.classList) el.classList.add('custom-selected');
        } catch (e) { logger.error('rowSelected diagnostics failed', e); }
    });
    
    table.on("rowDeselected", function(row){
        try {
            const el = row.getElement();
            if (el && el.classList) el.classList.remove('custom-selected');
        } catch (e) { logger.error('rowDeselected diagnostics failed', e); }
    });
    
    if (cellEdited) {
        table.on("cellEdited", (cell) => {
            cellEdited(cell);
        });
    }
    
    return table;
}

/**
 * Refresh an existing Tabulator table in-place.
 *
 * This avoids destroying/recreating the table DOM, which helps prevent page jumps
 * and allows GridStateManager to restore selection/scroll.
 */
export async function refreshGridData(table, nextData = []) {
    if (!table) return;

    const indexField = table?.options?.index || 'id';
    const safeNextData = Array.isArray(nextData) ? nextData : [];

    const nextIds = new Set(
        safeNextData
            .map((row) => row && row[indexField])
            .filter((id) => id !== null && id !== undefined)
            .map((id) => String(id))
    );

    const currentData = table?.getData?.() || [];
    const currentIds = new Set(
        currentData
            .map((row) => row && row[indexField])
            .filter((id) => id !== null && id !== undefined)
            .map((id) => String(id))
    );

    const deleteIds = [];
    currentIds.forEach((id) => {
        if (!nextIds.has(id)) deleteIds.push(id);
    });

    // If we can't reliably match rows by ID, fallback to replaceData.
    const hasAnyId = safeNextData.some((row) => row && row[indexField] !== null && row[indexField] !== undefined);
    if (!hasAnyId || typeof table.updateOrAddData !== 'function') {
        if (typeof table.replaceData === 'function') {
            await table.replaceData(safeNextData);
        }
        return;
    }

    try {
        await table.updateOrAddData(safeNextData);
    } catch (err) {
        // Conservative fallback for any Tabulator mismatch.
        try {
            if (typeof table.replaceData === 'function') {
                await table.replaceData(safeNextData);
            }
        } catch (_) {
            // ignore
        }
        return;
    }

    // Remove rows that no longer exist.
    if (deleteIds.length > 0 && typeof table.deleteRow === 'function') {
        deleteIds.forEach((id) => {
            try {
                table.deleteRow(id);
            } catch (_) {
                // ignore
            }
        });
    }
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
        responsive: options.responsive || 1, // Default responsive priority
        ...options
    };
}

/**
 * Create a minimal list editor config for Tabulator
 * Accepts an array of objects or a function that returns an array, and maps them to {label, value} pairs
 * Keeps the underlying value as the original object so it can be stored directly
 */
export function createListEditor(values = [], options = {}) {
    const { creatable = false, createLabel = 'Insert New...' } = options;

    // If values is a function, call it to get the actual values
    const actualValues = typeof values === 'function' ? values() : values;

    const mapValues = actualValues.map(v => {
        if (typeof v === 'string') return { label: v, value: v };
        if (v && (v.label || v.name)) return { label: v.label || v.name, value: v };
        return { label: String(v), value: v };
    });

    // Add a sentinel option to allow creation of new entries
    if (creatable) {
        mapValues.push({ label: createLabel, value: { __create__: true } });
    }

    return {
        editor: 'list',
        editorParams: {
            values: mapValues,
            listItemFormatter: function(value, title) { return title; }
        }
    };
}

/**
 * Format a numeric value to a fixed number of decimal places for grids
 * Returns a plain string (no currency) suitable for share counts and percentages
 */
export function formatNumberDisplay(value, digits = 4) {
    const num = Number(value) || 0;
    return num.toFixed(digits);
}

export function createMoneyColumn(title, field, options = {}) {
    const formatterParams = {
        decimal: ".",
        thousand: ",",
        precision: 2,
        ...(options.formatterParams || {})
    };

    // Allow overriding or disabling topCalc via options
    const topCalc = options.hasOwnProperty('topCalc') ? options.topCalc : 'sum';
    const topCalcFormatter = options.hasOwnProperty('topCalcFormatter') ? options.topCalcFormatter : ((cell) => formatMoneyDisplay(cell.getValue()));
    const topCalcFormatterParams = options.hasOwnProperty('topCalcFormatterParams') ? options.topCalcFormatterParams : formatterParams;

    return {
        title,
        field,
        editor: options.editor || "number",
        editorParams: options.editorParams || { step: 0.01 },
        formatter: (cell) => formatMoneyDisplay(cell.getValue()),
        formatterParams,
        hozAlign: "right",
        headerHozAlign: "right",
        topCalc,
        topCalcFormatter,
        topCalcFormatterParams,
        responsive: options.responsive || 1, // Default responsive priority
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
        responsive: options.responsive || 1, // Default responsive priority
        ...options
    };
}

/**
 * Create column definition for generic numeric values (not money)
 * @param {string} title
 * @param {string} field
 * @param {Object} options
 */
export function createNumberColumn(title, field, options = {}) {
    const topCalc = options.hasOwnProperty('topCalc') ? options.topCalc : 'sum';
    const topCalcFormatter = options.hasOwnProperty('topCalcFormatter') ? options.topCalcFormatter : (options.formatter === 'money' ? 'money' : 'number');
    const topCalcFormatterParams = options.hasOwnProperty('topCalcFormatterParams') ? options.topCalcFormatterParams : (options.formatterParams || {});

    return {
        title,
        field,
        editor: options.editor || 'number',
        editorParams: options.editorParams || { step: 1 },
        hozAlign: options.hozAlign || 'right',
        headerHozAlign: options.headerHozAlign || 'right',
        topCalc,
        topCalcFormatter,
        topCalcFormatterParams,
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

/**
 * Create a standardized delete column
 * @param {Function} onDelete - Async function(cell) to handle delete action
 * @param {Object} options - Optional configuration
 * @param {number} options.width - Column width (default: 50)
 * @param {string} options.confirmMessage - Custom confirmation message function(rowData) => string
 * @returns {Object} - Tabulator column definition
 */
export function createDeleteColumn(onDelete, options = {}) {
    const width = options.width || 50;
    const confirmMessage = options.confirmMessage || ((rowData) => 'Delete this item?');
    
    return {
        width,
        minWidth: width,
        hozAlign: "center",
        cssClass: "delete-cell",
        resizable: false,
        formatter: function(cell) {
            try {
                const rowEl = cell.getRow().getElement();
                if (rowEl && rowEl.classList.contains('tabulator-calcs-row')) return '';
            } catch(e) {}
            return '<svg enable-background="new 0 0 24 24" height="14" width="14" viewBox="0 0 24 24" xml:space="preserve"><path d="M22.245,4.015c0.313,0.313,0.313,0.826,0,1.139l-6.276,6.27c-0.313,0.312-0.313,0.826,0,1.14l6.273,6.272  c0.313,0.313,0.313,0.826,0,1.14l-2.285,2.277c-0.314,0.312-0.828,0.312-1.142,0l-6.271-6.271c-0.313-0.313-0.828-0.313-1.141,0  l-6.276,6.267c-0.313,0.313-0.828,0.313-1.141,0l-2.282-2.28c-0.313-0.313-0.313-0.826,0-1.14l6.278-6.269  c0.313-0.312,0.313-0.826,0-1.14L1.709,5.147c-0.314-0.313-0.314-0.827,0-1.14l2.284-2.278C4.308,1.417,4.821,1.417,5.135,1.73  L11.405,8c0.314,0.314,0.828,0.314,1.141,0.001l6.276-6.267c0.312-0.312,0.826-0.312,1.141,0L22.245,4.015z"></path></svg>';
        },
        cellClick: async function(e, cell) {
            try {
                const row = cell.getRow();
                const rowEl = row.getElement();
                if (rowEl && rowEl.classList.contains('tabulator-calcs-row')) return;
                const rowData = row.getData();
                const message = typeof confirmMessage === 'function' ? confirmMessage(rowData) : confirmMessage;
                if (await confirmDialog(message)) {
                    await onDelete(cell);
                }
            } catch (err) {
                notifyError('Action failed. Please try again.');
            }
        }
    };
}

/**
 * Create a standardized duplicate column
 * @param {Function} onDuplicate - Async function(cell) to handle duplicate action
 * @param {Object} options - Optional configuration
 * @param {number} options.width - Column width (default: 50)
 * @param {string} options.headerTooltip - Tooltip for header (default: 'Duplicate')
 * @returns {Object} - Tabulator column definition
 */
export function createDuplicateColumn(onDuplicate, options = {}) {
    const width = options.width || 50;
    const headerTooltip = options.headerTooltip || 'Duplicate';
    
    return {
        width,
        minWidth: width,
        hozAlign: "center",
        cssClass: "duplicate-cell",
        headerTooltip,
        resizable: false,
        formatter: function(cell) {
            try {
                const rowEl = cell.getRow().getElement();
                if (rowEl && rowEl.classList.contains('tabulator-calcs-row')) return '';
            } catch(e) {}
            return '<svg height="14" width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        },
        cellClick: async function(e, cell) {
            try {
                const row = cell.getRow();
                const rowEl = row.getElement();
                if (rowEl && rowEl.classList.contains('tabulator-calcs-row')) return;
                await onDuplicate(cell);
            } catch (err) {
                notifyError('Action failed. Please try again.');
            }
        }
    };
}
