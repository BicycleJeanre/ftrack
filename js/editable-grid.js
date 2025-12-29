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

    constructor(options) {
        this.targetElement = options.targetElement;
        this.tableHeader = options.tableHeader;
        this.schema = options.schema;
        this.data = options.data;
        this.onSave = options.onSave;
        this.onDelete = options.onDelete;
        this.parentRowId = options.parentRowId;
        this.parentField =options.parentField;

        // Support both {mainGrid: {...}} and {...} schema formats
        this.mainGrid = this.schema.mainGrid ? this.schema.mainGrid : this.schema;

        // Internal working data - copy of original data for manipulation
        this.workingData = [...this.data];

        // Allow showActions to be overridden, default based on available actions
        this.showActions = options.showActions !== undefined 
            ? options.showActions 
            : (this.mainGrid.actions.add || this.mainGrid.actions.edit || this.mainGrid.actions.delete || this.mainGrid.actions.save);

        // Track current cell for Excel-like navigation
        this.currentCell = { row: 0, col: 0 };
        this.isEditing = false;
        this.shortcutsLoaded = false;

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
            if ((col.type === 'select' || col.type === 'addSelect') && col.optionsSource && this.schema[col.optionsSource]) {
                this.selectOptions[col.field] = this.schema[col.optionsSource];
            }
        });
        // Modal and other sub-grids
        Object.values(this.schema).forEach(val => {
            if (val && val.columns && Array.isArray(val.columns)) {
                val.columns.forEach(col => {
                    if (col.type === 'select' && col.optionsSource && this.schema[col.optionsSource]) {
                        this.selectOptions[col.field] = this.schema[col.optionsSource];
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

        // Setup keyboard navigation
        this._setupKeyboardNavigation(table);

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
            if (col.display) {
                const colHead = document.createElement('th')
                colHead.textContent = col.header
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
                // Debug: Log each cell value
                console.log(`[EditableGrid] Row field '${col.field}':`, acc[col.field]);
                if (!(col.field in acc)) {
                    console.warn(`[EditableGrid] WARNING: Field '${col.field}' not found in data object`, acc);
                }
                if (acc[col.field] === undefined) {
                    console.warn(`[EditableGrid] WARNING: Value for field '${col.field}' is undefined. Possible typo or missing data.`, acc);
                }
                // Always create the cell, but hide if not displayed
                let cellContent = document.createElement('td')
                if (!col.display) cellContent.style.display = 'none'
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
                            window.add(cellContent, currencyIn)
                            break
                        case 'number':
                            let numIn = document.createElement('input')
                            numIn.type = 'number'
                            numIn.step = '1'
                            numIn.value = acc[col.field]
                            window.add(cellContent, numIn)
                            break
                        case 'text':
                            let texIn = document.createElement('input')
                            texIn.type = 'text'
                            texIn.value = acc[col.field]
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
                            dateIn.onchange = () => {
                                acc[col.field] = dateIn.value;
                                this.render();
                            };
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
                            // Show current selection as placeholder, keep input empty for full datalist
                            if (acc[col.field] && acc[col.field].name) {
                                input.placeholder = acc[col.field].name;
                            }
                            // Clear input on focus to show all options
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
    handleSave(row, rowId = this.parentRowId, field = this.parentField) {
        const rowData = {};
        const columns = this.mainGrid.columns;
        
        // Get the original row data to reference for addSelect preservation
        const rowIndex = Array.from(row.parentNode.children).indexOf(row);
        const originalRowData = this.workingData[rowIndex];
        
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
                        // If input is empty, preserve existing value or use placeholder
                        value = originalRowData[col.field] || null;
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

        const rowToUpdate = this.workingData.findIndex(row => row.id == rowData.id)
        this.workingData[rowToUpdate] = rowData    

        this.data.length = 0;
        this.data.push(...this.workingData);
        
        if (this.onSave) {
            // Pass rowId and field for modal grids, undefined for main grids
            this.onSave(this.data, rowId, field);
        }
    };

    handleAdd() {
        this._handleAddRow();
    }

    _handleAddRow() {
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

    // Excel-like keyboard navigation
    async _setupKeyboardNavigation(table) {
        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        // Load shortcuts config
        if (!this.shortcutsLoaded) {
            await loadConfig();
            this.shortcutsLoaded = true;
        }

        // Add click handlers to all cells for selection
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row, rowIndex) => {
            const cells = row.querySelectorAll('td');
            cells.forEach((cell, colIndex) => {
                // Skip hidden columns and actions column
                if (colIndex >= this.mainGrid.columns.length) return;
                const column = this.mainGrid.columns[colIndex];
                if (!column.display || !column.editable) return;

                cell.addEventListener('click', (e) => {
                    // Update current cell position (using schema column index)
                    this.currentCell.row = rowIndex;
                    this.currentCell.col = colIndex;
                    
                    // If clicked on interactive element, just ensure it stays focused
                    if (e.target.tagName === 'SPAN' || e.target.tagName === 'BUTTON') {
                        return;
                    }
                    
                    // If clicked on input/select, make sure it has focus (may have clicked padding)
                    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
                        if (!e.target.matches(':focus')) {
                            e.target.focus();
                            if (e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.target.type === 'number')) {
                                e.target.select();
                            }
                        }
                        return;
                    }
                    
                    // Clicked on cell background - call _selectCell for full focus handling
                    this._selectCell(rowIndex, colIndex);
                });
            });
        });

        // Keyboard event handler
        table.addEventListener('keydown', (e) => this._handleKeydown(e, table));
    }

    _handleKeydown(e, table) {
        const rows = table.querySelector('tbody').querySelectorAll('tr');
        const maxRow = rows.length - 1;

        // Check if currently in an input/select
        const activeElement = document.activeElement;
        const isInInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'SELECT');

        // Cancel edit (Escape) - revert changes
        if (matchShortcut(e, getShortcut('EditableGrid', 'cancelEdit'))) {
            e.preventDefault();
            this._cancelEdit();
            return;
        }

        // Delete row (works even when editing)
        if (matchShortcut(e, getShortcut('EditableGrid', 'deleteRow'))) {
            e.preventDefault();
            const row = rows[this.currentCell.row];
            if (row) this.handleDelete(row);
            return;
        }

        // Add row (works even when editing)
        if (matchShortcut(e, getShortcut('EditableGrid', 'addRow'))) {
            e.preventDefault();
            this._handleAddRow();
            return;
        }

        // Navigation: Tab = right, Shift+Tab = left, Enter = down, Shift+Enter = up
        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                this._moveLeft();
            } else {
                this._moveRight();
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                this._moveUp();
            } else {
                this._moveDown();
            }
        } else if (!isInInput && e.key === 'ArrowUp') {
            // Arrow keys only work when NOT in an input (prevents conflict with text editing)
            e.preventDefault();
            this._moveUp();
        } else if (!isInInput && e.key === 'ArrowDown') {
            e.preventDefault();
            this._moveDown();
        } else if (!isInInput && e.key === 'ArrowLeft') {
            e.preventDefault();
            this._moveLeft();
        } else if (!isInInput && e.key === 'ArrowRight') {
            e.preventDefault();
            this._moveRight();
        } else if (!isInInput && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // Typing any character when NOT in input - start editing with that character
            e.preventDefault();
            this._startEditingWithChar(e.key);
        }
    }

    _startEditingWithChar(char) {
        const column = this.mainGrid.columns[this.currentCell.col];
        
        // Only allow editing if column is editable
        if (!column.editable || !this.mainGrid.actions.edit) return;

        const table = this.targetElement.querySelector('table');
        const tbody = table?.querySelector('tbody');
        const rows = tbody?.querySelectorAll('tr');
        const cell = rows?.[this.currentCell.row]?.querySelectorAll('td')[this.currentCell.col];
        const input = cell?.querySelector('input');

        if (input && input.tagName === 'INPUT') {
            // Set value to the typed character, focus, and move cursor to end
            input.value = char;
            input.focus();
            // Move cursor to end
            if (input.setSelectionRange) {
                input.setSelectionRange(input.value.length, input.value.length);
            }
        }
    }

    _saveCurrentCell() {
        // Save the current cell's data before moving away
        const table = this.targetElement.querySelector('table');
        if (!table) return;

        const tbody = table.querySelector('tbody');
        const rows = tbody.querySelectorAll('tr');
        const currentRow = rows[this.currentCell.row];
        if (!currentRow) return;

        // Call handleSave to save the entire row
        this.handleSave(currentRow);
    }

    _moveUp() {
        if (this.currentCell.row > 0) {
            this._saveCurrentCell();
            this.currentCell.row--;
            this._selectCell(this.currentCell.row, this.currentCell.col);
        }
    }

    _moveDown() {
        const maxRow = this.workingData.length - 1;
        if (this.currentCell.row < maxRow) {
            this._saveCurrentCell();
            this.currentCell.row++;
            this._selectCell(this.currentCell.row, this.currentCell.col);
        }
    }

    _moveLeft() {
        // Find previous visible and editable column
        for (let col = this.currentCell.col - 1; col >= 0; col--) {
            const column = this.mainGrid.columns[col];
            if (column.display && column.editable) {
                this._saveCurrentCell();
                this.currentCell.col = col;
                this._selectCell(this.currentCell.row, this.currentCell.col);
                break;
            }
        }
    }

    _moveRight() {
        // Find next visible and editable column
        for (let col = this.currentCell.col + 1; col < this.mainGrid.columns.length; col++) {
            const column = this.mainGrid.columns[col];
            if (column.display && column.editable) {
                this._saveCurrentCell();
                this.currentCell.col = col;
                this._selectCell(this.currentCell.row, this.currentCell.col);
                break;
            }
        }
    }

    _selectCell(row, col) {
        // Blur the currently focused element before changing cells
        const currentFocus = document.activeElement;
        if (currentFocus && (currentFocus.tagName === 'INPUT' || currentFocus.tagName === 'SELECT')) {
            currentFocus.blur();
        }
        
        this.currentCell.row = row;
        this.currentCell.col = col;
        
        // Use requestAnimationFrame to ensure focus happens after blur completes
        requestAnimationFrame(() => {
            this._focusCell();
        });
    }

    _focusCell() {
        const column = this.mainGrid.columns[this.currentCell.col];
        
        // Only auto-focus if column is editable
        if (!column.editable || !this.mainGrid.actions.edit) {
            return;
        }

        const table = this.targetElement.querySelector('table');
        const tbody = table?.querySelector('tbody');
        const rows = tbody?.querySelectorAll('tr');
        const cell = rows?.[this.currentCell.row]?.querySelectorAll('td')[this.currentCell.col];
        
        // For modal type, focus the button and add Enter key handler
        if (column.type === 'modal') {
            const button = cell?.querySelector('span.btn');
            if (button) {
                button.tabIndex = 0;
                button.focus();
                
                // Add keydown listener for Enter key
                const enterHandler = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        button.click();
                    }
                };
                
                // Remove old listener if exists, add new one
                button.removeEventListener('keydown', enterHandler);
                button.addEventListener('keydown', enterHandler);
            }
            return;
        }
        
        const input = cell?.querySelector('input, select');

        if (input) {
            // Focus immediately - blur was handled before this call
            input.focus();
            
            // For text and number inputs, select all content
            if (input.tagName === 'INPUT' && (input.type === 'text' || input.type === 'number' || input.type === 'date')) {
                input.select();
            }
        }
    }

    _cancelEdit() {
        // Re-render to revert any unsaved changes
        this.render();
    }
}
