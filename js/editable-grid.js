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

        // Internal working data - copy of original data for manipulation
        this.workingData = [...this.data];

        this.showActions = options.schema.mainGrid.actions.add || options.schema.mainGrid.actions.edit || options.schema.mainGrid.actions.delete || options.schema.mainGrid.actions.save
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
        if (this.schema.mainGrid.actions.add) {
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
        this.schema.mainGrid.columns.forEach(col => {
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
        this.workingData.forEach(acc => {
            const row = document.createElement('tr')
            const columns = this.schema.mainGrid.columns
            columns.forEach(col => {
                // Always create the cell, but hide if not displayed
                let cellContent = document.createElement('td')
                if (!col.display) cellContent.style.display = 'none'
                if (!col.editable || !this.schema.mainGrid.actions.edit) {
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
                            const options = this.schema[col.optionsSource]
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
                                const intModal = new Modal(this.targetElement)
                                intModal.render()
                                // const modalData = this.schema[col.modal]
                                // modal.render(modalData)
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
                if (this.schema.mainGrid.actions.save) {
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
    handleSave(row) {
        const rowData = {};
        const columns = this.schema.mainGrid.columns;
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

        const accToUpdate = this.workingData.findIndex(acc => acc.id == rowData.id)
        this.workingData[accToUpdate] = rowData
        // Copy working data back to original data
        

        this.data.length = 0;
        this.data.push(...this.workingData);
        
        // Call external save handler if provided
        if (this.onSave) {
            this.onSave(this.data);
        }
    }

    //method for adding a new row to the grid. 
    handleAdd() {
        // Create new empty row based on schema defaults
        const newRow = {};
        this.schema.mainGrid.columns.forEach(col => {
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
    }
}
