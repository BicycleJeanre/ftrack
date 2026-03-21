# Summary vs Total Panel Plan

## Objective
- Separate **summary** sections (top-level workflow overviews) from **total panels** (per-row cards with aggregates).
- Keep every workflow with a summary section; keep a totals panel/card for every grid row except Accounts.
- Preserve existing totals (transactions, budget, projections, debt/general/funds summary totals) and layer in any sensible new totals where data is already visible.
- Add explicit explanations of each total card: **What it shows**, **How it is calculated**, **How it is used**. In the UI layout sketches below, commit those explanations to the same card so end users see them embedded with the total.
- Treat Generate Plan row as neither summary nor total; leave it untouched by this change set.

## Workflow Summary Strategy
1. **General, Debt Repayment, Funds** workflows keep `Summary` row (currently `#summaryCardsSection`) but the rendered cards should read as workflow summaries.
2. Each summary row can contain multiple total cards (already the case with overall totals + per-account cards), but they are still part of the workflow summary section.
3. Ensure summary tooling (filters, account-type selectors) remains near summary row; totals cards within the summary row will include per-card descriptions.
4. For workflows without summaries (budget-only, detail views), the summary row can stay collapsed or hidden.

## Dashboard Row Totals Layout
Each dash row (`Accounts & Transactions`, `Budget`, `Projections`, plus summary row) should begin with a **total panel/card area** before its grid content. Sketches below show ASCII card mockups that include:

### Summary Row (General/Debt/Funds)
```
┌────────────────────────────────────────────────────┐
│ Workflow Summary (filters + contextual help text) │
├────────────┬─────────────┬─────────────┬────────────┤
│ Net Worth  │ Balance End │ Interest    │ Accounts  │
│  $1.2m    │ $1.5m       │  +$24k      │  18       │
│ calc: last │ calc: sum of │ calc: list │ calc: #...│
│ bal + proj │ projected   │ of interest│ durable   │
│ Uses: quick│ ends per ac │ earned/paid│ summary   │
│ shows: how │ account      │ show: cash │ help text │
└────────────┴─────────────┴─────────────┴────────────┘
```
Explain under each total line:
1. **How it is calculated** – e.g., `sum of projection balances as of forecast end date`.
2. **How it is used** – e.g., `Quick status for solvency discussions`.
3. **What it shows** – e.g., `Combined asset/liability picture`.

### Transactions Row Totals Panel
```
┌─────────────────────────────┐
│ Transaction Totals (row header) │
├────────────┬────────────┬────────┤
│ Money In   │ Money Out  │ Net    │
│ $42k       │ $31k       │ +$11k  │
│ calc: sum  │ calc: sum  │ calc:   │
│ of filtered│ of filtered│ money   │
│ rows       │ rows       │ in - out│
│ Uses: help │ Uses: spot │ Uses: cash │
│ shows: infl│ shows: out │ shows: surplus │
└────────────┴────────────┴────────┘
```
- Explanation text belongs beneath each total so the card is self-describing (e.g., below Money In write “How: sum of `amount` filtered rows; Used: guides new income decisions; Shows: planned + actual inflows”).
*- Keep the existing `renderMoneyTotals` output (sitting in `.transaction-totals-container` placed above the Tabulator grid). It becomes the canonical totals card for the Transactions row.

### Budget Row Totals Panel
```
┌──────────────────────────────────────────┐
│ Budget Totals (inline with period filters) │
├────────────┬────────────┬──────────────┬────────────┤
│ Planned In │ Planned Out│ Planned Net  │ Realized Net│
│ $30k       │ $26k       │ +$4k         │ $2.5k       │
│ How: sum   │ How: sum   │ How: In-Out  │ How: actual │
│ Uses: adjust│ Uses: spot│ Uses: funding│ Uses: realized│
│ Shows: goal│ Shows: commits │ Shows: gap │ Shows: locked │
└────────────┴────────────┴──────────────┴────────────┘
```
- Keep the existing `renderBudgetTotals` container (`#budgetContent`) and embed descriptive text beneath each value, describing the calculation and usage.

### Projections Row Totals Panel
```
┌────────────────────────────────────────┐
│ Projection Totals (if toolbar exists)  │
├────────────┬────────────┬─────────────┤
│ Start Bal  │ End Bal    │ Income       │
│ $100k      │ $140k      │ $28k         │
│ How: first │ How: last  │ How: sum     │
│ period bal │ period bal │ future income│
│ Uses: as base│ Uses: goal│ Uses: capacity│
└────────────┴────────────┴─────────────┘
```
- Ensure a `.toolbar-totals` container is rendered (maybe inside `projections-content` header) so the above totals have a stable home.
- Each total line must include explanatory text similar to other cards.

### Summary Row Totals for Budget/Transactions Grids
- For cards rendered inside summary list components (e.g., per-account, per-transaction, per-budget summary cards), each card should include:
  ```
  ┌─────────────────────┐
  │ Card Title           │
  │ Total: $4,000        │
  │ Calc: ...
  │ Use: ...
  │ Shows: ...
  └─────────────────────┘
  ```
- This ensures totals anywhere in the summary row already explain themselves.

## New Totals to Add
1. **Projection Row: “Projected Net Change”** – difference between end and start balances. Helps highlight trajectory.
2. **Summary Row (General/Debt/Funds)** – add `Interest Direction` (net interest earned/paid) with explanation.
3. **Budget Row** – add `Open Commitments` (planned outstanding) and describe it as “sum of future planned items minus the current period”.

## Implementation Steps
1. Inventory existing layout spots for totals (Transactions `.transaction-totals-container`, Budget `#budgetContent`, `renderBudgetTotals`, `renderMoneyTotals`, summary containers) and ensure they live at the top of their row DOM before grids.
2. Create helper to render descriptive text below each total (reuse CSS class?). Ensure totals cards keep `overall-total` style.
3. Update forecast controller summary loaders to include description text within summary cards, clarifying how each value was calculated/used.
4. Extend projections section to render a `.toolbar-totals` container (if missing) so the totals text can be injected; update `forecast-projections.js` to include the new explanatory text.
5. Document assumptions and new totals in plan so QA knows where to verify.

## Verification
- Each dashboard row should now render a ‘total panel’ card area with explanatory text.
- Summary row cards (per workflow) must continue to refresh when filters change and include the new descriptions.
- Projects row should show the added totals and description text alongside the existing toolbar totals.
