# Split Transactions: Group Invariants, Interest Reuse, and Compact UI Plan

Date: 2026-03-22
Status: Revised Plan (post-UX gap review)

## Objectives
- Enforce “one account group per split set” across principal, interest, and adhoc components; auto-create group when none exists.
- Reuse (not recreate) interest accounts; persist selection on reopen.
- Keep allocation strategy (Top-Down vs Manual) sticky across edits.
- Tighten transaction input UI to a compact 3→2→1 responsive layout, reusing existing patterns.
- Clarify edit affordances without changing the default overview appearance (add explicit edit control; no double-click).

## Scope
- Split-set data model & save flow (group + interest handling).
- Split modal & inline split editing (payload assembly, group selector, strategy stickiness).
- Transaction overview/detail cards (responsive layout, compact controls, edit entry point).
- Styling additions that reuse existing grid helpers; minimal global surface area.

## Deliverables
- Code changes in the files listed under “Touchpoints”.
- No new APIs; additive schema fields only.
- Reusable CSS utility for compact grids.

## Behavior Specs (aligned to UX feedback)

### Account Group Invariant
- Derive a single `splitSetGroupId` when creating/editing a split set:
  1) Paying account primary group (if any)
  2) Else target (liability/principal) account primary group
  3) Else auto-create group named `<Paying Account> Split Set` (or fallback to target name) with a short description; assign to all split components and any auto-created interest account.
- Persist `accountGroupId` on the split-set record and propagate to each component as `transactionGroupAccountGroupId`.
- When reopening a split set, preselect the stored group; do not silently re-infer.

### Interest Account Reuse
- Before creating an interest account, check for an existing account by exact name in the scenario.
- If created, assign it to `splitSetGroupId` (even when the target account had no group).
- Store the interest account id on the split set; preselect on reopen.
- Only auto-create when interest amount > 0 and no interest account id is present.

### Strategy Stickiness
- Respect stored split-set strategy; if absent, prefer last user selection cached in component state; final fallback = `manual`.
- Do not override user choice during recompute.

### Split Modal UX (compact + clear)
- Apply `tx-compact-grid` to main sections.
- Add “Split Group” selector (with quick-create) beside description/paying account block.
- Layout rows:
  1) Paying Account (RO display) | Description | Split Group
  2) Recurrence (icon+label modal opener) | Amount | Secondary Account
  3) Interest Source (icon button to periodic-change modal) | Principal (RO in Top-Down) | Interest (RO in Top-Down)
  4) Additional components list (existing behavior, tighter spacing)
- Top-Down: amount drives allocation; principal/interest read-only previews with concise hint.
- Manual: principal/interest editable; total is derived/read-only.

### Inline Split Edit (transactions grid card)
- Add clear edit button in actions rail to open detail edit (no double-click reliance).
- Keep header look in overview; when expanded, top row is editable with same layout.
- Show a small “Split Group” chip/selector when a row has `transactionGroupId`.
- Interest account selector prefilled with stored id; no duplicates on save.
- Mode select reflects stored/last choice; remains unchanged by recompute.

### Transaction Overview / Detail Layout
- Overview: unchanged visuals; add explicit edit button; row click still toggles expand/collapse.
- Detail top row: mirrors header (Secondary | Amount | Type) using `tx-compact-grid`.
- Second row (3-up): Recurrence | Periodic Change | Date — each as icon button + small label + inline summary (single-line).
- Lower row: Description | Status | Tags | Split Group (if split); auto-flow up to 4 columns via `tx-compact-grid` + span helper.
- Responsive: 3 cols desktop, 2 tablet, 1 mobile; reuse existing breakpoints/tokens.

### Validation / Safeguards
- On save, if any component group differs from `splitSetGroupId`, normalize to the set group.
- Existing split sets without `accountGroupId` load fine; first re-save backfills the group per inference rule.
- Non-split transactions remain unaffected.

## Touchpoints (expected files)
- `js/app/managers/transaction-manager.js` — add `accountGroupId` to split-set normalize/persist; propagate `transactionGroupAccountGroupId`.
- `js/domain/calculations/loan-allocation-utils.js` — accept `accountGroupId` in `buildCompoundTransactions` and apply to child legs.
- `js/ui/components/grids/transactions-grid.js` — group derivation/quick-create, strategy stickiness, interest reuse, inline selector, compact layout hooks, edit affordance wiring, header/detail alignment, iconized recurrence/periodic change.
- `js/ui/components/modals/compound-transaction-modal.js` — Split Group control, compact rows, mode copy/read-only tweaks, recurrence/periodic-change compact affordance, reorganized row layout.
- `js/ui/components/modals/account-group-modal.js` — optional quick-create entry for split modal/inline.
- `styles/partials/components.css` (and `layout.css` if needed) — `tx-compact-grid` utility, icon+label controls, responsive tweaks, span helper.
- `js/app/services/data-service.js` — expose group create helper if not already available to UI layer.

## CSS Notes (reuse-first)
- Base on existing form grid classes; add modifier `tx-compact-grid` with:
  - `grid-template-columns: repeat(3, minmax(0, 1fr))` desktop;
  - collapse to 2/1 via existing breakpoints.
- Icon-button-with-label pattern: small icon (16–18px), label text, subtle chevron/external glyph for modal hint.

## QA Checklist (manual)
- Create split with no groups → auto group created, all components + interest account in that group.
- Split where target has group, paying none → uses target group; no new group.
- Save Top-Down with rate → reopen shows Top-Down; interest account not duplicated.
- Inline edit: click edit icon opens detail; top row matches header; recurrence/periodic change open modals via icon buttons.
- Responsive: 3→1 columns on overview and detail at breakpoints.
- Legacy split (no `accountGroupId`) re-saved picks up inferred/created group; non-split rows unchanged.

## Out of Scope
- Changing accounting equation semantics or storage format; still N canonical transactions linked by `transactionGroupId`.
- New global design language; only compacting existing patterns.
