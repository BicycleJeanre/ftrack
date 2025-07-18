/**
 * Reusable Editable Grid Module
 *
 * This module provides a configurable, editable grid component.
 * It handles rendering data, inline editing, and user actions.
 */

import { loadConfig, getShortcut, matchShortcut } from './config.js';
import { openModal } from './modal.js';

const ICONS = {
    edit: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
    delete: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>',
    save: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>',
    cancel: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    // Dollar sign icon for interest
    interest: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/><text x="12" y="16" text-anchor="middle" font-size="12" fill="currentColor" dy=".3em">$</text></svg>'
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
        this.actions = options.actions || { add: false, edit: false, delete: false };
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
            const th = document.createElement('th');
            th.textContent = col.header || col.field;
            if (col.tooltip) th.title = col.tooltip;
            tr.appendChild(th);
        });
        tr.appendChild(document.createElement('th')).textContent = 'Actions';
        thead.appendChild(tr);
    }

    createRow(item, idx) {
        const tr = document.createElement('tr');
        tr.dataset.idx = idx;

        // Double-click to edit row
        tr.addEventListener('dblclick', (e) => {
            // If double-clicked cell is interest column and has modalIcon/onModalIconClick, open modal
            const cell = e.target.closest('td');
            const colDef = cell && this.columns.find(c => c.field === cell.dataset.field);
            if (colDef && colDef.type === 'modal' && colDef.modalId) {
                this.openModal(colDef.modalId, item, colDef);
                return;
            }
            // Otherwise, double-click edits row
            if (this.actions.edit !== false) {
                this.toggleEditState(tr, true);
            }
        });

        this.columns.forEach(col => {
            const td = document.createElement('td');
            td.dataset.field = col.field;
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
            } else if (col.render) {
                td.innerHTML = col.render(item);
            } else {
                td.textContent = item[col.field];
            }
            tr.appendChild(td);
        });

        tr.appendChild(this.createActionsCell());
        return tr;
    }

    openModal(modalId, cellData, colDef) {
        if (!this.schema || !this.schema[modalId]) {
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
            this.schema,
            cellData,
            colDef,
            handleModalSave,
            handleModalClose
        );
    }

    createActionsCell() {
        const td = document.createElement('td');
        td.className = 'actions';
        if (this.actions.edit !== false) {
            td.innerHTML += `<button class="icon-btn edit-btn" title="Edit">${ICONS.edit}</button>`;
        }
        if (this.actions.delete !== false) {
            td.innerHTML += `<button class="icon-btn delete-btn" title="Delete">${ICONS.delete}</button>`;
        }
        td.innerHTML += `<button class="icon-btn save-btn" title="Save">${ICONS.save}</button>`;
        td.innerHTML += `<button class="icon-btn cancel-btn" title="Cancel">${ICONS.cancel}</button>`;
        // Interest icon removed from actions cell
        return td;
    }

    // Method to handle table click events
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

    // Method to delete a row's data (NEW)
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
            spinner.innerHTML = '<svg width="16" height="16" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="#888" stroke-width="5" stroke-linecap="round" stroke-dasharray="31.415, 31.415" transform="rotate(0 25 25)"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite"/></circle></svg>';
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
            // Always re-sync grid data from source and re-render
            if (typeof this.options === 'object' && this.options.data) {
                this.data = this.options.data;
            }
            this.render();
        } finally {
            this._deletingRows.delete(row);
        }
    }

    // Split out row data extraction (for saveRow)
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

    // Method to save a row's data (refactored to use extractRowData)
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
            if (idx === -1) {
                this.data.push(updatedData);
            } else {
                this.data[idx] = { ...this.data[idx], ...updatedData };
            }

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

            // Always re-render grid after data change (do this before toggleEditState)
            this.render();
        } finally {
            this._savingRows.delete(row);
        }
    }

    // Method to add a new, empty row for quick adding
    addNewRow() {
        const newRow = this.createRow({}, 'new');
        this.tbody.appendChild(newRow);
        this.toggleEditState(newRow, true);
        // Do NOT call this.render() here; let saveRow handle re-render after save
    }

    // Method to display the add new row option below the grid
    displayAddNewOption() {
        // Remove existing add option if it exists
        this.removeAddNewOption();
        
        // Create add button container
        const addContainer = document.createElement('div');
        addContainer.className = 'add-row-container';
        addContainer.id = `add-row-${this.targetElement.id || 'grid'}`;
        
        // Create add button
        const addBtn = document.createElement('button');
        addBtn.className = 'btn btn-primary add-row-btn';
        addBtn.innerHTML = '+ Add New Row';
        addBtn.addEventListener('click', () => {
            this.addNewRow();
        });
        
        addContainer.appendChild(addBtn);
        
        // Insert after the table
        this.targetElement.parentNode.insertBefore(addContainer, this.targetElement.nextSibling);
    }

    // Method to remove the add new row option
    removeAddNewOption() {
        const containerId = `add-row-${this.targetElement.id || 'grid'}`;
        const existingContainer = document.getElementById(containerId);
        if (existingContainer) {
            existingContainer.remove();
        }
    }

    _registerShortcuts() {
        if (this._shortcutsRegistered) return;
        this._shortcutsRegistered = true;
        document.addEventListener('keydown', this._keydownHandler);
    }

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

    // Method to toggle the edit state of a row
    toggleEditState(row, isEditing) {
        const item = this.data[row.dataset.idx] || {};
        this.columns.forEach(col => {
            let isCellEditable = typeof col.editable === 'function' ? col.editable(item) : !!col.editable;
            const cell = row.querySelector(`td[data-field="${col.field}"]`);
            if (isCellEditable) {
                if (isEditing) {
                    cell.innerHTML = '';
                    if (col.type === 'select') {
                        const select = document.createElement('select');
                        if (col.options) {
                            col.options.forEach(opt => {
                                const option = document.createElement('option');
                                option.value = typeof opt === 'object' ? opt.value : opt;
                                option.textContent = typeof opt === 'object' ? opt.text : opt;
                                select.appendChild(option);
                            });
                        }
                        select.value = item[col.field] ?? col.default ?? '';
                        cell.appendChild(select);
                    } else if (col.type === 'number') {
                        const input = document.createElement('input');
                        input.type = 'number';
                        input.value = item[col.field] ?? col.default ?? 0;
                        input.className = 'editable-grid-input';
                        cell.appendChild(input);
                    } else {
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.value = item[col.field] ?? col.default ?? '';
                        input.className = 'editable-grid-input';
                        cell.appendChild(input);
                    }
                } else {
                    cell.contentEditable = false;
                    if (col.render) {
                        cell.innerHTML = col.render(item);
                    } else {
                        cell.textContent = item[col.field];
                    }
                }
            }
        });
        row.querySelector('.edit-btn').classList.toggle('hidden', isEditing);
        row.querySelector('.delete-btn').classList.toggle('hidden', isEditing);
        row.querySelector('.save-btn').classList.toggle('hidden', !isEditing);
        row.querySelector('.cancel-btn').classList.toggle('hidden', !isEditing);
        row.classList.toggle('editing', isEditing);
        if (isEditing) {
            // Add focusout handler to row to revert when leaving the row
            const onRowFocusOut = (e) => {
                if (this._ignoreNextFocusout) {
                    this._ignoreNextFocusout = false;
                    return;
                }
                if (!row.contains(e.relatedTarget)) {
                    this.toggleEditState(row, false);
                    row.removeEventListener('focusout', onRowFocusOut);
                }
            };
            row.addEventListener('focusout', onRowFocusOut);
            const firstEditable = this.columns.find(c => c.editable);
            if (firstEditable) {
                const cellToFocus = row.querySelector(`td[data-field="${firstEditable.field}"]`);
                if (cellToFocus) {
                    cellToFocus.focus();
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(cellToFocus);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
        }
    }
}
