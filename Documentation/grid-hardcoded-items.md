# Hardcoded Items in EditableGrid Implementation

Below are the items in the editable grid that are currently hardcoded and not defined from the incoming schema:

- **Icons (SVGs):** Edit, delete, save, cancel, and interest icons are hardcoded in the JS file.
- **Column Rendering Logic:** Input, select, checkbox, and modal button rendering is hardcoded, not schema-driven beyond type.
- **Row Double-Click Behavior:** Editing and modal opening logic is hardcoded.
- **Add New Row Button:** Text and placement are hardcoded.
- **Spinner SVG:** Used for saving/deleting, hardcoded.
- **Keyboard Shortcut Logic:** Hardcoded, though shortcut keys are loaded from config.
- **Cancel Button:** Always rendered, regardless of schema.
- **Row Data Extraction/Update:** Logic for extracting row data and updating internal data is hardcoded, not schema-driven.

---

> Review these items for future schema-driven improvements.
