# Budget / Projection snapshot Requirements 

1. When a projection is created, the user is offered an option to "Save as `budget` (or whatever scenario type is selected)".
   - The snapshot is tied to the scenario type and should be created as a `Budget` when the scenario type is Budget.

2. The saved snapshot (`Budget`) becomes an editable, working dataset for planning.
   - Users may edit occurrences (amount, date adjustments, secondary account, description) directly on the `Budget`.
   - The `Budget` stores occurrence-level overrides and optional actuals per occurrence.

3. Source data (`accounts` and `transactions`) remain available and linked but are no longer the working truth once a `Budget` snapshot is active.
   - The `Budget` retains references to source transactions/accounts for traceability.

4. Re-projection behavior
   - Users can create further projections either:
     - Starting from the `Budget` (continue from the edited snapshot), or
     - Regenerating from the original source data (transactions/accounts).
   - After re-projection the user may choose to re-save and override the existing `Budget` (replace it).


6. Actuals inside Budgets
   - The `Budget` may track actual amounts per occurrence; these should always persist and will not be overridden by regenrating from source

7. Storage and scoping
   - Persist `Budget` objects inside the existing scenario object

8. UX and controls (summary)
   - "Save snapshot as Budget" action when viewing a projection.
   - Budget workspace: editable grid for occurrences (overrides, add actuals, notes), controls: Reproject from Budget (forward using budget end balances) / Regenerate from source (projection)

9. Backwards compatibility and migration
   - Keep original transactions/accounts intact. 

Notes:
- This flow treats a user-saved projection snapshot (`Budget`) as the primary planning model. It enables straightforward editing and iterative projections
