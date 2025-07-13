# Global Keyboard Shortcuts & Configurable Keymap Integration Plan

## Objective
Move all keyboard shortcut definitions to a global JSON config file, loaded by a central config module. All app modules (including EditableGrid) query this config for their keybindings and register listeners accordingly. This enables global, user-editable, and consistent shortcut management.

---

## 1. File & Module Structure

- `assets/shortcuts.json`: Stores all keybindings and their mapped actions/functions.
- `js/config.js`: Central config module to load and provide access to settings (including shortcuts).
- All feature modules (e.g., `editable-grid.js`) query `config.js` for their keybindings.

---

## 2. `assets/shortcuts.json` Example
```json
{
  "EditableGrid": {
    "saveRow": "Enter",
    "deleteRow": "Delete",
    "addRow": "Meta+Shift+A"
  },
  "Global": {
    "openSettings": "Meta+,"
  }
}
```

---

## 3. `js/config.js` Module

- Loads `assets/shortcuts.json` (async fetch or import).
- Exposes a function: `getShortcut(moduleName, actionName)`
- Optionally exposes all config/settings for other uses.

**Example:**
```js
// config.js
let shortcuts = {};
export async function loadConfig() {
  const resp = await fetch('assets/shortcuts.json');
  shortcuts = await resp.json();
}
export function getShortcut(module, action) {
  return (shortcuts[module] && shortcuts[module][action]) || null;
}
```

---

## 4. EditableGrid Integration

- On first grid load, call `await loadConfig()` if not already loaded.
- For each action (saveRow, deleteRow, addRow), call `getShortcut('EditableGrid', 'saveRow')` etc.
- Register keydown listeners for those keybindings only.
- If the keymap changes (e.g., user updates settings), re-register listeners.

**Example:**
```js
import { loadConfig, getShortcut } from './config.js';

await loadConfig();
const saveKey = getShortcut('EditableGrid', 'saveRow');
const deleteKey = getShortcut('EditableGrid', 'deleteRow');
const addKey = getShortcut('EditableGrid', 'addRow');
// Register listeners for these keys
```

---

## 5. Keybinding Registration Utility

- Create a utility function to normalize and compare key events to keybinding strings (e.g., `Meta+Shift+A`).
- Use this utility in all modules to match key events to config-defined shortcuts.

---

## 6. Extensibility & User Customization

- The JSON config can be user-editable (via a settings UI or direct file edit).
- Other modules (e.g., navbar, modals) can define and use their own keymaps in the same config.
- Optionally, add a watcher or reload mechanism to update keybindings at runtime if the config changes.

---

## 7. Implementation Steps

1. Create `assets/shortcuts.json` with initial keymap.
2. Implement `js/config.js` to load and provide shortcut access.
3. Refactor `editable-grid.js` to:
    - Load config on first use
    - Query keybindings for each action
    - Register keydown listeners for those keys
    - Use a utility to match key events
---

> **Update Note:** This plan enables global, user-editable, and consistent keyboard shortcut management across the app, with all keymaps defined in a single JSON config and loaded via a central module.
