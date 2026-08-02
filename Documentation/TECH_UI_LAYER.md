# UI Layer & Components

## 1.0 Technology Stack
- **Framework**: Vanilla JavaScript (ES6+ Modules).
- **Grid System**: Tabulator v6.3.0.
- **Styling**: CSS Variables, stored in `styles/app.css`.

## 1.1 Theme Tokens
- **Source of Truth**: Theme tokens live in `:root` within `styles/app.css`.
- **Overrides**: Light theme overrides are applied via `html[data-theme="light"]`.
- **Usage**: UI components must use variables (no hard-coded colors) so both themes inherit correctly.

## 1.2 Theme Switching
- **Toggle Location**: Navbar toggle button.
- **Storage**: `localStorage` key `ftrack:theme`.
- **Runtime Apply**: `document.documentElement` gets a `data-theme` attribute (`light` or `dark`).

## 2.0 Component Architecture

### 2.1 The Grid Factory (`js/ui/components/grids/grid-factory.js`)
To maintain consistency, all Tabulator instances are created via `GridFactory`.
- **Purpose**: Centralizes theme, default options, and instantiation.
- **Usage**:
```javascript
import { GridFactory } from './ui/components/grids/grid-factory.js';
const grid = GridFactory.createGrid('#elementId', options);
```

### 2.2 Main View Controller (`js/ui/controllers/forecast-controller.js`)
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
  - Cell Editing: Calls `TransactionManager.saveAll()` via application layer.
  - Status tracking: Planned vs Actual transactions.
  - Recurrence configuration via modal.
  - New Transaction Defaults: Uses the active account filter as the primary account (fallback: first account) and sets `effectiveDate` to the selected period start or scenario start date.

#### D. Budget Grid
- **Type**: Multi-row, Editable.
- **Behavior**: Compatibility UI for stored dated occurrence overrides and actual tracking.
- **Features**:
  - **Creation**: **Generate from Expanded Transactions** expands resolved rule occurrences over the Budget window.
  - **Editing**: Budget occurrences can be edited (amount, date, description, accounts).
  - **Actuals Tracking**: Each occurrence can retain baseline, current planned amount, actual amount/date, status, and stable identity.
  - **Override Intent**: When the plan is resolved, untouched generated snapshots inherit later source-rule changes; edited rows remain occurrence overrides.
  - Cell Editing: Calls `BudgetManager.saveAll()` via application layer.
  - This card remains transitional until the approved live **Plan & Actuals** period view replaces Budget generation.

#### E. Projection Grid
- **Type**: Read-only display.
- **Behavior**: Shows calculated financial projections by period.
- **Features**:
  - **Generation Input**: Always uses canonical resolved occurrences: actuals, current plan, future rule occurrences, manual entries, and skips.
  - Legacy `projection.config.source` values remain readable but do not select a calculation path.
  - **Toolbar**: Account filter, period view controls, and inline totals (Income, Expenses, Net).

#### F. Summary Cards
- **Type**: Read-only summary cards.
- **Behavior**: A scenario-gated summary section shown near the top of the Forecast view.

Debt Repayment summary cards.

- **Type**: Read-only summary cards (per-account).
- **Behavior**: Displays debt-specific metrics based on account data and projections.
- **Display Rules**:
  - Uses `startingBalance` as the source for the Starting Balance value.
  - Overall Total card only renders when there are 2+ accounts.
  - Values use the standard app font (no monospace overrides).
  - Interest Earned derives from positive interest deltas and displays in green.
  - Interest Paid derives from negative interest deltas and displays as negative values in red.
  - Zero Date shows when account balance crosses from negative to positive (debt payoff), or 'N/A' if never crosses.
  - Summary cards group by account type and can be filtered to Assets or Liabilities.

General scenario summary cards.

- **Type**: Single overall total card.
- **Behavior**: Displays Money In, Money Out, and Net using the same conventions as transaction totals.

Funds scenario summary cards.

- **Type**: Totals card plus a small detail grid.
- **Behavior**: Displays NAV, total shares, share price, and scoped Money In, Money Out, Net.
- **NAV**: Assets minus Liabilities.
- **Shares**: User enters Total shares. Investor shares and ownership derive from net contributions.
- **Scope Selector**: All, Asset, Liability, Equity, Income, Expense.
- **Equity Detail**: Investor breakdown with shares, ownership percent, and implied value.

#### G. Generate Plan

- **Type**: Scenario-gated configuration section.
- **Behavior**: Renders a Goal-Based planner for account goals, or an Advanced Goal Solver planner for multi-goal planning with constraints.

## 3.0 Interactive Patterns

### 3.1 Single Selection Logic
Scenarios and Accounts enforce single selection behavior.
- **Implementation**:
  - `selectable: 1` in Tabulator config ensures only one row is selected.
  - `rowSelectionChanged` callback captures the selected ID.

### 3.2 Dynamic Re-rendering
1. User selects a Scenario.
2. `forecast-controller.js` captures `rowSelectionChanged`.
3. All grids (Accounts, Transactions, Budget, Projections) reload with scenario data.
4. User selects an Account.
5. Transaction, Budget, and Projection grids filter to show only that account's data.

### 3.3 Budget Workflow
1. **Define Rules**: User creates recurring and one-time transaction rules.
2. **Materialize Compatibility Rows**: The current Budget card can regenerate dated rows over its independent Budget window.
3. **Edit Occurrences**: Amounts, dates, descriptions, status, and actuals can be changed per occurrence.
4. **Recalculate**: Generate Projections resolves rules together with occurrence edits, actuals, skips, and manual entries.

This is the schemaVersion 43 compatibility workflow. The approved next UI phase removes the materialization step and presents Period and Recurring modes in one **Plan & Actuals** card.

### 3.4 Compatibility Budget Regeneration
Budget regeneration materializes resolved rule occurrences for the independent Budget window.

**Process**:
1. User configures the Budget window.
2. **Generate from Expanded Transactions** calls `BudgetManager.createFromProjections()`.
3. The manager calls `resolveScenarioOccurrences()` with existing Budget overlays omitted, then stores generated compatibility rows containing:
   - Stable scheduled dates and occurrence keys
   - Resolved periodic-change amounts as `plannedAmount`
   - Account associations (primaryAccountId/secondaryAccountId)
   - Transaction types (transactionTypeId)
   - Descriptions
   - Split role, account-group, capital, and interest metadata
   - `isOverride = false`

**Technical Implementation**:
- Generated occurrences retain `sourceTransactionId` and an immutable scheduled identity.
- Existing actuals, skips, manual occurrences, and historical rows are preserved according to compatibility rules.
- User edits flip override intent so later rule changes do not erase the occurrence-specific decision.
- Budget data persists in `scenario.budgets` until the clean occurrence-schema migration.

**Use Case**: Transitional support for existing Budget workflows and data while the live period view is introduced.

### 3.5 Budget vs. Actual Tracking
Each budget occurrence supports dual-amount tracking to compare planned vs. actual financial events.

**Data Structure**:
- `baselineAmount`: Frozen or migrated comparison amount
- `plannedAmount`: Latest expected amount
- `actualAmount`: Real amount spent/received (edited by user as events occur)
- `scheduledDate`: Stable matching date
- `plannedDate`: Optional occurrence-only reschedule
- `actualDate`: Realized date

**Workflow**:
1. Budget compatibility row is generated or added manually.
2. As real transactions occur, user updates actualAmount fields
3. The resolver replaces the matching planned movement with actual amount/date.
4. Baseline, current plan, actual, commitments, and variance totals can be calculated from canonical resolved occurrences.

**Period Filtering**:
- Budget grid filters by selected period (Month/Quarter/Year)
- Only occurrences within period date range display
- Totals toolbar shows aggregated planned vs. actual for visible period

**Technical Implementation**:
- Budget display uses the shared perspective-row query and period helpers.
- Grid columns use shared grid-factory money/date columns.
- Compatibility totals use `calculateBudgetTotals()`; the canonical comparison contract is `calculateResolvedOccurrenceTotals()`.

**Use Case**: User budgets $500/month for groceries (plannedAmount), then tracks actual grocery spending each month (actualAmount) to identify overspending trends.

### 2.3 Home Page Hero (`index.html`)
The home hero uses a layered background to keep the CTA readable while adding visual depth.
- **Background Asset**: `assets/home-hero-bg.svg`
- **Styling**: `styles/app.css` applies a gradient overlay plus SVG background on `.home-hero`.

### 2.4 Home Page Background (`index.html`)
The full home page uses a separate SVG background for the overall layout.
- **Background Asset**: `assets/home-page-bg.svg`
- **Styling**: `styles/app.css` applies a gradient overlay plus SVG background on `.home-page`.
