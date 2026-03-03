# Comprehensive Filtering, Selection, and Grouping Analysis

**Analysis Date**: March 2, 2026  
**Purpose**: Map all dashboard filtering, selection, and grouping interactions, how they're updated, and identify inconsistencies

---

## 1.0 Dashboard Structure Overview

The dashboard is organized into collapsible sections (dash rows), each containing panels:

```
SIDEBAR
├── Scenarios selector

MAIN CONTENT
├── Summary Row (Summary cards)
├── Generate Plan Row (Goal Workshop - conditional)
├── Accounts & Transactions Row
│   ├── Accounts Panel
│   └── Transactions Panel
├── Budget Row
└── Projections Row
```

Each major panel has **filtering controls** in the card header and **selection/grouping** applied to the underlying grid/list.

---

## 2.0 Summary Row Panel

**Location**: `js/ui/controllers/forecast-controller.js` (functions: `loadDebtSummaryCards`, `loadGeneralSummaryCards`, `loadFundsSummaryCards`)

### 2.1 Debt Summary Cards (Default)

**Filtering**:
- **Account Type Filter**: Dropdown (All, Liability, Asset)
  - State variable: `summaryCardsAccountTypeFilter`
  - Default: `'All'`
  - DOM selector: `#summary-cards-type-filter`

**Grouping**:
- Cards grouped by Account Type (Liability, Asset)
- Preferred order: `['Liability', 'Asset']` + remaining alphabetical

**Selection**: None (display-only cards)

**Update Flow**:
1. User changes Account Type dropdown `#summary-cards-type-filter`
2. `onchange` handler updates `summaryCardsAccountTypeFilter`
3. Calls `loadDebtSummaryCards(container, options)` (full reload)
4. Function filters accounts: `summaryCardsAccountTypeFilter === 'All' ? accounts : accounts.filter(...)`
5. Re-renders grouped card layout

**Display Logic**:
- For each account in filtered set, creates a debt summary card showing:
  - Starting Balance
  - Projected End
  - Interest Earned
  - Interest Paid
  - Zero Crossing Date
  
**Implementation Quality**: ✅ Consistent
- Filter state is persisted in controller variable
- Reload regenerates entire layout
- Empty state handled when no accounts match filter

---

### 2.2 General Summary Cards (Workflow-dependent)

**Filtering**:
- **Account Type Filter**: Dropdown (All, Asset, Liability, Equity, Income, Expense)
  - State variable: `generalSummaryScope`
  - Default: `'All'`
  - DOM selector: `#general-summary-type-filter`

- **Account Filter**: Dropdown (All + individual accounts)
  - State variable: `generalSummaryAccountId` (number, 0 = All)
  - Default: `0`
  - DOM selector: `#general-summary-account`

**Grouping**:
- Cards grouped by Account Type (Liability, Asset, Equity, Income, Expense)
- Preferred order: `['Liability', 'Asset', 'Equity', 'Income', 'Expense']` + remaining

**Selection**: None (display-only)

**Update Flow**:
1. User changes Account Type or Account dropdown
2. `onchange` handlers update `generalSummaryScope` or `generalSummaryAccountId`
3. Calls `loadGeneralSummaryCards(container, options)` (full reload)
4. Function applies both filters sequentially:
   ```javascript
   // First filter by type
   let filtered = generalSummaryScope === 'All' ? accounts : accounts.filter(...)
   // Then filter by specific account
   if (Number(generalSummaryAccountId) > 0) {
     filtered = filtered.filter(a => Number(a.id) === Number(generalSummaryAccountId))
   }
   ```
5. Re-renders grouped card layout

**Implementation Quality**: ✅ Consistent
- Dual filters work together correctly
- Independent state variables
- Empty state handled

---

### 2.3 Funds Summary Cards (Funds Workflow only)

**Filtering**: None (always shows all equity accounts)

**Grouping**:
- Title: "Equity Accounts"
- Shows per-investor rows in a Tabulator grid

**Selection**: None (read-only detail grid)

**Update Flow**:
1. Function `loadFundsSummaryCards()` always re-renders from scratch
2. Displays investor detail grid with columns: Investor, Shares, Ownership %, Implied Value, Net Contributions, Net Redemptions
3. Includes totals card at top with FUND TOTALS data

**Note on Total Shares Input**:
- Total Shares field is **editable inline** (`#fund-total-shares`)
- `onchange` handler updates `fundSettings.totalShares` and persists to scenario
- Then reloads entire summary

**Implementation Quality**: ✅ Consistent
- No filters (by design)
- State persisted to scenario object
- Inline editing triggers full reload

---

## 3.0 Accounts & Transactions Row (Middle Row)

**Location**: Two side-by-side panels controlled by:
- `js/ui/components/grids/accounts-grid.js`
- `js/ui/components/grids/transactions-grid.js`

### 3.1 Accounts Panel

**Filtering**: None

**Grouping**:
- **Group By dropdown**: None, Type (account type name)
  - DOM selector: `#accounts-groupby-select`
  - Stored in: `lastAccountsTable?.setGroupBy([field])`
  - Implementation: Tabulator's native `setGroupBy()` method

**Selection**:
- Rows can be **expanded** to show details (inline expansion)
- State: Each row has `_detailsOpen` boolean
- Details show: Description, Tags, Goal Amount, Goal Date (workflow-dependent)

**Update Flow**:

**Grouping Change:**
1. User selects option from Group By dropdown
2. `addEventListener('change')` extracts field name
3. Calls `lastAccountsTable?.setGroupBy?.(field ? [field] : [])`
4. Tabulator re-groups immediately without reload

**Row Expansion:**
1. User clicks row or expansion control
2. `_detailsOpen` toggled on row data
3. `renderAccountsRowDetails()` renders inline details
4. Details allow inline editing of Description, Tags, Goal fields
5. Changes saved immediately to IndexedDB via `AccountManager.update()`

**Implementation Quality**: ⚠️ Partial Issues
- Grouping: Clean Tabulator integration
- Expansion: Works but details trigger individual saves (not batched)
- **Missing**: No "collapse all" or "expand all" button
- **Inconsistency**: Details auto-save but some field updates happen on blur, others on explicit save in modal

---

### 3.2 Transactions Panel

**Filtering**:
- **Account Filter**: Dropdown (all accounts except "Select Account")
  - State variable: `transactionsAccountFilterId`
  - Default: First visible account ID or null
  - DOM selector: `#tx-account-filter-select`

- **Period Type Filter**: Dropdown (Day, Week, Month, Quarter, Year)
  - State variable: `actualPeriodType`
  - Default: `'Month'` (loaded from UI state)
  - DOM selector: `#tx-period-type-select`

- **Period Filter**: Dropdown (All + dynamic periods) + Navigation buttons (◀ ▶)
  - State variable: `actualPeriod` (period ID or null)
  - Default: null (shows "All")
  - DOM selector: `#tx-period-select`

- **Status Filter**: Dropdown (All, Planned, Actual)
  - Default: All (no state persistence)
  - DOM selector: `#tx-status-filter-select`

**Grouping**:
- **Group By dropdown**: None, Transaction Type, Primary Account, Secondary Account, Status
  - DOM selector: `#tx-grouping-select`
  - Applied via: `lastTransactionsDetailTable?.setGroupBy?.(field ? [field] : [])`

**Selection**:
- Per-row expansion to show details
- Details show: Secondary Account, Recurrence, Periodic Change, Tags
- Details allow inline editing and modification

**Update Flow**:

**Account Filter Change:**
1. User selects account from `#tx-account-filter-select`
2. `addEventListener('change')` updates `transactionsAccountFilterId`
3. Calls `loadMasterTransactionsGrid({...})` - **FULL RELOAD**
4. Function regenerates grid with new data

**Period Type Change:**
1. User selects period type (Day/Week/Month/etc)
2. Calls `setState(?setActualPeriodType(type))`
3. Calls `reload()` - **FULL RELOAD**
4. Generates new period list for selected type

**Period Navigation (◀ ▶ buttons):**
1. User clicks prev/next button
2. Calculates previous/next period ID
3. Updates `actualPeriod` state
4. Calls `applyTransactionsDetailFilters({state, callbacks})` if detail table exists
   - Uses Tabulator's `setFilter()` to apply date range filter
   - Calls `updateTransactionTotals()` to recalculate
5. If summary view: calls `reload()` for full regenerate

**Status Filter Change:**
1. User selects status (Planned/Actual)
2. Calls `lastTransactionsDetailTable?.setFilter?.('statusName', '=', statusFilterSelect.value)`
3. Tabulator filters immediately
4. Calls `updateTransactionTotals()` to update toolbar

**Grouping Change:**
1. User selects grouping field
2. Calls `lastTransactionsDetailTable?.setGroupBy?.(field ? [field] : [])`
3. Tabulator groups immediately

**Implementation Quality**: ⚠️ Mixed
- **Good**: Account filter triggers appropriate reload, handles perspective rows correctly
- **Potential Issue**: Account filter does full reload; could be optimized with Tabulator filtering
- **Good**: Period changes use smart filtering (detail view) vs reload (summary view)
- **Issue**: Status filter doesn't persist; resets on reload
- **Inconsistency**: Period navigation works differently depending on view mode (detail vs summary)

---

## 4.0 Budget Row Panel

**Location**: `js/ui/components/grids/budget-grid.js`

### 4.1 Budget Grid Filtering & Grouping

**Filtering**:
- **Period Type Filter**: Dropdown (Day, Week, Month, Quarter, Year)
  - State variable: `budgetPeriodType`
  - DOM selector: `#budget-period-type-select`

- **Period Filter**: Dropdown (All + dynamic periods) + Navigation buttons (◀ ▶)
  - State variable: `budgetPeriod`
  - DOM selector: `#budget-period-select`

- **Account Filter**: Dropdown (all accounts)
  - State variable: `budgetAccountFilterId`
  - Default: First account ID
  - DOM selector: `#budget-account-select`

**Grouping**:
- **Group By dropdown**: None, Type, Secondary Account, Status
  - DOM selector: `#budget-grouping-select`
  - Applied via: `lastBudgetDetailTable?.setGroupBy?.(field ? [field] : [])`

**Selection**:
- Per-row expansion to show details
- Details allow inline editing

**Update Flow**:

**Period Type Change:**
1. User selects new period type
2. Timeout-debounced (50ms)
3. Updates `budgetPeriodType`
4. Clears periods and period selection
5. Calls `reload()` - **FULL RELOAD**
6. Generates new period list

**Period Navigation:**
1. User clicks ◀ or ▶ button
2. Calculates adjacent period ID
3. Updates `budgetPeriod`
4. **For Summary View**: Calls `reload()` - full regenerate
5. **For Detail View**: Calls `applyBudgetDetailFilters({state, periods, callbacks})`
   - Uses Tabulator filtering if table exists
   - Updates totals

**Account Filter Change:**
1. User selects account from dropdown
2. Updates `budgetAccountFilterId`
3. Calls `applyBudgetDetailFilters({state, periods, callbacks})`
4. Applies filter: `if (accountFilterId) perspectiveAccountId === accountFilterId`
5. Updates totals

**Grouping Change:**
1. User selects grouping field
2. Calls `lastBudgetDetailTable?.setGroupBy?.(field ? [field] : [])`
3. Tabulator groups immediately

**Implementation Quality**: ⚠️ Mixed Issues
- **Good**: Account filter filtering approach for detail view
- **Issue**: Period type change requires full reload (could be optimized)
- **Inconsistency**: Account filter behavior differs from transactions panel
- **Good**: Perspective row handling correctly applied

---

## 5.0 Projections Row Panel

**Location**: `js/ui/components/forecast/forecast-projections-section.js`

### 5.1 Projections Section Filtering & Grouping

**Filtering**:
- **Account Filter**: Dropdown (All + individual accounts)
  - State variable: `projectionsAccountFilterId`
  - DOM selector: `#projections-account-filter-select`

- **Period Type Filter**: Dropdown (Day, Week, Month, Quarter, Year)
  - State variable: `projectionPeriodType`
  - DOM selector: `#projections-viewby-select`

- **Period Filter**: Dropdown (All + dynamic periods) + Navigation buttons
  - State variable: `projectionPeriod`
  - DOM selector: `#projections-period-select`

**Grouping**:
- **Group By dropdown**: None, Account, Account Type
  - DOM selector: `#projections-grouping-select`
  - State stored in: `container.dataset.projectionsGroupBy`
  - Applied via: `lastProjectionsTable.setGroupBy(field ? [field] : [])`

**Selection**: Display-only row expansion in detail view

**Update Flow**:

**Account Filter Change:**
1. User selects account from `#projections-account-filter-select`
2. Updates `projectionsAccountFilterId`
3. **For Detail View** (table exists):
   - Calls `lastProjectionsTable.setFilter('accountId', '=', selectedId)` OR `clearFilter()`
   - Calls `callbacks?.updateProjectionTotals?.()`
4. **For Summary View** (no table):
   - Calls `reload()` - Full rerender

**Period Type Change:**
1. User selects new period type (Day/Week/Month/etc)
2. Calls `state?.setProjectionPeriodType?.(nextView)`
3. Fetches new periods via `getScenarioPeriods(scen arioId, nextView)`
4. Updates `state?.setProjectionPeriods?.(nextPeriods)`
5. Resets `projectionPeriod` to null/"All"
6. Calls `reload()` - **FULL RELOAD**

**Period Selection (dropdown or navigation):**
1. User selects period or clicks ◀ ▶
2. Updates `projectionPeriod` state
3. **For Detail View** (table exists):
   - Calls `applyProjectionsPeriodFilter({projectionsTable, state})`
     - Finds selected period in `projectionPeriods`
     - Uses Tabulator's `setFilter()` with custom function:
       ```javascript
       projectionsTable.setFilter((row) => {
         // Returns true if row date between period start/end
       })
       ```
   - Calls `callbacks?.updateProjectionTotals?.()`
4. **For Summary View**:
   - Calls `reload()` - Full rerender

**Grouping Change:**
1. User selects grouping option
2. Stores in `container.dataset.projectionsGroupBy`
3. Converts grouping name to field name: `'Account' -> 'account'`, `'Account Type' -> 'accountType'`, `None -> null`
4. Calls `lastProjectionsTable.setGroupBy(field ? [field] : [])`
5. Tabulator groups immediately

**Implementation Quality**: ✅ Mostly Consistent
- **Good**: Dual view mode handling (detail with Tabulator filtering vs summary with reload)
- **Good**: Period filtering uses date range logic correctly
- **Good**: Grouping applied correctly
- **Inconsistency**: Account filter behavior differs slightly between panels (direct filter vs reload)

---

## 6.0 Cross-Panel Dependencies & State Management

### 6.1 State Variable Map

All state is held in controller scope:

```javascript
let transactionsAccountFilterId = null;
let actualPeriod = null;
let actualPeriodType = 'Month';

let budgetAccountFilterId = null;
let budgetPeriod = null;
let budgetPeriodType = 'Month';

let projectionsAccountFilterId = null;
let projectionPeriod = null;
let projectionPeriodType = 'Month';

let summaryCardsAccountTypeFilter = 'All';
let generalSummaryScope = 'All';
let generalSummaryAccountId = 0;
```

### 6.2 Reset Behavior on Scenario Change

When user selects new scenario:
```javascript
async function setCurrentScenarioById(scenarioId) {
  currentScenario = next;
  transactionsAccountFilterId = null;    // ← RESET
  budgetAccountFilterId = null;           // ← RESET
  projectionsAccountFilterId = null;      // ← RESET
  // Note: Period types NOT reset (should they be?)
}
```

**Observation**: Account filters reset but period types persist. This causes **inconsistent behavior**:
- User switches scenario
- Period type remains (e.g., "Quarter")
- But account filter resets to null
- Summary shows all accounts but transactions show only first account

---

## 7.0 Identified Inconsistencies & Issues

### 7.1 Major Inconsistencies

| Issue | Location | Severity | Details |
|-------|----------|----------|---------|
| **Account Filter Reload Behavior** | Transactions, Budget, Projections | High | Transactions reloads ENTIRE grid when account filter changes, while Budget/Projections use Tabulator filtering. Inconsistent UX. |
| **Reset on Scenario Change** | forecast-controller.js | Medium | Only account filters reset, not period types. Leads to orphaned filter state. |
| **Status Filter Persistence** | transactions-grid.js | Medium | Status filter doesn't persist across reloads. Resets to "All" every time grid reloads. |
| **Grouping State Storage** | Various grids | Medium | Grouping stored different ways: some in Tabulator instance, some in `container.dataset`, some not persisted at all. |
| **Period Navigation Duality** | transactions, budget, projections | Low | Period nav behaves differently in detail vs summary view — sometimes full reload, sometimes filtered update. Confusing code paths. |

### 7.2 Missing Features

| Feature | Panel | Status | Impact |
|---------|-------|--------|--------|
| **Collapse All / Expand All** | Accounts, Transactions, Budget | Not Implemented | Users must click each row individually to expand details |
| **Filter Persistence** | All panels | Partial | Account Type filter persists; Status filter doesn't; Period selection resets on scenario change |
| **Multi-Filter UI** | Debt Summary | Not Implemented | Can't simultaneously filter by type AND account; two independent dropdowns but no "Account Type + Specific Account" combo |
| **Clear All Filters** | Most panels | Not Implemented | No reset button to clear all active filters at once |
| **Search / Quick Filter** | All grids | Not Implemented | Users can't search within accounts or transactions; must scroll manually |
| **Saved Filter Views** | All panels | Not Implemented | No ability to save/recall filter combinations |

### 7.3 Implementation Gaps

**Account Filter Inconsistency (HIGH PRIORITY)**

**Transactions Panel**:
- Account filter change → full `loadMasterTransactionsGrid()` reload
- Regenerates all column configs, data, handlers
- Expensive operation

**Budget Panel**:
- Account filter change → `applyBudgetDetailFilters({state, periods, callbacks})`
- Calls Tabulator's `setFilter()` if table exists
- Efficient in-place filtering

**Projections Panel**:
- Account filter change → conditional:
  - Detail view: Uses Tabulator `setFilter()`
  - Summary view: Full reload

**Recommendation**: Standardize on Tabulator filtering when detail table exists; only reload for summary view.

---

**Period Type Change Reload Pattern**

All three detail grid panels (Transactions, Budget, Projections) **full reload** on period type change:
```javascript
// All three have similar pattern:
periodTypeSelect.addEventListener('change', async () => {
  state?.setPeriodType?.(periodTypeSelect.value);
  state?.setPeriods?.([]);  // Clear periods
  state?.setPeriod?.(null); // Reset period selection
  await reload();           // ← FULL RELOAD
});
```

This is **more expensive than necessary** because:
1. Period list is recalculated from data
2. First period is selected by default (~same data scope before/after)
3. Could use Tabulator filtering instead

**Recommendation**: For detail view, fetch new periods asynchronously but keep current data visible; only reload if user explicitly interacts.

---

**Status Filter Lost on Reload**

**Transactions Panel Status Filter**:
- User selects "Actual" status
- Table filters: `setFilter('statusName', '=', 'actual')`
- User navigates to next period (calls `reload()`)
- Status filter **RESETS to unfiltered** because status dropdown not in reload logic

**Location**: `js/ui/components/grids/transactions-grid.js` line ~1085

```javascript
statusFilterSelect.addEventListener('change', () => {
  // Filter applied here
  lastTransactionsDetailTable?.setFilter?.('statusName', '=', statusFilterSelect.value);
});
// But reload() doesn't re-apply this filter!
```

**Recommendation**: Add status filter persistence to state object, reapply on reload.

---

**Grouping State Not Persisted**

**Examples**:
- Accounts: Grouping stored in Tabulator instance only (lost if grid destroyed/recreated)
- Transactions: Same issue
- Budget: Same issue
- Projections: Stored in `container.dataset.projectionsGroupBy` (persists across reloads)

**Recommendation**: Move all grouping state to controller scope variables (like period/account filters).

---

## 8.0 Filter Update Mechanisms Summary

### 8.1 Three Update Patterns Used

**Pattern 1: Full Reload** (Most common)
```
Filter change → Update state variable → Call reload()
→ Entire grid destroyed and recreated
```
**Used by**: Account filter (Transactions), Period type (all grids)  
**Pros**: Simple, guarantees consistency  
**Cons**: Expensive, loses scroll position, loses table selection/expansion state

**Pattern 2: Tabulator In-Place Filter**
```
Filter change → Call table.setFilter() or table.setGroupBy()
→ No reload, grid updates instantly
```
**Used by**: Status (Transactions), Grouping (all grids when detail view active), Period selection in detail view  
**Pros**: Fast, smooth UX, preserves state  
**Cons**: Only works if Tabulator instance available (not in summary view)

**Pattern 3: Dual Mode**
```
Filter change → if (detailTableExists) use Pattern 2 else use Pattern 1
```
**Used by**: Account filter (Projections), Period selection (Transactions, Budget, Projections)  
**Pros**: Optimizes both modes  
**Cons**: Complex code paths, harder to debug

---

### 8.2 Summary View vs Detail View Distinction

Most panels support two views:

**Detail View** (Tabulator grid):
- Full data table with rows/columns
- Supports: Sorting, Grouping, Filtering, Expansion
- Updates via: Tabulator methods
- Used when: User clicks "Detail" button or switches mode

**Summary View** (Card grid):
- Card-based display with key metrics
- Supports: Filtering only (via reload)
- Updates via: Full reload
- Used when: User clicks "Summary" button or default view

**Critical Issue**: Some filters state-managed differently between modes
- Account filter persists between mode switches
- But period filter may not (depends on panel)
- Creating confusing UX when toggling views

---

## 9.0 Recommendations for Standardization

### 9.1 Account Filter Standardization

**Proposed Behavior**: 
- All three panels (Transactions, Budget, Projections) should:
  1. Update state variable: `{panel}AccountFilterId`
  2. If detail table exists: call `table.setFilter()` immediately
  3. If no table: call `reload()`
  4. Update totals display

**Code Pattern**:
```javascript
accountSelect.addEventListener('change', (e) => {
  const nextId = Number(e.target.value) || null;
  state?.setAccountFilterId?.(nextId);
  
  if (lastDetailTable) {
    // Pattern 2: Tabulator filter
    if (nextId) {
      lastDetailTable.setFilter('perspectiveAccountId', '=', nextId);
    } else {
      lastDetailTable.clearFilter();
    }
    callbacks?.updateTotals?.();
  } else {
    // Pattern 1: Reload for summary view
    reload();
  }
});
```

### 9.2 Period Filter Standardization

**Proposed**: Keep current dual-mode behavior (it's good), but ensure:
1. Period selection *persists* across detail↔summary view toggles
2. Period type resets on scenario change (currently doesn't)
3. Period filtering always uses date range logic (not just account ID)

### 9.3 Status Filter Fix (Transactions Only)

**Action**: Add status state variable, persist across reloads
```javascript
let transactionsStatusFilter = ''; // '' = All, 'planned', 'actual'

async function loadMasterTransactionsGrid() {
  // ... existing code ...
  statusFilterSelect.value = transactionsStatusFilter;
  statusFilterSelect.addEventListener('change', () => {
    transactionsStatusFilter = statusFilterSelect.value;
    if (lastTransactionsDetailTable && lastTransactionsDetailTableReady) {
      lastTransactionsDetailTable.setFilter('statusName', '=', transactionsStatusFilter);
    }
  });
}
```

### 9.4 Grouping State Persistence

**Action**: Move all grouping to controller-scoped variables

```javascript
let transactionsGroupBy = ''; // '': None, 'transactionTypeName', etc
let budgetGroupBy = '';
let accountsGroupBy = '';
let projectionsGroupBy = '';

// Restore on grid load:
if (state?.getGroupBy?.()) {
  lastTable.setGroupBy([state.getGroupBy()]);
}

// Update on user change:
groupBySelect.addEventListener('change', () => {
  state?.setGroupBy?.(groupBySelect.value ? [groupBySelect.value] : []);
  lastTable?.setGroupBy(state.getGroupBy());
});
```

### 9.5 New Features to Consider

1. **Global "Reset Filters" button** on each row header
2. **Collapse All / Expand All** buttons in grid header
3. **Search field** for account/transaction name filtering
4. **Filter persistence** across page reloads (store in localStorage/IndexedDB)
5. **Chained filtering UI** (e.g., "Filter by Type, then by Account")

---

## 10.0 Implementation Audit Checklist

- [x] Identify all filter/grouping UI controls
- [x] Map state variables and their scope
- [x] Document when each state is updated
- [x] Determine reload vs in-place update pattern
- [x] Identify resets (e.g., scenario change)
- [x] Identify missing features
- [x] Identify behavior inconsistencies
- [ ] *Planned*: Add unit tests for filter persistence across reloads
- [ ] *Planned*: Add E2E tests for scenario change filter behavior
- [ ] *Planned*: Standardize all account filter handling

---

## Appendix A: File Location Reference

| Component | File |
|-----------|------|
| Debt/General Summary | `js/ui/controllers/forecast-controller.js` (lines ~937–1400) |
| Accounts Grid | `js/ui/components/grids/accounts-grid.js` |
| Transactions Grid | `js/ui/components/grids/transactions-grid.js` |
| Budget Grid | `js/ui/components/grids/budget-grid.js` |
| Projections Section | `js/ui/components/forecast/forecast-projections-section.js` |
| Projections Filtering Logic | `js/ui/components/forecast/forecast-projections.js` |
| Layout | `js/ui/components/forecast/forecast-layout.js` |
| Main Controller | `js/ui/controllers/forecast-controller.js` (lines ~1–150, ~1700+) |

