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
This is the heart of the "Forecast" page. It orchestrates the interaction between five main sections.

#### A. Scenario Grid
- **Type**: Single Select.
- **Behavior**: Only one scenario can be active.
- **Selection Event**: Triggers reload of all downstream grids filtered by `scenarioId`.

#### B. Account Grid
- **Type**: Single Select.
- **Behavior**: Filters the view to a specific account.
- **Selection Event**: Triggers reload of Transaction, Budget, and Projection grids filtered by `accountId`.

#### C. Transaction Grid
- **Type**: Multi-row, Editable.
- **Behavior**: Displays transactions matching the Active Scenario AND Active Account.
- **Features**:
  - Cell Editing: Calls `TransactionManager.saveAll`.
  - Status tracking: Planned vs Actual transactions.
  - Recurrence configuration via modal.

#### D. Budget Grid
- **Type**: Multi-row, Editable.
- **Behavior**: Displays budget occurrences (snapshot of projections) with actual tracking.
- **Features**:
  - **Creation**: "Save as Budget" button in Projections section creates budget from current projections.
  - **Editing**: Budget occurrences can be edited (amount, date, description, accounts).
  - **Actuals Tracking**: Each occurrence can have plannedAmount and actualAmount.
  - **Projection Source**: "Project from Budget" button generates new projections using budget.
  - Cell Editing: Calls `BudgetManager.saveAll`.

#### E. Projection Grid
- **Type**: Read-only display.
- **Behavior**: Shows calculated financial projections by period.
- **Features**:
  - **Generation Sources**:
    - "Generate Projections": Uses transactions as source (regenerate from original data).
    - "Project from Budget": Uses budget occurrences as source (continue from budget).
  - **Save as Budget**: Creates editable budget snapshot from projections.

## 3.0 Interactive Patterns

### 3.1 Single Selection Logic
Scenarios and Accounts enforce single selection behavior.
- **Implementation**:
  - `selectable: 1` in Tabulator config ensures only one row is selected.
  - `rowSelectionChanged` callback captures the selected ID.

### 3.2 Dynamic Re-rendering
1. User selects a Scenario.
2. `forecast.js` captures `rowSelectionChanged`.
3. All grids (Accounts, Transactions, Budget, Projections) reload with scenario data.
4. User selects an Account.
5. Transaction, Budget, and Projection grids filter to show only that account's data.

### 3.3 Budget Workflow
1. **Create Budget**: User generates projections from transactions, then clicks "Save as Budget".
2. **Edit Budget**: Budget grid allows editing amounts, dates, descriptions, and tracking actuals.
3. **Project from Budget**: User clicks "Project from Budget" to generate new projections using budget as source.
4. **Regenerate from Source**: User clicks "Generate Projections" to bypass budget and use original transactions.

This pattern allows iterative planning: save projection → edit budget → reproject → refine budget.
