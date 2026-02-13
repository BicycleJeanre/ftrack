// grid-factory.js
// Utility wrapper for creating Tabulator grids with consistent configuration

import { createLogger } from '../../../shared/logger.js';
import { isElectronEnv } from '../../../core/platform.js';
import { notifyError } from '../../../shared/notifications.js';

const logger = createLogger('GridFactory');

// Platform detection for Tabulator
const isElectron = isElectronEnv();

// Get Tabulator - from node_modules in Electron, from global CDN in web
async function getTabulatorLib() {
  if (isElectron) {
    // Electron: import from node_modules
    const tabulatorModule = await import('../node_modules/tabulator-tables/dist/js/tabulator_esm.min.js');
    return tabulatorModule.TabulatorFull;
  } else {
    // Web: use global Tabulator from CDN (loaded in forecast.html as UMD)
    if (!window.Tabulator) {
      throw new Error('Tabulator library not loaded. Check if CDN script is included.');
    }
    return window.Tabulator;
  }
}

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
        // try { logger.debug('selectableCheck: row id', row.getData() && row.getData().id); } catch (e) { /* noop */ }
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
    
    // logger.info(`Creating grid on element ID: ${element.id || 'N/A'}`, { 
    //     selectable: config.selectable, 
    //     selector: element.id || element 
    // });
    
    const table = new TabulatorLib(element, config);

    // Instrument selection events for debugging
    table.on("rowSelected", function(row){
        // logger.info(`Row Selected in ${element.id||'Grid'}:`, row.getData().id);
        try {
            const el = row.getElement();
            if (el && el.classList) el.classList.add('custom-selected');
            // logger.debug(`Row element classes: ${el ? el.className : 'no-el'}`);
        } catch (e) { logger.error('rowSelected diagnostics failed', e); }
    });
    
    table.on("rowDeselected", function(row){
        // logger.debug(`Row Deselected in ${element.id||'Grid'}:`, row.getData().id);
        try {
            const el = row.getElement();
            if (el && el.classList) el.classList.remove('custom-selected');
        } catch (e) { logger.error('rowDeselected diagnostics failed', e); }
    });

    // Additional instrumentation: clicks and table lifecycle
    table.on("rowClick", function(e, row){
        // try { logger.info(`Row Click in ${element.id||'Grid'}:`, row.getData().id, 'target=', e.target && e.target.tagName); } catch (err) { logger.info('Row Click in Grid (no id)'); }
    });

    table.on("cellClick", function(e, cell){
        // try { logger.debug(`Cell Click in ${element.id||'Grid'}:`, cell.getField(), 'target=', e.target && e.target.tagName); } catch (err) { logger.debug('Cell Click in Grid'); }
    });

    table.on("tableBuilt", function(){
        // logger.info(`Table built: ${element.id||'Grid'}`);
    });
    
    if (cellEdited) {
        table.on("cellEdited", (cell) => {
            // logger.info(`Cell Edited in ${element.id||'Grid'}:`, cell.getField(), cell.getValue());
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
        responsive: options.responsive || 1, // Default responsive priority
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
 * Create column definition for monetary values
 * @param {string} title - Column title
 * @param {string} field - Data field name
 * @param {Object} options - Additional options
 * @returns {Object} - Tabulator column config
 */
export function formatMoneyDisplay(value) {
    const numeric = Number(value) || 0;
    const formatted = new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(numeric);

    const cls = numeric >= 0 ? 'status-netchange positive' : 'status-netchange negative';
    return `<span class="${cls}">${formatted}</span>`;
}

export function createMoneyColumn(title, field, options = {}) {
    const formatterParams = {
        decimal: ".",
        thousand: ",",
        precision: 2,
        ...(options.formatterParams || {})
    };

    // Allow overriding or disabling bottomCalc via options
    const bottomCalc = options.hasOwnProperty('bottomCalc') ? options.bottomCalc : 'sum';
    const bottomCalcFormatter = options.hasOwnProperty('bottomCalcFormatter') ? options.bottomCalcFormatter : ((cell) => formatMoneyDisplay(cell.getValue()));
    const bottomCalcFormatterParams = options.hasOwnProperty('bottomCalcFormatterParams') ? options.bottomCalcFormatterParams : formatterParams;

    return {
        title,
        field,
        editor: options.editor || "number",
        editorParams: options.editorParams || { step: 0.01 },
        formatter: (cell) => formatMoneyDisplay(cell.getValue()),
        formatterParams,
        hozAlign: "right",
        headerHozAlign: "right",
        bottomCalc,
        bottomCalcFormatter,
        bottomCalcFormatterParams,
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
    const bottomCalc = options.hasOwnProperty('bottomCalc') ? options.bottomCalc : 'sum';
    const bottomCalcFormatter = options.hasOwnProperty('bottomCalcFormatter') ? options.bottomCalcFormatter : (options.formatter === 'money' ? 'money' : 'number');
    const bottomCalcFormatterParams = options.hasOwnProperty('bottomCalcFormatterParams') ? options.bottomCalcFormatterParams : (options.formatterParams || {});

    return {
        title,
        field,
        editor: options.editor || 'number',
        editorParams: options.editorParams || { step: 1 },
        hozAlign: options.hozAlign || 'right',
        headerHozAlign: options.headerHozAlign || 'right',
        bottomCalc,
        bottomCalcFormatter,
        bottomCalcFormatterParams,
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
                if (confirm(message)) {
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
