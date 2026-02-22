# Goal Planning

## 1.0 Purpose

1.1 Explain how goals are modeled in FTrack, and how the Goal-Based workflow differs from the Advanced Goal Solver workflow.

## 2.0 Two Goal Systems

### 2.1 Goal-Based Workflow

2.1.1 Goal-Based uses per-account goal fields.

2.1.2 Each account may define.

2.1.2.1 `goalAmount`: target balance.

2.1.2.2 `goalDate`: date the target should be reached.

2.1.3 The Generate Plan section computes a suggested recurring contribution needed to hit the goal.

2.1.4 Goal-Based is best when you want a simple single-goal plan per account and you do not need cross-account constraints.

### 2.2 Advanced Goal Solver Workflow

2.2.1 Advanced Goal Solver uses a solver that can satisfy multiple goals across multiple accounts with constraints.

2.2.2 Goals and constraints are stored under `scenario.advancedGoalSettings`.

2.2.3 Advanced Goal Solver is best when you need.

2.2.3.1 A funding account.

2.2.3.2 Monthly caps.

2.2.3.3 Account locks.

2.2.3.4 Minimum balance floors.

## 3.0 How Goals Affect Projections

3.1 Goal fields do not change projections by themselves.

3.2 Goals influence projections only when you create planned transactions.

3.2.1 Goal-Based generates a suggested recurring transaction for you to create.

3.2.2 Advanced Goal Solver can generate and apply the transactions automatically.

## 4.0 Common Pitfalls

4.1 Goal dates must fall within the relevant planning window (Generate Plan / Solver).

4.1.1 If you want projections to validate results to the goal date, the scenario projection End date must also cover that date.

4.2 Starting balances matter. Both goal systems start from the account `startingBalance`.

4.3 Period Type matters for date boundaries. Projection Period Type controls how Start/End are interpreted in the scenario grid.
