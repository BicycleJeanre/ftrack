# Plan & Actuals Workflow

## 1.0 Purpose

1.1 Every main workflow uses one transaction-based plan. Recurring and one-time
transaction rules define the plan, dated occurrences capture period
adjustments and actuals, and projections resolve both automatically.

1.2 You no longer generate or clear a separate Budget dataset.

## 2.0 Open Budget Planning

2.1 Go to Forecast, select **General**, then select **Period** in Plan &
Actuals for budget entry and tracking. Select **Recurring** in the same card
for reusable rules. General replaces the former Budget navigation preset and
adds its summary totals without creating a second copy of the plan.

Funds, Debt Repayment, and Goal Workshop use the same Plan & Actuals data when
their specialized views are useful.

2.2 Create or select a scenario and add the accounts used by its money movements.

2.3 Use the **Plan & Actuals** card to switch between:

- **Period**: the live occurrence plan and actuals for a selected period.
- **Recurring**: the reusable transaction rules that produce future occurrences.

## 3.0 Build and Adjust the Plan

3.1 In **Recurring**, create or edit repeating income, bills, transfers, tags, recurrence, periodic adjustments, and split components. Every recurring edit requires **This and future** or **Entire series** scope.

3.1.1 Split rules use the shared split editor. Scoped changes keep the
component set, grouping metadata, recurrence, and linked account-group/rate
details together as a new future segment or an entire-series revision.

Use **Create recurring transaction with line items** for one grouped intent
with several destination accounts. **Add line** captures each destination,
amount, and description without reopening or duplicating the parent rule.

3.1.2 Use **Duplicate recurring rule** to copy a normal rule or its entire
split set. Use **End recurring series** to stop it before the next unresolved
occurrence. Ending a series keeps prior actuals, skips, and frozen baselines;
it will not cross protected future history.

Period cards expose the same distinction directly: remove only the selected
occurrence, or delete the linked recurrence from that occurrence forward.

3.2 In **Period**, click **Add item** to enter a one-time planned or actual movement.

3.3 Each Period item shows:

- Status, effective date, and repeat information.
- A direction-aware money movement. Money In flows from the secondary/source
  account into the primary/receiving account; Money Out flows from the
  primary/source account to the secondary/receiving account.
- The description on its own line below the movement.
- Baseline, Current plan, Actual, and Variance.

3.4 Use **Edit item** and choose the intended scope:

- **This occurrence only** changes only the selected period item.
- **This and future** starts a new rule segment at the selected occurrence.
- **Entire series** changes the current and future segments in the series.

3.5 Changing Repeat on a linked rule automatically selects **This and future**, because recurrence cannot be changed for only one occurrence.

3.6 Use **Duplicate item** to create a new one-time planned copy.

3.7 Use **Repeat going forward** on a manual item to turn future repetitions into a recurring rule while preserving the original occurrence.

## 4.0 Track Actuals

4.1 Tick **Actual** for a planned item, or edit it and choose Actual to enter a different amount or date.

4.2 The first actual in a period freezes that period's baseline automatically. You can also click **Freeze baseline** before actuals are entered.

4.3 Click **Remove this occurrence** when a planned event will not happen. Edit a removed item and choose **Restore to planned** if it becomes active again.

4.4 Add a manual Actual when an unexpected cost or income was not in the plan. Its baseline and current plan are zero, so it appears as an unplanned actual.

4.5 Period totals compare:

- Baseline net.
- Current plan net.
- Actual net.
- Open commitments.
- Forecast net.
- Actual versus baseline and current plan.
- Unplanned actuals.

## 5.0 Projections

5.1 Projections always build from the same resolved occurrence timeline used by Plan & Actuals.

5.2 A plan or actual change refreshes Plan & Actuals immediately, marks projections stale, and automatically regenerates projections after a short debounce.

5.3 The Projections header shows **Current**, **Stale · refreshing**, or **Pending**.

5.4 A matching actual replaces its planned occurrence. Skipped items are excluded. Overdue open commitments can be carried forward according to the projection configuration.

## 6.0 Period Controls

6.1 Use View to switch between Day, Week, Month, Quarter, and Year.

6.2 Use Period and the previous/next controls to move through the scenario window.

6.3 Account filters show the selected account's perspective. Group By can organize items by status, movement, or repeat pattern.

6.4 Use a detail shortcut when a table is more useful than summary cards:

- **Plan Rules (Detail)** opens the unified component in Recurring and renders
  a full rule-segment table with safe scoped actions.
- **Plan & Actuals (Detail)** opens it in Period and renders a full
  resolved-occurrence table with dates, statuses, movements, descriptions,
  comparison amounts, forecast contribution, variances, and actions.

Both detail shortcuts keep the Period/Recurring switch. Changing the view
changes the table rather than rendering the summary card layout again.

## 7.0 Troubleshooting

7.1 If Period is empty, confirm that rules or manual items overlap the selected period and that the scenario has accounts.

7.2 If Recurring is empty, add a transaction rule with the plus action. Recurring shows all active rule segments by default.

7.3 If an item reports that it needs review, inspect the resolver diagnostic tooltip and repair duplicate, invalid-date, or missing-account data.

7.4 If projections show Stale, wait for automatic refresh or use **Refresh projections now**.
