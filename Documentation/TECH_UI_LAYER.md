# UI Layer & Components

## 1.0 Technology Stack
- **Framework**: Vanilla JavaScript (ES6+ Modules).
- **Grid System**: Tabulator v6.3.0.
- **Styling**: CSS Variables, stored in `styles/app.css`.

## 2.0 Component Architecture

### 2.1 The Grid Factory (`js/grid-factory.js`)
To maintain consistency, all Tabulator instances are created via `GridFactory`.
- **Purpose**: Centralizes theme, default options, and instantiation.
- **Usage**:
```javascript
import { GridFactory } from './grid-factory.js';
const grid = GridFactory.createGrid('#elementId', options);
```

### 2.2 Main View Controller (`js/forecast.js`)
This is the heart of the "Forecast" page. It orchestrates the interaction between three main grids.

#### A. Scenario Grid
- **Type**: Single Select (Radio).
- **Behavior**: Only one scenario can be active.
- **Selection Event**: Triggers reload of Transaction Grid filtered by `scenarioId`.
- **Column Def**: Uses custom `formatter: "tickCross"` or generic radio input for selection state.

#### B. Account Grid
- **Type**: Single Select (Radio).
- **Behavior**: Filters the view to a specific account.
- **Selection Event**: Triggers reload of Transaction Grid filtered by `accountId`.

#### C. Transaction Grid
- **Type**: Multi-row, Editable.
- **Behavior**: Displays transactions matching the *Active Scenario* AND *Active Account*.
- **Features**:
  - Cell Editing: Calls `TransactionManager.updateTransaction`.
  - Sorting: Date descending by default.

## 3.0 Interactive Patterns

### 3.1 Radio Selection Logic
Unlike standard Tabulator row selection, Scenarios and Accounts enforce a "Radio" behavior.
- **Implementation**:
  - `selectable: 1` in Tabulator config ensures only one row logic is active.
  - `rowSelectionChanged` callback handles capturing the selected ID (e.g., `selectedScenarioId`).

### 3.2 Dynamic Re-rendering
1. User clicks "Radio" on Scenario Grid.
2. `forecast.js` captures `rowSelectionChanged`.
3. `TransactionManager` is queried for items matching new IDs.
4. Transaction Grid `setData()` is called with new payload.
