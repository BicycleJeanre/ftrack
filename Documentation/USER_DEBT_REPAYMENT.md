# Debt Repayment

## 1.0 Purpose

1.1 Explain how to use Debt Repayment scenarios to model payoff timelines, interest paid, and payoff dates.

## 2.0 When To Use Debt Repayment

2.1 Use Debt Repayment when you want to.

2.1.1 Model one or more debts as liability accounts.

2.1.2 Add planned payments as transactions.

2.1.3 Apply interest as an account periodic change, including variable rates.

2.1.4 See payoff dates and interest paid in the summary cards.

2.2 Do not use Debt Repayment when you need.

2.2.1 Budget vs actual tracking.

2.2.2 Multi-goal planning with constraints. Use Advanced Goal Solver for that.

## 3.0 Create A Debt Repayment Scenario

3.1 Go to Forecast.

3.2 Create a new scenario.

3.3 Set.

3.3.1 Type to Debt Repayment.

3.3.2 Period Type to Month in most cases.

3.3.3 Start and End dates to cover the payoff window.

3.4 Select the scenario so it becomes the active scenario.

## 4.0 Add Debt Accounts

4.1 In Accounts, add one liability account per debt.

4.2 Set.

4.2.1 Starting Balance to a negative number.

4.2.2 Open Date to a valid date.

4.3 Interest rate.

4.3.1 Use the account periodic change to apply interest to the balance.

4.3.2 If you have a fixed rate, set a single periodic change.

4.3.3 If you have a variable rate, use the rate schedule editor to set date ranges.

4.4 Notes.

4.4.1 A schedule entry overrides the base periodic change for its date range.

4.4.2 Avoid overlapping ranges.

## 5.0 Add Payment Transactions

5.1 In Transactions, add planned payments that reduce the liability balance.

5.2 Use recurring transactions for monthly minimum payments.

5.3 Add extra payments as separate transactions so you can turn them on or off.

5.4 Use realistic start dates so the projection timeline matches expected payments.

## 6.0 Generate Projections

6.1 Click Generate Projections.

6.2 Review.

6.2.1 The per-period balance changes.

6.2.2 The interest field in projections when shown.

6.2.3 The debt summary cards.

## 7.0 Read The Summary Cards

7.1 Debt Repayment scenarios show per-account summary cards.

7.2 Common fields.

7.2.1 Starting Balance uses the account starting balance.

7.2.2 Projected End is the projected ending balance at scenario end.

7.2.3 Interest Paid totals negative interest deltas.

7.2.4 Zero Date is when the balance crosses from negative to non-negative.

7.3 If Zero Date is N A, the scenario end date may be too early or payments too low.

## 8.0 Troubleshooting

8.1 Payoff never happens.

8.1.1 Increase payments.

8.1.2 Extend scenario end date.

8.1.3 Confirm interest rate settings are correct.

8.2 Interest looks wrong.

8.2.1 Confirm the account is a liability with a negative starting balance.

8.2.2 Confirm the periodic change uses a percent mode, not a flat amount.

8.2.3 If using a schedule, confirm only one entry applies on each date.
