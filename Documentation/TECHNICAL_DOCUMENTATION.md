# FTrack - Financial Tracking Application
## Comprehensive Technical Documentation

**Version:** 1.1.0  
**Platform:** Electron Desktop Application  
**Last Updated:** December 29, 2025

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Design Standards](#2-design-standards)
3. [Coding Standards](#3-coding-standards)
4. [Library & Framework Usage](#4-library--framework-usage)
5. [Asset Structure & Data Models](#5-asset-structure--data-models)
6. [Module Documentation](#6-module-documentation)
7. [Component Catalog](#7-component-catalog)
8. [Development Guidelines](#8-development-guidelines)

---

## 1. Architecture Overview

### 1.1. Application Type
FTrack is an **Electron-based desktop application** for financial account and transaction management. It uses a modular architecture with:

&nbsp;&nbsp;&nbsp;&nbsp;1.1.1. **Main Process**: Electron main process ([main.js](../main.js))
&nbsp;&nbsp;&nbsp;&nbsp;1.1.2. **Renderer Process**: Standard web technologies (HTML, CSS, JavaScript ES6 modules)
&nbsp;&nbsp;&nbsp;&nbsp;1.1.3. **Data Storage**: JSON file-based persistence in `/assets` directory
&nbsp;&nbsp;&nbsp;&nbsp;1.1.4. **Security**: Node.js integration enabled, context isolation disabled for direct filesystem access

### 1.2. Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Runtime** | Electron | 37.2.1 |
| **Language** | JavaScript (ES6 Modules) | ES2015+ |
| **Styling** | CSS3 (Custom design system) | - |
| **Icons** | SVG (inline) | - |
| **Data Format** | JSON | - |

### 1.3. File Structure

```
ftrack/
├── main.js                 # Electron main process entry point
├── preload.js              # Preload script (minimal, reserved for future)
├── package.json            # Project configuration
├── pages/                  # HTML page templates
│   ├── home.html          # Dashboard/overview page
│   ├── accounts.html      # Account management page
│   ├── transactions.html  # Transaction management page
│   └── forecast.html      # Financial forecast page (3-section layout)
├── js/                    # JavaScript modules
│   ├── global-app.js      # Global helper functions
│   ├── navbar.js          # Navigation bar component
│   ├── accounts.js        # Account page controller
│   ├── transactions.js    # Transaction page controller
│   ├── forecast.js        # Forecast page controller (3 grids)
│   ├── editable-grid.js   # Core grid component (class-based)
│   ├── modal.js           # Modal dialog component
│   └── config.js          # Keyboard shortcuts configuration
├── styles/                # CSS styling
│   ├── app.css            # Main application styles
│   └── icons.js           # SVG icon definitions
└── assets/                # Data and configuration files
    ├── app-data.json                  # Application data (accounts, transactions, forecasts)
    ├── accounts-grid.json             # Accounts grid schema
    ├── transactions-grid.json         # Transactions grid schema
    ├── forecast-template-grid.json    # Forecast version selector schema
    ├── forecast-setup-grid.json       # Forecast setup grid schema
    ├── forecast-snapshot-grid.json    # Forecast results schema
    └── shortcuts.json                 # Keyboard shortcut definitions
```

### 1.4. Page Architecture

Each page follows a consistent pattern:

&nbsp;&nbsp;&nbsp;&nbsp;1.4.1. **HTML Template**: Minimal structure with navbar injection point and content container
&nbsp;&nbsp;&nbsp;&nbsp;1.4.2. **JavaScript Module**: Loads required dependencies, builds UI, handles data operations
&nbsp;&nbsp;&nbsp;&nbsp;1.4.3. **Schema-Driven Rendering**: Grid configurations loaded from JSON schemas
&nbsp;&nbsp;&nbsp;&nbsp;1.4.4. **Event-Driven Updates**: User actions trigger data mutations and re-renders

---

## 2. Design Standards

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

#### 2.1.2. Typography

&nbsp;&nbsp;&nbsp;&nbsp;2.1.2.1. **Font Family**: `'Inter', 'Segoe UI', Arial, sans-serif`
&nbsp;&nbsp;&nbsp;&nbsp;2.1.2.2. **Base Font Size**: 18px (1rem)
&nbsp;&nbsp;&nbsp;&nbsp;2.1.2.3. **Headings**: 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.2.3.1. H2: 1.22em (headers), 1.18em (modals)
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.2.3.2. Bold weight (700) for table headers
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.2.3.3. Font weight 600 for modal headers
&nbsp;&nbsp;&nbsp;&nbsp;2.1.2.4. **Body Text**: 1.08em for inputs, table cells
&nbsp;&nbsp;&nbsp;&nbsp;2.1.2.5. **Navigation**: 1.04em with 500 font weight

#### 2.1.3. Spacing & Layout

&nbsp;&nbsp;&nbsp;&nbsp;2.1.3.1. **Padding**:
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.3.1.1. Table cells: 6px vertical, 8px horizontal
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.3.1.2. Inputs: 12px vertical, 14px horizontal
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.3.1.3. Accordion content: 18-20px
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.3.1.4. Modal content: 4vw top/bottom, 2vw left/right
&nbsp;&nbsp;&nbsp;&nbsp;2.1.3.2. **Border Radius**:
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.3.2.1. Default: 12px (`.rounded`)
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.3.2.2. Inputs: 6px
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.3.2.3. Buttons: 8px
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.3.2.4. Tags: 16px
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.3.2.5. Modal close button: 50% (circular)
&nbsp;&nbsp;&nbsp;&nbsp;2.1.3.3. **Shadows**:
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.3.3.1. Large: `0 8px 40px rgba(0,0,0,0.18)`
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.3.3.2. Medium: `0 4px 16px rgba(0,0,0,0.12)`
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.3.3.3. Input focus: `0 2px 0 0 #b6ff00`

#### 2.1.4. Interactive Elements

&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.1. **Buttons**:
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.1.1. Size: 44x44px (minimum touch target)
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.1.2. SVG icons: 28x28px
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.1.3. Hover state: background `#232a23`, color `#b6ff00`
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.1.4. Transition: 180ms ease

&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.2. **Input Fields**:
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.2.1. Background: Transparent (default), `#181a1b` (focus)
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.2.2. Border: None (default), bottom border 2.5px `#b6ff00` (focus)
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.2.3. Focus shadow: `0 2px 0 0 #b6ff00`

&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.3. **Select Dropdowns**:
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.3.1. Appearance: Custom (native appearance removed)
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.3.2. Background: `#181a1b`
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.3.3. Same focus styles as text inputs

&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.4. **Checkboxes**:
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.4.1. Size: 22x22px
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.4.2. Accent color: `#b6ff00`
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.4.4.3. Custom appearance with checkmark (✓) on checked state

#### 2.1.5. Component Patterns

&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.1. **Accordion Panels**:
```html
<div class="accordion-header bg-main bordered rounded shadow-lg pointer flex-between">
  <h2>Section Title</h2>
  <span class="accordion-arrow">&#9662;</span>
</div>
<div class="accordion-content bg-main rounded shadow-md">
  <!-- Content -->
</div>
```

&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.2. **Navigation Bar**:
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.2.1. Horizontal layout with equal-width links (min 110px)
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.2.2. Bottom border indicator for active page (3px height, `#b6ff00`)
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.2.3. 18px horizontal margin between links

&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.3. **Tables**:
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.3.1. Full width with collapsed borders
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.3.2. Alternating row hover state (`#232a23`)
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.3.3. Header background: `#202223`
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.3.4. Border: 2px bottom border for headers

&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.4. **Modals**:
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.4.1. Overlay: `rgba(10, 12, 16, 0.82)` with 8px blur
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.4.2. Content: max 80vw width, 80vh height
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.4.3. Centered vertically and horizontally
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.4.4. Close button in top-right corner

&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.5. **Tags**:
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.5.1. Pill-shaped containers (16px border radius)
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.5.2. Background: `#232a23`, border: 1px `#b6ff00`
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.5.3. Remove button (×) with hover effect
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2.1.5.5.4. Input field inline with tags

---

## 3. Coding Standards

### JavaScript Standards

#### Module System
- **Type**: ES6 Modules (`type="module"` in HTML)
- **Import/Export**: Named exports preferred
```javascript
export class EditableGrid { ... }
export function loadGlobals() { ... }
```

#### 3.1.2. Code Organization

&nbsp;&nbsp;&nbsp;&nbsp;3.1.2.1. **Class-Based Components**:
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.1.2.1.1. Constructor initializes state and options
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.1.2.1.2. Methods are instance methods (not arrow functions for `this` binding)
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.1.2.1.3. Example: `EditableGrid`, `Modal`

&nbsp;&nbsp;&nbsp;&nbsp;3.1.2.2. **Function-Based Utilities**:
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.1.2.2.1. Pure functions for helpers
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.1.2.2.2. Example: `global-app.js`, `config.js`

&nbsp;&nbsp;&nbsp;&nbsp;3.1.2.3. **IIFE for Self-Executing Scripts**:
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.1.2.3.1. Used in `navbar.js` for immediate execution
   ```javascript
   (function() {
     // navbar initialization
   })();
   ```

#### 3.1.3. Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| **Classes** | PascalCase | `EditableGrid`, `Modal` |
| **Functions** | camelCase | `loadGlobals()`, `buildGridContainer()` |
| **Variables** | camelCase | `workingData`, `tableElement` |
| **Constants** | UPPER_SNAKE_CASE | `ICON_EDIT`, `ICON_DELETE` |
| **Private State** | Underscore prefix | `_shortcutsLoaded`, `_tagFocus` |
| **HTML IDs** | kebab-case | `main-navbar`, `panel-accounts` |
| **CSS Classes** | kebab-case | `bg-main`, `accordion-header` |

#### 3.1.4. Async/Await Pattern
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

#### 3.1.5. Error Handling
&nbsp;&nbsp;&nbsp;&nbsp;3.1.5.1. Use try-catch blocks for all async operations
&nbsp;&nbsp;&nbsp;&nbsp;3.1.5.2. Log errors with descriptive context: `console.error('Failed to save accounts data:', err)`
&nbsp;&nbsp;&nbsp;&nbsp;3.1.5.3. Provide fallback behavior when possible

#### 3.1.6. Data Manipulation

&nbsp;&nbsp;&nbsp;&nbsp;3.1.6.1. **Immutability Patterns**:
   ```javascript
   // Create working copy
   this.workingData = [...this.data];
   
   // Deep clone for schema
   const modalSchema = JSON.parse(JSON.stringify(this.schema[col.modal]));
   ```

&nbsp;&nbsp;&nbsp;&nbsp;3.1.6.2. **Array Operations**:
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.1.6.2.1. Use `forEach`, `map`, `find`, `filter` for iteration
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.1.6.2.2. Use `reduce` for aggregation
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3.1.6.2.3. Example: `nextId = appData.accounts.reduce((max, a) => a.id > max ? a.id : max, 0) + 1`

&nbsp;&nbsp;&nbsp;&nbsp;3.1.6.3. **Object Spread**:
   ```javascript
   const newRow = {
       id: nextId,
       name: acct.name,
       ...defaultFields
   };
   ```

#### 3.1.7. DOM Manipulation

&nbsp;&nbsp;&nbsp;&nbsp;3.1.7.1. **Global Helper Functions** (from `global-app.js`):
```javascript
window.getEl = (id) => document.getElementById(id);
window.add = (parent, child) => parent.appendChild(child);
window.toggleAccordion = (id) => { /* toggle display */ };
```

&nbsp;&nbsp;&nbsp;&nbsp;3.1.7.2. **Standard Pattern**:
```javascript
const element = document.createElement('div');
element.className = 'bg-main bordered rounded';
element.innerHTML = '<h2>Title</h2>';
element.addEventListener('click', () => { /* handler */ });
window.add(parentElement, element);
```

#### 3.1.8. Event Listeners

&nbsp;&nbsp;&nbsp;&nbsp;3.1.8.1. Use arrow functions for inline handlers to preserve context
&nbsp;&nbsp;&nbsp;&nbsp;3.1.8.2. Use named functions for complex handlers
&nbsp;&nbsp;&nbsp;&nbsp;3.1.8.3. Remove listeners when appropriate (component cleanup)

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

#### 3.1.9. Console Logging

&nbsp;&nbsp;&nbsp;&nbsp;3.1.9.1. **Debug Logging**:
```javascript
console.log('[EditableGrid] createTableRows workingData:', this.workingData);
console.warn('[EditableGrid] WARNING: Field not found', acc);
```

&nbsp;&nbsp;&nbsp;&nbsp;3.1.9.2. **Prefix Pattern**: Use `[ClassName/ModuleName]` prefix for debug messages

---

## 4. Library & Framework Usage

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

### 1. data-manager.js

**Purpose**: Centralized module for all data persistence operations

**Class**: `DataManager` (singleton export as `dataManager`)

**Key Properties**:
- `fs`: Node.js filesystem module (promises)
- `dataPath`: Path to app-data.json
- `cachedData`: In-memory data object

**Public Methods**:

#### `loadData()`
Loads app-data.json into memory cache
```javascript
const data = await dataManager.loadData();
```

#### `saveData()`
Writes cached data to disk
```javascript
await dataManager.saveData();
```

#### `getNextId(entityType)`
Returns next available ID for entity type
```javascript
const nextId = dataManager.getNextId('accounts');
// Returns: 1 + max ID in accounts array
```

#### `saveAccounts(updatedAccounts)`
Saves accounts data
```javascript
await dataManager.saveAccounts([...accountsArray]);
```

#### `saveTransactions(updatedTransactions)`
Saves transactions with auto-account creation
- Detects new accounts (id === null)
- Creates accounts with schema defaults
- Links to transactions
- Saves both accounts and transactions
```javascript
await dataManager.saveTransactions([
  {
    id: 1,
    debit_account: { id: null, name: "New Account" },  // Will be created
    credit_account: { id: 2, name: "Existing" },
    amount: 100
  }
]);
```

#### `saveForecastVersions(updatedVersions)`
Saves forecast version definitions
```javascript
await dataManager.saveForecastVersions([...versionsArray]);
```

#### `saveForecastSetup(updatedSetup, versionId)`
Saves forecast setup with linking
- Links setup to forecast version via versionId
- Auto-creates new accounts/transactions if needed
```javascript
await dataManager.saveForecastSetup([...setupArray], 1);
```

#### `saveForecastResults(updatedResults, versionId)`
Saves forecast results with version linking
```javascript
await dataManager.saveForecastResults([...resultsArray], 1);
```

#### `validateData()`
Validates data integrity across relationships
- Returns array of issues
```javascript
const issues = await dataManager.validateData();
// Returns: ["Transaction 5: debit_account ID 99 not found"]
```

**Auto-Linking Patterns**:

When user adds new entity via `addSelect` dropdown:
1. Grid saves with `{ id: null, name: "New Name" }`
2. DataManager detects null ID
3. Creates entity with schema defaults
4. Assigns new ID
5. Updates reference in parent entity
6. Saves all changes atomically

**Usage Example**:
```javascript
import { dataManager } from './data-manager.js';

async function onSave(updatedTransactions) {
  await dataManager.saveTransactions(updatedTransactions);
}
```

### 2. global-app.js

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

### Page Controller Pattern

All pages follow a consistent 5-step pattern:

#### Step 1: Build UI Container
```javascript
function buildGridContainer() {
  const panel = window.getEl('panel-my-page');
  panel.innerHTML = `
    <div class="accordion-header bg-main bordered rounded shadow-lg pointer flex-between">
      <h2>My Page Title</h2>
      <span class="accordion-arrow">&#9662;</span>
    </div>
    <div class="accordion-content bg-main rounded shadow-md">
      <div id="my-table-container"></div>
    </div>
  `;
}
```

#### Step 2: Define onSave Callback
```javascript
async function onSave(updatedData) {
  const fs = window.require('fs').promises;
  const dataPath = process.cwd() + '/assets/app-data.json';
  try {
    const dataFile = await fs.readFile(dataPath, 'utf8');
    const appData = JSON.parse(dataFile);
    appData.myEntities = updatedData;
    await fs.writeFile(dataPath, JSON.stringify(appData, null, 2), 'utf8');
    console.log('[Save] Success');
  } catch (err) {
    console.error('[Save] Failed:', err);
  }
}
```

#### Step 3: Load Schema and Data
```javascript
async function createGridSchema() {
  const fs = window.require('fs').promises;
  try {
    const schemaPath = process.cwd() + '/assets/my-entities-grid.json';
    const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
    
    const dataPath = process.cwd() + '/assets/app-data.json';
    const appData = JSON.parse(await fs.readFile(dataPath, 'utf8'));
    
    return {
      schema: schema,
      data: appData.myEntities || []
    };
  } catch (err) {
    console.error('[Schema] Load failed:', err);
    return { schema: {}, data: [] };
  }
}
```

#### Step 4: Render Grid
```javascript
async function loadTable() {
  const { schema, data } = await createGridSchema();
  const grid = new EditableGrid({
    targetElement: window.getEl('my-table-container'),
    tableHeader: 'My Entities',
    schema: schema,
    data: data,
    onSave: onSave
  });
  grid.render();
}
```

#### Step 5: Execute on Page Load
```javascript
import { loadGlobals } from './global-app.js';
import { EditableGrid } from './editable-grid.js';

loadGlobals();
buildGridContainer();
loadTable();
```

### EditableGrid Configuration Reference

#### Required Constructor Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `targetElement` | HTMLElement | Container where grid will render |
| `tableHeader` | string | Title displayed above grid |
| `schema` | object | Grid configuration (columns, actions, modals) |
| `data` | array | Array of data objects to display |
| `onSave` | function | Callback when data is saved |

#### Optional Constructor Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `onDelete` | function | Custom delete callback (default uses onSave) |
| `parentRowId` | number | For nested grids: parent row ID |
| `parentField` | string | For nested grids: field name in parent |

#### Schema Structure

```json
{
  "mainGrid": {
    "actions": {
      "add": true,
      "edit": true,
      "delete": true,
      "save": true
    },
    "columns": [
      {
        "field": "id",
        "header": "ID",
        "type": "number",
        "editable": false,
        "display": false,
        "default": 0
      },
      {
        "field": "name",
        "header": "Name",
        "type": "text",
        "editable": true,
        "display": true,
        "default": ""
      }
    ]
  }
}
```

#### Column Configuration Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `field` | string | Yes | Key in data object |
| `header` | string | Yes | Column header text |
| `type` | string | Yes | Column type (text, number, select, etc.) |
| `editable` | boolean | Yes | Can user edit this field |
| `display` | boolean | Yes | Show column in grid |
| `default` | any | No | Default value for new rows |
| `optionsSource` | string | Conditional | For select/addSelect: key in schema with options array |
| `modal` | string | Conditional | For modal type: key in schema with modal config |
| `modalIcon` | string | Conditional | For modal type: icon name from icons.js |
| `modalIconTitle` | string | Conditional | For modal type: tooltip text |

#### Supported Column Types

| Type | Description | Use Case |
|------|-------------|----------|
| `text` | Single-line text input | Names, descriptions |
| `number` | Numeric input with step | IDs, amounts, quantities |
| `select` | Dropdown from predefined options | Categories, types |
| `addSelect` | Dropdown that allows adding new options | Account selection in transactions |
| `modal` | Opens modal with nested grid | Complex related data (e.g., interest schedules) |
| `tags` | Inline tag editor | Multiple labels/categories |
| `checkbox` | Boolean toggle | Flags, yes/no fields |
| `exclusive` | Checkbox with single-selection logic | Primary/default selection |
| `date` | Date picker input | Dates, timestamps |

#### Excel-Like Navigation

EditableGrid includes built-in keyboard navigation:

| Key | Action |
|-----|--------|
| Arrow Keys | Move between cells |
| Tab | Move to next cell |
| Shift+Tab | Move to previous cell |
| Enter | Start editing (or move down if editing) |
| F2 | Start editing current cell |
| Escape | Cancel editing |
| Any alphanumeric | Start editing and type |
| Double-click | Edit cell |

Visual feedback:
- Selected cell: `.cell-selected` CSS class with `#b6ff00` outline
- Focus state: Table has `tabindex="0"` and focus outline

#### Adding New Column Types

To extend EditableGrid with a custom column type:

1. **Update `createTableRows()` in editable-grid.js**:
```javascript
case 'myNewType': {
    let input = document.createElement('input');
    input.type = 'text';
    input.className = 'my-new-type-input';
    input.value = acc[col.field];
    // Add custom behavior
    input.addEventListener('change', () => {
        // Handle changes
    });
    window.add(cellContent, input);
    break;
}
```

2. **Update `handleSave()` in editable-grid.js**:
```javascript
case 'myNewType': {
    const input = cell.querySelector('input.my-new-type-input');
    value = input ? input.value : '';
    // Process value as needed
    break;
}
```

3. **Add CSS in app.css**:
```css
.my-new-type-input {
    /* Custom styling */
}
```

4. **Update schema documentation** in this file

---

### Keyboard Shortcuts System

#### Configuration File: `/assets/shortcuts.json`

```json
{
  "EditableGrid": {
    "saveRow": "Enter",
    "deleteRow": "Delete",
    "addRow": "Meta+Shift+A",
    "moveUp": "ArrowUp",
    "moveDown": "ArrowDown",
    "moveLeft": "ArrowLeft",
    "moveRight": "ArrowRight",
    "nextCell": "Tab",
    "prevCell": "Shift+Tab",
    "startEdit": "F2",
    "cancelEdit": "Escape"
  },
  "Global": {
    "openSettings": "Meta+,"
  }
}
```

#### Shortcut Format

- **Modifier Keys**: `Meta`, `Shift`, `Alt`, `Control` (or `Ctrl`)
- **Special Keys**: `Enter`, `Escape`, `Tab`, `Delete`, `F1`-`F12`
- **Arrow Keys**: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`
- **Combination**: Join with `+` (e.g., `Meta+Shift+A`)

#### Config Module API (`/js/config.js`)

```javascript
import { loadConfig, getShortcut, matchShortcut } from './config.js';

// Load shortcuts (call once, async)
await loadConfig();

// Get shortcut string
const shortcut = getShortcut('EditableGrid', 'saveRow'); // "Enter"

// Check if event matches shortcut
if (matchShortcut(event, getShortcut('EditableGrid', 'saveRow'))) {
    // Handle save
}
```

#### Usage Example in Components

```javascript
async _setupKeyboardNavigation(table) {
    // Load shortcuts
    if (!this.shortcutsLoaded) {
        await loadConfig();
        this.shortcutsLoaded = true;
    }
    
    table.addEventListener('keydown', (e) => {
        if (matchShortcut(e, getShortcut('EditableGrid', 'moveUp'))) {
            e.preventDefault();
            this._moveUp();
        } else if (matchShortcut(e, getShortcut('EditableGrid', 'moveDown'))) {
            e.preventDefault();
            this._moveDown();
        }
        // ... more shortcuts
    });
}
```

**Rules**:
- NEVER hardcode keyboard shortcuts in components
- ALWAYS define shortcuts in `/assets/shortcuts.json`
- ALWAYS use config module for matching
- Group shortcuts by module name

---

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
| `process.cwd() + '/assets/forecast-template-grid.json'` | Forecast version selector schema |
| `process.cwd() + '/assets/forecast-setup-grid.json'` | Forecast setup schema |
| `process.cwd() + '/assets/forecast-snapshot-grid.json'` | Forecast results schema |
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

## Financial Forecast Page Architecture

The Financial Forecast page ([forecast.html](../pages/forecast.html), [forecast.js](../js/forecast.js)) uses a **3-section layout** for complete budget/forecast management:

### Section 1: Forecast Version Selector
**Purpose**: Select and manage different forecast templates/budget versions
**Grid Schema**: [forecast-template-grid.json](../assets/forecast-template-grid.json)
**Data Source**: `app-data.json → forecastDefinitions`

**Columns**:
- Template Name: Identifier for the forecast version
- Mode: "dateRange" or "periods" 
- Start Date / End Date: Date range for forecast
- Period Type: Day/Week/Month/Quarter/Year
- Period Count: Number of periods to forecast
- Primary Account: Account to forecast against
- Notes: Description
- Tags: Categorization

### Section 2: Forecast Setup
**Purpose**: Define transactions for the selected forecast template
**Grid Schema**: [forecast-setup-grid.json](../assets/forecast-setup-grid.json)
**Data Source**: `app-data.json → forecastSetup`

**Columns**:
- Account: Account for the transaction (addSelect - can create new)
- Transaction: Transaction reference (addSelect - can create new)
- Amount: Transaction amount
- Date: Transaction date
- Movement: "Credit" or "Debit"
- Notes: Additional information

**Workflow**: User selects a forecast version from Section 1, then adds/edits transactions in Section 2 that define what happens during the forecast period.

### Section 3: Forecast Results
**Purpose**: Display calculated forecast results/snapshots
**Grid Schema**: [forecast-snapshot-grid.json](../assets/forecast-snapshot-grid.json)
**Data Source**: `app-data.json → forecastSnapshots`

**Columns**: Period, Account, Movement, Amount (calculated)

**Workflow**: After defining the forecast setup, the forecast engine generates snapshots showing projected account balances over time.

### Terminology
- **Forecast Version**: A template/budget definition with time parameters
- **Forecast Setup**: Transaction definitions that make up the template
- **Forecast Results**: Calculated outcomes from running the forecast

---

## Budget & Forecast System (NEW)

### Overview
The Budget & Forecast System is a comprehensive projection tool that enables scenario-based financial planning with double-entry bookkeeping, interest/growth calculations, and automated projection generation.

### Architecture

**3-Section UI**:
1. **Scenarios**: Define budget scenarios with time periods and accounts
2. **Planned Transactions**: Set up recurring and one-time transactions
3. **Projections**: View generated period-by-period projections

**Core Modules**:
- **data-manager.js**: CRUD operations for scenarios, planned transactions, and projections
- **projection-engine.js**: Calculation engine for generating projections
- **forecast.js**: UI controller with 3-section layout

### Data Schema

#### Scenarios (`scenario-grid.json`)
Defines a budget/forecast scenario with time parameters and accounts.

**Key Fields**:
- `name`: Scenario name (e.g., "2026 Monthly Budget")
- `type`: "Budget" | "Loan Payoff" | "Investment Growth" | "General"
- `startDate` / `endDate`: Projection date range
- `projectionPeriod`: "Day" | "Week" | "Month" | "Quarter" | "Year"
- `accounts`: Array of accounts (with isPrimary flag)
- `accountOverrides`: Scenario-specific interest/growth rates
- `transactionOverrides`: Scenario-specific transaction amounts/dates
- `lastCalculated`: Timestamp of last projection generation

#### Planned Transactions (`planned-transactions-grid.json`)
Defines transactions that will occur during the scenario period.

**Key Fields**:
- `scenarioId`: Parent scenario
- `transactionTemplateId`: Link to base transaction (null if scenario-specific)
- `description`: Transaction description
- `fromAccount`: Source account (debit)
- `toAccount`: Destination account (credit)
- `amount`: Transaction amount
- `recurrence`: Recurrence pattern object
- `enabled`: Can disable without deleting

**Recurrence Pattern**:
```json
{
  "type": "one-time" | "recurring",
  "frequency": "Daily" | "Weekly" | "Biweekly" | "Monthly" | "Quarterly" | "Yearly",
  "interval": 1,
  "startDate": "2026-01-15",
  "endDate": null,
  "dayOfMonth": 15,
  "dayOfWeek": null,
  "monthOfYear": null
}
```

#### Projections (`projections-grid.json`)
Period-by-period account balance projections (read-only).

**Key Fields**:
- `scenarioId`: Parent scenario
- `accountId` / `accountName`: Which account
- `isPrimary`: Whether this is the primary account
- `period` / `periodLabel`: Period end date and label
- `openingBalance`: Balance at period start
- `totalDebits`: Sum of all debits (outflows)
- `totalCredits`: Sum of all credits (inflows)
- `netTransactions`: Credits - Debits
- `interestEarned`: Interest calculated for period
- `growthAmount`: Growth calculated for period
- `projectedBalance`: Ending balance
- `transactionCount`: Number of transactions in period

### Projection Engine

**Algorithm**:
1. Calculate periods based on start/end dates and period type
2. Get planned transactions for scenario
3. Apply transaction overrides from scenario
4. Get all accounts (scenario accounts + all accounts in transactions)
5. For each period:
   - Expand recurring transactions into instances
   - Calculate debits and credits for each account
   - Calculate interest (if enabled)
   - Calculate growth (if enabled)
   - Project ending balance
6. Validate double-entry: sum(debits) = sum(credits) for each period
7. Save projections

**Interest Calculation**:
```javascript
calculateInterest(principal, annualRate, compounding, days) {
  const rate = annualRate / 100;
  switch (compounding) {
    case 'Monthly':
      const months = days / 30.44;
      return principal * Math.pow(1 + rate/12, months) - principal;
    // ... other compounding frequencies
  }
}
```

**Double-Entry Bookkeeping**:
Every planned transaction creates TWO projection entries:
- Debit entry on fromAccount (reduces balance)
- Credit entry on toAccount (increases balance)

This ensures `totalDebits = totalCredits` for each period, maintaining accounting accuracy.

### Primary Account Filtering

**Purpose**: Focus on a specific account and its related transactions.

**Filter Logic**:
- User selects a primary account from dropdown
- Planned Transactions section shows only transactions involving that account
- Projections section shows primary account PLUS all related secondary accounts

**Example**:
- Primary: Checking Account
- Related accounts: Salary Income, Rent Expense, Savings Account
- Shows all transactions between Checking and these accounts
- Shows projections for Checking (highlighted) + related accounts (indented)

### Account Interest/Growth Fields

Accounts can now have interest and growth settings:

**Interest** (`accounts-grid.json → interestModal`):
- `enabled`: Enable/disable interest
- `nominalRate`: Annual interest rate (%)
- `compoundingInterval`: "Daily" | "Weekly" | "Monthly" | "Quarterly" | "Annually"
- `calculationMethod`: "Simple" | "Compound"

**Growth** (`accounts-grid.json → growthModal`):
- `enabled`: Enable/disable growth
- `rate`: Annual growth rate (%)
- `type`: "Linear" | "Compound-Annual"

### DataManager Methods

```javascript
// Scenarios
await dataManager.saveScenarios(scenarios)
const scenario = dataManager.getScenario(scenarioId)
const clone = await dataManager.cloneScenario(scenarioId, newName)

// Planned Transactions
await dataManager.savePlannedTransactions(plannedTransactions, scenarioId)
const plannedTxs = dataManager.getPlannedTransactions(scenarioId)

// Projections
await dataManager.saveProjections(projections, scenarioId)
const projections = dataManager.getProjections(scenarioId, accountId)
await dataManager.clearProjections(scenarioId)
```

### Usage Workflow

1. **Create Scenario**: Define name, type, date range, period type, and accounts
2. **Add Planned Transactions**: Set up income, expenses, transfers with recurrence
3. **Generate Projection**: Click button to run projection engine
4. **View Results**: Analyze projections with primary account filtering
5. **Clone & Compare**: Clone scenario to test different parameters

### Example Test Scenario

**Scenario**: "2026 Test Budget"
- Type: Budget
- Date Range: 2026-01-01 to 2026-12-31 (12 months)
- Period: Month
- Accounts: Checking (primary), Savings

**Planned Transactions**:
1. Monthly Salary: $5,000 (Income → Checking, 15th of month)
2. Monthly Rent: $1,500 (Checking → Rent Expense, 1st of month)
3. Monthly Savings: $500 (Checking → Savings, 16th of month)

**Results**:
- 48 projections generated (12 months × 4 accounts)
- Checking balance: $2,000 → $38,800
- Interest earned: $373.50 @ 2% APR
- All periods balanced (debits = credits)

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
