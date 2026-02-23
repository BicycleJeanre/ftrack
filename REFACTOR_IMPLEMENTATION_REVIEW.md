# Workflow Refactor Implementation Review

**Date**: February 23, 2026  
**Status**: INCOMPLETE - Multiple areas still reference legacy scenario properties  
**Severity Levels**: ⚠️ Critical (blocks refactor completion), 🟡 High (runtime issues), 🔵 Medium (code quality)

---

## Executive Summary

The workflow refactor has been partially implemented but contains **legacy field references that will cause runtime failures** when data is truly migrated to schema 43. The following areas require updates:

1. **UI Components** still check legacy `scenario.type` field
2. **Forecast projections** still access legacy `scenario.startDate/endDate` directly  
3. **Transaction grid** defaults to legacy `scenario.startDate`
4. **QC utilities** use fallback logic for legacy fields
5. **getScenarioTypeConfig pattern** still used in UI code instead of workflow registry

---

## Issues Found

### 1. ⚠️ CRITICAL: Legacy `scenario.type` Still Checked in UI

**Files**:
- [forecast-accounts-grid.js](js/ui/components/forecast/forecast-accounts-grid.js#L126-L128)
- [forecast-transactions-grid.js](js/ui/components/forecast/forecast-transactions-grid.js#L53)

**Issue**: Both grids check `if (!currentScenario.type)` to show empty state. After migration to schema 43, `scenario.type` will not exist, so these checks will always be true.

**Expected**: These checks should be replaced with workflow-aware logic or removed entirely if the workflow selection already ensures visibility.

**Current Code** (forecast-accounts-grid.js):
```javascript
if (!currentScenario.type) {
  container.innerHTML =
    '<div class="empty-message">Please select a Scenario Type and Period Type in the scenario grid above to enable accounts.</div>';
  return;
}
```

**Action Required**: Replace with workflow-based visibility check.

---

### 2. ⚠️ CRITICAL: Forecast Projections Access Legacy Fields Directly

**File**: [forecast-projections-section.js](js/ui/components/forecast/forecast-projections-section.js#L541-L542)

**Issue**: `buildCounterpartyRowsForSelectedAccount()` function accesses `currentScenario.startDate` and `currentScenario.endDate` directly. These fields don't exist in schema 43; they should be accessed from `scenario.projection.config`.

**Current Code**:
```javascript
const startDate = normalizeDateOnly(currentScenario.startDate);
const endDate = normalizeDateOnly(currentScenario.endDate);
```

**Expected**: 
```javascript
const startDate = normalizeDateOnly(currentScenario.projection?.config?.startDate);
const endDate = normalizeDateOnly(currentScenario.projection?.config?.endDate);
```

**Impact**: This will fail at runtime when projections are generated with schema 43 data, causing the counterparty grouping view to break.

---

### 3. 🟡 HIGH: Transaction Grid Defaults to Legacy Field

**File**: [forecast-transactions-grid.js](js/ui/components/forecast/forecast-transactions-grid.js#L123)

**Issue**: Default date picker value falls back to `currentScenario.startDate`.

**Current Code**:
```javascript
: (currentScenario.startDate || formatDateOnly(new Date()));
```

**Expected**: Should use `scenario.projection?.config?.startDate` or a sensible default from UI state.

---

### 4. 🟡 HIGH: getScenarioTypeConfig Pattern Still Active

**Files**:
- [forecast-accounts-grid.js](js/ui/components/forecast/forecast-accounts-grid.js#L108-L126)
- [forecast-transactions-grid.js](js/ui/components/forecast/forecast-transactions-grid.js#L33-L51)

**Issue**: Both components import and call `getScenarioTypeConfig()` which is part of the legacy lookup-data.json pattern. The refactoring was supposed to replace this with workflow registry lookups.

**Current Pattern**:
```javascript
import { ..., getScenarioTypeConfig } from '...';
const typeConfig = getScenarioTypeConfig?.();
if (!typeConfig?.showAccounts) { ... }
```

**Expected**: Should look up workflow config from `WORKFLOWS` registry using the current workflow ID from UI state:
```javascript
import { WORKFLOWS, getWorkflowById } from '../../shared/workflow-registry.js';
const workflowConfig = getWorkflowById(currentWorkflowId);
if (!workflowConfig?.visibleCards?.includes('accounts')) { ... }
```

**Where to source workflow ID**: Pass `currentWorkflowId` from UI state manager or load it at component initialization.

---

### 5. 🔵 MEDIUM: QC Utilities Still Have Legacy Field Fallbacks

**Files**:
- [QC/lib/extract-actuals.js](QC/lib/extract-actuals.js#L48-L50, #L89-L91)
- [QC/tests/universal/date-boundary-assertions.js](QC/tests/universal/date-boundary-assertions.js#L15-L16)

**Issue**: QC utilities use fallback logic: `projectionConfig.startDate || scenario.startDate`. After data migration, `scenario.startDate` won't exist, so the fallback is misleading.

**Current Code**:
```javascript
const windowStart = projectionConfig.startDate || scenario.startDate;
const windowEnd = projectionConfig.endDate || scenario.endDate;
const projectionPeriod = projectionConfig.periodTypeId ?? scenario.projectionPeriod;
```

**Impact**: QC tests will pass misleadingly because they're checking against fallback behavior that won't exist post-migration.

**Action Required**: 
- Remove fallbacks (QC should fail loudly if projection config is missing)
- Add explicit validation that schema 43 scenarios have `projection.config` populated

---

### 6. 🔵 MEDIUM: Forecast Empty State Messages Hard-Code "Scenario Type"

**Files**:
- [forecast-accounts-grid.js](js/ui/components/forecast/forecast-accounts-grid.js#L127-L128)
- [forecast-transactions-grid.js](js/ui/components/forecast/forecast-transactions-grid.js#L54-L55)

**Issue**: Empty state message says "Please select a Scenario Type and Period Type" but the UI terminology should now be "Workflow" after refactoring.

**Current**:
```javascript
'<div class="empty-message">Please select a Scenario Type and Period Type...</div>'
```

**Expected**: 
```javascript
'<div class="empty-message">Please select a Workflow and Period Type...</div>'
```

---

## Areas Working Correctly ✓

The following have been properly implemented:

- **Sample Data Creator** ([data-manager.js lines 49-157](js/data-manager.js#L49-L157)): Creates scenarios with `projection.config` and planning windows
- **Projection Engine** ([projection-engine.js](js/domain/calculations/projection-engine.js)): Reads from `scenario.projection.config` correctly
- **UiState Fields**: Properly initialized with `lastWorkflowId`, `lastScenarioId`, `lastScenarioVersion` in sample data
- **Planning Windows**: Properly stored as `scenario.planning.generatePlan` and `scenario.planning.advancedGoalSolver`
- **Version/Lineage Fields**: Properly initialized in sample scenarios
- **Import/Export**: Sample data includes `uiState` in exported structure
- **Workflow Registry**: Code-defined workflows exist in [workflow-registry.js](js/shared/workflow-registry.js)

---

## Recommended Fix Order

### Phase 1 (Critical - Must Fix Before Migration)
1. Replace `scenario.startDate/endDate` references with `scenario.projection.config` in:
   - forecast-projections-section.js (buildCounterpartyRowsForSelectedAccount)
   - forecast-transactions-grid.js (line 123)
2. Replace `scenario.type` checks with workflow-aware logic
3. Update empty state messages to reference workflows

### Phase 2 (High Priority)
1. Replace `getScenarioTypeConfig` pattern with workflow registry lookups in:
   - forecast-accounts-grid.js
   - forecast-transactions-grid.js
2. Pass workflow context through component initialization

### Phase 3 (Code Quality)
1. Remove legacy field fallbacks from all QC utilities
2. Add explicit schema 43 validation in QC tests
3. Verify projection.config is always populated before use

---

## Validation Checklist

- [ ] No code references `scenario.type` (except documentation/comments)
- [ ] No code references `scenario.startDate`, `scenario.endDate`, `scenario.projectionPeriod` (except documentation/comments)
- [ ] All projection date access goes through `scenario.projection.config`
- [ ] No `getScenarioTypeConfig` calls in runtime code (only in archived/commented)
- [ ] Workflow registry fully replaces lookup-data.json for UI visibility decisions
- [ ] All UI components receive workflow context from state manager
- [ ] QC tests validate projection.config exists and contains required fields
- [ ] Empty state messages use "Workflow" terminology, not "Scenario Type"

---

## Files Requiring Changes

| File | Lines | Change Type | Priority |
|------|-------|-------------|----------|
| [forecast-accounts-grid.js](js/ui/components/forecast/forecast-accounts-grid.js) | 126-128, 108, 201, 253 | Remove type check, replace getScenarioTypeConfig | Critical |
| [forecast-transactions-grid.js](js/ui/components/forecast/forecast-transactions-grid.js) | 53-55, 123, 33, 72 | Remove type check, replace getScenarioTypeConfig, fix default date | Critical |
| [forecast-projections-section.js](js/ui/components/forecast/forecast-projections-section.js) | 541-542 | Use projection.config instead of legacy fields | Critical |
| [QC/lib/extract-actuals.js](QC/lib/extract-actuals.js) | 48-50, 89-91 | Remove legacy field fallbacks | Medium |
| [QC/tests/universal/date-boundary-assertions.js](QC/tests/universal/date-boundary-assertions.js) | 15-16 | Remove legacy field fallbacks | Medium |

