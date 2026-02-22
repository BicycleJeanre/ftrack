# Workflow-Based Scenarios Refactor

## 1.0 Goal

1.0.1 Reduce a Scenario to a simple named version of user data.
1.0.2 Remove Scenario Types as a stored data concept.
1.0.3 Move start date, end date, and period type into projection-specific settings.
1.0.4 Replace Scenario Types with UI Workflows shown in a left nav.
1.0.5 Make Workflows declarative so adding a workflow is mostly configuration.
1.0.6 Adjust the Forecast UI to remove accordions and render all sections as cards.

## 2.0 Current Coupling Observed

2.0.1 Legacy UI sections were controlled by `assets/lookup-data.json.scenarioTypes` and `getScenarioTypeConfig`.
2.0.2 Legacy scenario records stored `type`, `startDate`, `endDate`, and `projectionPeriod`.
2.0.3 Legacy projection generation read `scenario.startDate/endDate/projectionPeriod` directly.
2.0.4 Legacy QC mapping was organized around scenario types in `QC/mappings/use-case-to-scenario-type.json`.

## 3.0 Proposed Conceptual Model

3.0.1 Scenario becomes “content only” (accounts, transactions, budgets, notes).
3.0.2 Workflow becomes “view only” (which grids/sections are visible and what summary widgets appear).
3.0.3 Projection settings become “engine only” (window + period type + source).
3.0.4 Forecast UI becomes “card-based” (workflows choose which cards are shown).

## 4.0 Data Model Implications

4.0.1 Scenario no longer stores:
- type
- startDate
- endDate
- projectionPeriod

4.0.2 Scenario stores:
- name and description
- accounts and transactions (and budgets when present)
- last known projection configuration under a projection bundle
- duplication lineage and version metadata

4.0.3 App-level UI state stores:
- last selected workflow id
- last selected scenario id and version
- per-view period settings for card grids (transactions, budgets, projections)

4.0.4 Planning Windows For Goal Tooling

4.0.4.1 Goal workflows use explicit planning windows stored on the scenario:
- `scenario.planning.generatePlan` (Generate Plan)
- `scenario.planning.advancedGoalSolver` (Advanced Goal Solver)

4.0.4.2 Planning windows default to the projection window but may diverge.

4.0.5 Versioning Through Duplication

4.0.5.1 Each scenario is a versioned artifact.
4.0.5.2 Duplicating a scenario creates a new scenario with a new ID and increments a version counter.
4.0.5.3 Scenarios track where they were duplicated from using a simple lineage record (no merge semantics).

## 5.0 Workflow Definitions

5.0.1 Workflows should be defined in code (not user data) as a small registry.
5.0.2 Each workflow definition includes:
- `id` and `name`
- `visibleCards`: a list of card keys (scenario picker, accounts, planned tx, actual tx, budget, projections, generate plan, summary cards)
- optional behavior flags (e.g., debt summary card mode, funds summary mode)

5.0.3 Forecast uses cards only (no accordions) and workflows decide which cards render.

5.0.4 UI routing:
- left nav selects a workflow
- the forecast page renders sections based on workflow config
- scenario selection remains orthogonal to workflow selection

5.0.5 Default Workflow Selection

- If `uiState.lastWorkflowId` is missing or invalid, default to `general`.

## 6.0 Import/Export Behavior

6.0.1 Export includes `uiState.lastWorkflowId` so the app re-opens on the same workflow after import.
6.0.2 If imported data has no `uiState`, fall back to the default workflow id (`general`).
6.0.3 Export includes `uiState.lastScenarioId` and the last selected scenario version so the app re-opens on the same version after import.

## 7.0 Migration Sketch

7.0.1 Scenario.type migration:
- drop the field from stored scenarios
- derive an initial workflow selection from the old scenario type (one-time mapping)

7.0.2 Projection range migration:
- move `startDate/endDate/projectionPeriod` into `scenario.projection.config`
- keep previously generated projection rows as `scenario.projection.rows` when present

7.0.3 Lookup data:
- deprecate `scenarioTypes` as a persistence concept
- keep `periodTypes` as lookup for projection config

## 8.0 QC and Documentation Impact

8.0.1 QC should be reorganized around workflows (view configs) rather than scenario types.
8.0.2 Existing scenario-type test suites can be re-labeled to workflow suites with the same engine assertions.
8.0.3 User docs will need to rename “Scenario Types” to “Workflows” and clarify that scenarios are versions.

## 9.0 Open Questions

9.0.1 Projection config is user-overridable per run and may be changed at any time.
9.0.2 Workflow selection is global-only.
9.0.3 Code-defined workflows are sufficient (registry can expand as new workflows are defined).
9.0.4 Transaction and budget period views are per-card settings (not tied to projection period type).
