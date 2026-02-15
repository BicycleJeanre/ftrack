// keyboard-shortcuts.js
// Global keyboard shortcuts for FTrack application
// Leverages Tabulator's built-in navigation plus custom app shortcuts

/**
 * Keyboard Shortcuts Manager
 * Handles application-wide keyboard shortcuts
 */
class KeyboardShortcuts {
    constructor() {
        this.shortcuts = new Map();
        this.enabled = true;
        this.initialize();
    }

    /**
     * Initialize default shortcuts
     */
    initialize() {
        // Register default shortcuts
        this.register('ctrl+n', 'Add New Row', () => {
            const event = new CustomEvent('shortcut:addRow');
            document.dispatchEvent(event);
        });

        this.register('delete', 'Delete Selected Rows', () => {
            const event = new CustomEvent('shortcut:deleteRow');
            document.dispatchEvent(event);
        });

        this.register('ctrl+s', 'Save Changes', (e) => {
            e.preventDefault();
            const event = new CustomEvent('shortcut:save');
            document.dispatchEvent(event);
        });

        this.register('ctrl+g', 'Generate Projections', () => {
            const event = new CustomEvent('shortcut:generateProjections');
            document.dispatchEvent(event);
        });

        this.register('ctrl+1', 'Focus Scenarios', () => {
            this.focusSection('scenarios');
        });

        this.register('ctrl+2', 'Focus Accounts', () => {
            this.focusSection('accounts');
        });

        this.register('ctrl+3', 'Focus Transactions', () => {
            this.focusSection('transactions');
        });

        this.register('ctrl+4', 'Focus Projections', () => {
            this.focusSection('projections');
        });

        this.register('?', 'Show Shortcuts Help', () => {
            this.showHelp();
        });

        // Listen for keyboard events
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    /**
     * Register a keyboard shortcut
     * @param {string} key - Key combination (e.g., 'ctrl+s', 'delete')
     * @param {string} description - What the shortcut does
     * @param {Function} handler - Callback function
     */
    register(key, description, handler) {
        const normalizedKey = this.normalizeKey(key);
        this.shortcuts.set(normalizedKey, { description, handler });
    }

    /**
     * Normalize key combination for consistent lookup
     * @param {string} key - Raw key string
     * @returns {string} - Normalized key
     */
    normalizeKey(key) {
        return key.toLowerCase()
            .replace('command', 'ctrl')
            .replace('meta', 'ctrl')
            .replace('cmd', 'ctrl');
    }

    /**
     * Handle keyboard event
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleKeyDown(e) {
        if (!this.enabled) return;

        // Don't trigger shortcuts when typing in inputs
        const activeElement = document.activeElement;
        const isInput = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.tagName === 'SELECT' ||
            activeElement.isContentEditable
        );

        // Allow certain shortcuts even in inputs
        const alwaysAllowedKeys = ['ctrl+s', 'ctrl+g', '?'];
        const keyCombo = this.getKeyCombo(e);
        
        if (isInput && !alwaysAllowedKeys.includes(keyCombo)) {
            return;
        }

        const shortcut = this.shortcuts.get(keyCombo);
        if (shortcut) {
            shortcut.handler(e);
        }
    }

    /**
     * Get key combination from event
     * @param {KeyboardEvent} e - Keyboard event
     * @returns {string} - Key combination
     */
    getKeyCombo(e) {
        const parts = [];
        
        if (e.ctrlKey || e.metaKey) parts.push('ctrl');
        if (e.altKey) parts.push('alt');
        if (e.shiftKey) parts.push('shift');
        
        const key = e.key.toLowerCase();
        if (key !== 'control' && key !== 'alt' && key !== 'shift' && key !== 'meta') {
            parts.push(key);
        }

        return parts.join('+');
    }

    /**
     * Focus a specific section
     * @param {string} section - Section ID
     */
    focusSection(section) {
        const sectionMap = {
            'scenarios': 'scenariosTable',
            'accounts': 'accountsTable',
            'transactions': 'transactionsTable',
            'projections': 'projectionsTable'
        };

        const elementId = sectionMap[section];
        if (elementId) {
            const element = document.getElementById(elementId);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Try to focus the grid
                const firstCell = element.querySelector('.tabulator-cell');
                if (firstCell) {
                    firstCell.focus();
                }
            }
        }
    }

    /**
     * Show keyboard shortcuts help modal
     */
    showHelp() {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal-content modal-shortcuts';

        let shortcutsHtml = `
            <h2 class="shortcuts-title">
                ⌨️ Keyboard Shortcuts
            </h2>
            
            <div class="shortcuts-section">
                <h3 class="shortcuts-heading">Grid Navigation (Tabulator Built-in)</h3>
                <table class="shortcuts-table">
                    ${this.createShortcutRow('Arrow Keys', 'Navigate between cells')}
                    ${this.createShortcutRow('Tab', 'Move to next cell')}
                    ${this.createShortcutRow('Shift+Tab', 'Move to previous cell')}
                    ${this.createShortcutRow('Enter', 'Edit cell / Save and move down')}
                    ${this.createShortcutRow('Esc', 'Cancel cell edit')}
                    ${this.createShortcutRow('Page Up/Down', 'Scroll grid by page')}
                    ${this.createShortcutRow('Home/End', 'Jump to first/last row')}
                </table>
            </div>

            <div class="shortcuts-section">
                <h3 class="shortcuts-heading">Application Shortcuts</h3>
                <table class="shortcuts-table">
        `;

        // Add registered shortcuts
        this.shortcuts.forEach((shortcut, key) => {
            const displayKey = this.formatKeyForDisplay(key);
            shortcutsHtml += this.createShortcutRow(displayKey, shortcut.description);
        });

        shortcutsHtml += `
                </table>
            </div>

            <div class="shortcuts-footer">
                <button id="close-shortcuts-help" class="shortcuts-close">
                    Close
                </button>
            </div>
        `;

        modal.innerHTML = shortcutsHtml;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Close handlers
        const closeBtn = modal.querySelector('#close-shortcuts-help');
        closeBtn.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
            }
        });
    }

    /**
     * Create a shortcut table row
     * @param {string} key - Key combination
     * @param {string} description - Description
     * @returns {string} - HTML string
     */
    createShortcutRow(key, description) {
        return `
            <tr class="shortcuts-row">
                <td class="shortcuts-key">
                    ${key}
                </td>
                <td class="shortcuts-desc">
                    ${description}
                </td>
            </tr>
        `;
    }

    /**
     * Format key combination for display
     * @param {string} key - Normalized key
     * @returns {string} - Formatted key
     */
    formatKeyForDisplay(key) {
        return key
            .replace('ctrl', '⌘/Ctrl')
            .replace('alt', 'Alt')
            .replace('shift', 'Shift')
            .replace('+', ' + ')
            .toUpperCase();
    }

    /**
     * Enable shortcuts
     */
    enable() {
        this.enabled = true;
    }

    /**
     * Disable shortcuts (e.g., when modal is open)
     */
    disable() {
        this.enabled = false;
    }
}

// Create global instance
const keyboardShortcuts = new KeyboardShortcuts();

// Export for use in other modules
export default keyboardShortcuts;
export { KeyboardShortcuts };
