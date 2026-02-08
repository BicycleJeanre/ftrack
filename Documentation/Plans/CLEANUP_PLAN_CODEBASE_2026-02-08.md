# Cleanup Plan - Codebase Cleanup - 2026-02-08

1.0 Purpose
1.1 Restore codebase consistency and reduce complexity after major feature additions.
1.2 Prioritize changes that improve maintainability without changing UX.

2.0 Scope
2.1 In scope
2.1.1 Forecast UI controller cleanup and modularization.
2.1.2 Data model and configuration normalization.
2.1.3 Reuse-first consolidation and removal of parallel implementations.
2.1.4 Notification and error-handling consistency.
2.1.5 Logging removal for now.
2.2 Out of scope
2.2.1 Feature changes, new UX, or behavior changes.
2.2.2 Documentation consistency work.

3.0 Primary Hotspots
3.1 Forecast controller
3.1.1 `js/forecast.js` is the main responsibility hotspot and should be reduced to an orchestrator.
3.2 Scenario type configuration
3.2.1 `assets/lookup-data.json` is partially enforced and needs a clear contract.

4.0 Implementation Phases

4.1 Phase 1 - Stabilize Cross-Cutting Conventions
4.1.1 Remove logging while keeping user notifications.
4.1.1.1 Remove `console.log` and `console.error` usage in runtime code paths.
4.1.1.2 Remove or disable logger wiring where applicable.
4.1.1.3 Keep `alert(...)` notifications for now.
4.1.2 Standardize error-handling style.
4.1.2.1 Prefer consistent user-facing messaging on failures.

4.2 Phase 2 - Data Model And Configuration Normalization
4.2.1 Starting balance normalization.
4.2.1.1 Use: `Documentation/Plans/CLEANUP_PLAN_STARTING_BALANCE_2026-02-08.md`.
4.2.2 Scenario type config normalization.
4.2.2.1 Decide whether `accountColumns` and `transactionColumns` are authoritative.
4.2.2.2 If authoritative: implement strict column selection in the grid builders.
4.2.2.3 If not authoritative: reduce config to visibility toggles only.

4.3 Phase 3 - Forecast Modularization - No UX Changes
4.3.1 Extract Generate Plan feature module.
4.3.1.1 Move goal-plan UI and transaction creation logic out of `js/forecast.js` into a dedicated module.
4.3.2 Extract grid loaders and orchestration.
4.3.2.1 Create focused modules for accounts grid, transactions grid, budget grid, and projections section.
4.3.2.2 Keep `js/forecast.js` as a thin coordinator.
4.3.3 Extract shared helpers.
4.3.3.1 Centralize common DOM lookup, section toggling, and scenario-type gating.

4.4 Phase 4 - Reuse-First Consolidation
4.4.1 Identify repeated patterns and consolidate into canonical utilities.
4.4.1.1 Grid column definitions and repeated event wiring.
4.4.1.2 Transaction row transforms and canonical transaction normalization.
4.4.2 Remove debug-only code paths.

4.5 Phase 5 - Notifications Cleanup - Prepare For Future UI
4.5.1 Add a thin notification helper while keeping the same UX.
4.5.1.1 Wrap `alert(...)` behind `notifySuccess`, `notifyError` helpers.
4.5.1.2 Replace usage gradually in forecast, navbar, and import-export modules.

5.0 Validation Checklist
5.1 No UX changes.
5.2 Avoid unrelated refactors.
5.3 Keep managers plus utilities pattern.
5.4 Scenario create and edit flows still persist correctly.
5.5 Stored data remains readable after migrations.

6.0 Deliverables
6.1 A series of small commits, each with a narrow goal.
6.1.1 Logging removal.
6.1.2 Starting balance normalization.
6.1.3 Generate Plan extraction.
6.1.4 Grid loader extraction.
6.1.5 Notification helper introduction.

7.0 Done Criteria
7.1 `js/forecast.js` is reduced to an orchestrator with feature modules.
7.2 Core config and model fields are consistent.
7.3 No logging remains in runtime code paths.
7.4 Notifications remain user-visible and consistent.
