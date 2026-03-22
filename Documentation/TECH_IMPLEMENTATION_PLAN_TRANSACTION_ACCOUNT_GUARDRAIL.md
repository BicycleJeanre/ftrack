# Transaction Account Guardrail Implementation Plan

**Goal**: Enforce that every transaction records two different accounts (primary ≠ secondary) and prevent null/empty secondary accounts across creation, editing, and split workflows.

## Scope
- Planned transactions UI (summary cards + detail grid) in `js/ui/components/grids/transactions-grid.js`.
- Transaction data pipeline (normalization, validation, storage) in `js/app/managers/transaction-manager.js` and `js/app/services/validation-service.js`.
- Split/compound transaction builder in `js/ui/components/modals/compound-transaction-modal.js` and supporting allocation logic `js/domain/calculations/loan-allocation-utils.js`.
- Shared transformers that map UI edits to canonical data in `js/ui/transforms/transaction-row-transformer.js`.
- Budget grid secondary-account editor parity (light touch) in `js/ui/components/grids/budget-grid.js`.

## Invariants to enforce
1) `primaryAccountId` and `secondaryAccountId` must both be present and different for every stored transaction.  
2) UI must never offer the primary account as a selectable secondary (and vice versa) and must not allow “None” once two accounts exist.  
3) Creation flows must prefill a valid secondary account; if only one account exists, block creation with guidance.  
4) Split/compound saves must not emit any component transaction whose secondary account matches the paying/primary account.  
5) Validation should fail fast on data that violates the rule to protect QC/export paths.

## Work packages

### 1) Data-layer guardrails
- Add validation: In `validation-service.js`, extend transaction checks to error when `secondaryAccountId` is missing or equals `primaryAccountId`; update issue messages for clarity.
- Harden normalization: In `transaction-manager.js`, before writing, assert the two IDs differ; if absent, throw a descriptive error consumed by UI to show a toast.

### 2) Default secondary assignment on creation
- Summary and detail “Add Transaction” buttons in `transactions-grid.js`: derive `defaultSecondaryAccountId` as the first account that is not the chosen primary; if unavailable, block with “Create at least two accounts” notice. Persist both IDs on creation.
- Inline edit path: when an edit would clear secondary, revert to last good value and surface a warning.

### 3) Dropdown filtering & editors
- `buildAccountSelect` (summary card secondary select) and Tabulator secondary column editor in `transactions-grid.js`: exclude the current primary account from options; remove the “— None —” option when ≥2 accounts exist.
- `mapEditToCanonical` in `transaction-row-transformer.js`: reject or roll back edits that set matching IDs.
- Budget grid parity: apply the same exclusion to the secondary account editor (`budget-grid.js` secondary list editor) to avoid regressions when budgets generate transactions.

### 4) Split / compound workflow
- In `compound-transaction-modal.js`:
  - Filter target/interest/additional account dropdowns to exclude the paying (primary) account.
  - In `guardedSave`, block save if target or any component account equals the paying account.
- In `loan-allocation-utils.js` (component → transaction builder), add a sanity check to drop/flag components where `secondaryAccountId === primaryAccountId`, returning a clear error upward.

### 5) Tests & QC
- Add validation-service test cases (or QC fixtures) covering:
  - Same-account primary/secondary → fails.
  - Missing secondary → fails.
  - Valid different accounts → passes.
- Smoke flows:
  - Try to create a transaction with only one account (blocked with guidance).
  - Add transaction with two accounts → defaults to distinct IDs.
  - Attempt to edit secondary to match primary in grid → blocked/reverted.
  - Split modal save with paying = target → blocked.
- Run existing suites: `npm run qc:test:transaction-expander`, `npm run qc:verify`, plus a quick projection render to ensure no new null handling paths.

## Open questions / decisions
- Should we auto-pick the “next” account by sort order or preserve the current account filter? (default: first account that isn’t primary, respecting current filter if present).
- UX feedback on blocked edits: toast vs inline error. (default: toast to match existing patterns in `transactions-grid.js`).
- For datasets already containing invalid pairs, should we auto-heal on load or surface validation errors to the user? (default: surface via validation-service and prevent save).

## Delivery checklist
- [ ] Validation rule in `validation-service.js`.
- [ ] Transaction manager guard + error messaging.
- [ ] Creation flows set both accounts; single-account block.
- [ ] Dropdown/account select exclusions in grid + transformer.
- [ ] Split modal filtering + save guard.
- [ ] Allocation utils sanity check.
- [ ] Tests/QC updated and run.
