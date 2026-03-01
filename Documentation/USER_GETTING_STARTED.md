# Getting Started

## 1.0 Getting Started

A budget is your financial roadmap. It helps you plan income and expenses so you can forecast cash flow and compare “baseline vs what-if” versions side-by-side.

## 1.1 Key Concepts (fast)

- **Scenario**: a version of your data (accounts, planned transactions, optional budgets, last projections).
- **Workflow**: a Forecast UI preset (left navigation) that shows the cards you need (Budget, Summary, Generate Plan, etc.).
- **Projection window**: Start/End/Period Type on the scenario row. Projections generate over this window.

## 1.2 Step-by-Step: Build Your First Forecast

1. **Go to Forecast**.
2. **Pick a workflow** (left nav):
   - **Budget** for plan vs actual and budget tooling
   - **General** for lightweight planning with summary totals
3. **Add a scenario**: Click **+ Add New** and name it (for example, “Baseline 2026”).
4. **Set the projection window** on the scenario row:
   - **Start**, **End**, and **Period Type** (Month is typical).
5. **Add your accounts**: Checking, Savings, Credit Card, etc. Enter starting balances.
3. **Add your income**: Create a Planned Transaction for your paycheck. Set it to recur weekly or monthly depending on your pay schedule.
4. **Add your expenses**: Add Planned Transactions for recurring expenses like rent, utilities, groceries, and subscriptions. Use recurrence for monthly or weekly bills.
5. **Configure recurrence**: For repeating payments, set them to recur on the correct day each week or month.
6. **Run projections**: Click **Generate Projections** to calculate balances over your projection window.
7. **Review and adjust**: Look at the projection. If your balance goes negative, adjust your spending or add more income until it looks sustainable.
8. **Save your plan**: Your budget is automatically saved. You can now track it and compare it to actual spending.

## 1.3 Pro Tips For Beginners

- **Start simple**: Do not worry about every small expense. Focus on the big items first such as rent, paycheck, major bills.
- **Keep one baseline**: Always have one scenario that matches reality. Use it to compare what-if scenarios against.
- **Recurrence is your friend**: Most expenses are monthly or weekly. Use recurrence so you do not have to enter each payment manually.
- **Log actuals regularly**: Once a week, mark transactions as actual to see how your real spending compares to your plan.
- **Adjust as needed**: Your budget is not set in stone. Update it when your situation changes such as raise, new expense.

## 1.4 Quick Start Overview

1. Open Forecast to select or create a scenario.
2. Review Accounts and update opening balances.
3. Add Planned Transactions for income and recurring expenses.
4. Generate Projections to see future balances.
5. Log Actual Transactions to keep forecasts accurate.

## 1.5 Troubleshooting

### 1.5.1 I can’t see Budget / Generate Plan

Workflows control which cards appear.

- Choose **Budget** to see the Budget card (and actuals tooling).
- Choose **Goal-Based** or **Advanced Goal Solver** to see Generate Plan.

### 1.5.2 Projections are blank

Generate projections for the selected scenario, and confirm the scenario row has Start/End/Period Type set.

### 1.5.3 Import fails

Import requires a current FTrack export (schemaVersion 43). If you have an older export, migrate it using the standalone migration tool (`QC/migrate-app-data-to-schema43.js`) before importing.
