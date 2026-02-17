# Debt Repayment Concepts

## 1.0 Purpose

1.1 Define how debt repayment modeling works in FTrack.

## 2.0 Core Model

2.1 A debt is represented as a liability account.

2.1.1 Liability balances typically start negative.

2.1.2 Payments move the balance toward zero.

2.2 Interest is modeled as an account periodic change.

2.2.1 Fixed-rate debt uses a single account periodic change.

2.2.2 Variable-rate debt uses an account periodic change schedule.

2.3 Payments are modeled as transactions.

2.3.1 Minimum payment is a recurring planned transaction.

2.3.2 Extra principal payments are separate transactions.

2.3.3 Fees can be modeled as additional expense transactions.

## 3.0 Fixed Rate Vs Variable Rate

3.1 Fixed rate.

3.1.1 One periodic change definition applies for the whole scenario window.

3.2 Variable rate.

3.2.1 A periodic change schedule defines date-bounded overrides.

3.2.2 At most one schedule entry should apply on any date.

3.2.3 If no entry applies, the base periodic change applies.

## 4.0 Payoff Date

4.1 Payoff date is the first date where the projected balance crosses from negative to non-negative.

4.2 If payoff does not occur within the scenario end date, the payoff date will be N A in summary.

## 5.0 What Debt Repayment Shows

5.1 Debt Repayment scenarios emphasize.

5.1.1 Interest paid over time.

5.1.2 Remaining balance over time.

5.1.3 Payoff date per debt.

5.2 Budget and actual tracking are not the focus of this scenario type.

## 6.0 Related Documents

6.1 For step-by-step usage, see Debt Repayment user guide.

6.2 For interest rate fields and schedule structure, see Data Schema.
