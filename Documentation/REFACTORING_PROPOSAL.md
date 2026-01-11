# FTrack Refactoring Proposal

**Version**: 1.0.0  
**Date**: January 11, 2026  
**Purpose**: Simplify codebase, reduce redundancy, improve maintainability

---

## 1.0 Current Problems

1.1 **Code Fragmentation**: Same patterns repeated across accounts.js, transactions.js, forecast.js  
1.2 **Tight Coupling**: Changes in one area break unrelated features  
1.3 **Over-Engineering**: Schema-driven architecture adds complexity without proportional benefit  
1.4 **Manual Grid Implementation**: 1,155 lines of custom grid code (editable-grid.js)  
1.5 **Redundant Functions**: 40+ specialized data-manager functions doing similar CRUD operations  
1.6 **Custom Financial Logic**: Hand-rolled recurrence and compound interest calculations

## 2.0 Proposed Architecture

### 2.1 Simplified Layers

```
┌─────────────────────────────────────┐
│  Pages (forecast.html, etc.)        │  ← Minimal: Just layout + initialization
├─────────────────────────────────────┤
│  UI Library (Tabulator.js)          │  ← Handles all grid rendering, editing, events
├─────────────────────────────────────┤
│  Business Logic Layer               │  ← Central location for rules, calculations, transformations
│  - ScenarioManager                  │
│  - AccountManager                   │
│  - TransactionManager               │
│  - ProjectionService                │
├─────────────────────────────────────┤
│  Data Layer (CRUD)                  │  ← Generic: read(), write(), query()
│  - data-store.js                    │
├─────────────────────────────────────┤
│  Financial Engine                   │  ← Library: financejs or similar
└─────────────────────────────────────┘
```

### 2.2 Key Principles

2.2.1 **DRY (Don't Repeat Yourself)**: One implementation per concept  
2.2.2 **Separation of Concerns**: UI ≠ Logic ≠ Data  
2.2.3 **Library Over Custom**: Use proven libraries where possible  
2.2.4 **Centralized Logic**: Business rules in one predictable location

## 3.0 Recommended Libraries

### 3.1 UI Grid: Tabulator.js

**Why Tabulator**:
- Vanilla JavaScript (no framework required)
- Built-in editing, validation, sorting, filtering
- Modal/popup editors supported
- Keyboard shortcuts included
- Tree data support (for nested transactions)
- Small footprint (~100KB)
- Free and MIT licensed

**What it replaces**:
- Entire editable-grid.js (1,155 lines)
- Custom event handling
- Custom cell editing
- Manual schema interpretation

**Example**:
```javascript
// Current: 50+ lines of schema + grid initialization
// With Tabulator: 10 lines
const table = new Tabulator("#accountsTable", {
    data: accounts,
    columns: [
        {title: "Name", field: "name", editor: "input"},
        {title: "Balance", field: "balance", editor: "number"}
    ],
    rowClick: (e, row) => AccountManager.selectAccount(row.getData())
});
```

### 3.2 Financial Calculations: financejs

**Why financejs**:
- Compound interest calculations
- Present/future value
- Amortization schedules
- NPM package, well-maintained
- Accurate decimal handling

**What it replaces**:
- Custom compound interest logic in calculation-utils.js
- Manual periodic change calculations
- Future value projections

**Example**:
```javascript
// Current: Custom implementation
// With financejs:
import Finance from 'financejs';
const finance = new Finance();
const futureValue = finance.FV(rate, nper, pmt, pv, type);
```

### 3.3 Date Handling: date-fns (already lightweight)

**Consider**: Keep existing recurrence logic OR use rrule library for standard recurrence patterns

## 4.0 Proposed New Structure

### 4.1 File Organization

```
js/
├── core/
│   ├── data-store.js          # Generic CRUD (100 lines)
│   └── app-init.js            # App initialization
├── managers/
│   ├── scenario-manager.js    # Scenario business logic
│   ├── account-manager.js     # Account business logic
│   ├── transaction-manager.js # Transaction business logic
│   └── projection-service.js  # Projection generation
├── ui/
│   ├── grid-factory.js        # Tabulator grid configurations
│   └── modal-factory.js       # Modal configurations
└── utils/
    ├── date-utils.js          # Date/recurrence helpers
    └── validation.js          # Data validation
```

### 4.2 Eliminated Files

- ~~editable-grid.js~~ (replaced by Tabulator)
- ~~modal.js~~ (replaced by Tabulator modals or simple HTML modals)
- ~~config.js~~ (shortcuts handled by Tabulator)
- ~~data-manager.js~~ (split into managers + data-store)

### 4.3 Reduced Line Count Estimate

| Current File | Lines | New Approach | Estimated Lines | Savings |
|--------------|-------|--------------|-----------------|---------|
| editable-grid.js | 1,155 | Tabulator config | 200 | -955 |
| data-manager.js | 808 | data-store.js + managers | 400 | -408 |
| forecast.js | 1,426 | Simplified controller | 300 | -1,126 |
| calculation-utils.js | 218 | financejs + helpers | 100 | -118 |
| **Total** | **~4,000** | **New total** | **~1,500** | **-2,500** |

## 5.0 Implementation Strategy

### 5.1 Phase 1: Add Libraries (Low Risk)

5.1.1 Install Tabulator.js  
5.1.2 Install financejs  
5.1.3 Create proof-of-concept for one grid (Accounts)  
5.1.4 Verify functionality matches current behavior

### 5.2 Phase 2: Refactor Data Layer (Medium Risk)

5.2.1 Create data-store.js with generic CRUD  
5.2.2 Create scenario-manager.js with business logic  
5.2.3 Migrate scenario operations  
5.2.4 Test thoroughly

### 5.3 Phase 3: Refactor UI Layer (Medium Risk)

5.3.1 Create grid-factory.js  
5.3.2 Migrate accounts grid to Tabulator  
5.3.3 Migrate transactions grid to Tabulator  
5.3.4 Remove editable-grid.js

### 5.4 Phase 4: Simplify Page Controllers (Low Risk)

5.4.1 Reduce forecast.js to initialization only  
5.4.2 Remove redundant helper functions  
5.4.3 Consolidate common patterns

### 5.5 Phase 5: Replace Financial Calculations (Low Risk)

5.5.1 Integrate financejs  
5.5.2 Replace compound interest calculations  
5.5.3 Test projection accuracy

## 6.0 Benefits

6.1 **Maintainability**: 2,500 fewer lines to maintain  
6.2 **Reliability**: Battle-tested libraries vs custom code  
6.3 **Debugging**: Smaller codebase = easier troubleshooting  
6.4 **Features**: Tabulator includes sorting, filtering, export, themes  
6.5 **Consistency**: Single grid implementation = predictable behavior  
6.6 **Performance**: Optimized libraries vs unoptimized custom code

## 7.0 Risks & Mitigation

### 7.1 Risks

7.1.1 **Learning Curve**: New library APIs to learn  
7.1.2 **Migration Effort**: Time to refactor existing code  
7.1.3 **Compatibility**: Ensuring Electron compatibility  
7.1.4 **Feature Parity**: Ensuring all current features work

### 7.2 Mitigation

7.2.1 **Proof-of-Concept First**: Validate approach before full migration  
7.2.2 **Incremental Migration**: One component at a time  
7.2.3 **Git Branches**: Refactor in feature branch, easy rollback  
7.2.4 **Comprehensive Testing**: Manual testing of all features after each phase

## 8.0 Alternative: Hybrid Approach

If full migration seems too risky:

8.1 **Keep EditableGrid** but simplify it (remove unused features)  
8.2 **Add financejs** for calculations only  
8.3 **Refactor data-manager** to centralized managers + CRUD  
8.4 **Gradual migration** to Tabulator for new features only

## 9.0 Storage Layer Improvements

### 9.1 Current Issues

**Path Handling Inconsistencies**:
- app-paths.js manually calculates userData path
- main.js uses app.getPath('userData')
- Different logic in dev vs production
- Hard to test or swap storage backends

**Future Extensibility**:
- Need to support server storage later
- Need to support mobile storage later
- Currently tightly coupled to filesystem

### 9.2 Proposed Storage Abstraction

Create a clean storage interface that works now and extends later:

```javascript
// core/storage-adapter.js
export class StorageAdapter {
  async read(key) { /* abstract */ }
  async write(key, data) { /* abstract */ }
  async exists(key) { /* abstract */ }
}

// core/electron-storage.js
export class ElectronStorage extends StorageAdapter {
  constructor() {
    // Uses Electron's app.getPath('userData') - reliable cross-platform
    // Renderer process gets path from main via IPC or preload
  }
  
  async read(key) {
    // Always reads from correct userData location
    // Works on Windows, Mac, Linux consistently
  }
  
  async write(key, data) {
    // Atomic writes, creates directories automatically
  }
}

// Future: core/server-storage.js
export class ServerStorage extends StorageAdapter {
  async read(key) { /* fetch from API */ }
  async write(key, data) { /* POST to API */ }
}
```

**Benefits**:
- Single source of truth for paths (main.js app.getPath)
- Renderer gets path via preload API (no manual calculation)
- Easy to swap localStorage, IndexedDB, or server later
- Testable (mock storage adapter)

### 9.3 Recommended Approach for Now

**Keep it simple**:
1. Use Electron's built-in `app.getPath('userData')` in main.js (already doing this)
2. Expose path to renderer via preload.js context bridge
3. Keep single JSON file storage (simple, portable, works offline)
4. Add storage adapter layer when/if server storage is needed

**Don't over-engineer**:
- No need for complex database now
- File system is fine for single-user app
- Abstract later when requirements are clear

## 10.0 Next Steps

### Option A: Full Refactor (Recommended)
10.1 ~~Create new branch: `refactor/simplify-architecture`~~ ✓ Done  
10.2 Fix storage path handling (5.3 above)  
10.3 Install Tabulator.js and financejs  
10.4 Build proof-of-concept for Accounts grid  
10.5 Review and decide on full migration

### Option B: Targeted Improvements
10.1 Refactor data-manager.js into managers pattern  
10.2 Add financejs for calculations  
10.3 Simplify EditableGrid by removing unused features  
10.4 Continue with current architecture

### Option C: Research & Design
10.1 Create detailed technical design document  
10.2 Prototype multiple approaches  
10.3 Benchmark performance  
10.4 Make data-driven decision

---

**Recommendation**: Start with **Option A** proof-of-concept. Fix storage paths first (quick win), then tackle grid refactoring. The 60% code reduction and improved maintainability justify the effort.

**Applied Rules**: 1.0, 1.1, 2.0, 5.5, 6.1, 6.4
