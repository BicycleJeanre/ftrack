import { loadConfig, getShortcut, matchShortcut } from './config.js';
import { Modal } from './modal.js';
import { ICON_EDIT, ICON_DELETE, ICON_SAVE, ICON_CANCEL, ICON_INTEREST, ICON_ADD, ICON_SPINNER } from '../styles/icons.js';

const ICONS = {
    edit: ICON_EDIT,
    delete: ICON_DELETE,
    save: ICON_SAVE,
    cancel: ICON_CANCEL,
    interest: ICON_INTEREST,
    add: ICON_ADD,
    spinner: ICON_SPINNER
};

export class EditableGrid {

    /**
     * @param {Object} options - Configuration options
     * @param {HTMLElement} options.targetElement - Container element for the grid
     * @param {string} options.tableHeader - Header text for the table
     * @param {Object} options.schema - Grid schema definition
     * @param {Array} options.data - Initial data array
     * @param {Function} options.onSave - Save callback function
     * @param {Function} [options.onDelete] - Delete callback function (optional)
     * @param {number} [options.parentRowId] - Parent row ID for nested grids (optional)
     * @param {string} [options.parentField] - Parent field name for nested grids (optional)
     * @param {Object} [options.scenarioContext] - Scenario context for conditional visibility evaluation (optional)
     * @param {Object} [options.scenarioContext.type] - Scenario type object with name property
     * @param {number} [options.scenarioContext.id] - Scenario ID
     */
    constructor(options) {
        this.targetElement = options.targetElement;
        this.tableHeader = options.tableHeader;
        this.schema = options.schema;
        this.data = options.data;
        this.onSave = options.onSave;
        this.onDelete = options.onDelete;
        this.parentRowId = options.parentRowId;
        this.parentField =options.parentField;
        this.scenarioContext = options.scenarioContext || null; // NEW: Scenario context for conditional visibility

        // Support both {mainGrid: {...}} and {...} schema formats
        this.mainGrid = this.schema.mainGrid ? this.schema.mainGrid : this.schema;

        // Internal working data - copy of original data for manipulation
        this.workingData = [...this.data];

        // Allow explicit showActions override (for hiding action column while keeping keyboard shortcuts)
        if (options.showActions !== undefined) {
            this.showActions = options.showActions;
        } else {
            this.showActions = this.mainGrid.actions.add || this.mainGrid.actions.edit || this.mainGrid.actions.delete || this.mainGrid.actions.save;
        }

        this.prepareModals();
        this.prepareSelectOptions();
    }

    prepareModals() {
        this.modals = {};
        this.mainGrid.columns.forEach(col => {
            if (col.type === 'modal' && this.schema[col.modal]) {
                // Deep clone the modal schema to avoid mutating the top-level schema
                const modalSchema = JSON.parse(JSON.stringify(this.schema[col.modal]));
                // Attach relevant options arrays to the modal schema
                if (modalSchema.columns) {
                    modalSchema.columns.forEach(field => {
                        if (field.type === 'select' && field.optionsSource && this.schema[field.optionsSource]) {
                            modalSchema[field.optionsSource] = this.schema[field.optionsSource];
                        }
                    });
                }
                const defaultData = {};
                if (modalSchema.columns) {
                    modalSchema.columns.forEach(field => {
                        defaultData[field.field] = field.default || '';
                    });
                }
                this.modals[col.field] = {
                    schema: modalSchema,
                    defaultData: defaultData,
                    title: modalSchema.title || 'Edit ' + (col.header || col.field)
                };
            }
        });
    }

    prepareSelectOptions() {
        this.selectOptions = {};
        // Main grid columns
        this.mainGrid.columns.forEach(col => {
            if ((col.type === 'select' || col.type === 'addSelect')) {
                // Support both optionsSource (reference to schema property) and direct options array
                if (col.optionsSource && this.schema[col.optionsSource]) {
                    this.selectOptions[col.field] = this.schema[col.optionsSource];
                } else if (col.options && Array.isArray(col.options)) {
                    this.selectOptions[col.field] = col.options;
                }
            }
        });
        // Modal and other sub-grids
        Object.values(this.schema).forEach(val => {
            if (val && val.columns && Array.isArray(val.columns)) {
                val.columns.forEach(col => {
                    if (col.type === 'select' || col.type === 'addSelect') {
                        // Support both optionsSource and direct options
                        if (col.optionsSource && this.schema[col.optionsSource]) {
                            this.selectOptions[col.field] = this.schema[col.optionsSource];
                        } else if (col.options && Array.isArray(col.options)) {
                            this.selectOptions[col.field] = col.options;
                        }
                    }
                });
            }
        });
    }

    async _ensureShortcutsLoaded() {
        if (!this._shortcutsLoaded) {
            await loadConfig();
            this._shortcutsLoaded = true;
            this._registerShortcuts();
        }
    }

    // Method to render the entire grid
    async render() {
        this.targetElement.innerHTML = ''
        // await this._ensureShortcutsLoaded();
        const headerText = document.createElement('h2')
        headerText.innerHTML = this.tableHeader
        // Render headers dynamically from schema
        const table = document.createElement('table')
        table.className = 'table bordered rounded shadow-lg'

        const headers = this.createHeader();
        window.add(table, headers)

        const tableData = this.createTableRows()
        window.add(table, tableData)

        //render the whole table
        window.add(this.targetElement, table)

        // Add button below table if add action is enabled
        if (this.mainGrid.actions.add) {
            let addButton = document.createElement('span')
            addButton.innerHTML = ICONS['add']
            addButton.className = 'btn'
            addButton.title = 'Add New Row'
            addButton.addEventListener('click', () => {
                this.handleAdd()
            })
            window.add(this.targetElement, addButton)
        }

    }
    //method to create headers from schema. Called from render
    createHeader() {
        //create header
        let thead = document.createElement('thead')

        //add schema columns to header
        this.mainGrid.columns.forEach(col => {
            // Check visibility based on visibleWhen condition
            const isVisible = this.isColumnVisible(col, {});
            
            if (col.display !== false && isVisible) {
                const colHead = document.createElement('th')
                colHead.textContent = col.header
                colHead.dataset.field = col.field; // Store field name for dynamic updates
                window.add(thead, colHead)
            }
        })

        //add actions column if needed
        if (this.showActions) {
            const actionHeader = document.createElement('th')
            actionHeader.textContent = "Actions";
            window.add(thead, actionHeader);
        }

        return thead
    }
    //method to create table row data from input data. Called from render.
    createTableRows() {
        const tbody = document.createElement('tbody')
        // Debug: Log workingData and columns before rendering rows
        console.log('[EditableGrid] createTableRows workingData:', this.workingData);
        console.log('[EditableGrid] createTableRows columns:', this.mainGrid.columns);
        this.workingData.forEach(acc => {
            const row = document.createElement('tr')
            const columns = this.mainGrid.columns
            columns.forEach(col => {
                // Check visibility based on visibleWhen condition for this specific row
                const isVisible = this.isColumnVisible(col, acc);
                
                // Debug: Log each cell value
                console.log(`[EditableGrid] Row field '${col.field}':`, acc[col.field]);
                if (!(col.field in acc)) {
                    console.warn(`[EditableGrid] WARNING: Field '${col.field}' not found in data object`, acc);
                }
                if (acc[col.field] === undefined) {
                    console.warn(`[EditableGrid] WARNING: Value for field '${col.field}' is undefined. Possible typo or missing data.`, acc);
                }
                // Always create the cell, but hide if not displayed or not visible
                let cellContent = document.createElement('td')
                cellContent.dataset.field = col.field; // Store field name for reference
                if (col.display === false || !isVisible) {
                    cellContent.style.display = 'none'
                }
                if (!col.editable || !this.mainGrid.actions.edit) {
                    cellContent.textContent = acc[col.field]
                } else {
                    switch (col.type) {
                        case 'currency':
                            let currencyIn = document.createElement('input')
                            currencyIn.type = 'number'
                            currencyIn.step = '1'
                            currencyIn.value = new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: acc.currency
                            }).format(acc[col.field])
                            currencyIn.addEventListener('input', () => {
                                row.classList.add('unsaved-row');
                            });
                            window.add(cellContent, currencyIn)
                            break
                        case 'number':
                            let numIn = document.createElement('input')
                            numIn.type = 'number'
                            numIn.step = '1'
                            numIn.value = acc[col.field]
                            numIn.addEventListener('input', () => {
                                row.classList.add('unsaved-row');
                            });
                            window.add(cellContent, numIn)
                            break
                        case 'text':
                            let texIn = document.createElement('input')
                            texIn.type = 'text'
                            texIn.value = acc[col.field]
                            texIn.addEventListener('input', () => {
                                row.classList.add('unsaved-row');
                            });
                            window.add(cellContent, texIn)
                            break
                        case 'select':
                            let selectIn = document.createElement('select')
                            const options = this.selectOptions[col.field] || [];
                            // Add empty option at the top
                            const emptyOption = document.createElement('option');
                            emptyOption.value = '--';
                            emptyOption.textContent = '--';
                            if (!acc[col.field] || !acc[col.field].id) {
                                emptyOption.selected = true;
                            }
                            window.add(selectIn, emptyOption);
                            options.forEach(option => {
                                const optionEl = document.createElement('option')
                                optionEl.value = option.id;
                                optionEl.textContent = option.name;
                                if (acc[col.field] && acc[col.field].id === option.id) {
                                    optionEl.selected = true;
                                }
                                window.add(selectIn, optionEl)
                            })
                            selectIn.addEventListener('change', () => {
                                row.classList.add('unsaved-row');
                            });
                            window.add(cellContent, selectIn)
                            break
                        case 'modal':
                            let modalIcon = document.createElement('span')
                            modalIcon.innerHTML = ICONS[col.modalIcon]
                            modalIcon.className = 'btn'
                            modalIcon.title = col.modalIconTitle
                            modalIcon.addEventListener('click', () => {
                                const modalInfo = this.modals[col.field];
                                let modalData = acc[col.field];
                                if (!modalData) {
                                    modalData = { ...modalInfo.defaultData };
                                    acc[col.field] = modalData;
                                }
                                const parentRowId = acc.id;
                                const fieldName = col.field;
                                const intModal = new Modal({
                                    targetElement: this.targetElement,
                                    schema: modalInfo.schema,
                                    data: Array.isArray(modalData) ? modalData : [modalData],
                                    tableHeader: modalInfo.title,
                                    onSave: (updatedModalRow) => {
                                        this.onModalSave(parentRowId, fieldName, updatedModalRow);
                                    },
                                    parentRowId: parentRowId,
                                    parentField: fieldName
                                });
                                intModal.render();
                            })
                            window.add(cellContent, modalIcon)
                            break
                        case 'tags': {
                            let tagsContainer = document.createElement('div');
                            tagsContainer.className = 'tags-container';
                            // Input for new tag (created first, so tags appear before input)
                            let tagsInput = document.createElement('input');
                            tagsInput.type = 'text';
                            tagsInput.className = 'tag-edit-input';
                            tagsInput.placeholder = 'Add tag';
                            // Store focus intent in instance for use after render
                            if (!this._tagFocus) this._tagFocus = {};
                            tagsInput.onkeydown = (e) => {
                                if ((e.key === ' ' || e.key === 'Enter' || e.key === ',') && tagsInput.value.trim()) {
                                    if (!Array.isArray(acc[col.field])) acc[col.field] = [];
                                    acc[col.field].push(tagsInput.value.trim());
                                    tagsInput.value = '';
                                    this._tagFocus[acc.id + '-' + col.field] = true;
                                    this.render();
                                    e.preventDefault();
                                } else if (
                                    e.key === 'Backspace' &&
                                    !tagsInput.value &&
                                    Array.isArray(acc[col.field]) &&
                                    acc[col.field].length > 0
                                ) {
                                    acc[col.field].pop();
                                    this._tagFocus[acc.id + '-' + col.field] = true;
                                    this.render();
                                    e.preventDefault();
                                }
                            };
                            window.add(tagsContainer, tagsInput);
                            // Render each tag as a span with remove button (before input)
                            if (Array.isArray(acc[col.field])) {
                                acc[col.field].forEach((tag, idx) => {
                                    let tagEl = document.createElement('span');
                                    tagEl.className = 'tag-item';
                                    tagEl.textContent = tag;
                                    // Remove button (x)
                                    let removeBtn = document.createElement('span');
                                    removeBtn.className = 'tag-remove';
                                    removeBtn.textContent = '×';
                                    removeBtn.onclick = (e) => {
                                        e.stopPropagation();
                                        acc[col.field].splice(idx, 1);
                                        this._tagFocus[acc.id + '-' + col.field] = true;
                                        this.render();
                                    };
                                    window.add(tagEl, removeBtn);
                                    // Insert tag before the input
                                    tagsContainer.insertBefore(tagEl, tagsInput);
                                });
                            }
                            window.add(cellContent, tagsContainer);
                            // After render, move focus to input if needed
                            setTimeout(() => {
                                if (this._tagFocus && this._tagFocus[acc.id + '-' + col.field]) {
                                    tagsInput.focus();
                                    delete this._tagFocus[acc.id + '-' + col.field];
                                }
                            }, 0);
                            break;
                        }
                        case 'checkbox': {
                            let checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.checked = acc[col.field];
                            checkbox.className = 'checkbox-input';
                            checkbox.onchange = () => {
                                acc[col.field] = checkbox.checked;
                                this.render();
                            };
                            window.add(cellContent, checkbox);
                            break;
                        }
                        case 'exclusive': {
                            let checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.checked = acc[col.field];
                            checkbox.className = 'checkbox-input';
                            checkbox.onchange = () => {
                                if (checkbox.checked) {
                                    // Exclusivity logic: uncheck all others
                                    this.workingData.forEach(row => {
                                        if (row !== acc) row[col.field] = false;
                                    });
                                }
                                acc[col.field] = checkbox.checked;
                                this.render();
                            };
                            window.add(cellContent, checkbox);
                            break;
                        }
                        case 'date': {
                            let dateIn = document.createElement('input');
                            dateIn.type = 'date';
                            // Use value in YYYY-MM-DD format, fallback to today if empty
                            let val = acc[col.field];
                            if (!val) {
                                // Default to today if not set
                                const today = new Date();
                                val = today.toISOString().slice(0, 10);
                                acc[col.field] = val;
                            }
                            dateIn.value = val;
                            dateIn.className = 'date-input';
                            dateIn.addEventListener('change', () => {
                                row.classList.add('unsaved-row');
                            });
                            window.add(cellContent, dateIn);
                            break;
                        }
                        case 'addSelect': {
                            // Quick-add input tied to a unique datalist per row
                            const listId = `datalist-${col.field}-${acc.id}`;
                            let input = document.createElement('input');
                            input.type = 'text';
                            input.className = 'add-select-input';
                            input.setAttribute('list', listId);
                            // Set current selection as VALUE so it can be saved properly
                            if (acc[col.field] && acc[col.field].name) {
                                input.value = acc[col.field].name;
                            }
                            // Mark row as unsaved on input
                            input.addEventListener('input', () => {
                                row.classList.add('unsaved-row');
                            });
                            // Select all on focus to allow easy replacement
                            input.addEventListener('focus', () => {
                                input.select();
                            });
                            // Create datalist element
                            let list = document.createElement('datalist');
                            list.id = listId;
                            // Populate options
                            (this.selectOptions[col.field] || []).forEach(opt => {
                                let option = document.createElement('option');
                                option.value = opt.name;
                                list.appendChild(option);
                            });
                            window.add(cellContent, input);
                            window.add(cellContent, list);
                            break;
                        }
                        default:
                            let def = document.createElement('input')
                            def.type = 'text'
                            def.value = acc[col.field]
                            window.add(cellContent, def)
                            break
                    }
                }
                window.add(row, cellContent)
            })
            
            // Add actions column if needed
            if (this.showActions) {
                let actionsCell = document.createElement('td')
                if (this.mainGrid.actions.save) {
                    let saveIcon = document.createElement('span')
                    saveIcon.innerHTML = ICONS['save']
                    saveIcon.className = 'btn'
                    saveIcon.title = 'Save'
                    saveIcon.addEventListener('click', (event) => {
                        this.handleSave(event.target.closest('tr'))
                    })
                    window.add(actionsCell, saveIcon)
                }
                if (this.mainGrid.actions.delete) {
                    let deleteIcon = document.createElement('span')
                    deleteIcon.innerHTML = ICONS['delete']
                    deleteIcon.className = 'btn'
                    deleteIcon.title = 'Delete'
                    deleteIcon.addEventListener('click', (event) => {
                        this.handleDelete(event.target.closest('tr'))
                    })
                    window.add(actionsCell, deleteIcon)
                }
                window.add(row, actionsCell)
            }
            
            window.add(tbody, row)
        })
        return tbody
    }

    //method to handle saving a row to disk
    async handleSave(row, rowId = this.parentRowId, field = this.parentField) {
        const rowData = {};
        const columns = this.mainGrid.columns;
        
        // Get the original row data to reference for id and addSelect preservation
        const rowIndex = Array.from(row.parentNode.children).indexOf(row);
        const originalRowData = this.workingData[rowIndex];
        
        // Preserve the id from original data
        if (originalRowData && originalRowData.id) {
            rowData.id = originalRowData.id;
        }
        
        // Loop through columns and extract values from each cell/input
        columns.forEach((col, i) => {
            const cell = row.children[i];
            let value = '';
            switch (col.type) {
                case 'number': {
                    const input = cell.querySelector('input');
                    value = input ? Number(input.value) : Number(cell.textContent);
                    break;
                }
                case 'text': {
                    const input = cell.querySelector('input');
                    value = input ? input.value : cell.textContent;
                    break;
                }
                case 'select': {
                    const select = cell.querySelector('select');
                    const selectedId = select ? select.value : '';
                    const options = this.selectOptions[col.field] || [];
                    value = options.find(opt => String(opt.id) === String(selectedId)) || null;
                    break;
                }
                case 'modal': {
                    // handle modal if needed
                    break;
                }
                case 'tags': {
                    // Find all tag-item spans in the cell and extract their text (excluding the remove button)
                    const tagSpans = cell.querySelectorAll('.tag-item');
                    value = Array.from(tagSpans).map(span => {
                        // Remove trailing remove button (×) if present
                        return span.childNodes[0] ? span.childNodes[0].textContent : span.textContent;
                    }).filter(Boolean);
                    break;
                }
                case 'checkbox': {
                    const input = cell.querySelector('input[type="checkbox"]');
                    value = input ? input.checked : false;
                    break;
                }
                case 'exclusive': {
                    const input = cell.querySelector('input[type="checkbox"]');
                    value = input ? input.checked : false;
                    break;
                }
                case 'date': {
                    const input = cell.querySelector('input[type="date"]');
                    value = input ? input.value : '';
                    break;
                }
                case 'addSelect': {
                    const input = cell.querySelector('input');
                    const text = input ? input.value.trim() : '';
                    if (!text) {
                        // No value entered
                        value = null;
                    } else {
                        const opts = this.selectOptions[col.field] || [];
                        const found = opts.find(o => o.name === text);
                        value = found ? found : { id: null, name: text };
                    }
                    break;
                }
                default: {
                    value = cell.textContent;
                    break;
                }
            }
            // If value is empty string, undefined, or null, use col.default if available, else null
            if (value === '' || value === undefined || value === null) {
                value = (typeof col.default !== 'undefined') ? col.default : null;
            }
            rowData[col.field] = value;
        })

        const rowToUpdate = this.workingData.findIndex(r => r.id == rowData.id);
        console.log('[EditableGrid] handleSave - Extracted rowData:', JSON.stringify(rowData, null, 2));
        console.log('[EditableGrid] handleSave - Updating row index:', rowToUpdate);
        this.workingData[rowToUpdate] = rowData;    

        this.data.length = 0;
        this.data.push(...this.workingData);
        
        console.log('[EditableGrid] handleSave - Calling onSave with data:', this.data);
        
        if (this.onSave) {
            try {
                // Pass rowId and field for modal grids, undefined for main grids
                await this.onSave(this.data, rowId, field);
                // Remove unsaved indicator after successful save
                row.classList.remove('unsaved-row');
                console.log('[EditableGrid] handleSave - Save completed successfully');
            } catch (err) {
                console.error('[EditableGrid] handleSave - Save failed:', err);
                alert('Save failed: ' + err.message);
            }
        } else {
            console.warn('[EditableGrid] handleSave - No onSave callback defined');
        }
    };

    handleAdd() {
        const newRow = {};
        this.mainGrid.columns.forEach(col => {
            if (col.field) {
                if (col.field === 'id'){
                    newRow[col.field] = this.workingData.reduce((max, curr) => curr.id > max ? curr.id+1 : max+1, 0)
                    return
                }else {
                    newRow[col.field] = (typeof col.default !== 'undefined') ? col.default : '';
                    return
                }
            }
        });
        
        // Add to working data
        this.workingData.push(newRow);
        
        // Re-render the grid
        this.render();
    };
    // Callback for when a modal's data is saved
    onModalSave(rowId, field, updatedModalData) {
        // rowId: id of the parent row in the main grid
        // field: the field in the parent row to update (e.g., 'interest')
        // updatedModalData: the new data for that field (already extracted by modal grid)
        const gridIndex = this.workingData.findIndex(row => row.id == rowId);
        if (gridIndex !== -1) {
            this.workingData[gridIndex][field] = updatedModalData;
            // Call onSave to persist the change using the existing logic
            if (this.onSave) this.onSave(this.workingData, rowId, field);
        } else {
            console.warn('[EditableGrid] onModalSave: Row not found for id', rowId);
        }
    }

    //method to handle deleting a row
    handleDelete(row) {
        const rowIndex = row.rowIndex; 
        if (rowIndex >= 0 && rowIndex < this.workingData.length) {
            this.workingData.splice(rowIndex, 1);
            this.data.length = 0;
            this.data.push(...this.workingData);
            if (this.onSave) {
                this.onSave(this.data);
            }
            this.render();
        }
    }

    // ============================================================================
    // CONDITIONAL VISIBILITY SUPPORT
    // ============================================================================

    /**
     * Get nested value from object using dot notation (e.g., "scenario.type.name")
     * @param {Object} obj - The object to search
     * @param {string} path - Dot-separated path
     * @returns {*} - The value at the path, or undefined
     */
    getNestedValue(obj, path) {
        if (!path) return undefined;
        const keys = path.split('.');
        let value = obj;
        for (const key of keys) {
            if (value === null || value === undefined) return undefined;
            value = value[key];
        }
        return value;
    }

    /**
     * Set nested value in object using dot notation
     * @param {Object} obj - The object to modify
     * @param {string} path - Dot-separated path
     * @param {*} value - Value to set
     */
    setNestedValue(obj, path, value) {
        if (!path) return;
        const keys = path.split('.');
        let current = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        current[keys[keys.length - 1]] = value;
    }

    /**
     * Evaluate a visibleWhen expression
     * @param {string} expression - Expression like "scenario.type.name == 'Budget'"
     * @param {Object} rowData - Current row data
     * @returns {boolean} - True if column should be visible
     */
    evaluateVisibleWhen(expression, rowData) {
        if (!expression) return true; // No condition means always visible
        
        // Build evaluation context
        const context = {
            scenario: this.scenarioContext || {},
            row: rowData || {},
            ...rowData // Also include row fields directly for convenience
        };
        
        // Simple expression parser for common patterns
        // Supports: ==, !=, IN, NOT IN
        
        // Pattern: "field == 'value'" or "field.nested == 'value'"
        const eqMatch = expression.match(/^(.+?)\s*==\s*'(.+?)'$/);
        if (eqMatch) {
            const fieldPath = eqMatch[1].trim();
            const expectedValue = eqMatch[2];
            const actualValue = this.getNestedValue(context, fieldPath);
            return actualValue === expectedValue;
        }
        
        // Pattern: "field != 'value'"
        const neMatch = expression.match(/^(.+?)\s*!=\s*'(.+?)'$/);
        if (neMatch) {
            const fieldPath = neMatch[1].trim();
            const expectedValue = neMatch[2];
            const actualValue = this.getNestedValue(context, fieldPath);
            return actualValue !== expectedValue;
        }
        
        // Pattern: "field IN ['value1', 'value2']"
        const inMatch = expression.match(/^(.+?)\s+IN\s+\[(.+?)\]$/);
        if (inMatch) {
            const fieldPath = inMatch[1].trim();
            const valuesStr = inMatch[2];
            const values = valuesStr.split(',').map(v => v.trim().replace(/['"]/g, ''));
            const actualValue = this.getNestedValue(context, fieldPath);
            return values.includes(actualValue);
        }
        
        // Pattern: "field NOT IN ['value1', 'value2']"
        const notInMatch = expression.match(/^(.+?)\s+NOT\s+IN\s+\[(.+?)\]$/);
        if (notInMatch) {
            const fieldPath = notInMatch[1].trim();
            const valuesStr = notInMatch[2];
            const values = valuesStr.split(',').map(v => v.trim().replace(/['"]/g, ''));
            const actualValue = this.getNestedValue(context, fieldPath);
            return !values.includes(actualValue);
        }
        
        // Default to visible if expression doesn't match known patterns
        console.warn('[EditableGrid] Unknown visibleWhen expression:', expression);
        return true;
    }

    /**
     * Check if a column should be visible based on visibleWhen conditions
     * @param {Object} col - Column definition
     * @param {Object} rowData - Current row data
     * @returns {boolean} - True if column should be visible
     */
    isColumnVisible(col, rowData) {
        if (!col.visibleWhen) return true;
        return this.evaluateVisibleWhen(col.visibleWhen, rowData);
    }
}
