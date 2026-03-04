# Filter & Selection Standardization Plan

**Date**: March 2, 2026  
**Status**: PLANNING PHASE (No Implementation Yet)  
**Scope**: Accounts/Transactions, Budget, Projections panels

---

## 1.0 Core Principles

1. **Shared State Within Context**: Filters persist together within their logical grouping
   - `Accounts + Transactions` share account/period state (independently)
   - `Budget` has its own account/period state 
   - `Projections` has its own account/period state
   
2. **Detail ↔ Summary Parity**: Both views use identical filters and behave identically
   - Same dropdown values
   - Same filter logic
   - State persists across view toggle

3. **Consistent Implementation Pattern**: All three panels follow same structure
   - Period Type selector
   - Period selector (generated from Period Type)
   - Account/Perspective filter
   - Grouping selector
   - Additional filters (Status, etc.)

4. **Naming Convention**: "View" → "Period Type" throughout

---

## 2.0 State Architecture

### 2.1 Controller-Level State Variables

```
TRANSACTIONS CONTEXT
├── transactionsAccountFilterId      (number | null) - perspective account
├── transactionsStatusFilter         ('' | 'planned' | 'actual')
├── transactionsPeriodType           (string: 'Day'|'Week'|'Month'|'Quarter'|'Year')
├── transactionsPeriod               (period ID | null for 'All')
├── transactionsPeriods              (array of period objects)
├── transactionsGroupBy              ('' | 'transactionTypeName' | 'statusName' | ...)
└── transactionsAllPeriodsExpanded   (boolean) - flag for expanded view when period='All'

BUDGET CONTEXT
├── budgetAccountFilterId            (number | null)
├── budgetStatusFilter               ('' | 'planned' | 'actual')
├── budgetPeriodType                 (string)
├── budgetPeriod                     (period ID | null, but NOT 'All')
├── budgetPeriods                    (array)
├── budgetGroupBy                    ('' | field name)
└── (no transactionsAllPeriodsExpanded equivalent)

PROJECTIONS CONTEXT
├── projectionsAccountFilterId       (number | null for 'All Accounts')
├── projectionsPeriodType            (string)
├── projectionsPeriod                (period ID | null for 'All')
├── projectionsPeriods               (array)
├── projectionsGroupBy               ('' | 'accountType' | 'secondaryAccountName' | ...)
└── (no status filter - projections always show all statuses)
```

### 2.2 State Management Interface

Each context (Transactions, Budget, Projections) should expose consistent getter/setter:

```javascript
state: {
  // Account filtering
  getAccountFilterId: () => transactionsAccountFilterId,
  setAccountFilterId: (id) => { transactionsAccountFilterId = id; },
  
  // Period type
  getPeriodType: () => transactionsPeriodType,
  setPeriodType: (type) => { 
    transactionsPeriodType = type;
    transactionsPeriod = null; // Reset selection
  },
  
  // Period selection
  getPeriod: () => transactionsPeriod,
  setPeriod: (periodId) => { transactionsPeriod = periodId; },
  
  // Periods list
  getPeriods: () => transactionsPeriods,
  setPeriods: (periods) => { transactionsPeriods = periods; },
  
  // Grouping
  getGroupBy: () => transactionsGroupBy,
  setGroupBy: (field) => { transactionsGroupBy = field; },
  
  // Status (Transactions & Budget only)
  getStatusFilter: () => transactionsStatusFilter,
  setStatusFilter: (status) => { transactionsStatusFilter = status; },
  
  // (Transactions only) Expansion flag
  getAllPeriodsExpanded: () => transactionsAllPeriodsExpanded,
  setAllPeriodsExpanded: (flag) => { transactionsAllPeriodsExpanded = flag; }
}
```

### 2.3 Reset Behavior on Scenario Change

When `setCurrentScenarioById()` is called:
```
transactionsAccountFilterId    = null        ✓ Reset
transactionsStatusFilter       = ''          ✓ Reset
transactionsPeriodType        = 'Month'      ✓ Preserve most common type
transactionsPeriod            = null         ✓ Reset (shows All)
transactionsPeriods           = []           ✓ Clear (regenerate on load)
transactionsGroupBy           = ''           ✓ Reset to None
transactionsAllPeriodsExpanded = false       ✓ Reset

(Same pattern for Budget and Projections)
```

---

## 3.0 Transactions Panel Detail Design

**File**: `js/ui/components/grids/transactions-grid.js`

### 3.1 Filter Controls Structure

```
Header Controls Section:
├── [Period Type selector]    ← rename from "View"
│   └── onChange: recalc periods → updatePeriods()
├── [Period selector] [◀] [▶]  ← navigation
│   └── onChange: setPeriod() → applyFilters()
├── [Account/Perspective filter]
│   └── onChange: setAccountFilterId() → applyFilters()
├── [Group By selector]
│   └── onChange: setGroupBy() → updateGrouping()
└── [Status filter]
    └── onChange: setStatusFilter() → applyFilters()
```

### 3.2 Transactions Panel: Detail View Behavior

**When Period Type changes:**
1. Fetch new periods via `getScenarioPeriods(scenarioId, newType)`
2. Call `setPeriodType(newType)` + `setPeriods(newPeriods)` + `setPeriod(null)`
3. Do NOT full reload; instead:
   - Update period dropdown options
   - Check if table exists → use Tabulator `setFilter()` with new period date range (or clear if null)
   - Update totals display

**When Period is selected:**
1. Call `setPeriod(periodId)`
2. If `periodId === null` (All periods):
   - If `transactionsAllPeriodsExpanded === false` → show collapsed summary (one row per transaction)
   - If `transactionsAllPeriodsExpanded === true` → show expanded grid (individual occurrences)
3. Apply date range filter via Tabulator `setFilter((row) => dateInRange(row.date, period.start, period.end))`
4. Update totals

**When Account Filter changes:**
1. Call `setAccountFilterId(accountId)`
2. Apply perspective filter: `setFilter('perspectiveAccountId', '=', accountId)` OR `clearFilter()`
3. Update totals

**When Group By changes:**
1. Call `setGroupBy(field)`
2. Call `table.setGroupBy(field ? [field] : [])`
3. No reload needed

**When Status Filter changes:**
1. Call `setStatusFilter(status)` 
2. Apply filter: `setFilter('statusName', '=', status)` OR `clearFilter()`
3. Update totals

**Reload/Regeneration Only When:**
- Scenario changes
- User explicitly requests refresh
- Account filter changes AND no detail table exists (summary view)

### 3.3 Transactions Panel: Summary View Behavior

- Display same filters in header
- Use same state variables
- When filters change → regenerate summary card grid
- When switching to Detail view → preserve all filter state
- When switching back to Summary view → reapply same filters

### 3.4 Key Differences from Current

| Current | New |
|---------|-----|
| Account filter triggers full grid reload | Apply via Tabulator filtering (detail) or reload only for summary |
| Status filter lost on reload | Status filter persists in state, reapplied on reload |
| "View" label (confusing) | "Period Type" (clear intent) |
| Period navigation only in detail grid | Period controls in both detail and summary |
| Grouping stored in Tabulator only | Grouping stored in controller state variable |
| All periods: same result as filtered | All periods: option to expand all occurrences OR collapsed unique transactions |

---

## 4.0 Budget Panel Detail Design

**File**: `js/ui/components/grids/budget-grid.js`

### 4.1 Filter Controls Structure

```
Header Controls Section:
├── [Period Type selector]     ← rename from current
│   └── onChange: recalc periods → updatePeriods()
├── [Period selector] [◀] [▶]  ← NO "All" option in dropdown
│   └── onChange: setPeriod() → applyFilters()
├── [Account/Perspective filter]
│   └── onChange: setAccountFilterId() → applyFilters()
├── [Group By selector]        ← NEW, same options as transactions
│   └── onChange: setGroupBy() → updateGrouping()
└── [Status filter]            ← may be NEW, same as transactions
    └── onChange: setStatusFilter() → applyFilters()
```

### 4.2 Budget Panel: Key Behaviors

**Period selector special handling:**
- Dropdown should NOT include "All" option
- User MUST select a specific period
- If user tries to clear selection, default to first available period
- Period navigation (◀ ▶) only navigates between valid periods, never to "All"

**Detail ↔ Summary View:**
- Same filter persistence as Transactions
- Detail view uses Tabulator filtering when possible
- Summary view reloads when filters change

**Grouping Implementation:**
- First time implementing Budget grouping
- Use same Tabulator pattern as Transactions
- Options: Transaction Type, Status, Secondary Account, (Recurrence if applicable)

**Account Filter:**
- Works identically to Transactions
- Uses perspective account filtering logic
- Applies via Tabulator in detail view

---

## 5.0 Projections Panel Detail Design

**File**: `js/ui/components/forecast/forecast-projections-section.js`

### 5.1 Filter Controls Structure

```
Header Controls Section:
├── [Period Type selector]     ← rename from "View By"
│   └── onChange: recalc periods → updatePeriods()
├── [Period selector] [◀] [▶]  ← includes "All" option
│   └── onChange: setPeriod() → applyFilters()
├── [Account selector]         ← allows "All Accounts"
│   └── onChange: setAccountFilterId() → applyFilters()
└── [Group By selector]        ← options: Account Type, Secondary Account
    └── onChange: setGroupBy() → updateGrouping()
```

### 5.2 Projections Panel: Account Filter Semantics

**Account Filter Options:**
- "All Accounts" (null value)
  - Shows all account projections
  - May have duplicate totals (one per account)
  - Expected behavior, not an issue
- Specific Account (numeric ID)
  - Shows only that account's projections
  - Filtered to perspective of selected account

**Implementation:**
- When "All": `clearFilter()` or filter returns true for all
- When specific: `setFilter('accountId', '=', accountId)`

### 5.3 Projections Panel: Grouping Options

**Available Groupings:**
- None (default)
- Account Type (grouped by account's type)
- Secondary Account Name (perspective's secondary account)
  - Requires filtering projections to show secondary perspective
  - May need custom transformation

**Note on Grouping**: Grouping by "Secondary Account" means:
- Each projection shows the secondary account perspective
- Group rows by that secondary account name
- This is different from Transactions (which groups by transaction-level attributes)

### 5.4 Projections Panel: Period Semantics

**Period Selection with "All Periods":**
- Shows all projections across all periods
- Unlike Transactions, projections don't have "expanded vs collapsed" notion
- Just displays raw projection rows

**Detail ↔ Summary View:**
- Summary: Card-based display
- Detail: Tabulator grid
- Same filters work on both

---

## 6.0 Implementation Sequence & Dependencies

### Phase 1: Architecture & State (No UI Changes Yet)
1. Define all state variables in forecast-controller.js
2. Create state interface objects for each context
3. Wire up getter/setter functions
4. Add logging to track state changes

### Phase 2: Transactions Panel Refactor
1. Move Status filter to controller state
2. Standardize detail ↔ summary filter behavior
3. Implement smart period filtering (no full reload for period change in detail view)
4. Rename "View" to "Period Type"
5. Test all filter combinations

### Phase 3: Budget Panel Enhancement
1. Add Budget grouping feature
2. Standardize period/account filters to match Transactions
3. Ensure "no All period" constraint
4. Test detail ↔ summary consistency

### Phase 4: Projections Panel Updates
1. Refine Account filter for "All Accounts" mode
2. Implement secondary account grouping
3. Rename "View By" to "Period Type"
4. Test period/account filter combinations

### Phase 5: Cross-Panel Integration
1. Test scenario change effects on all filters
2. Test view toggling with persisted state
3. Add integration tests for filter combinations
4. Verify no state leakage between contexts

### Phase 6: Documentation & Polish
1. Update internal code comments
2. Add JSDoc for filter functions
3. Consider adding UI hints in headers
4. Final QC pass

---

## 7.0 Data Flow Diagrams

### Filter Application Flow (Detail View)

```
User Action
    ↓
setValue(newValue)
    ↓
Update Controller State Variable
    ↓
Determine Action:
  ├─ Period Type → Fetch new periods, update dropdown, apply date filter
  ├─ Period → Apply date range filter (or clear for "All")
  ├─ Account → Apply perspective filter
  ├─ Group By → Call table.setGroupBy()
  └─ Status → Apply status filter
    ↓
IF Table Exists:
  ├─ Call table.setFilter() for account/status/period
  └─ Call table.setGroupBy() if needed
ELSE:
  └─ Queue reload for next render
    ↓
updateTotals()
    ↓
Render complete
```

### Scenario Change Impact

```
User Selects New Scenario
    ↓
setCurrentScenarioById(newId)
    ↓
Reset ALL Filter State:
  ├─ transactionsAccountFilterId = null
  ├─ transactionsStatusFilter = ''
  ├─ transactionsPeriod = null
  ├─ budgetAccountFilterId = null
  ├─ ... (all contexts)
  └─ ... (all three contexts)
    ↓
loadScenarioData()
    ↓
Reload All Panels:
  ├─ loadAccountsGrid()
  ├─ loadMasterTransactionsGrid()
  ├─ loadBudgetGrid()
  └─ loadProjectionsSection()
    ↓
Each Grid Reads Clean State & Initializes:
  ├─ Fetch periods for default type (Month)
  ├─ Set first account as default OR null
  ├─ No grouping applied
  └─ Apply initial filters
    ↓
Render complete
```

---

## 8.0 Edge Cases & Special Handling

### 8.1 Transactions Panel

**"All Periods" Expansion**
- When `period === null` AND `transactionsAllPeriodsExpanded === true`:
  - Show individual transaction rows (not collapsing multiple occurrences)
  - Apply grouping normally
  - Display totals as sum of all periods
  
- When `period === null` AND `transactionsAllPeriodsExpanded === false`:
  - Show deduplicated view (one row per canonical transaction)
  - Same grouping
  - Display totals for visible rows

- Need UI toggle for expansion mode (might be a button or checkbox in header)

**Period Navigation at Boundaries**
- If on first period and user clicks ◀, handle gracefully:
  - Option 1: Stay on first period
  - Option 2: Wrap to last period
  - Recommend: Option 1 (disable button at boundaries)

### 8.2 Budget Panel

**No "All Periods" Constraint**
- Period dropdown must NEVER include "All" option
- If current budget grid allows null, change it to require a selection
- Period navigation (◀ ▶) should be locked at boundaries

**Budget vs Transaction Perspective**
- Budget is transformed to perspective rows same as Transactions
- Account filter behavior identical: filters by `perspectiveAccountId`
- Grouping options same across both panels

### 8.3 Projections Panel

**"All Accounts" Duplicate Handling**
- It's OK (even expected) to have duplicate rows
- Each account's projections appear as separate rows
- User can filter to single account to see non-duplicated view
- No special "collapse" mechanism needed

**Secondary Account Grouping**
- When grouping by secondary account, rows should be transformed to show secondary perspective
- May require additional data transformation
- Ensure efficiency (don't transform entire dataset if just grouping)

---

## 9.0 Testing Strategy

### Unit Tests Needed
- [ ] State persistence across toggles
- [ ] Filter combination effects
- [ ] Period calculation (for each type: Day/Week/Month/Quarter/Year)
- [ ] Account filtering with perspective rows
- [ ] Grouping application
- [ ] Scenario reset behavior

### Integration Tests Needed
- [ ] Detail ↔ Summary view state preservation
- [ ] Account + Period filter combination
- [ ] Account + Group By combination
- [ ] Status filter + Period filter combination
- [ ] Scenario change clears all filters
- [ ] View toggle doesn't lose grouping

### Manual QC Checklist
- [ ] Period Type change updates dropdown options
- [ ] Period selector reflects new periods
- [ ] Prev/Next buttons navigate correctly
- [ ] Filters apply immediately in detail view
- [ ] Filters persist when switching to summary
- [ ] Budget "no All" constraint enforced
- [ ] Projections "All Accounts" shows duplicates
- [ ] Secondary account grouping in Projections works
- [ ] Scenario change resets all filters
- [ ] Performance acceptable with all filters applied

---

## 10.0 Naming Changes Required

| Current | New | File | Impact |
|---------|-----|------|--------|
| "View" | "Period Type" | transactions-grid.js | Dropdown label, state variable, code comments |
| "View By" | "Period Type" | forecast-projections-section.js | Same as above |
| n/a | "Group By" | budget-grid.js | NEW - add grouping feature |
| n/a | Add grouping | transactions-grid.js | May already exist, verify naming |

---

## 11.0 Known Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Period type change causes full reload (expensive) | Implement smart filtering only for date range, keep existing data when possible |
| Status filter state lost on reload | Store in controller variable, reapply on every grid load |
| Account filter behaves differently across panels | Standardize implementation pattern across all three |
| Grouping lost on scenario change | Store in controller, reapply on grid init |
| "All Periods" expansion not clearly surfaced to user | Add UI toggle (button/checkbox) with clear label |
| Budget "no All period" constraint may cause confusion | Add helpful UI indicator (disable button, hide option) |
| Performance impact of complex filtering | Monitor grid render times, optimize Tabulator queries if needed |

---

## 12.0 Success Criteria

✅ **Completed when:**

1. **State Consistency**
   - Each context (Transactions, Budget, Projections) has isolated state
   - All state variables initialized and reset properly
   - State persists across detail ↔ summary view toggle

2. **Filter Behavior Standardization**
   - Account filter works identically in all three panels
   - Period Type selector universally named and behaves consistently
   - Period selector filters output correctly in all contexts
   - Detail view uses Tabulator filtering when possible (no full reload)

3. **Feature Parity**
   - Transactions: Status filter persists correctly
   - Budget: Grouping implemented with same pattern as Transactions
   - Projections: Secondary account grouping works
   - All panels: "Period Type" renamed throughout

4. **Edge Cases Handled**
   - Scenario change resets all filters cleanly
   - Budget period selector enforces "no All"
   - Transactions "All Periods" expansion toggle works
   - Period navigation gracefully handles boundaries

5. **Documentation**
   - Code comments explain filter state management
   - JSDoc functions document filter interfaces
   - No ambiguity about filter precedence or application order

6. **Testing**
   - All unit tests pass
   - All integration tests pass
   - Manual QC checklist 100% complete
   - No regression in existing functionality

---

## Appendix A: File Modification Summary

### forecast-controller.js (2000+ lines)
- Add 20-30 state variables (3 contexts × ~7-10 vars each)
- Add state interface objects (3 × ~200 lines)
- Update `setCurrentScenarioById()` to reset filters
- Add filtering helper functions
- ~500-700 new lines

### transactions-grid.js (1365 lines)
- Update filter initialization to use new state interface
- Convert Account filter to Tabulator filtering (detail view)
- Move Status filter to state
- Remove full reload on Account change (detail view only)
- Store Grouping in controller state
- Rename "View" to "Period Type"
- ~150-200 modifications/additions

### budget-grid.js (1473 lines)
- Add grouping feature implementation (~200-300 lines new)
- Update period filter to enforce "no All" (~50 lines)
- Standardize account filter to Tabulator filtering (~100 lines)
- Update state interface usage (~100 lines)
- Rename current label to "Period Type" (~20 lines)
- ~400-500 total modifications

### forecast-projections-section.js (740 lines)
- Rename "View By" to "Period Type"
- Refine account filter for "All Accounts" mode
- Implement secondary account grouping (~150-200 lines new)
- Update state interface usage (~80 lines)
- ~250-300 modifications

### Total Estimated Changes
- ~1200-1700 lines modified/added across 4 files
- ~50-60% of changes in forecast-controller.js (state setup)
- ~15-20% in each grid file (implementation)
- No new files (refactor/enhancement only)

