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

    createRow(item, idx, actionsOverride = null, isEditing = false) { //, actionsOverride = null, isEditing = false
        // Create a new table row
        const tr = document.createElement('tr');
        tr.dataset.idx = idx;
        const rowActions = this.actions;

        // // Enable double-click to edit or open modal
        // tr.addEventListener('dblclick', (e) => {
        //     const cell = e.target.closest('td');
        //     const colDef = cell && this.columns.find(c => c.field === cell.dataset.field);
        //     // If modal column, open modal
        //     if (colDef && colDef.type === 'modal' && colDef.modalId) {
        //         this.openModal(colDef.modalId, item, colDef);
        //         return;
        //     }
        //     // Otherwise, toggle edit mode if allowed
        //     if (rowActions.edit !== false) {
        //         this.toggleEditState(tr, true);
        //     }
        // });

        // Build each cell for the row
        this.columns.forEach(col => {
            const td = document.createElement('td');
            td.dataset.field = col.field;

            if (!col.display){
                return;
            }
            let isCellEditable = col.editable;
            // If not editing or cell not editable, render as read-only
            if (!isCellEditable) {
                if (col.type === number){
                    // Render number input
                    // For a non-editable number (formatted as currency), use a <span> or <div>
                    const span = document.createElement('span');
                    // Format as currency (e.g., USD)
                    const value = item[col.field] ?? col.default ?? '';
                    span.textContent = typeof value === 'number'
                        ? value.toLocaleString(0, { style: 'currency', currency: 'ZAR' })
                        : value;
                    td.appendChild(span);
                }
                // If modal type, show modal icon button
                if (col.type === 'modal' && col.modalIcon) {
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
                } 
            }

            
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
                    const displayModal = document.createElement('button');
                    input.type = 'button';
                    input.value = ICONS.interest ?? col.modalIconTitle ?? 'No Title';
                    td.appendChild(displayModal)
                    break
                }
                default: {
                    // Render text input for other types
                    if (isCellEditable) {
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.value = '';
                        input.value = item[col.field] ?? col.default ?? '';
                        td.appendChild(input);
                        break;
                    }
                    const text = document.createElement('text');
                    text.type = 'text';
                    text.value = item[col.field] ?? col.default ?? ''
                    td.appendChild(input);
                    break;
                }
            }
            tr.appendChild(td);
        });

        // tr.appendChild(td);
        // Add actions cell if any action is enabled
        const actionsEnabled = rowActions && (rowActions.edit || rowActions.delete || rowActions.save || rowActions.add);
        if (actionsEnabled) {
            const actionsCell = this.createActionsCell(rowActions);
            // Attach edit button handler if allowed
            const editBtn = actionsCell.querySelector('.edit-btn');
            if (editBtn && rowActions.edit !== false) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleEditState(tr, true);
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
        let anyAction = false;
        if (actions && actions.edit) {
            td.innerHTML += `<button class="icon-btn edit-btn" title="Edit">${ICONS.edit}</button>`;
            anyAction = true;
        }
        if (actions && actions.delete) {
            td.innerHTML += `<button class="icon-btn delete-btn" title="Delete">${ICONS.delete}</button>`;
            anyAction = true;
        }
        if (actions && actions.save) {
            td.innerHTML += `<button class="icon-btn save-btn" title="Save">${ICONS.save}</button>`;
            anyAction = true;
        }
        // If all actions are false, render only the cancel button
        if (anyAction) {
            td.innerHTML += `<button class="icon-btn cancel-btn" title="Cancel">${ICONS.cancel}</button>`;
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
     * extractRowData: Extracts updated data from an editable row
     * @param {HTMLTableRowElement} row - Row element
     * @param {number} idx - Index in this.data
     * @returns {Object} updatedData - New row data
     */
    extractRowData(row, idx) {
        const updatedData = {};
        const originalData = this.data[idx] || {};
        this.columns.forEach(col => {
            let isCellEditable = false;
            if (typeof col.editable === 'function') {
                isCellEditable = col.editable(originalData);
            } else {
                isCellEditable = !!col.editable;
            }
            if (isCellEditable) {
                const cell = row.querySelector(`td[data-field="${col.field}"]`);
                let value;
                if (col.type === 'select') {
                    const select = cell.querySelector('select');
                    value = select ? select.value : (originalData[col.field] ?? col.default ?? '');
                } else if (col.type === 'checkbox') {
                    const checkbox = cell.querySelector('input[type="checkbox"]');
                    value = checkbox ? checkbox.checked : (originalData[col.field] ?? col.default ?? false);
                } else {
                    const input = cell.querySelector('input');
                    if (input) {
                        value = input.value;
                        if (col.type === 'number') {
                            const parsed = parseFloat(value);
                            value = isNaN(parsed) ? 0 : parsed;
                        }
                    } else {
                        value = cell.textContent;
                        if (col.type === 'number') {
                            const parsed = parseFloat(value);
                            value = isNaN(parsed) ? 0 : parsed;
                        }
                    }
                }
                updatedData[col.field] = value;
            }
        });
        return updatedData;
    }

    /**
     * saveRow: Saves a row's data to this.data and calls onSave
     * @param {number} idx - Index in this.data
     * @param {HTMLTableRowElement} row - Row element
     */
    async saveRow(idx, row) {
        if (!this._savingRows) this._savingRows = new Set();
        if (this._savingRows.has(row)) {
            console.warn(`[EditableGrid] saveRow already in progress for idx=${idx}`);
            return;
        }
        this._savingRows.add(row);
        try {
            console.log(`[EditableGrid] saveRow called for idx=${idx}`);
            const updatedData = this.extractRowData(row, idx);

            // Update internal data array BEFORE calling onSave
            // if (idx === -1) {
            //     this.data.push(updatedData);
            // } else {
            //     this.data[idx] = { ...this.data[idx], ...updatedData };
            // }

            // Show spinner on the row
            row.classList.add('saving-spinner');
            const spinner = document.createElement('span');
            spinner.className = 'row-spinner';
            spinner.innerHTML = '<svg width="16" height="16" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="#888" stroke-width="5" stroke-linecap="round" stroke-dasharray="31.415, 31.415" transform="rotate(0 25 25)"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite"/></circle></svg>';
            row.querySelector('td:last-child').appendChild(spinner);
            console.log(`[EditableGrid] Spinner shown for idx=${idx}`);

            // Call consumer's onSave
            let saveResult;
            if (this.onSave) {
                console.log(`[EditableGrid] Calling onSave for idx=${idx}`);
                saveResult = this.onSave(idx, updatedData, row, this);
            }
            if (saveResult && typeof saveResult.then === 'function') {
                await saveResult;
            }
            console.log(`[EditableGrid] onSave complete for idx=${idx}`);

            // Call consumer's onAfterSave if defined
            if (typeof this.onAfterSave === 'function') {
                console.log(`[EditableGrid] Calling onAfterSave for idx=${idx}`);
                await this.onAfterSave(idx, updatedData, row, this);
            }
            console.log(`[EditableGrid] onAfterSave complete for idx=${idx}`);

            // Remove spinner
            if (spinner.parentNode) spinner.parentNode.removeChild(spinner);
            row.classList.remove('saving-spinner');
            console.log(`[EditableGrid] Spinner removed for idx=${idx}`);

            // Only re-render if onAfterSave is not defined (otherwise onAfterSave handles it)
            if (typeof this.onAfterSave !== 'function') {
                this.render();
            }
        } finally {
            this._savingRows.delete(row);
        }
    }

    // Method to add a new, empty row for quick adding
    /**
     * addNewRow: Adds a new, empty row for quick adding
     */
    addNewRow() {
        const newRow = this.createRow({}, 'new');
        this.tbody.appendChild(newRow);
        // this.toggleEditState(newRow, true);
    }

    // Method to display the add new row option below the grid
    /**
     * displayAddNewOption: Shows the add new row button below the grid
     */
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

    // /**
    //  * toggleEditState: Switches a row between view and edit mode
    //  * @param {HTMLTableRowElement} row - Row element
    //  * @param {boolean} isEditing - If true, enables editing
    //  */
    // toggleEditState(row, isEditing) {
    //     if (!row) return;
    //     const idx = row.dataset.idx === 'new' ? -1 : parseInt(row.dataset.idx, 10);
    //     // Only toggle buttons that exist
    //     const deleteBtn = row.querySelector('.delete-btn');
    //     if (deleteBtn) deleteBtn.classList.toggle('hidden', isEditing);
    //     const saveBtn = row.querySelector('.save-btn');
    //     if (saveBtn) saveBtn.classList.toggle('hidden', !isEditing);
    //     const cancelBtn = row.querySelector('.cancel-btn');
    //     if (cancelBtn) cancelBtn.classList.toggle('hidden', !isEditing);
    //     row.classList.toggle('editing', isEditing);
    //     // Re-render row with editable controls if editing
    //     if (isEditing) {
    //         // Always use the latest row data for editing
    //         let item;
    //         if (idx === -1) {
    //             item = {};
    //         } else {
    //             item = { ...this.data[idx] };
    //             this.columns.forEach(col => {
    //                 const cell = row.querySelector(`td[data-field="${col.field}"]`);
    //                 if (cell) {
    //                     // Only override if undefined (not just falsy)
    //                     if (typeof item[col.field] === 'undefined') {
    //                         if (col.type === 'checkbox') {
    //                             const checkbox = cell.querySelector('input[type="checkbox"]');
    //                             item[col.field] = checkbox ? checkbox.checked : false;
    //                         } else if (col.type === 'select') {
    //                             const select = cell.querySelector('select');
    //                             item[col.field] = select ? select.value : cell.textContent;
    //                         } else {
    //                             item[col.field] = cell.textContent;
    //                         }
    //                     }
    //                 }
    //             });
    //         }
    //         const newRow = this.createRow(item, row.dataset.idx, null, true);
    //         row.replaceWith(newRow);
    //         // Add focusout handler to row to revert when leaving the row
    //         const onRowFocusOut = (e) => {
    //             if (this._ignoreNextFocusout) {
    //                 this._ignoreNextFocusout = false;
    //                 return;
    //             }
    //             if (!newRow.contains(e.relatedTarget)) {
    //                 this.toggleEditState(newRow, false);
    //                 newRow.removeEventListener('focusout', onRowFocusOut);
    //             }
    //         };
    //         newRow.addEventListener('focusout', onRowFocusOut);
    //         const firstEditable = this.columns.find(c => c.editable);
    //         if (firstEditable) {
    //             const cellToFocus = newRow.querySelector(`td[data-field="${firstEditable.field}"] input, td[data-field="${firstEditable.field}"] select`);
    //             if (cellToFocus) {
    //                 cellToFocus.focus();
    //             }
    //         }
    //     }
    // }
}
