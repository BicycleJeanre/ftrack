# EditableGrid Dynamic Schema Implementation Guide

## Objective
Refactor `EditableGrid` to use a dynamic schema for grid and modal definitions, enabling flexible, data-driven UI updates by editing JSON schema files.

---

## Step 1: Update EditableGrid to Support Dynamic Schema

### File
- `js/editable-grid.js`

### Actions
1. **Update Constructor to Accept Schema**
   - Accept a `schema` object in the constructor.
   - Store the schema for use in rendering.

2. **Parse Schema for Columns**
   - Extract the `columns` array from the schema (e.g., `schema.mainGrid.columns`).
   - Use this array to define the grid structure.

3. **Support All Column Types (from accounts-grid.json)**
   - For each column, handle its `type`:
     - **text**: Render a standard text input for editing; display as plain text when not editing.
     - **select**: Render a dropdown/select input for editing; use the `options` array; use `default` value for new rows; display selected value as text.
     - **number**: Render a numeric input for editing; display as a number; validate numeric input.
     - **modal**: Render a button/icon (use `modalIcon` and `modalIconTitle`); attach event to call a generic modal script with `modalId` and cell data; modal handler instantiates another EditableGrid using the modal schema.
   - Respect the `editable` property for each column (editable or read-only).
   - Support custom rendering logic if provided (e.g., a `render` function).
   - Support tooltips or help text if included.

4. **Render Grid Dynamically**
   - Build the grid UI by iterating over schema-defined columns.
   - Render headers, cells, and editors according to the schema and column types above.

5. **Handle Modal Columns Internally**
   - For columns with `type: "modal"`, add a button/icon or clickable cell.
   - Attach an event listener to the cell/button that calls a generic modal script (to be implemented).
   - Pass the referenced modal schema (using `modalId` from the column definition) and cell data to the modal script.
   - The modal handler should instantiate another EditableGrid using the modal schema for editing modal content.

6. **Support Schema-Driven Validation and Defaults**
   - Apply validation rules or default values from the schema when rendering or editing cells.

7. **Refactor Existing Hardcoded Logic**
   - Remove or refactor any hardcoded column definitions, types, or modal logic.
   - Ensure all grid structure and behavior is driven by the schema.

8. **Add Documentation Comments**
   - Document the schema-driven approach in code comments for maintainability.

---

## Example Column Handling Logic
```js
columns.forEach(col => {
  switch (col.type) {
    case 'text':
      // Render text input or display
      break;
    case 'select':
      // Render dropdown with col.options
      break;
    case 'number':
      // Render numeric input
      break;
    case 'modal':
      // Render button/icon, attach event to open modal with col.modalId
      break;
    default:
      // Handle other types or custom render logic
  }
  // Respect col.editable for editability
  // Apply col.default, col.tooltip, etc.
});
```

## Outcome
EditableGrid will be fully data-driven, allowing UI and modal changes by simply updating the schema files, with no code changes required for new fields or options. Modals will be triggered and rendered generically based on schema definitions.

