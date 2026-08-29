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
This is the heart of the Forecast page. It orchestrates workflow routing,
selection, and refresh behavior across the visible sections.

#### A. Scenario Grid
- **Type**: Single Select.
- **Behavior**: Only one scenario can be active.
- **Selection Event**: Triggers reload of all downstream grids filtered by `scenarioId`.

#### B. Account Grid
- **Type**: Single Select.
- **Behavior**: Filters the view to a specific account.
- **Selection Event**: Triggers reload of the unified Plan & Actuals surface
  and Projections filtered by `accountId`.

#### C. Plan & Actuals
- **Type**: The authoritative financial-activity component in every main
  workflow, with Period and Recurring modes and summary/detail presentations.
- **Period mode**:
  - Calls `resolveScenarioOccurrences()` for the selected period; it does not materialize generated rows.
  - Shows baseline, current plan, actual, variance, status, direction-aware movement, repeat information, and description for each occurrence.
  - Routes writes through `OccurrenceManager`: occurrence-only edits, this-and-future splits, entire-series changes, actuals, skips, restores, reschedules, manual occurrences, recurring promotion, and baseline freeze.
  - Uses `calculateResolvedOccurrenceTotals()` for comparison totals.
- **Recurring mode**:
  - Uses the recurring-rule renderer in `transactions-grid.js` inside Plan &
    Actuals; there is no separate user-facing Transactions card.
  - Shows all planned rule segments by default, without period/status expansion.
  - Displays recurrence, periodic adjustment, active dates, next occurrence, tags, and split metadata.
  - Requires **This and future** or **Entire series** scope. Non-split changes use the scoped occurrence commands; split changes use `OccurrenceManager.updateSplitSeries()` so every role is revised atomically from the same boundary.
  - Supports whole-rule and whole-split-set duplication.
  - Uses `OccurrenceManager.endSeries()` instead of destructive rule deletion. The command ends every affected rule and split component before the next unresolved occurrence, preserves prior actual/skipped/frozen evidence, and refuses to cross protected future history.
  - New recurring-rule and recurring split-set creation use the transaction application service; a split set and all component rules persist atomically.
- **Summary presentation**: Uses compact cards. General, Funds, Debt
  Repayment, and Goal Workshop default to Recurring; Period is the budget and
  actual-tracking view in the same component.
- **Detail presentation**:
  - **Plan Rules (Detail)** defaults to a Tabulator of recurring rule
    segments with safe scoped editing and expandable rule metadata.
  - **Plan & Actuals (Detail)** defaults to a Tabulator of resolved Period
    occurrences with Date, Status, Money Movement, Description, Repeat,
    Baseline, Current Plan, Actual, forecast/variance values, and Actions.
  - Switching the detail component between Period and Recurring switches
    between these two genuine table presentations.
- **Workflow routing**: `workflow-registry.js` supplies the component surface,
  presentation, and default view through each workflow's `activity` contract.
- **State**: The period type persists in `uiState.viewPeriodTypeIds.planActuals`.

#### D. Projection Grid
- **Type**: Read-only display.
- **Behavior**: Shows calculated financial projections by period.
- **Features**:
  - **Generation Input**: Always uses canonical resolved occurrences: actuals, current plan, future rule occurrences, manual entries, and skips.
  - **Freshness**: Shows Current, Stale · refreshing, or Pending from projection freshness metadata.
  - SchemaVersion 44 exposes no projection-source selector; all generation
    uses the canonical resolved occurrence plan.
  - **Toolbar**: Account filter, period view controls, and inline totals (Income, Expenses, Net).

#### E. Summary Cards
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

#### F. Generate Plan

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
3. All visible surfaces (Accounts, Plan & Actuals, Projections, summaries, or
   Generate Plan) reload with scenario data.
4. User selects an Account.
5. The active surface applies its account-perspective filter without changing canonical movement direction.

### 3.3 Unified Plan & Actuals Routing

Every main workflow uses the same financial-activity component:

| Workflow | Presentation | Default view |
|---|---|---|
| General | Summary | Recurring |
| Funds | Summary | Recurring |
| Debt Repayment | Summary | Recurring |
| Goal Workshop | Summary | Recurring |
| Plan Rules (Detail) | Detail | Recurring |
| Plan & Actuals (Detail) | Detail | Period |

The default does not remove the other subview. Both Period and Recurring
remain available from the unified component.

Legacy workflow ID `budget` and legacy scenario type 1 resolve to General.
This compatibility alias is sanitized by Data Check so old files keep all
financial data while their saved navigation preference is updated.

1. **Define Rules**: Recurring mode edits canonical transaction rules and rule segments.
2. **Resolve a Period**: Period mode queries the live occurrence timeline for the selected range.
3. **Adjust or Realize**: The user applies occurrence-only changes, future/series changes, actuals, skips, restores, duplicates, or manual additions.
4. **Refresh**: Every manager write dispatches `forecast:planChanged`. The controller reloads the active scenario and Plan & Actuals immediately, then debounces projection regeneration by 500 ms.

### 3.4 Occurrence Command Boundaries

- Occurrence-only fields use `plannedAmount`, `plannedDate`, accounts, type, and description.
- Series commands use rule fields; the UI maps `plannedAmount` to `amount` and omits `plannedDate`.
- A this-and-future edit may return a replacement `occurrenceKey`; follow-up actual/skip commands use that returned key.
- Actual rows call `markActual()` directly. Skipped rows may retain plan edits and use `{status: 'planned'}` to restore.
- Repeat changes on linked rules force this-and-future scope. Manual occurrences use `promoteOccurrenceToRecurring()`.
- When the selected period does not contain an overdue occurrence's immutable `scheduledDate`, the UI omits the selected period from `markActual()` so the command freezes the scheduled calendar month.

### 3.5 Baseline and Comparison Tracking

Canonical occurrence fields are:

- `baselineAmount`: frozen comparison amount.
- `plannedAmount`: latest expected amount.
- `actualAmount`: realized amount.
- `scheduledDate`: immutable occurrence identity date.
- `plannedDate`: optional occurrence-only reschedule.
- `actualDate`: realized date.

`markActual()` freezes the containing baseline period if required. Manual unplanned actuals use zero baseline and current plan. Period totals are derived from resolved occurrences and expose baseline net, current net, actual net, commitments, forecast net, variances, and unplanned actuals.

### 3.6 Projection Freshness

`forecast:planChanged` carries the current scenario ID. The controller maintains one debounce timer per scenario, ignores changes for inactive scenarios, reloads the latest scenario before generation, and reloads Plan & Actuals and Projections after completion. Projection generation has one canonical resolved-occurrence source; the controller does not pass a selectable `source`.

## 4.0 Home Page

### 4.1 Home Page Hero (`index.html`)
The home hero uses a layered background to keep the CTA readable while adding visual depth.
- **Background Asset**: `assets/home-hero-bg.svg`
- **Styling**: `styles/app.css` applies a gradient overlay plus SVG background on `.home-hero`.

### 4.2 Home Page Background (`index.html`)
The full home page uses a separate SVG background for the overall layout.
- **Background Asset**: `assets/home-page-bg.svg`
- **Styling**: `styles/app.css` applies a gradient overlay plus SVG background on `.home-page`.
