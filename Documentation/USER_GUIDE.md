# FTrack Usage Guide

**Version**: 3.0

**Last Updated**: August 2, 2026

**Audience**: New users; no accounting background required

---

## 1.0 Welcome to FTrack

FTrack is a scenario-based financial planning application. It helps you define
what normally happens, adjust individual periods as life changes, record what
actually happened, and see the effect on future account balances.

The Budget workflow uses one continuous process:

```text
Transaction rules
      ↓
Dated period occurrences
      ↓
Baseline + current plan + actuals
      ↓
Resolved projections
```

There is no separate budget to generate from a transaction list. The same
rules and occurrences power planning, tracking, and forecasting.

### 1.1 What FTrack Helps You Do

- Model checking, savings, credit cards, loans, income, and expenses.
- Build repeating income and cost rules once.
- Add one-time or unexpected movements in the period where they belong.
- Compare the original baseline with the latest plan and actual results.
- Learn from one period and apply changes to future periods.
- Test raises, purchases, payoff strategies, or other changes in independent
  scenarios.
- Project future balances from the latest resolved plan.

### 1.2 Start Simple

Begin with:

1. the accounts whose balances matter;
2. major income;
3. fixed recurring costs;
4. a realistic allowance for variable costs; and
5. known one-time events.

You can add detail as the review habit becomes useful. A small plan that you
maintain is better than a perfect plan you abandon.

---

## 2.0 Core Concepts

### 2.1 Accounts

Accounts represent places where value is held, owed, received, or spent.

Common examples:

- **Asset**: checking, savings, cash, or investments.
- **Liability**: credit card, personal loan, or mortgage.
- **Income**: salary, freelance income, or interest income.
- **Expense**: rent, groceries, utilities, or entertainment.

An account has an opening balance. Projections apply resolved money movements
to that balance across the scenario window.

### 2.2 Money Movements

Every transaction rule or occurrence has a primary-account perspective:

- **Money In** flows from the secondary/source account into the
  primary/receiving account.
- **Money Out** flows from the primary/source account to the
  secondary/receiving account.

Examples:

| Situation | Primary account | Secondary account | Movement |
|---|---|---|---|
| Receive salary | Checking | Salary Income | Money In |
| Pay rent | Checking | Rent Expense | Money Out |
| Transfer to savings | Checking | Savings | Money Out |
| Receive interest | Savings | Interest Income | Money In |

In the Plan & Actuals Period summary, the description is shown on a separate
line under the movement. This makes items with similar account flows easier to
identify.

### 2.3 Transaction Rules

A transaction rule describes what should normally happen.

A rule includes:

- Money In or Money Out;
- primary and optional secondary account;
- planned amount;
- description and tags;
- effective date;
- one-time or recurring schedule; and
- an optional periodic amount change.

Examples include a paycheck every second Friday, rent on the first day of the
month, weekly groceries, or an annual insurance bill.

In the Budget workflow, manage rules in **Plan & Actuals → Recurring**. Other
workflows expose the same rules in the **Transactions** card.

### 2.4 Period Occurrences

An occurrence is one dated instance of a rule. FTrack resolves occurrences
automatically for the selected period and projection window.

Most untouched future occurrences remain derived from their rule. A dated
occurrence is stored when it must preserve something specific:

- a one-occurrence amount or date adjustment;
- an actual;
- a skip;
- a manual planned or actual item; or
- a frozen baseline.

This avoids copying recurring rules into a second budget dataset while still
preserving exceptions and history.

### 2.5 Baseline, Current Plan, and Actual

- **Baseline** is the plan frozen for comparison.
- **Current plan** is the latest plan after adjustments.
- **Actual** is what happened, including its realized amount and date.

At first, an unfrozen baseline follows the current plan. Click
**Freeze baseline** when the selected period is ready for tracking. If you
record an actual first, FTrack freezes that period automatically before saving
the actual.

Later rule or occurrence edits change Current plan, not the frozen Baseline.
This lets you answer both:

- “How did reality compare with the plan we started with?”
- “How did reality compare with our latest adjusted plan?”

### 2.6 Projections

Projections calculate future account balances from the resolved occurrence
timeline:

- actuals use their actual amount and date;
- unresolved items use their current planned amount and date;
- future items are expanded from active rules;
- manual items are included; and
- skipped items are excluded.

A matching actual replaces its planned occurrence. It is never added as a
duplicate movement.

### 2.7 Scenarios

A scenario is an independent financial model containing its own accounts,
rules, occurrences, baselines, and projection results.

Use one scenario as your expected reality. Duplicate it before testing a major
what-if change. The duplicate receives its own ID and version while retaining
lineage back to the source.

### 2.8 Workflows

Workflows are Forecast UI presets. Selecting one changes the visible cards; it
does not change or tag the selected scenario.

- **Budget**: Accounts, Plan & Actuals, and Projections.
- **General**: summary totals, Accounts, Transactions, and Projections.
- **Funds**: pooled-fund summary, Accounts, and Transactions.
- **Debt Repayment**: debt summary, Accounts, Transactions, and Projections.
- **Goal Workshop**: Accounts, Generate Plan, Transactions, and Projections.
  Its Generate Plan card includes Simple and Advanced modes.

Choose Budget for baseline, actual, skip, and variance tracking.

### 2.9 Three Different Time Controls

Do not confuse these settings:

1. **Projection window**: scenario Start, End, and Period Type; controls
   calculation scope.
2. **Plan & Actuals View and Period**: controls which occurrence period is on
   screen.
3. **Projections View By and Period filter**: groups or filters displayed
   projection results without changing the engine's Period Type.

Goal Workshop also has a separate Generate Plan planning window.

---

## 3.0 Create Your First Budget

### 3.1 Create or Select a Scenario

1. Go to **Forecast**.
2. Select **Budget** in the left navigation.
3. Click **+ Add New**, enter a scenario name, and save it.
4. Set projection Start, End, and Period Type on the scenario row.
5. Select the scenario row to make it active.

Use a name such as “Baseline 2026” for the plan you intend to maintain.

### 3.2 Add Accounts

In **Accounts**:

1. add the real accounts whose balances you want to forecast;
2. add useful income and expense accounts for the other side of movements;
3. enter current opening balances; and
4. verify each account type.

For a paycheck, for example, Checking is the primary account and Salary Income
is the secondary/source account.

### 3.3 Add Recurring Rules

Open **Plan & Actuals → Recurring** and add the rules that normally repeat.

Suggested order:

1. paychecks and other regular income;
2. rent, mortgage, debt payments, and insurance;
3. utilities and subscriptions;
4. groceries, fuel, and other variable-but-regular costs; and
5. transfers to savings or investment accounts.

Set the recurrence from the real schedule, not merely the total per month.
Correct dates help projections expose short-term cash gaps.

### 3.4 Common Repeat Patterns

- **Weekly** with interval 1: every week.
- **Weekly** with interval 2: every two weeks.
- **Monthly – day of month**: rent on the first, payment on the fifteenth.
- **Monthly – week of month**: second Monday or last Friday.
- **Quarterly**: a repeating cost every three months.
- **Yearly**: insurance, registration, or subscriptions.
- **Custom dates**: a known non-standard set of dates.

Use periodic changes for known trends such as an annual salary increase or
inflation adjustment.

### 3.5 Review the Period

Switch to **Plan & Actuals → Period**.

FTrack immediately resolves all rules that overlap the selected Day, Week,
Month, Quarter, or Year.

Each item shows:

- status and effective date;
- repeat information;
- direction-aware account movement;
- description on its own line;
- Baseline;
- Current plan;
- Actual; and
- Variance.

Use View, Period, and previous/next controls to navigate.

### 3.6 Add One-Time Items

Click **Add item** in Period for:

- a one-time planned purchase;
- a known extra cost in this period;
- irregular income; or
- an unexpected actual.

Choose Planned when it has not happened yet. Choose Actual when you are
recording something that already happened.

### 3.7 Edit with the Right Scope

When editing an occurrence linked to a recurring rule:

- **This occurrence only** changes only that dated item.
- **This and future** starts a new rule segment from the selected occurrence.
- **Entire series** changes the current and future segments in the logical
  series.

Examples:

- A single unusually high electricity bill: **This occurrence only**.
- Rent increases from next month onward: **This and future**.
- The entire current salary series was entered incorrectly:
  **Entire series**.

Changing Repeat cannot apply to just one occurrence, so the editor switches to
a series scope.

Split recurring rules use the shared split editor with **This and future** or
**Entire series** scope. The revision keeps its component set, grouping,
recurrence, and linked account-group/rate information together. Use
**This occurrence only** in Period when only one dated split occurrence should
change.

Recurring also lets you duplicate a normal rule or a whole split set. Use
**End recurring series** to stop the rule before its next unresolved
occurrence. FTrack retains prior actuals, skips, and frozen baselines and
refuses to end a series across protected future history.

### 3.8 Duplicate or Start Repeating

- **Duplicate item** creates a new one-time planned copy.
- **Repeat going forward** creates a recurring rule from a manual item while
  preserving the original occurrence.

Repeat going forward is especially useful when an “unexpected” cost from one
period turns out to be a new regular cost.

### 3.9 Freeze the Baseline

When the selected period's plan is ready, click **Freeze baseline**.

Freeze before tracking if you want a deliberate approval point. If you forget,
marking the first actual freezes the period automatically.

After freeze:

- baseline monetary values remain stable;
- baseline movement perspective remains stable; and
- later plan edits show as changes to Current plan.

### 3.10 Record Actuals and Exceptions

For an expected item:

1. click **Mark actual**;
2. edit the item if its actual amount or date differs; or
3. use **Skip occurrence** if it will not happen.

For an unexpected item:

1. click **Add item**;
2. choose Actual;
3. enter the realized amount, date, accounts, movement, and description; and
4. save.

An unexpected actual has zero baseline and zero current plan, so it appears in
the Unplanned Actuals total.

Actual metadata is snapshotted. Later rule edits cannot silently rewrite the
accounts, movement type, description, tags, or other details attached to
history.

### 3.11 Read Period Totals

The Plan & Actuals totals explain the period from several angles:

- **Baseline net**: income minus expenses in the frozen plan.
- **Current plan net**: income minus expenses in the latest plan.
- **Actual net**: realized income minus realized expenses.
- **Open commitments**: unresolved current-plan movements.
- **Forecast net**: actual net plus open commitments.
- **Actual vs Baseline**: actual net minus baseline net.
- **Actual vs Current**: actual net minus current plan net.
- **Unplanned Actuals**: actual occurrences with a zero baseline.

Use these together. Actual net alone can look favourable simply because
planned costs remain open.

---

## 4.0 Projections

### 4.1 Set the Calculation Window

Set scenario Start, End, and Period Type on the scenario row. These are the
engine settings.

The Projections card's View By selector changes display grouping only.

### 4.2 Freshness

The Projections header reports:

- **Pending** when no successful result exists yet;
- **Stale** when the plan changed after the stored result;
- **Stale · refreshing** while automatic refresh is running; or
- **Current** after successful calculation.

Rule, occurrence, account, and projection-policy changes mark results stale.
FTrack automatically refreshes after a short debounce. Click
**Refresh projections now** when you want an immediate result.

### 4.3 Read and Refine

Look for:

- balances that become negative;
- low-balance periods with little margin;
- debt balances that do not decline;
- savings that do not reach the expected level; and
- stale projections that have not returned to Current.

Refine the plan through rules and period occurrences, not through a separate
projection-source or budget-source setting.

### 4.4 Overdue Open Commitments

An unresolved occurrence before the as-of date can be treated as an overdue
open commitment and carried into the forecast according to the projection
configuration. Recording it Actual or Skipped removes that uncertainty.

---

## 5.0 Ongoing Review

### 5.1 Start of a Period

1. Open Budget → Plan & Actuals → Period.
2. Review resolved occurrences.
3. Add known one-time costs or income.
4. Make occurrence-only corrections.
5. Freeze the baseline.

### 5.2 During a Period

1. Mark expected movements actual.
2. Enter different actual amounts or dates.
3. Record unplanned actuals.
4. Skip cancelled occurrences.
5. Watch projections return to Current after changes.

### 5.3 End of a Period

1. Review Baseline vs Actual.
2. Review Current plan vs Actual.
3. Check Unplanned Actuals.
4. Identify extra costs that are likely to repeat.
5. Use **Repeat going forward** or **This and future** to improve later
   periods.
6. Move to the next period without rebuilding the budget.

---

## 6.0 What-If Scenarios

### 6.1 Keep a Maintained Baseline

Use one scenario for your current expected reality and update it from actual
learning.

### 6.2 Duplicate Before a Major Experiment

Duplicate the baseline for changes such as:

- a new job or raise;
- a move or rent increase;
- a major purchase;
- faster debt repayment;
- loss of income; or
- a new savings contribution.

Change rules or occurrences in the duplicate and compare projections. The
source scenario remains untouched.

### 6.3 Major Purchase Example

1. Duplicate the baseline and name the copy “Car Purchase”.
2. Add a one-time planned Money Out occurrence in the intended purchase
   period.
3. Add or revise a savings-transfer rule with **This and future**.
4. Wait for Projections to return to Current.
5. Compare minimum and ending balances with the baseline scenario.

---

## 7.0 Other Workflows

### 7.1 General

Use General for lightweight rule editing, summary metrics, and projections
without period baseline/actual tracking.

### 7.2 Funds

Use Funds to model a pooled set of accounts with NAV, shares, and ownership
metrics.

### 7.3 Debt Repayment

Use Debt Repayment to model liability balances, recurring and extra payments,
interest, variable-rate schedules, and payoff dates.

### 7.4 Goal Workshop

Use Simple mode for one account goal and a generated contribution rule. Use
Advanced mode for multiple goals, priorities, funding constraints, floors, and
caps.

Generate Plan has its own planning window. Extend the scenario projection
window to the same goal horizon when you want projections to validate the
applied result.

---

## 8.0 Common Questions

### 8.1 Do I Need to Know Accounting?

No. Use Money In when value enters the primary account and Money Out when it
leaves the primary account. The secondary account identifies the other side.

### 8.2 Do I Need to Track Every Purchase?

No. Beginners can use realistic weekly or monthly category rules and add
material exceptions. Add more detail only when it improves a decision.

### 8.3 What If an Actual Differs from the Plan?

Edit the item as Actual and enter the realized amount/date. The frozen
baseline remains available for comparison, while projections use the actual.

### 8.4 What If a Cost Was Not Planned?

Add a manual Actual in the correct period. It appears as an unplanned actual.
If you learn that it will repeat, use **Repeat going forward**.

### 8.5 What If Only One Month Is Different?

Use **This occurrence only**. The recurring rule and other occurrences remain
unchanged.

### 8.6 What If the Change Continues?

Use **This and future** at the first affected occurrence. FTrack preserves
earlier rule segments and actual history.

### 8.7 Why Is the Projection Stale?

Something that affects the resolved plan changed. Wait for automatic refresh,
or click **Refresh projections now**. Stored stale rows are not presented as
current results.

### 8.8 How Far Ahead Should I Project?

- 3 months for near-term cash pressure.
- 6–12 months for normal planning.
- Longer windows for debt payoff or goals, with less confidence in distant
  assumptions.

---

## 9.0 Quick Reference

### 9.1 Movement Cheat Sheet

| Situation | Primary | Secondary | Movement |
|---|---|---|---|
| Get paid | Checking | Salary Income | Money In |
| Pay rent | Checking | Rent Expense | Money Out |
| Buy groceries | Checking | Groceries Expense | Money Out |
| Move money to savings | Checking | Savings | Money Out |
| Pay a credit card | Checking | Credit Card | Money Out |
| Receive interest | Savings | Interest Income | Money In |

### 9.2 Scope Cheat Sheet

| Intent | Scope/action |
|---|---|
| One unusual bill | This occurrence only |
| New amount from now on | This and future |
| Correct the current logical series | Entire series |
| Copy as another one-time item | Duplicate item |
| Make a manual item recur later | Repeat going forward |

### 9.3 Status Cheat Sheet

| Status | Meaning in projections |
|---|---|
| Planned | Included at current planned amount/date |
| Actual | Replaces its matching plan at actual amount/date |
| Skipped | Excluded |
| Manual Actual | Included as an unplanned actual |

---

## 10.0 Getting Help

If a Period item says it needs review, inspect its diagnostic tooltip. Typical
causes are duplicate occurrence keys, invalid dates, or missing account
references.

If imported data behaves unexpectedly, review the migration report retained
with schemaVersion 44 app data. Legacy rows that cannot be converted cleanly
are retained there for recovery rather than silently discarded.

The focused workflow guide is available in
[Plan & Actuals Workflow](USER_BUDGET_WORKFLOW.md).
