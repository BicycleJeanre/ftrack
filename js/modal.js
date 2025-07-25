import { ICON_CANCEL } from '../styles/icons.js';
import { EditableGrid } from './editable-grid.js';


// Temporary dummy data for modal grid demonstration
const dummySchema = {
    mainGrid: {
        columns: [
            { field: 'id', header: 'ID', display: true, editable: false, type: 'number' },
            { field: 'name', header: 'Name', display: true, editable: true, type: 'text' },
        ],
        actions: { add: true, edit: true, delete: true, save: true }
    }
};
const dummyData = [
    { id: 1, name: 'Checking', balance: 1200 },
    { id: 2, name: 'Savings', balance: 3400 },
    { id: 3, name: 'Investment', balance: 5000 }
];


export class Modal {
    constructor(options) {
        this.targetElement = options.targetElement|| document.body;
        this.tableHeader = options.tableHeader;
        this.schema = options.schema;
        this.data = options.data;
        this.onSave = options.onSave;
        this.onDelete = options.onDelete;
    }

    render() {
        // Remove existing modal if present
        if (this.modalOverlay) {
            this.modalOverlay.remove();
        }
        // Debug: Log schema and data passed to modal
        console.log('[Modal] Rendering with schema:', this.schema);
        console.log('[Modal] Rendering with data:', this.data);
        // Create overlay
        this.modalOverlay = document.createElement('div');
        this.modalOverlay.className = 'modal-overlay';

        // Create modal box
        this.modalBox = document.createElement('div');
        this.modalBox.className = 'modal-content';

        // Create close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close-btn';
        closeBtn.innerHTML = ICON_CANCEL;
        closeBtn.addEventListener('click', () => {
            this.modalOverlay.remove();
        });
        window.add(this.modalBox, closeBtn);

        const header = document.createElement('h2')
        header.innerHTML = 'MODAL GRID!'
        window.add(this.modalBox, header)

        // Create EditableGrid inside modal
        const gridContainer = document.createElement('div');
        window.add(this.modalBox, gridContainer);

        // Debug: Log data and schema passed to EditableGrid
        console.log('[Modal] Passing to EditableGrid:', {
            tableHeader: this.tableHeader || '',
            schema: this.schema,
            data: this.data
        });
        const grid = new EditableGrid({
            targetElement: gridContainer,
            tableHeader: this.tableHeader || '',
            schema: this.schema,
            data: this.data,
            onSave: () => {},
            onDelete: () => {}
        });
        grid.render();

        
        window.add(this.modalOverlay, this.modalBox);
        window.add(this.targetElement, this.modalOverlay);
    }
}
