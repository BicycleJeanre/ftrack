import { loadConfig, getShortcut, matchShortcut } from './config.js';
import { Modal } from './modal.js';
import { CalculationEngine } from './calculation-engine.js';
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

        this.showActions = this.mainGrid.actions.add || this.mainGrid.actions.edit || this.mainGrid.actions.delete || this.mainGrid.actions.save;

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
            if (col.type === 'select' && col.optionsSource && this.schema[col.optionsSource]) {
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
        table.className = 'table'

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
            addButton.className = 'add-button'
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
                            const options = this.selectOptions[col.field] || ["Empty"];
                            if (options) {
                                options.forEach(option => {
                                    const optionEl = document.createElement('option')
                                    optionEl.value = option
                                    optionEl.textContent = option
                                    if (option === acc[col.field]) {
                                        optionEl.selected = true
                                    }
                                    window.add(selectIn, optionEl)
                                })
                            }
                            window.add(cellContent, selectIn)
                            break
                        case 'modal':
                            let modalIcon = document.createElement('span')
                            modalIcon.innerHTML = ICONS[col.modalIcon]
                            modalIcon.className = 'modal-icon'
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
                    saveIcon.className = 'action-icon save-icon'
                    saveIcon.title = 'Save'
                    saveIcon.addEventListener('click', (event) => {
                        this.handleSave( event.target.closest('tr'))
                    })
                    window.add(actionsCell, saveIcon)
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
                    value = select ? select.value : '';
                    break;
                }
                case 'modal': {
                    // handle modal if needed
                    break;
                }
                default: {
                    value = cell.textContent;
                    break;
                }
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
        const newRow = {};
        this.mainGrid.columns.forEach(col => {
            if (col.field) {
                if (col.field === 'id'){
                    newRow[col.field] = this.workingData.reduce((max, curr) => curr.id > max ? curr.id+1 : max+1, 0)
                    return
                }else {
                    newRow[col.field] = col.default || '';
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
}
