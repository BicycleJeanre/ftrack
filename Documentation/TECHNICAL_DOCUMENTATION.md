# FTrack - Financial Tracking Application
## Comprehensive Technical Documentation

**Version:** 2.0.0  
**Platform:** Electron Desktop Application  
**Last Updated:** January 7, 2026  
**Architecture:** Scenario-Centric Model

---

## Table of Contents

1.0 [Architecture Overview](#10-architecture-overview)
2.0 [Design Standards](#20-design-standards)
3.0 [Coding Standards](#30-coding-standards)
4.0 [Library & Framework Usage](#40-library--framework-usage)
5.0 [Asset Structure & Data Models](#50-asset-structure--data-models)
6.0 [Module Documentation](#60-module-documentation)
7.0 [Component Catalog](#70-component-catalog)
8.0 [Development Guidelines](#80-development-guidelines)

---

## 1.0 Architecture Overview

### 1.1 Application Type
FTrack is an **Electron-based desktop application** for scenario-based financial planning and forecasting. It uses a **scenario-centric architecture** where all accounts, transactions, and projections are organized within independent scenarios.

**Key Architectural Principles**:
- **Scenario Isolation**: Each scenario maintains independent accounts, transactions, and projections
- **Conditional Visibility**: UI fields shown/hidden based on scenario type and user selections  
- **Schema-Driven UI**: Grid structures defined in JSON schemas with dynamic rendering
- **Single Page Application**: All functionality consolidated in forecast page
- **Data Layer Separation**: EditableGrid (UI) → DataManager (persistence)

### 1.2 Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Runtime** | Electron | 37.2.1 |
| **Language** | JavaScript (ES6 Modules) | ES2015+ |
| **Styling** | CSS3 (Custom design system) | - |
| **Icons** | SVG (inline) | - |
| **Data Format** | JSON | - |

### 1.3 File Structure

```
ftrack/
├── main.js                 # Electron main process entry point
├── preload.js              # Preload script (minimal, reserved for future)
├── package.json            # Project configuration
├── pages/                  # HTML page templates
│   ├── home.html          # Landing page
│   └── forecast.html      # Main application page (scenarios, accounts, transactions)
├── js/                    # JavaScript modules
│   ├── forecast.js        # Forecast page controller (main application logic)
│   ├── data-manager.js    # Scenario-centric CRUD operations
│   ├── projection-engine.js # Financial projection generation
│   ├── calculation-utils.js # Recurrence and periodic change calculations
│   ├── editable-grid.js   # Core grid component with conditional visibility
│   ├── modal.js           # Modal dialog component
│   ├── config.js          # Global config (selected scenario, shortcuts)
│   ├── global-app.js      # Global helper functions
│   └── navbar.js          # Navigation bar component
├── styles/                # CSS styling
│   ├── app.css            # Main application styles
│   └── icons.js           # SVG icon definitions
└── assets/                # Data and configuration files
    ├── app-data.json                  # Application data (scenario-centric)
    ├── scenario-types.json            # Scenario type definitions
    ├── accounts-grid-unified.json     # Account grid schema
    ├── planned-transactions-grid.json # Planned transaction schema
    ├── actual-transactions-grid.json  # Actual transaction schema
    ├── projections-grid.json          # Projection results schema
    ├── scenario-grid.json             # Scenario management schema
    └── shortcuts.json                 # Keyboard shortcut definitions
```

### 1.4 Page Architecture

**Scenario-Centric Single Page Application**:

1. **home.html**: Landing page with navigation
2. **forecast.html**: Complete application functionality
   - Scenario selector (dropdown)
   - Accounts grid (conditional fields based on scenario type)
   - Planned Transactions grid (with recurrence and periodic change modals)
   - Actual Transactions grid (Budget scenarios only)
   - Projections grid (General/Funds scenarios only)
   - Generate Projections button

Each page follows a consistent pattern:
- **HTML Template**: Minimal structure with navbar and content containers
- **JavaScript Module**: Schema-driven grid rendering with conditional visibility
- **Data Operations**: All CRUD through data-manager.js
- **Event-Driven Updates**: Re-render on scenario change or data mutation

---

## 2.0 Design Standards

### 2.1 Visual Design System

#### 2.1.1 Color Palette

The application uses a **dark theme** with high-contrast accent colors:

| Token | Hex Code | Usage |
|-------|----------|-------|
| `bg-main` | `#181a1b` - `#232a23` (gradient) | Primary background |
| `text-main` | `#ededed` | Primary text color |
| `accent-primary` | `#b6ff00` | Interactive elements, highlights |
| `surface-secondary` | `#232a23` | Secondary backgrounds, borders |
| `surface-hover` | `#202223` | Hover states for table headers |
| `border-default` | `#232a23` | Default border color |

#### 2.1.2 Typography

- **Font Family**: `'Inter', 'Segoe UI', Arial, sans-serif`
- **Base Font Size**: 18px (1rem)
- **Headings**: 
  - H2: 1.22em (headers), 1.18em (modals)
  - Bold weight (700) for table headers
  - Font weight 600 for modal headers
- **Body Text**: 1.08em for inputs, table cells
- **Navigation**: 1.04em with 500 font weight

#### 2.1.3 Spacing & Layout

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

#### 2.1.4 Interactive Elements

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

#### 2.1.5 Component Patterns

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

## 3.0 Coding Standards

### 3.1 JavaScript Standards

#### 3.1.1 Module System
- **Type**: ES6 Modules (`type="module"` in HTML)
- **Import/Export**: Named exports preferred
```javascript
export class EditableGrid { ... }
export function loadGlobals() { ... }
```

#### 3.1.2 Code Organization

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

#### 3.1.3 Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| **Classes** | PascalCase | `EditableGrid`, `Modal` |
| **Functions** | camelCase | `loadGlobals()`, `buildGridContainer()` |
| **Variables** | camelCase | `workingData`, `tableElement` |
| **Constants** | UPPER_SNAKE_CASE | `ICON_EDIT`, `ICON_DELETE` |
| **Private State** | Underscore prefix | `_shortcutsLoaded`, `_tagFocus` |
| **HTML IDs** | kebab-case | `main-navbar`, `panel-accounts` |
| **CSS Classes** | kebab-case | `bg-main`, `accordion-header` |

#### 3.1.4 Async/Await Pattern
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

#### 3.1.5 Error Handling
- Use try-catch blocks for all async operations
- Log errors with descriptive context: `console.error('Failed to save accounts data:', err)`
- Provide fallback behavior when possible

#### 3.1.6 Data Manipulation

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

#### 3.1.7 DOM Manipulation

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

#### 3.1.8 Event Listeners

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

#### 3.1.9 Console Logging

**Debug Logging**:
```javascript
console.log('[EditableGrid] createTableRows workingData:', this.workingData);
console.warn('[EditableGrid] WARNING: Field not found', acc);
```

**Prefix Pattern**: Use `[ClassName/ModuleName]` prefix for debug messages

---

## 4.0 Library & Framework Usage

### 4.1 Core Dependencies

#### 4.1.1 Electron
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

#### 4.1.2 Node.js Built-in Modules

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

### 4.2 Icon System

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

### 4.3 No External UI Libraries

**Important**: This application does NOT use:
- React, Vue, Angular, or any framework
- Bootstrap, Tailwind, or CSS frameworks
- jQuery or utility libraries
- Chart libraries (no data visualization in completed features)

**Design Philosophy**: Vanilla JavaScript with custom components for full control and minimal dependencies.

---

## 5.0 Asset Structure & Data Models

### 5.1 Overview

All application data and configuration is stored in the `/assets` directory as JSON files. The system uses a **scenario-centric schema-driven architecture** where all accounts, transactions, and projections are nested within scenarios.

### 5.2 Asset Files

#### 5.2.1 app-data.json

**Purpose**: Central data store for all scenarios and their nested data

**Structure**:
```json
{
  "profile": "string",
  "scenarios": [
    {
      "id": number,
      "name": string,
      "type": { "id": number, "name": string },
      "description": string,
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "projectionPeriod": { "id": number, "name": string },
      "accounts": [],
      "plannedTransactions": [],
      "actualTransactions": [],
      "projections": [],
      "accountOverrides": [],
      "transactionOverrides": [],
      "createdDate": "YYYY-MM-DD",
      "lastCalculated": "YYYY-MM-DD" | null,
      "tags": []
    }
  ]
}
```

**Scenario Types** (from scenario-types.json):
- **Budget**: Budget tracking with actual vs planned comparison
- **General**: General financial planning with projections  
- **Funds**: Investment funds tracking with growth calculations

**Account Object** (within scenario.accounts):
```json
{
  "id": number,
  "name": string,
  "type": { "id": number, "name": string },      // Asset|Liability|Equity
  "currency": { "id": number, "name": string },  // ZAR|USD|EUR|GBP|JPY|AUD|CAD
  "balance": number,
  "openDate": "YYYY-MM-DD",
  "periodicChange": {                            // Interest/growth (optional)
    "changeMode": { "id": number, "name": string },    // Percentage Rate|Fixed Amount
    "changeType": { "id": number, "name": string },    // See Periodic Change Types below
    "value": number,                             // Rate % or fixed amount
    "period": { "id": number, "name": string },  // For Fixed Amount mode
    "ratePeriod": { "id": number, "name": string },    // For Custom Percentage
    "frequency": { "id": number, "name": string }      // For Custom Percentage
  } | null
}
```

**Periodic Change Types**:
1. Nominal Annual (No Compounding) - Simple interest
2. Nominal Annual, Compounded Monthly
3. Nominal Annual, Compounded Daily
4. Nominal Annual, Compounded Quarterly
5. Nominal Annual, Compounded Annually
6. Nominal Annual, Continuous Compounding
7. Custom - User-defined rate period and compounding frequency

**Planned Transaction Object** (within scenario.plannedTransactions):
```json
{
  "id": number,
  "transactionType": { "id": number, "name": string },  // Debit|Credit (UI only)
  "secondaryAccount": { "id": number, "name": string }, // UI field
  "debitAccount": { "id": number, "name": string },     // Stored field
  "creditAccount": { "id": number, "name": string },    // Stored field
  "amount": number,
  "description": string,
  "recurrence": {
    "recurrenceType": { "id": number, "name": string }, // See Recurrence Types below
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD" | null,
    "interval": number,              // For Daily, Weekly
    "dayOfWeek": { "id": number, "name": string },      // For Weekly
    "dayOfMonth": number,            // For Monthly - Day of Month
    "weekOfMonth": { "id": number, "name": string },    // For Monthly - Week of Month
    "dayOfWeekInMonth": { "id": number, "name": string }, // For Monthly - Week of Month
    "dayOfQuarter": number,          // For Quarterly
    "month": { "id": number, "name": string },          // For Yearly
    "dayOfYear": number,             // For Yearly
    "customDates": string            // Comma-separated dates
  } | null,
  "periodicChange": {                // Amount change over time (optional)
    "changeMode": { "id": number, "name": string },
    "changeType": { "id": number, "name": string },
    "value": number,
    "period": { "id": number, "name": string },
    "ratePeriod": { "id": number, "name": string },
    "frequency": { "id": number, "name": string }
  } | null,
  "tags": []
}
```

**Recurrence Types**:
1. One Time - Single occurrence
2. Daily - Every N days
3. Weekly - Specific day of week
4. Monthly - Day of Month (1-31 or -1 for last)
5. Monthly - Week of Month (e.g., 2nd Monday)
6. Quarterly - Day of quarter (1-92)
7. Yearly - Specific month and day
8. Custom Dates - Comma-separated dates

**Actual Transaction Object** (within scenario.actualTransactions, Budget scenarios only):
```json
{
  "id": number,
  "date": "YYYY-MM-DD",
  "debitAccount": { "id": number, "name": string },
  "creditAccount": { "id": number, "name": string },
  "amount": number,
  "description": string,
  "status": { "id": number, "name": string },  // Pending|Completed|Cancelled
  "tags": []
}
```

**Projection Object** (within scenario.projections, General/Funds scenarios only):
```json
{
  "id": number,
  "scenarioId": number,
  "accountId": number,
  "account": string,
  "date": "YYYY-MM-DD",
  "balance": number,
  "income": number,
  "expenses": number,
  "netChange": number,
  "period": number
}
```

#### 2. scenario-types.json

**Purpose**: Defines scenario types and their column visibility rules

**Structure**:
```json
{
  "scenarioTypes": [
    {
      "id": number,
      "name": string,
      "description": string,
      "columnConfigurations": {
        "accounts": { "visible": [], "hidden": [] },
        "plannedTransactions": { "visible": [], "hidden": [] },
        "actualTransactions": { "visible": [], "hidden": [] },
        "projections": { "visible": [], "hidden": [] }
      }
    }
  ]
}
```

#### 3. Grid Schema Files

**Purpose**: Define table structure and conditional visibility for each grid

**Files**:
- `accounts-grid-unified.json` - Account grid with periodicChange modal
- `planned-transactions-grid.json` - Planned transactions with recurrence and periodicChange modals
- `actual-transactions-grid.json` - Actual transactions for Budget scenarios
- `projections-grid.json` - Projection results display
- `scenario-grid.json` - Scenario management

**Schema Structure**:
```json
{
  "mainGrid": {
    "actions": {
      "add": boolean,
      "edit": boolean,
      "delete": boolean,
      "save": boolean,
      "showSelector": boolean      // Show radio button for row selection
    },
    "columns": []
  },
  "periodicChangeModal": {         // Modal schema for nested editing
    "title": string,
    "actions": { "add": boolean, "edit": boolean, "delete": boolean, "save": boolean },
    "columns": []
  },
  "recurrenceModal": { ... },      // Recurrence configuration modal
  "changeModes": [],               // Lookup lists
  "periodicChangeTypes": [],
  "recurrenceTypes": [],
  "daysOfWeek": [],
  "weeksOfMonth": [],
  "months": [],
  "frequencies": [],
  "ratePeriods": []
}
```

**Column Definition Schema**:
```json
{
  "field": string,
  "header": string,
  "type": string,                  // text|number|select|addSelect|modal|tags|checkbox|exclusive|date
  "editable": boolean,
  "required": boolean,             // For validation
  "display": boolean,              // Show/hide column
  "default": any,
  "visibleWhen": string | null,    // Conditional visibility expression
  "optionsSource": string,         // Reference to lookup list
  "modalIcon": string,             // Icon key for modal trigger
  "modalIconTitle": string
}
```

**visibleWhen Expression Examples**:
```
"scenario.type.name == 'Budget'"
"scenario.type.name IN ['General', 'Funds']"
"changeMode.name == 'Percentage Rate'"
"recurrenceType.name == 'Weekly'"
"changeType.name == 'Custom'"
```

**Column Types**:

| Type | Description | Render Output | Use Case |
|------|-------------|---------------|----------|
| `text` | Text input | `<input type="text">` | Names, descriptions |
| `number` | Numeric input | `<input type="number">` | Amounts, balances |
| `date` | Date picker | `<input type="date">` with clear button | Dates |
| `select` | Dropdown | `<select><option>...` | Fixed options |
| `addSelect` | Quick-add dropdown | `<input list="datalist">` | Accounts (create on-the-fly) |
| `modal` | Modal trigger | Icon button | Nested data (recurrence, periodicChange) |
| `tags` | Tag collection | Tag pills + input | Categorization |
| `checkbox` | Boolean toggle | Checkbox input | Click to toggle |
| `exclusive` | Exclusive boolean | Checkbox input | Only one can be true |
| `date` | Date picker | `<input type="date">` | Native date picker |

#### 5.2.2 planned-transactions-grid.json

**Purpose**: Schema for planned transactions grid with recurrence and periodic change modals

**Unique Features**:
- Conditional visibility: `visibleWhen` expressions control field display
- Nested modals: `recurrenceModal`, `periodicChangeModal`
- Quick-add accounts: `addSelect` type creates accounts on-the-fly
- 8 recurrence types with specific field requirements

**Conditional Visibility Examples**:
```javascript
// In planned-transactions-grid.json
{
  "field": "interval",
  "visibleWhen": "recurrenceType.name IN ['Daily', 'Weekly']"
},
{
  "field": "dayOfWeek",
  "visibleWhen": "recurrenceType.name == 'Weekly'"
},
{
  "field": "value",
  "header": "Rate (%)",
  "visibleWhen": "changeMode.name == 'Percentage Rate'"
}
```

#### 5.2.3 shortcuts.json

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

### 5.3 Data Flow Patterns

#### 5.3.1 Read Pattern
1. Page loads → JavaScript module initializes
2. Read schema from `/assets/[entity]-grid.json`
3. Read data from `/assets/app-data.json`
4. Combine schema + data → Initialize `EditableGrid`
5. Render grid

#### 5.3.2 Write Pattern
1. User edits row → EditableGrid captures changes
2. User clicks Save → `handleSave()` extracts values
3. Update `workingData` array
4. Call `onSave(updatedData)` callback
5. Page controller receives updated data
6. Read entire `app-data.json` file
7. Update relevant array (e.g., `accounts`, `transactions`)
8. Write complete `app-data.json` back to disk

#### 5.3.3 Quick-Add Account Pattern (Transactions)
1. User types new account name in `addSelect` input
2. On save, detect `{ id: null, name: "NewAccount" }`
3. Load `accounts-grid.json` schema for defaults
4. Generate new account ID (max ID + 1)
5. Create account with schema defaults
6. Add to `accounts` array
7. Update transaction with new account ID
8. Save both `accounts` and `transactions`

### 5.4 Schema Extension Points

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

## 6.0 Module Documentation

### 6.1 global-app.js

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

### 6.2 navbar.js

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
  <a href="forecast.html" id="nav-forecast">Forecast</a>
`;
```

**Active Highlighting**: Adds `active` class to current page link (adds bottom border)

### 6.3 editable-grid.js

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

#### `syncHeaderVisibility(tableBody, tableHeader)`
Synchronizes header visibility with cell visibility

**Purpose**: Hides/shows columns based on conditional visibility rules

**Process**:
1. For each column in schema
2. Check if any cell in that column is visible
3. If all cells hidden, hide header
4. If any cell visible, show header
5. Update header text if dynamic (e.g., "Rate (%)" vs "Amount")

**Dynamic Header Text**:
```javascript
if (col.header === 'Rate (%)' && changeMode === 'Fixed Amount') {
  header.textContent = 'Amount';
} else if (col.header === 'Amount' && changeMode === 'Percentage Rate') {
  header.textContent = 'Rate (%)';
}
```

#### `evaluateVisibleWhen(expression, rowData)`
Evaluates conditional visibility expressions

**Expression Syntax**:
- `field.name == 'Value'`: Equality check
- `field.name IN ['Value1', 'Value2']`: Set membership
- `field.name != 'Value'`: Inequality
- References are direct field names in modal context

**Examples**:
```javascript
"recurrenceType.name == 'Weekly'"
"changeMode.name == 'Percentage Rate'"
"recurrenceType.name IN ['Daily', 'Weekly']"
```

**Evaluation**:
1. Parse expression (field, operator, value)
2. Get field value from rowData
3. Apply operator logic
4. Return boolean

**Usage**: Called during cell rendering to determine `display: none` style
- Store referenced options array in `this.selectOptions[field]`
- Also process modal/sub-grid columns

### 6.4 modal.js

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

### 6.5 config.js

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

### 6.6 data-manager.js

**Purpose**: Central CRUD operations for scenario-scoped data persistence

**Exports**:
- `getScenario(scenarioId)`: Load scenario by ID
- `getAllScenarios()`: Load all scenarios
- `saveScenario(scenario)`: Save/update scenario
- `deleteScenario(scenarioId)`: Remove scenario
- `saveAccounts(scenarioId, accounts)`: Update accounts in scenario
- `savePlannedTransactions(scenarioId, transactions)`: Update planned transactions
- `saveActualTransactions(scenarioId, transactions)`: Update actual transactions
- `saveProjections(scenarioId, projections)`: Update projections
- `deleteAccount(scenarioId, accountId)`: Delete account with cascade
- `deletePlannedTransaction(scenarioId, txId)`: Delete planned transaction
- `deleteActualTransaction(scenarioId, txId)`: Delete actual transaction
- `ensureFileExists()`: Create app-data.json if missing

**ID Assignment**:
All save functions assign IDs to new records:
```javascript
const maxId = scenario.accounts.reduce((max, a) => Math.max(max, a.id || 0), 0);
newRecord.id = maxId + 1;
```

**Cascade Delete**:
`deleteAccount()` removes all plannedTransactions referencing the account:
```javascript
scenario.plannedTransactions = scenario.plannedTransactions.filter(tx => 
  !(tx.debitAccount && tx.debitAccount.id === accountId) &&
  !(tx.creditAccount && tx.creditAccount.id === accountId)
);
```

### 6.7 projection-engine.js

**Purpose**: Calculate projections from accounts and planned transactions

**Exports**:
- `generateProjections(scenario)`: Generate projection records

**Logic**:
1. Parse scenario date range (startDate to endDate)
2. Expand recurrences into actual transaction dates
3. Apply periodic changes (interest, amount growth)
4. Calculate daily balances for each account
5. Aggregate into projection period records
6. Return projection array

**Projection Period**:
- Daily: One record per day
- Monthly: One record per month (end-of-month snapshot)
- Quarterly: One record per quarter
- Yearly: One record per year

### 6.8 calculation-utils.js

**Purpose**: Financial calculation utilities

**Exports**:
- `calculateBalance(account, date)`: Calculate account balance at date
- `calculateInterest(balance, periodicChange, startDate, endDate)`: Calculate interest
- `calculatePeriodicChange(value, periodicChange, periods)`: Apply growth/change
- `expandRecurrence(recurrence, startDate, endDate)`: Generate dates from recurrence
- `applyPeriodicChange(amount, periodicChange, date)`: Calculate amount at date

**Change Types**:
1. **Nominal Annual (No Compounding)**: Simple interest
2. **Nominal Annual, Compounded [Period]**: Compound interest
3. **Continuous Compounding**: e^(rt)
4. **Custom**: User-defined rate period and frequency

### 6.9 forecast.js

**Purpose**: Main forecast page controller (scenario-centric application)

**Pattern**: ES6 Module, scenario-scoped data operations

**Key Functions**:

#### `loadSelectedScenario()`
Loads scenario data based on selected scenario ID from config.js

**Process**:
1. `const scenarioId = getSelectedScenarioId()`
2. `const scenario = await dataManager.getScenario(scenarioId)`
3. `loadScenarioType(scenario.type.name)`
4. `renderAllGrids(scenario)`

#### `renderAllGrids(scenario)`
Renders all grids: scenarios, accounts, planned transactions, actual transactions, projections

**Process**:
1. Load schema for each grid
2. Apply scenario type visibility rules
3. Transform data for UI (e.g., debitAccount/creditAccount → transactionType/secondaryAccount)
4. Instantiate EditableGrid for each section
5. Render grids

#### `transformPlannedTxForBackend(tx, selectedAccountId)`
Converts UI fields to storage fields

**Transformation**:
```javascript
{
  transactionType: { id, name: 'Debit'|'Credit' },  // UI field
  secondaryAccount: { id, name },                   // UI field
} 
→
{
  debitAccount: { id, name },     // Storage field
  creditAccount: { id, name }     // Storage field
}
```

#### `onSaveAccounts(accounts, rowId, field)`
Persists account changes

**Process**:
1. Get selected scenario ID
2. Handle quick-add: create new accounts if `id === null`
3. Call `dataManager.saveAccounts(scenarioId, accounts)`
4. Reload scenario
5. Re-render grids

#### `onSavePlannedTransactions(transactions, rowId, field)`
Persists planned transaction changes

**Process**:
1. Transform UI data to backend format
2. Handle quick-add accounts
3. Call `dataManager.savePlannedTransactions(scenarioId, transactions)`
4. Reload scenario
5. Re-render grids

#### `onDeleteAccount(rowId, accountId)`
Deletes account with cascade

**Process**:
1. Get selected scenario ID
2. Call `dataManager.deleteAccount(scenarioId, accountId)`
3. Reload scenario
4. Re-render grids

**Cascade**: DataManager removes all transactions referencing account

#### `calculateProjections()`
Triggers projection generation

**Process**:
1. Get selected scenario
2. Call `projectionEngine.generateProjections(scenario)`
3. Call `dataManager.saveProjections(scenarioId, projections)`
4. Update scenario.lastCalculated
5. Re-render grids

---

## 7.0 Component Catalog

### 7.1 Button Component

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

### 7.2 Accordion Component

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

### 7.3 Tag Input Component

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

### 7.4 Checkbox Component

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

### 7.5 Date Picker Component

**HTML**:
```html
<div class="date-input-wrapper">
  <input type="date" class="date-input">
  <button class="date-clear-btn">×</button>  <!-- If not required -->
</div>
```

**Behavior**:
- Required dates: Default to today if empty
- Optional dates: Remain empty, can be cleared with × button
- Native browser date picker
- Format: YYYY-MM-DD

**Clear Button**:
- Only shown for non-required dates
- Click → clears date value
- Sets row to unsaved state
- Button: 24x24px, hover color `#b6ff00`

**Styling**:
- Custom calendar icon color: sepia filter for theme consistency
- Focus: `#b6ff00` border and glow
- Wrapper: inline-flex with 4px gap

### 7.6 Select/Dropdown Component

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

## 8.0 Development Guidelines

### 8.1 Adding a New Grid to Forecast Page

1. **Create schema file** in `/assets/[name]-grid.json`:
   ```json
   {
     "mainGrid": {
       "actions": { "add": true, "edit": true, "delete": true, "save": true },
       "columns": [...]
     }
   }
   ```

2. **Add grid section** to forecast.js:
   ```javascript
   async function renderMyGrid(scenario) {
     const schema = await loadSchema('my-grid.json');
     const grid = new EditableGrid({
       targetElement: document.getElementById('myGridTable'),
       tableHeader: 'My Grid',
       schema,
       data: scenario.myData,
       onSave: onSaveMyData,
       onDelete: onDeleteMyData
     });
     grid.render();
   }
   ```

3. **Add save function**:
   ```javascript
   async function onSaveMyData(data, rowId, field) {
     const scenarioId = getSelectedScenarioId();
     await dataManager.saveMyData(scenarioId, data);
     await loadSelectedScenario();
   }
   ```

4. **Add DataManager function** in data-manager.js:
   ```javascript
   export async function saveMyData(scenarioId, data) {
     const appData = await readAppData();
     const scenario = appData.scenarios.find(s => s.id === scenarioId);
     
     // Assign IDs to new records
     data.forEach(item => {
       if (!item.id) {
         const maxId = scenario.myData.reduce((max, d) => Math.max(max, d.id || 0), 0);
         item.id = maxId + 1;
       }
     });
     
     scenario.myData = data;
     await writeAppData(appData);
   }
   ```

### 8.2 Adding a New Column Type to EditableGrid

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

### 8.3 Adding a New Data Entity to Scenarios

1. **Update scenario structure** in app-data.json:
   ```json
   {
     "scenarios": [
       {
         "id": 1,
         "myEntities": []  // Add new array
       }
     ]
   }
   ```

2. **Create schema JSON** in `/assets/my-entities-grid.json`

3. **Add grid to forecast.js**:
   - Add render function
   - Add save function
   - Add to renderAllGrids()

4. **Add DataManager functions** in data-manager.js:
   - `saveMyEntities(scenarioId, entities)`
   - `deleteMyEntity(scenarioId, entityId)`

### 8.4 Debugging Tips

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

### 8.5 Performance Considerations

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

### 8.6 Security Considerations

**Current Configuration**:
- `nodeIntegration: true` (enables Node.js APIs)
- `contextIsolation: false` (no isolation between renderer and Node.js)
- Direct file system access via `window.require('fs')`

---

## 9.0 Appendix: Quick Reference

### 9.1 CSS Class Reference

| Class | Purpose |
|-------|---------|
| `bg-main` | Primary background gradient |
| `text-main` | Primary text color (#ededed) |
| `btn` | Icon button (44x44px) |
| `table` | Data table styling |
| `bordered` | 2.5px border (#232a23) |
| `rounded` | 12px border radius |
| `shadow-lg` | Large box shadow (0 8px 40px rgba(0,0,0,0.18)) |
| `shadow-md` | Medium box shadow (0 4px 16px rgba(0,0,0,0.12)) |
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
| `date-input-wrapper` | Date input with clear button wrapper |
| `date-clear-btn` | Clear date button (×) |
| `add-select-input` | Quick-add dropdown input |

### 9.2 File Path Reference

| Path | Purpose |
|------|---------|
| `process.cwd() + '/assets/app-data.json'` | Scenario-scoped data store |
| `process.cwd() + '/assets/accounts-grid-unified.json'` | Accounts schema |
| `process.cwd() + '/assets/planned-transactions-grid.json'` | Planned transactions schema |
| `process.cwd() + '/assets/actual-transactions-grid.json'` | Actual transactions schema |
| `process.cwd() + '/assets/projections-grid.json'` | Projections display schema |
| `process.cwd() + '/assets/scenario-grid.json'` | Scenario management schema |
| `process.cwd() + '/assets/scenario-types.json'` | Scenario type definitions |
| `process.cwd() + '/assets/shortcuts.json'` | Keyboard shortcuts |
| `../styles/app.css` | Main stylesheet |
| `../styles/icons.js` | SVG icon definitions |
| `../js/editable-grid.js` | Core grid component |
| `../js/modal.js` | Modal component |
| `../js/global-app.js` | Global helpers |
| `../js/navbar.js` | Navigation bar |
| `../js/config.js` | Selected scenario management |
| `../js/data-manager.js` | Scenario-scoped CRUD operations |
| `../js/projection-engine.js` | Projection calculations |
| `../js/calculation-utils.js` | Financial formulas |
| `../js/forecast.js` | Main forecast page controller |

### 9.3 Column Type Reference

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
| `date` | `<input type="date">` with clear button | Date selection |

---

**End of Technical Documentation**

For questions or clarifications, review the source code in conjunction with this documentation. All file paths are relative to the project root (`/Users/jay/GIT-Repos-Personal/ftrack`).

For architectural decisions and design rationale, see `ALPHA_ARCHITECTURE_REDESIGN.md`.

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
