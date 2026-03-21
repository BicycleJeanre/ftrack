# Account Groups, Rollups, and Capital/Interest Implementation Plan

## 1.0 Purpose
1.0.1 Define a repository-specific implementation plan for:
- Account Groups (rollups, non-postable)
- Compound Transactions (split payments via grouped canonical transactions)
- Capital vs Interest aggregation across totals, grids, and summaries
- Periodic-change interest as ledger-visible projection postings

1.0.2 Keep implementation aligned with existing architecture and patterns in this repository (manager/service/domain/ui layering, canonical unsigned transaction amounts, date-only conventions, and QC workflow).

1.0.3 Source design inputs:
- `Documentation/TECH_ACCOUNT_GROUPS_AND_ROLLUPS.md`
- `Documentation/TECH_ACCOUNT_GROUPS_ROLLUPS_CAPITAL_INTEREST.md`
- `capital-interest-subtotal-plan.md`

## 2.0 Current Baseline (Code Inventory)
2.0.1 Storage and schema normalization:
- `js/shared/app-data-utils.js`
- `js/shared/migration-utils.js`
- `js/app/managers/scenario-manager.js`

2.0.2 Canonical entity managers:
- `js/app/managers/account-manager.js`
- `js/app/managers/transaction-manager.js`
- `js/app/managers/budget-manager.js`

2.0.3 Projection generation and recurrence expansion:
- `js/domain/calculations/projection-engine.js`
- `js/domain/calculations/transaction-expander.js`
- `js/domain/calculations/periodic-change-utils.js`

2.0.4 UI transformation and totals:
- `js/ui/transforms/transaction-row-transformer.js`
- `js/ui/transforms/data-aggregators.js`
- `js/ui/components/widgets/toolbar-totals.js`
- `js/ui/components/forecast/forecast-totals.js`
- `js/ui/components/forecast/forecast-projections.js`
- `js/ui/components/forecast/forecast-projections-section.js`
- `js/ui/controllers/forecast-controller.js`

2.0.5 QC and validation framework:
- `QC/qc-input-data.json`
- `QC/qc-expected-outputs.json`
- `QC/tests/workflows/*.test.js`
- `Documentation/TECH_QC_METHOD.md`

## 3.0 Guardrails (Design Patterns and Coding Standards)
3.0.1 Preserve clean layer boundaries:
- Domain calculations remain in `js/domain/calculations/*`.
- Persistence normalization remains in managers/shared schema utilities.
- UI shaping and display-level aggregation remain in `js/ui/transforms/*` and UI components.

3.0.2 Preserve canonical transaction conventions:
- Stored `transaction.amount` remains unsigned.
- Direction stays encoded by `transactionTypeId` and perspective transforms.

3.0.3 Preserve date conventions:
- Use `parseDateOnly` / `formatDateOnly`.
- Avoid `new Date('YYYY-MM-DD')` parsing in new logic.

3.0.4 Prefer additive, backwards-compatible fields over destructive schema moves.

3.0.5 Reuse existing reusable patterns:
- Managers for CRUD/normalization.
- Shared transform utilities for totals.
- `GridFactory`-based Tabulator integration.

## 4.0 Target Data Contract (Additive)
4.0.1 Scenario-level:
- `scenario.accountGroups?: AccountGroup[]`

4.0.2 Account-level (for derived periodic-change posting):
- `account.interestAccountId?: number | null`
- `account.interestPostingDirection?: string | null`

4.0.3 Transaction-level:
- `transaction.transactionGroupId?: string | number | null`
- `transaction.transactionGroupRole?: 'principal' | 'interest' | 'fee' | 'adhoc' | string | null`

4.0.4 Budget occurrence (optional parity for reporting consistency):
- `budget.transactionGroupId?: string | number | null`
- `budget.transactionGroupRole?: string | null`

4.0.5 Projection row additions (non-breaking):
- `capitalIn`, `capitalOut`, `interestIn`, `interestOut`
- Keep existing `income`, `expenses`, `netChange`, `interest` during transition.

## 5.0 Phased Implementation Plan

### 5.1 Phase 0 - Foundation and Non-Breaking Schema Plumbing
5.1.1 Goal:
- Introduce additive fields into normalization/sanitization paths before behavior changes.

5.1.2 Files:
- `js/shared/app-data-utils.js`
- `js/shared/migration-utils.js`
- `Documentation/TECH_DATA_SCHEMA.md`

5.1.3 Tasks:
1. Extend `normalizeScenario` and `sanitizeScenarioForWrite` to retain `accountGroups`.
2. Ensure account and transaction arrays preserve newly added optional fields during pass-through sanitization.
3. Add migration pass-through for optional new fields without forcing schema version bump.
4. Update data schema documentation with new optional fields and semantics.

5.1.4 Exit criteria:
- Import/export round-trips retain new optional fields with no regressions in existing scenarios.

### 5.2 Phase 1 - Aggregation Utility Upgrade (Capital/Interest Core)
5.2.1 Goal:
- Establish one canonical utility for capital/interest totals and keep legacy money in/out totals available.

5.2.2 Files:
- `js/ui/transforms/data-aggregators.js`
- `js/ui/components/widgets/toolbar-totals.js`
- `js/ui/components/forecast/forecast-totals.js`
- `js/ui/components/forecast/forecast-projections.js`

5.2.3 Tasks:
1. Add a canonical "aggregatable row" adapter in `data-aggregators.js`.
2. Add reducer output shape:
   - `capitalIn`, `capitalOut`, `interestIn`, `interestOut`, `total`.
3. Keep compatibility wrappers for current `calculateCategoryTotals` / `calculateBudgetTotals` consumers.
4. Add formatter-friendly metadata support for totals cards (labels, calc, uses, shows).
5. Wire transaction, budget, and projection totals surfaces to utility output.

5.2.4 Exit criteria:
- Toolbar and totals cards render stable values from the same reducer path.
- Existing workflows still display legacy totals where required.

### 5.3 Phase 2 - Account Groups (Rollups, Non-Postable)
5.3.1 Goal:
- Add rollup structure and group-aware aggregation without changing posting semantics.

5.3.2 Files:
- `js/app/managers/scenario-manager.js`
- `js/shared/app-data-utils.js`
- `js/domain/utils/account-group-utils.js` (new)
- `js/ui/controllers/forecast-controller.js`
- `js/ui/components/forecast/forecast-projections.js`

5.3.3 Tasks:
1. Define `AccountGroup` shape (id, name, parentGroupId, accountIds, sortOrder).
2. Implement utility functions:
   - `getGroupById`
   - `resolveDescendantGroupIds`
   - `getGroupAccountIds`
   - cycle and orphan validation helpers
3. Add group-aware filters in totals and summary calculations (expand to member account IDs before aggregation).
4. Add minimal UI selection/filter entry point for group scope in summary/totals surfaces.

5.3.4 Exit criteria:
- Group scope totals equal the sum of included member accounts.
- No ability to post directly to a group.

### 5.4 Phase 3 - Compound Transactions (Split Payment Metadata and UX)
5.4.1 Goal:
- Represent one user intent as N canonical transactions linked by `transactionGroupId`.

5.4.2 Files:
- `js/app/managers/transaction-manager.js`
- `js/app/services/data-service.js`
- `js/ui/transforms/transaction-row-transformer.js`
- `js/ui/components/grids/transactions-grid.js`
- `js/domain/calculations/transaction-expander.js`

5.4.3 Tasks:
1. Extend transaction normalization to persist/read `transactionGroupId` and `transactionGroupRole`.
2. Preserve these fields through transforms (canonical -> perspective rows and edits back to canonical).
3. Add grid visibility/filtering for transaction group metadata.
4. Add initial compound creation flow (multi-row create in one action) that generates linked canonical transactions.
5. Ensure expanders and projections carry metadata into occurrences.

5.4.4 Exit criteria:
- Compound payment rows remain standard canonical transactions in storage.
- Grouped components can be queried and totaled together by shared `transactionGroupId`.

### 5.5 Phase 4 - Periodic Change as Derived Ledger Posting (Interest Visibility)
5.5.1 Goal:
- Replace interest-only internal deltas with derived projection occurrences that post into configured interest accounts.

5.5.2 Files:
- `js/domain/calculations/projection-engine.js`
- `js/domain/calculations/periodic-change-utils.js`
- `js/app/managers/account-manager.js`
- `js/ui/components/grids/accounts-grid.js`

5.5.3 Tasks:
1. Add optional account config fields (`interestAccountId`, `interestPostingDirection`) to account create/update flows.
2. Refactor projection periodic-change branch:
   - compute delta from balance math as today,
   - create derived occurrence object for that delta,
   - apply occurrence through existing two-legged transaction application logic,
   - mark occurrence as interest-only for aggregation.
3. Prevent double counting by removing direct `periodIncome/periodExpenses` adjustment for the same delta once derived posting is applied.
4. Maintain backwards-compatible `interest` field in projection row during transition.

5.5.4 Exit criteria:
- Interest effect appears as ledger-like movement in projection totals and account summaries.
- Debt-style accounts show interest in expense account rollups, not only as hidden balance delta.

### 5.6 Phase 5 - UI Rollout: Capital/Interest Columns and Summary Cards
5.6.1 Goal:
- Surface capital/interest split consistently in projections, toolbar totals, debt/general summaries.

5.6.2 Files:
- `js/ui/components/forecast/forecast-projections-section.js`
- `js/ui/components/forecast/forecast-projections.js`
- `js/ui/components/widgets/toolbar-totals.js`
- `js/ui/controllers/forecast-controller.js`
- `styles/partials/components.css`
- `styles/partials/layout.css`

5.6.3 Tasks:
1. Add projection grid columns:
   - Capital In
   - Capital Out
   - Interest In
   - Interest Out
2. Keep legacy Income/Expenses/Net visible or derived during transition to avoid workflow breakage.
3. Update debt and general summary cards to read from aggregation utility buckets instead of raw `row.interest` sign checks.
4. Update totals card descriptions/tooltips to reflect capital/interest semantics.

5.6.4 Exit criteria:
- Projection table top-calcs, toolbar totals, and summary cards reconcile to the same bucket totals.

### 5.7 Phase 6 - Top-Down Allocation Templates (Optional, After Core Stability)
5.7.1 Goal:
- Enable parent-total entry that generates component transactions (fees -> interest -> principal waterfall).

5.7.2 Files:
- `js/domain/calculations/loan-allocation-utils.js` (new)
- `js/ui/components/grids/transactions-grid.js`
- `js/ui/components/modals/*` (new allocation modal)

5.7.3 Tasks:
1. Define allocation template/config storage (group-level or reusable template object).
2. Build deterministic allocator with invariant: sum(components) = parent total.
3. On save, emit canonical linked transactions with shared `transactionGroupId` and role tags.

5.7.4 Exit criteria:
- User can enter one payment total and receive valid component transactions with no remainder drift.

### 5.8 Phase 7 - QC, Regression Coverage, and Documentation Closure
5.8.1 Goal:
- Lock behavior with QC cases and documentation updates.

5.8.2 Files:
- `QC/qc-input-data.json`
- `QC/qc-expected-outputs.json`
- `QC/tests/workflows/debt-repayment.test.js`
- `QC/tests/workflows/general.test.js`
- `QC/tests/workflows/budget.test.js`
- `Documentation/TECH_DATA_SCHEMA.md`
- `Documentation/TECH_UI_LAYER.md`
- `Documentation/OTHER_CHANGELOG.md`

5.8.3 Tasks:
1. Add QC scenarios for:
   - account group rollups,
   - compound split payment invariants,
   - derived periodic-change interest posting,
   - capital/interest totals reconciliation across surfaces.
2. Add expected outputs for capital/interest buckets by workflow.
3. Update docs for new fields, behavior, and UI labels.

5.8.4 Exit criteria:
- QC workflow suites pass with new use cases and no regressions in legacy totals.

## 6.0 Cross-Cutting Acceptance Criteria
6.0.1 Data integrity:
- No loss of unknown optional fields on save/import/export.
- Existing scenarios continue to load and project without required manual migration steps.

6.0.2 Accounting consistency:
- Derived interest postings are represented once.
- `capitalIn + interestIn - capitalOut - interestOut` reconciles with displayed net totals.

6.0.3 UX consistency:
- Totals shown in toolbars, projections panels, and summary cards reconcile under the same filters.

6.0.4 Performance:
- Projection generation remains responsive for current QC datasets and expected scenario sizes.

## 7.0 Risk Register and Mitigations
7.0.1 Risk: double counting interest during projection transition.
- Mitigation: route all interest effects through one derived occurrence pathway and keep a temporary assertion comparing old/new totals during development.

7.0.2 Risk: rollup cycles causing recursion issues.
- Mitigation: validate `accountGroups` on write and reject cycles/orphans.

7.0.3 Risk: inconsistent totals across views.
- Mitigation: centralize through one aggregation utility and remove duplicate reducer logic from view-level components.

7.0.4 Risk: schema drift across docs and code.
- Mitigation: update `TECH_DATA_SCHEMA.md` and QC fixtures in same delivery phase.

## 8.0 Suggested Delivery Sequence
8.0.1 Deliver in this order:
1. Phase 0
2. Phase 1
3. Phase 4
4. Phase 5
5. Phase 2
6. Phase 3
7. Phase 7
8. Optional Phase 6

8.0.2 Rationale:
- Capital/interest and derived interest postings should stabilize first because they affect all totals surfaces.
- Account groups and compound UX can then layer on top of stable aggregation and projection behavior.
