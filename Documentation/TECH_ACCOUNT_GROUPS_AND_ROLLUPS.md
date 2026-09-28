# Account Groups, Rollups, and Split Transactions (Design)

> Combined plan available: `Documentation/TECH_ACCOUNT_GROUPS_ROLLUPS_CAPITAL_INTEREST.md`
>
> This document remains valid for groups/rollups + compound transactions, but periodic-change-as-ledger-posting
> and capital/interest aggregation are captured in the combined plan.

## 1.0 Problem statement

FTrack currently models:

- **Accounts** as a *flat* list (`scenario.accounts`).
- **Transactions** as a *two-legged* movement between a `primaryAccountId` and optional `secondaryAccountId` (`scenario.transactions`).
- **Dual-perspective UI** by transforming each stored transaction into (a) a “primary” row and (b) a “flipped” row so the same transaction can be viewed from either account’s perspective.

This is a good fit for simple cashflow modeling, but it becomes awkward when a *single real-world financial object* needs to be modeled as a **composed** thing with **components** and **rollups**, for example:

- a loan payment that is made up of principal + interest + fees
- a “project” budget composed of multiple spending categories
- a “goal” funded by multiple sub-streams

The user needs two complementary views:

- **Bottom-up**: plan the component amounts (children) and have the parent show the roll-up total.
- **Top-down**: enter a total at the parent level and have the system distribute it to components (children) using a rule (fixed amounts, percentages, waterfall, etc).


## 2.0 Current implementation summary (why it matters)

### 2.1 Storage model

- Accounts are CRUD’d via `js/app/managers/account-manager.js`.
- Transactions are normalized to a canonical, **unsigned** `amount` and stored via `js/app/managers/transaction-manager.js`.
- UI-level transactions are decorated with `primaryAccount` / `secondaryAccount` objects in `js/app/services/data-service.js`.

### 2.2 UI dual-perspective rows

`js/ui/transforms/transaction-row-transformer.js` turns one canonical stored transaction into two display rows:

- **Primary row**: shown “as-is” from the primary account’s perspective.
- **Flipped row**: shown from the secondary account’s perspective (type inverted; accounts swapped).

This is the key constraint: **a “split” payment is not representable as a single canonical transaction today**, because a split implies *more than two legs* (or at least multiple category allocations).


## 3.0 Standard modeling patterns (industry concepts)

There are a few “standard” solutions used by finance tools and accounting systems; they differ mainly by whether composition is represented as **accounts**, **transaction splits**, or **dimensions**.

### 3.1 Chart of Accounts hierarchy (post to leaves, roll up to parents)

- Accounts form a tree.
- Transactions post to **leaf** (postable) accounts.
- Parent accounts are **computed** by aggregating descendants.

Pros: rollups are straightforward and intuitive.

Cons: doesn’t solve split payments unless you also support split transactions (or create multiple transactions per payment).

### 3.2 Control account + subsidiary ledger (a special case of hierarchy)

- The parent is the “control” account shown on summary statements.
- Children form the detailed ledger (components).

This is a common pattern for “one thing with many sub-balances”.

### 3.3 Split transactions / multi-line journal entries

- A single user intent (e.g. “pay the lender”) expands into multiple legs:
  - cash/bank account decreases
  - principal liability decreases
  - interest expense increases
  - fee expense increases

Pros: matches real bookkeeping best, and naturally supports “one payment = many components”.

Cons: requires data model + UI support for multi-leg transactions (or a grouping abstraction).

### 3.4 Dimensions (tags/categories/cost centers) independent from accounts

- Keep accounts flat.
- Add a second axis: categories/components.
- Transactions allocate amounts across categories via splits.

Pros: composition doesn’t pollute “where money lives”.

Cons: you still need split support to allocate one payment to multiple categories.


## 4.0 Recommended solution for FTrack (fits current architecture)

Given FTrack’s current constraints (flat accounts + 2-legged transactions + dual-perspective UI), the most pragmatic approach is:

1. **Introduce Account Groups (tree) for rollups and navigation** (composition as “folders”, not ledger postings).
2. **Introduce Compound Transactions as a grouping layer** to represent split payments *without* immediately moving to full multi-leg journal entries.
3. **Introduce Allocation Rules** (optional, later) to support the top-down flow (enter total → generate/update components).

This keeps the existing transaction engine mostly intact while enabling rollups and “split-like” behavior.

### 4.1 Account Groups (rollups, not postable)

**Concept**

- A group is a tree node that can contain accounts and/or other groups.
- A group is *not* an account in the ledger sense: you don’t select it as `primaryAccountId`.
- Group totals are computed by summing member accounts (and their descendants).

**Why it’s better than “accounts with subaccounts” in v1**

If you model parents as real accounts, you immediately need to define semantics like:

- can you post to parent?
- does parent have its own starting balance?
- how do you avoid double counting if both parent and child have postings?

Using **groups** avoids this: groups are computed and do not participate in postings.

### 4.2 Compound Transactions (split without multi-leg schema)

**Concept**

- A “compound transaction” represents one user intent (e.g. “Loan payment on 2026-04-01”).
- Internally it is stored as **multiple canonical 2-legged transactions**, each one representing one component allocation.
- Each component transaction is linked by a shared identifier, e.g. `transactionGroupId`.

**Example**

“Pay 10,000 into Home Loan” becomes three stored transactions with the same `transactionGroupId`:

- Bank → Home Loan Principal (principal allocation)
- Bank → Home Loan Interest (interest allocation)
- Bank → Home Loan Fees (admin fee allocation)

This is compatible with:

- the existing “two accounts per transaction” schema
- the existing dual-perspective row transformer (each component is still a normal transaction)

You can later *display* this as a single expandable row, but you don’t need that immediately to get the modeling correct.

### 4.3 Allocation Rules (top-down flow)

**Concept**

- Allocation rules are attached to a group (or to a “payment template”).
- When the user enters a parent-level total, the system generates/updates the component transactions.

Common rule types:

- **Fixed**: always allocate X to fees, Y to admin, rest to principal.
- **Percent**: allocate by percentages.
- **Waterfall**: allocate to buckets in order until the total is exhausted (e.g. fees → interest → principal).

For loan-like cases, the waterfall can be driven by **derived interest accrual** from the projected balance + rate, while fees can be fixed.


## 5.0 Rollup semantics: bottom-up vs top-down

### 5.1 Bottom-up (components → rollup)

This is the “pure rollup” case:

- The user plans amounts on component accounts (or component transactions).
- Group totals are computed by summing member accounts’ totals for the selected window/period.

This is deterministic and requires no special generation logic.

### 5.2 Top-down (total → distribute)

This is not a rollup problem; it’s a **generation/allocation** problem:

- The user enters a group-level payment total (or chooses “create payment” on a group).
- The system applies an allocation rule to produce component transactions that sum to the total.

The correct mental model is:

> Top-down is a *UI+rule convenience* that produces bottom-up data.

The ledger/projection engine should still only “see” the component-level postings.


## 6.0 Mapping onto FTrack code (where changes land)

### 6.1 Data schema additions (storage)

Recommended additions (minimal surface area, backwards-compatible):

- `scenario.accountGroups?: AccountGroup[]`
- `transaction.transactionGroupId?: number | string`
- `transaction.transactionGroupRole?: string` (optional; e.g. `"principal" | "interest" | "fee" | "adhoc"`)

This avoids turning “group nodes” into real accounts, which would require widespread filtering changes.

### 6.2 Calculations and rollups

Rollups should be done in a shared utility layer (aligned with the planned Aggregation Utility work):

- Build a group membership resolver: `getGroupAccountIds(groupId) -> Set<accountId>`
- When filtering totals by a group, expand to member account IDs.

### 6.3 Projections

Keep the projection engine focused on **postable accounts**:

- Generate projections per account exactly as today (`js/domain/calculations/projection-engine.js`).
- Derive group rollups at the UI/aggregation layer by summing member account projection rows per period.

This prevents a “parent posting” ambiguity and avoids double counting.

### 6.4 Transactions UI

Short term:

- Keep showing component transactions as normal rows.
- Provide a lightweight “group id” display/filter so split sets can be identified.

Later (optional):

- Add an expandable “compound row” visualization in `js/ui/components/grids/transactions-grid.js` that groups rows by `transactionGroupId`.


## 7.0 A loan example (generic, but concrete)

Create accounts:

- `Home Loan: Principal` (Liability)
- `Home Loan: Interest` (Expense)
- `Home Loan: Fees` (Expense)

Create an account group:

- `Home Loan` group containing the three accounts above.

Bottom-up planning:

- Recurring planned payment splits:
  - principal component (variable or “rest”)
  - interest component (derived or planned)
  - fee component (fixed)

Top-down convenience:

- “Add payment” action on the `Home Loan` group:
  - input: total payment amount + effective date (+ recurrence)
  - rule: waterfall (fees → interest → principal)
  - output: 3 canonical transactions sharing a `transactionGroupId`

Rollups:

- “Home Loan total payment” per period = sum of expenses across the group’s member accounts for that period.
- “Home Loan payoff” remains driven by the principal liability account’s projected balance crossing toward zero.


## 8.0 Implementation checklist (phased)

Phase 1 (rollups only, bottom-up):

1. Add `AccountGroup` schema + persistence and basic CRUD.
2. Add group-aware totals filtering in the shared aggregation utilities.
3. Show group rollups in summary/totals panels (no transaction UI change required).

Phase 2 (split payments via compound transaction metadata):

1. Add `transactionGroupId` to transaction normalization and storage.
2. Add UI affordance to create a “compound payment” that creates N canonical transactions.
3. Add transaction list grouping (optional UI improvement).

Phase 3 (top-down allocations):

1. Introduce allocation rule definitions on groups/templates.
2. Add a generator that updates component transactions when the total changes.
3. Add QA checks for “sum of components == parent total” invariants.
