# FTrack User Features

**Version**: 3.2

**Last Updated**: August 29, 2026

**Purpose**: Current implemented user functionality

---

## 1.0 Scenarios and Workflows

1.1 Create, edit, select, delete, and duplicate financial scenarios.

1.2 Store a scenario name, description, projection window, version, and
lineage.

1.3 Duplicate a scenario to create an independent what-if version while
retaining its source lineage.

1.4 Set the projection Start, End, and Period Type to Day, Week, Month,
Quarter, or Year.

1.5 Select a Forecast workflow without changing or tagging the scenario data:

- General
- Funds
- Debt Repayment
- Goal Workshop

1.6 Open detail layouts for Accounts, Plan Rules, Plan & Actuals, and
Projections. Plan Rules and Plan & Actuals use the same unified component with
different default views.

1.7 Use Goal Workshop Simple or Advanced mode from one Generate Plan card.

## 2.0 Accounts

2.1 Create, edit, and delete accounts within a scenario.

2.2 Set name, number, account type, opening balance, open date, and other
account properties.

2.3 Assign optional goal amount and goal date fields for Goal Workshop Simple
mode.

2.4 Configure account-level periodic changes and date-bounded rate schedules.

2.5 Create account groups for non-postable hierarchy and rollups.

2.6 Filter account views and inspect starting and projected balances.

## 3.0 Transaction Rules

3.1 Create one-time or recurring Money In and Money Out rules.

3.2 Set the primary account, optional secondary account, amount, description,
tags, and effective date.

3.3 Configure recurrence:

- one time;
- daily;
- weekly;
- monthly by day of month;
- monthly by week and weekday;
- quarterly;
- yearly; or
- custom dates.

3.4 Configure flat, percentage, or compound periodic amount changes.

3.5 Create and view grouped transaction line items. Each destination retains
its own account, amount, description, and normal two-account movement; loan
groups can still use principal, interest, and fee components.

3.6 Manage rules in **Plan & Actuals → Recurring** in every main workflow.

3.7 General, Funds, Debt Repayment, and Goal Workshop open Plan & Actuals in
Recurring by default. Select Period for budget and actual tracking; the chosen
view is retained while switching workflows.

3.8 Edit a recurring rule with an explicit scope:

- **This and future** starts a new rule segment at the selected date.
- **Entire series** updates the current and future segments in the logical
  series.

3.9 Preserve past actual history when future rules are revised.

3.10 Edit split recurring rules with the shared split form and explicit
**This and future** or **Entire series** scope, preserving component grouping,
recurrence, and linked account-group/rate metadata.

3.11 Duplicate a recurring rule or complete split set, or use
**End recurring series** to stop future unresolved occurrences without
deleting prior actual, skipped, or frozen history.

3.12 From Period, remove one occurrence or delete that occurrence and the
remaining recurring sequence with separate, explicit controls.

## 4.0 Plan & Actuals

4.1 Use one unified Plan & Actuals card in General, Funds, Debt Repayment, and
Goal Workshop.

4.2 Switch between:

- **Period** for resolved dated occurrences and actuals.
- **Recurring** for reusable rules.

4.3 Resolve occurrences from rules automatically; no separate budget dataset
or transaction-to-budget generation step is required.

4.4 View by Day, Week, Month, Quarter, or Year and navigate previous/next
periods.

4.5 Filter by account and group by status, movement, or repeat pattern.

4.6 Display each item with status, effective date, repeat information,
direction-aware money movement, description, Baseline, Current plan, Actual,
and Variance.

4.7 Show the description on a separate line below the movement.

4.8 Interpret movement from the primary account perspective:

- Money In: secondary/source → primary/receiving.
- Money Out: primary/source → secondary/receiving.

4.9 Add a manual one-time planned or actual item directly to a period.

4.10 Edit a linked recurring occurrence with:

- **This occurrence only**
- **This and future**
- **Entire series**

4.11 Duplicate an item as a new one-time plan.

4.12 Promote a manual item with **Repeat going forward**, preserving the
original occurrence and creating a future rule.

4.13 Mark a planned occurrence actual, including a different actual amount or
date.

4.14 Skip an occurrence and restore it to planned when needed.

4.15 Record unexpected actuals with zero baseline/current plan and include
them in Unplanned Actuals.

4.16 Freeze a period baseline explicitly.

4.17 Freeze the baseline automatically when the first actual is recorded in
an unfrozen period.

4.18 Keep frozen baseline amounts and movement perspective stable when later
rule edits change the current plan.

4.19 Keep actual amounts, dates, accounts, direction, description, tags, and
other rule metadata stable when later rule edits occur.

4.20 Compare period totals:

- Baseline net
- Current plan net
- Actual net
- Open commitments
- Forecast net
- Actual versus baseline
- Actual versus current plan
- Unplanned actuals

4.21 Use **Plan Rules (Detail)** for a genuine recurring rule-segment table
with expanded metadata and safe scoped row actions.

4.22 Use **Plan & Actuals (Detail)** for a genuine resolved-occurrence table
with dates, statuses, movement and description columns, repeat information,
Baseline, Current Plan, Actual, forecast contribution, variances, and actions.

4.23 Switch Period/Recurring inside either detail layout to use the
corresponding table without returning to summary cards.

## 5.0 Projections

5.1 Calculate projections from the same resolved occurrence timeline used by
Plan & Actuals.

5.2 Apply actual amount/date in place of its matching planned occurrence.

5.3 Exclude skipped occurrences.

5.4 Include manual planned and actual occurrences.

5.5 Carry overdue unresolved commitments according to the projection
configuration.

5.6 Mark projections stale immediately after a rule, occurrence, account, or
projection-policy change.

5.7 Automatically refresh stale projections after a short debounce.

5.8 Use **Refresh projections now** for an immediate recalculation.

5.9 Show **Current**, **Stale · refreshing**, **Stale**, or **Pending** state in
the card header.

5.10 Change display grouping with View By without changing the scenario's
projection-engine Period Type.

5.11 Filter projections by period, account, account group, or display grouping.

## 6.0 Goal Workshop

6.1 Use Simple mode for a contribution plan tied to account Goal Amount and
Goal Date.

6.2 Use Advanced mode for multiple goals and constraints.

6.3 Configure an independent Generate Plan planning window.

6.4 Solve, review, and apply generated transaction rules.

6.5 Validate an applied plan with the scenario projection window.

## 7.0 Funds and Debt Repayment

7.1 Use Funds summary metrics for NAV, shares, and ownership.

7.2 Use Debt Repayment summary metrics for projected balances, interest, and
zero/payoff dates.

7.3 Model fixed or variable account rates with periodic change schedules.

7.4 Model regular and extra payments as independently adjustable transaction
rules.

## 8.0 Data Management

8.1 Persist data automatically in browser localStorage.

8.2 Export and import complete app data.

8.3 Write schemaVersion 44.

8.4 Migrate supported legacy storage and imports through the shared migrator.

8.5 Retain a durable migration report for invalid, orphaned, duplicate, or
ambiguous legacy rows.

8.6 Reject unsupported future schema versions instead of downgrading them.

8.7 Validate references, dates, statuses, recurrence, baselines, and
projection freshness before persistence.

## 9.0 User Interface

9.1 Navigate from a responsive top navigation bar and Forecast workflow rail.

9.2 Use card-based sections controlled by the selected workflow.

9.3 Collapse cards, open detail layouts, and use inline or modal filters.

9.4 Edit simple values inline and use modal editors for recurrence, periodic
changes, tags, account groups, and validation.

9.5 Receive validation errors, diagnostics, success messages, and freshness
feedback close to the affected action.

9.6 Open repository documentation from the Documentation page and deep-link to
individual guides.

---

## 10.0 Recommended First Budget

1. Select **General**, then open **Plan & Actuals → Recurring**.
2. Create or select a scenario and set its projection window.
3. Add accounts and opening balances.
4. Create expected repeating movements in **Plan & Actuals → Recurring**.
5. Review the automatically resolved dated items in **Period**.
6. Add known one-time costs and freeze the period baseline.
7. Record actuals, skips, and unplanned items as the period unfolds.
8. Apply **This and future** changes when a learned cost should alter future
   periods.
9. Confirm Projections returns to **Current** and review future balances.
