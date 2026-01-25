# FTrack User Features

**Version**: 1.0.0  
**Last Updated**: January 11, 2026  
**Purpose**: Complete list of implemented user functionality

---

## 1.0 Scenario Management

1.1 Create new financial scenarios  
1.2 Edit scenario properties (name, type, description, dates, frequency)  
1.3 Delete scenarios  
1.4 Select active scenario from dropdown  
1.5 Set scenario type: Budget, General, or Funds  
1.6 Define scenario date range (start/end)  
1.7 Set scenario frequency (Weekly, Monthly, Quarterly, Yearly)

## 2.0 Account Management

2.1 Create new accounts within a scenario  
2.2 Edit account details (name, account number, type, balance)  
2.3 Delete accounts  
2.4 Set account types (Cash, Checking, Savings, Credit Card, etc.)  
2.5 Set opening balance for each account  
2.6 View all accounts in tabular format

## 3.0 Planned Transactions

3.1 Create planned transactions (income/expenses)  
3.2 Edit planned transaction details  
3.3 Delete planned transactions  
3.4 Set transaction type: Money Out or Money In  
3.5 Assign secondary account for double-entry bookkeeping  
3.6 Set transaction amount and description  
3.7 Configure recurrence patterns:  
  - 3.7.1 One-time transaction  
  - 3.7.2 Weekly (specific days of week)  
  - 3.7.3 Monthly (specific day of month or nth weekday)  
  - 3.7.4 Quarterly (same as monthly)  
  - 3.7.5 Yearly (specific month and day)  
3.8 Configure periodic changes (amount adjustments over time):  
  - 3.8.1 Flat increase/decrease  
  - 3.8.2 Percentage increase/decrease  
  - 3.8.3 Compound interest  
3.9 View master list of all planned transactions  
3.10 Filter planned transactions by period

## 4.0 Actual Transactions

4.1 View actual transactions by period  
4.2 Add actual transactions to specific periods  
4.3 Edit actual transaction details  
4.4 Delete actual transactions  
4.5 Navigate between periods (previous/next)  
4.6 Compare actual vs planned transactions

## 5.0 Projections

5.1 Generate financial projections for selected scenario  
5.2 View projected account balances over time  
5.3 Clear existing projections  
5.4 View projections in tabular format  
5.5 See projections based on planned transactions and recurrence patterns

## 6.0 User Interface

6.1 Navigate between pages using top navigation bar  
6.2 Expand/collapse sections using accordions  
6.3 View data in responsive tables  
6.4 Add rows inline with "Add Row" button  
6.5 Edit rows inline with edit icon  
6.6 Delete rows with delete icon  
6.7 Save/cancel edits with action buttons  
6.8 Select rows with radio buttons  
6.9 Open modal dialogs for complex data (recurrence, periodic change)

## 7.0 Keyboard Shortcuts

7.1 Save row: **Enter**  
7.2 Delete row: **Delete**  
7.3 Add new row: **Cmd+Shift+A** (Mac) or **Ctrl+Shift+A** (Windows)  
7.4 Open settings: **Cmd+,** (Mac) or **Ctrl+,** (Windows)

## 8.0 Data Management

8.1 Automatic data persistence to local JSON file  
8.2 Load existing data on application startup  
8.3 First-run initialization with sample data  
8.4 Schema-driven data validation  
8.5 Automatic backup on save operations

## 9.0 Visual Feedback

9.1 Visual indicators for editable fields  
9.2 Loading spinners for long operations  
9.3 Color-coded icons for different actions  
9.4 Hover effects on interactive elements  
9.5 Active row highlighting with selection

## 10.0 Data Integrity

10.1 Required field validation  
10.2 Type-specific input validation (dates, numbers, text)  
10.3 Dropdown constraints for categorical data  
10.4 Automatic ID generation for new records  
10.5 Conditional field visibility based on scenario type  
10.6 Cross-reference validation between accounts and transactions

---

**Applied Rules**: 1.0, 1.1, 2.0, 5.5, 6.1, 6.4
