# Grid State Preservation - Implementation Roadmap

**Priority**: Medium  
**Effort**: 2-4 hours for Phase 1, 4-6 hours for Phase 2  
**Benefit**: Significantly improved UX, less user frustration

---

## Phase 1: Quick Wins (1-2 hours)

### Goal
Preserve group-by selection and dropdown values during grid reloads.

### Changes Required

#### 1.1 Add State Tracking Variables (forecast.js)

```javascript
// After existing state variables (~line 46)
let transactionsGridState = { groupBy: null };
let budgetGridState = { groupBy: null };
let accountsGridState = { groupBy: null };
```

#### 1.2 Capture State Before Reload

In each load function, save state before clearing:

```javascript
async function loadMasterTransactionsGrid(container) {
  // Save group-by selection before clearing
  if (masterTransactionsTable) {
    const groupingSelect = document.getElementById('tx-grouping-select');
    if (groupingSelect) {
      transactionsGridState.groupBy = groupingSelect.value;
    }
  }
  
  container.innerHTML = '';
  // ... rest of function ...
}
```

#### 1.3 Restore State After Grid Creation

After creating the grid and attaching handlers:

```javascript
// After grid creation (after attachGridHandlers call)
if (transactionsGridState.groupBy) {
  const groupingSelect = document.getElementById('tx-grouping-select');
  if (groupingSelect) {
    groupingSelect.value = transactionsGridState.groupBy;
    // Trigger the change event to apply grouping
    groupingSelect.dispatchEvent(new Event('change'));
  }
}
```

---

## Phase 2: Scroll & Sort Persistence (2-3 hours)

### Goal
Preserve scroll position, sort state, and apply filters immediately after reload.

### New Utility Module (grid-state.js)

```javascript
// js/grid-state.js

export class GridStateManager {
  constructor(name) {
    this.name = name;
    this.state = {
      scrollTop: 0,
      sortBy: [],
      groupBy: null,
      filterFunctions: []
    };
  }

  /**
   * Capture current grid state before reload
   */
  capture(table, dropdownSelectors = {}) {
    if (!table) return;

    this.state.scrollTop = table.element?.scrollTop || 0;
    this.state.sortBy = table.getSortedColumns?.() || [];
    this.state.groupBy = table.options?.groupBy || null;

    // Also capture dropdown values
    Object.entries(dropdownSelectors).forEach(([key, selector]) => {
      const element = document.querySelector(selector);
      this.state[key] = element ? element.value : null;
    });
  }

  /**
   * Restore grid state after reload
   */
  restore(table, options = {}) {
    if (!table) return;

    const { applyFilters = true, restoreScroll = true } = options;

    // Restore sort
    if (this.state.sortBy.length > 0 && table.setSort) {
      table.setSort(this.state.sortBy);
    }

    // Restore grouping
    if (this.state.groupBy && table.setGroupBy) {
      table.setGroupBy(this.state.groupBy);
    }

    // Restore scroll position
    if (restoreScroll && this.state.scrollTop > 0) {
      setTimeout(() => {
        if (table.element) {
          table.element.scrollTop = this.state.scrollTop;
        }
      }, 50);
    }
  }

  /**
   * Restore dropdown values (triggers change events)
   */
  restoreDropdowns(dropdownSelectors = {}) {
    Object.entries(dropdownSelectors).forEach(([key, selector]) => {
      const element = document.querySelector(selector);
      if (element && this.state[key]) {
        element.value = this.state[key];
        element.dispatchEvent(new Event('change'));
      }
    });
  }

  clear() {
    this.state = {
      scrollTop: 0,
      sortBy: [],
      groupBy: null,
      filterFunctions: []
    };
  }
}
```

### Integration in forecast.js

```javascript
import { GridStateManager } from './grid-state.js';

// Initialize managers (~line 46)
const transactionsGridState = new GridStateManager('transactions');
const budgetGridState = new GridStateManager('budget');
const accountsGridState = new GridStateManager('accounts');

// In loadMasterTransactionsGrid:
async function loadMasterTransactionsGrid(container, options = {}) {
  const { preserveState = true } = options;

  // Capture state before reload
  if (preserveState) {
    transactionsGridState.capture(masterTransactionsTable, {
      accountFilter: '#account-filter-select',
      periodType: '#tx-period-type-select',
      period: '#actual-period-select'
    });
  }

  container.innerHTML = '';
  // ... build grid ...

  // Restore state after grid creation
  if (preserveState) {
    setTimeout(() => {
      transactionsGridState.restore(masterTransactionsTable);
      transactionsGridState.restoreDropdowns({
        groupBy: '#tx-grouping-select'
      });
    }, 100);
  }
}
```

---

## Phase 3: Smart Reload Strategy (1-2 hours)

### Goal
Avoid full reloads for single-row operations where possible.

### Changes

#### 3.1 Update Grid In-Place

Instead of `await loadMasterTransactionsGrid(container)`, use:

```javascript
async function updateTransactionsGridData(newTransactions) {
  if (masterTransactionsTable) {
    // Preserve current state
    const state = captureGridState(masterTransactionsTable);
    
    // Update data only
    masterTransactionsTable.setData(newTransactions);
    
    // Restore state
    restoreGridState(masterTransactionsTable, state);
  } else {
    // Fall back to full reload if table doesn't exist
    await loadMasterTransactionsGrid(container);
  }
}
```

#### 3.2 Determine When to Preserve

```javascript
// Delete action: preserve state (same grid, just fewer rows)
const allTxs = await getTransactions(currentScenario.id);
const filteredTxs = allTxs.filter(tx => tx.id !== Number(actualTxId));
await TransactionManager.saveAll(currentScenario.id, filteredTxs);
await updateTransactionsGridData(transformedData);  // ← Preserve state

// Scenario change: clear state
currentScenario = await getScenario(scenario.id);
await loadMasterTransactionsGrid(container, { preserveState: false });  // ← Clear state
```

---

## Implementation Checklist

- [ ] Add `grid-state.js` utility module
- [ ] Add state variables to forecast.js
- [ ] Modify `loadMasterTransactionsGrid()` to use GridStateManager
- [ ] Modify `loadBudgetGrid()` to use GridStateManager
- [ ] Modify `loadAccountsGrid()` to use GridStateManager
- [ ] Update delete handlers to use state preservation
- [ ] Update edit handlers to use state preservation
- [ ] Test group-by persistence on grid reload
- [ ] Test scroll position restoration
- [ ] Test sort state persistence
- [ ] Test with multiple reload scenarios (delete, create, edit)

---

## Testing Scenarios

1. **Group by Type** → Delete transaction → Verify grouping persists
2. **Scroll to bottom** → Create transaction → Verify scroll position restored
3. **Sort by Amount** → Edit transaction → Verify sort persists
4. **Filter by Account** → Delete transaction → Verify filter persists
5. **Switch scenarios** → Verify state cleared correctly

---

## Potential Risks

1. **Memory Leaks**: State objects could hold references. Mitigate by clearing on scenario switch.
2. **Stale Filter Functions**: Filter functions might reference old data. Store field names instead of functions.
3. **Large Datasets**: Scroll restoration on huge grids might be sluggish. Defer with setTimeout.
4. **Flipped Rows**: When perspective changes, scroll position becomes invalid. Skip restoration in those cases.

---

## Future Enhancements

- Browser session storage for state persistence across page reloads
- Undo/redo functionality (state snapshots)
- User preferences for default grouping/sorting
- Remember last filter/sort per scenario type
