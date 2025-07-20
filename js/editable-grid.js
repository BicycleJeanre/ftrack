/**
 * EditableGrid: Reusable, schema-driven editable grid component
 *
 * Key properties:
 * - targetElement: DOM element for grid table
 * - schema: Grid schema (columns, actions, formulas, etc.)
 * - data: Array of row objects for grid
 * - actions: CRUD actions enabled (from schema or options)
 * - columns: Array of column definitions (from schema or options)
 * - calcEngine: CalculationEngine instance for formulas
 *
 * Key methods:
 * - render(): Renders grid rows and headers
 * - createRow(item, idx, actionsOverride, isEditing): Creates a table row
 *   - item: Object representing row data (from this.data[idx] or new row)
 *   - idx: Row index in data array (or 'new' for new row)
 *   - actionsOverride: Optional actions config for this row
 *   - isEditing: If true, renders editable controls
 * - openModal(modalId, cellData, colDef): Opens modal for modal-type column
 * - handleTableClick(e): Handles action button clicks in grid
 * - saveRow(idx, row): Saves row data to this.data and calls onSave
 * - deleteRow(idx, row): Deletes row and calls onDelete
 * - extractRowData(row, idx): Extracts updated data from editable row
 * - toggleEditState(row, isEditing): Switches row between view/edit mode
 *
 * Usage:
 * - Instantiated with options: { targetElement, schema, columns, data, actions, ... }
 * - Renders grid based on schema and data
 * - Handles inline editing, modals, and CRUD actions
 */

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
        this.schema = options.schema || null;
        this.data = options.data;
        this.onSave = options.onSave;
        this.onDelete = options.onDelete;
        this.onUpdate = options.onUpdate;
        this.onAfterSave = options.onAfterSave;
        // if (this.schema.actions){
        //     this.actions = options.actions
        // } else {
        //     this.actions = { add: false, edit: false, delete: false, save: false }
        // }
        // Use actions from schema if available
        if (this.schema && this.schema.mainGrid && this.schema.mainGrid.actions) {
            this.actions = this.schema.mainGrid.actions;
        } else if (this.schema && this.schema.actions) {
            this.actions = this.schema.actions;
        } else {
            this.actions = { add: false, edit: false, delete: false, save: false };
        }
        this.tbody = this.targetElement.querySelector('tbody');
        this.tbody.addEventListener('click', this.handleTableClick.bind(this));
        this._ignoreNextFocusout = false;
        this.onAfterDelete = options.onAfterDelete;
        this._shortcutsLoaded = false;
        this._keydownHandler = this._handleKeydown.bind(this);
        // Parse columns from schema if provided
        if (this.schema && this.schema.mainGrid && Array.isArray(this.schema.mainGrid.columns)) {
            this.columns = this.schema.mainGrid.columns;
        } else {
            this.columns = options.columns;
        }
        this.calcEngine = this.schema ? new CalculationEngine(this.schema) : null;
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
        await this._ensureShortcutsLoaded();
        this.tbody.innerHTML = '';
        // Render headers dynamically from schema
        this.renderHeaders();
        this.data.forEach((item, idx) => {
            const tr = this.createRow(item, idx);
            this.tbody.appendChild(tr);
        });
        // Render add icon below the grid if enabled
        if (this.actions.add !== false) {
            this.displayAddNewOption();
        } else {
            this.removeAddNewOption();
        }
    }

    renderHeaders() {
        const thead = this.targetElement.querySelector('thead');
        if (!thead) return;
        
        thead.innerHTML = '';
        const tr = document.createElement('tr');
        this.columns.forEach(col => {
            if (!col.display){
                return;
            }
            const th = document.createElement('th');
            th.textContent = col.header || col.field;
            if (col.tooltip) th.title = col.tooltip;
            tr.appendChild(th);
        });
        // Only add Actions header if any action is enabled
        const actionsEnabled = this.actions && (this.actions.edit || this.actions.delete || this.actions.save || this.actions.add);
        if (actionsEnabled) {
            tr.appendChild(document.createElement('th')).textContent = 'Actions';
        }
        thead.appendChild(tr);
    }

    createRow(item, idx, actionsOverride = null) { //, actionsOverride = null, isEditing = false
        // Create a new table row
        const tr = document.createElement('tr');
        tr.dataset.idx = idx;
        const rowActions = this.actions;

        // Build each cell for the row
        this.columns.forEach(col => {
            //create row object
            const td = document.createElement('td');
            td.dataset.field = col.field;
            //if not display column. exit
            if (!col.display){
                return;
            }

            let isCellEditable = col.editable;
            // If the cell is not editable, render as display only object. 
            if (!isCellEditable) {
                switch (col.type) {
                    case 'number': {
                        // Render number input
                        td.textContent = (item[col.field] ?? col.default ?? 0).toLocaleString(undefined, { style: 'currency', currency: item['currency'] });
                        break;
                    }
                    default: {
                        // Render text input for other types
                        const text = document.createElement('text');
                        text.type = 'text';
                        text.value = item[col.field] ?? col.default ?? ''
                        td.appendChild(text);
                        break;
                    }
            }
                
            } else { //it is editable, render as editable item. 
                switch (col.type) {
                    case 'select': {
                        const select = document.createElement('select');
                        // Populate select options
                        if (Array.isArray(col.options)) {
                            let selectedValue = typeof item[col.field] !== 'undefined' ? item[col.field] : (col.default ?? (col.options[0] && col.options[0].value));
                            col.options.forEach(opt => {
                                let value, label;
                                if (typeof opt === 'string') {
                                    value = opt;
                                    label = opt;
                                }
                                const option = document.createElement('option');
                                option.value = value;
                                option.textContent = label;
                                if (selectedValue == value) option.selected = true;
                                select.appendChild(option);
                            });                        
                        } else if (col.optionsSource) {
                            return
                        }else {
                            // No options defined, show disabled select
                            const option = document.createElement('option');
                            option.value = '';
                            option.textContent = 'No options defined';
                            select.appendChild(option);
                            select.disabled = true;
                        }

                        select.addEventListener('change', (e) => {
                                // Update the item with the new value
                                item[col.field] = select.value;

                                // Re-render the row with the updated item
                                const newRow = this.createRow(item, idx, actionsOverride, true);
                                tr.replaceWith(newRow);
                            });
                        td.appendChild(select);
                        break;
                    }
                    case 'checkbox': {
                        // Render checkbox input
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.checked = !!item[col.field];
                        td.appendChild(checkbox);
                        break;
                    }
                    case 'number': {
                        // Render number input
                        const input = document.createElement('input');
                        input.type = 'number';
                        input.value = item[col.field] ?? col.default ?? '';
                        td.appendChild(input);
                        break;
                    }
                    case 'modal' : {
                        const iconBtn = document.createElement('button');
                        iconBtn.className = 'icon-btn modal-icon-btn';
                        iconBtn.title = col.modalIconTitle || 'Open Modal';
                        iconBtn.innerHTML = ICONS[col.modalIcon] || ICONS.edit;
                        iconBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.openModal(col.modalId, item, col);
                        });
                        td.appendChild(iconBtn);

                        td.textContent = item[col.field];
                        break
                    }
                default: {
                    // Render text input for other types
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = '';
                    input.value = item[col.field] ?? col.default ?? '';
                    td.appendChild(input);
                    break;
                }
                }
            }

            tr.appendChild(td);
        });

        // Add actions cell if any action is enabled
        const actionsEnabled = rowActions && (rowActions.edit || rowActions.delete || rowActions.save || rowActions.add);
        if (actionsEnabled) {
            const actionsCell = this.createActionsCell(rowActions);
            // Attach edit button handler if allowed
            // const editBtn = actionsCell.querySelector('.edit-btn');
            // if (editBtn && rowActions.edit !== false) {
            //     editBtn.addEventListener('click', (e) => {
            //         e.stopPropagation();
            //     });
            // }
            const saveBtn = actionsCell.querySelector('.save-btn');
            if (saveBtn && rowActions.save !== false) {
                saveBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = tr.dataset.idx === 'new' ? -1 : parseInt(tr.dataset.idx, 10);
                    this.saveRow(idx, tr);
                });
            }
            const deleteBtn = actionsCell.querySelector('.delete-btn');
            if (deleteBtn && rowActions.delete !== false) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = tr.dataset.idx === 'new' ? -1 : parseInt(tr.dataset.idx, 10);
                    this.deleteRow(idx, tr);
                });
            }
            tr.appendChild(actionsCell);
        }

        return tr;
    }

    /**
     * openModal: Opens a modal for modal-type columns
     * @param {string} modalId - The modal schema ID
     * @param {Object} cellData - Data for the cell/row
     * @param {Object} colDef - Column definition that triggered modal
     *
     * Uses this.schema[modalId] for modal schema
     */
    

    openModal(modalId, cellData, colDef) {
        const modalSchema = this.schema[modalId]
        if (!this.schema || !modalSchema) {
            console.error(`Modal schema not found for modalId: ${modalId}`);
            return;
        }

        // Use the generic modal handler
        const handleModalSave = async (modalData, originalCellData) => {
            // Update the cell data with the modal data
            const modalSchema = this.schema[modalId];
            const dataField = modalSchema.dataField || modalId;
            originalCellData[dataField] = modalData;
            
            // Re-render the grid to reflect changes
            this.render();
            
            // Call the grid's onSave if it exists
            if (this.onSave) {
                const rowIndex = this.data.indexOf(originalCellData);
                await this.onSave(rowIndex, originalCellData, null, this);
            }
        };

        const handleModalClose = () => {
            // Optional: Handle modal close
            console.log('Modal closed');
        };

        openModal(
            modalId,
            modalSchema,
            cellData,
            colDef,
            handleModalSave,
            handleModalClose
        );
    }

    /**
     * createActionsCell: Builds the actions cell for a row
     * @param {Object} actions - Actions config (edit, delete, save, cancel)
     */
    createActionsCell(actions) {
        const td = document.createElement('td');
        td.className = 'actions';
        // Use actions field to determine which buttons to show
        if (actions && actions.edit) {
            td.innerHTML += `<button class="icon-btn edit-btn" title="Edit">${ICONS.edit}</button>`;
        }
        if (actions && actions.delete) {
            td.innerHTML += `<button class="icon-btn delete-btn" title="Delete">${ICONS.delete}</button>`;
        }
        if (actions && actions.save) {
            td.innerHTML += `<button class="icon-btn save-btn" title="Save">${ICONS.save}</button>`;
        }
        return td;
    }

    // Method to handle table click events
    /**
     * handleTableClick: Handles clicks on action buttons in the grid
     * @param {MouseEvent} e - Click event
     */
    handleTableClick(e) {
        const btn = e.target.closest('.icon-btn');
        const cell = e.target.closest('td');
        const row = e.target.closest('tr');
        const isNew = row && row.dataset.idx === 'new';
        const idx = isNew ? -1 : (row ? parseInt(row.dataset.idx, 10) : null);

        // Per-cell and per-column callback support
        if (cell && row && this.columns) {
            const colDef = this.columns.find(c => c.field === cell.dataset.field);
            if (colDef && typeof colDef.onCellClick === 'function') {
                colDef.onCellClick({ event: e, idx, row, cell, grid: this });
                return;
            }
        }

        if (btn) {
            if (btn.classList.contains('edit-btn')) {
                this._ignoreNextFocusout = true; // Prevent immediate revert
                this.toggleEditState(row, true);
            } else if (btn.classList.contains('delete-btn')) {
                this.deleteRow(idx, row);
            } else if (btn.classList.contains('save-btn')) {
                this.saveRow(idx, row);
            } else if (btn.classList.contains('cancel-btn')) {
                if (isNew) {
                    row.remove();
                } else {
                    this.toggleEditState(row, false);
                    this.render(); // Re-render to restore original data
                }
            } else if (this.onUpdate) {
                this.onUpdate(e, idx, row);
            }
        } else if (this.onUpdate) {
            this.onUpdate(e, idx, row);
        }
    }

    /**
     * deleteRow: Deletes a row from the grid
     * @param {number} idx - Index in this.data
     * @param {HTMLTableRowElement} row - Row element
     */
    async deleteRow(idx, row) {
        if (!this._deletingRows) this._deletingRows = new Set();
        if (this._deletingRows.has(row)) {
            console.warn(`[EditableGrid] deleteRow already in progress for idx=${idx}`);
            return;
        }
        this._deletingRows.add(row);
        try {
            // Show spinner on the row
            row.classList.add('saving-spinner');
            const spinner = document.createElement('span');
            spinner.className = 'row-spinner';
            spinner.innerHTML = ICONS.spinner;
            row.querySelector('td:last-child').appendChild(spinner);
            console.log(`[EditableGrid] Spinner shown for delete idx=${idx}`);

            // Call consumer's onDelete
            let deleteResult;
            if (this.onDelete) {
                console.log(`[EditableGrid] Calling onDelete for idx=${idx}`);
                deleteResult = this.onDelete(idx, row, this);
            }
            if (deleteResult && typeof deleteResult.then === 'function') {
                await deleteResult;
            }
            console.log(`[EditableGrid] onDelete complete for idx=${idx}`);

            // Do NOT mutate this.data here; let consumer own the data
            // this.data.splice(idx, 1);

            // Call consumer's onAfterDelete if defined
            if (typeof this.onAfterDelete === 'function') {
                console.log(`[EditableGrid] Calling onAfterDelete for idx=${idx}`);
                await this.onAfterDelete(idx, row, this);
            }
            console.log(`[EditableGrid] onAfterDelete complete for idx=${idx}`);

            // Remove spinner
            if (spinner.parentNode) spinner.parentNode.removeChild(spinner);
            row.classList.remove('saving-spinner');
            console.log(`[EditableGrid] Spinner removed for delete idx=${idx}`);

            // Remove row from DOM
            if (row.parentNode) row.parentNode.removeChild(row);
            
            // Only re-render if onAfterDelete is not defined (otherwise onAfterDelete handles it)
            if (typeof this.onAfterDelete !== 'function') {
                // Always re-sync grid data from source and re-render
                if (typeof this.options === 'object' && this.options.data) {
                    this.data = this.options.data;
                }
                this.render();
            }
        } finally {
            this._deletingRows.delete(row);
        }
    }


    /**
     * saveRow: Saves a row's data to this.data and calls onSave
     * @param {number} idx - Index in this.data
     * @param {HTMLTableRowElement} row - Row element
     */
    async saveRow(idx, row) {
        if (!this.onSave) {
            console.warn('[EditableGrid] onSave is not defined');
            return;
        }

        // const updatedData = this.extractRowData(row, idx);
        let updatedData = {};

        this.columns.forEach(col => {
            if (col.editable) {
                const cell = row.querySelector(`td[data-field="${col.field}"]`);
                const input = cell.querySelector('input, select, input[type="checkbox"]');
                updatedData[col.field] = input ? (input.type === 'checkbox' ? input.checked : input.value) : cell.textContent;
            }
        });

        try {
            await this.onSave(idx, updatedData, row, this);
            if (typeof this.onAfterSave === 'function') {
                await this.onAfterSave(idx, updatedData, row, this);
            }
        } catch (error) {
            console.error(`[EditableGrid] Error saving row idx=${idx}:`, error);
        }
    }

    addNewRow() {
        const newRow = this.createRow({}, 'new');
        this.tbody.appendChild(newRow);
        // this.toggleEditState(newRow, true);
    }

     // displayAddNewOption: Shows the add new row button below the grid

    displayAddNewOption() {
        // Remove existing add option if it exists
        this.removeAddNewOption();
        // Create add button container
        const addContainer = document.createElement('div');
        addContainer.className = 'add-row-container';
        addContainer.id = `add-row-${this.targetElement.id || 'grid'}`;
        // Create add button
        const addBtn = document.createElement('button');
        addBtn.className = 'btn icon-btn';
        addBtn.innerHTML = `${ICONS.add}`;
        addBtn.addEventListener('click', () => {
            this.addNewRow();
        });
        addContainer.appendChild(addBtn);
        // Insert after the table
        this.targetElement.parentNode.insertBefore(addContainer, this.targetElement.nextSibling);
    }

    // Method to remove the add new row option
    /**
     * removeAddNewOption: Removes the add new row button
     */
    removeAddNewOption() {
        const containerId = `add-row-${this.targetElement.id || 'grid'}`;
        const existingContainer = document.getElementById(containerId);
        if (existingContainer) {
            existingContainer.remove();
        }
    }

    /**
     * _registerShortcuts: Registers keyboard shortcuts for grid actions
     */
    _registerShortcuts() {
        if (this._shortcutsRegistered) return;
        this._shortcutsRegistered = true;
        document.addEventListener('keydown', this._keydownHandler);
    }

    /**
     * _handleKeydown: Handles keyboard shortcuts for grid actions
     * @param {KeyboardEvent} e - Keydown event
     */
    _handleKeydown(e) {
        // Only trigger if grid is visible
        if (!this.targetElement.offsetParent) return;
        const saveKey = getShortcut('EditableGrid', 'saveRow');
        const deleteKey = getShortcut('EditableGrid', 'deleteRow');
        const addKey = getShortcut('EditableGrid', 'addRow');
        if (matchShortcut(e, saveKey)) {
            const editingRow = this.tbody.querySelector('tr.editing');
            if (editingRow) {
                const idx = editingRow.dataset.idx === 'new' ? -1 : parseInt(editingRow.dataset.idx, 10);
                this.saveRow(idx, editingRow);
                e.preventDefault();
            }
        } else if (matchShortcut(e, deleteKey)) {
            const editingRow = this.tbody.querySelector('tr.editing');
            if (editingRow) {
                const idx = editingRow.dataset.idx === 'new' ? -1 : parseInt(editingRow.dataset.idx, 10);
                this.deleteRow(idx, editingRow);
                e.preventDefault();
            }
        } else if (matchShortcut(e, addKey)) {
            this.addNewRow();
            e.preventDefault();
        }
    }
}
