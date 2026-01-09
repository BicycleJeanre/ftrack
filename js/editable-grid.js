import { loadConfig, getShortcut, matchShortcut } from './config.js';
import { Modal } from './modal.js';
import { ICON_EDIT, ICON_DELETE, ICON_SAVE, ICON_CANCEL, ICON_INTEREST, ICON_REFRESH, ICON_TRENDING, ICON_ADD, ICON_SPINNER } from '../styles/icons.js';

const ICONS = {
    edit: ICON_EDIT,
    delete: ICON_DELETE,
    save: ICON_SAVE,
    cancel: ICON_CANCEL,
    interest: ICON_INTEREST,
    refresh: ICON_REFRESH,
    trending: ICON_TRENDING,
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
        this.onRowClick = options.onRowClick;
        this.parentRowId = options.parentRowId;
        this.parentField =options.parentField;
        this.scenarioContext = options.scenarioContext || null; // NEW: Scenario context for conditional visibility

        // Generate unique ID for this grid instance (for radio button grouping)
        this.gridId = `grid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Track selected row ID to preserve selection across re-renders
        this.selectedRowId = null;

        // Support both {mainGrid: {...}} and {...} schema formats
        this.mainGrid = this.schema.mainGrid ? this.schema.mainGrid : this.schema;

        // Internal working data - copy of original data for manipulation
        this.workingData = [...this.data];

        // Allow explicit showActions override (for hiding action column while keeping keyboard shortcuts)
        if (options.showActions !== undefined) {
            this.showActions = options.showActions;
        } else {
            // Check if actions exist before accessing properties
            const actions = this.mainGrid.actions || {};
            this.showActions = actions.add || actions.edit || actions.delete || actions.save;
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
                    console.log(`[EditableGrid] Set selectOptions for ${col.field} from optionsSource ${col.optionsSource}:`, this.selectOptions[col.field].length, 'items');
                } else if (col.options && Array.isArray(col.options)) {
                    this.selectOptions[col.field] = col.options;
                    console.log(`[EditableGrid] Set selectOptions for ${col.field} from direct options:`, this.selectOptions[col.field].length, 'items');
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
        // Add header text to container
        window.add(this.targetElement, headerText)
        
        // Render headers dynamically from schema
        const table = document.createElement('table')
        table.className = 'table bordered rounded shadow-lg'

        const headers = this.createHeader();
        window.add(table, headers)

        const tableData = this.createTableRows()
        window.add(table, tableData)

        //render the whole table
        window.add(this.targetElement, table)
        
        // Sync header visibility with cell visibility after rendering
        this.syncHeaderVisibility(table);

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

        // Add selector column if onRowClick is provided and showSelector is true
        if (this.onRowClick && this.mainGrid.actions?.showSelector) {
            const selectorHeader = document.createElement('th');
            selectorHeader.textContent = '';
            selectorHeader.style.width = '40px';
            window.add(thead, selectorHeader);
        }

        //add schema columns to header
        this.mainGrid.columns.forEach(col => {
            // Always create header for columns with display !== false
            // We'll handle conditional visibility by checking if column is visible in any row
            if (col.display !== false) {
                const colHead = document.createElement('th')
                colHead.textContent = col.header
                colHead.dataset.field = col.field; // Store field name for dynamic updates
                
                // If column has visibleWhen, check if it's visible for any row in workingData
                if (col.visibleWhen) {
                    const isVisibleInAnyRow = this.workingData.some(row => this.isColumnVisible(col, row));
                    if (!isVisibleInAnyRow) {
                        colHead.style.display = 'none';
                    }
                }
                
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
            
            // Add radio button for row selection if onRowClick is provided and showSelector is true
            if (this.onRowClick && this.mainGrid.actions?.showSelector) {
                const radioCell = document.createElement('td');
                radioCell.style.textAlign = 'center';
                
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = `row-selector-${this.gridId}`; // Unique name per grid instance
                radio.style.cursor = 'pointer';
                
                // Check if this row should be selected (matches stored selection)
                if (this.selectedRowId === acc.id) {
                    radio.checked = true;
                    row.classList.add('selected-row');
                }
                
                radio.addEventListener('click', () => {
                    // Remove selection from all rows
                    const allRows = row.parentNode.querySelectorAll('tr');
                    allRows.forEach(r => r.classList.remove('selected-row'));
                    
                    // Add selection to this row
                    row.classList.add('selected-row');
                    
                    // Store selected row ID
                    this.selectedRowId = acc.id;
                    
                    // Call the callback with row data
                    this.onRowClick(acc);
                });
                
                radioCell.appendChild(radio);
                row.appendChild(radioCell);
            }
            
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
                            selectIn.addEventListener('change', (e) => {
                                row.classList.add('unsaved-row');
                                
                                console.log('[EditableGrid] Select changed:', col.field, '→', e.target.value);
                                
                                // Update working data with new selection for conditional visibility
                                const rowIndex = Array.from(row.parentNode.children).indexOf(row);
                                console.log('[EditableGrid] Row index:', rowIndex, 'parentRowId:', this.parentRowId);
                                
                                if (this.workingData[rowIndex]) {
                                    // First, capture ALL current field values from the DOM
                                    // This prevents losing user input during re-render
                                    this.mainGrid.columns.forEach(column => {
                                        const cell = row.querySelector(`td[data-field="${column.field}"]`);
                                        if (!cell) return;
                                        
                                        // Extract current value from the input/select in this cell
                                        const input = cell.querySelector('input, select');
                                        if (input) {
                                            if (input.tagName === 'SELECT') {
                                                const selectedId = input.value;
                                                // Skip if no selection (empty value)
                                                if (!selectedId || selectedId === '') {
                                                    // Keep existing value in workingData if no selection
                                                    return;
                                                }
                                                // Get options for this field (stored by field name, not optionsSource)
                                                const columnOptions = this.selectOptions[column.field] || [];
                                                const selectedOption = columnOptions.find(opt => String(opt.id) === String(selectedId));
                                                if (selectedOption) {
                                                    console.log('[EditableGrid] Updating workingData field:', column.field, '→', selectedOption);
                                                    this.workingData[rowIndex][column.field] = selectedOption;
                                                } else {
                                                    console.warn('[EditableGrid] Could not find option for id:', selectedId, 'in', columnOptions);
                                                }
                                            } else if (input.type === 'number') {
                                                const value = input.value.trim();
                                                this.workingData[rowIndex][column.field] = value !== '' ? parseFloat(value) : null;
                                            } else if (input.type === 'checkbox') {
                                                this.workingData[rowIndex][column.field] = input.checked;
                                            } else {
                                                this.workingData[rowIndex][column.field] = input.value || null;
                                            }
                                        }
                                    });
                                    
                                    console.log('[EditableGrid] Updated workingData[' + rowIndex + ']:', this.workingData[rowIndex]);
                                    
                                    // Re-render if this is a modal grid (to update conditional visibility)
                                    if (this.parentRowId !== undefined) {
                                        console.log('[EditableGrid] Re-rendering modal grid due to select change');
                                        this.render();
                                    } else {
                                        console.log('[EditableGrid] Skipping re-render (not a modal grid)');
                                    }
                                }
                            });
                            window.add(cellContent, selectIn)
                            break
                        case 'modal':
                            let modalIcon = document.createElement('span')
                            modalIcon.innerHTML = ICONS[col.modalIcon]
                            modalIcon.className = 'btn'
                            modalIcon.title = col.modalIconTitle
                            modalIcon.addEventListener('click', async () => {
                                try {
                                    // If row hasn't been saved yet (id is null), save it first
                                    if (acc.id === null || acc.id === undefined) {
                                        const row = cellContent.closest('tr');
                                        console.log('[EditableGrid] Saving unsaved row before opening modal');
                                        await this.handleSave(row, acc.id, col.field);
                                        
                                        // After save, acc object is updated with the new ID by handleSave
                                        // Wait a moment for the grid to finish re-rendering
                                        await new Promise(resolve => setTimeout(resolve, 150));
                                    }
                                    
                                    // At this point, acc should have a valid ID (either it had one or just got assigned)
                                    console.log('[EditableGrid] Opening modal for row with ID:', acc.id);
                                    const modalInfo = this.modals[col.field];
                                    let modalData = acc[col.field];
                                    if (!modalData) {
                                        modalData = { ...modalInfo.defaultData };
                                        acc[col.field] = modalData;
                                    }
                                    const intModal = new Modal({
                                        targetElement: this.targetElement,
                                        schema: modalInfo.schema,
                                        data: Array.isArray(modalData) ? modalData : [modalData],
                                        tableHeader: modalInfo.title,
                                        onSave: (updatedModalRow) => {
                                            this.onModalSave(acc.id, col.field, updatedModalRow);
                                        },
                                        parentRowId: acc.id,
                                        parentField: col.field
                                    });
                                    intModal.render();
                                } catch (error) {
                                    console.error('[EditableGrid] Error in modal button click handler:', error);
                                }
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
                            // Use value in YYYY-MM-DD format, allow empty
                            let val = acc[col.field];
                            if (val) {
                                dateIn.value = val;
                            }
                            // If required and no value, set to today
                            if (!val && col.required) {
                                const today = new Date();
                                val = today.toISOString().slice(0, 10);
                                dateIn.value = val;
                                acc[col.field] = val;
                            }
                            dateIn.className = 'date-input';
                            dateIn.addEventListener('change', () => {
                                row.classList.add('unsaved-row');
                            });
                            
                            // Add clear button for non-required date fields
                            if (!col.required) {
                                const clearBtn = document.createElement('button');
                                clearBtn.type = 'button';
                                clearBtn.className = 'date-clear-btn';
                                clearBtn.textContent = '×';
                                clearBtn.title = 'Clear date';
                                clearBtn.addEventListener('click', () => {
                                    dateIn.value = '';
                                    row.classList.add('unsaved-row');
                                });
                                const dateWrapper = document.createElement('div');
                                dateWrapper.className = 'date-input-wrapper';
                                dateWrapper.appendChild(dateIn);
                                dateWrapper.appendChild(clearBtn);
                                window.add(cellContent, dateWrapper);
                            } else {
                                window.add(cellContent, dateIn);
                            }
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
                            // Store original value to restore if user doesn't change it
                            const originalValue = input.value;
                            
                            // Mark row as unsaved on input
                            input.addEventListener('input', () => {
                                row.classList.add('unsaved-row');
                            });
                            // Clear value on focus to show all options in datalist
                            input.addEventListener('focus', () => {
                                input.value = '';
                            });
                            // Restore original value if user didn't enter anything
                            input.addEventListener('blur', () => {
                                if (input.value.trim() === '') {
                                    input.value = originalValue;
                                }
                            });
                            // Create datalist element
                            let list = document.createElement('datalist');
                            list.id = listId;
                            // Populate options
                            const options = this.selectOptions[col.field] || [];
                            console.log(`[EditableGrid] Creating datalist for ${col.field}, adding ${options.length} options`);
                            options.forEach(opt => {
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
        
        // Add totals row if enabled
        if (this.schema.mainGrid.showTotals) {
            const totalsRow = this.createTotalsRow();
            if (totalsRow) {
                window.add(tbody, totalsRow);
            }
        }
        
        return tbody
    }
    
    /**
     * Create totals row for transactions
     * Calculates total debits, credits, and net balance
     */
    createTotalsRow() {
        const totals = {
            debits: 0,
            credits: 0,
            net: 0
        };
        
        // Calculate totals based on transaction type and amount
        this.workingData.forEach(row => {
            // Determine the amount to use
            let amount = row.amount || 0;
            
            // For actual transactions, use actualAmount
            if (row.actualAmount !== undefined) {
                amount = row.actualAmount || 0;
            }
            
            // Use transactionType to determine debit vs credit
            if (row.transactionType) {
                if (row.transactionType.name === 'Debit') {
                    totals.debits += amount;
                } else if (row.transactionType.name === 'Credit') {
                    totals.credits += amount;
                }
            }
        });
        
        totals.net = totals.credits - totals.debits;
        
        const row = document.createElement('tr');
        row.className = 'totals-row';
        row.style.fontWeight = 'bold';
        row.style.backgroundColor = '#f0f0f0';
        row.style.borderTop = '2px solid #333';
        
        // Add cells to match column structure
        const cellOffset = (this.onRowClick && this.mainGrid.actions?.showSelector) ? 1 : 0;
        
        // Add selector cell if needed
        if (cellOffset > 0) {
            const selectorCell = document.createElement('td');
            window.add(row, selectorCell);
        }
        
        this.mainGrid.columns.forEach(col => {
            const cell = document.createElement('td');
            cell.dataset.field = col.field;
            
            if (col.field === 'secondaryAccount' || col.field === 'description') {
                cell.textContent = col.field === 'secondaryAccount' ? 'TOTALS:' : '';
            } else if (col.field === 'plannedAmount' || col.field === 'actualAmount' || col.field === 'amount') {
                // Show credits, debits, and net balance
                cell.textContent = `Credits: ${totals.credits.toFixed(2)} | Debits: ${totals.debits.toFixed(2)} | Net: ${totals.net.toFixed(2)}`;
                cell.style.textAlign = 'right';
            } else if (col.field === 'variance') {
                const totalVariance = this.workingData.reduce((sum, row) => sum + (row.variance || 0), 0);
                cell.textContent = totalVariance.toFixed(2);
                cell.style.textAlign = 'right';
            } else {
                cell.textContent = '';
            }
            
            window.add(row, cell);
        });
        
        // Add actions cell if needed
        if (this.showActions && this.mainGrid.actions) {
            const actionsCell = document.createElement('td');
            window.add(row, actionsCell);
        }
        
        return row;
    }

    /**
     * Sync header visibility with cell visibility
     * Shows/hides header columns based on whether any cells in that column are visible
     * Also updates header text for context-sensitive fields (e.g., "Value" -> "Rate (%)" or "Amount")
     * @param {HTMLElement} table - The table element
     */
    syncHeaderVisibility(table) {
        const headers = table.querySelectorAll('thead th[data-field]');
        const tbody = table.querySelector('tbody');
        
        headers.forEach(header => {
            const field = header.dataset.field;
            // Check if any cell in this column is visible
            const cells = tbody.querySelectorAll(`td[data-field="${field}"]`);
            const anyVisible = Array.from(cells).some(cell => cell.style.display !== 'none');
            
            // Show/hide header based on cell visibility
            if (anyVisible) {
                header.style.display = '';
            } else {
                header.style.display = 'none';
            }
            
            // Update header text for the "value" field based on changeMode
            if (field === 'value' && this.workingData.length > 0) {
                const firstRow = this.workingData[0];
                if (firstRow.changeMode) {
                    if (firstRow.changeMode.name === 'Percentage Rate') {
                        header.textContent = 'Rate (%)';
                    } else if (firstRow.changeMode.name === 'Fixed Amount') {
                        header.textContent = 'Amount';
                    } else {
                        header.textContent = 'Value';
                    }
                }
            }
        });
    }

    //method to handle saving a row to disk
    async handleSave(row, rowId = this.parentRowId, field = this.parentField) {
        const rowData = {};
        const columns = this.mainGrid.columns;
        
        // Get the original row data to reference for id and addSelect preservation
        const rowIndex = Array.from(row.parentNode.children).indexOf(row);
        const originalRowData = this.workingData[rowIndex];
        
        // Preserve the id from original data, or use null for new rows
        // DataManager will assign proper IDs when saving
        if (originalRowData && originalRowData.id != null) {
            rowData.id = originalRowData.id;
        } else {
            rowData.id = null;
        }
        
        // Calculate cell offset if there's a radio button column
        const cellOffset = (this.onRowClick && this.mainGrid.actions?.showSelector) ? 1 : 0;
        
        // Loop through columns and extract values from each cell/input
        columns.forEach((col, i) => {
            const cell = row.children[i + cellOffset];
            let value = '';
            switch (col.type) {
                case 'number': {
                    const input = cell.querySelector('input');
                    const rawValue = input ? input.value.trim() : cell.textContent.trim();
                    // Only convert to number if not empty, otherwise use default or null
                    value = rawValue !== '' ? Number(rawValue) : (typeof col.default !== 'undefined' ? col.default : null);
                    break;
                }
                case 'text': {
                    const input = cell.querySelector('input');
                    const rawValue = input ? input.value : cell.textContent;
                    // Empty strings should become null unless there's a default
                    value = rawValue.trim() !== '' ? rawValue : (typeof col.default !== 'undefined' ? col.default : null);
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
                    const rawValue = input ? input.value : '';
                    value = rawValue.trim() !== '' ? rawValue : (typeof col.default !== 'undefined' ? col.default : null);
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
            
            rowData[col.field] = value;
        })

        // For modal grids with add=false (single-row modals), always update the first row
        const isSingleRowModal = this.parentRowId !== undefined && 
                                 this.mainGrid.actions && 
                                 this.mainGrid.actions.add === false;
        
        let rowToUpdate;
        if (isSingleRowModal) {
            // Single-row modal: always update index 0
            rowToUpdate = 0;
        } else {
            // Multi-row modal or main grid: find by ID
            rowToUpdate = this.workingData.findIndex(r => r.id == rowData.id);
        }
        
        console.log('[EditableGrid] handleSave - Extracted rowData:', JSON.stringify(rowData, null, 2));
        console.log('[EditableGrid] handleSave - Updating row index:', rowToUpdate);
        console.log('[EditableGrid] handleSave - Is single-row modal:', isSingleRowModal);
        
        if (rowToUpdate >= 0 && rowToUpdate < this.workingData.length) {
            // Update existing row - merge with original to preserve hidden fields
            this.workingData[rowToUpdate] = { ...this.workingData[rowToUpdate], ...rowData };
        } else {
            // Add new row
            console.log('[EditableGrid] handleSave - Adding new row to workingData');
            this.workingData.push(rowData);
        }

        this.data.length = 0;
        this.data.push(...this.workingData);
        
        console.log('[EditableGrid] handleSave - Calling onSave with data:', this.data);
        console.log('[EditableGrid] handleSave - Parameters: rowId=', rowId, 'field=', field);
        
        if (this.onSave) {
            try {
                // Only filter incomplete rows when NOT saving from a modal
                // Modal saves have a 'field' parameter indicating which field was updated
                let dataToSave = this.data;
                
                if (field === undefined) {
                    // Filter out incomplete rows only for main grid saves (no field parameter)
                    dataToSave = this.data.filter(row => {
                        // Keep rows with valid IDs (existing rows)
                        if (row.id !== null && row.id !== undefined && row.id !== 0) return true;
                        
                        // For new rows (id is null/undefined/0), check if they have any meaningful data
                        // A row is considered incomplete if all editable fields are empty/default
                        const hasData = this.mainGrid.columns.some(col => {
                            if (col.field === 'id' || !col.editable) return false;
                            const value = row[col.field];
                            const defaultValue = col.default;
                            
                            // Check if value differs from default
                            if (value === null || value === undefined || value === '') return false;
                            if (JSON.stringify(value) === JSON.stringify(defaultValue)) return false;
                            
                            return true;
                        });
                        
                        return hasData;
                    });
                    console.log('[EditableGrid] handleSave - Main grid save, filtered incomplete rows:', dataToSave);
                } else {
                    console.log('[EditableGrid] handleSave - Modal save for field "' + field + '", preserving all rows');
                }
                
                // Pass rowId and field for modal grids, undefined for main grids
                await this.onSave(dataToSave, rowId, field);
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
                    // Don't assign ID here - let DataManager handle it
                    newRow[col.field] = null;
                    return;
                } else {
                    newRow[col.field] = (typeof col.default !== 'undefined') ? col.default : '';
                    return;
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
        // field: the field in the parent row to update (e.g., 'periodicChange', 'recurrence')
        // updatedModalData: the new data for that field (array from modal grid)
        const gridIndex = this.workingData.findIndex(row => row.id == rowId);
        if (gridIndex !== -1) {
            console.log('[EditableGrid] onModalSave - Updating field:', field, 'for row ID:', rowId);
            
            // For single-row modals (periodicChange), extract the first element
            // For multi-row modals (recurrence might have multiple patterns), keep as array
            const modalInfo = this.modals[field];
            const isSingleRowModal = modalInfo && modalInfo.schema && 
                                     modalInfo.schema.actions && 
                                     modalInfo.schema.actions.add === false;
            
            // If it's a single-row modal, store just the object, not the array
            if (isSingleRowModal && Array.isArray(updatedModalData) && updatedModalData.length > 0) {
                this.workingData[gridIndex][field] = updatedModalData[0];
            } else {
                this.workingData[gridIndex][field] = updatedModalData;
            }
            
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
                // Filter out incomplete rows before saving (same logic as handleSave)
                const completeData = this.data.filter(row => {
                    if (row.id !== null && row.id !== undefined && row.id !== 0) return true;
                    const hasData = this.mainGrid.columns.some(col => {
                        if (col.field === 'id' || !col.editable) return false;
                        const value = row[col.field];
                        const defaultValue = col.default;
                        if (value === null || value === undefined || value === '') return false;
                        if (JSON.stringify(value) === JSON.stringify(defaultValue)) return false;
                        return true;
                    });
                    return hasData;
                });
                this.onSave(completeData);
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
