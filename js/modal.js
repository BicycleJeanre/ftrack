import { EditableGrid } from './editable-grid.js';

/**
 * Modal Handler for EditableGrid
 * Receives a modal schema and data, then instantiates an EditableGrid for the modal content
 */
export class Modal {
    constructor() {
        this.currentModal = null;
        this.currentGrid = null;
        this.overlay = null;
        this.modalElement = null;
    }

    /**
     * Open a modal with the given schema and data
     * @param {string} modalId - The modal ID to reference in the schema
     * @param {Object} schema - The full schema object containing modal definitions
     * @param {Object} cellData - The data from the cell that triggered the modal
     * @param {Object} colDef - The column definition that triggered the modal
     * @param {Function} onSave - Callback when modal data is saved
     * @param {Function} onClose - Callback when modal is closed
     */
    openModal(modalId, schema, cellData, colDef, onSave, onClose) {
        // Get the modal schema
        const modalSchema = schema[modalId];
        if (!modalSchema) {
            console.error(`Modal schema not found for modalId: ${modalId}`);
            return;
        }

        // Create modal overlay
        this.createModalOverlay();

        // Create modal element
        this.createModalElement(modalSchema, cellData);

        // Create EditableGrid instance for the modal
        this.createModalGrid(modalSchema, cellData, onSave, onClose);

        // Show the modal
        this.showModal();
    }

    /**
     * Create the modal overlay
     */
    createModalOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';

        // Close modal when clicking overlay
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.closeModal();
            }
        });

        document.body.appendChild(this.overlay);
    }

    /**
     * Create the modal element
     */
    createModalElement(modalSchema, cellData) {
        this.modalElement = document.createElement('div');
        this.modalElement.className = 'modal-content';

        // Create modal header
        const header = document.createElement('div');
        header.className = 'modal-header';

        const title = document.createElement('h3');
        title.textContent = modalSchema.title || 'Modal';
        title.className = 'modal-title';

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.className = 'modal-close-btn';
        closeBtn.addEventListener('click', () => this.closeModal());

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Create modal body (table container)
        const body = document.createElement('div');
        body.className = 'modal-body';

        const table = document.createElement('table');
        table.className = 'editable-grid-table modal-table';

        const thead = document.createElement('thead');
        const tbody = document.createElement('tbody');
        
        table.appendChild(thead);
        table.appendChild(tbody);
        body.appendChild(table);

        // Create modal footer
        const footer = document.createElement('div');
        footer.className = 'modal-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.addEventListener('click', () => this.closeModal());

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.className = 'btn btn-primary';
        saveBtn.addEventListener('click', () => this.saveModal());

        footer.appendChild(cancelBtn);
        footer.appendChild(saveBtn);

        this.modalElement.appendChild(header);
        this.modalElement.appendChild(body);
        this.modalElement.appendChild(footer);

        this.overlay.appendChild(this.modalElement);
    }

    /**
     * Create the EditableGrid instance for the modal
     */
    createModalGrid(modalSchema, cellData, onSave, onClose) {
        const tableElement = this.modalElement.querySelector('table');
        
        console.log('[Modal] Creating modal grid with schema:', modalSchema);
        console.log('[Modal] Cell data:', cellData);
        console.log('[Modal] Looking for dataField:', modalSchema.dataField);
        
        // Get modal data - this could be an array or single object
        let modalData = cellData[modalSchema.dataField] || [];
        console.log('[Modal] Modal data found:', modalData);
        
        // If it's not an array, make it one for the grid
        if (!Array.isArray(modalData)) {
            modalData = modalData ? [modalData] : [];
            console.log('[Modal] Converted to array:', modalData);
        }

        console.log('[Modal] Final modal data for grid:', modalData);
        console.log('[Modal] Table element:', tableElement);
        console.log('[Modal] Table tbody:', tableElement?.querySelector('tbody'));

        // Create the EditableGrid instance
        this.currentGrid = new EditableGrid({
            targetElement: tableElement,
            schema: modalSchema,
            columns: modalSchema.columns, // Pass columns directly since modal schema has columns at root level
            data: modalData,
            actions: {
                add: modalSchema.actions?.add !== false,
                edit: modalSchema.actions?.edit !== false,
                delete: modalSchema.actions?.delete !== false
            },
            onSave: async (idx, updatedData, row, grid) => {
                // Update the modal data
                if (idx === -1) {
                    // New row
                    modalData.push(updatedData);
                } else {
                    // Update existing row
                    modalData[idx] = { ...modalData[idx], ...updatedData };
                }
                
                // Call the provided onSave callback if it exists
                if (onSave) {
                    await onSave(modalData, cellData);
                }
            },
            onDelete: async (idx, row, grid) => {
                // Remove from modal data
                modalData.splice(idx, 1);
                
                // Call the provided onSave callback to update parent
                if (onSave) {
                    await onSave(modalData, cellData);
                }
            }
        });

        // Store callbacks for later use
        this.onSave = onSave;
        this.onClose = onClose;
        this.cellData = cellData;
        this.modalData = modalData;
        this.modalSchema = modalSchema;

        // Render the grid
        console.log('[Modal] About to render grid with data:', modalData);
        this.currentGrid.render();
        console.log('[Modal] Grid rendered');
    }

    /**
     * Show the modal
     */
    showModal() {
        if (this.overlay) {
            this.overlay.style.display = 'flex';
            
            // Focus the modal for keyboard navigation
            this.modalElement.focus();
            
            // Add escape key listener
            this.escapeKeyListener = (e) => {
                if (e.key === 'Escape') {
                    this.closeModal();
                }
            };
            document.addEventListener('keydown', this.escapeKeyListener);
        }
    }

    /**
     * Save the modal data
     */
    async saveModal() {
        if (this.onSave && this.modalData) {
            await this.onSave(this.modalData, this.cellData);
        }
        this.closeModal();
    }

    /**
     * Close the modal
     */
    closeModal() {
        if (this.escapeKeyListener) {
            document.removeEventListener('keydown', this.escapeKeyListener);
        }
        
        if (this.overlay) {
            document.body.removeChild(this.overlay);
        }
        
        if (this.onClose) {
            this.onClose();
        }
        
        // Clean up
        this.currentGrid = null;
        this.currentModal = null;
        this.overlay = null;
        this.modalElement = null;
        this.onSave = null;
        this.onClose = null;
        this.cellData = null;
        this.modalData = null;
        this.modalSchema = null;
    }
}

// Create a singleton instance for global use
export const modalHandler = new Modal();

/**
 * Helper function to open a modal
 * @param {string} modalId - The modal ID to reference in the schema
 * @param {Object} schema - The full schema object containing modal definitions
 * @param {Object} cellData - The data from the cell that triggered the modal
 * @param {Object} colDef - The column definition that triggered the modal
 * @param {Function} onSave - Callback when modal data is saved
 * @param {Function} onClose - Callback when modal is closed
 */
export function openModal(modalId, schema, cellData, colDef, onSave, onClose) {
    modalHandler.openModal(modalId, schema, cellData, colDef, onSave, onClose);
}
