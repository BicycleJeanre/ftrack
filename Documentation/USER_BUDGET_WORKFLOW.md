# Budget Workflow

## 1.0 Purpose

1.1 Explain the current compatibility workflow for planning spending, tracking actuals, and recalculating projections from one resolved plan.

1.2 The approved **Plan & Actuals** live period view is being implemented in phases. Until that UI phase is complete, Transactions and Budget remain separate cards.

## 2.0 When To Use Budget

2.1 Use Budget when you want.

2.1.1 An editable budget grid to plan and track spending.

2.1.2 To record actual transactions and compare plan vs actual.

2.1.3 Plan vs actual comparisons and variance analysis.

2.2 If you do not need budgets and actuals, consider the General workflow.

## 3.0 Use the Budget Workflow

3.1 Go to Forecast.

3.2 Select the Budget workflow in the left nav.

3.3 Create a scenario.

3.4 Set Period Type to Month in most cases.

3.5 Set Start and End dates for the projection window.

## 4.0 Build Your Plan

4.1 Add accounts.

4.2 Add planned transactions (both recurring and non-recurring).

4.2.1 Income transactions.

4.2.2 Recurring bills and expenses.

4.2.3 Non-recurring one-time transactions.

4.3 Generate projections to see expected balances and cash flow.

## 5.0 Generate Budget From Planned Transactions

5.1 Add planned transactions to your scenario.

5.1.1 Transactions may be recurring or one-time; one-time entries need an effective date inside the Budget window.

5.2 In the Budget card, click the `⊞` action with the tooltip **Generate from Expanded Transactions**.

5.2.1 The action expands recurring rules and includes dated one-time rules as Budget occurrences.

5.2.2 Budget uses its own independent window dates, separate from projections.

5.3 Review the Budget grid.

5.3.1 Each expanded budget occurrence can be edited individually.

5.3.2 Planned amounts can be changed for specific occurrences.

5.3.3 Actual amounts can be recorded as the period progresses.

## 6.0 Track Actual Transactions

6.1 Use the Budget grid to record what actually happened.

6.2 Mark budget occurrences as "actual" and enter the actual amount and date.

6.3 Compare planned vs actual to identify variances and refine future budgets.

## 7.0 Recalculate Projections From The Resolved Plan

7.1 After editing the Budget grid or recording actuals, click **Generate Projections** or **Regenerate projections**.

7.2 Projections automatically resolve transaction rules together with Budget occurrence edits, actuals, skips, and manual entries.

7.3 There is no longer a calculation choice between Transactions and Budget. The old source value remains stored only for compatibility and does not change results.

7.4 A matching actual replaces its planned occurrence and uses the actual amount and actual date.

## 8.0 Key Differences: Budget Window vs Projection Window

8.1 Budget window: Independent date range used for expanding recurrence-based transactions into budget occurrences.

8.2 Projection window: Independent date range used for generating cash flow projections and account balances.

8.3 These windows remain separate during the compatibility phase. The approved live period view will remove the Budget-generation window in a later schema/UI phase.

8.4 Budget window is required; projections are optional.

## 9.0 Troubleshooting

9.1 If budgets do not appear.

9.1.1 Confirm the selected workflow is Budget.

9.1.2 Add planned recurring or one-time transactions to the scenario.

9.1.3 Configure a budget window (set start and end dates for budget regeneration).

9.1.4 Click the `⊞` **Generate from Expanded Transactions** action to expand transactions into budget occurrences.

9.2 **Generate from Expanded Transactions** shows an error.

9.2.1 Ensure you have added planned transactions whose dates overlap the Budget window.

9.2.2 Budget window must be configured with both start and end dates.
