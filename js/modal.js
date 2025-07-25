import { ICON_CANCEL } from '../styles/icons.js';
import { EditableGrid } from './editable-grid.js';

export class Modal {
    constructor(options) {
        this.targetElement = options.targetElement|| document.body;
        this.tableHeader = options.tableHeader;
        this.schema = options.schema;
        this.data = options.data;
        this.onSave = () => options.onSave && this.modalOverlay.remove();
        this.onDelete = options.onDelete;
        this.parentRowId = options.parentRowId;
        this.parentField = options.parentField;

        // Create overlay
        this.modalOverlay = document.createElement('div');
        this.modalOverlay.className = 'modal-overlay';
    }

    render() {
        // Remove existing modal if present
        if (this.modalOverlay) {
            this.modalOverlay.remove();
        }
        // Debug: Log schema and data passed to modal
        console.log('[Modal] Rendering with schema:', this.schema);
        console.log('[Modal] Rendering with data:', this.data);
        

        // Create modal box
        this.modalBox = document.createElement('div');
        this.modalBox.className = 'modal-content';

        // Create modal header container
        const modalHeader = document.createElement('div');
        modalHeader.className = 'modal-header flex-between';

        // Create close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn modal-close-btn';
        closeBtn.innerHTML = ICON_CANCEL;
        closeBtn.addEventListener('click', () => {
            this.modalOverlay.remove();
        });

        const header = document.createElement('h2')
        header.innerHTML = 'MODAL GRID!'
        window.add(modalHeader, header)
        window.add(modalHeader, closeBtn)
        window.add(this.modalBox, modalHeader)

        // Create EditableGrid inside modal
        const gridContainer = document.createElement('div');
        window.add(this.modalBox, gridContainer);

        const grid = new EditableGrid({
            targetElement: gridContainer,
            tableHeader: this.tableHeader || '',
            schema: this.schema,
            data: this.data,
            onSave: this.onSave, 
            onDelete: this.onDelete,
            parentRowId: this.parentRowId, 
            parentField: this.parentField
        });
        grid.render();

        window.add(this.modalOverlay, this.modalBox);
        window.add(this.targetElement, this.modalOverlay);
    }
}
