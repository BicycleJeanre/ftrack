# Workflow Refactor Phase 1 - Review Inventory

## 1.0 Purpose

1.0.1 Execute Phase 1 (review + inventory) from `TECH_IMPLEMENTATION_PLAN.md`.
1.0.2 Identify all touchpoints where scenario type, projection window, and UI visibility are coupled.
1.0.3 Capture reuse points and Phase 2 gating questions before any schema changes.

---

## 2.0 Application Inventory (JS)

### 2.1 Scenario Type Coupling (Scenario Types → Workflow Registry)

- `assets/lookup-data.json`
  - `scenarioTypes[]` currently provides UI behavior flags (`showAccounts`, `showPlannedTransactions`, `showBudget`, `showGeneratePlan`, `showSummaryCards`, etc.).
- `js/ui/controllers/forecast-controller.js`
  - Loads `lookupData.scenarioTypes` into `scenarioTypes`.
  - `getScenarioTypeConfig()` maps `currentScenario.type` → config and drives:
    - section visibility in `loadScenarioData()` (`showAccounts`, `showBudget`, etc.)
    - summary card selection (`isDebtScenario` / `isGeneralScenario` / `isFundsScenario`)
    - downstream grid behavior by passing `getScenarioTypeConfig` into grid loaders.
- `js/ui/components/grids/accounts-grid.js`
  - Requires `currentScenario.type`; otherwise renders the “select Scenario Type” placeholder.
  - Uses `typeConfig.showGeneratePlan` to add goal columns.
  - Uses `typeConfig.id === 4` (Debt Repayment) to add the periodic-change schedule column.
- `js/ui/components/grids/transactions-grid.js` (and `js/ui/components/forecast/forecast-transactions-grid.js`)
  - Requires `currentScenario.type`; otherwise renders the “select Scenario Type” placeholder.
  - Uses `typeConfig.showPlannedTransactions` for visibility.
- `js/ui/components/forecast/forecast-projections-section.js`
  - After projection generation, refreshes summary cards only when `typeConfig.showSummaryCards` is true.
- `js/ui/components/forecast/forecast-layout.js`
  - Layout is accordion-based; Phase 4 targets card-only layout.

### 2.2 Scenario Stored Fields (`type`, `startDate`, `endDate`, `projectionPeriod`)

- `js/app/managers/scenario-manager.js`
  - Creates/updates scenarios with `type`, `startDate`, `endDate`, `projectionPeriod`.
- `js/app/services/data-service.js`
  - Sample data + `createScenario()` persist the same fields.
  - `getScenarioPeriods()` derives the default period type from `scenario.projectionPeriod` and uses `scenario.startDate/endDate`.
- `js/data-manager.js`
  - Duplicate of data-service style APIs (including `getScenarioPeriods()`); still imported by some UI grids.

### 2.3 Projection Inputs + Stored Output

- `js/domain/calculations/projection-engine.js`
  - Reads `scenario.startDate`, `scenario.endDate`, and `scenario.projectionPeriod`.
  - Writes projections to `scenario.projections` via `saveProjections()` (data-service).
- `js/app/services/data-service.js`
  - `saveProjections()` and `clearProjections()` store projections at `scenario.projections`.
- Key readers of `scenario.projections` (will move to `scenario.projection.rows`):
  - `js/ui/controllers/forecast-controller.js` (summary cards + funds/general totals)
  - `js/ui/components/forecast/forecast-projections.js` (filtering + totals)
  - `js/ui/components/grids/budget-grid.js` and `js/ui/components/forecast/forecast-budget-grid.js` (create budget from projections)

### 2.4 Per-Card Period Views (Transactions/Budgets/Projections)

- `js/ui/controllers/forecast-controller.js`
  - Keeps view period state in module variables: `actualPeriodType`, `budgetPeriodType`, `projectionPeriodType` (not persisted).
- `js/ui/components/grids/transactions-grid.js`
  - Calls `getScenarioPeriods(scenarioId, actualPeriodType)` to populate the period picker.
- `js/ui/components/grids/budget-grid.js`
  - Calls `getScenarioPeriods(scenarioId, budgetPeriodType)` to populate the period picker.
- `js/ui/components/forecast/forecast-projections-section.js`
  - Calls `getScenarioPeriods(scenarioId, projectionPeriodType)` to populate the period picker.

### 2.5 Generate Plan / Solver Horizon Assumptions

- `js/ui/components/forecast/forecast-generate-plan.js`
  - Defaults goal start/end dates to `scenario.startDate/endDate`.
- `js/domain/utils/advanced-goal-solver.js`
  - Validates goals/constraints against `scenario.startDate/endDate`.

### 2.6 Runtime Migration Hook (Phase 5 Requires Standalone QC Migration)

- `js/ui/controllers/forecast-controller.js`
  - Runs `needsMigration()` / `migrateAllScenarios()` on startup.
- `js/app/services/migration-service.js`
  - Contains on-the-fly migrations; Phase 5 requires keeping migration out of runtime.

---

## 3.0 QC Inventory

### 3.1 Scenario Type Mapping

- `QC/lib/load-qc-data.js`
  - Maps `scenario.type` numeric IDs to scenario type names and selects scenarios by type.
- `QC/mappings/use-case-to-scenario-type.json`
  - Organizes QC suites and use cases by scenario type.
- `QC/tests/scenario-types/*.test.js`
  - Executes per-type suites using `getScenariosByType()` and `extractActualsForScenarioType()`.

### 3.2 Projection Window + Period Assertions

- `QC/qc-input-data.json`
  - Scenarios include `type`, `startDate`, `endDate`, and `projectionPeriod`.
- `QC/tests/universal/date-boundary-assertions.js`
  - Validates scenario start/end boundaries and recurrence windows.
- `QC/lib/extract-actuals.js`
  - Includes `scenario.type`, `startDate`, `endDate`, `projectionPeriod` in extracted actuals.
  - Calls `generateProjectionsForScenario()` which reads those same scenario root fields.

---

## 4.0 Documentation Inventory (Phase 8 Targets)

4.0.1 Scenario Types terminology and UI instructions appear in:
- `Documentation/CONCEPTS_SCENARIOS.md`
- `Documentation/USER_OVERVIEW.md`
- `Documentation/USER_GUIDE.md`
- `Documentation/USER_FEATURES.md`
- `Documentation/USER_GETTING_STARTED.md`
- `Documentation/USER_BUDGET_WORKFLOW.md`
- `Documentation/CONCEPTS_GOAL_PLANNING.md`
- `Documentation/CONCEPTS_DEBT_REPAYMENT.md`

4.0.2 QC scenario-type mapping documentation:
- `Documentation/TECH_QC_METHOD.md`

4.0.3 Migration strategy documentation (will change under Phase 5):
- `Documentation/TECH_OVERVIEW.md`

---

## 5.0 Reuse Points (Minimal Change Strategy)

5.0.1 Preserve the existing `typeConfig` flag semantics (`showAccounts`, `showBudget`, etc.) and swap the source from `lookup-data.json.scenarioTypes` to a code-defined workflow registry in Phase 4.

5.0.2 Reuse the existing UI plumbing that passes `getScenarioTypeConfig` into grid loaders by introducing `getWorkflowConfig` with the same return shape.

5.0.3 Reuse `GridStateManager` + the existing state getter/setter pattern in `forecast-controller.js` to persist per-card period view state into `uiState.viewPeriodTypeIds` with minimal UI rewiring.

5.0.4 Reduce surface area by choosing one scenario persistence API as the source of truth (currently duplicated across `scenario-manager.js`, `data-service.js`, and `data-manager.js`) before schemaVersion 43 alignment.

---

## 6.0 Phase 2 Gating Questions

6.0.1 Confirm the default workflow id for:
- brand new installs (no prior data)
- imported data without `uiState`
- migrated legacy data (one-time mapping from scenario type)

6.0.2 Confirm which date window is authoritative after Phase 2:
- projection window only (`scenario.projection.config.startDate/endDate`)
- or a separate planning window for goal solvers

6.0.3 Confirm whether workflows are a 1:1 rename of existing scenario types, or whether any are merged/split.

6.0.4 Confirm whether `scenario.version` and `scenario.lineage` should be implemented in Phase 2 with storage alignment, or deferred to a later phase.
