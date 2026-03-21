# Capital vs Interest Subtotal Plan

*Builds on the existing [Summary vs Total Panel Plan](./summary-total-reorg-plan.md) by focusing on how totals/subtotals are calculated, broken out, and surfaced across the dashboard. Our goal is to treat every aggregate as a pair of capital + interest values, keeping the new aggregation utility the single source of truth for totals shown in summary cards, totals panels, toolbars, and projected account row period totals.*

## Guiding principles
1. **Two-value aggregates everywhere:** Every subtotal/total (accounts, transactions, budget, projections, debt summary) expresses both capital and interest in the verbs “money in/out” and “projected balances.”
2. **Rebuild subtotals during the total re-org:** While we’re already adding more subtotal cards, leverage that redesign to insert the capital/interest split wherever those cards or totals appear.
3. **Utility-first aggregation:** Introduce a reusable helper (the Aggregation Utility) that returns `{ capitalIn, capitalOut, interestIn, interestOut, total }` (or a similar shape) so every UI consumer—toolbar totals, summary cards, projections grids—just asks for the metrics it needs.
4. **Future-proofs new subtotal sections:** The utility should be config-driven (labels, formatter, source data, aggregation strategy) so future sections can register their own subtotal definitions without duplicating logic.

## Requirements overview
- Debt summary and projection cards must expose capital vs interest side-by-side, including the money in/money out columns for projections periods.
- Projection grid rows (per account/period) currently show “Money In” and “Money Out” totals—these must become four columns (Capital In, Capital Out, Interest In, Interest Out) while keeping period subtotals easy to add.
- Toolbar totals and workspace summaries (transactions, budget totals, projections totals) must reuse the Aggregation Utility so each one renders the same capital/interest split that drives filters/description text.
- As subtotals are rebuilt, the same utility powers accounts totals (e.g., debt summary, general summary), allowing the new subtotal cards from the reorg plan to simply pull both capital and interest data from the shared aggregator.

## Data & Calculation flow
1. **Transaction/Budget Source Layer:**
   - Extend transactions/budgets (and derived projection occurrences) so each entry includes `capitalAmount` and `interestAmount` metadata or a flag that tells the aggregator how to split `amount` (e.g., by tag, account type, or transaction metadata).
   - Decide once (probably in the projection engine or transaction expander) whether the split lives on the canonical occurrence; downstream grids just read enum fields rather than recalculating per-view.
2. **Projection Engine:**
   - When expanding transactions into projection rows, carry forward the capital/interest amounts so period totals can simply sum the right fields.
   - Update `generate projections` routines to emit both types, ensuring no view recomputes the split differently than the aggregated totals.
3. **Aggregation Utility (core new piece):**
   - Inputs: data set (transactions/budgets/projection rows), filters (period/account/status), and a configuration object describing what to sum (e.g., `[{ label: 'capitalIn', field: 'capitalAmount', type: 'in' }, ...]`).
   - Outputs: structured results such as:
     ```js
     {
       capitalIn: { value, description, formatter },
       interestIn: { value, ... },
       capitalOut: { value, ... },
       interestOut: { value, ... },
       total: { value },
       breakdown: [ ... ]
     }
     ```
   - Provide helper methods to add descriptive text per subtotal (e.g., `how`, `use`, `shows`) so UI cards keep their explanations without repeating logic.
   - Expose both “column sums” (for grid footers/toolbars) and “panel definitions” (for summary cards). The same utility powers toolbar totals and summary row cards.
4. **Filter-aware hooks:**
   - Ensure aggregator accepts filter hooks (account/type/status) so the toolbar/panel totals respond to the currently selected data set, just like existing renderers.

## UI implementation outline
1. **Projection totals and period columns:**
   - Update projection toolbar/period headers to render four distinct columns (Capital In/Out + Interest In/Out) while keeping existing money-in/out columns for backwards compatibility or transitional views.
   - When canonical period data changes, recalc via aggregator so the totals shown above the grid match the footer splits.
2. **Summary and totals cards:**
   - Switch `forecast-totals.js`, `renderMoneyTotals`, and `renderBudgetTotals` to invoke the new utility, retrieving the structured result and mapping each field to a card with label/description and formatted value.
   - Update debt/general/fund summary cards to display the capital/interest split—each card can show two lines (Capital and Interest) while still linking into the aggregator for consistent values.
3. **Toolbar totals:**
   - Toolbar `Totals` components should now accept the aggregated data object, map it to a row of cards, and render the `formatter`/`description` (per requirement) so they align with the instructions in the summary reorg plan.
4. **New subtotal placements:**
   - For any new subtotals added via the reorg plan (e.g., Projected Net Change or Interest Direction), define them in the aggregator config so they automatically render with the proper capital/interest context.

## Supporting work
- **Documentation:** Update the plan file in this repository with these steps and ensure the new markdown references the summary reorg plan for context.
- **Testing/QA:** Add coverage (manual check or unit test) that ensures every total card reflects the same capital/interest totals as the toolbar and summary. Document verification steps for each major section (Transactions, Budgets, Projections, Debt Summary).

## Next steps
1. Confirm which models already track interest vs capital (accounts, transactions, budgets) and finalize where the split is persisted for projections.
2. Define the aggregation utility API and config shape; prototype a reducer that takes canonical rows and returns the structured `[capitalIn, capitalOut, interestIn, interestOut]` buckets plus descriptive metadata.
3. Wire projections grid/toolbars and summary cards to consume the aggregator output, ensuring money-in/out lens is replaced with the four capital/interest columns.
4. Document expected UI changes (card layout, column headers) so any front-end tweaks align with the reorg plan’s descriptive text requirement.
