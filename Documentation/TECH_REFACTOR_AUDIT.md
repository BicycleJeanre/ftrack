# Historical Refactor Audit Report

**Date**: February 23, 2026  
**Purpose**: Code review validating implementation against TECH_IMPLEMENTATION_PLAN.md, TECH_REFACTOR_WORKFLOWS.md, and TECH_DATA_SCHEMA.md

> **Historical snapshot:** This report records the schemaVersion 43 refactor at
> the date above. The current application uses schemaVersion 44 and the unified
> Plan & Actuals workflow documented in
> [TECH_ARCHITECTURE.md](TECH_ARCHITECTURE.md) and
> [TECH_DATA_SCHEMA.md](TECH_DATA_SCHEMA.md). Several files and findings below
> were subsequently removed or resolved.

---

## 1.0 Executive Summary

The workflow-based scenario refactor has been **95% successfully implemented**. Core refactoring goals are met:
- ✅ Data schema migrated to schemaVersion 43
- ✅ Scenario types replaced with workflow registry
- ✅ Projection config moved to `scenario.projection.config`
- ✅ UiState properly persisted

**However**: Three critical code cleanup issues remain from the old architecture:
1. **data-manager.js** still exists but is completely unused (dead code)
2. **Triple duplication** of scenario operations across three modules
3. **QC test directory** not renamed to reflect workflow-based organization

---

## 2.0 Critical Issues

### 2.1 Unused Legacy Module: data-manager.js

**File**: [js/data-manager.js](../js/data-manager.js)  
**Severity**: 🔴 CRITICAL  
**Status**: DEAD CODE - Not imported or used anywhere

**Evidence**:
- No imports from `data-manager.js` found in codebase
- All UI code imports from `data-service.js` or `scenario-manager.js`
- File contains duplicate implementations of scenario operations

**Historical Context**:
- Represents the old centralized data management layer
- Was intended to be replaced by modular service + manager architecture
- Remains as orphaned code

**Refactor Plan Reference**: 
- TECH_IMPLEMENTATION_PLAN.md (3.0, 3.0.4): "avoid new abstractions" and "identify reuse points"
- TECH_REFACTOR_WORKFLOWS.md doesn't explicitly reference this file

**Action Required**: 
- [ ] Delete [js/data-manager.js](../js/data-manager.js)
- [ ] Verify no hidden imports or dynamic requires reference it

---

### 2.2 Triple Duplication of Scenario Operations

**Severity**: 🔴 CRITICAL  
**Impact**: Maintenance burden, risk of divergent behavior, confusion about canonical implementation

#### 2.2.1 Duplication Pattern

Three identical implementations exist:

**Implementation A**: [js/data-manager.js](../js/data-manager.js#L274)
```javascript
export async function duplicateScenario(scenarioId, newName)  // Lines 274-313
export async function createScenario(scenarioData)             // Lines 202-237
export async function updateScenario(scenarioId, updates)      // Lines 239-260
export async function deleteScenario(scenarioId)               // Lines 262-271
```

**Implementation B**: [js/app/services/data-service.js](../js/app/services/data-service.js#L156)
```javascript
export async function duplicateScenario(scenarioId, newName)  // Lines 156-195 (IDENTICAL)
export async function createScenario(scenarioData)             // Lines 84-119 (similar)
export async function updateScenario(scenarioId, updates)      // Lines 121-142 (similar)
export async function deleteScenario(scenarioId)               // Lines 144-150 (similar)
```

**Implementation C**: [js/app/managers/scenario-manager.js](../js/app/managers/scenario-manager.js#L114)
```javascript
export async function duplicate(scenarioId, newName)           // Lines 114-152 (variant wrapper)
export async function create(scenarioData)                     // Lines 32-65 (variant wrapper)
export async function update(scenarioId, updates)              // Lines 67-103 (variant wrapper)
export async function delete(scenarioId)                       // Lines 104-112 (variant wrapper)
```

#### 2.2.2 Which One is Actually Used?

**UI Layer** uses only **ScenarioManager** (Implementation C):
- [js/ui/controllers/forecast-controller.js](../js/ui/controllers/forecast-controller.js#L8): `import * as ScenarioManager`
- [js/ui/controllers/forecast-controller.js](../js/ui/controllers/forecast-controller.js#L583): `await ScenarioManager.duplicate(scenario.id)`
- [js/ui/components/forecast/forecast-generate-plan.js](../js/ui/components/forecast/forecast-generate-plan.js#L22): `import * as ScenarioManager`
- Historical `js/ui/components/grids/budget-grid.js`: `import * as ScenarioManager`

**Data Layer** (data-service.js) uses internal functions, appears to be service-level API  
**data-manager.js** - **NOT USED ANYWHERE**

#### 2.2.3 Code Comparison

All three implementations of `duplicateScenario()` are nearly identical:

```javascript
// data-manager.js (Lines 274-313)
export async function duplicateScenario(scenarioId, newName) {
  const appData = await readAppData();
  const sourceScenario = appData.scenarios.find(s => s.id === scenarioId);
  // ... duplicate logic ...
  const sanitized = sanitizeScenarioForWrite(duplicatedScenario);
  appData.scenarios.push(sanitized);
  await writeAppData(appData);
  return sanitized;
}

// data-service.js (Lines 156-195)
export async function duplicateScenario(scenarioId, newName) {
  const appData = await readAppData();
  const sourceScenario = appData.scenarios.find(s => s.id === scenarioId);
  // ... IDENTICAL duplicate logic ...
  const sanitized = sanitizeScenarioForWrite(duplicatedScenario);
  appData.scenarios.push(sanitized);
  await writeAppData(appData);
  return sanitized;
}

// scenario-manager.js (Lines 114-152)
export async function duplicate(scenarioId, newName) {
  return await DataStore.transaction(async (data) => {
    // ... slightly refactored version with DataStore.transaction() ...
  });
}
```

**Risk**: If a bug is found in scenario duplication, all three must be fixed. Changes in one path may break the used path.

---

### 2.3 QC Test Directory Not Renamed to Reflect Workflows

**Severity**: 🟡 HIGH  
**Current Location**: `QC/tests/scenario-types/`  
**Expected Location**: `QC/tests/workflows/`

**Current Test Files**:
- [QC/tests/scenario-types/budget.test.js](../QC/tests/scenario-types/budget.test.js)
- [QC/tests/scenario-types/general.test.js](../QC/tests/scenario-types/general.test.js)
- [QC/tests/scenario-types/funds.test.js](../QC/tests/scenario-types/funds.test.js)
- [QC/tests/scenario-types/debt-repayment.test.js](../QC/tests/scenario-types/debt-repayment.test.js)
- [QC/tests/scenario-types/goal-based.test.js](../QC/tests/scenario-types/goal-based.test.js)
- [QC/tests/scenario-types/advanced-goal-solver.test.js](../QC/tests/scenario-types/advanced-goal-solver.test.js)

**Refactor Plan Reference**:  
TECH_REFACTOR_WORKFLOWS.md (8.0.2):
> Existing scenario-type test suites can be re-labeled to workflow suites with the same engine assertions.

**Status**: Tests follow workflow structure internally but directory naming is outdated  

**Impact**: Misleading directory structure for new developers; inconsistent with refactor philosophy

**Recommendation**: Rename directory to `QC/tests/workflows/` for consistency

---

## 3.0 High-Priority Issues

### 3.1 QC Mapping File Naming

**File**: [QC/mappings/use-case-to-scenario-type.json](../QC/mappings/use-case-to-scenario-type.json)  
**Severity**: 🟡 MEDIUM  
**Status**: ACCEPTABLE (legacy filename retained per design)

**Context**:  
TECH_QC_METHOD.md (5.0) explicitly states:
> For schemaVersion 44 datasets, workflow suites select scenarios by `scenarioIds` from `QC/mappings/use-case-to-scenario-type.json` **(legacy filename retained)**.

**Note**: This is not a bug; the legacy filename was intentionally preserved for backwards compatibility.

---

## 4.0 Validation: Proper Implementations ✅

### 4.1 Data Schema Compliance

**Reference**: TECH_DATA_SCHEMA.md

| Requirement | Status | Location |
|-------------|--------|----------|
| Old fields removed (`type`, `startDate`, `endDate`, `projectionPeriod`) | ✅ | [js/shared/app-data-utils.js](../js/shared/app-data-utils.js#L251) sanitizes old fields out |
| `scenario.version` persisted | ✅ | [js/shared/app-data-utils.js](../js/shared/app-data-utils.js#L164) |
| `scenario.lineage` persisted | ✅ | [js/shared/app-data-utils.js](../js/shared/app-data-utils.js#L164) |
| `scenario.projection.config` structure | ✅ | [js/shared/app-data-utils.js](../js/shared/app-data-utils.js#L133) |
| `scenario.projection.rows` storage | ✅ | [js/app/services/data-service.js](../js/app/services/data-service.js#L655) |
| `scenario.planning.generatePlan` | ✅ | [js/ui/components/forecast/forecast-generate-plan.js](../js/ui/components/forecast/forecast-generate-plan.js#L47) |
| `scenario.planning.advancedGoalSolver` | ✅ | [js/domain/utils/advanced-goal-solver.js](../js/domain/utils/advanced-goal-solver.js#L191) |
| Legacy `scenario.budgetWindow` removed | ✅ | [js/app/services/validation-service.js](../js/app/services/validation-service.js) rejects it in schemaVersion 44 |
| `uiState.lastWorkflowId` persisted | ✅ | [js/shared/app-data-utils.js](../js/shared/app-data-utils.js) |
| `uiState.lastScenarioVersion` persisted | ✅ | [js/ui/controllers/forecast-controller.js](../js/ui/controllers/forecast-controller.js#L216) |
| `uiState.viewPeriodTypeIds` per-card | ✅ | [js/ui/controllers/forecast-controller.js](../js/ui/controllers/forecast-controller.js#L781) |
| schemaVersion = 44 enforced | ✅ | [js/shared/app-data-utils.js](../js/shared/app-data-utils.js) |

### 4.2 Projection Engine Compliance

**Reference**: TECH_IMPLEMENTATION_PLAN.md (5.0)

| Requirement | Status | Location |
|-------------|--------|----------|
| Reads `scenario.projection.config` not scenario root | ✅ | [js/domain/calculations/projection-engine.js](../js/domain/calculations/projection-engine.js#L110) function `getProjectionConfig()` |
| Projection rows stored correctly | ✅ | [js/app/services/data-service.js](../js/app/services/data-service.js#L692) `saveProjectionBundle()` |
| Period view independent of projection | ✅ | [js/ui/controllers/forecast-controller.js](../js/ui/controllers/forecast-controller.js#L170) reads `viewPeriodTypeIds` |

### 4.3 Workflow Registry Compliance

**Reference**: TECH_REFACTOR_WORKFLOWS.md (5.0)

| Requirement | Status | Location |
|-------------|--------|----------|
| Code-defined workflow registry | ✅ | [js/shared/workflow-registry.js](../js/shared/workflow-registry.js) |
| Workflows have `id`, `name`, `visibleCards` | ✅ | [js/shared/workflow-registry.js](../js/shared/workflow-registry.js#L1) |
| `uiState.lastWorkflowId` defaults to "general" | ✅ | [js/shared/workflow-registry.js](../js/shared/workflow-registry.js) exported `DEFAULT_WORKFLOW_ID` |
| Import/export preserves workflow selection | ✅ | [js/app/services/data-service.js](../js/app/services/data-service.js#L1097) |

### 4.4 UiState Persistence Compliance

**Reference**: TECH_DATA_SCHEMA.md (1.1)

| Requirement | Status | Location |
|-------------|--------|----------|
| `lastWorkflowId` persisted and restored | ✅ | [js/ui/controllers/forecast-controller.js](../js/ui/controllers/forecast-controller.js#L168) |
| `lastScenarioId` persisted and restored | ✅ | [js/ui/controllers/forecast-controller.js](../js/ui/controllers/forecast-controller.js#L635) |
| `lastScenarioVersion` persisted and restored | ✅ | [js/ui/controllers/forecast-controller.js](../js/ui/controllers/forecast-controller.js#L216) |
| `viewPeriodTypeIds` per-card independent | ✅ | [js/app/managers/ui-state-manager.js](../js/app/managers/ui-state-manager.js#L27) |

---

## 5.0 Summary of Required Actions

| Priority | Issue | Action | Files Affected |
|----------|-------|--------|-----------------|
| 🔴 CRITICAL | Dead code: data-manager.js | Delete file | `js/data-manager.js` |
| 🔴 CRITICAL | Triple duplication | Choose canonical implementation; remove duplicates from other 2 files | `js/data-manager.js`, `js/app/services/data-service.js`, `js/app/managers/scenario-manager.js` |
| 🟡 HIGH | Test directory naming | Rename `QC/tests/scenario-types/` to `QC/tests/workflows/` | All files under `QC/tests/scenario-types/` |
| 🟢 LOW | QC mapping file naming | (Already acceptable per design; filename intentionally retained) | No action needed |

---

## 6.0 Refactor Progress Matrix

| Phase | Plan | Status | Evidence |
|-------|------|--------|----------|
| 1.0 Code Review & Inventory | Identify touchpoints, reuse points, avoid new abstractions | ⚠️ PARTIAL | Core refactoring done; dead code cleanup pending |
| 2.0 Data Model & Storage Alignment | Remove old fields; add new schema 43 fields | ✅ COMPLETE | All schema 43 fields present; old fields properly removed |
| 3.0 Projection Engine & Period Views | Read from `projection.config`; maintain per-card views | ✅ COMPLETE | Engine correctly reads from new location |
| 4.0 Workflow Registry & Forecast UI | Replace type config with code registry; persist workflow selection | ✅ COMPLETE | Registry implemented; UI respects workflow selection |
| 5.0 Standalone Migration Module | Build QC-only migration tool | ✅ COMPLETE | [QC/migrate-app-data-to-schema44.js](../QC/migrate-app-data-to-schema44.js) exists and is QC-only |
| 8.0 Documentation Updates | Update references from "scenario types" to "workflows" | ⚠️ PARTIAL | Documentation updated; test directory naming not updated |
| 9.0 Validation & Rollout | QC passes; import/export round-trip works; no runtime migration refs | ✅ COMPLETE | QC tests pass; migration module is QC-only |

**Overall Refactor Completion**: 95%

---

## 7.0 Recommendations for Next Sprint

### Tier 1: Critical (Must Do)
1. **Delete [js/data-manager.js](../js/data-manager.js)** - Completely unused, creates confusion
2. **Consolidate scenario operations** - Choose either data-service.js OR scenario-manager.js as canonical; remove duplicate from the other

### Tier 2: High (Should Do)
3. **Rename QC test directory** - Move `scenario-types/` → `workflows/` for consistency and clarity

### Tier 3: Low (Nice to Have)
4. Update any remaining inline comments in code that reference "scenario types" instead of "workflows"

---

## 8.0 Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-23 | 1.0 | Initial audit report: identified data-manager.js dead code, triple duplication, QC directory naming inconsistency |
