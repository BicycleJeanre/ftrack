# editable-grid.md

## Purpose
A reusable, configurable grid component that provides inline editing capabilities for tabular data. Supports various input types, conditional editability, custom rendering functions, and dynamic action configuration.

## Key Features
- **Multiple Input Types**: text, number, select, checkbox, date
- **Conditional Editability**: Fields can be made editable based on other row data
- **Custom Rendering**: Supports custom render functions for displaying complex data
- **Event Handling**: Configurable callbacks for save, delete, and update operations
- **Dynamic Actions**: Supports enabling/disabling add, edit, delete, and custom actions per grid instance

## Configuration
The EditableGrid accepts a configuration object with:
- `targetElement`: The table element to enhance
- `columns`: Array of column definitions with field, header, type, and editability rules
- `data`: Array of data objects to display
- `onSave`: Callback for save operations
- `onDelete`: Callback for delete operations
- `onUpdate`: Callback for cell-specific actions (e.g., opening modals)
- `quickAddButton`: Optional button element for adding new rows
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
        { field: 'category', header: 'Category', editable: (row) => row.type === 'custom', type: 'select', options: [...] }
    ],
    data: myDataArray,
    onSave: (idx, data) => { /* handle save */ },
    onDelete: (idx) => { /* handle delete */ },
    actions: { add: true, edit: false, delete: true }
});
```

> **Update Note:** Added `actions` config for dynamic enabling/disabling of add, edit, and delete actions per grid instance.
