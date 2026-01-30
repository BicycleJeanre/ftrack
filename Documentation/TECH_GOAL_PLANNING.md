# Goal-Based Planning (Design Plan)

## 1.0 Purpose
Define a simple goal-based scenario type where users can set a small set of parameters and the system recalculates the remaining value using basic linear algebra (no optimization).

## 2.0 User Parameters
Each goal record exposes these editable inputs:
1. Goal Name
2. Starting Balance (PV)
3. Target Amount (FV)
4. Target Date
5. Monthly Contribution (PMT)
6. Expected Annual Return (APR, default 0%)
7. Solve For (one of: Target Amount, Monthly Contribution, Target Date)

## 3.0 Calculation Modes
Exactly one parameter is solved at a time:
1. **Solve Target Amount**: Given PV, PMT, APR, Target Date → compute FV.
2. **Solve Monthly Contribution**: Given PV, FV, APR, Target Date → compute PMT.
3. **Solve Target Date**: Given PV, FV, APR, PMT → compute months to goal.

## 4.0 Core Formulas
Let:
- $r$ = monthly rate = APR / 12
- $n$ = number of months

### 4.1 Future Value
$FV = PV(1+r)^n + PMT\cdot\frac{(1+r)^n - 1}{r}$

### 4.2 Monthly Contribution
$PMT = \frac{FV - PV(1+r)^n}{\frac{(1+r)^n - 1}{r}}$

### 4.3 Months to Target
Rearrange the FV equation to solve for $n$ numerically with a simple loop or logarithm-based approximation.

## 5.0 UI Placement
1. Add a **Goals** accordion directly below **Accounts**.
2. Use a small grid for goals with an add/edit modal.
3. Recalculate immediately when a user edits a parameter or changes the Solve For selection.

## 6.0 Constraints
1. No optimization or multi-goal prioritization.
2. Keep calculations deterministic and fast.
3. Show validation errors for missing inputs or impossible goals (e.g., negative months).
