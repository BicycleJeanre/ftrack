# QC Method Summary

## 1.0 Objective
Define a simple and repeatable Quality Check (QC) method that validates core forecasting behavior using:
- A controlled QC input dataset
- A manually verified expected outputs dataset
- A runner that compares actual vs expected values
- A markdown report with failures and details

## 2.0 Proposed QC Method
### 2.1 Inputs
1. QC input data includes scenarios, accounts, transactions, recurrence, periodic changes, and projections setup.
2. Expected outputs include manually calculated verification values for each test case.

### 2.2 Execution
1. Load QC input data.
2. Run targeted modules (for example projection engine, transaction expansion, periodic change logic).
3. Capture normalized outputs.
4. Compare actual values to expected values.

### 2.3 Output
Generate a markdown report that includes:
- Pass/fail summary by module and use case
- Failure overview count
- Detailed mismatch entries with expected value vs actual value

## 3.0 Proposed QC Files and Purpose
### 3.1 Data Files
- `QC/qc-input-data.json`: Master input cases covering all supported use cases.
- `QC/qc-expected-outputs.json`: Manually verified expected results keyed by case id.

### 3.2 Runner and Utilities
- `QC/run-qc.js`: Main QC orchestrator that runs all enabled module checks.
- `QC/lib/compare-results.js`: Shared comparator and tolerance helpers.
- `QC/lib/extract-actuals.js`: Output normalizer per module so comparisons are stable.

### 3.3 Reports
- `QC/reports/qc-report-YYYY-MM-DD.md`: Generated QC report for each run.

## 4.0 Test Strategy Recommendation
Use QC dataset regression as the primary strategy for now:
1. Build scenario-based QC input data that represents real end-user workflows.
2. Keep a separate expected outputs file with manually calculated verification values.
3. Run the QC runner against all scenarios and compare actual vs expected outputs.
4. Treat mismatches as regressions and document them in the markdown report.

This keeps validation simple, deterministic, and aligned to business outcomes.

## 5.0 Scope Guidance
Keep the QC model simple:
1. Organize all use cases inside `QC/qc-input-data.json` as scenario groups.
2. Group related use cases under each scenario so execution and review stay clear.
3. Expand coverage only when new features, bug fixes, or changed rules require it.
4. Keep expected values manually auditable and versioned with the related feature changes.
5. Choose simple numeric values that are easy to calculate manually and verify quickly.
6. Avoid unnecessarily complex decimals unless a specific edge case requires them.

## 6.0 QC Input Use Case Catalog
This section defines the human-readable use cases to include in `QC/qc-input-data.json`.
Each use case should map to one expected-results entry in `QC/qc-expected-outputs.json`.

### 6.1 Scenario Group A - Baseline Budget Behavior
1. **UC-A1 Salary Income Weekly**
	Transaction: recurring Money In to checking every week.
	Represents: normal paycheck flow and base cash inflow.
2. **UC-A2 Rent Monthly Fixed Expense**
	Transaction: recurring Money Out from checking on monthly due date.
	Represents: mandatory housing cost and fixed obligations.
3. **UC-A3 Groceries Monthly Variable Expense**
	Transaction: recurring Money Out from checking with moderate amount.
	Represents: essential variable living cost.
4. **UC-A4 Utility Bill One-Time Spike**
	Transaction: one-time Money Out in a single period.
	Represents: unexpected but realistic short-term expense shock.
5. **UC-A5 Internal Transfer Checking To Savings**
	Transaction: transfer between two asset accounts.
	Represents: cash movement with no net-worth change.

### 6.2 Scenario Group B - Recurrence Pattern Coverage
1. **UC-B1 Weekly Recurrence On Specific Day**
	Transaction: recurring weekly charge on configured weekday.
	Represents: subscriptions or regular weekly commitments.
2. **UC-B2 Monthly Recurrence On Day Of Month**
	Transaction: recurring monthly event on fixed day.
	Represents: rent, insurance, or standard bill cycles.
3. **UC-B3 Quarterly Recurrence**
	Transaction: recurring quarterly payment.
	Represents: estimated taxes or quarterly fees.
4. **UC-B4 Yearly Recurrence**
	Transaction: recurring yearly expense.
	Represents: annual renewals, memberships, or property fees.
5. **UC-B5 One-Time Transaction**
	Transaction: non-recurring event.
	Represents: purchase, bonus, or ad hoc correction.

### 6.3 Scenario Group C - Periodic Change Coverage
1. **UC-C1 Salary With Annual Percentage Raise**
	Transaction: recurring income with yearly percentage increase.
	Represents: compensation growth over time.
2. **UC-C2 Expense With Annual Inflation Increase**
	Transaction: recurring expense with yearly percentage increase.
	Represents: inflation-adjusted living costs.
3. **UC-C3 Fixed Amount Increase Schedule**
	Transaction: recurring amount with fixed increment each cycle.
	Represents: planned savings step-up or staged contribution plan.
4. **UC-C4 Fixed Amount Decrease Schedule**
	Transaction: recurring amount with fixed decrement each cycle.
	Represents: declining payment plans or tapering obligations.
5. **UC-C5 Account-Level Compounding Growth**
	Transaction setup: account periodic change using rate/compound behavior.
	Represents: savings or investment growth mechanics.

### 6.4 Scenario Group D - Liability and Debt Behavior
1. **UC-D1 Credit Card Interest Accrual**
	Transaction setup: liability account with interest effects across periods.
	Represents: revolving debt cost when balance is carried.
2. **UC-D2 Minimum Payment Flow**
	Transaction: recurring payment from checking to liability account.
	Represents: baseline debt servicing behavior.
3. **UC-D3 Extra Principal Payment**
	Transaction: additional one-time or recurring payment.
	Represents: accelerated payoff strategy.
4. **UC-D4 Debt Repayment Scenario Comparison**
	Scenario setup: debt-focused scenario with planned payment strategy.
	Represents: payoff date and total interest tradeoff analysis.

### 6.5 Scenario Group E - Scenario Type and Horizon Coverage
1. **UC-E1 Budget Scenario Core Flow**
	Scenario type: Budget.
	Represents: strict planning with standard income and expense tracking.
2. **UC-E2 General Scenario What-If Flow**
	Scenario type: General.
	Represents: flexible what-if modeling without budget-grid constraints.
3. **UC-E3 Funds Scenario Shared Pool Flow**
	Scenario type: Funds.
	Represents: pooled assets and ownership-based valuation behavior.
4. **UC-E4 Advanced Goal Solver Flow**
	Scenario type: Advanced Goal Solver.
	Represents: multi-goal plan generation and projection validation.
5. **UC-E5 Horizon Variants**
	Period setup: short, medium, and long windows.
	Represents: sensitivity of outcomes across time horizons.

### 6.6 Scenario Group F - Date Boundary and Integrity Cases
1. **UC-F1 Month-End Boundary Case**
	Transaction timing: recurrence near end of month.
	Represents: date rollover correctness.
2. **UC-F2 Leap-Year Date Case**
	Transaction timing: includes February leap-day handling.
	Represents: calendar correctness for annual and monthly rules.
3. **UC-F3 Year Rollover Case**
	Transaction timing: spans December to January.
	Represents: continuity of projections across calendar years.
4. **UC-F4 Data Isolation Across Scenarios**
	Scenario setup: similar data in two scenarios with different edits.
	Represents: no cross-scenario data contamination.

### 6.7 Totals And Summary Use Cases
These are separate QC use cases, but they are derived from the same scenario input data above.

1. **UC-S1 Scenario Money In Total**
	Source: Scenario Group A and B income transactions.
	Represents: total inflow aggregation correctness per period and full horizon.
2. **UC-S2 Scenario Money Out Total**
	Source: Scenario Group A, B, C, and D expense transactions.
	Represents: total outflow aggregation correctness per period and full horizon.
3. **UC-S3 Scenario Net Total**
	Source: same inputs as UC-S1 and UC-S2.
	Represents: net value correctness where Net = Money In - Money Out.
4. **UC-S4 Account Ending Balance Summary**
	Source: Scenario Groups A, C, and D account plus transaction flows.
	Represents: final projected balance summary per account.
5. **UC-S5 Interest Earned And Interest Paid Totals**
	Source: Scenario Groups C and D with periodic change and liability behavior.
	Represents: aggregate interest tracking correctness in projections and summaries.
6. **UC-S6 Transfer-Neutral Net Worth Check**
	Source: Scenario Group A transfer use case UC-A5.
	Represents: internal transfers do not change total net worth.
7. **UC-S7 Debt Payoff Summary Metrics**
	Source: Scenario Group D debt repayment use cases.
	Represents: payoff date, remaining balance, and total interest summary correctness.
8. **UC-S8 Funds Scenario Summary Metrics**
	Source: Scenario Group E funds scenario use case UC-E3.
	Represents: NAV, share price, and ownership summary correctness.
9. **UC-S9 Goal Solver Plan Summary Metrics**
	Source: Scenario Group E advanced goal solver use case UC-E4.
	Represents: generated-plan totals and projection summary consistency.
10. **UC-S10 Period Filter Summary Consistency**
	Source: Scenario Groups E and F with different horizon and boundary cases.
	Represents: totals and summaries remain correct when changing period filters.

### 6.8 Reporting Expectations Per Use Case
1. Each use case must have a stable `useCaseId` and clear business label.
2. Each expected output must define the key verification fields for that use case.
3. QC report output must show pass or fail by `useCaseId` and include mismatch details.
4. Expected outputs must also include all relevant totals and summary values produced by the application.
5. Totals and summaries should be QC validated using the same input use cases, not a separate dataset.
