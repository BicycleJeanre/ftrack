# Workflow Refactor Implementation Plan

## 1.0 Purpose
1.0.1 Provide a phased, minimal-change plan to implement workflow-based scenarios.
1.0.2 Align application storage with schemaVersion 43 in Data Schema.
1.0.3 Keep migration out of runtime and deliver it as a standalone QC module.

## 2.0 Inputs And Constraints
2.0.1 Follow the target model in [Documentation/TECH_REFACTOR_WORKFLOWS.md](Documentation/TECH_REFACTOR_WORKFLOWS.md).
2.0.2 Enforce the schema in [Documentation/TECH_DATA_SCHEMA.md](Documentation/TECH_DATA_SCHEMA.md).
2.0.3 Update QC and docs to reflect workflow-based scenarios.
2.0.4 Keep changes minimal and reuse existing patterns.

## 3.0 Phase 1 - Full Code Review And Inventory
3.0.1 Scan all JS, QC, and Documentation files for scenario type, projection range, and UI visibility coupling.
3.0.2 Capture all touchpoints for:
3.0.2.1 `scenario.type`, `startDate`, `endDate`, `projectionPeriod`.
3.0.2.2 `scenarioTypes` lookup usage and `getScenarioTypeConfig` usage.
3.0.2.3 Projection engine inputs and UI period controls.
3.0.2.4 QC scenario-type mappings, runners, and expected outputs.
3.0.3 Produce a short inventory list of affected files and modules.
3.0.4 Confirm minimal change strategy by identifying reuse points and avoiding new abstractions.

## 4.0 Phase 2 - Data Model And Scenario Storage Alignment
4.0.1 Update scenario creation defaults to match schemaVersion 43.
4.0.1.1 Remove persistence of `type`, `startDate`, `endDate`, `projectionPeriod` from scenarios.
4.0.1.2 Add `projection.config` and `projection.rows` where projection data exists.
4.0.1.3 Ensure `UiState` fields exist and are persisted: `lastWorkflowId`, `lastScenarioId`, `lastScenarioVersion`, `viewPeriodTypeIds`.
4.0.2 Update sample data to the schema structure.
4.0.3 Validate import/export reads and writes the root object unchanged, including `uiState`.

## 5.0 Phase 3 - Projection Engine And Period Views
5.0.1 Update projection engine inputs to read `scenario.projection.config` instead of scenario root fields.
5.0.2 Maintain period view state per card using `UiState.viewPeriodTypeIds`.
5.0.3 Keep projection period type an engine-only concept, not shared with UI period views.
5.0.4 Ensure `projection.rows` are stored under the projection bundle and not elsewhere.

## 6.0 Phase 4 - Workflow Registry And Forecast UI
6.0.1 Replace scenario type config with a code-defined workflow registry.
6.0.1.1 Define workflow `id`, `name`, `visibleCards`, and optional behavior flags.
6.0.2 Update forecast UI to render cards based on workflow configuration.
6.0.3 Replace left-nav scenario type selection with workflow selection.
6.0.4 Persist workflow selection in `UiState.lastWorkflowId` and restore on load.
6.0.5 Keep scenario selection orthogonal to workflow selection.
6.0.6 Remove `assets/lookup-data.json.scenarioTypes` usage as a persistence concept.

## 7.0 Phase 5 - Standalone Migration Module And QC
7.0.1 Build a standalone migration tool under `QC/` only.
7.0.1.1 Input: legacy app data file.
7.0.1.2 Output: schemaVersion 43 data with `projection.config` and `uiState` populated.
7.0.1.3 Map legacy scenario type to default workflow selection one time.
7.0.2 Do not reference this module from runtime application code.
7.0.3 Update QC mapping and loaders to use workflow-based selection instead of scenario types.
7.0.4 Adjust QC datasets to the new schema fields and projection bundle structure.
7.0.5 Update QC reports and test labels to reference workflows instead of scenario types.

## 8.0 Documentation Updates
8.0.1 Rename user-facing mentions of scenario types to workflows.
8.0.2 Document workflow registry behavior and `UiState` persistence.
8.0.3 Update QC documentation for workflow-based mappings.
8.0.4 Keep all updates concise and in affected Documentation files only.

## 9.0 Validation And Rollout
9.0.1 Run all QC scripts and ensure reports match expected values.
9.0.2 Validate import/export round-trip preserves `UiState` and workflow selection.
9.0.3 Confirm projections render correctly using `projection.config`.
9.0.4 Verify that no runtime code references the standalone migration module.
