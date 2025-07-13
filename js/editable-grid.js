/**
 * Reusable Editable Grid Module
 *
 * This module provides a configurable, editable grid component.
 * It handles rendering data, inline editing, and user actions.
 */

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
        this.columns = options.columns;
        this.data = options.data;
        this.onSave = options.onSave;
        this.onDelete = options.onDelete;
        this.onUpdate = options.onUpdate;
        this.actions = options.actions || { add: false, edit: false, delete: false };

        this.tbody = this.targetElement.querySelector('tbody');
        this.tbody.addEventListener('click', this.handleTableClick.bind(this));
        this._ignoreNextFocusout = false; // Flag to ignore next focusout
        this.onAfterDelete = options.onAfterDelete;
    }

    // Method to render the entire grid
    render() {
        this.tbody.innerHTML = '';
        this.data.forEach((item, idx) => {
            const tr = this.createRow(item, idx);
            this.tbody.appendChild(tr);
        });
        // Render add icon below the grid if enabled
        if (this.actions.add !== false) {
            this.renderAddIcon();
        } else {
            this.removeAddIcon();
        }
    }

    renderAddIcon() {
        // Remove any existing add icon
        this.removeAddIcon();
        const addIcon = document.createElement('button');
        addIcon.className = 'icon-btn grid-add-btn';
        addIcon.title = 'Add New Row';
        addIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>';
        addIcon.classList.add('grid-add-btn-styled');
        addIcon.setAttribute('tabindex', '0');
        addIcon.addEventListener('click', () => this.addNewRow());
        this.targetElement.parentNode.insertBefore(addIcon, this.targetElement.nextSibling);
        this._addIcon = addIcon;
    }

    removeAddIcon() {
        if (this._addIcon && this._addIcon.parentNode) {
            this._addIcon.parentNode.removeChild(this._addIcon);
            this._addIcon = null;
        }
    }

    createRow(item, idx) {
        const tr = document.createElement('tr');
        tr.dataset.idx = idx;

        // Double-click to edit row
        tr.addEventListener('dblclick', (e) => {
            // If double-clicked cell is interest column and has modalIcon/onModalIconClick, open modal
            const cell = e.target.closest('td');
            const colDef = cell && this.columns.find(c => c.field === cell.dataset.field);
            if (colDef && colDef.modalIcon && typeof colDef.onModalIconClick === 'function') {
                colDef.onModalIconClick({ event: e, idx, row: tr, cell, grid: this });
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
            if (col.render) {
                td.innerHTML = col.render(item);
            } else {
                td.textContent = item[col.field];
            }
            // Modal display icon support
            if (col.modalIcon && typeof col.onModalIconClick === 'function') {
                const iconBtn = document.createElement('button');
                iconBtn.className = 'icon-btn modal-icon-btn';
                iconBtn.title = col.modalIconTitle || 'Open Modal';
                iconBtn.innerHTML = col.modalIcon;
                iconBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    col.onModalIconClick({ event: e, idx, row: tr, cell: td, grid: this });
                });
                td.appendChild(iconBtn);
            }
            tr.appendChild(td);
        });

        tr.appendChild(this.createActionsCell());
        return tr;
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

            // Ensure row exits edit mode after save
            this.toggleEditState(row, false);
            // Always re-render grid after data change
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

    // Method to toggle the edit state of a row
    toggleEditState(row, isEditing) {
        const item = this.data[row.dataset.idx] || {};
        this.columns.forEach(col => {
            let isCellEditable = false;
            if (typeof col.editable === 'function') {
                isCellEditable = col.editable(item);
            } else {
                isCellEditable = !!col.editable;
            }
            if (isCellEditable) {
                const cell = row.querySelector(`td[data-field="${col.field}"]`);
                if (isEditing) {
                    const currentValue = item[col.field];
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
                        select.value = currentValue;
                        cell.appendChild(select);
                    } else if (col.type === 'checkbox') {
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.checked = !!currentValue;
                        cell.appendChild(checkbox);
                    } else {
                        const input = document.createElement('input');
                        input.type = col.type === 'number' ? 'number' : 'text';
                        input.value = currentValue !== undefined && currentValue !== null ? currentValue : '';
                        input.className = 'editable-grid-input';
                        input.style.width = '100%';
                        input.style.boxSizing = 'border-box';
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
