# Interface Guide: Controls, Tables, and Editing

## 1.0 Use This Guide by Screen

This guide answers: **What does this control do, and how should I interact
with this screen?**

The **Workflow Guide: Plan, Track, and Project** explains which workflow to
choose. This guide explains the shared interface after you arrive there.

## 2.0 Page Anatomy

The Forecast page has four main areas:

- The left sidebar contains scenarios and workflow navigation.
- The top bar contains Menu, theme, Export, Import, Validate, and Clear.
- The main area contains workflow cards or a detail table.
- Each workflow card has a header, an expand/collapse control, and its own
  refresh action.

![Workflow navigation and primary planning views](assets/user-guides/workflow-navigation.jpg "The active scenario and workflow appear in the sidebar; workflow cards appear in the main area.")

On a narrow screen, use **Menu** to show or hide the sidebar. On a wide screen,
the sidebar can remain visible while you work.

## 3.0 Scenario and Top-Bar Interactions

### 3.1 Scenarios

- Click a scenario card to make it active.
- Use the plus action beside Scenarios to create one.
- Use the duplicate action on a scenario to make an independent copy.
- Use the remove action only when the scenario is no longer needed.

Each scenario keeps its own accounts, rules, occurrences, baselines, actuals,
projection configuration, and goal-planning data.

### 3.2 Top Bar

- **Dark** switches the theme.
- **Export** downloads the current application data.
- **Import** loads a supported FTrack export.
- **Validate** checks stored data and reports issues.
- **Clear** removes application data; export first if you may need it again.

## 4.0 Cards and Refresh

Click a card header to expand or collapse it. The arrow at the left shows its
state. The refresh action at the right rebuilds that card from the selected
scenario.

Refreshing a card does not create a second dataset. For example, refreshing
Plan & Actuals re-renders the same rules and occurrences used by Projections.

## 5.0 Plan & Actuals Tabs

Plan & Actuals has two modes:

- **Period** shows dated occurrences and actual tracking.
- **Recurring** shows the reusable rule segments that produce occurrences.

The selected tab is highlighted. Switching tabs changes the working view; it
does not move or convert data.

Both modes keep their controls and primary actions together in one visible top
toolbar. There is no separate filter pop-up to open before changing the view.
On narrower screens, scroll the toolbar horizontally to reach every control.

The app remembers the last Plan & Actuals workspace separately for each
scenario. Returning to the app restores Period versus Recurring, the time view,
selected period, account, grouping, and the Recurring filter selections.

## 6.0 Period Controls

![General Plan & Actuals Period controls and comparison cards](assets/user-guides/budget-period.jpg "The Period toolbar controls time, account perspective, grouping, creation, and baseline freezing.")

The consolidated top toolbar keeps the frequent actions together:

- **View** changes the time grain: Day, Week, Month, Quarter, or Year.
- **Previous**, **Period**, and **Next** navigate the selected time grain.
- **Account** limits results to one account perspective.
- **Group** organizes items by Status, Movement, or Repeat.
- **Add item** creates a one-time planned or actual movement.
- **Freeze baseline** preserves the predicted budget for comparison.

Changing the time grain can change which Period choices are available. Account
and Group change presentation only; they do not change the stored plan.
When grouping is active, each grouping bar shows its signed forecast total next
to the header. Actual items contribute their actual amount, open items contribute
their current plan, and skipped items contribute zero.

## 7.0 Reading a Period Item

Each summary card contains:

- The secondary or external counterparty account as the first line.
- Status, effective date, and whether it came from a recurring rule.
- A direction-aware money movement.
- The description on a separate line under the movement.
- Baseline, Current, Actual, and Variance amounts.
- Row actions at the right.

For **Money In**, the movement reads source → receiving account. In the guide
example, Salary Income → Checking means money enters Checking.

For **Money Out**, the movement reads source → receiving account. In the guide
example, Checking → Groceries Expense means money leaves Checking.

The direction label and color are meaningful. Do not infer direction only
from the account order.

Card accents follow movement direction rather than plan status: Money In uses
green and Money Out uses red. On actual items, Money Out actual amounts are
shown as red negative values so cash leaving the selected account is explicit.
The planned or actual pill remains the status indicator.

## 8.0 Period Summary Metrics

- **Baseline Net** is the frozen predicted amount for the period.
- **Current Plan Net** reflects later plan adjustments.
- **Actual Net** includes results recorded so far.
- **Open Commitments** includes planned items still unresolved.
- **Forecast Net** combines actuals with open commitments.
- **Actual vs Baseline** compares reality with the original prediction.
- **Actual vs Current** compares reality with the adjusted plan.
- **Unplanned Actuals** totals actual items that had no planned amount.

Use item-level variance to find the cause of a summary-level difference.

## 9.0 Period Row Actions

The available actions depend on the item's status and origin:

- **Actual checkbox** records a planned item as completed using its planned
  amount and date. It remains checked once the item is actual.
- **Remove this occurrence** excludes a planned occurrence that will not happen.
- **Edit item** opens the occurrence editor.
- **Duplicate item** creates a separate one-time planned copy.
- **Restore to planned** becomes available when editing a skipped item.
- **Repeat going forward** can promote a manual item into a future recurring
  rule.

If the actual amount or date differs, use Edit instead of marking the item
actual without correction.

## 10.0 Edit Scope

When editing an occurrence linked to a recurring rule, choose scope
deliberately:

- **This occurrence only** changes only the selected occurrence.
- **This and future** creates a new segment beginning at this occurrence.
- **Entire series** revises the current and future segments.

Changing a repeat pattern requires a future-capable scope. Existing actuals,
skips, and frozen history remain protected.

Use **This and future** for a price increase that begins now. Use **This
occurrence only** for an exceptional charge. Use **Entire series** to correct
a rule that was consistently defined incorrectly.

## 11.0 Recurring Controls and Rule Cards

![Recurring plan rules with toolbar and direction labels](assets/user-guides/recurring-rules.jpg "Recurring shows reusable rule segments, totals, movement direction, schedule, next occurrence, and tags.")

The Recurring toolbar includes:

- **Account** to limit the rule list.
- **Group** to organize the visible rules.
- **Split**, **Role**, and **Account Group** to narrow linked split rules.
- **Add rule** to create a one-time or recurring rule.
- **Split** to build or manage linked split components.
- **Refresh** to reload the current rules.

All of these controls remain visible in the same top toolbar. On a narrow
screen, scroll the toolbar horizontally instead of opening a separate panel.

Each rule card shows the movement, description, repeat schedule, adjustment,
next date, and tags. The repeat label shows the frequency and its optional end
date; it does not repeat the stored start date. Its actions allow duplication
or ending the series. Select a rule to edit its definition and choose the
required scope.
When rules are grouped, each grouping bar shows the signed total of the visible
rules next to its header.

## 12.0 Detail Tables

Detail shortcuts use full tables for scanning, sorting, filtering, and
auditing.

### 12.1 Plan Rules Detail

![Plan Rules Detail table](assets/user-guides/plan-rules-detail.jpg "This table shows rule segments and keeps the Period and Recurring switch.")

Use column headers and filter fields to narrow the rule list. Row actions use
the same scoped safety rules as the summary interface.

### 12.2 Plan & Actuals Detail

![Plan and Actuals Detail occurrence table](assets/user-guides/plan-actuals-detail.jpg "The Period detail view shows resolved occurrence columns and row actions.")

This table is intentionally different from the summary card view. Use it to
compare dates, status, movement, description, baseline, current plan, actual,
forecast contribution, variance, and actions across many occurrences.

Switching this component to Recurring changes it to the Plan Rules detail
table rather than displaying the summary cards.

### 12.3 Projections Detail

![Projections Detail controls, totals, and table](assets/user-guides/projections-detail.jpg "Projection controls sit above totals and the account-by-period table.")

The Projections toolbar includes:

- **Current**, **Stale · refreshing**, or **Pending** calculation status.
- Account, time View, Period, previous/next, and Group controls.
- Refresh projections now.
- Expand or display controls where available.
- Filters.

The table exposes Date, Account, Account Type, Balance, Income, Expenses,
Capital In, Capital Out, Interest In, Interest Out, and Net Change.

## 13.0 Funds, Debt, and Goal-Specific Controls

### 13.1 Funds

![Funds workflow summary](assets/user-guides/funds-workflow.jpg "The Funds summary appears above shared Accounts and Plan & Actuals cards.")

Enter or review total shares in the fund summary. NAV, share price,
contributions, redemptions, and net movement update from the scenario data.

### 13.2 Debt Repayment

![Debt Repayment workflow summary](assets/user-guides/debt-workflow.jpg "The debt summary shows balances, interest, account counts, and account-level payoff information.")

Use Filters to narrow debt-summary results. Review liability zero dates after
changing payment rules, rates, actuals, or skipped payments.

### 13.3 Goal Workshop

![Goal Workshop interface](assets/user-guides/goal-workshop.jpg "Constraints, Goals, and Solution form the Goal Workshop interaction sequence.")

- Use plus in **Constraints** to add funding or solution limits.
- Use plus in **Goals** to add an outcome and priority.
- Expand a constraint or goal to edit it.
- Use **Solve** to calculate a proposal.
- Review the Solution before using **Apply**.

Applying a solution creates or updates plan rules. Continue editing and
tracking them through Plan & Actuals.

## 14.0 Safe Interaction Checklist

Before saving a change:

1. Confirm the active scenario.
2. Confirm Period versus Recurring.
3. Confirm Money In versus Money Out and the source/receiving accounts.
4. Confirm planned versus actual status.
5. Confirm the edit scope.
6. Recheck the comparison totals.
7. Wait for Projections to return to Current.
