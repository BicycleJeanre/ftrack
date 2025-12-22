# FTrack - Financial Tracking Application
## Comprehensive Technical Documentation

**Version:** 1.0.0  
**Platform:** Electron Desktop Application  
**Last Updated:** December 22, 2025

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Design Standards](#design-standards)
3. [Coding Standards](#coding-standards)
4. [Library & Framework Usage](#library--framework-usage)
5. [Asset Structure & Data Models](#asset-structure--data-models)
6. [Module Documentation](#module-documentation)
7. [Component Catalog](#component-catalog)
8. [Development Guidelines](#development-guidelines)

---

## Architecture Overview

### Application Type
FTrack is an **Electron-based desktop application** for financial account and transaction management. It uses a modular architecture with:

- **Main Process**: Electron main process ([main.js](../main.js))
- **Renderer Process**: Standard web technologies (HTML, CSS, JavaScript ES6 modules)
- **Data Storage**: JSON file-based persistence in `/assets` directory
- **Security**: Node.js integration enabled, context isolation disabled for direct filesystem access

### Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Runtime** | Electron | 37.2.1 |
| **Language** | JavaScript (ES6 Modules) | ES2015+ |
| **Styling** | CSS3 (Custom design system) | - |
| **Icons** | SVG (inline) | - |
| **Data Format** | JSON | - |

### File Structure

```
ftrack/
├── main.js                 # Electron main process entry point
├── preload.js              # Preload script (minimal, reserved for future)
├── package.json            # Project configuration
├── pages/                  # HTML page templates
│   ├── home.html          # Dashboard/overview page
│   ├── accounts.html      # Account management page
│   └── transactions.html  # Transaction management page
├── js/                    # JavaScript modules
│   ├── global-app.js      # Global helper functions
│   ├── navbar.js          # Navigation bar component
│   ├── accounts.js        # Account page controller
│   ├── transactions.js    # Transaction page controller
│   ├── editable-grid.js   # Core grid component (class-based)
│   ├── modal.js           # Modal dialog component
│   └── config.js          # Keyboard shortcuts configuration
├── styles/                # CSS styling
│   ├── app.css            # Main application styles
│   └── icons.js           # SVG icon definitions
└── assets/                # Data and configuration files
    ├── app-data.json              # Application data (accounts, transactions)
    ├── accounts-grid.json         # Accounts grid schema
    ├── transactions-grid.json     # Transactions grid schema
    └── shortcuts.json             # Keyboard shortcut definitions
```

### Page Architecture

Each page follows a consistent pattern:

1. **HTML Template**: Minimal structure with navbar injection point and content container
2. **JavaScript Module**: Loads required dependencies, builds UI, handles data operations
3. **Schema-Driven Rendering**: Grid configurations loaded from JSON schemas
4. **Event-Driven Updates**: User actions trigger data mutations and re-renders

---

## Design Standards

### Visual Design System

#### Color Palette

The application uses a **dark theme** with high-contrast accent colors:

| Token | Hex Code | Usage |
|-------|----------|-------|
| `bg-main` | `#181a1b` - `#232a23` (gradient) | Primary background |
| `text-main` | `#ededed` | Primary text color |
| `accent-primary` | `#b6ff00` | Interactive elements, highlights |
| `surface-secondary` | `#232a23` | Secondary backgrounds, borders |
| `surface-hover` | `#202223` | Hover states for table headers |
| `border-default` | `#232a23` | Default border color |

#### Typography

- **Font Family**: `'Inter', 'Segoe UI', Arial, sans-serif`
- **Base Font Size**: 18px (1rem)
- **Headings**: 
  - H2: 1.22em (headers), 1.18em (modals)
  - Bold weight (700) for table headers
  - Font weight 600 for modal headers
- **Body Text**: 1.08em for inputs, table cells
- **Navigation**: 1.04em with 500 font weight

#### Spacing & Layout

- **Padding**:
  - Table cells: 6px vertical, 8px horizontal
  - Inputs: 12px vertical, 14px horizontal
  - Accordion content: 18-20px
  - Modal content: 4vw top/bottom, 2vw left/right
- **Border Radius**:
  - Default: 12px (`.rounded`)
  - Inputs: 6px
  - Buttons: 8px
  - Tags: 16px
  - Modal close button: 50% (circular)
- **Shadows**:
  - Large: `0 8px 40px rgba(0,0,0,0.18)`
  - Medium: `0 4px 16px rgba(0,0,0,0.12)`
  - Input focus: `0 2px 0 0 #b6ff00`

#### Interactive Elements

**Buttons**:
- Size: 44x44px (minimum touch target)
- SVG icons: 28x28px
- Hover state: background `#232a23`, color `#b6ff00`
- Transition: 180ms ease

**Input Fields**:
- Background: Transparent (default), `#181a1b` (focus)
- Border: None (default), bottom border 2.5px `#b6ff00` (focus)
- Focus shadow: `0 2px 0 0 #b6ff00`

**Select Dropdowns**:
- Appearance: Custom (native appearance removed)
- Background: `#181a1b`
- Same focus styles as text inputs

**Checkboxes**:
- Size: 22x22px
- Accent color: `#b6ff00`
- Custom appearance with checkmark (✓) on checked state

#### Component Patterns

**Accordion Panels**:
```html
<div class="accordion-header bg-main bordered rounded shadow-lg pointer flex-between">
  <h2>Section Title</h2>
  <span class="accordion-arrow">&#9662;</span>
</div>
<div class="accordion-content bg-main rounded shadow-md">
  <!-- Content -->
</div>
```

**Navigation Bar**:
- Horizontal layout with equal-width links (min 110px)
- Bottom border indicator for active page (3px height, `#b6ff00`)
- 18px horizontal margin between links

**Tables**:
- Full width with collapsed borders
- Alternating row hover state (`#232a23`)
- Header background: `#202223`
- Border: 2px bottom border for headers

**Modals**:
- Overlay: `rgba(10, 12, 16, 0.82)` with 8px blur
- Content: max 80vw width, 80vh height
- Centered vertically and horizontally
- Close button in top-right corner

**Tags**:
- Pill-shaped containers (16px border radius)
- Background: `#232a23`, border: 1px `#b6ff00`
- Remove button (×) with hover effect
- Input field inline with tags

---

## Coding Standards

### JavaScript Standards

#### Module System
- **Type**: ES6 Modules (`type="module"` in HTML)
- **Import/Export**: Named exports preferred
```javascript
export class EditableGrid { ... }
export function loadGlobals() { ... }
```

#### Code Organization

1. **Class-Based Components**:
   - Constructor initializes state and options
   - Methods are instance methods (not arrow functions for `this` binding)
   - Example: `EditableGrid`, `Modal`

2. **Function-Based Utilities**:
   - Pure functions for helpers
   - Example: `global-app.js`, `config.js`

3. **IIFE for Self-Executing Scripts**:
   - Used in `navbar.js` for immediate execution
   ```javascript
   (function() {
     // navbar initialization
   })();
   ```

#### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| **Classes** | PascalCase | `EditableGrid`, `Modal` |
| **Functions** | camelCase | `loadGlobals()`, `buildGridContainer()` |
| **Variables** | camelCase | `workingData`, `tableElement` |
| **Constants** | UPPER_SNAKE_CASE | `ICON_EDIT`, `ICON_DELETE` |
| **Private State** | Underscore prefix | `_shortcutsLoaded`, `_tagFocus` |
| **HTML IDs** | kebab-case | `main-navbar`, `panel-accounts` |
| **CSS Classes** | kebab-case | `bg-main`, `accordion-header` |

#### Async/Await Pattern
Always use `async/await` for asynchronous operations:
```javascript
async function onSave(updatedAccounts) {
    const fs = window.require('fs').promises;
    try {
        const dataFile = await fs.readFile(dataPath, 'utf8');
        // ... process data
        await fs.writeFile(dataPath, JSON.stringify(appData, null, 2), 'utf8');
    } catch (err) {
        console.error('Error:', err);
    }
}
```

#### Error Handling
- Use try-catch blocks for all async operations
- Log errors with descriptive context: `console.error('Failed to save accounts data:', err)`
- Provide fallback behavior when possible

#### Data Manipulation

1. **Immutability Patterns**:
   ```javascript
   // Create working copy
   this.workingData = [...this.data];
   
   // Deep clone for schema
   const modalSchema = JSON.parse(JSON.stringify(this.schema[col.modal]));
   ```

2. **Array Operations**:
   - Use `forEach`, `map`, `find`, `filter` for iteration
   - Use `reduce` for aggregation
   - Example: `nextId = appData.accounts.reduce((max, a) => a.id > max ? a.id : max, 0) + 1`

3. **Object Spread**:
   ```javascript
   const newRow = {
       id: nextId,
       name: acct.name,
       ...defaultFields
   };
   ```

#### DOM Manipulation

**Global Helper Functions** (from `global-app.js`):
```javascript
window.getEl = (id) => document.getElementById(id);
window.add = (parent, child) => parent.appendChild(child);
window.toggleAccordion = (id) => { /* toggle display */ };
```

**Standard Pattern**:
```javascript
const element = document.createElement('div');
element.className = 'bg-main bordered rounded';
element.innerHTML = '<h2>Title</h2>';
element.addEventListener('click', () => { /* handler */ });
window.add(parentElement, element);
```

#### Event Listeners

- Use arrow functions for inline handlers to preserve context
- Use named functions for complex handlers
- Remove listeners when appropriate (component cleanup)

```javascript
// Inline handler
button.addEventListener('click', () => {
    this.handleSave(event.target.closest('tr'));
});

// Named handler
function onKeyDown(e) {
    if (e.key === 'Enter') { /* ... */ }
}
input.addEventListener('keydown', onKeyDown);
```

#### Console Logging

**Debug Logging**:
```javascript
console.log('[EditableGrid] createTableRows workingData:', this.workingData);
console.warn('[EditableGrid] WARNING: Field not found', acc);
```

**Prefix Pattern**: Use `[ClassName/ModuleName]` prefix for debug messages

---

## Library & Framework Usage

### Core Dependencies

#### Electron
**Version**: 37.2.1 (dev dependency)

**Configuration** ([main.js](../main.js)):
```javascript
const { app, BrowserWindow } = require('electron');

webPreferences: {
  nodeIntegration: true,      // Enable Node.js APIs in renderer
  contextIsolation: false     // Disable isolation for window.require
}
```

**Usage**:
- Renderer process uses `window.require('fs')` for file system access
- `process.cwd()` for current working directory paths
- No IPC communication (direct Node.js access)

#### Node.js Built-in Modules

**File System (fs.promises)**:
```javascript
const fs = window.require('fs').promises;
await fs.readFile(path, 'utf8');
await fs.writeFile(path, content, 'utf8');
```

**Used for**:
- Loading JSON schemas (`accounts-grid.json`, `transactions-grid.json`)
- Reading application data (`app-data.json`)
- Persisting changes to disk

### Icon System

**Location**: [styles/icons.js](../styles/icons.js)

**Implementation**: SVG strings exported as constants

**Available Icons**:
- `ICON_EDIT`: Pencil/edit icon
- `ICON_DELETE`: Trash can icon
- `ICON_SAVE`: Floppy disk icon
- `ICON_CANCEL`: X/close icon
- `ICON_INTEREST`: Dollar sign icon
- `ICON_ADD`: Plus icon
- `ICON_SPINNER`: Loading spinner with animation

**Usage Pattern**:
```javascript
import { ICON_SAVE, ICON_DELETE } from '../styles/icons.js';

const ICONS = {
    save: ICON_SAVE,
    delete: ICON_DELETE
};

button.innerHTML = ICONS['save'];
```

**Icon Styling**:
- Size: 28x28px (inside 44x44px button)
- Color: Inherits from parent (`currentColor`)
- Stroke width: 2px
- Stroke linecap/linejoin: round

### No External UI Libraries

**Important**: This application does NOT use:
- React, Vue, Angular, or any framework
- Bootstrap, Tailwind, or CSS frameworks
- jQuery or utility libraries
- Chart libraries (no data visualization in completed features)

**Design Philosophy**: Vanilla JavaScript with custom components for full control and minimal dependencies.

---

## Asset Structure & Data Models

### Overview

All application data and configuration is stored in the `/assets` directory as JSON files. The system uses a **schema-driven architecture** where grid configurations and data models are separated.

### Asset Files

#### 1. app-data.json

**Purpose**: Central data store for all application entities

**Structure**:
```json
{
  "profile": "string",
  "accounts": [],
  "transactions": [],
  "budgetDefinitions": [],
  "budgetForecasts": []
}
```

**Accounts Array**:
```json
{
  "id": number,                    // Unique identifier
  "name": string,                  // Account name
  "type": {                        // Account classification
    "id": number,
    "name": string                 // Asset|Liability|Equity|Income|Expense
  },
  "currency": {
    "id": number,
    "name": string                 // ZAR|USD|EUR|GBP|JPY|AUD|CAD
  },
  "balance": number,               // Starting balance
  "current_balance": number,       // Computed current balance
  "interest": object | null,       // Interest configuration (nested object)
  "openDate": string               // ISO date format (YYYY-MM-DD)
}
```

**Interest Object Structure**:
```json
{
  "id": number,
  "presetOption": string,          // Custom|NACM|NACQ|NACA|NACW|NACD
  "nominalRate": number,           // Percentage
  "effectiveRate": number,         // Percentage (EAR)
  "nominalRatePeriod": string,     // Annually|Monthly|Quarterly|Weekly|Daily
  "calculationMethod": string,     // Compound|Simple
  "compoundingInterval": string    // Monthly|Quarterly|Annually|Weekly|Daily
}
```

**Transactions Array**:
```json
{
  "id": number,
  "debit_account": {               // Account to debit
    "id": number,
    "name": string
  },
  "credit_account": {              // Account to credit
    "id": number,
    "name": string
  },
  "amount": number,
  "isRecurring": boolean,
  "recurrence": [],                // Array of recurrence configurations
  "amountChange": [],              // Array of amount change rules
  "tags": []                       // Array of string tags
}
```

**Recurrence Object**:
```json
{
  "id": number,
  "active": boolean,               // Exclusive boolean (only one can be active)
  "version": number,
  "tags": [],
  "frequency": {
    "id": number,
    "name": string                 // Daily|Monthly|Weekly|Yearly
  },
  "endDate": string,               // ISO date
  "dayOfMonth": number
}
```

**Amount Change Object**:
```json
{
  "id": number,
  "active": boolean,
  "version": number,
  "tags": [],
  "changeType": {
    "id": number,
    "name": string                 // percentage|fixed
  },
  "changeValue": number,
  "changeFrequency": {
    "id": number,
    "name": string
  },
  "startDate": string,
  "endDate": string,
  "notes": string
}
```

#### 2. accounts-grid.json

**Purpose**: Schema definition for accounts grid rendering and behavior

**Structure**:
```json
{
  "mainGrid": {
    "actions": {
      "add": boolean,
      "edit": boolean,
      "delete": boolean,
      "save": boolean
    },
    "columns": []                  // Column definitions
  },
  "accountType": [],               // Lookup list
  "currencies": [],                // Lookup list
  "interestPresetOptions": [],     // Lookup list
  "interestNominalRatePeriods": [],
  "interestCalculationMethods": [],
  "interestCompoundingIntervals": [],
  "interestModal": {               // Modal schema
    "title": string,
    "dataField": string,
    "actions": {},
    "columns": [],
    "fieldDefaults": {},
    "formulas": {},
    "constants": {}
  }
}
```

**Column Definition Schema**:
```json
{
  "field": string,                 // Data property name
  "header": string,                // Display label
  "editable": boolean,
  "type": string,                  // text|number|select|modal|tags|checkbox|exclusive|date|addSelect
  "display": boolean,              // Show/hide column
  "default": any,                  // Default value for new rows
  "optionsSource": string,         // Reference to lookup list
  "optionsSourceFile": string,     // External data file reference
  "modal": string,                 // Modal schema key
  "modalIcon": string,             // Icon key
  "modalIconTitle": string         // Tooltip text
}
```

**Column Types**:

| Type | Description | Render Output | Edit Behavior |
|------|-------------|---------------|---------------|
| `text` | Text input | `<input type="text">` | Inline editing |
| `number` | Numeric input | `<input type="number">` | Inline editing |
| `select` | Dropdown select | `<select><option>...` | Choose from options |
| `addSelect` | Quick-add dropdown | `<input list="datalist">` | Type or select, adds new items |
| `modal` | Modal popup trigger | Icon button | Opens modal editor |
| `tags` | Tag collection | Tag pills with input | Add/remove inline |
| `checkbox` | Boolean toggle | Checkbox input | Click to toggle |
| `exclusive` | Exclusive boolean | Checkbox input | Only one can be true |
| `date` | Date picker | `<input type="date">` | Native date picker |

#### 3. transactions-grid.json

**Purpose**: Schema for transactions grid with nested modal configurations

**Unique Features**:
- `optionsSourceFile`: Loads options dynamically from `app-data.json`
- Nested modals: `recurrenceModal`, `amountChangeModal`
- Quick-add accounts: `addSelect` type creates accounts on-the-fly

**Dynamic Options Loading**:
```javascript
// In transactions.js
gridData.schema.mainGrid.columns.forEach(col => {
    if (col.optionsSourceFile === 'app-data.json' && initialData[col.optionsSource]) {
        gridData.schema[col.optionsSource] = initialData[col.optionsSource]
            .map(opt => ({ id: opt.id, name: opt.name }));
    }
});
```

#### 4. shortcuts.json

**Purpose**: Keyboard shortcut configuration

**Structure**:
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

**Shortcut Format**: `Modifier+Key` (e.g., `Meta+Shift+A`)
- Modifiers: `Meta`, `Shift`, `Alt`, `Control`/`Ctrl`
- Keys: Standard key names

### Data Flow Patterns

#### Read Pattern
1. Page loads → JavaScript module initializes
2. Read schema from `/assets/[entity]-grid.json`
3. Read data from `/assets/app-data.json`
4. Combine schema + data → Initialize `EditableGrid`
5. Render grid

#### Write Pattern
1. User edits row → EditableGrid captures changes
2. User clicks Save → `handleSave()` extracts values
3. Update `workingData` array
4. Call `onSave(updatedData)` callback
5. Page controller receives updated data
6. Read entire `app-data.json` file
7. Update relevant array (e.g., `accounts`, `transactions`)
8. Write complete `app-data.json` back to disk

#### Quick-Add Account Pattern (Transactions)
1. User types new account name in `addSelect` input
2. On save, detect `{ id: null, name: "NewAccount" }`
3. Load `accounts-grid.json` schema for defaults
4. Generate new account ID (max ID + 1)
5. Create account with schema defaults
6. Add to `accounts` array
7. Update transaction with new account ID
8. Save both `accounts` and `transactions`

### Schema Extension Points

**Adding New Field Types**:
1. Add case to `switch(col.type)` in `editable-grid.js` → `createTableRows()`
2. Add case to `handleSave()` for value extraction
3. Add CSS styling in `app.css`

**Adding New Lookup Lists**:
1. Add array to schema JSON (e.g., `accounts-grid.json`)
2. Reference in column: `"optionsSource": "myNewList"`
3. EditableGrid automatically populates options

**Adding New Modals**:
1. Define modal schema in parent grid JSON
2. Add column with `"type": "modal"`, `"modal": "schemaKey"`
3. EditableGrid handles rendering and callbacks

---

## Module Documentation

### 1. global-app.js

**Purpose**: Provides global helper functions for DOM manipulation

**Exports**:
- `loadGlobals()`: Attaches helper functions to `window` object

**Global Functions Added**:
```javascript
window.getEl(id)              // Get element by ID
window.add(parent, child)     // Append child to parent
window.toggleAccordion(id)    // Toggle element display
```

**Usage**: Call `loadGlobals()` at the start of each page module

### 2. navbar.js

**Purpose**: Self-executing script that injects navigation bar

**Behavior**:
- Runs immediately via IIFE on `DOMContentLoaded`
- Injects navbar HTML into `#main-navbar` div
- Highlights active page based on URL
- Applies CSS classes: `bordered`, `rounded`, `centered`, `active`

**Navigation Structure**:
```javascript
const navLinks = `
  <a href="home.html" id="nav-home">Home</a>
  <a href="accounts.html" id="nav-accounts">Accounts</a>
  <a href="transactions.html" id="nav-transactions">Transactions</a>
  <a href="budget.html" id="nav-budget">Budget Builder</a>
`;
```

**Active Highlighting**: Adds `active` class to current page link (adds bottom border)

### 3. editable-grid.js

**Purpose**: Core reusable grid component for displaying and editing tabular data

**Class**: `EditableGrid`

**Constructor Options**:
```javascript
{
  targetElement: HTMLElement,      // Container for grid
  tableHeader: string,             // Grid title
  schema: object,                  // Grid configuration
  data: array,                     // Data rows
  onSave: function,                // Save callback
  onDelete: function,              // Delete callback (optional)
  parentRowId: number,             // For nested grids (optional)
  parentField: string              // For nested grids (optional)
}
```

**Key Properties**:
- `workingData`: Copy of data for manipulation
- `selectOptions`: Cached dropdown options
- `modals`: Prepared modal configurations
- `showActions`: Boolean, calculated from schema actions

**Public Methods**:

#### `render()`
Renders complete grid with headers, rows, and action buttons

**Process**:
1. Clear target element
2. Create `<table>` element
3. Call `createHeader()` → append `<thead>`
4. Call `createTableRows()` → append `<tbody>`
5. Append table to target
6. Add "Add Row" button if enabled

#### `createHeader()`
Returns `<thead>` element with column headers

**Logic**:
- Iterate `schema.mainGrid.columns`
- Create `<th>` for each column where `display === true`
- Add "Actions" column if actions enabled

#### `createTableRows()`
Returns `<tbody>` element with data rows

**Complex Logic**:
- For each row in `workingData`:
  - For each column in schema:
    - Render cell based on `col.type`
    - Apply `display` property
    - If `editable`, render input element
    - If not `editable`, render text content
- Add action buttons (Save, Delete) if enabled

**Cell Rendering by Type**:

| Type | Render Logic |
|------|--------------|
| `text` | `<input type="text" value="...">` |
| `number` | `<input type="number" value="...">` |
| `select` | `<select>` with `<option>` elements from `selectOptions` |
| `addSelect` | `<input list="datalist-id">` + `<datalist>` with options |
| `modal` | Icon button → opens `Modal` component |
| `tags` | Tag pills + input, inline add/remove |
| `checkbox` | Custom styled checkbox |
| `exclusive` | Checkbox with exclusivity logic (uncheck others on check) |
| `date` | `<input type="date">` with auto-default to today |

#### `handleSave(row, rowId, field)`
Extracts values from row inputs and persists changes

**Process**:
1. Get row DOM element
2. For each column, extract value based on type
3. Apply defaults if value is empty/null
4. Find row in `workingData` by ID
5. Update `workingData` and source `data` array
6. Call `onSave(data, rowId, field)` callback

**Special Handling**:
- `addSelect`: Creates new option object if text not found
- `tags`: Extracts text from tag spans
- `checkbox`/`exclusive`: Gets boolean checked state

#### `handleAdd()`
Adds new row with default values

**Process**:
1. Create new row object
2. For each column, apply `default` value
3. Generate new ID (max ID + 1)
4. Push to `workingData`
5. Call `render()` to update UI

#### `handleDelete(row)`
Removes row from data and re-renders

**Process**:
1. Get row index
2. Remove from `workingData` using `splice`
3. Update source `data` array
4. Call `onSave(data)` if defined
5. Call `render()`

#### `onModalSave(rowId, field, updatedModalData)`
Callback for when nested modal data is saved

**Process**:
1. Find parent row by `rowId`
2. Update `field` property with new data
3. Call `onSave(workingData, rowId, field)`

**Usage**: Called by `Modal` component's grid instance

#### `prepareModals()`
Pre-processes modal schemas from main schema

**Logic**:
- Find columns with `type === 'modal'`
- Deep clone modal schema
- Attach options arrays for modal columns
- Create default data object
- Store in `this.modals[field]`

#### `prepareSelectOptions()`
Caches all select dropdown options

**Logic**:
- Iterate main grid columns
- Find columns with `type === 'select'` or `'addSelect'`
- Store referenced options array in `this.selectOptions[field]`
- Also process modal/sub-grid columns

### 4. modal.js

**Purpose**: Reusable modal dialog component that wraps `EditableGrid`

**Class**: `Modal`

**Constructor Options**:
```javascript
{
  targetElement: HTMLElement,      // Where to append modal (default: document.body)
  tableHeader: string,             // Modal title
  schema: object,                  // Grid schema for modal content
  data: array,                     // Modal data (usually nested array)
  onSave: function,                // Save callback
  onDelete: function,              // Delete callback (optional)
  parentRowId: number,             // ID of parent row
  parentField: string              // Field name in parent row
}
```

**Key Properties**:
- `modalOverlay`: Dark background overlay element
- `modalBox`: Centered content container

**Public Methods**:

#### `render()`
Creates and displays modal dialog

**Structure**:
```html
<div class="modal-overlay">
  <div class="modal-content">
    <div class="modal-header flex-between">
      <h2>Title</h2>
      <button class="btn modal-close-btn">×</button>
    </div>
    <div><!-- EditableGrid renders here --></div>
  </div>
</div>
```

**Behavior**:
- Removes existing modal if present
- Creates new modal overlay
- Renders header with close button
- Instantiates `EditableGrid` inside modal
- Appends to target element

**Close Button**:
- Click → removes modal overlay from DOM
- No data validation or confirmation

### 5. config.js

**Purpose**: Keyboard shortcut configuration and matching utilities

**Exports**:
- `loadConfig()`: Async function to load shortcuts.json
- `getShortcut(module, action)`: Retrieve shortcut string
- `getAllShortcuts()`: Get entire shortcuts object
- `matchShortcut(event, shortcut)`: Check if keyboard event matches shortcut

**Usage Pattern**:
```javascript
await loadConfig();
const shortcut = getShortcut('EditableGrid', 'saveRow'); // "Enter"

document.addEventListener('keydown', (event) => {
  if (matchShortcut(event, shortcut)) {
    // Handle save action
  }
});
```

**Shortcut Format**: `Modifier+Key`
- Example: `Meta+Shift+A`
- Modifiers: `Meta`, `Shift`, `Alt`, `Control`, `Ctrl`

**matchShortcut() Logic**:
1. Split shortcut string by `+`
2. Extract key (last segment)
3. Extract modifiers (all other segments)
4. Compare event properties:
   - `event.key === key`
   - `event.metaKey === meta`
   - `event.shiftKey === shift`
   - `event.altKey === alt`
   - `event.ctrlKey === ctrl`

### 6. accounts.js

**Purpose**: Page controller for accounts management

**Pattern**: ES6 Module with top-level `await`

**Functions**:

#### `buildGridContainer()`
Creates page structure with accordion layout

**Returns**: Table container element

**DOM Structure**:
```html
<div id="panel-accounts">
  <div class="accordion-header">
    <h2>Accounts</h2>
    <span class="accordion-arrow">▼</span>
  </div>
  <div id="content" class="accordion-content">
    <div id="accountsTable"></div>
  </div>
</div>
```

#### `onSave(updatedAccounts)`
Persists account changes to disk

**Process**:
1. Read `app-data.json`
2. Parse JSON
3. Replace `accounts` array
4. Write entire file back to disk
5. Log success or error

#### `async createGridSchema(tableElement, onSave)`
Loads schema and data files

**Returns**: Grid configuration object

**Process**:
1. Read `accounts-grid.json` → parse as schema
2. Read `app-data.json` → parse as data
3. Extract `accounts` array
4. Return object:
   ```javascript
   {
     targetElement,
     tableHeader: 'Accounts',
     onSave,
     schema,
     data
   }
   ```

#### `loadTable(tableData)`
Instantiates and renders grid

**Process**:
1. Create `new EditableGrid(tableData)`
2. Call `grid.render()`

**Execution Flow**:
```javascript
loadGlobals();
const table = buildGridContainer();
const tableData = await createGridSchema(table, onSave);
loadTable(tableData);
```

### 7. transactions.js

**Purpose**: Page controller for transactions management

**Pattern**: Same as accounts.js with additional logic

**Functions**:

#### `buildGridContainer()`
Same as accounts.js, creates accordion container

#### `async onSave(updatedTransactions)`
Complex save logic with quick-add account creation

**Special Behavior**:
1. Load `accounts-grid.json` for default values
2. Scan transactions for new accounts (`id === null`)
3. For each new account:
   - Generate new ID
   - Create account with schema defaults
   - Add to `accounts` array
   - Update transaction reference
4. Update `transactions` array
5. Write entire `app-data.json`

**Quick-Add Logic**:
```javascript
['debit_account', 'credit_account'].forEach(field => {
    const acct = tx[field];
    if (acct && (acct.id === null || acct.id === undefined)) {
        // Create new account
        acct.id = nextId;
        const newAcct = { id: nextId, name: acct.name };
        // Apply defaults from schema...
        appData.accounts.push(newAcct);
        nextId++;
    }
});
```

#### `async createGridSchema(tableElement, onSave, onDelete)`
Loads schema with dynamic options injection

**Dynamic Options**:
```javascript
gridData.schema.mainGrid.columns.forEach(col => {
    if (col.optionsSourceFile && col.optionsSourceFile === 'app-data.json') {
        gridData.schema[col.optionsSource] = initialData[col.optionsSource]
            .map(opt => ({ id: opt.id, name: opt.name }));
    }
});
```

**Purpose**: Populates account dropdowns from live `accounts` array

#### `loadTable(tableData)`
Same as accounts.js

---

## Component Catalog

### Button Component

**HTML**:
```html
<span class="btn" title="Tooltip text">
  <!-- SVG icon -->
</span>
```

**CSS Classes**: `.btn`, `.icon-btn`

**Properties**:
- Size: 44x44px (fixed)
- SVG size: 28x28px
- Hover: background `#232a23`, color `#b6ff00`

### Accordion Component

**HTML Structure**:
```html
<div class="accordion-header bg-main bordered rounded shadow-lg pointer flex-between">
  <h2>Section Title</h2>
  <span class="accordion-arrow">&#9662;</span>
</div>
<div class="accordion-content bg-main rounded shadow-md">
  <!-- Content -->
</div>
```

**JavaScript**:
```javascript
header.addEventListener('click', () => window.toggleAccordion('content-id'));
```

**Behavior**:
- Click header → toggle content `display: none/block`
- Arrow rotates (optional enhancement)

### Tag Input Component

**Rendered by**: EditableGrid for `type: "tags"` columns

**HTML**:
```html
<div class="tags-container">
  <span class="tag-item">
    TagName
    <span class="tag-remove">×</span>
  </span>
  <input type="text" class="tag-edit-input" placeholder="Add tag">
</div>
```

**Behavior**:
- Type + Space/Enter/Comma → adds tag
- Backspace on empty input → removes last tag
- Click × → removes specific tag
- Focus returns to input after operations

**Styling**:
- Tags: pill-shaped, `#232a23` background, `#b6ff00` border
- Input: inline, min 90px width

### Checkbox Component

**HTML**:
```html
<input type="checkbox" class="checkbox-input">
```

**Styling**:
- Size: 22x22px
- Accent color: `#b6ff00`
- Custom checkmark (✓) rendered via `::after` pseudo-element
- Background: `#181a1b` → `#b6ff00` when checked

**Types**:
1. **Standard Checkbox**: Simple boolean
2. **Exclusive Checkbox**: Only one can be checked (radio button behavior)

### Date Picker Component

**HTML**:
```html
<input type="date" class="date-input">
```

**Behavior**:
- Defaults to today's date if empty
- Native browser date picker
- Format: YYYY-MM-DD

**Styling**:
- Custom calendar icon color: sepia filter for theme consistency
- Focus: `#b6ff00` border and glow

### Select/Dropdown Component

**Types**:

#### Standard Select
```html
<select>
  <option value="--">--</option>
  <option value="1">Option 1</option>
</select>
```

#### Quick-Add Select (addSelect)
```html
<input type="text" list="datalist-id" class="add-select-input">
<datalist id="datalist-id">
  <option value="Option 1">
  <option value="Option 2">
</datalist>
```

**Behavior**:
- Type to filter options
- Select existing or type new
- On save, creates new option if not found (transactions accounts)

---

## Development Guidelines

### Adding a New Page

1. **Create HTML file** in `/pages`:
   ```html
   <!DOCTYPE html>
   <html lang="en">
   <head>
     <meta charset="UTF-8">
     <title>New Page | Financial Simulation</title>
     <link rel="stylesheet" href="../styles/app.css">
     <script src="../js/navbar.js"></script>
     <script src="../js/my-page.js" type="module"></script>
   </head>
   <body class="bg-main text-main">
     <div id="main-navbar"></div>
     <div id="panel-my-page"></div>
   </body>
   </html>
   ```

2. **Create JavaScript module** in `/js`:
   ```javascript
   import { EditableGrid } from './editable-grid.js';
   import { loadGlobals } from './global-app.js';
   
   loadGlobals();
   // Build UI, load data, render grid
   ```

3. **Create schema file** in `/assets`:
   ```json
   {
     "mainGrid": {
       "actions": { "add": true, "edit": true, "delete": true, "save": true },
       "columns": [...]
     }
   }
   ```

4. **Add nav link** in `navbar.js`:
   ```javascript
   var navLinks = `
     ...
     <a href="my-page.html" id="nav-my-page">My Page</a>
   `;
   ```

### Adding a New Column Type to EditableGrid

1. **Update `createTableRows()` switch statement**:
   ```javascript
   case 'myNewType': {
     let input = document.createElement('input');
     input.type = 'text';
     // Custom behavior...
     window.add(cellContent, input);
     break;
   }
   ```

2. **Update `handleSave()` switch statement**:
   ```javascript
   case 'myNewType': {
     const input = cell.querySelector('input');
     value = input ? input.value : '';
     break;
   }
   ```

3. **Add CSS styling** in `app.css`:
   ```css
   .my-new-type-input {
     /* custom styles */
   }
   ```

4. **Update schema** in JSON:
   ```json
   {
     "field": "myField",
     "type": "myNewType",
     "editable": true,
     "display": true
   }
   ```

### Adding a New Data Entity

1. **Add array to `app-data.json`**:
   ```json
   {
     "myEntities": [
       { "id": 1, "name": "Entity 1" }
     ]
   }
   ```

2. **Create schema JSON** in `/assets/my-entities-grid.json`

3. **Create page controller** in `/js/my-entities.js`:
   - Implement `buildGridContainer()`
   - Implement `onSave(updatedData)`
   - Implement `createGridSchema()`
   - Implement `loadTable()`

4. **Create HTML page** in `/pages/my-entities.html`

5. **Update navbar** with new link

### Debugging Tips

**Enable Console Logging**:
- EditableGrid logs to console with `[EditableGrid]` prefix
- Check for warnings about missing fields
- Verify schema and data structure match

**Common Issues**:

| Issue | Cause | Solution |
|-------|-------|----------|
| Column not rendering | `display: false` in schema | Set `display: true` |
| Value not saving | Field name mismatch | Check `field` in schema matches data key |
| Dropdown empty | `optionsSource` not defined | Add options array to schema |
| Modal not opening | Modal schema missing | Define modal in schema JSON |
| New ID conflicts | ID generation logic | Verify `reduce` max ID calculation |

**File System Errors**:
- Use `process.cwd()` for relative paths
- Check file permissions
- Verify JSON syntax with linter

### Performance Considerations

**Re-render Strategy**:
- EditableGrid fully re-renders on each change
- Not optimized for large datasets (>1000 rows)
- Consider pagination or virtual scrolling for scale

**Data Mutations**:
- Always work with `workingData` copy
- Update source `data` array on save
- Persist to disk asynchronously

**File I/O**:
- Read entire `app-data.json` on save (simple, atomic)
- No incremental updates or streaming
- Suitable for small to medium datasets

### Security Considerations

**Current Configuration**:
- `nodeIntegration: true` (enables Node.js APIs)
- `contextIsolation: false` (no isolation between renderer and Node.js)
- Direct file system access via `window.require('fs')`

**Risks**:
- Vulnerable to XSS attacks if rendering untrusted HTML
- No sandboxing of renderer process
- Full filesystem access from web content

**Recommendations for Production**:
1. Enable `contextIsolation: true`
2. Use IPC communication between main and renderer
3. Disable `nodeIntegration` in renderer
4. Use preload script with `contextBridge` API
5. Implement input sanitization
6. Add content security policy (CSP)

**Current CSP** (partial):
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;">
```

### Testing Recommendations

**Manual Testing Checklist**:
- [ ] Add new row
- [ ] Edit each column type
- [ ] Save changes
- [ ] Delete row
- [ ] Open modal
- [ ] Add/remove tags
- [ ] Quick-add new account (transactions)
- [ ] Verify data persistence (restart app)
- [ ] Test keyboard shortcuts
- [ ] Test accordion collapse/expand

**Data Integrity Checks**:
- Backup `app-data.json` before testing
- Verify JSON structure after saves
- Check for orphaned references (deleted accounts)
- Validate ID uniqueness

### Future Enhancements

**Planned Features** (not yet implemented):
- Budget Builder page (schema exists, no controller)
- Forecast generation
- Data visualization (charts)
- Export/import functionality
- Undo/redo functionality
- Validation rules in schema
- Computed fields
- Data relationships and constraints

**Technical Debt**:
- Keyboard shortcuts loaded but not implemented in EditableGrid
- Interest formulas defined but not calculated
- Recurrence and amount change logic not connected to forecast
- No unit tests or automated testing
- No error boundaries or graceful degradation

---

## Appendix: Quick Reference

### CSS Class Reference

| Class | Purpose |
|-------|---------|
| `bg-main` | Primary background gradient |
| `text-main` | Primary text color (#ededed) |
| `btn` | Icon button (44x44px) |
| `table` | Data table styling |
| `bordered` | 2.5px border (#232a23) |
| `rounded` | 12px border radius |
| `shadow-lg` | Large box shadow |
| `shadow-md` | Medium box shadow |
| `pointer` | Cursor pointer |
| `flex-between` | Flexbox space-between |
| `accordion-header` | Collapsible header |
| `accordion-content` | Collapsible content |
| `accordion-arrow` | Arrow indicator (▼) |
| `modal-overlay` | Full-screen modal backdrop |
| `modal-content` | Centered modal box |
| `modal-header` | Modal title bar |
| `modal-close-btn` | Close button (×) |
| `tags-container` | Tag collection wrapper |
| `tag-item` | Individual tag pill |
| `tag-remove` | Remove tag button (×) |
| `tag-edit-input` | Add tag input |
| `checkbox-input` | Custom checkbox |
| `date-input` | Date picker input |
| `add-select-input` | Quick-add dropdown input |

### File Path Reference

| Path | Purpose |
|------|---------|
| `process.cwd() + '/assets/app-data.json'` | Main data store |
| `process.cwd() + '/assets/accounts-grid.json'` | Accounts schema |
| `process.cwd() + '/assets/transactions-grid.json'` | Transactions schema |
| `process.cwd() + '/assets/shortcuts.json'` | Keyboard shortcuts |
| `../styles/app.css` | Main stylesheet |
| `../styles/icons.js` | SVG icon definitions |
| `../js/editable-grid.js` | Core grid component |
| `../js/modal.js` | Modal component |
| `../js/global-app.js` | Global helpers |
| `../js/navbar.js` | Navigation bar |
| `../js/config.js` | Shortcut utilities |

### Column Type Reference

| Type | Input Element | Use Case |
|------|---------------|----------|
| `text` | `<input type="text">` | Short text fields |
| `number` | `<input type="number">` | Numeric values |
| `select` | `<select>` | Choose from predefined list |
| `addSelect` | `<input list="datalist">` | Choose or add new option |
| `modal` | Icon button | Complex nested data |
| `tags` | Custom tag UI | Multiple string values |
| `checkbox` | `<input type="checkbox">` | Boolean flag |
| `exclusive` | `<input type="checkbox">` | Single selection (radio-like) |
| `date` | `<input type="date">` | Date selection |

---

**End of Technical Documentation**

For questions or clarifications, review the source code in conjunction with this documentation. All file paths are relative to the project root (`/Users/Jay/GIT-Repos-Personal/ftrack`).

---

## AI Agent Configuration

This project includes AI agent instructions for GitHub Copilot to ensure consistent code generation that follows the project's design standards, coding patterns, and architecture.

**AI Instructions Location**: `.github/copilot-instructions.md`

The instructions are automatically used by GitHub Copilot when working in this repository and include:
- Technology stack constraints
- Coding standards and naming conventions
- Design system compliance rules
- Architecture patterns
- Component usage guidelines
- Development workflows

To update AI agent behavior, modify `.github/copilot-instructions.md` and this documentation file.
