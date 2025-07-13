# EditableGrid Internal onDelete Refactor Plan

## Part 1: Changes to `editable-grid.js`

### Goals
- Implement an internal `deleteRow(idx, row)` method, similar to `saveRow`, handling UI feedback, data update, and callbacks.
- Ensure all row operations (add, save, delete, update) follow a consistent async/callback pattern.
- Split out the save logic from `saveRow` for clarity and reuse.
- Provide clear UI feedback (spinner, disabling, etc.) during delete.
- Call consumer's `onDelete` and `onAfterDelete` hooks, mirroring the save flow.

### Steps
1. **Add `deleteRow(idx, row)` method**
    - Accepts row index and row element.
    - Shows a spinner or disables the row during delete.
    - Calls internal data removal logic.
    - Calls consumer's `onDelete(idx, row, grid)` and awaits if async.
    - Calls consumer's `onAfterDelete(idx, row, grid)` if defined.
    - Removes the row from the DOM and re-renders the grid.
2. **Update `handleTableClick`**
    - On delete button click, call `this.deleteRow(idx, row)` instead of directly calling consumer's `onDelete`.
3. **Split out save logic**
    - Move the data extraction and update logic from `saveRow` into a separate method (e.g., `extractRowData(row)` and `applyRowData(idx, data)`).
    - `saveRow` becomes a wrapper that uses these helpers.
4. **Ensure consistency**
    - All row operations (add, save, delete, update) should:
        - Show UI feedback (spinner, disabling, etc.)
        - Update internal data array
        - Call consumer hooks (`onSave`, `onDelete`, etc.)
        - Await async hooks
        - Call `onAfter*` hooks
        - Re-render grid after operation
5. **Document new hooks**
    - Document this change in the appropriate md file in the Documentation folder.

---

## Part 2: Changes to `accounts.js`

### Goals
- Update to use the new internal `deleteRow` flow from EditableGrid.
- Move all account deletion logic into the `onDelete` callback, which now only handles data and persistence, not UI.
- Optionally implement `onAfterDelete` for any post-delete UI or data sync.

### Steps
1. **Update EditableGrid instantiation**
    - Pass `onDelete: (idx, row, grid) => { ... }` instead of just `onDelete: deleteAccount`.
    - In the callback, remove the account from the data array, call `window.afterDataChange()`, and any other persistence logic.
    - Do not handle UI refresh here; let EditableGrid handle re-rendering.
2. **Remove manual grid refresh from delete logic**
    - All UI updates after delete are now handled by EditableGrid's internal flow.
3. **Optionally implement `onAfterDelete`**
    - If needed, provide a callback for any post-delete actions (e.g., updating related dropdowns).

---

> **Update Note:** This plan ensures all row operations in EditableGrid are consistent, modular, and provide clear UI feedback, with a clean separation between UI and data/persistence logic.
