# Workflow Guide: Plan, Track, and Project

## 1.0 Use This Guide by Outcome

This guide answers: **Which workflow should I use for the job I am trying to
complete?**

- Use **General → Plan & Actuals → Period** to build a budget, record actuals,
  and compare the baseline, current plan, forecast, and actual results.
- Use **General → Plan & Actuals → Recurring** to maintain reusable rules while
  reviewing overall financial health, summaries, and projections.
- Use **Funds** to review pooled-fund value, shares, ownership, contributions,
  and redemptions alongside the plan.
- Use **Debt Repayment** to review payoff progress, interest, projected
  balances, and zero dates alongside the plan.
- Use **Goal Workshop** to generate plan rules from goals and constraints.
- Use a **Detail** shortcut when you need an audit table rather than summary
  cards.

![Workflow navigation and primary planning views](assets/user-guides/workflow-navigation.jpg "Select a primary workflow for the task, or a Detail shortcut for a full table.")

## 2.0 One Plan, Several Working Views

The workflows do not own separate copies of your budget or transactions. They
are different views over the selected scenario's shared planning data:

1. **Recurring rules** describe expected money movements.
2. **Period occurrences** resolve those rules into dated items and include
   manual one-time items.
3. A **baseline** freezes the period's predicted budget for comparison.
4. **Actuals** record what really happened.
5. **Projections** carry the resolved plan and actuals forward into account
   balances.

Changing workflows does not copy, move, or regenerate this data. A rule added
in Goal Workshop is visible in General. An actual recorded in General affects
Funds, Debt Repayment, Goal Workshop, and Projections wherever it is relevant.

## 3.0 General: Build and Track a Budget Period

General opens **Plan & Actuals → Recurring** for plan entry. Select **Period**
in that card when the job is budget and actual tracking.

### 3.1 Set Up the Expected Plan

1. Select the scenario and confirm its projection Start, End, and Period Type.
2. Open **Recurring**.
3. Add expected income, bills, transfers, debt payments, subscriptions, and
   other repeating movements.
4. Review each rule's accounts, direction, amount, repeat pattern, active
   dates, adjustments, and tags.
5. Return to **Period** and choose the relevant day, week, month, quarter, or
   year.

![Recurring plan rules with Money In and Money Out directions](assets/user-guides/recurring-rules.jpg "Recurring is the reusable source plan. It is not a separate transaction list that must be converted into a budget.")

### 3.2 Handle Costs That Were Not in the Original Plan

Use **Add item** in Period for a one-time planned item or an unexpected actual.
If the cost later proves repeatable, use **Repeat going forward** to create a
recurring rule without losing the original occurrence.

When an existing recurring cost changes, edit the occurrence and choose:

- **This occurrence only** for a one-off exception.
- **This and future** when the new amount or schedule starts here.
- **Entire series** when the current and future series should use the change.

### 3.3 Freeze, Track, and Compare

1. Click **Freeze baseline** when the selected period represents the plan you
   intended to follow. The first actual also freezes an unfrozen period.
2. Tick **Actual** when a planned item happens.
3. Edit the actual amount or date when reality differs from the plan.
4. Use **Skip occurrence** when a planned item will not happen.
5. Add an Actual item when something unexpected happens.
6. Review the comparison totals and individual variances.

![General Period view with plan comparison cards](assets/user-guides/budget-period.jpg "Period compares the frozen baseline, current plan, actuals, open commitments, forecast, and variances.")

The comparison terms mean:

- **Baseline** is the frozen predicted budget.
- **Current plan** includes later plan adjustments.
- **Actual** is what has happened so far.
- **Open commitments** are planned items still expected to happen.
- **Forecast** combines actual results with remaining commitments.
- **Projections** extend the resolved timeline into future account balances.

## 4.0 General: Review the Whole Scenario

General is the broadest review workflow. It opens Plan & Actuals on
**Recurring** and combines:

- Summary totals for the scenario.
- Account balances and account-level information.
- The same Period and Recurring plan used by General.
- Forward projections.

Use General after changing rules or actuals when you want to see the wider
effect. Switch to Period inside the Plan & Actuals card whenever you need the
baseline-versus-actual comparison.

## 5.0 Funds: Review Ownership and Fund Value

Funds adds a fund-specific Summary to the shared Accounts and Plan & Actuals
views.

Use it to review:

- Total shares and net asset value.
- Share price.
- Contributions, redemptions, and net movement.
- Equity-account ownership.
- The recurring rules or period actuals that drive those results.

![Funds workflow with fund totals and recurring plan rules](assets/user-guides/funds-workflow.jpg "Funds combines fund totals with the same plan rules used in every other primary workflow.")

A contribution or redemption should still be represented by the appropriate
money movement in Plan & Actuals. The fund summary interprets that shared data;
it does not maintain a separate fund transaction list.

## 6.0 Debt Repayment: Review Payoff Progress

Debt Repayment combines debt-focused projection summaries with the shared
plan.

Use it to:

1. Confirm liability opening balances and interest settings.
2. Add or adjust repayment rules in Recurring.
3. Review projected ending balances, interest paid or earned, and the expected
   zero date.
4. Switch to Period to record actual payments or skipped payments.
5. Recheck the projection after any actual or future-scope adjustment.

![Debt Repayment workflow with payoff summary and recurring plan](assets/user-guides/debt-workflow.jpg "Debt Repayment shows payoff and interest outcomes above the shared Plan & Actuals data.")

## 7.0 Goal Workshop: Generate Rules From an Outcome

Goal Workshop is for planning backward from a desired result.

1. Add constraints such as the funding account and allowed date or amount
   limits.
2. Add one or more goals and set their priority.
3. Click **Solve**.
4. Review the proposed solution.
5. Apply the solution only when it represents the intended plan.
6. Review the generated rules in Plan & Actuals → Recurring.
7. Use Period to track those generated rules against actual results.

![Goal Workshop constraints, goals, and solution areas](assets/user-guides/goal-workshop.jpg "Goal Workshop creates plan rules; the generated result is tracked through the same Recurring and Period views.")

Use the simple workshop for direct goals. Use the advanced solver when several
goals, priorities, constraints, or trade-offs must be solved together.

## 8.0 Detail Shortcuts: Audit the Underlying Rows

Detail shortcuts isolate one surface and use full tables instead of the
summary-card layout.

### 8.1 Plan Rules (Detail)

Use this table to inspect recurring rule segments, account directions,
amounts, repeat settings, active dates, adjustments, and actions across many
rules.

![Plan Rules Detail table](assets/user-guides/plan-rules-detail.jpg "Plan Rules Detail is the table view of recurring rule segments.")

### 8.2 Plan & Actuals (Detail)

Use this table to audit resolved occurrences. It shows dates, status,
movement, description, baseline, current plan, actual, forecast contribution,
variance, and row actions.

![Plan and Actuals Detail table](assets/user-guides/plan-actuals-detail.jpg "Plan & Actuals Detail is a real occurrence table, not the summary card view.")

### 8.3 Projections (Detail)

Use this table for account-by-period balances and the income, expense, capital,
interest, and net-change components behind the projection.

![Projections Detail table and totals](assets/user-guides/projections-detail.jpg "Projections Detail exposes the period and account rows behind the forward-looking totals.")

## 9.0 Recommended Period Cycle

At the start of a period:

1. Review Recurring rules and known one-time items.
2. Switch to Period and confirm the dated plan.
3. Freeze the baseline.

During the period:

1. Mark items actual as they happen.
2. Record unexpected actuals.
3. Skip cancelled items.
4. Apply one-off or future-scope corrections deliberately.

At the end of the period:

1. Compare Baseline, Current plan, Actual, and Forecast.
2. Investigate the largest variances and unplanned actuals.
3. Promote learned repeat costs with **Repeat going forward**.
4. Adjust existing rules with **This and future** where appropriate.
5. Confirm Projections returns to **Current**.

## 10.0 When Results Look Wrong

- If Period is empty, confirm the scenario has accounts and that a rule or
  manual item overlaps the selected period.
- If a movement appears backward, confirm whether it is Money In or Money Out
  and check the source and receiving accounts.
- If the predicted comparison moved unexpectedly, confirm whether you changed
  Baseline or Current plan.
- If projections are stale, wait for automatic refresh or use the refresh
  action.
- If summary cards hide row-level detail, use the matching Detail shortcut.
