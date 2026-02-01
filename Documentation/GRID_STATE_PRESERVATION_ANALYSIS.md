# Grid State Preservation Analysis

**Date**: 1 February 2026  
**Issue**: Losing group-by and filtering options when grids reload

---

## 1.0 Current Problem

When any grid reloads (e.g., after deleting a transaction, editing a cell, creating a new item), the user loses:
- Group-by settings
- Filtering selections
- Scroll position
- Sorting state
- Search state

### 1.1 Why This Happens

The reload functions (`loadMasterTransactionsGrid`, `loadBudgetGrid`, etc.) completely recreate the grid:
- Destroy old table instance
- Clear container HTML
- Create new grid from scratch
- Re-apply filters/grouping from selectors

Between grid destruction and recreation, brief moments of lost state cause UI flicker.

---

## 2.0 Existing State Management

### 2.1 Partially Preserved State

Some state IS already preserved as global variables:

```javascript
let transactionFilterAccountId = null;      // ✓ Account filter
let actualPeriod = null;                     // ✓ Period selection
let actualPeriodType = 'Month';              // ✓ Period type
let budgetPeriod = null;                     // ✓ Budget period
let budgetPeriodType = 'Month';              // ✓ Budget period type
let masterTransactionsTable = null;          // Table instance
let masterBudgetTable = null;                // Table instance
```

### 2.2 Lost State

Currently **NOT** preserved:
- Group-by field selection
- Custom scroll position
- Sorting configuration
- Search terms
- Row selection
- Column visibility
- Column width customization

---

## 3.0 Solution Approach

### 3.1 Preserve Grid UI State

Add global state objects to track grid settings:

```javascript
let transactionsGridState = {
  groupBy: null,              // Current group-by field
  sortBy: null,               // Current sort configuration
  searchTerm: null,           // Current search term
  scrollPosition: 0           // Scroll position
};

let budgetGridState = {
  groupBy: null,
  sortBy: null,
  searchTerm: null,
  scrollPosition: 0
};
```

### 3.2 Capture State Before Reload

Before destroying the grid, save its state:

```javascript
function captureGridState(table) {
  if (!table) return null;
  
  return {
    groupBy: table.options.groupBy || null,
    sortBy: table.getSortedColumns(),
    searchTerm: table.getSearchTerm ? table.getSearchTerm() : null,
    scrollPosition: table.element.scrollTop || 0
  };
}
```

### 3.3 Restore State After Reload

After grid creation, restore saved state:

```javascript
function restoreGridState(table, state) {
  if (!table || !state) return;
  
  if (state.groupBy) {
    table.setGroupBy(state.groupBy);
  }
  
  if (state.sortBy && state.sortBy.length > 0) {
    table.setSort(state.sortBy);
  }
  
  if (state.scrollPosition) {
    setTimeout(() => {
      table.element.scrollTop = state.scrollPosition;
    }, 10);
  }
}
```

---

## 4.0 Implementation Strategy

### 4.1 Refactor Grid Load Functions

Modify `loadMasterTransactionsGrid` and `loadBudgetGrid`:

```javascript
async function loadMasterTransactionsGrid(container, preserveState = true) {
  // 1. Capture current state if preserving
  let savedState = null;
  if (preserveState && masterTransactionsTable) {
    savedState = captureGridState(masterTransactionsTable);
  }
  
  // 2. Clear container (as before)
  container.innerHTML = '';
  
  // ... build grid as before ...
  
  // 3. Restore state after grid creation
  if (preserveState && savedState) {
    restoreGridState(masterTransactionsTable, savedState);
  }
}
```

### 4.2 Create Utility Module

Create `js/grid-state.js` for centralized state management:

```javascript
export class GridState {
  constructor(name) {
    this.name = name;
    this.state = {
      groupBy: null,
      sortBy: null,
      searchTerm: null,
      scrollPosition: 0
    };
  }
  
  capture(table) { /* ... */ }
  restore(table) { /* ... */ }
  clear() { /* ... */ }
}
```

### 4.3 Handle Selective Reloads

Some reloads should NOT preserve state (e.g., switching scenarios):

```javascript
// Preserve state (user deleted a row)
await loadMasterTransactionsGrid(container, true);

// Clear state (user changed scenario)
await loadMasterTransactionsGrid(container, false);
```

---

## 5.0 Challenges & Considerations

### 5.1 Search Functionality

Tabulator's search API is limited. Need to verify `getSearchTerm()` availability.

### 5.2 Column State

Column visibility and width are harder to preserve without Tabulator's `persistenceID` feature.

### 5.3 Flipped Row Handling

When account perspective changes, grid must rerender - can't preserve exact scroll position as rows change count.

### 5.4 Performance

Frequent state capture/restore could impact performance on large datasets. Consider debouncing.

---

## 6.0 Priority Implementation

### 6.1 High Priority (Quick Wins)
- [ ] Preserve group-by field selection
- [ ] Restore account filter dropdown value
- [ ] Restore period selection dropdown

### 6.2 Medium Priority
- [ ] Scroll position restoration
- [ ] Sort column state
- [ ] Account grouping in accounts grid

### 6.3 Low Priority (Complex)
- [ ] Search term preservation
- [ ] Column width/visibility
- [ ] Row selection state

---

## 7.0 Alternatives to Full Reload

Instead of reloading, consider:

### 7.1 Update Grid Data In-Place

```javascript
// Instead of reloading, update data:
masterTransactionsTable.replaceData(newTransactions);
```

**Pros**: Preserves all UI state automatically  
**Cons**: More complex change detection, flipped rows complication

### 7.2 Incremental Updates

```javascript
// Add new row:
table.addRow(newData);

// Remove row:
table.deleteRow(rowIndex);

// Update row:
table.updateRow(rowIndex, updatedData);
```

**Pros**: Minimal disruption  
**Cons**: Complex logic for cascading updates

---

## 8.0 Recommendation

**Hybrid Approach**:

1. **Immediate**: Preserve group-by and filter dropdowns (low effort)
   - Save groupBy field to state before reload
   - Reapply after grid creation
   - Also restore dropdown UI values

2. **Short-term**: Implement grid state preservation utility
   - Create `grid-state.js` module
   - Capture/restore in load functions
   - Focus on group-by and scroll position

3. **Long-term**: Migrate to incremental updates where possible
   - Avoid full reloads for single-row operations
   - Use `replaceData()` for batch updates

---

## 9.0 Code Locations

**Files to Modify**:
- `js/forecast.js` - Add state variables and capture/restore logic
- `js/grid-factory.js` - Consider adding state management helpers

**Files to Create**:
- `js/grid-state.js` - Centralized state management utility

**Affected Functions**:
- `loadMasterTransactionsGrid()` - ~520 lines
- `loadBudgetGrid()` - ~420 lines
- `loadAccountsGrid()` - ~160 lines
- `loadProjectionsGrid()` - ~100 lines
