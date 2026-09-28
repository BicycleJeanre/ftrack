# Goal Workshop

## 1.0 Purpose

1.1 Explain how goals are modeled in FTrack, and how the Simple and Advanced modes of the Goal Workshop workflow differ.

## 2.0 Two Modes

### 2.1 Simple Mode

2.1.1 Simple mode uses per-account goal fields.

2.1.2 Each account may define.

2.1.2.1 `goalAmount`: target balance.

2.1.2.2 `goalDate`: date the target should be reached.

2.1.3 The Generate Plan section computes a suggested recurring contribution needed to hit the goal.

2.1.4 Simple mode is best when you want a single-goal plan per account and you do not need cross-account constraints.

### 2.2 Advanced Mode

2.2.1 Advanced mode uses a solver that can satisfy multiple goals across multiple accounts with constraints.

2.2.2 Goals and constraints are stored under `scenario.advancedGoalSettings`.

2.2.3 Advanced mode is best when you need.

2.2.3.1 A funding account.

2.2.3.2 Monthly caps.

2.2.3.3 Account locks.

2.2.3.4 Minimum balance floors.

2.2.4 Advanced mode has four allocation strategies.

2.2.4.1 Balanced Monthly solves steady contributions for goals in parallel.

2.2.4.2 Priority Cascade reserves contractual minimums, then applies extra
capacity by goal priority and deadline.

2.2.4.3 Debt Snowball reserves contractual minimums, then targets the smallest
remaining debt balance. Priority and deadline break ties.

2.2.4.4 Debt Avalanche reserves contractual minimums, then targets the debt
account with the highest percentage rate. Priority and deadline break ties.

2.2.5 Priority Cascade, Debt Snowball, and Debt Avalanche build a month-by-month
cashflow schedule. Freed capacity rolls into later goals, including unused
capacity in the completion month. Their solutions may contain multiple dated
rule phases for one goal.
Those phases are one logical solution, while remaining normal Plan Rules that
can be reviewed in Plan & Actuals.

## 3.0 How Goals Affect Projections

3.1 Goal fields do not change projections by themselves.

3.2 Goals influence projections only when they produce transaction rules.

3.2.1 Simple mode generates a suggested recurring rule for you to create.

3.2.2 Advanced mode can generate and apply the rules automatically.

3.3 Each Solve starts from a clean replacement baseline: existing
Goal Workshop-generated future rules are excluded, but completed actual
occurrences remain. This lets a plan be re-solved as real results arrive.

## 4.0 Common Pitfalls

4.1 Goal dates must fall within the relevant planning window (Generate Plan / Solver).

4.1.1 If you want projections to validate results to the goal date, the scenario projection End date must also cover that date.

4.2 Starting balances, existing Plan Rules, actual results, and account interest
assumptions matter. The advanced workshop calculates remaining work from a
baseline projection and validates its proposed rules through projections.

4.3 Period Type matters for date boundaries. Projection Period Type controls how Start/End are interpreted in the scenario grid.

4.4 Cascade requires enough monthly capacity before each deadline. An unresolved
shortfall is shown in the solution review and prevents Apply.
