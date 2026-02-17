# Todo Execution Plan

## 1.0 Purpose

## 1.1 Scope

- Covers only items currently marked `[todo]` in `project_notes.md`.
- This is a planning document only (no implementation).

## 2.0 Todo Items

### 2.1 Move home to index .html [Done] 

- Combine `index.html` and the Home page so there is only one page (`index.html`) containing the full current homepage content.
- Remove the separate Home page route/page and update navigation links to point to `index.html`.
- Verify:
  - direct load of `index.html`,
  - refresh on the landing page,
  - navigation links that previously pointed at Home.

#### 2.1.1 Move focus to opened accordion. [Done]

- Confirm which accordion should receive focus (the newly opened one vs the section container).
- Ensure focus is applied after the accordion is expanded and DOM is stable.
- Validate keyboard navigation still works (tab order, screen scroll, and focus visibility).

### 2.2 duplicate accounts and transactions.[Done]

- Add a Duplicate button for Accounts and Transactions, matching the existing Scenario duplicate behavior.
- Duplicate behavior:
  - all fields remain the same,
  - only the ID is incremented/assigned as a new unique ID.
- Ensure the duplicated record appears immediately in the relevant grid with the same scenario association.

### 2.3 Dates to start on scenario start date by default. [Done]

- Implement scenario date boundary alignment on the scenario grid itself (only).
- Rule: scenario boundaries align with the selected period type.
- Default values when creating a new scenario:
  - start date = start of the current year
  - end date = end of the current year
- Replace date inputs with period-type-aligned range pickers on the scenario grid:
  - Year: user selects a year range
  - Quarter: user selects a quarter range
  - Month: user selects a month range
  - Week: user selects a week range
  - Day: user selects a day range
- Default selection is the current year (start of current year → end of current year).
- Boundary rules derive start/end from the selected range (Week start = Monday).
- Ensure behavior is correct when the period type is changed on the scenario grid (picker changes + boundaries update accordingly).

### 2.5 Hey, We have nominal month, yearly, but we still need nominal monthly, weekly, quarterly, etc. [Done]

- Scope: periodic changes only (not recurrence).
- Location: periodic change “change type” when percentage rate is selected.
- Rename:
  - “nominal annual no compounding” → “simple interest”.
- Add/ensure the following options exist:
  - nominal annual compounded monthly
  - daily
  - quarterly
  - annually
  - continuous
- UI/UX improvement required:
  - keep the current list of options as-is, including the existing nominal annual compounded option(s) and their compounding periods
  - add a new option for custom nominal + compounding selection (e.g., “Custom nominal/compounding”)
  - within that new option, allow the user to select:
    - nominal period
    - compounding period
    with clear descriptions so users understand what each means
- Keep Custom as-is.

### 2.6 Fund totals are not calculated correctly. It seems like it is simply aggregating all transactions per account. For some reason, it is overwriting or aggregating and summarizing across the actual or the store transactions and the generated transactions for the view. [Done]

- Observed behavior to investigate:
  - balances in the summary section show zero for all accounts,
  - fund totals show NAV = 0, total shares = 0,
  - money in shows values, money out shows 0, net matches money in.
- Primary suspicion to confirm:
  - aggregation is mixing stored and generated transactions such that positives and negatives cancel to zero.
- Investigation steps:
  - Identify exactly which transaction lists are being aggregated for:
    - summary balances,
    - fund totals,
    - money in/out.
  - Confirm whether each logical transaction is counted once (and with the correct sign) vs being double-counted across sources.
  - Decide and enforce a single source for these summary computations.

### 2.7 Generate Plan - Goal-Based [Done]

- Fix contribution frequency conversion issues in Goal-Based Generate Plan:
  - when switching contribution frequency (weekly/quarterly/etc.), contribution amounts currently appear backwards/incorrect.
- Update Generate Plan inputs to require two accounts:
  - income account (money source)
  - goal account (the selected account)
- Ensure the generated plan is one-step and creates transactions:
  - the selected income account is automatically set as the secondary account.

### 2.8 Projected balance total on projections should show lost value and first value. For projections, add group by for account type. For account, group by secondary account and not account. Rename to secondary account as well. To totals, I want a starting balance and an ending balance. The third one should be on the net change column. I need a subtotal for net changes. Also, ensure we obviously have subtotals on our group by section similar to all other grids. [Done]

- Projections accordion totals updates:
  - current totals for income, expenses, and net remain unchanged (they are correct).
  - add totals for:
    - first projected balance (first day) and include the date
    - last projected balance (final day) and include the date
- Subtotal behavior change:
  - projected balance column subtotal should show projected balance (final day) (not a sum total).

### 2.9 Move the "Save as Budget" button from Projections to the Budget Grid as "Regenerate Budget from Projections." [Done]

- Move the button only (no behavior changes):
  - take the existing "Save as Budget" logic and move the entry point to the Budget grid
  - label becomes "Regenerate Budget from Projections."
- Do not add overwrite/new snapshot/prompt behavior (use existing behavior as-is).

#### 2.9.1 On the budget, let's add something to mark as completed that should automatically fill out the actual amount and date (default to the current date). Then make sure that actual amount and actual dates also update properly. You give this to. Lock the row with ability to mark it as incomplete.

- Add a new “completed” column control (checkbox or icon) on the budget grid.
- On mark completed:
  - default actual amount to the planned amount only if the user has not manually set actual amount
  - default actual date to the current date only if the user has not manually set actual date
  - visually freeze the transaction row
  - prevent editing while frozen
- Only allowed edit while completed/frozen:
  - mark as incomplete
- On mark incomplete:
  - unfreeze row and re-enable edits

### 2.10 Advanced Goal Solver - External Optimization Library

- Move this item to the end of the list for later work.

### 2.11 We need to better support mortgage payments that have a fixed end date and variable transaction rate based on interest rates.

- Note: revisit the design later. This item is intentionally moved to the end.
- Support both fixed and variable payments:
  - fixed interest, variable interest
  - fixed end date, variable end date

#### 2.11.1 Proposed Feature Shape

- Add a first-class Mortgage entry type (not just generic transactions + periodic change).
- Store a mortgage configuration as the source of truth and generate an amortization schedule from it.
- Allow the schedule to be previewed, applied into transactions, re-generated, and exported.

#### 2.11.2 User Experience - Creation Flow

- Entry point: in the Transactions area, add a Mortgage action (e.g., "Add Mortgage") that opens a "Mortgage Setup" modal.
- Mortgage Setup inputs (suggested):
  - Accounts:
    - payment account (cash/bank)
    - loan account (liability)
    - interest account (expense)
    - optional escrow account (expense) if needed later
  - Dates:
    - start date
    - first payment date
  - Payment frequency: monthly as default (support weekly/biweekly/monthly if desired)
  - Current balance/principal amount
  - Interest rate model:
    - fixed APR, or
    - variable APR schedule (effective date → APR)
  - Term/end condition (choose one):
    - fixed end date (compute payment amount), or
    - fixed payment amount (compute end date), or
    - fixed term length in months/years (compute end date)
  - Optional fees:
    - one-time fees at start (origination)
    - recurring fees (insurance, HOA) as separate standard recurring transactions (out of scope for mortgage math itself unless you want them embedded)
- UX preview:
  - show a schedule preview grid (first N rows plus summary), before applying.
  - show key summary: total interest, payoff date, payment amount, number of payments.

#### 2.11.3 User Experience - Ongoing Edits

- Mortgage list panel (or within scenario): show each mortgage with:
  - current config summary
  - "Edit"
  - "Recalculate Schedule"
  - "Apply to Transactions" (regenerates the planned payment transactions)
  - "Export Schedule"
- When config changes (rate schedule, end condition, etc.): schedule is regenerated and user can re-apply.

#### 2.11.4 Data Model Proposal

- Add `scenario.mortgages[]` (or equivalent) containing:
  - unique `id`
  - account references: paymentAccountId, loanAccountId, interestAccountId
  - startDate, firstPaymentDate
  - frequency
  - principal/currentBalance
  - end condition (fixedPaymentAmount | fixedEndDate | fixedTerm)
  - interest model:
    - fixedApr OR aprSchedule: [{ effectiveDate, apr }]
  - generation flags (e.g., includePrincipalInterestSplit)
- Derived/generated items:
  - schedule rows generated on demand from config
  - transactions generated from schedule rows should reference `mortgageId` so they can be re-generated safely

#### 2.11.5 Schedule Generation Rules

- For each payment period:
  - compute interest for the period using APR effective for that payment
  - compute principal as payment - interest
  - handle last payment so balance reaches 0 (final payment may differ)
- Variable interest:
  - APR changes apply from the first payment on/after effectiveDate
  - define behavior when APR changes:
    - if payment is fixed, payoff date shifts
    - if end date is fixed, payment amount recalculates at the change boundary
- Variable end date:
  - if payment is fixed, end date is derived
  - if end date is fixed, payment is derived

#### 2.11.6 How It Appears in Transactions

- On "Apply to Transactions": generate transactions per payment period.
- Posting model (suggested):
  - Payment leg: paymentAccount → loanAccount (reduces cash, reduces liability) using total payment amount
  - Interest leg: paymentAccount → interestAccount (reduces cash, increases expense) using interest amount
  - If the system only supports one secondary account per transaction, represent as two transactions per payment period.

#### 2.11.7 Amortization Schedule Display and Export

- Schedule grid columns (suggested):
  - payment date, starting balance, payment, interest, principal, ending balance, APR
- Export:
  - export the full schedule as CSV (or JSON) from the schedule view

#### 2.11.8 Open Decisions to Confirm

- Day count convention for interest (simple 30/360 vs actual/365).
- Rounding rules (per row vs at the end).
- Which frequencies are required beyond monthly.
