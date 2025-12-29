# FTrack Requirements

**Version**: 1.0.0  
**Last Updated**: December 25, 2025

---

## 1. Alpha Requirements

1.1. Data Grid Edit Items
&nbsp;&nbsp;&nbsp;&nbsp;~~1.1.1. Improve accounts page with Excel-like shortcuts and navigation~~
&nbsp;&nbsp;&nbsp;&nbsp;~~1.1.2. Rename budget/budget builder references to financial forecast~~
&nbsp;&nbsp;&nbsp;&nbsp;~~1.1.3. Make transactions grid work like accounts with Excel-like navigation~~

1.2. Wrap up current data snapshot overview on home page
~~1.3. Allow basic named accounts to be added directly from transactions~~

1.3.1. Separate grid definitions (assets) from user data
&nbsp;&nbsp;&nbsp;&nbsp;Grid schemas/definitions are application assets that ship with the app
&nbsp;&nbsp;&nbsp;&nbsp;User data is specific to each user and stored separately
&nbsp;&nbsp;&nbsp;&nbsp;Ensures clean separation between code/config and user-generated content

1.4. Forecast Template Interface (Budget Input Grid)
&nbsp;&nbsp;&nbsp;&nbsp;1.4.1. Create forecast template interface for setting up accounts with transactions
&nbsp;&nbsp;&nbsp;&nbsp;1.4.2. Support listing incomes and expenses in forecast template
&nbsp;&nbsp;&nbsp;&nbsp;1.4.3. Enable forecast template creation for one or multiple time periods
&nbsp;&nbsp;&nbsp;&nbsp;1.4.4. Support date-range-based templates between specific dates
&nbsp;&nbsp;&nbsp;&nbsp;1.4.5. Allow quick account and transaction addition through budget interface
&nbsp;&nbsp;&nbsp;&nbsp;1.4.6. Support single account view or overview with all accounts for budget
&nbsp;&nbsp;&nbsp;&nbsp;1.4.7. Save budget/template separately from forecast

1.5. Forecast Generation & Calculation Engine
&nbsp;&nbsp;&nbsp;&nbsp;1.5.1. Use forecast template to predict account balances and forecast financial future
&nbsp;&nbsp;&nbsp;&nbsp;1.5.2. Auto-generate forecast from budget for dynamic time frames
&nbsp;&nbsp;&nbsp;&nbsp;1.5.3. Consider interest, recurring transactions, and one-off transactions in budget and forecast
&nbsp;&nbsp;&nbsp;&nbsp;1.5.4. Build rollover/carryover logic for unused budget amounts into accounts
&nbsp;&nbsp;&nbsp;&nbsp;1.5.5. Track account balance before time frame before applying time frame transactions

1.6. Budget Tracking & Validation
&nbsp;&nbsp;&nbsp;&nbsp;1.6.1. Track actuals by flagging transactions as completed or not completed for current month
&nbsp;&nbsp;&nbsp;&nbsp;1.6.2. Show total money still needed for month to cover remaining expenses
&nbsp;&nbsp;&nbsp;&nbsp;1.6.3. Validate transactions specific to a budget
&nbsp;&nbsp;&nbsp;&nbsp;1.6.4. Classify accounts as transfers vs incomes vs expenses

1.7. Account Linking & Transaction Flow
&nbsp;&nbsp;&nbsp;&nbsp;1.7.1. Link accounts so transactions always move value from one account to another

1.8. Build and wrap up financial planning

---

## 2. Beta Requirements

2.1. Track account transactions and forecast history
2.2. Ensure multiple screen sizes work
2.3. Support different types of budgets each with their own forecast
2.4. Duplicate or clone existing budgets
2.5. Actual vs budget variance reporting
2.6. Archive or version budgets for historical tracking
2.7. Build fund management as part of budget/financial forecast system
2.8. Track investor deposits and withdrawals as transactions within fund budgets
2.9. Calculate NAV as part of forecast engine for fund budgets
2.10. Calculate investor share positions from transaction history
2.11. Support fund expense tracking within fund budgets
2.12. Generate fund performance reports from forecast snapshots
2.13. Add calculator module for financial calculations

---

## 3. Later

3.1. Budget templates
3.2. Import actual transactions into budget for reconciliation
3.3. Alerts when actuals exceed budget thresholds
