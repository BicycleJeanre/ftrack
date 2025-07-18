# Dynamic Editable Grid Refactor Plan (EditableGrid Focus)

## 1. Update EditableGrid to Support Dynamic Schema
- **File:** `js/editable-grid.js`
- **Action:** Refactor the EditableGrid constructor to accept a schema object and build the grid columns and modals dynamically from it.
- **Prompt:** "Refactor EditableGrid to accept a schema object, parse columns, types, options, and modal references, and render the grid accordingly."

## 2. Implement Modal Handling via Generic Modal File
- **File:** `js/modal-generic.js` (new file)
- **Action:** Create a generic modal handler that receives a modal schema and data, then instantiates another EditableGrid for modal content.
- **Prompt:** "Create a generic modal handler that receives a modal schema and data, and instantiates an EditableGrid for the modal grid."

## 3. Refactor Main Grid to Use Schema and Generic Modal
- **File:** `js/accounts.js` (and other grid entry points)
- **Action:** Load the grid schema, pass it to EditableGrid, and ensure modal columns reference the generic modal handler with the correct modal schema.
- **Prompt:** "Load the grid schema, pass it to EditableGrid, and ensure modal columns reference the generic modal handler with the correct modal schema."

## 4. Test and Validate
- **Files:** All affected files
- **Action:** Change a field or option in the grid schema JSON and verify the main grid and modal grids update automatically without code changes.
- **Prompt:** "Change a field or option in the grid schema JSON and verify the main grid and modal grids update automatically without code changes."

## 5. Documentation
- **File:** `Documentation/dynamic-editable-grid-plan.md`
- **Action:** Document the schema format, EditableGrid usage, and modal integration so future changes can be made by editing the JSON file only.
- **Prompt:** "Document the schema format, EditableGrid usage, and modal integration so future changes can be made by editing the JSON file only."

---

## Notes
- EditableGrid should be fully data-driven and flexible for future updates.
- Modals are handled generically, using their own schema and EditableGrid instance.
- This plan is suitable for AI or developer execution, with explicit prompts and file targets for each step.
