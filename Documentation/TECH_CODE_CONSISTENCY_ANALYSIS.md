# TECH Code Consistency Analysis

1.0 Summary

This document records a short analysis of code consistency issues discovered in the repository during an initial scan. The goal is to capture duplication, dead/unreachable code, misplaced logic, and concrete recommendations for remediation.

1.1 Scope

- Files inspected (representative):
  - js/app/services/data-service.js
  - js/app/managers/account-manager.js
  - js/app/managers/budget-manager.js
  - js/app/managers/transaction-manager.js
  - js/domain/calculations/calculation-engine.js
  - js/ui/controllers/forecast-controller.js

2.0 Findings

2.1 Duplication

- Multiple modules reimplement ID allocation logic (compute max id + 1) across managers and services.
- Transaction/account/budget normalization logic is duplicated between `data-service.js` and manager modules.

2.2 Misplaced Domain Logic

- `data-service.js` contains period generation (`getScenarioPeriods`) and recurrence/occurrence calculation glue; these belong in `js/domain/calculations` (or the `calculation-engine` facade).

2.3 Dead / No-op Code

- `deleteAccount` in `data-service.js` computes `deletedCount` then contains an empty `if (deletedCount > 0) { }` block.
- Several placeholder functions return defaults while noting "needs to be implemented" (e.g., `transaction-manager.getByPeriod`).

2.4 Unreachable / Order Issues

- In `forecast-controller.js`, diagnostic logic references section variables via an object before those variables are declared later in the same function; this risks ReferenceErrors (currently masked by try/catch) and is brittle.

2.5 Debug/Logging Noise

- The controller contains many `console.log` debug statements; these should be removed or routed through a toggleable logger.

3.0 Recommendations

3.1 Choose canonical layer for scenario CRUD

- Recommended: Make `js/app/managers/*` the canonical business layer for scenario-scoped CRUD and normalization. Refactor `data-service.js` to delegate to managers for create/update/delete operations and keep `data-service` focused on persistence (read/write/import/export) and app-level orchestration.

3.2 Move domain calculations to `domain/`

- Extract `getScenarioPeriods`, recurrence helpers, and any other period/recurrence math from `data-service.js` into `js/domain/calculations` or expose them via `calculation-engine.js`.

3.3 Consolidate ID allocation and normalization

- Add a shared helper (e.g., `shared/app-data-utils.js` or `storage-service.js`) with `allocateNextId(collection)` and normalization helpers so all modules use the same rules for IDs and amount normalization.

3.4 Remove dead/no-op code and fix ordering

- Remove empty `if` blocks (or implement missing logic) and fix the premature variable usage in `forecast-controller.js` by declaring variables before they’re referenced.

3.5 Replace console.debug with logger

- Introduce a small `logger` utility or use existing `logger.js` to gate debug output by an environment or config flag; remove stray `console.log` calls from production controllers.

3.6 Tests and Linting

- Add unit tests for normalization and ID allocation.
- Add ESLint rules to catch `console.log`, unused code, and `no-use-before-define` to prevent order-of-declaration bugs.

4.0 Concrete next steps (suggested)

1. Create `allocateNextId` helper and update all ID generation sites.
2. Refactor `data-service.createAccount`, `saveAccounts`, transaction/budget save methods to delegate to the corresponding manager or remove duplicate logic.
3. Extract `getScenarioPeriods` and recurrence usage to `js/domain/calculations` and update callers.
4. Remove empty/no-op blocks and fix variable-declaration ordering in `forecast-controller.js`.
5. Replace `console.log` diagnostics with `logger.debug()` gated by a debug flag.
6. Add ESLint config and small unit tests to prevent regressions.

5.0 Files referenced

- `js/app/services/data-service.js`
- `js/app/managers/account-manager.js`
- `js/app/managers/budget-manager.js`
- `js/app/managers/transaction-manager.js`
- `js/domain/calculations/calculation-engine.js`
- `js/ui/controllers/forecast-controller.js`

6.0 Notes

- This analysis is based on an initial code scan. If you want, I can implement one recommended refactor (for example, make `account-manager.js` canonical and update `data-service.createAccount` to delegate) and run tests. Indicate which area to begin with.

---

**Applied Rules**: 1.0, 1.3, 1.4, 1.5, 3.1, 4.1

7.0 Detailed Findings (file-by-file)

This section enumerates concrete, verifiable issues discovered during a full-repo scan. Each item lists the file, the observed problem, and a short remediation suggestion.

- `js/app/services/data-service.js`
  - Problem: Mixes persistence, UI transformations, and domain calculations. Contains `getScenarioPeriods` (period math + clipping), recurrence helper calls (`generateRecurrenceDates`), and UI resolution (`getTransactions` resolves `primaryAccount` objects).
  - Problem: Repeated ID allocation logic (`Math.max(...map(...id))`) appears in multiple places here and in managers.
  - Problem: Dead/no-op: computes `deletedCount` when cascading transaction deletes, but contains an empty `if (deletedCount > 0) { }` block.
  - Problem: Several projection/budget handling functions duplicate normalization rules already present in managers.
  - Remediation: Limit `data-service` to read/write/import/export and transaction-level atomic transactions; delegate business rules and normalization to manager modules or move domain logic into `js/domain/calculations`.

- `js/app/managers/account-manager.js`
  - Problem: Implements account creation/update normalization (goal amount/date handling) which is also present in `data-service.updateAccount` and other places — duplication risk.
  - Remediation: Make `account-manager` canonical for account business logic and change `data-service` to delegate to it; or extract normalization helpers to `shared/app-data-utils.js`.

- `js/app/managers/transaction-manager.js`
  - Problem: `getByPeriod` is marked as TODO/needs implementation but currently returns all transactions; `createPlanned`/`deletePlanned`/`deleteActual`/`deleteActual` variants duplicate behavior found in `data-service` (planned vs actual storage and CRUD).
  - Problem: ID generation and status normalization repeated here and in `data-service`.
  - Remediation: Consolidate planned/actual transaction persistence behind a single manager or service; extract ID and status normalizers.

- `js/app/managers/budget-manager.js`
  - Problem: `saveAll` implements storage normalization (strip UI-only fields, normalize status) similar to patterns in `data-service.saveBudget` and projection code.
  - Remediation: Ensure one canonical normalization routine; keep `budget-manager` as the business authoratative module or centralize to an app-data util function.

- `js/app/managers/scenario-manager.js`
  - Problem: Multiple places compute scenario next-id; consistent ID allocation helper missing.
  - Remediation: Add `allocateNextId` util and replace repeated Math.max patterns.

- `js/domain/calculations/calculation-engine.js` and `js/domain/calculations/*`
  - Observation: Good centralization for recurrence and financial utilities. However, `data-service.js` imports `generateRecurrenceDates` from the calculation layer — while correct, calls from persistence layer indicate domain logic being executed in the wrong layer.
  - Remediation: Keep domain functions here, but call them from domain/manager layers (projection engine, transaction-expander), not directly from `data-service`.

- `js/ui/controllers/forecast-controller.js`
  - Problem: Numerous `console.log` statements used for diagnostics (heavy noise). Many debug logs are inside try/catch blocks and may hide errors.
  - Problem: The code references section variables via a `secs` object before those variables are declared later in the same function scope. This can produce `ReferenceError` if not caught and leads to brittle ordering assumptions.
  - Problem: UI DOM manipulation and debug scaffolding (e.g., append `shortcutsBtn` to `document.body`) are performed even when a debug flag isn't set.
  - Remediation: Remove or gate debug logs via `logger.debug()`. Declare variables before use. Move UI-only helpers into `js/ui/components` or modularize controller responsibilities.

- `js/ui/components/**` (grids, forecast components)
  - Observation: Many UI components call `getScenarioPeriods` from `data-service` — after moving period logic to `domain`, update these imports to use a domain API so UI doesn't indirectly import persistence logic.

- `QC/` and `scripts/` (generate-qc-report.js, migrate-app-data-to-schema43.js, scripts/generate-docs-manifest.mjs)
  - Observation: CLI/test scripts legitimately use `console.log` for output. These are acceptable but should not leak into browser-facing controllers. Keep script logs as-is or convert to `logger` if unified logging desired.

- Other small issues found across multiple files
  - Repeated normalization patterns for amounts (Math.abs), status objects, and `effectiveDate` selection logic — centralize into explicit helpers.
  - Lack of consistent error handling: some modules throw raw Errors, others call `notifyError`. Decide on a consistent error propagation strategy for manager vs service vs UI layers.

8.0 Verification checklist

- Create or update unit tests to assert:
  - `allocateNextId` returns stable, monotonic IDs across collections
  - Normalization of transaction amounts and status is identical across manager and service calls
  - `getScenarioPeriods` produces the same results when implemented in domain code and when previously used from `data-service`

9.0 Suggested immediate fixes (small, high-value)

1. Add `shared/app-data-utils.js::allocateNextId(collection)` and replace repeated `Math.max(...map(...id))` patterns.
2. Remove the empty `if (deletedCount > 0) { }` in `js/app/services/data-service.js` (line shown during scan).
3. Fix variable-ordering and remove debug `console.log` lines in `js/ui/controllers/forecast-controller.js`.

---

If you'd like, I can implement the Immediate fixes now (1–3) and open a pull request. Tell me which to start with.
