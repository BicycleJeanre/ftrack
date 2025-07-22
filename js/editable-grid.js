
import { loadConfig, getShortcut, matchShortcut } from './config.js';
import { openModal } from './modal.js';
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

        this.showActions = options.schema.mainGrid.actions.add || options.schema.mainGrid.actions.edit || options.schema.mainGrid.actions.mainGrid.actions.delete || options.schema.save
        // if (this.schema && this.schema.mainGrid && this.schema.mainGrid.actions) {
        //     this.actions = this.schema.mainGrid.actions;
        // } else if (this.schema && this.schema.actions) {
        //     this.actions = this.schema.actions;
        // } else {
        //     this.actions = { add: false, edit: false, delete: false, save: false };
        // }
        // this.tbody = this.targetElement.querySelector('tbody');
        // this.tbody.addEventListener('click', this.handleTableClick.bind(this));
        // this._ignoreNextFocusout = false;
        // this.onAfterDelete = options.onAfterDelete;
        // this._shortcutsLoaded = false;
        // this._keydownHandler = this._handleKeydown.bind(this);
        // // Parse columns from schema if provided
        // if (this.schema && this.schema.mainGrid && Array.isArray(this.schema.mainGrid.columns)) {
        //     this.columns = this.schema.mainGrid.columns;
        // } else {
        //     this.columns = options.columns;
        // }
        // this.calcEngine = this.schema ? new CalculationEngine(this.schema) : null;
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
        this.data.forEach(acc => {
            const row = document.createElement('tr')
            const columns = this.schema.mainGrid.columns
            columns.forEach(col => {
                if (!col.display) return
                if (!col.editable) {
                    let cellContent = document.createElement('td')
                    cellContent.textContent = acc[col.field]
                    window.add(row, cellContent)
                } else {
                    switch (col.type) {
                        case 'currency':
                            let currencyCell = document.createElement('td')
                            let currencyIn = document.createElement('input')
                            currencyIn.type = 'number'
                            currencyIn.step = '1'
                            currencyIn.value = new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: acc.currency
                            }).format(acc[col.field])
                            window.add(currencyCell, currencyIn)
                            window.add(row, currencyCell)
                            break
                        case 'number':
                            let numCell = document.createElement('td')
                            let numIn = document.createElement('input')
                            numIn.type = 'number'
                            numIn.step = '1'
                            numIn.value = acc[col.field]
                            window.add(numCell, numIn)
                            window.add(row, numCell)
                            break
                        case 'text':
                            let textCell = document.createElement('td')
                            let texIn = document.createElement('input')
                            texIn.type = 'text'
                            texIn.value = acc[col.field]
                            window.add(textCell, texIn)
                            window.add(row, textCell)
                            break
                        case 'select':
                            let selectCell = document.createElement('td')
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
                            window.add(selectCell, selectIn)
                            window.add(row, selectCell)
                            break
                        case 'modal':
                            let modalCell = document.createElement('td')
                            let modalIcon = document.createElement('span')
                            modalIcon.innerHTML = ICONS[col.modalIcon]
                            modalIcon.className = 'modal-icon'
                            modalIcon.title = col.modalIconTitle
                            // modalIcon.addEventListener('click', () => {
                            //     const modalData = this.schema[col.modal]
                            //     modal.render(modalData)
                            // })
                            window.add(modalCell, modalIcon)
                            window.add(row, modalCell)
                            break
                        default:
                            let defCell = document.createElement('td')
                            let def = document.createElement('input')
                            def.type = 'text'
                            def.value = acc[col.field]
                            window.add(defCell, def)
                            window.add(row, defCell)
                            break
                    }
                }
            })
            window.add(tbody, row)
        })
        return tbody
    }
}
