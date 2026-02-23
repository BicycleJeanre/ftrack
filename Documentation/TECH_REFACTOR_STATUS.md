# Refactor Status Report

## 1.0 Purpose

This document identifies gaps in the workflow-based refactor implementation (schemaVersion 43). It highlights incomplete migrations, legacy code still in use, and naming inconsistencies discovered during code review against TECH_IMPLEMENTATION_PLAN, TECH_REFACTOR_WORKFLOWS, and TECH_DATA_SCHEMA.

**Last Updated**: 2026-02-23  
**Review Scope**: Core JS services, managers, QC libraries, sample data

---

## 2.0 Critical Issues (High Priority)

### 2.1 Sample Data Using Old Transaction Structure ⚠️

**Location**: [js/app/services/data-service.js](../js/app/services/data-service.js#L70-L126)

**Issue**: Sample data being generated for new users uses legacy transaction format with incorrect fields.

**Current (Wrong)**:
```javascript
transactions: [
  {
    id: 1,
    primaryAccountId: 1,
    secondaryAccountId: null,
    transactionTypeId: 1,
    amount: 5000,
    effectiveDate: formatDateOnly(...),  // ❌ Should be recurrence object
    description: 'Monthly Salary',
    recurrence: null,  // ❌ Should be defined
    periodicChange: null,
    status: { name: 'planned' },  // ❌ WRONG - transactions have no status
    tags: []
  }
]
```

**Expected (Per TECH_DATA_SCHEMA.md § 4.1)**:
```javascript
transactions: [
  {
    id: 1,
    primaryAccountId: 1,
    secondaryAccountId: null,
    transactionTypeId: 1,
    amount: 5000,
    description: 'Monthly Salary',
    recurrence: {
      recurrenceType: 2,        // Daily, Weekly, Monthly, etc.
      startDate: '2026-02-01',
      endDate: null,
      interval: 1,
      dayOfWeek: null,
      dayOfMonth: null,
      weekOfMonth: null,
      dayOfWeekInMonth: null,
      dayOfQuarter: null,
      month: null,
      dayOfYear: null,
      customDates: null,
      id: null
    },
    periodicChange: null,
    tags: []
  }
]
```

**Impact**: New users receive malformed transaction data. The app may fail to parse or process these incorrectly during projection generation.

**Action Required**: 
- Replace all `effectiveDate` fields with proper `recurrence` objects
- Remove `status` field from transactions (status only exists on BudgetOccurrence)
- Align with TECH_DATA_SCHEMA.md § 4.0-5.0

---

### 2.2 Legacy Account Type/Currency as Objects

**Location**: [js/app/services/data-service.js](../js/app/services/data-service.js#L75-L88)

**Issue**: Sample data still storing account `type` and `currency` as objects instead of numeric IDs.

**Current (Wrong)**:
```javascript
accounts: [
  {
    id: 1,
    name: 'Checking Account',
    type: { id: 1, name: 'Asset' },        // ❌ Should be: type: 1
    currency: { id: 1, name: 'ZAR' },     // ❌ Should be: currency: 1
    startingBalance: 5000,
    openDate: projectionStart,
    // ...
  }
]
```

**Expected (Per TECH_DATA_SCHEMA.md § 7.0 - LookupReference)**:
```javascript
accounts: [
  {
    id: 1,
    name: 'Checking Account',
    type: 1,                           // Numeric ID only
    currency: 1,                       // Numeric ID only
    startingBalance: 5000,
    openDate: projectionStart,
    // ...
  }
]
```

**Impact**: Violates schema constraint that all lookup references must be numeric IDs only. May cause validation failures in data normalization.

**Action Required**:
- Convert all `type` objects to numeric IDs (1=Asset, 2=Liability, 3=Equity, 4=Income, 5=Expense)
- Convert all `currency` objects to numeric IDs (1=ZAR, 2=USD, 3=EUR, 4=GBP)
- Verify `sanitizeScenarioForWrite()` validates this constraint

---

## 3.0 High-Priority Issues (Medium Priority)

### 3.1 Import/Export Does Not Preserve uiState on Merge

**Location**: [js/app/services/data-service.js](../js/app/services/data-service.js#L1180-L1212)

**Issue**: When merging imported data, `uiState` from the import file is discarded.

**Current (Wrong)**:
```javascript
export async function importAppData(jsonString, merge = false) {
  // ...
  if (merge) {
    const currentData = await readAppData();
    const maxId = currentData.scenarios.length > 0
      ? Math.max(...currentData.scenarios.map(s => s.id))
      : 0;
    
    importedData.scenarios.forEach((scenario, index) => {
      scenario.id = maxId + index + 1;
    });
    
    currentData.scenarios.push(...importedData.scenarios);
    await writeAppData(currentData);  // ❌ Preserves old uiState, ignores imported uiState
  } else {
    await writeAppData(importedData);  // ✅ Correct for replace mode
  }
}
```

**Expected (Per TECH_REFACTOR_WORKFLOWS.md § 6.0)**:
```javascript
if (merge) {
  const currentData = await readAppData();
  // ... renumber scenarios ...
  currentData.scenarios.push(...importedData.scenarios);
  
  // Also merge/update uiState intelligently
  // e.g., preserve lastScenarioId if it now points to a valid scenario
  if (importedData.uiState) {
    currentData.uiState = {
      ...currentData.uiState,
      ...importedData.uiState
    };
  }
  
  await writeAppData(currentData);
}
```

**Impact**: Users lose their last workflow/scenario selection from imported backups when using merge mode. Only replace mode preserves uiState.

**Action Required**:
- Update merge logic to preserve or intelligently merge uiState
- Document behavior clearly in comments
- Test that workflows/scenario state survives import/export round-trip

---

### 3.2 Duplicate Code Between Managers and Services

**Location**: 
- [js/app/managers/scenario-manager.js](../js/app/managers/scenario-manager.js)
- [js/app/services/data-service.js](../js/app/services/data-service.js)

**Issue**: Nearly identical scenario CRUD functions exist in both files with inconsistent naming.

**Manager API** (scenario-manager.js):
```javascript
export async function create(scenarioData)
export async function update(scenarioId, updates)
export async function remove(scenarioId)
export async function duplicate(scenarioId, newName)
```

**Service API** (data-service.js):
```javascript
export async function createScenario(scenarioData)
export async function updateScenario(scenarioId, updates)
export async function deleteScenario(scenarioId)
export async function duplicateScenario(scenarioId, newName)
```

**Impact**: 
- Code maintainability - bug fixes must be applied twice
- Inconsistent API - unclear which should be used
- Storage overhead - duplication of logic

**Action Required**:
1. Decide which is authoritative (likely data-service.js for consistency with other service exports)
2. Mark the other as deprecated
3. Migrate all callers to use one API
4. Remove duplicate (or leave stub that delegates to authoritative version)

---

## 4.0 Medium-Priority Issues (Naming & Organization)

### 4.1 Legacy data-manager.js References Old Transaction Structure

**Location**: [js/data-manager.js](../js/data-manager.js#L530-L600)

**Issue**: Root-level data manager contains functions referencing deprecated `scenario.plannedTransactions` array.

**Functions affected**:
- `updatePlannedTransaction(scenarioId, transactionId, updates)` - line ~537
- `deletePlannedTransaction(scenarioId, transactionId)` - line ~559
- `savePlannedTransactions(scenarioId, transactions)` - line ~580

**Example**:
```javascript
export async function updatePlannedTransaction(scenarioId, transactionId, updates) {
  const scenario = appData.scenarios.findIndex(s => s.id === scenarioId);
  const transactionIndex = scenario.plannedTransactions.findIndex(t => t.id === transactionId);
  // ❌ Should reference scenario.transactions (new schema)
}
```

**Impact**: 
- Unclear which data layer is authoritative
- May cause confusion during maintenance
- Potential for old code patterns to persist

**Assessment**: 
This file appears to be legacy. Need to confirm:
- Is `js/data-manager.js` still actively used by any components?
- Or has it been fully replaced by `js/app/services/data-service.js`?

**Action Required**:
1. Search codebase for imports of `js/data-manager.js`
2. If active: update to use `scenario.transactions` instead of `scenario.plannedTransactions`
3. If unused: mark as deprecated and remove in next version

---

### 4.2 QC Library References "Scenario Types" Instead of "Workflows"

**Locations**:
- [QC/lib/load-qc-data.js](../QC/lib/load-qc-data.js) - `getScenarioTypeName()`, `getScenariosByType()`
- [QC/lib/extract-actuals.js](../QC/lib/extract-actuals.js) - `extractActualsForScenarioType()`
- All test files in [QC/tests/scenario-types/](../QC/tests/scenario-types/)

**Issue**: QC infrastructure still uses "scenario type" language, but TECH_IMPLEMENTATION_PLAN.md § 7.0.3-7.0.5 requires renaming to "workflows".

**Current naming**:
```javascript
function getScenarioTypeName(scenario) { ... }
function getScenariosByType(qcInputData, scenarioTypeName) { ... }
async function extractActualsForScenarioType({ scenarioType, ... }) { ... }

// Test files:
// QC/tests/scenario-types/budget.test.js
// QC/tests/scenario-types/general.test.js
// etc.
```

**Expected naming** (per workflow model):
```javascript
function getScenarioWorkflowName(scenario) { ... }
function getScenariosByWorkflow(qcInputData, workflowName) { ... }
async function extractActualsForWorkflow({ workflowName, ... }) { ... }

// Test files:
// QC/tests/workflows/budget.test.js
// QC/tests/workflows/general.test.js
// etc.
```

**Impact**: 
- User-facing documentation refers to "workflows" but QC reports use "scenario types"
- Terminology mismatch creates confusion
- Inconsistent with post-refactor conceptual model

**Action Required**:
1. Rename functions: `*ScenarioType*` → `*Workflow*`
2. Rename directory: `QC/tests/scenario-types/` → `QC/tests/workflows/`
3. Rename test function signatures and log output strings
4. Update QC report generation to use workflow terminology

---

### 4.3 Lookup Data Still Contains scenarioTypes Array

**Location**: [assets/lookup-data.json](../assets/lookup-data.json#L2)

**Issue**: `scenarioTypes` array still exists in lookup data, but per TECH_IMPLEMENTATION_PLAN.md § 6.0.6, this should be deprecated as a persistence concept.

**Current**:
```json
{
  "scenarioTypes": [
    { "id": 1, "name": "Budget", "showPlannedTransactions": true, ... },
    { "id": 2, "name": "General", ... },
    ...
  ],
  "periodTypes": [...],
  "accountTypes": [...]
}
```

**Expected**:
- Remove `scenarioTypes` from lookup-data.json
- Use [js/shared/workflow-registry.js](../js/shared/workflow-registry.js) as authoritative source (already done correctly)
- `periodTypes` and `accountTypes` should remain in lookup-data.json

**Impact**: 
- May cause confusion (two sources of truth)
- Increases payload size unnecessarily
- Code might accidentally reference old lookup instead of registry

**Assessment**: 
The refactor appears complete here - `workflow-registry.js` already exists as correct implementation. This is just cleanup.

**Action Required**:
1. Remove `scenarioTypes` from assets/lookup-data.json
2. Verify no code references `lookupData.scenarioTypes`
3. Add comment explaining workflows are now code-defined

---

## 5.0 Low-Priority Issues (Incomplete Features)

### 5.1 Planning Windows Not Fully Integrated

**Location**: Multiple files reference planning windows but actual usage is unclear

**Issue**: Per TECH_DATA_SCHEMA.md § 2.5, scenarios store `planning.generatePlan` and `planning.advancedGoalSolver` windows independently. However, code only shows normalization, not actual engine integration.

**What exists**:
- [js/shared/app-data-utils.js](../js/shared/app-data-utils.js#L206-L207) normalizes planning windows
- [js/domain/utils/advanced-goal-solver.js](../js/domain/utils/advanced-goal-solver.js#L192) reads `planning.advancedGoalSolver`
- Data structure is persisted correctly

**What's unclear**:
- Do projections actually use planning windows, or only projection config?
- If planning window differs from projection window, does engine respect the override?
- Is `planning.generatePlan` used anywhere?

**Per spec**: 
- Planning windows should default to projection window if missing
- Goal-based workflow uses `planning.generatePlan` as solver horizon
- Projections always use `projection.config` (planning doesn't change engine behavior)

**Action Required**:
1. Audit projection engine code to confirm planning windows don't alter projections
2. Audit Generate Plan UI to confirm it uses `planning.generatePlan` window
3. Audit Advanced Goal Solver to confirm it uses `planning.advancedGoalSolver` window
4. Add comments explaining intentional separation

---

### 5.2 Missing budgetWindow Validation

**Location**: No centralized validation for budgetWindow

**Issue**: Per TECH_DATA_SCHEMA.md § 2.4.2, `budgetWindow` is:
- **Required** if budgets workflow is active
- **Independent** from projection config
- Must have startDate AND endDate (no defaults)

**Current state**: 
- Data structure exists and is persisted
- No validation that ensures budgetWindow is present when budgets exist

**Impact**: 
- User could activate Budget workflow without configuring budget window
- Budget regeneration would fail silently
- Poor user experience

**Action Required**:
1. Add validation in `sanitizeScenarioForWrite()` or similar
2. Error if `scenario.budgets.length > 0` but `!scenario.budgetWindow?.config`
3. Document in UI that activating budget workflow requires date range config
4. Consider auto-initializing budgetWindow to match projection window

---

## 6.0 Code Organization Issues

### 6.1 Sample Data Mismatch with Schema

**Multiple locations** create sample data that doesn't match TECH_DATA_SCHEMA.md:

| Entity | Field | Current | Expected |
|--------|-------|---------|----------|
| Transaction | `status` | Contains `{ name: 'planned' }` | Should not exist (only on BudgetOccurrence) |
| Transaction | `effectiveDate` | String date | Should be omitted; use `recurrence.startDate` |
| Account | `type` | `{ id, name }` | Numeric ID only |
| Account | `currency` | `{ id, name }` | Numeric ID only |
| Account | `goalAmount` | Present in schema | Could exist (optional) |
| Account | `goalDate` | Present in schema | Could exist (optional) |

---

## 7.0 Validation Checklist

Use this checklist to verify refactor completeness:

- [ ] Sample data uses only numeric lookup IDs
- [ ] Transactions use `recurrence` object, not `effectiveDate`
- [ ] Transactions have no `status` field
- [ ] Import/export preserves `uiState` in merge mode
- [ ] No code references `scenario.startDate`, `scenario.endDate`, `scenario.projectionPeriod`
- [ ] No code references `scenario.type` (except migration tool in QC/)
- [ ] All projection config reads from `scenario.projection.config`
- [ ] All projection rows stored under `scenario.projection.rows`
- [ ] Planning windows are used where documented
- [ ] `budgetWindow` is validated as required when budgets exist
- [ ] QC infrastructure uses "workflow" terminology
- [ ] Scenario-manager and data-service don't duplicate functionality
- [ ] Root `js/data-manager.js` is either updated or marked deprecated

---

## 8.0 Recommended Fix Priority

**Immediate (blocking defects)**:
1. ✅ Fix sample data transaction structure (§ 2.1)
2. ✅ Fix account type/currency to numeric IDs (§ 2.2)
3. ✅ Import/export uiState preservation (§ 3.1)

**Short-term (code quality)**:
4. Consolidate scenario manager/service (§ 3.2)
5. Clarify or remove legacy data-manager.js (§ 4.1)
6. Complete planning window integration (§ 5.1)

**Medium-term (consistency)**:
7. Rename QC infrastructure to use "workflow" language (§ 4.2)
8. Remove scenarioTypes from lookup-data.json (§ 4.3)
9. Add budgetWindow validation (§ 5.2)

---

## 9.0 References

- [TECH_DATA_SCHEMA.md](TECH_DATA_SCHEMA.md) - Authoritative data structure definition
- [TECH_IMPLEMENTATION_PLAN.md](TECH_IMPLEMENTATION_PLAN.md) - Phased implementation roadmap
- [TECH_REFACTOR_WORKFLOWS.md](TECH_REFACTOR_WORKFLOWS.md) - Conceptual model of workflow refactor
- [js/app/services/data-service.js](../js/app/services/data-service.js) - Primary data service
- [js/shared/workflow-registry.js](../js/shared/workflow-registry.js) - Workflow definitions
- [js/shared/app-data-utils.js](../js/shared/app-data-utils.js) - Data normalization helpers

