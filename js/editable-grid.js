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
    interest: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>'
};

export class EditableGrid {
    constructor(options) {
        this.targetElement = options.targetElement;
        this.columns = options.columns;
        this.data = options.data;
        this.onSave = options.onSave;
        this.onDelete = options.onDelete;
        this.onUpdate = options.onUpdate;
        this.quickAddButton = options.quickAddButton;
        this.actions = options.actions || { add: true, edit: true, delete: true };

        this.tbody = this.targetElement.querySelector('tbody');
        this.tbody.addEventListener('click', this.handleTableClick.bind(this));
        if (this.quickAddButton && this.actions.add !== false) {
            this.quickAddButton.addEventListener('click', this.addNewRow.bind(this));
        }
    }

    // Method to render the entire grid
    render() {
        this.tbody.innerHTML = '';
        this.data.forEach((item, idx) => {
            const tr = this.createRow(item, idx);
            this.tbody.appendChild(tr);
        });
    }

    createRow(item, idx) {
        const tr = document.createElement('tr');
        tr.dataset.idx = idx;

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
        td.innerHTML += `<button class="icon-btn save-btn" title="Save" style="display:none;">${ICONS.save}</button>`;
        td.innerHTML += `<button class="icon-btn cancel-btn" title="Cancel" style="display:none;">${ICONS.cancel}</button>`;
        if (this.columns.find(c => c.field === 'interest')) {
            td.innerHTML += `<button class="icon-btn interest-btn" title="Interest Settings">${ICONS.interest}</button>`;
        }
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
                this.toggleEditState(row, true);
            } else if (btn.classList.contains('delete-btn')) {
                if (this.onDelete) this.onDelete(idx);
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
                    cell.innerHTML = ''; // Clear the cell

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
                        cell.textContent = currentValue;
                        cell.contentEditable = true;
                    }
                } else {
                    // When turning editing off, revert to text
                    cell.contentEditable = false;
                    if (col.render) {
                        cell.innerHTML = col.render(item);
                    } else {
                        cell.textContent = item[col.field];
                    }
                }
            }
        });

        row.querySelector('.edit-btn').style.display = isEditing ? 'none' : 'inline-block';
        row.querySelector('.delete-btn').style.display = isEditing ? 'none' : 'inline-block';
        row.querySelector('.save-btn').style.display = isEditing ? 'inline-block' : 'none';
        row.querySelector('.cancel-btn').style.display = isEditing ? 'inline-block' : 'none';

        row.classList.toggle('editing', isEditing);
        if (isEditing) {
            const firstEditable = this.columns.find(c => c.editable);
            if (firstEditable) {
                const cellToFocus = row.querySelector(`td[data-field="${firstEditable.field}"]`);
                cellToFocus.focus();
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(cellToFocus);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
    }

    // Method to save a row's data
    saveRow(idx, row) {
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
                    value = cell.querySelector('select').value;
                } else if (col.type === 'checkbox') {
                    value = cell.querySelector('input[type="checkbox"]').checked;
                } else {
                    value = cell.textContent;
                    if (col.type === 'number') {
                        value = parseFloat(value) || 0;
                    }
                }
                updatedData[col.field] = value;
            }
        });

        if (this.onSave) {
            this.onSave(idx, updatedData, row);
        }

        if (idx === -1) { // New row
            this.render(); // Re-render to integrate the new row properly
        } else {
            this.toggleEditState(row, false);
            // After saving, we need to update the row's display
            const updatedItem = { ...this.data[idx], ...updatedData };
            const newRowContent = this.createRow(updatedItem, idx);
            row.innerHTML = newRowContent.innerHTML;
        }
    }

    // Method to add a new, empty row for quick adding
    addNewRow() {
        const newRow = this.createRow({}, 'new');
        this.tbody.appendChild(newRow);
        this.toggleEditState(newRow, true);
    }
}
