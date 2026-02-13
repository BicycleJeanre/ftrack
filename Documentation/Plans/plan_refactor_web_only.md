# Refactor Plan: Web-Only Architecture

**Version**: 1.0.0  
**Date**: February 13, 2026  
**Status**: Planning  
**Constraint**: Move functions only - NO logic changes

---

## 1.0 Objective

Reorganize ftrack codebase from Electron hybrid to clean web-only architecture by moving functions to their proper layers WITHOUT changing any logic.

**Key Principles**:
- Move functions, do not modify their implementation
- Reorganize imports, do not rewrite code
- Update file paths, preserve all behavior
- Fix duplication by deletion, not modification

---

## 2.0 Execution Strategy

### 2.1 Staged Approach

Execute in 7 sequential phases to avoid breaking dependencies:

1. **Phase 1**: Create new directory structure (no code changes)
2. **Phase 2**: Move shared utilities (no dependencies on other modules)
3. **Phase 3**: Create calculation engine (consolidate working implementations)
4. **Phase 4**: Move domain layer modules
5. **Phase 5**: Move application layer modules
6. **Phase 6**: Move UI layer modules
7. **Phase 7**: Delete Electron artifacts and update imports

### 2.2 Testing Protocol

After EACH phase:
1. Run `npm run qc:full`
2. Verify no new errors introduced
3. Commit changes before proceeding

---

## 3.0 New Directory Structure

```
js/
├── config.js (unchanged)
│
├── app/
│   ├── managers/
│   │   ├── scenario-manager.js (moved from managers/)
│   │   ├── account-manager.js (moved from managers/)
│   │   ├── transaction-manager.js (moved from managers/)
│   │   └── budget-manager.js (moved from managers/)
│   │
│   └── services/
│       ├── storage-service.js (simplified from core/data-store.js)
│       ├── data-service.js (simplified from data-manager.js)
│       ├── export-service.js (simplified from data-export-import.js)
│       ├── migration-service.js (simplified from data-migration.js)
│       └── lookup-service.js (simplified from lookup-loader.js)
│
├── domain/
│   ├── calculations/
│   │   ├── calculation-engine.js (NEW - facade)
│   │   ├── financial-calculations.js (extracted from calculation-utils + financial-utils)
│   │   ├── recurrence-calculations.js (extracted from calculation-utils)
│   │   ├── goal-calculations.js (renamed from goal-calculation-utils.js)
│   │   ├── projection-engine.js (moved, updated imports)
│   │   ├── transaction-expander.js (moved)
│   │   ├── periodic-change-utils.js (moved)
│   │   └── recurrence-utils.js (moved)
│   │
│   └── utils/
│       ├── fund-utils.js (moved)
│       └── advanced-goal-solver.js (moved, Electron detection removed)
│
├── ui/
│   ├── controllers/
│   │   ├── forecast-controller.js (renamed from forecast.js)
│   │   ├── navbar-controller.js (renamed from navbar.js)
│   │   └── doc-panel-controller.js (renamed from doc-panel.js)
│   │
│   ├── components/
│   │   ├── grids/
│   │   │   ├── grid-factory.js (moved)
│   │   │   ├── grid-state.js (moved)
│   │   │   ├── grid-handlers.js (moved)
│   │   │   ├── accounts-grid.js (moved from forecast/)
│   │   │   ├── transactions-grid.js (moved from forecast/)
│   │   │   ├── budget-grid.js (moved from forecast/)
│   │   │   └── projections-grid.js (moved from forecast/)
│   │   │
│   │   ├── modals/
│   │   │   ├── modal-factory.js (moved)
│   │   │   ├── periodic-change-modal.js (renamed from modal-periodic-change.js)
│   │   │   ├── recurrence-modal.js (renamed from modal-recurrence.js)
│   │   │   └── text-input-modal.js (renamed from modal-text-input.js)
│   │   │
│   │   ├── widgets/
│   │   │   └── toolbar-totals.js (moved)
│   │   │
│   │   └── forecast/
│   │       ├── forecast-layout.js (moved)
│   │       ├── forecast-totals.js (moved)
│   │       ├── forecast-generate-plan.js (moved)
│   │       ├── forecast-projections.js (moved)
│   │       ├── forecast-projections-section.js (moved)
│   │       └── forecast-tx-ui.js (moved)
│   │
│   └── transforms/
│       ├── transaction-row-transformer.js (moved)
│       └── data-aggregators.js (extracted from financial-utils.js)
│
└── shared/
    ├── date-utils.js (moved)
    ├── format-utils.js (extracted from financial-utils.js)
    ├── logger.js (moved)
    ├── notifications.js (moved)
    ├── keyboard-shortcuts.js (moved)
    └── doc-repo-manifest.js (moved)
```

---

## 4.0 Phase-by-Phase Function Mapping

### 4.1 Phase 1: Create Directory Structure

**Action**: Create empty directories only

```bash
mkdir -p js/app/managers
mkdir -p js/app/services
mkdir -p js/domain/calculations
mkdir -p js/domain/utils
mkdir -p js/ui/controllers
mkdir -p js/ui/components/grids
mkdir -p js/ui/components/modals
mkdir -p js/ui/components/widgets
mkdir -p js/ui/components/forecast
mkdir -p js/ui/transforms
mkdir -p js/shared
```

**Test**: Verify directories exist
**Commit**: "Phase 1: Create new directory structure"

---

### 4.2 Phase 2: Move Shared Utilities

These modules have no dependencies on other business logic modules.

#### 4.2.1 date-utils.js

**Source**: `js/date-utils.js`  
**Destination**: `js/shared/date-utils.js`  
**Changes**: File move only, no code changes

**Functions** (all moved as-is):
- `parseDate(dateString)`
- `formatDate(date, format)`
- `addDays(date, days)`
- `addMonths(date, months)`
- `getMonthStart(date)`
- `getMonthEnd(date)`
- `getQuarterStart(date)`
- `getQuarterEnd(date)`
- `getYearStart(date)`
- `getYearEnd(date)`
- `daysBetween(start, end)`
- `monthsBetween(start, end)`

**Action**: 
```bash
git mv js/date-utils.js js/shared/date-utils.js
```

#### 4.2.2 logger.js

**Source**: `js/logger.js`  
**Destination**: `js/shared/logger.js`  
**Changes**: File move only

**Action**:
```bash
git mv js/logger.js js/shared/logger.js
```

#### 4.2.3 notifications.js

**Source**: `js/notifications.js`  
**Destination**: `js/shared/notifications.js`  
**Changes**: File move only

**Action**:
```bash
git mv js/notifications.js js/shared/notifications.js
```

#### 4.2.4 keyboard-shortcuts.js

**Source**: `js/keyboard-shortcuts.js`  
**Destination**: `js/shared/keyboard-shortcuts.js`  
**Changes**: File move only

**Action**:
```bash
git mv js/keyboard-shortcuts.js js/shared/keyboard-shortcuts.js
```

#### 4.2.5 doc-repo-manifest.js

**Source**: `js/doc-repo-manifest.js`  
**Destination**: `js/shared/doc-repo-manifest.js`  
**Changes**: File move only

**Action**:
```bash
git mv js/doc-repo-manifest.js js/shared/doc-repo-manifest.js
```

#### 4.2.6 format-utils.js (NEW - extracted from financial-utils.js)

**Source**: `js/financial-utils.js` (partial)  
**Destination**: `js/shared/format-utils.js`  
**Changes**: Extract formatting functions only

**Functions to Extract**:
- `formatCurrency(value, currency = 'ZAR', decimals = 2)`
  - Lines 237-247 in financial-utils.js
  - Move exactly as-is, preserve all logic

**Action**:
1. Create `js/shared/format-utils.js`
2. Copy `formatCurrency` function from financial-utils.js
3. Export it
4. Do NOT delete from financial-utils.js yet (will be deleted in Phase 7)

**New File Content**:
```javascript
/**
 * format-utils.js
 * Formatting utilities for display
 */

export function formatCurrency(value, currency = 'ZAR', decimals = 2) {
  // COPY EXACT CODE FROM financial-utils.js lines 237-247
  // DO NOT MODIFY LOGIC
}
```

**Test**: Import and verify formatCurrency works identically
**Commit**: "Phase 2: Move shared utilities to js/shared/"

---

### 4.3 Phase 3: Create Calculation Engine

This is the critical phase that consolidates all calculation logic.

#### 4.3.1 recurrence-calculations.js (NEW - extracted from calculation-utils.js)

**Source**: `js/calculation-utils.js` (partial)  
**Destination**: `js/domain/calculations/recurrence-calculations.js`  
**Changes**: Extract recurrence-related functions

**Functions to Extract** (copy exactly from calculation-utils.js):
- `getNthWeekdayOfMonth(date, weekday, n)` - lines 11-49
- `getQuartersBetween(start, end)` - lines 51-70
- `getPeriodsBetween(start, end, frequency)` - lines 72-100
- `generateRecurrenceDates(recurrence, projectionStart, projectionEnd)` - lines 102-309

**Action**:
1. Create `js/domain/calculations/recurrence-calculations.js`
2. Copy the 4 functions exactly as-is
3. Copy required imports (date-utils)
4. Update import path to `../../shared/date-utils.js`
5. Export all functions

**New File Structure**:
```javascript
/**
 * recurrence-calculations.js
 * Date recurrence generation for planned transactions
 */

import { parseDate, addDays, addMonths, /* etc */ } from '../../shared/date-utils.js';

// COPY functions exactly from calculation-utils.js
export function getNthWeekdayOfMonth(date, weekday, n) {
  // Lines 11-49 from calculation-utils.js
}

export function getQuartersBetween(start, end) {
  // Lines 51-70 from calculation-utils.js
}

export function getPeriodsBetween(start, end, frequency) {
  // Lines 72-100 from calculation-utils.js
}

export function generateRecurrenceDates(recurrence, projectionStart, projectionEnd) {
  // Lines 102-309 from calculation-utils.js
}
```

#### 4.3.2 financial-calculations.js (NEW - consolidated)

**Sources**: 
- `js/calculation-utils.js` (working `calculatePeriodicChange`)
- `js/financial-utils.js` (other financial functions, NOT buggy applyPeriodicChange)

**Destination**: `js/domain/calculations/financial-calculations.js`  
**Changes**: Consolidate working implementations only

**Functions to Include**:

From `calculation-utils.js`:
- `calculatePeriodicChange(principal, periodicChange, periods)` - lines 311-442
  - This is the WORKING implementation
  - Copy exactly as-is

From `financial-utils.js` (extract these):
- `calculateFutureValue(rate, nper, pmt, pv)` - lines 26-45
- `calculatePresentValue(rate, nper, pmt, fv = 0)` - lines 47-64
- `calculateCompoundInterest(principal, rate, periods, frequency = 1)` - lines 66-87
- `calculateEffectiveRate(nominalRate, frequency)` - lines 89-101
- `calculatePayment(rate, nper, pv, fv = 0)` - lines 103-129
- `calculatePeriods(startDate, endDate, frequency)` - lines 249-279

**Functions to SKIP** (will be deleted):
- ❌ `applyPeriodicChange` - BUGGY, use calculatePeriodicChange instead
- ❌ Any `isElectron` conditional code

**Action**:
1. Create `js/domain/calculations/financial-calculations.js`
2. Copy `calculatePeriodicChange` from calculation-utils.js (working version)
3. Copy the 6 clean financial functions from financial-utils.js
4. Remove ALL `isElectron` checks - just use fallback math
5. Update imports to use relative paths

**New File Structure**:
```javascript
/**
 * financial-calculations.js
 * Core financial calculations - single source of truth
 */

// NO ELECTRON IMPORTS - web-only

export function calculatePeriodicChange(principal, periodicChange, periods) {
  // COPY EXACT CODE from calculation-utils.js lines 311-442
  // This is the WORKING implementation with all tests passing
}

export function calculateFutureValue(rate, nper, pmt, pv) {
  // Copy from financial-utils.js lines 26-45
  // Remove isElectron check, use only fallback math
}

export function calculatePresentValue(rate, nper, pmt, fv = 0) {
  // Copy from financial-utils.js lines 47-64
  // Remove isElectron check
}

export function calculateCompoundInterest(principal, rate, periods, frequency = 1) {
  // Copy from financial-utils.js lines 66-87
  // Remove isElectron check
}

export function calculateEffectiveRate(nominalRate, frequency) {
  // Copy from financial-utils.js lines 89-101
  // Pure math, no changes needed
}

export function calculatePayment(rate, nper, pv, fv = 0) {
  // Copy from financial-utils.js lines 103-129
  // Remove isElectron check
}

export function calculatePeriods(startDate, endDate, frequency) {
  // Copy from financial-utils.js lines 249-279
  // Pure logic, no changes needed
}
```

#### 4.3.3 calculation-engine.js (NEW - facade pattern)

**Source**: None (new facade)  
**Destination**: `js/domain/calculations/calculation-engine.js`  
**Changes**: Create facade that re-exports all calculations

**Purpose**: Single import point for all calculation functions

**Action**:
Create new file with re-exports:

```javascript
/**
 * calculation-engine.js
 * Calculation Engine Facade - Single entry point for all calculations
 * 
 * Usage:
 *   import * as Calc from './domain/calculations/calculation-engine.js';
 *   const result = Calc.calculatePeriodicChange(100, {type: 'percentage', value: 5}, 12);
 */

import * as FinancialCalc from './financial-calculations.js';
import * as RecurrenceCalc from './recurrence-calculations.js';
import { calculateContributionAmount, calculateMonthsToGoal } from './goal-calculations.js';
import { expandTransactions } from './transaction-expander.js';
import { generateProjections, generateProjectionsForScenario } from './projection-engine.js';

// Re-export all financial calculations
export const {
  calculatePeriodicChange,
  calculateFutureValue,
  calculatePresentValue,
  calculateCompoundInterest,
  calculateEffectiveRate,
  calculatePayment,
  calculatePeriods
} = FinancialCalc;

// Re-export all recurrence calculations
export const {
  getNthWeekdayOfMonth,
  getQuartersBetween,
  getPeriodsBetween,
  generateRecurrenceDates
} = RecurrenceCalc;

// Re-export goal calculations
export {
  calculateContributionAmount,
  calculateMonthsToGoal
};

// Re-export projection functions
export {
  generateProjections,
  generateProjectionsForScenario,
  expandTransactions
};

// Engine metadata
export const ENGINE_VERSION = '1.0.0';
export const ENGINE_INFO = {
  version: ENGINE_VERSION,
  capabilities: [
    'financial-calculations',
    'recurrence-generation',
    'goal-planning',
    'projection-engine',
    'transaction-expansion'
  ]
};
```

**Test**: 
1. Import calculation-engine in a test file
2. Verify all functions accessible
3. Run QC tests to ensure no breakage

**Commit**: "Phase 3: Create calculation engine with consolidated math"

---

### 4.4 Phase 4: Move Domain Layer Modules

#### 4.4.1 goal-calculations.js (renamed)

**Source**: `js/goal-calculation-utils.js`  
**Destination**: `js/domain/calculations/goal-calculations.js`  
**Changes**: 
- Rename file
- Update imports to use calculation-engine
- NO logic changes

**Action**:
1. Copy file to new location
2. Update import paths
3. Change internal calls to use calculation-engine if needed

**Before**:
```javascript
import { calculatePeriodicChange } from './calculation-utils.js';
```

**After**:
```javascript
import { calculatePeriodicChange } from './calculation-engine.js';
```

#### 4.4.2 transaction-expander.js

**Source**: `js/transaction-expander.js`  
**Destination**: `js/domain/calculations/transaction-expander.js`  
**Changes**: Update imports only

**Action**:
```bash
git mv js/transaction-expander.js js/domain/calculations/transaction-expander.js
```

Update imports:
- `./recurrence-utils.js` → `./recurrence-utils.js`
- `./date-utils.js` → `../../shared/date-utils.js`

#### 4.4.3 periodic-change-utils.js

**Source**: `js/periodic-change-utils.js`  
**Destination**: `js/domain/calculations/periodic-change-utils.js`  
**Changes**: Update imports only

**Action**:
```bash
git mv js/periodic-change-utils.js js/domain/calculations/periodic-change-utils.js
```

Update imports to use calculation-engine

#### 4.4.4 recurrence-utils.js

**Source**: `js/recurrence-utils.js`  
**Destination**: `js/domain/calculations/recurrence-utils.js`  
**Changes**: Update imports only

**Action**:
```bash
git mv js/recurrence-utils.js js/domain/calculations/recurrence-utils.js
```

Update imports:
- `./date-utils.js` → `../../shared/date-utils.js`

#### 4.4.5 projection-engine.js

**Source**: `js/projection-engine.js`  
**Destination**: `js/domain/calculations/projection-engine.js`  
**Changes**: 
- Move file
- Update imports to use calculation-engine
- Change `applyPeriodicChange` → `calculatePeriodicChange`

**Critical Change**:
```javascript
// BEFORE (buggy)
import { applyPeriodicChange } from './financial-utils.js';

// AFTER (working)
import { calculatePeriodicChange } from './calculation-engine.js';
```

**In code** (find all uses):
```javascript
// BEFORE
const newBalance = applyPeriodicChange(balance, periodicChange, periods);

// AFTER  
const newBalance = calculatePeriodicChange(balance, periodicChange, periods);
```

**Test**: This change will fix 41 failing tests in projection-engine

#### 4.4.6 fund-utils.js

**Source**: `js/fund-utils.js`  
**Destination**: `js/domain/utils/fund-utils.js`  
**Changes**: Move file, update imports

**Action**:
```bash
git mv js/fund-utils.js js/domain/utils/fund-utils.js
```

#### 4.4.7 advanced-goal-solver.js

**Source**: `js/advanced-goal-solver.js`  
**Destination**: `js/domain/utils/advanced-goal-solver.js`  
**Changes**: 
- Move file
- Remove Electron detection code
- Update imports

**Electron Removal**:
```javascript
// DELETE these lines
import { isElectronEnv } from './core/platform.js';
const isElectron = isElectronEnv();
if (isElectron) { /* ... */ }
```

Keep all business logic intact, just remove platform checks

**Test**: Run `npm run qc:test:advanced-goal-solver`
**Commit**: "Phase 4: Move domain layer modules"

---

### 4.5 Phase 5: Move Application Layer Modules

#### 4.5.1 Managers (existing)

**Sources**: `js/managers/*.js`  
**Destination**: `js/app/managers/*.js`  
**Changes**: Move files, update imports

**Files**:
- `scenario-manager.js`
- `account-manager.js`
- `transaction-manager.js`
- `budget-manager.js`

**Action**:
```bash
git mv js/managers/*.js js/app/managers/
```

Update imports in each file:
- Calculation imports → `../../domain/calculations/calculation-engine.js`
- Date utils → `../../shared/date-utils.js`

#### 4.5.2 storage-service.js (simplified from data-store.js)

**Source**: `js/core/data-store.js`  
**Destination**: `js/app/services/storage-service.js`  
**Changes**: Remove Electron code paths, keep only localStorage

**Strategy**:
1. Copy `js/core/data-store.js` to `js/app/services/storage-service.js`
2. Delete all `isElectron` conditional blocks
3. Keep only the `else` (web) branches
4. Remove all imports of platform.js

**Functions to Preserve** (web logic only):
- `read()` - use localStorage.getItem
- `write(data)` - use localStorage.setItem
- `backup()` - if exists
- `clear()` - if exists

**Delete**:
- All Electron file I/O code
- All `require('electron')` references
- All platform detection

#### 4.5.3 data-service.js (simplified from data-manager.js)

**Source**: `js/data-manager.js`  
**Destination**: `js/app/services/data-service.js`  
**Changes**: Remove Electron code, simplify to CRUD only

**Strategy**:
1. Copy file to new location
2. Remove all `isElectron` checks
3. Update storage imports to use storage-service.js
4. Keep CRUD operations only
5. Move business logic to managers

**Functions to Keep**:
- `loadAppData()`
- `saveAppData(data)`
- `getScenarios()`
- `addScenario(scenario)`
- `updateScenario(id, updates)`
- `deleteScenario(id)`
- Similar for accounts, transactions

**Functions to Review** (may move to managers):
- Validation logic → validators
- Complex business rules → managers

#### 4.5.4 export-service.js (simplified from data-export-import.js)

**Source**: `js/data-export-import.js`  
**Destination**: `js/app/services/export-service.js`  
**Changes**: Remove Electron file dialogs, use web download/upload

**Strategy**:
1. Copy file
2. Replace Electron dialog code with web APIs:
   - File save → `Blob` + `download` link
   - File open → `<input type="file">`
3. Keep JSON serialization logic intact

**Replace**:
```javascript
// BEFORE (Electron)
const { dialog } = require('electron').remote;
const filePath = await dialog.showSaveDialog({...});
fs.writeFileSync(filePath, JSON.stringify(data));

// AFTER (Web)
const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'ftrack-export.json';
a.click();
```

#### 4.5.5 migration-service.js (simplified)

**Source**: `js/data-migration.js`  
**Destination**: `js/app/services/migration-service.js`  
**Changes**: Remove Electron code, keep migration logic

**Strategy**:
1. Copy migration functions
2. Remove file system operations
3. Keep data transformation logic
4. Use storage-service for reads/writes

#### 4.5.6 lookup-service.js (simplified)

**Source**: `js/lookup-loader.js`  
**Destination**: `js/app/services/lookup-service.js`  
**Changes**: Remove Electron bundled asset loading

**Strategy**:
1. Copy file
2. Remove Electron path resolution
3. Use direct `fetch('./assets/lookup-data.json')`
4. Keep caching logic

**Test**: Verify lookups still load
**Commit**: "Phase 5: Move application layer modules"

---

### 4.6 Phase 6: Move UI Layer Modules

#### 4.6.1 Controllers

**Files to Rename/Move**:

| Source | Destination | Changes |
|--------|-------------|---------|
| `js/forecast.js` | `js/ui/controllers/forecast-controller.js` | Rename, update imports |
| `js/navbar.js` | `js/ui/controllers/navbar-controller.js` | Rename, remove Electron buttons |
| `js/doc-panel.js` | `js/ui/controllers/doc-panel-controller.js` | Rename, update imports |

**Action for each**:
1. Move file to new location
2. Update all internal imports to new paths
3. Update paths to managers: `../managers/...` → `../../app/managers/...`
4. Update paths to calculations → `../../domain/calculations/calculation-engine.js`

**Navbar specific**: Remove Electron-only UI elements
```javascript
// DELETE these menu items
- "Open Data Folder"
- "App Info" (if shows Electron version)
- Any Electron-specific shortcuts
```

#### 4.6.2 Grid Components

**Files to Move**:

| Source | Destination |
|--------|-------------|
| `js/grid-factory.js` | `js/ui/components/grids/grid-factory.js` |
| `js/grid-state.js` | `js/ui/components/grids/grid-state.js` |
| `js/grid-handlers.js` | `js/ui/components/grids/grid-handlers.js` |
| `js/forecast/forecast-accounts-grid.js` | `js/ui/components/grids/accounts-grid.js` |
| `js/forecast/forecast-transactions-grid.js` | `js/ui/components/grids/transactions-grid.js` |
| `js/forecast/forecast-budget-grid.js` | `js/ui/components/grids/budget-grid.js` |

**Action**:
```bash
git mv js/grid-factory.js js/ui/components/grids/grid-factory.js
git mv js/grid-state.js js/ui/components/grids/grid-state.js
git mv js/grid-handlers.js js/ui/components/grids/grid-handlers.js
git mv js/forecast/forecast-accounts-grid.js js/ui/components/grids/accounts-grid.js
git mv js/forecast/forecast-transactions-grid.js js/ui/components/grids/transactions-grid.js
git mv js/forecast/forecast-budget-grid.js js/ui/components/grids/budget-grid.js
```

Update imports in each file

#### 4.6.3 Modal Components

**Files to Move**:

| Source | Destination |
|--------|-------------|
| `js/modal-factory.js` | `js/ui/components/modals/modal-factory.js` |
| `js/modal-periodic-change.js` | `js/ui/components/modals/periodic-change-modal.js` |
| `js/modal-recurrence.js` | `js/ui/components/modals/recurrence-modal.js` |
| `js/modal-text-input.js` | `js/ui/components/modals/text-input-modal.js` |

**Action**:
```bash
git mv js/modal-factory.js js/ui/components/modals/modal-factory.js
git mv js/modal-periodic-change.js js/ui/components/modals/periodic-change-modal.js
git mv js/modal-recurrence.js js/ui/components/modals/recurrence-modal.js
git mv js/modal-text-input.js js/ui/components/modals/text-input-modal.js
```

#### 4.6.4 Widget Components

**Files to Move**:

| Source | Destination |
|--------|-------------|
| `js/toolbar-totals.js` | `js/ui/components/widgets/toolbar-totals.js` |

#### 4.6.5 Forecast Components

**Files to Move** (keep in forecast/ subfolder):

| Source | Destination |
|--------|-------------|
| `js/forecast/forecast-layout.js` | `js/ui/components/forecast/forecast-layout.js` |
| `js/forecast/forecast-totals.js` | `js/ui/components/forecast/forecast-totals.js` |
| `js/forecast/forecast-generate-plan.js` | `js/ui/components/forecast/forecast-generate-plan.js` |
| `js/forecast/forecast-projections.js` | `js/ui/components/forecast/forecast-projections.js` |
| `js/forecast/forecast-projections-section.js` | `js/ui/components/forecast/forecast-projections-section.js` |
| `js/forecast/forecast-tx-ui.js` | `js/ui/components/forecast/forecast-tx-ui.js` |

#### 4.6.6 Transform Components

**Files to Create/Move**:

1. **transaction-row-transformer.js**
   - Source: `js/transaction-row-transformer.js`
   - Destination: `js/ui/transforms/transaction-row-transformer.js`
   - Changes: Move file, update imports

2. **data-aggregators.js** (NEW - extracted from financial-utils.js)
   - Source: `js/financial-utils.js` (functions: calculateCategoryTotals, calculateBudgetTotals)
   - Destination: `js/ui/transforms/data-aggregators.js`
   - Changes: Extract aggregation functions

**Extract from financial-utils.js**:
```javascript
// js/ui/transforms/data-aggregators.js

export function calculateCategoryTotals(rows, opts = {}) {
  // Copy EXACT code from financial-utils.js lines 281-320
  // NO LOGIC CHANGES
}

export function calculateBudgetTotals(rows, opts = {}) {
  // Copy EXACT code from financial-utils.js lines 322-386
  // NO LOGIC CHANGES
}
```

**Test**: Verify grid totals still calculate correctly
**Commit**: "Phase 6: Move UI layer modules"

---

### 4.7 Phase 7: Delete Artifacts and Update All Imports

This is the final cleanup phase.

#### 4.7.1 Delete Electron Files

**Files to DELETE**:
```bash
rm main.js
rm preload.js
rm js/core/platform.js
rm js/app-paths.js
rm -rf js/core/  # if empty
rm -rf js/managers/  # now empty, moved to app/managers
rm -rf js/forecast/  # now empty, moved to ui/components/forecast
```

#### 4.7.2 Delete Old Calculation Files

**After verifying all imports updated**:
```bash
rm js/calculation-utils.js  # Functions moved to recurrence-calculations + financial-calculations
rm js/financial-utils.js    # Functions moved to financial-calculations + format-utils + data-aggregators
rm js/goal-calculation-utils.js  # Moved to domain/calculations/goal-calculations.js
```

#### 4.7.3 Update Package.json

**Remove dependencies**:
```json
"devDependencies": {
  // DELETE
  "electron": "^37.2.1",
  "electron-builder": "^26.4.0"
},
"dependencies": {
  // DELETE
  "financejs": "^4.1.0",
  
  // KEEP
  "javascript-lp-solver": "^0.4.24",
  "tabulator-tables": "^6.3.1"
}
```

**Update scripts**:
```json
"scripts": {
  "start": "npx http-server -p 3000 -o",
  "dev": "npx http-server -p 3000 --cors",
  "docs:manifest": "node scripts/generate-docs-manifest.mjs",
  "qc:verify": "node QC/verify.js --scenario=General",
  // ... keep all qc scripts
}
```

**Add dev dependency**:
```json
"devDependencies": {
  "http-server": "^14.1.1"
}
```

#### 4.7.4 Update All HTML Files

**Files to update**: `index.html`, `pages/*.html`

**Find all script tags** and update paths:

```html
<!-- BEFORE -->
<script type="module" src="/js/forecast.js"></script>
<script type="module" src="/js/data-manager.js"></script>

<!-- AFTER -->
<script type="module" src="/js/ui/controllers/forecast-controller.js"></script>
<script type="module" src="/js/app/services/data-service.js"></script>
```

**Strategy**:
1. Search for all `<script>` tags in HTML files
2. Update paths based on file mapping table
3. Verify no 404s in browser console

#### 4.7.5 Update All Import Statements

**Use find/replace across codebase**:

Common replacements:
```javascript
// Calculations
'./calculation-utils.js' → '../../domain/calculations/calculation-engine.js'
'./financial-utils.js' → multiple destinations:
  - formatCurrency → '../../shared/format-utils.js'
  - calculations → '../../domain/calculations/calculation-engine.js'
  - totals → '../../ui/transforms/data-aggregators.js'

// Utilities
'./date-utils.js' → '../../shared/date-utils.js'
'./logger.js' → '../../shared/logger.js'

// Managers
'./managers/scenario-manager.js' → '../../app/managers/scenario-manager.js'

// Storage
'./core/data-store.js' → '../../app/services/storage-service.js'
'./data-manager.js' → '../../app/services/data-service.js'
```

**Tool to help**:
```bash
# Find all imports of old files
grep -r "from './calculation-utils" js/
grep -r "from './financial-utils" js/
grep -r "from './data-manager" js/
```

**Test**: Run app in browser, check console for import errors
**Commit**: "Phase 7: Delete old files and update all imports"

---

## 5.0 Verification Checklist

After completing all phases:

### 5.1 Testing

- [ ] Run `npm run qc:full` - all tests pass (expected: 344/344)
- [ ] Run `npm run qc:test:calculation-utils` - should fail (file deleted)
- [ ] Run `npm run qc:test:financial-utils` - should fail (file deleted)
- [ ] Run `npm run qc:test:projection-engine` - all pass (was 285/326, now should be 326/326)
- [ ] Open app in browser - no console errors
- [ ] Test all major features:
  - [ ] Create scenario
  - [ ] Add accounts
  - [ ] Add transactions with recurrence
  - [ ] Generate projections
  - [ ] View budget
  - [ ] Export/import data
  - [ ] View documentation

### 5.2 File Cleanup

- [ ] No files remain in `js/managers/` (should be deleted)
- [ ] No files remain in `js/forecast/` (should be deleted)
- [ ] No files remain in `js/core/` (should be deleted)
- [ ] Electron files deleted: main.js, preload.js
- [ ] Old calculation files deleted: calculation-utils.js, financial-utils.js
- [ ] package.json has no Electron dependencies

### 5.3 Import Health

- [ ] No imports reference deleted files
- [ ] No broken import paths (404s in browser console)
- [ ] All relative paths correct
- [ ] No circular dependencies

### 5.4 Code Quality

- [ ] No duplicate function definitions
- [ ] No unused imports
- [ ] All exports have corresponding imports
- [ ] Consistent file naming (kebab-case)

---

## 6.0 Rollback Plan

If issues arise during refactor:

### 6.1 Per-Phase Rollback

Because each phase has a commit, rollback is simple:

```bash
# Rollback last phase
git reset --hard HEAD~1

# Rollback multiple phases
git reset --hard <commit-hash-before-phase>
```

### 6.2 Emergency Revert

If entire refactor needs reverting:

```bash
# Identify commit before Phase 1
git log --oneline

# Reset to before refactor started
git reset --hard <commit-before-phase-1>
```

### 6.3 Backup Strategy

Before starting:
```bash
# Create backup branch
git checkout -b refactor-web-only-backup
git checkout main

# Start refactor on new branch
git checkout -b refactor-web-only
```

---

## 7.0 Key Success Metrics

### 7.1 Before Refactor

| Metric | Value |
|--------|-------|
| Total Files | 48 |
| Calculation Files | 8 (with duplication) |
| Platform Detection | 15+ files |
| Failing Tests | 75 |
| Dependencies | 4 (electron, electron-builder, financejs, javascript-lp-solver, tabulator) |
| God Objects | forecast.js (2000+ lines) |

### 7.2 After Refactor (Target)

| Metric | Value | Change |
|--------|-------|--------|
| Total Files | ~35 | -27% |
| Calculation Files | 5 (unified engine) | -38% |
| Platform Detection | 0 | -100% |
| Failing Tests | 0 | -100% ✅ |
| Dependencies | 2 (javascript-lp-solver, tabulator) | -50% |
| God Objects | 0 (largest ~800 lines) | -60% |

### 7.3 Test Results

Expected improvements:
- `qc:test:financial-utils`: 28/62 → Should remove tests (file deleted, logic in calculation-engine)
- `qc:test:projection-engine`: 285/326 → 326/326 (41 tests fixed)
- `qc:full`: 269/344 → 344/344 (75 tests fixed)

---

## 8.0 Post-Refactor Tasks

After refactor complete:

### 8.1 Update QC Tests

Some test files reference old paths:
```bash
# Update these files:
QC/run-calculation-utils.js  # Should test calculation-engine.js instead
QC/run-financial-utils.js    # Should test calculation-engine.js instead
QC/run-projection-engine.js  # Update paths
```

### 8.2 Update Documentation

Files to update:
- `Documentation/TECH_ARCHITECTURE.md` - Already reflects target state
- `Documentation/TECH_OVERVIEW.md` - Already reflects target state
- `Documentation/TECH_UI_LAYER.md` - Update with actual file paths
- `Documentation/TECH_DATA_SCHEMA.md` - Verify still accurate

### 8.3 Create New Docs

Consider adding:
- `Documentation/TECH_CALCULATION_ENGINE.md` - Document calculation engine API
- `Documentation/TECH_MIGRATION_GUIDE.md` - For developers migrating old code

---

## 9.0 Timeline Estimate

| Phase | Estimated Time | Complexity |
|-------|---------------|------------|
| Phase 1: Create directories | 5 min | Low |
| Phase 2: Move shared utils | 30 min | Low |
| Phase 3: Create calc engine | 2-3 hours | **High** |
| Phase 4: Move domain modules | 1 hour | Medium |
| Phase 5: Move app modules | 2 hours | Medium-High |
| Phase 6: Move UI modules | 1-2 hours | Medium |
| Phase 7: Cleanup & imports | 2-3 hours | **High** |
| **Total** | **9-12 hours** | |

**Critical Phases**:
- Phase 3: Most important, consolidates all calculation logic
- Phase 7: Most tedious, updating all imports

**Recommended Approach**:
- Phases 1-3 in one session (complete calculation consolidation)
- Phases 4-5 in second session (move business logic)
- Phases 6-7 in third session (move UI and cleanup)

---

## 10.0 Notes

### 10.1 Import Path Patterns

After refactor, typical import patterns:

**In Controllers** (ui/controllers/):
```javascript
import * as Calc from '../../domain/calculations/calculation-engine.js';
import { ScenarioManager } from '../../app/managers/scenario-manager.js';
import { formatCurrency } from '../../shared/format-utils.js';
import { parseDate } from '../../shared/date-utils.js';
```

**In Managers** (app/managers/):
```javascript
import * as Calc from '../../domain/calculations/calculation-engine.js';
import { StorageService } from '../services/storage-service.js';
import { formatDate } from '../../shared/date-utils.js';
```

**In Domain** (domain/calculations/):
```javascript
import { parseDate, addMonths } from '../../shared/date-utils.js';
// Internal domain imports use relative ./
import { calculatePeriodicChange } from './financial-calculations.js';
```

### 10.2 Critical Replacements

**Most Important Code Change**:

In `projection-engine.js`, line ~150:
```javascript
// BEFORE (BUGGY - causes 41 test failures)
import { applyPeriodicChange } from './financial-utils.js';
const newBalance = applyPeriodicChange(balance, periodicChange, periods);

// AFTER (WORKING - fixes all tests)
import { calculatePeriodicChange } from './calculation-engine.js';
const newBalance = calculatePeriodicChange(balance, periodicChange, periods);
```

This single change fixes all projection-engine test failures.

### 10.3 What NOT to Change

**Preserve exactly**:
- All `package.json` metadata (name, version, description, author, license)
- All QC test data in `QC/expected-outputs.json`
- All logic inside calculation functions
- All HTML page structure
- All CSS styles

**Only change**:
- File locations
- Import paths
- Function deletions (duplicates only)
- Package dependencies (remove Electron)

---

**END OF REFACTOR PLAN**
