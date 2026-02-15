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

## 3.0 Planned QC Files and Purpose
### 3.1 Core Data Files
- `QC/qc-input-data.json`: Scenario, account, and transaction source data for all QC use cases.
- `QC/qc-expected-outputs.json`: Assertions by scenario and by use case id.

### 3.2 Shared Utilities
- `QC/lib/load-qc-data.js`: Loads input and expected data.
- `QC/lib/extract-actuals.js`: Produces normalized actual values from module outputs.
- `QC/lib/compare-results.js`: Compares actual vs expected with tolerance support.
### 3.3 Scenario-Type QC Test Files
Each scenario-type file should do only these steps:
1. Get generated actual values from the relevant application modules.
2. Compare actual values to expected values for mapped use cases.
3. Return pass or fail results with mismatch details.

| Scenario Type | Test File | Input Selection | Use Case Scope |
|---|---|---|---|
| Budget | `QC/tests/scenario-types/budget.test.js` | Scenario type `Budget` from `qc-input-data.json` | `UC-A*`, `UC-E1`, plus Budget summary assertions |
| General | `QC/tests/scenario-types/general.test.js` | Scenario type `General` from `qc-input-data.json` | `UC-B*`, `UC-C*`, `UC-F*`, `UC-E2`, plus General summary assertions |
| Funds | `QC/tests/scenario-types/funds.test.js` | Scenario type `Funds` from `qc-input-data.json` | `UC-E3`, plus Funds summary assertions |
| Debt Repayment | `QC/tests/scenario-types/debt-repayment.test.js` | Scenario type `Debt Repayment` from `qc-input-data.json` | `UC-D*`, plus Debt summary assertions |
| Goal-Based | `QC/tests/scenario-types/goal-based.test.js` | Scenario type `Goal-Based` from `qc-input-data.json` | Goal-based scenario assertions |
| Advanced Goal Solver | `QC/tests/scenario-types/advanced-goal-solver.test.js` | Scenario type `Advanced Goal Solver` from `qc-input-data.json` | `UC-E4`, plus solver summary assertions |

### 3.4 Universal Actions In Every Scenario-Type File
Universal checks are included by import and execution inside each scenario-type file, not as separate runner files.

- `QC/tests/universal/recurrence-assertions.js`: Shared recurrence checks.
- `QC/tests/universal/periodic-change-assertions.js`: Shared periodic change checks.
- `QC/tests/universal/date-boundary-assertions.js`: Shared date-boundary checks.

### 3.5 Script-Based QC Execution
Use scripts in project configuration (`package.json`) for scenario-type execution instead of dedicated runner files.

- `qc:test:budget` -> runs `QC/tests/scenario-types/budget.test.js`
- `qc:test:general` -> runs `QC/tests/scenario-types/general.test.js`
- `qc:test:funds` -> runs `QC/tests/scenario-types/funds.test.js`
- `qc:test:debt` -> runs `QC/tests/scenario-types/debt-repayment.test.js`
- `qc:test:goal-based` -> runs `QC/tests/scenario-types/goal-based.test.js`
- `qc:test:advanced-goal-solver` -> runs `QC/tests/scenario-types/advanced-goal-solver.test.js`
- `qc:test:all-scenario-types` -> runs all scenario-type scripts

### 3.6 Use Case Mapping File
- `QC/mappings/use-case-to-scenario-type.json`: Declares use case ids per scenario type, including summary assertions.

### 3.7 Reporting Files
- `QC/reports/qc-report-YYYY-MM-DD.md`: Human-readable combined report.
- `QC/reports/qc-report-<scenario-type>-YYYY-MM-DD.md`: Scenario-type specific report.

### 3.8 Execution Rule
For every scenario-type run, execute:
1. Universal assertion actions inside the scenario-type test file.
2. Scenario-type specific extraction and comparison.
3. Unified report generation with pass/fail by use case id.

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
This section is the single structured mapping for all QC use cases in `QC/qc-input-data.json` and expected assertions in `QC/qc-expected-outputs.json`.

### 6.1 Unified Use Case Mapping Grid
| Use Case ID | Category | Scenario Type | Scenario-Type Test File | Input Group | Input Setup Summary | Expected Assertion Focus |
|---|---|---|---|---|---|---|
| `UC-A1` | Core Flow | Budget | `QC/tests/scenario-types/budget.test.js` | A | Recurring weekly Money In to checking | Salary inflow recurrence and ending balance effect |
| `UC-A2` | Core Flow | Budget | `QC/tests/scenario-types/budget.test.js` | A | Recurring monthly rent expense | Fixed obligation outflow and ending balance effect |
| `UC-A3` | Core Flow | Budget | `QC/tests/scenario-types/budget.test.js` | A | Recurring monthly grocery expense | Variable essential outflow and ending balance effect |
| `UC-A4` | Core Flow | Budget | `QC/tests/scenario-types/budget.test.js` | A | One-time utility expense spike | One-time shock handling and projection impact |
| `UC-A5` | Core Flow | Budget | `QC/tests/scenario-types/budget.test.js` | A | Internal transfer between asset accounts | Transfer handling and net-worth neutrality inputs |
| `UC-B1` | Recurrence | General | `QC/tests/scenario-types/general.test.js` | B | Weekly recurrence on specific day | Weekly schedule expansion correctness |
| `UC-B2` | Recurrence | General | `QC/tests/scenario-types/general.test.js` | B | Monthly day-of-month recurrence | Monthly schedule expansion correctness |
| `UC-B3` | Recurrence | General | `QC/tests/scenario-types/general.test.js` | B | Quarterly recurrence | Quarterly schedule expansion correctness |
| `UC-B4` | Recurrence | General | `QC/tests/scenario-types/general.test.js` | B | Yearly recurrence | Yearly schedule expansion correctness |
| `UC-B5` | Recurrence | General | `QC/tests/scenario-types/general.test.js` | B | One-time transaction | One-time occurrence handling |
| `UC-C1` | Periodic Change | General | `QC/tests/scenario-types/general.test.js` | C | Income with annual percentage raise | Percentage periodic change on transactions |
| `UC-C2` | Periodic Change | General | `QC/tests/scenario-types/general.test.js` | C | Expense with annual inflation increase | Percentage periodic change on expenses |
| `UC-C3` | Periodic Change | General | `QC/tests/scenario-types/general.test.js` | C | Fixed amount increase schedule | Fixed-amount periodic increase behavior |
| `UC-C4` | Periodic Change | General | `QC/tests/scenario-types/general.test.js` | C | Fixed amount decrease schedule | Fixed-amount periodic decrease behavior |
| `UC-C5` | Periodic Change | General | `QC/tests/scenario-types/general.test.js` | C | Account-level compounding setup | Account periodic change compounding behavior |
| `UC-D1` | Debt Behavior | Debt Repayment | `QC/tests/scenario-types/debt-repayment.test.js` | D | Liability account with interest behavior | Debt interest accrual handling |
| `UC-D2` | Debt Behavior | Debt Repayment | `QC/tests/scenario-types/debt-repayment.test.js` | D | Recurring minimum payment | Baseline debt servicing flow |
| `UC-D3` | Debt Behavior | Debt Repayment | `QC/tests/scenario-types/debt-repayment.test.js` | D | Extra principal payment | Accelerated payoff behavior |
| `UC-D4` | Debt Behavior | Debt Repayment | `QC/tests/scenario-types/debt-repayment.test.js` | D | Combined debt repayment strategy | Payoff and interest tradeoff behavior |
| `UC-E1` | Scenario Type | Budget | `QC/tests/scenario-types/budget.test.js` | E | Budget scenario configuration | Budget-type extraction and comparison flow |
| `UC-E2` | Scenario Type | General | `QC/tests/scenario-types/general.test.js` | E | General scenario configuration | General-type extraction and comparison flow |
| `UC-E3` | Scenario Type | Funds | `QC/tests/scenario-types/funds.test.js` | E | Funds scenario configuration | Funds-type extraction and comparison flow |
| `UC-E4` | Scenario Type | Advanced Goal Solver | `QC/tests/scenario-types/advanced-goal-solver.test.js` | E | Advanced Goal Solver configuration | Solver-type extraction and comparison flow |
| `UC-E5` | Scenario Type | General | `QC/tests/scenario-types/general.test.js` | E | Short, medium, long horizon variants | Horizon sensitivity and period-span handling |
| `UC-F1` | Date Boundary | General | `QC/tests/scenario-types/general.test.js` | F | Month-end recurrence case | Month-end rollover correctness |
| `UC-F2` | Date Boundary | General | `QC/tests/scenario-types/general.test.js` | F | Leap-year date recurrence case | Leap-year recurrence correctness |
| `UC-F3` | Date Boundary | General | `QC/tests/scenario-types/general.test.js` | F | Year rollover one-time case | Year boundary continuity correctness |
| `UC-F4` | Data Integrity | General | `QC/tests/scenario-types/general.test.js` | F | Similar scenarios with edited values | Cross-scenario data isolation correctness |
| `UC-S1` | Summary | Budget, General | `budget.test.js`, `general.test.js` | A, B | Income transactions aggregated from mapped inputs | Scenario Money In totals |
| `UC-S2` | Summary | Budget, General | `budget.test.js`, `general.test.js` | A, B, C, D | Expense transactions aggregated from mapped inputs | Scenario Money Out totals |
| `UC-S3` | Summary | Budget, General | `budget.test.js`, `general.test.js` | A, B, C, D | Derived from UC-S1 and UC-S2 | Scenario Net totals |
| `UC-S4` | Summary | Budget, General, Debt Repayment, Goal-Based | `budget.test.js`, `general.test.js`, `debt-repayment.test.js`, `goal-based.test.js` | A, C, D | Account ending balances across mapped scenarios | Ending balance summary by account |
| `UC-S5` | Summary | General, Debt Repayment | `general.test.js`, `debt-repayment.test.js` | C, D | Interest effects from periodic changes and liabilities | Interest earned and paid totals |
| `UC-S6` | Summary | Budget | `QC/tests/scenario-types/budget.test.js` | A | Transfer use case from UC-A5 | Transfer-neutral net-worth assertion |
| `UC-S7` | Summary | Debt Repayment | `QC/tests/scenario-types/debt-repayment.test.js` | D | Debt repayment scenario aggregates | Debt payoff summary metrics |
| `UC-S8` | Summary | Funds | `QC/tests/scenario-types/funds.test.js` | E | Funds scenario summary aggregates | NAV and share-related summary values |
| `UC-S9` | Summary | Advanced Goal Solver | `QC/tests/scenario-types/advanced-goal-solver.test.js` | E | Solver plan and projection aggregates | Solver plan summary consistency |
| `UC-S10` | Summary | General | `QC/tests/scenario-types/general.test.js` | E, F | Period and boundary scenario aggregates | Period filter summary consistency |

### 6.2 Reporting Expectations Per Use Case
1. Each use case must have a stable `useCaseId` and clear business label.
2. Each expected output must define the key verification fields for that use case.
3. QC report output must show pass or fail by `useCaseId` and include mismatch details.
4. Expected outputs must also include all relevant totals and summary values produced by the application.
5. Totals and summaries should be QC validated using the same input use cases, not a separate dataset.

