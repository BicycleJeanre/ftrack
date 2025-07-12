# filemgmt.md

## Purpose
Defines the File Management page, allowing users to import/export their financial data as JSON and reset to default data.

## Key Elements
- **Import Button**: Opens file picker to import a JSON file.
- **Reset Button**: Resets all data to the default dataset.
- **Script Includes**: Loads file management logic and shared navbar.

## Interactions
- Uses `filemgmt.js` for import/export/reset logic.
- Reads/writes the global state and persists to localStorage.
- Uses `navbar.js` for navigation.

## Diagrams
```mermaid
flowchart TD
  ImportBtn[Import Button] -->|import| filemgmt.js
  ResetBtn[Reset Button] -->|reset| filemgmt.js
  filemgmt.js -->|update| localStorage
```
