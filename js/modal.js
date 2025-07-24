import { ICON_CANCEL } from '../styles/icons.js';
import { EditableGrid } from './editable-grid.js';


// Temporary dummy data for modal grid demonstration
const dummySchema = {
    mainGrid: {
        columns: [
            { field: 'id', header: 'ID', display: true, editable: false, type: 'number' },
            { field: 'name', header: 'Name', display: true, editable: true, type: 'text' },
            { field: 'balance', header: 'Balance', display: true, editable: true, type: 'currency' }
        ],
        actions: { add: true, edit: true, delete: true, save: true }
    }
};
const dummyData = [
    { id: 1, name: 'Checking', balance: 1200, currency: 'USD' },
    { id: 2, name: 'Savings', balance: 3400, currency: 'USD' },
    { id: 3, name: 'Investment', balance: 5000, currency: 'USD' }
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

        const grid = new EditableGrid({
            targetElement: gridContainer,
            tableHeader: 'Demo Accounts',
            schema: dummySchema,
            data: dummyData,
            onSave: () => {},
            onDelete: () => {}
        });
        grid.render();

        
        window.add(this.modalOverlay, this.modalBox);
        window.add(this.targetElement, this.modalOverlay);
    }
}
