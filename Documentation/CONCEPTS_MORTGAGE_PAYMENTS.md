# Mortgage and Loan Repayment Use Cases

## 1.0 Goal

1.1 Define debt repayment use cases for mortgages and similar loans using generic worldwide terminology.

1.2 Keep the focus on repayment scenarios: fixed rate, variable rate, fixed end date, fixed instalment amount.

## 2.0 Neutral Terminology

2.1 Principal: the amount borrowed.

2.2 Interest rate: the annual nominal rate, either fixed or variable.

2.3 Accrual and compounding: how interest accumulates over time.

2.4 Instalment: a periodic payment.

2.5 Term: the total length of the repayment plan.

2.6 End date: the target date to finish repayment.

2.7 Amortisation: paying interest and principal so the balance reaches zero.

2.8 Extra repayment: any payment above the scheduled instalment.

## 3.0 Core Repayment Use Cases

3.1 Fixed rate and fixed end date, compute instalment amount.
- Inputs: principal, rate, start date, end date, payment frequency.
- Output: computed instalment amount and full schedule.

3.2 Fixed rate and fixed instalment amount, compute end date.
- Inputs: principal, rate, start date, payment frequency, instalment amount.
- Output: payoff date and full schedule.
- Validation: detect when instalment does not cover interest.

3.3 Fixed rate, fixed instalment amount, fixed end date, validate feasibility.
- Inputs: principal, rate, start date, end date, instalment amount.
- Output: either feasible with schedule or infeasible with explanation.

## 4.0 Rate Changes

4.1 Variable rate schedule, instalment fixed.
- Inputs: base plan plus date-based rate changes.
- Result: end date changes.

4.2 Variable rate schedule, end date fixed.
- Inputs: base plan plus date-based rate changes.
- Result: instalment amount changes at rate change points.

## 5.0 Common Extensions

5.1 Interest-only for a period, then amortising.

5.2 Extra repayments.
- One-off or recurring.
- Rule choice: reduce end date or reduce future instalments.

5.3 Payment holidays.
- Skip payments or pay interest-only.

5.4 Fees and other costs.
- Model as separate cash flows.

## 6.0 Minimal Data Outputs

6.1 Repayment schedule rows per period.
- Date
- Payment amount
- Interest amount
- Principal amount
- Remaining balance

6.2 Summary totals.
- Total paid
- Total interest paid
- Payoff date or remaining balance at end date
