# Next Release Bug Fix Tracker

**Version**: 0.8.0-beta (Target)  
**Last Updated**: February 1, 2026  
**Status**: Tracking bugs for next release

---

## 1.0 Bug Status Legend

- 🔴 **Critical**: Blocks core functionality, must fix before release
- 🟡 **High**: Important but workaround exists
- 🟢 **Medium**: Should fix but not blocking
- 🔵 **Low**: Nice to have, cosmetic issues

---

## 2.0 Active Bugs

### 2.1 Critical Bugs (🔴)

#### [BUG-004] One-time transactions before scenario start date are excluded from first period 🔴

**Status**: 🔴  
**Reported**: 2026-02-01  
**Component**: Projections / Transaction Expander  
**Affects**: Projection calculations and transaction grid display for first period  

**Description**:  
One-time transactions that occur between the aligned period start date and the scenario start date are not included in projections or the transaction grid. This causes incorrect financial projections and missing transactions in the first period view.

**Reproduction Steps**:  
1. Create a scenario with start date January 15, 2026 and end date December 31, 2026
2. Create a one-time transaction on January 10, 2026
3. Generate projections (monthly periodicity)
4. View the first period (January 2026) in the transactions grid
5. Observe that the transaction from January 10 is not included in projections or grid

**Expected Behavior**:  
When periods are aligned to boundaries (e.g., monthly periods aligned to first of month), all transactions within those aligned period boundaries should be included, even if they occur before the scenario's start date.

For example, if scenario starts January 15:
- First period should be January 1-31, 2026
- Transactions on January 1-14 should be included in the first period
- Projections should correctly reflect these transactions

**Actual Behavior**:  
The projection engine aligns periods to boundaries (January 1 for monthly), but the transaction expander uses the original scenario start date (January 15) as the filter. This creates a gap where transactions from January 1-14 are excluded.

**Root Cause Analysis**:  
**Files**: [js/projection-engine.js](../js/projection-engine.js), [js/transaction-expander.js](../js/transaction-expander.js)  

1. **Projection Engine** (lines 236-251):
   - For monthly periods, `currentStart` is aligned to first of month
   - First period runs from January 1 to January 31
   
2. **Transaction Expander** (line 48):
   - Uses original `startDate` parameter (scenario start date = January 15)
   - Filters: `if (txDate && txDate >= startDate && txDate <= endDate)`
   - Excludes transactions from January 1-14

3. **Mismatch**: Period boundaries don't match transaction filtering boundaries

**Fix Required**:  
Option 1 (Recommended - Align expander to period boundaries):
1. In `expandTransactions()`, calculate aligned period start based on the periodicity
2. Use aligned start date instead of raw scenario start date for filtering
3. Ensure consistency between `generatePeriods()` alignment logic and expander filtering

Option 2 (Alternative - Don't align periods):
1. Modify `generatePeriods()` to not align to boundaries
2. Start first period on exact scenario start date
3. May result in partial periods (e.g., January 15-31)

Option 3 (Document and accept):
1. Update documentation to warn users that transactions before scenario start are excluded
2. Recommend setting scenario start to first of month for monthly periods
3. Less user-friendly, doesn't fix the issue

**Recommended Fix**: Option 1 - Update `expandTransactions()` to accept and use aligned period boundaries when expanding one-time transactions.

**Fixed**: Not yet  
**Commit**: N/A

---

### 2.2 High Priority Bugs (🟡)

#### [BUG-005] Projections grid lacks period selector and view options 🟡

**Status**: 🟡  
**Reported**: 2026-02-01  
**Component**: Projections  
**Affects**: Projections grid toolbar and filtering  

**Description**:  
The projections grid is missing critical filtering and viewing controls that are available in the transactions and budget grids. Users cannot filter by period type, select specific periods, or use enhanced grouping options, making it difficult to analyze projections effectively.

**Reproduction Steps**:  
1. Navigate to Forecast page with a scenario that has projections
2. Compare the Transactions section toolbar with the Projections section toolbar
3. Observe that Projections is missing:
   - "View By" period type selector (Day/Week/Month/Quarter/Year)
   - Period dropdown filter
   - Previous/Next period navigation buttons
   - Extended grouping options (only has Account, missing date-based grouping)

**Expected Behavior**:  
The projections grid should have feature parity with the transactions and budget grids:
1. **Period Type Selector**: Allow users to view projections by Day/Week/Month/Quarter/Year
2. **Period Filter**: Dropdown to select specific periods (e.g., "January 2026", "Q1 2026")
3. **Period Navigation**: Previous/Next buttons to move between periods
4. **Enhanced Grouping**: Additional grouping options like:
   - Date (group by projection date)
   - Account (already exists)
   - Month (for yearly views)
   - Quarter (for yearly views)
5. **Totals Toolbar**: Display totals for filtered/visible projections (related to BUG-001)

**Actual Behavior**:  
Projections section only has:
- Account filter dropdown (lines 1963-1970)
- Basic grouping with only "Account" option (lines 1973-1983)
- No period-based filtering or navigation

All projection periods are always displayed with no way to filter or navigate through them.

**Analysis**:  
**File(s)**: [js/forecast.js](../js/forecast.js)  
**Issue**: The `loadProjectionsSection()` function (starting line 1874) creates a minimal toolbar compared to `loadMasterTransactionsGrid()` (line 765) and budget section.

Comparison of toolbar controls:

**Transactions/Budget sections have:**
- Period type selector (lines 856-868, 1456-1468)
- Period dropdown with All/specific periods (lines 872-886, 1472-1486)
- Previous/Next period navigation buttons (lines 925-937, 1539-1551)
- Account filter (lines 888-894, 1488-1494)
- Grouping controls with multiple options (lines 848-854, 1448-1454)

**Projections section has:**
- Account filter only (lines 1963-1970)
- Basic grouping with only "Account" option (lines 1973-1983)

**Fix Required**:  
1. Add period type selector to projections toolbar (similar to transactions)
2. Add period filter dropdown with dynamically generated periods
3. Add previous/next navigation buttons
4. Store projection period state variables (similar to `actualPeriod` and `actualPeriodType`)
5. Implement filtering logic to show only projections for selected period
6. Enhance grouping options to include:
   - Date-based grouping
   - Period-based grouping for rolled-up views
7. Update `loadProjectionsGrid()` to respect period filter
8. Create totals toolbar and update calculation function (also fixes BUG-001)

**Implementation Notes**:
- Projections are already date-based, so filtering by period is straightforward
- Need to calculate periods using `getScenarioPeriods()` like transactions do
- Should reuse similar event handler patterns from transactions section
- Consider whether period filtering should trigger re-generation or just filter existing data

**Fixed**: Not yet  
**Commit**: N/A

---

### 2.3 Medium Priority Bugs (🟢)

#### [BUG-003] Cannot edit transaction date when period is selected 🟢

**Status**: 🟢  
**Reported**: 2026-02-01  
**Component**: Transactions  
**Affects**: Date editing in transaction grid when period filter is active  

**Description**:  
When a period is selected in the transactions grid, users cannot successfully edit the transaction date. The date column appears editable, but changes are not persisted because the column is bound to a computed display field instead of the canonical data field.

**Reproduction Steps**:  
1. Navigate to Forecast page with a scenario containing transactions
2. Go to Transactions section
3. Select a specific period from the period dropdown (not "All Periods")
4. Try to edit the date of a transaction by double-clicking the Date column
5. Change the date and confirm
6. Observe that the grid reloads but the date change is not saved

**Expected Behavior**:  
When a period is selected, the date column should be editable and changes should persist to the transaction's `effectiveDate` field in the canonical data structure.

**Actual Behavior**:  
The date column is bound to the computed field `displayDate` (line 1203) instead of `effectiveDate`. When the user edits it:
1. The cell editor opens successfully (field appears editable)
2. `cellEdited` handler fires with field='displayDate' and the new value
3. `mapEditToCanonical()` sets `updated.displayDate = value` via the fallback else clause
4. Transaction is saved with `displayDate` field (which is not a canonical field)
5. Grid reloads and regenerates `displayDate` from original `effectiveDate`, losing the edit

**Analysis**:  
**File(s)**: [js/forecast.js](../js/forecast.js), [js/transaction-row-transformer.js](../js/transaction-row-transformer.js)  
**Issue**: 
1. Line 1203 in forecast.js: Date column uses field `'displayDate'` instead of canonical field
2. Lines 1040-1043: `displayDate` is computed for display: uses `actualDate` for actual transactions, `effectiveDate` for planned
3. `mapEditToCanonical()` in transaction-row-transformer.js doesn't have special handling for `displayDate` field
4. When `displayDate` is edited, it doesn't map back to the underlying `effectiveDate` or `actualDate` fields

**Fix Required**:  
Option 1 (Preferred - Map displayDate to canonical field):
1. In `mapEditToCanonical()` function, add special handling for `displayDate` field
2. Map `displayDate` edits to `effectiveDate` for planned transactions
3. For actual transactions, consider whether editing should update `actualDate` or `effectiveDate`

Option 2 (Alternative - Bind to canonical field directly):
1. Change the date column field from `'displayDate'` to `'effectiveDate'`
2. Update the formatter to show `actualDate` when status is 'actual' and `actualDate` exists
3. Add custom cell editor logic to handle which field gets updated based on transaction status

Option 3 (Simplest - Make non-editable):
1. Add `editor: false` to the date column when period is selected
2. Forces users to use "All Periods" view to edit dates (less user-friendly)

**Fixed**: Not yet  
**Commit**: N/A

---

#### [BUG-002] Transaction grid doesn't update properly after creating new transaction 🟢

**Status**: 🟢  
**Reported**: 2026-02-01  
**Component**: Transactions  
**Affects**: Grid refresh and visual feedback after transaction creation  

**Description**:  
When creating a new transaction via the "+ Add New Transaction" button, the grid doesn't update smoothly. The entire container is wiped and rebuilt, causing visual flickering and requiring users to manually verify the transaction was added.

**Reproduction Steps**:  
1. Navigate to Forecast page with a scenario
2. Go to Transactions section
3. Click "+ Add New Transaction" button
4. Observe the grid refresh behavior
5. Note that the entire UI flickers/rebuilds

**Expected Behavior**:  
After creating a transaction, the grid should smoothly update to show the new transaction row without completely destroying and rebuilding the entire container. Ideally, Tabulator's `addRow()` or `setData()` should be used for incremental updates.

**Actual Behavior**:  
The `loadMasterTransactionsGrid(container)` function (line 765) immediately calls `container.innerHTML = ''` (line 779), which destroys the entire toolbar and grid. The container is then completely rebuilt from scratch, causing flickering and potential event handler issues.

**Analysis**:  
**File(s)**: [js/forecast.js](../js/forecast.js)  
**Issue**: 
1. Line 779: `container.innerHTML = ''` destroys the entire container including toolbar, filters, and grid
2. Line 1087: New grid instance created without destroying old instance (potential memory leak)
3. No proper cleanup of old `masterTransactionsTable` instance before reassignment
4. After transaction creation (line 833), the grid rebuild is heavy-handed when only data update is needed

**Fix Required**:  
Option 1 (Incremental Update - Preferred):
1. After creating a transaction, use `masterTransactionsTable.addRow()` or `masterTransactionsTable.setData()` to update just the data
2. Reload currentScenario to get updated data
3. Transform new transaction data and add to existing grid
4. Update totals with `updateTransactionTotals()`

Option 2 (Better Rebuild):
1. Before `container.innerHTML = ''`, call `masterTransactionsTable?.destroy()` to properly cleanup
2. Consider only rebuilding the grid container, not the toolbar
3. Separate toolbar creation from grid creation for better control

**Fixed**: Not yet  
**Commit**: N/A

---

#### [BUG-001] Projection totals not displayed on initial load 🟢

**Status**: 🟢  
**Reported**: 2026-02-01  
**Component**: Forecast / Projections  
**Affects**: Projection totals toolbar display  

**Description**:  
Projection totals (Income, Expenses, Net) are not displayed when the projections section first loads. Totals only appear after changing the account filter dropdown.

**Reproduction Steps**:  
1. Navigate to Forecast page with a scenario that has projections
2. View the Projections section
3. Observe that the toolbar totals area is empty
4. Change the account filter dropdown
5. Totals now appear

**Expected Behavior**:  
Projection totals should display immediately when projections section loads, showing Income, Expenses, and Net values for all accounts (or filtered account if previously selected).

**Actual Behavior**:  
The totals toolbar element is not created during initial `loadProjectionsSection()` execution. Totals only render when the account filter change event fires (lines 2049-2069 in forecast.js).

**Analysis**:  
**File(s)**: [js/forecast.js](../js/forecast.js)  
**Issue**: The `loadProjectionsSection()` function creates toolbar with buttons, account filter, and grouping controls, but never creates the `.toolbar-totals` element that displays the projection totals. The totals calculation and rendering only exists in the account filter change event handler (lines 2049-2069).

**Fix Required**:  
1. Add a `.toolbar-totals` div element to the toolbar in `loadProjectionsSection()` (similar to how transactions and budgets sections create theirs)
2. Create a dedicated `updateProjectionTotals()` function (similar to `updateTransactionTotals()` and `updateBudgetTotals()`)
3. Call this function after initial grid load in `loadProjectionsSection()`
4. Call this function in the account filter change handler instead of inline totals calculation
5. Ensure totals update when projections are regenerated or cleared

**Fixed**: Not yet  
**Commit**: N/A

---

### 2.4 Low Priority Bugs (🔵)

*No low priority bugs currently tracked*

---

## 3.0 Fixed Bugs

*Bugs will be moved here when fixed*

---

## 4.0 Bug Template

When adding a new bug, use this format:

```
#### [BUG-XXX] Short Bug Title (Priority Icon)

**Status**: 🔴/🟡/🟢/🔵  
**Reported**: YYYY-MM-DD  
**Component**: [Scenarios/Accounts/Transactions/Budgets/Forecast/UI/Data]  
**Affects**: [Feature or area affected]  

**Description**:  
[Brief description of the bug]

**Reproduction Steps**:  
1. Step 1
2. Step 2
3. Step 3

**Expected Behavior**:  
[What should happen]

**Actual Behavior**:  
[What actually happens]

**Analysis**:  
**File(s)**: [path/to/file.js]  
**Issue**: [Root cause analysis]  
**Fix Required**: [Description of what needs to change]

**Fixed**: [YYYY-MM-DD or "Not yet"]  
**Commit**: [commit hash when fixed]
```

---

## 5.0 Notes

- Bug numbers use format: BUG-001, BUG-002, etc.
- When a bug is fixed, move to section 3.0 and update CHANGELOG.md
- Update QC_CHECKLIST.md if bug reveals missing test coverage
