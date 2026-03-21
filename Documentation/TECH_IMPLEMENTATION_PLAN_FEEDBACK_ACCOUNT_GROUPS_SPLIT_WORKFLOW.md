# Feedback Revision Plan: Account Group UX + Split Workflow v2

## 1.0 Purpose
1.0.1 Define a follow-up implementation plan that addresses the latest product feedback while staying aligned with:
- `Documentation/TECH_ACCOUNT_GROUPS_AND_ROLLUPS.md`
- `Documentation/TECH_ACCOUNT_GROUPS_ROLLUPS_CAPITAL_INTEREST.md`
- `Documentation/TECH_IMPLEMENTATION_PLAN_ACCOUNT_GROUPS_ROLLUPS_CAPITAL_INTEREST.md`
- `capital-interest-subtotal-plan.md`

1.0.2 Scope this plan to the gaps identified after initial rollout:
- Missing account group creation/assignment UX.
- Split-payment UX ambiguity (manual vs top-down, unclear field semantics).
- Lack of true "parent intent" lifecycle (create/edit/report split sets as one object).
- Missing rate-driven allocation integration for debt/interest workflows.
- Incomplete discoverability in detail workflows and reporting surfaces.

## 2.0 Design Guardrails
2.0.1 Preserve existing architecture patterns:
- Manager/service/domain/ui separation.
- Canonical unsigned transaction amounts.
- Date-only utilities (`formatDateOnly`, `parseDateOnly`).
- Tabulator + GridFactory patterns for grid features.

2.0.2 Keep schema changes additive and backward-compatible.

2.0.3 Keep existing canonical 2-legged transactions as the posting primitive.

2.0.4 Add "parent intent" metadata without breaking current transaction storage semantics.

## 3.0 Feedback-to-Requirement Mapping
| Feedback Theme | Required Outcome |
|---|---|
| No way to add/manage account grouping from account UX | Add account-group CRUD + assignment controls in Accounts workflows |
| Manual vs Top-Down modes unclear | Redesign split modal with explicit mode semantics and contextual help |
| Paying account / effective date / group id unclear | Clarify labels; hide internal IDs by default; add explanations |
| Total payment flow unclear | Make top-down mode actually auto-distribute and preview allocations |
| Split creation "just makes 3 rows" with no lifecycle | Introduce editable Split Set concept (parent intent + child transactions) |
| No integration with periodic-change interest | Add rate-driven auto allocation mode using account periodic-change config |
| No split edit flow in key places | Add "Create/Edit Split Set" actions in both summary and detail transaction workflows |
| Reporting/filtering of split data is hard | Add first-class split/group filters, grouping views, and totals by role |

## 4.0 Target Product Behavior (v2)
4.0.1 Account Groups:
- User can create/edit/delete account groups in Accounts UI.
- User can assign accounts to groups via dropdown (and quick-create group from dropdown).
- Group assignment is reusable and visible in account detail.

4.0.2 Split Set creation:
- User creates one "Split Set" intent with:
  - `description`
  - `payingAccountId` (money from)
  - `effectiveDate`
  - `totalAmount`
  - allocation strategy
- Child canonical transactions are generated/updated under one shared set ID.

4.0.3 Allocation strategies:
- `auto_rate`: derive interest from configured account periodic-change/rate and allocate remainder to principal after fees/adhoc.
- `top_down`: user enters total and non-principal buckets; principal is auto remainder.
- `manual`: user enters all component amounts directly; total is derived.

4.0.4 Split components:
- Support default roles (`principal`, `interest`) plus user-defined adhoc rows (e.g., `fee`, `extra_principal`, `insurance`).
- Preserve role metadata for reporting and downstream aggregation.

4.0.5 Editing lifecycle:
- Editing any child in a split set can open "Edit Split Set" mode.
- Update operation recalculates and rewrites the full set atomically.

4.0.6 Reporting/discovery:
- Transactions grid can filter/group by split set and role in both summary/detail workflows.
- Optional split-set summary view shows parent intent with expandable children.

## 5.0 Data Contract Additions (Additive)
5.0.1 Existing fields retained:
- `transaction.transactionGroupId`
- `transaction.transactionGroupRole`

5.0.2 New scenario-level metadata (recommended):
- `scenario.splitTransactionSets?: SplitTransactionSet[]`

5.0.3 Suggested `SplitTransactionSet` shape:
```js
{
  id: string,                      // stable set id, replaces direct user-facing "Group Id"
  description: string,
  payingAccountId: number,
  effectiveDate: 'YYYY-MM-DD',
  strategy: 'auto_rate' | 'top_down' | 'manual',
  targetAccountId: number | null,  // principal/liability account when relevant
  interestSource: 'account_rate' | 'custom_rate' | 'none',
  customRate: number | null,
  components: [
    { role: string, accountId: number, amountMode: 'fixed' | 'derived' | 'remainder', value: number | null, order: number }
  ],
  recurrence: object | null,
  tags: string[]
}
```

5.0.4 Account-group assignment support:
- Continue using `scenario.accountGroups`.
- Add optional `account.groupIds?: number[]` only if direct assignment caching is needed.
- Otherwise keep membership normalized on group objects (`accountGroups[].accountIds`).

## 6.0 Phased Implementation Plan

### 6.1 Phase A - UX Clarity Hotfixes (Low Risk, Immediate)
6.1.1 Goal:
- Remove ambiguity in current split modal without waiting for deeper model work.

6.1.2 Files:
- `js/ui/components/modals/compound-transaction-modal.js`
- `js/domain/calculations/loan-allocation-utils.js`
- `styles/partials/components.css`

6.1.3 Tasks:
1. Rename labels:
   - "Paying Account (Money From)"
   - "Description" (remove "Base Description")
   - "Start Date (Effective Date)"
2. Add inline mode descriptions:
   - Top-Down: total input drives principal remainder.
   - Manual: component inputs drive total.
3. Hide raw group ID by default under "Advanced" section.
4. Improve live preview to explicitly show formula and resulting per-role amounts.
5. Add validation copy that explains why no allocation was produced.

6.1.4 Exit criteria:
- User can distinguish all fields and both allocation modes without external explanation.

### 6.2 Phase B - Account Group CRUD + Assignment UX
6.2.1 Goal:
- Make account groups first-class in Accounts workflows.

6.2.2 Files:
- `js/domain/utils/account-group-utils.js`
- `js/app/managers/scenario-manager.js`
- `js/app/services/data-service.js`
- `js/ui/components/grids/accounts-grid.js`
- `js/ui/components/modals/account-group-modal.js` (new)
- `styles/partials/components.css`

6.2.3 Tasks:
1. Add group manager helpers in scenario manager/service layer:
   - create/update/delete group
   - assign/unassign account membership
2. Add Accounts UI actions:
   - "Manage Groups" modal
   - group dropdown in account detail row
   - quick-create group from account detail dropdown
3. Add accounts grid grouping/filter by account group.
4. Add validation for duplicate names, orphan parent, and cycle constraints.

6.2.4 Exit criteria:
- Users can create reusable groups and assign accounts without direct JSON edits.

### 6.3 Phase C - Split Set Domain Model + Atomic Save/Edit
6.3.1 Goal:
- Represent split workflow as one parent intent with child transaction rows.

6.3.2 Files:
- `js/app/managers/transaction-manager.js`
- `js/app/services/data-service.js`
- `js/shared/app-data-utils.js`
- `js/shared/migration-utils.js`
- `js/domain/calculations/loan-allocation-utils.js`
- `js/ui/transforms/transaction-row-transformer.js`

6.3.3 Tasks:
1. Add additive `scenario.splitTransactionSets`.
2. Create domain service to:
   - generate child canonical transactions from split set definition,
   - reconcile existing child rows on edit,
   - enforce invariant `sum(children) = total`.
3. Persist set-level metadata and keep transactionGroupId linkage.
4. Backfill existing grouped transactions into derived split-set metadata during load (non-destructive fallback).

6.3.4 Exit criteria:
- Split payments are editable as one object and remain canonical transactions in ledger storage.

### 6.4 Phase D - Rate-Driven Allocation Integration
6.4.1 Goal:
- Connect top-down workflow to account periodic-change/rate logic.

6.4.2 Files:
- `js/domain/calculations/periodic-change-utils.js`
- `js/domain/calculations/projection-engine.js`
- `js/domain/calculations/loan-allocation-utils.js`
- `js/ui/components/modals/compound-transaction-modal.js`
- `js/app/managers/account-manager.js`

6.4.3 Tasks:
1. Add "interest source" options in split modal:
   - Use account periodic-change rate
   - Use custom rate
   - Manual interest amount
2. Implement calculation utility for estimated interest on payment date:
   - based on selected target liability/principal account
   - consistent with periodic-change engine conventions
3. Apply waterfall in order:
   - adhoc fixed components
   - derived/custom interest
   - principal remainder
4. Surface explanation of computed values and assumptions in preview.

6.4.4 Exit criteria:
- User can enter total payment and get deterministic principal/interest split from rate logic.

### 6.5 Phase E - Transactions UX: Create/Edit from Summary and Detail
6.5.1 Goal:
- Ensure split creation/edit is discoverable and available in all relevant transaction workflows.

6.5.2 Files:
- `js/ui/components/grids/transactions-grid.js`
- `js/ui/components/modals/compound-transaction-modal.js`
- `styles/partials/components.css`

6.5.3 Tasks:
1. Add explicit toolbar action (not only filter-modal action) for "Create Split Set".
2. Add row-level action "Edit Split Set" for rows with `transactionGroupId`.
3. Add grouped-row/expandable visualization for split sets (optional toggle):
   - parent summary row
   - child component rows
4. Support adding/removing adhoc components during edit.

6.5.4 Exit criteria:
- Users can create and edit split sets in both transaction summary and detail workflows.

### 6.6 Phase F - Reporting and Filtering Enhancements
6.6.1 Goal:
- Make split and group metadata practically useful for analysis.

6.6.2 Files:
- `js/ui/components/grids/transactions-grid.js`
- `js/ui/transforms/data-aggregators.js`
- `js/ui/components/widgets/toolbar-totals.js`
- `js/ui/controllers/forecast-controller.js`

6.6.3 Tasks:
1. Add dedicated filters:
   - Split Set
   - Group Role
   - Account Group scope
2. Add split-role subtotal cards (principal/interest/fees/adhoc).
3. Add export-ready view where grouped split sets can be inspected by set and by role.
4. Ensure aggregation utility includes split-role dimension support.

6.6.4 Exit criteria:
- Users can answer "how much total interest/principal/fees by split set and account group" directly in UI.

### 6.7 Phase G - QC, Migration, and Documentation
6.7.1 Goal:
- Validate behavior and publish updated docs/training.

6.7.2 Files:
- `QC/qc-input-data.json`
- `QC/qc-expected-outputs.json`
- `QC/tests/workflows/debt-repayment.test.js`
- `Documentation/TECH_DATA_SCHEMA.md`
- `Documentation/TECH_UI_LAYER.md`
- `Documentation/SCREENPEL_BUDGET_WORKFLOW_TUTORIAL_PLAN.md`

6.7.3 Tasks:
1. Add QC scenarios for:
   - account group creation/assignment/rollup totals
   - split set create/edit invariants
   - auto-rate top-down allocation
   - manual allocation with adhoc components
2. Add migration and fallback tests for existing `transactionGroupId` data.
3. Update docs and user-facing tutorial flows to match revised UI terminology.

6.7.4 Exit criteria:
- Regression suites pass and documentation reflects actual workflow.

## 7.0 Priority Delivery Order
1. Phase A (clarity hotfixes)
2. Phase B (account group UX)
3. Phase E (split create/edit discoverability)
4. Phase C (split set parent model)
5. Phase D (rate-driven allocation)
6. Phase F (reporting)
7. Phase G (QC/docs closure)

## 8.0 Acceptance Criteria (User-Centric)
8.0.1 Grouping:
- From Accounts UI, user can create a group and assign accounts in under 3 clicks per account.

8.0.2 Split clarity:
- In split modal, user can explain the difference between each mode from UI copy alone.

8.0.3 Top-down usefulness:
- Entering total payment with account-rate mode computes interest and principal automatically with a visible formula preview.

8.0.4 Lifecycle:
- Any split child row can be edited through one parent split editor; edits update all linked child rows.

8.0.5 Reporting:
- User can filter and group transactions by split set and role from the same workflow they use for normal transaction analysis.

## 9.0 Risks and Mitigations
9.0.1 Risk: over-complicating first pass.
- Mitigation: ship Phase A/B/E before C/D/F; keep value visible early.

9.0.2 Risk: mismatch between rate-derived split and projection engine math.
- Mitigation: centralize formula helpers in one domain utility reused by both workflows.

9.0.3 Risk: legacy grouped transactions lacking parent metadata.
- Mitigation: derive synthetic split-set metadata at load-time and allow optional user normalization.

9.0.4 Risk: UX noise from advanced fields.
- Mitigation: progressive disclosure (advanced accordion for internal IDs/debug metadata).

## 10.0 Out of Scope for This Plan
10.0.1 Full multi-leg journal engine rewrite.

10.0.2 Posting directly to non-postable account groups.

10.0.3 Automatic accounting-rule inference for all account types beyond debt/loan-focused defaults.
