# Standard and Virtual Account Behavior Plan

- Status: Implementation authorized; calculation foundation implemented, application integration pending
- Owner and decision maker: Jay
- Updated: 2026-11-27
- Repository: BicycleJeanre/ftrack
- Source branch: dev
- Implementation baseline: 0d4c87b
- Scope: Implementation specification and progress. The initial calculation foundation does not change the active schema or deployed behavior.

## 1.0 Agreed direction

Introduce one new account behavior, **Virtual**, alongside **Standard**.
A Virtual account represents an internal allocation or derived summary.
Running Costs is the first use case: shop transactions and their line items
determine its detailed planned and actual spending, which rolls up to the
allocation from a funding account.

Keep one account list. Accounting type, account groups, and account behavior
remain independent:

| Concept | Purpose |
| --- | --- |
| Accounting type | Existing Asset, Liability, Equity, Income, and Expense classification |
| Account groups | User-defined reporting/filtering groups; membership does not change financial behavior |
| Standard behavior | Existing transaction-based account calculations |
| Virtual behavior | Explicit allocation relationships and derived planning/tracking measures |

Virtual does not mean merely “not a bank account.” Shops, income accounts,
and existing investment accounts can remain Standard. It is the derivation
of allocation measures that makes an account Virtual.

These are **Core decisions** from the planning discussion. Only these two
behaviors are in scope. Section 5 records the confirmed first-release scope;
the detailed calculation and schema contracts remain **Provisional** until
specified and validated.

## 2.0 Planning and tracking remain separate

Workshop explores assumptions, calculates candidate plans, and compares
solutions. Acceptance must be an explicit handoff into ordinary accounts,
transaction rules, and planned line items. Normal budgeting and actual
tracking must then work without recalculating Workshop assumptions.

Changing a saved Workshop variable must not mutate an accepted budget.
A later solver run produces a new proposal for review and scoped application,
not an overwrite of recorded actuals or historical budgets. Retain the source
setup as reference/provenance, not as a live dependency.

The current Business Model compiler produces candidate rules and previews;
Save setup saves assumptions, not those rules. An explicit business-plan
application workflow must be verified or added separately before claiming
that handoff is available. Virtual-account implementation must not silently
turn Save setup into Apply.

Business planning is not another account behavior. Securities, holdings,
price feeds, investment valuation, and new shared-ownership features are out
of scope. Leave a small extension point for a future valuation behavior;
do not expose unsupported behavior choices or build a generic plugin engine.

## 3.0 Running Costs acceptance example

This is a **Topic-specific example** of the general Virtual behavior.
All figures are illustrative, in one currency and one budget period.

- Main is Standard. Running Costs is Virtual.
- Shop A and Shop B remain Standard destination accounts.
- Main → Running Costs is an allocation, not evidence of a real bank transfer.
- Running Costs → Shop A and Running Costs → Shop B are detailed transactions.
- Shop A has actual lines of R200 and R300; Shop B has an actual line of R150.

| Measure | Fixed allocation example |
| --- | --- |
| Captured baseline | R2,000, unchanged by later line edits |
| Current allowance | R2,000 |
| Actual spending | R650, derived from the linked shop occurrences |
| Remaining allowance | R1,350 |
| Completion | Still open until explicitly closed |

Editing a shop line updates that shop occurrence, the Virtual summary, and
its linked funding allocation for the same period. The allocation's derived
actual is read-only: correct the detailed transaction rather than entering
a second competing actual.

If shop plans total R2,300 under a fixed R2,000 allowance, show R300
over-allocated. That is different from actual overspending. With a calculated
allocation instead, its current allowance follows the R2,300 child plan.

## 4.0 Proposed model contract

### 4.1 Account behavior and effective dates

Add a named account behavior setting, provisionally
`behavior: "standard" | "virtual"`. Missing behavior on existing data resolves
to Standard. Unknown values must produce a checker issue, not be silently
treated as an implemented behavior.

Virtual-specific settings are optional structured configuration, not new
accounting types or specially named groups. Keep calculation dispatch in one
shared domain layer instead of scattering behavior checks through UI handlers.

Changing an existing account's behavior requires a conversion preview with an
effective budget period. The final schema must preserve interpretation of
earlier Standard transactions and captured history; one timeless flag must
not retrospectively reinterpret every occurrence. Define effective-dated
configuration and any captured behavior metadata before the schema phase.

### 4.2 Allocation relationships

Keep the existing primary/secondary account pair on each transaction.
Add explicit allocation-link metadata, not a third money-movement account.
Each relationship identifies the Virtual account, the funding allocation,
eligible detail transactions, and its effective periods.

Resolve links through stable rule/series lineage and period occurrence
identity. A this-and-future revision must not strand its allocations or
reattach past actuals to the replacement rule.

Do not infer membership from account name, group membership, or a shared
shop destination. A direct Main → Shop A payment stays outside Running Costs
unless explicitly assigned. Multiple occurrences between the same pair must
not be collapsed merely because their accounts match.

Reject cycles and ambiguous funding relationships. Count each source
occurrence once within an allocation; count each line once within its
own occurrence. Roll up occurrence totals, not both totals and their lines.
Nested Virtual relationships must preserve leaf provenance so presenting
both parent and child summaries does not multiply the result.

### 4.3 Shared derived measures

Extend the canonical resolution pipeline with one allocation calculation,
consumed by all application surfaces. Return separately named measures for:

- captured baseline and current allowance;
- detailed planned spending and signed actual spending;
- over-allocation, overspending, and remaining allowance;
- remaining forecast commitments and forecast amount;
- fulfillment/closure state and contributing source occurrence keys;
- posting role and eligibility for financial/reporting totals.

Do not represent a Virtual allowance as an additional cash balance or asset.
Source transactions remain authoritative; derived parent actuals must not
be independently editable copies. Cached results must be invalidated after
source edits, line removal, skip/restore, reconciliation, and scoped rule edits.

### 4.4 Partial actuals and forecasts

The current resolver and totals distinguish planned, actual, and skipped.
Simply marking the funding allocation Actual at the first shop purchase
would remove its remaining plan from the forecast. Add partial fulfillment
to the resolved allocation contract before enabling rollups.

An open allocation must expose actual spending and remaining commitments
together. It may show a partial display state without inventing a new stored
occurrence status unless the schema design explicitly requires one.

For the fixed-allowance acceptance example, R650 spent plus R1,350 remaining
must preserve the R2,000 forecast while the period is open. Define the
forecast rule for unplanned/over-budget purchases and child commitments
explicitly; it must never forecast less than spending already recorded.
Closing the period releases unused commitments without erasing its actuals.

### 4.5 Financial posting and reporting

Classify allocation and detail legs explicitly. The funding account receives
the appropriate derived cash impact once; detail legs provide allocation and
payee reporting, not an additional debit to the funding account.

A scoped Main-account view, a Running Costs view, and an all-accounts view
have different perspectives on the same sources. Report summaries and their
underlying detail are not additive expenses. Workshop break-even must count
operating detail once and exclude an additional parent allocation charge.

Exclude Virtual allowances from cash, net worth, and fund NAV. Do not accrue
bank interest on them. Existing Standard-account interest and fees remain
unchanged. Virtual net actuals can be signed after refunds, but canonical
stored transaction amounts remain unsigned with direction encoded separately.

### 4.6 Budget periods and rollover

Use the selected reporting/budget period identity. Statement dates remain an
independent source window, including salary-driven or irregular cutoffs.
Do not assume “November” means calendar November or count a boundary twice.

Rollover is a policy of Virtual behavior, not another behavior or an automatic
cash transfer. Specify separately whether unused allowance and overspending
carry forward. Preserve dated carry provenance. Reopening a prior period or
editing a past source must show the effect on later carry amounts before
changing closed history.

Refunds reduce linked spending. Zero-activity allocations are not completed
spending. Skipped occurrences are excluded from current plan/commitments
without erasing captured baselines. Existing history protections still apply.

## 5.0 Confirmed first-release scope

Jay confirmed the following during the planning review on 2026-11-27.

| Decision | Confirmed first release |
| --- | --- |
| Allowance | Fixed limit or calculated from detailed plan, explicitly selected |
| Funding | One funding parent per Virtual account and period; the parent may be Standard or Virtual |
| Multiple funders | Out of scope initially; preserve an extension point for explicit apportionment later |
| Rollover | Off by default; enable with an explicit carry policy |
| Closure | Deliberate close/reopen with corrections supported; spending never locks a period automatically |
| Past conversion | Future-period cutover; preserve earlier interpretation and snapshots |
| Nested Virtual accounts | Required in the first release; roll planned and actual measures through multiple levels without double-counting |
| Currency | Single currency initially; cross-currency allocation out of scope |

Nesting does not introduce multiple funders: each Virtual account has one
funding parent, while a parent can fund multiple children. For example,
Main → Running Costs → Groceries → Shop is valid. Reject cycles. A leaf
purchase contributes once to each ancestor's scoped summary, never multiple
times to an aggregate financial total. Fixed and calculated budgets must work
at every Virtual level; preserve leaf provenance throughout the chain.

Before coding, settle how remaining commitments interact with fixed limits,
future child purchases, refunds exceeding current-period spending, skipped
parent allocations with live child actuals, and closure corrections. A read-only
example matrix should cover these cases before changing resolver semantics.

## 6.0 Code integration map

| Area | Existing integration points |
| --- | --- |
| Schema and checker | `js/shared/app-data-utils.js`, `js/shared/migration-utils.js`, `js/app/services/validation-service.js`, `data-upgrade-service.js` |
| Commands and history | `account-manager.js`, `transaction-manager.js`, `occurrence-manager.js`, `period-variant-manager.js` under `js/app/managers/` |
| Shared resolution | `js/domain/queries/resolve-scenario-occurrences.js` plus a focused allocation/behavior domain module |
| Forecasts and funds | `js/domain/calculations/projection-engine.js`, `js/domain/utils/fund-utils.js` |
| Period and statement mapping | `js/shared/period-window-utils.js`, `statement-workflow-utils.js`, `js/app/services/statement-service.js` |
| Views and totals | `js/ui/queries/financial-entry-display-rows.js`, `js/ui/transforms/data-aggregators.js`, account/Plan & Actuals grids and summary cards |
| Workshop and agents | `js/domain/calculations/business-model.js`, existing goal solver, `js/app/services/agent-engine.js`, `js/shared/agent-command-catalog.mjs` |
| Persistence and recovery | Existing storage transactions/Web Locks, projection freshness, JSON import/export, Firebase snapshot codec and revisions |

Current code uses schema version 46. Allocate the next available version at
implementation time. No active schema or architecture contract is changed
by this proposal.

## 7.0 Delivery phases and acceptance gates

1. **Specify semantics.** Use the confirmed scope in section 5. Complete
   worked examples, posting versus display roles, nested fixed/calculated
   limits, and partial commitment formulas before changing calculations.
2. **Foundation.** Add behavior/configuration, effective dates, link validation,
   and an extension point. Existing accounts migrate to Standard. Round-trip
   JSON, cloud snapshots, duplication, and period variants without data loss.
3. **Calculation and commands.** Implement one deterministic rollup with
   provenance, partial fulfillment, closure and the chosen rollover policy.
   Do not make it a UI-only total.
4. **Application integration.** Connect account entry, cards, detail grids,
   summary totals, projections, statements, fund reports and MCP commands.
   Preserve shared account pickers, signed movement display and mobile layout.
5. **Conversion and checker.** Preview account conversion and repair invalid
   links through the existing in-app checker. Produce a change report and
   recovery path. Never guess from legacy account names or overwrite originals.
6. **Regression and release.** Test the same examples through UI, projections,
   and MCP. Deploy only after review and explicit release authorization.

Required acceptance cases include the R2,000/R650/R1,350 example, editing
and removing shop lines, independent payments to the same shop, refunds,
skips/restores, over-budget purchases, period cutoffs, closed-period changes,
series revisions, multi-level rollups, mixed fixed/calculated ancestors,
cycles, ambiguous funders, duplicate statement imports,
and recovery after failed validation.

Assert Standard-account numerical parity with the existing fixture suite.
Assert no doubled expenses, cash, NAV, or line-item totals at any aggregation
level. Existing Workshop cases must retain their results without adding a
business-specific behavior. Changing saved solver inputs must not mutate an
accepted plan.

## 8.0 Review and restart

The first-release scope is confirmed, including nesting. Jay authorized
implementation after confirming these choices. Do not reopen confirmed scope
choices merely because their detailed contracts still need engineering.

This planning work reuses the existing dev checkout; it creates no new
worktree. Keep the user's unrelated spreadsheet out of the planning commit.
Preserve this specification on dev for review; do not promote it to main or
regenerate the deployed documentation manifest as part of planning.

## 9.0 Implementation checkpoint — calculation foundation

Implemented on the existing dev checkout after implementation authorization:

- `js/domain/calculations/virtual-budget.js`: pure allocation validation and
  deterministic fixed/calculated budget summaries, nested single-parent links,
  captured baselines, explicit closure, refunds, and leaf provenance.
- `js/domain/queries/resolve-scenario-virtual-budgets.js`: read-only adapter to
  the existing canonical occurrence resolver. Configurations are explicit input,
  not yet persisted scenario fields. A partial display window still resolves
  complete intersecting budget periods.
- `tests/unit/virtual-budget.test.mjs`: 18 synthetic-data tests including the
  acceptance example and real canonical occurrence resolution. No live financial
  data was used or committed.

The calculation contract for an open fixed budget is actual spending plus
the larger of its remaining allowance, explicit outstanding child commitments,
and zero. This preserves known future spending even when it exceeds the limit.
Calculated budgets use child plans for their allowance and outstanding child
commitments for their remaining forecast. Closure releases commitments while
preserving actuals. No allowance carries automatically to another period.
Nested funding windows must align; membership follows scheduled budget dates,
not statement dates or delayed actual posting dates.

Summary rows are explicitly non-posting. They must not be appended to existing
transaction arrays and summed as if they were extra transfers. This checkpoint
does not yet change financial posting, NAV, interest, cards, or stored accounts.
It is not a deployable or user-testable Virtual-account feature by itself.

Next implementation checkpoint: effective-dated schema and migrations, storage
round trips, commands, and checker integration. Then wire funding effects and
remaining commitments through projections/reporting, add account and budget
controls, and expose equivalent MCP commands. Preserve existing Standard
results throughout. Deployment/promotion remains a separate authorization.

Workspace retention: reuse the primary FTrack checkout for the remaining work;
no linked worktree or temporary branch was created. Keep the unrelated user
spreadsheet excluded. No further conceptual scope approval is required to
continue these authorized implementation phases.
