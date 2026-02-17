# Advanced Goal Solver

## 1.0 Purpose

1.1 The Advanced Goal Solver helps you generate planned transactions that satisfy one or more account goals by specific dates, while respecting optional constraints.

1.2 It uses the scenario’s current accounts, starting balances, and projection engine to validate that the suggested transactions actually achieve the goals.

## 2.0 Definitions

### 2.1 Shared Fields

2.1.1 **Account**: the scenario account a goal or constraint applies to.

2.1.2 **Amount**: meaning depends on the selected type (see 2.2 and 2.3). It is never “the account balance” unless a field explicitly says so.

2.1.3 **Start Date / End Date**:

2.1.3.1 If blank, Start Date defaults to the scenario start date.

2.1.3.2 If blank, End Date defaults to the scenario end date.

2.1.4 **Priority**: lower numbers are solved first. If two goals conflict, priority decides which goal is favoured.

### 2.2 Goal Fields and Goal Types

2.2.1 **Goal Type: Reach balance target** (`reach_balance_by_date`)

2.2.1.1 **Target Amount**: the minimum balance you want the account to reach by End Date.

2.2.2 **Goal Type: Increase by delta** (`increase_by_delta`)

2.2.2.1 **Delta Amount**: the minimum increase in balance between Start Date and End Date.

2.2.3 **Goal Type: Pay down to target** (`pay_down_by_date`)

2.2.3.1 **Target Amount**: the maximum balance you want the account to be at or below by End Date.

2.2.3.2 This is typically used for debt payoff (target 0).

2.2.4 **Goal Type: Maintain floor** (`maintain_floor`)

2.2.4.1 **Floor Amount**: the minimum balance the account must not go below at any point in the projection.

### 2.3 Constraint Fields and Constraint Types

2.3.1 **Constraint Type: Funding account** (`fundingAccount`)

2.3.1.1 **Account**: the “source of funds” account used for solver-generated outflows/transfers.

2.3.1.2 **Amount**: not used. Leave blank.

2.3.2 **Constraint Type: Max outflow per month** (`maxOutflow`)

2.3.2.1 **Amount**: a monthly cap on total solver-generated outflow.

2.3.2.2 This is a per-month limit, not a one-time total.

2.3.3 **Constraint Type: Locked account** (`lockedAccount`)

2.3.3.1 **Account**: the solver is not allowed to move this account.

2.3.3.2 **Amount**: not used. Leave blank.

2.3.4 **Constraint Type: Account movement cap** (`accountCap`)

2.3.4.1 **Account**: the account being capped.

2.3.4.2 **Amount**: a per-month movement cap for that account, applied to solver-generated transactions.

2.3.5 **Constraint Type: Min balance floor** (`minBalanceFloor`)

2.3.5.1 **Account**: the account being protected.

2.3.5.2 **Amount**: the minimum allowed absolute balance during the projection.

### 2.4 Actions

2.4.1 **Solve**: calculates suggested monthly planned transactions and validates them using projections.

2.4.2 **Apply**: writes the suggested transactions into the scenario and removes any prior solver-generated transactions.

## 3.0 Use Cases

### 3.1 Pay off a home loan 1 year sooner

3.1.1 Scenario: Advanced Goal Solver.

3.1.2 Accounts: ensure your loan and your funding account exist in the scenario and have correct starting balances.

3.1.3 Constraints:

3.1.3.1 Add Funding account and select your bank/cash account. Leave Amount blank.

3.1.3.2 Optional: add Max outflow per month to avoid unrealistic payments.

3.1.4 Goals:

3.1.4.1 Add a goal on the loan account: Pay down to target.

3.1.4.2 Set End Date to the payoff date you want (1 year earlier than your current forecast).

3.1.4.3 Set Target Amount to 0.

3.1.5 Click Solve, review the suggested monthly payment, then click Apply to generate planned transactions.

### 3.2 Pay down a credit card to a remaining balance

3.2.1 Constraints: Funding account = your bank account.

3.2.2 Goal: Pay down to target on the credit card account.

3.2.3 Target Amount: set the remaining balance you want by End Date.

3.2.4 Solve, then Apply.

### 3.3 Build savings while protecting your emergency fund

3.3.1 Constraints: Funding account = your bank account.

3.3.2 Add constraint: Min balance floor on the emergency fund account.

3.3.3 Amount: set the minimum balance you must keep (for example, 3 months of expenses).

3.3.4 Goal: Reach balance target on your savings/investment account by a target date.

3.3.5 Solve and Apply. If the floor prevents the goal, reduce the target or extend the date.

### 3.4 Multiple goals with priorities

3.4.1 Constraints: Funding account = your bank account.

3.4.2 Goals:

3.4.2.1 Priority 1: Pay down to target for your highest-interest debt.

3.4.2.2 Priority 2: Reach balance target for savings.

3.4.3 Solve. The solver should satisfy Priority 1 first when limited by funding/floors/caps.

### 3.5 Keep one account unchanged while solving everything else

3.5.1 Constraints:

3.5.1.1 Funding account = your bank account.

3.5.1.2 Locked account = your retirement account (or any account you do not want moved).

3.5.2 Add goals for the accounts you do want to change, then Solve and Apply.

## 4.0 Notes and Limitations

4.1 Starting balances matter. The solver starts from each account’s `startingBalance` in the scenario.

4.2 Amount fields are type-specific. If a row is Funding account or Locked account, Amount is intentionally unused.

4.3 The solver validates by running projections with suggested transactions included.

## 5.0 Related Documents

5.1 Goal Planning explains the Goal-Based Generate Plan flow and how account goal fields work.

5.2 Debt Repayment explains debt-focused modeling and variable-rate schedules.
