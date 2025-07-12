# editable-grid.md

## Purpose
A reusable, configurable grid component that provides inline editing capabilities for tabular data. Supports various input types, conditional editability, custom rendering functions, dynamic action configuration, per-cell event callbacks, and modal display icons.

## Key Features
- **Multiple Input Types**: text, number, select, checkbox, date
- **Conditional Editability**: Fields can be made editable based on other row data
- **Custom Rendering**: Supports custom render functions for displaying complex data
- **Event Handling**: Configurable callbacks for save, delete, update, and per-cell actions
- **Dynamic Actions**: Supports enabling/disabling add, edit, delete, and custom actions per grid instance
- **Per-Cell/Column Callbacks**: Use `onCellClick` in column definition to trigger external code or modals
- **Modal Display Icon**: Use `modalIcon` and `onModalIconClick` in column definition to show an icon and trigger a callback
- **Add Icon Placement**: The add (quick add) button is now an icon centered below the grid, managed by the grid itself

## Configuration
The EditableGrid accepts a configuration object with:
- `targetElement`: The table element to enhance
- `columns`: Array of column definitions with field, header, type, editability rules, and optional `onCellClick`, `modalIcon`, `onModalIconClick`
- `data`: Array of data objects to display
- `onSave`: Callback for save operations
- `onDelete`: Callback for delete operations
- `onUpdate`: Callback for cell-specific actions (e.g., opening modals)
- `actions`: Object to enable/disable actions: `{ add: true, edit: true, delete: true }` (all true by default)

## Column Types
- **text**: Basic text input
- **number**: Numeric input with automatic parsing
- **select**: Dropdown with predefined options
- **checkbox**: Boolean checkbox input
- **date**: Date picker input

## Usage Example
```javascript
const grid = new EditableGrid({
    targetElement: document.getElementById('myTable'),
    columns: [
        { field: 'name', header: 'Name', editable: true, type: 'text' },
        { field: 'active', header: 'Active', editable: true, type: 'checkbox' },
        { field: 'category', header: 'Category', editable: (row) => row.type === 'custom', type: 'select', options: [...] },
        { field: 'modal', header: 'Modal', render: () => 'Open', modalIcon: '<svg>...</svg>', onModalIconClick: ({ idx }) => alert('Modal for row ' + idx) }
    ],
    data: myDataArray,
    onSave: (idx, data) => { /* handle save */ },
    onDelete: (idx) => { /* handle delete */ },
    actions: { add: true, edit: false, delete: true }
});
```

> **Update Note:** The add (quick add) button is now an icon centered below the grid, managed by the grid itself.
