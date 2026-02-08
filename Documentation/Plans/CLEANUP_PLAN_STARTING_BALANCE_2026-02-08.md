# Cleanup Plan - Starting Balance Normalization - 2026-02-08

1.0 Relationship To Codebase Cleanup
1.1 This is a focused sub-plan.
1.2 The broader cleanup plan is: `Documentation/CLEANUP_PLAN_CODEBASE_2026-02-08.md`.

2.0 Goal
2.1 Normalize account balance naming to `startingBalance` across the entire repository.
2.2 Remove `balance` from configuration, stored data, and runtime code.
2.3 Keep user notifications. Remove logging for now.

3.0 Target State
3.1 Accounts use `startingBalance` only.
3.2 No code reads or writes `account.balance`.
3.3 Scenario type configuration uses `startingBalance` consistently.

4.0 Phase 1 - Config And Seed Data
4.1 Update scenario type definitions in `assets/lookup-data.json`.
4.1.1 Replace `balance` with `startingBalance` in all `accountColumns` lists.
4.2 Update any seeded account objects that still write `balance`.
4.2.1 Replace `balance:` with `startingBalance:` in `js/data-manager.js`.

5.0 Phase 2 - Runtime Code Changes
5.1 Remove fallback reads of `account.balance`.
5.1.1 Replace `account.startingBalance ?? account.balance ?? 0` with `account.startingBalance ?? 0` in `js/forecast.js`.
5.2 Ensure account creation and updates only use `startingBalance`.
5.2.1 Audit defaults in `js/forecast.js` and `js/managers/account-manager.js`.

6.0 Phase 3 - Stored Data Cleanup
6.1 Convert stored and example data to `startingBalance`.
6.1.1 Replace `balance` with `startingBalance` in `userData/assets/app-data.json` and any shipped sample JSON files.
6.2 Migration behavior
6.2.1 Keep a one-time migration step that renames `balance` to `startingBalance` and deletes `balance` if encountered.
6.2.2 After migration exists, remove any remaining runtime compatibility logic.

7.0 Phase 4 - Remove Logging (Keep Notifications)
7.1 Remove `console.log` usage.
7.1.1 Example: `js/transaction-row-transformer.js`.
7.2 Remove `console.error` usage and any logger wiring.
7.2.1 Hotspots: `js/forecast.js`, `js/grid-factory.js`.
7.3 Preserve user notifications.
7.3.1 Keep `alert(...)` calls for now.

8.0 Secondary Cleaner Items
8.1 Reduce responsibility sprawl in `js/forecast.js`.
8.1.1 Extract Generate Plan into a dedicated module without changing UX.
8.1.2 Extract grid loaders for accounts, transactions, budget, projections.
8.2 Make scenario type config either authoritative for columns, or simplify it.
8.3 Centralize notifications behind a single helper to simplify future UI changes.

9.0 Acceptance Criteria
9.1 No `balance` key remains in account models, config, or shipped data.
9.2 Accounts grid reads and writes `startingBalance` correctly.
9.3 No logging remains in runtime code paths, and user notifications still fire.
