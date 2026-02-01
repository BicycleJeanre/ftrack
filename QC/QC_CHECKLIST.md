# Quality Control Checklist

**Version**: 2.0.0  
**Last Updated**: February 1, 2026  

---

## Overview

| Category | Total Items | Completed | Remaining | Progress | Impact | Status |
|----------|-------------|-----------|-----------|----------|--------|--------|
| [Scenarios](#10-scenarios) | 17 | 15 | 2 | 88% | 🔴 Critical | ⚠️ Minor gaps |
| [Accounts](#20-accounts) | 40 | 23 | 17 | 58% | 🔴 Critical | ⚠️ Needs attention |
| [Transactions](#30-transactions) | 74 | 16 | 58 | 22% | 🔴 Critical | 🔴 High priority |
| [Budgets](#40-budgets) | 21 | 4 | 17 | 19% | 🟡 High | 🔴 High priority |
| [Projections](#50-projection) | 11 | 9 | 2 | 82% | 🔴 Critical | ⚠️ Minor gaps |
| [Data Management](#60-data-management) | 20 | 13 | 7 | 65% | 🟡 High | ⚠️ Needs attention |
| [Keyboard Shortcuts](#70-keyboard-shortcuts) | 12 | 0 | 12 | 0% | 🟢 Low | 🔵 Not started |
| [Totals & Calculations](#80-totals-and-calculations) | 10 | 10 | 0 | 100% | 🔴 Critical | ✅ Complete |
| **TOTAL** | **205** | **90** | **115** | **44%** | - | **In Progress** |

### Legend
- **Impact**: 🔴 Critical (core functionality) | 🟡 High (important features) | 🟢 Low (nice-to-have)
- **Status**: ✅ Complete | ⚠️ Minor gaps | 🔴 High priority | 🔵 Not started

---

## 1.0 Scenarios

### 1.1 Create/Add/New 🔴 Critical
- [x] Create new scenario
- [x] Verify scenario name is saved correctly
- [x] Verify scenario appears in scenario list

### 1.2 Edit 🔴 Critical
- [x] Edit scenario name
- [x] Edit scenario settings
- [x] Verify changes are saved

### 1.3 Duplicate 🟡 High
- [x] Duplicate scenario
- [x] Verify new scenario name is set correctly (includes "(Copy)")
- [x] Verify all accounts are duplicated
- [ ] Verify all transactions are duplicated
- [ ] Verify all budgets are duplicated
- [ ] Verify projections are NOT duplicated (reset to empty)
- [x] Verify duplicate scenario can be edited independently

### 1.4 Delete 🔴 Critical
- [x] Delete scenario
- [x] Verify scenario is removed from list
- [x] Verify data integrity after deletion

---

## 2.0 Accounts

### 2.1 Create/Add/New 🔴 Critical
- [x] Create new account
- [x] Verify account name is saved correctly
- [x] Verify account appears in account list
- [ ] Verify account type is set correctly (not setting default Yet)

### 2.2 Edit 🔴 Critical
- [x] Edit account name
- [x] Edit account type
- [x] Edit account settings
- [x] Verify changes are saved

### 2.3 Delete 🔴 Critical
- [x] Delete account
- [x] Verify account is removed from list
- [ ] Verify associated transactions are handled correctly
- [x] Verify data integrity after deletion

### 2.4 Periodic Change 🟡 High

#### 2.4.1 Percentage Rate Mode
- [x] Set percentage rate mode on account
- [x] Test with nominal annual (no compounding)
- [x] Test with compounded monthly
- [x] Test with compounded daily
- [x] Test with compounded quarterly
- [x] Test with compounded annually
- [x] Test with continuous compounding
- [x] Test with custom compounding (various frequencies and periods)
- [ ] Test with small percentage (e.g., 0.5%)
- [x] Test with medium percentage (e.g., 3%)
- [ ] Test with large percentage (e.g., 15%)
- [ ] Test with negative percentage (decline)
- [ ] Test with decimal percentages (e.g., 3.75%)

#### 2.4.2 Fixed Amount Mode
- [x] Set fixed amount mode on account
- [x] Test with daily frequency
- [x] Test with weekly frequency (with/without specific day)
- [x] Test with monthly frequency (with/without specific day)
- [x] Test with quarterly frequency
- [x] Test with yearly frequency
- [ ] Test with various dollar amounts (small, medium, large, negative, decimal)

#### 2.4.3 Clear and Persistence
- [x] Clear periodic change from account
- [x] Verify account periodic change persists after save
- [ ] Verify periodic change affects account projections correctly
- [x] Verify periodic change description displays correctly

---

## 3.0 Transactions

### 3.1 Create/Add/New 🔴 Critical
- [x] Create new transaction
- [x] Verify transaction data is saved correctly
- [x] Verify transaction appears in transaction list
- [x] Verify transaction affects account balances correctly

### 3.2 Edit 🔴 Critical
- [x] Edit transaction amount
- [ ] Edit transaction date
- [x] Edit transaction account
- [x] Edit transaction description
- [x] Verify changes update calculations correctly

### 3.3 Delete 🔴 Critical
- [x] Delete transaction
- [x] Verify transaction is removed from list
- [x] Verify account balances update correctly
- [x] Verify data integrity after deletion

### 3.4 Periodic Change 🟡 High

#### 3.4.1 Percentage Rate Mode
- [ ] Set percentage rate mode on transaction
- [ ] Test with nominal annual (no compounding)
- [ ] Test with compounded monthly
- [ ] Test with compounded daily
- [ ] Test with compounded quarterly
- [ ] Test with compounded annually
- [ ] Test with continuous compounding
- [ ] Test with custom compounding (various frequencies and periods)
- [ ] Test with small percentage (e.g., 0.5%)
- [ ] Test with medium percentage (e.g., 3%)
- [ ] Test with large percentage (e.g., 15%)
- [ ] Test with negative percentage (decline)
- [ ] Test with decimal percentages (e.g., 3.75%)

#### 3.4.2 Fixed Amount Mode
- [ ] Set fixed amount mode on transaction
- [ ] Test with daily frequency
- [ ] Test with weekly frequency (with/without specific day)
- [ ] Test with monthly frequency (with/without specific day)
- [ ] Test with quarterly frequency
- [ ] Test with yearly frequency
- [ ] Test with various dollar amounts (small, medium, large, negative, decimal)

#### 3.4.3 Clear and Persistence
- [ ] Clear periodic change from transaction
- [ ] Verify transaction periodic change persists after save
- [ ] Verify periodic change affects transaction projections correctly
- [ ] Verify periodic change description displays correctly

### 3.5 Recurrence 🔴 Critical

#### 3.5.1 One Time
- [x] Set one time recurrence
- [x] Set specific start date
- [x] Verify transaction appears once on specified date
- [x] Verify description displays correctly

#### 3.5.2 Daily
- [ ] Set daily recurrence with interval 1
- [ ] Set daily recurrence with interval > 1 (e.g., every 2 days)
- [ ] Set end date (optional)
- [ ] Verify transactions appear on correct dates
- [ ] Verify description displays correctly

#### 3.5.3 Weekly
- [ ] Set weekly recurrence with interval 1
- [ ] Set weekly recurrence with interval > 1 (e.g., every 2 weeks)
- [ ] Set specific day of week
- [ ] Set end date (optional)
- [ ] Verify transactions appear on correct days
- [ ] Verify description displays correct day name

#### 3.5.4 Monthly - Day of Month
- [x] Set monthly recurrence with interval 1
- [ ] Set monthly recurrence with interval > 1 (e.g., every 2 months)
- [x] Set specific day of month (1-31)
- [ ] Test with day 31 in months with fewer days
- [ ] Set end date (optional)
- [ ] Verify transactions appear on correct dates
- [x] Verify description displays correct day number

#### 3.5.5 Monthly - Week of Month
- [ ] Set monthly recurrence by week of month
- [ ] Set specific week (1st, 2nd, 3rd, 4th, last)
- [ ] Set specific day of week
- [ ] Verify transactions appear on correct dates
- [ ] Verify description displays correctly

#### 3.5.6 Quarterly
- [ ] Set quarterly recurrence with interval 1
- [ ] Set quarterly recurrence with interval > 1
- [ ] Set specific day of month (optional)
- [ ] Set end date (optional)
- [ ] Verify transactions appear quarterly
- [ ] Verify description displays correctly

#### 3.5.7 Yearly
- [ ] Set yearly recurrence with interval 1
- [ ] Set yearly recurrence with interval > 1
- [ ] Verify anchor date is used (month and day)
- [ ] Set end date (optional)
- [ ] Verify transactions appear annually
- [ ] Verify description displays correct date

#### 3.5.8 Custom Dates
- [ ] Set custom dates recurrence
- [ ] Add multiple specific dates
- [ ] Verify transactions appear on each custom date
- [ ] Verify count displays correctly in description

#### 3.5.9 Clear and Persistence
- [x] Clear recurrence from transaction
- [x] Verify recurrence persists after save
- [x] Verify recurrence description displays correctly
- [ ] Verify recurrence affects projections correctly

### 3.6 Tags 🟢 Low
- [ ] Add tags to transaction
- [ ] Add multiple tags
- [ ] Verify tags display correctly
- [ ] Verify tags persist after save
- [ ] Remove tags from transaction

---

## 4.0 Budgets

### 4.1 Create/Add/New 🟡 High
- [x] Create new budget
- [x] Verify budget data is saved correctly
- [x] Verify budget appears in budget list
- [ ] Verify budget affects calculations correctly

### 4.2 Edit 🟡 High
- [ ] Edit budget amount
- [ ] Edit budget period
- [ ] Edit budget category
- [ ] Edit budget description
- [ ] Edit budget status (planned/actual)
- [ ] Edit actual amount (when status is actual)
- [ ] Edit actual date (when status is actual)
- [ ] Verify changes update forecasts correctly

### 4.3 Delete 🟡 High
- [x] Delete budget
- [x] Verify budget is removed from list
- [ ] Verify forecasts update correctly
- [ ] Verify data integrity after deletion

### 4.4 Generate from Projection 🟡 High
- [ ] Generate budget from projection
- [ ] Verify all projected transactions are converted to budget items
- [ ] Verify budget dates match projection dates
- [ ] Verify budget amounts match projection amounts
- [ ] Verify recurrence descriptions are preserved
- [ ] Verify budget can be edited after generation

### 4.5 Tags 🟢 Low
- [ ] Add tags to budget item
- [ ] Add multiple tags
- [ ] Verify tags display correctly
- [ ] Verify tags persist after save
- [ ] Remove tags from budget item

---

## 5.0 Projection

### 5.1 Generate 🔴 Critical
- [x] Generate projection
- [x] Verify projection calculations are accurate
- [x] Verify projection appears in projection view
- [ ] Verify projection date range is correct
- [x] Verify recurrence patterns create correct occurrences
- [ ] Verify periodic changes are applied correctly
- [x] Verify account balances update correctly over time
- [x] Verify totals (Money In, Money Out, Net) are calculated correctly

### 5.2 Remove 🔴 Critical
- [x] Remove projection
- [x] Verify projection is cleared from view
- [x] Verify data integrity after removal

### 5.3 Save as Budget 🟡 High
- [x] Save projection as budget
- [x] Verify budget is created correctly
- [x] Verify budget data matches projection
- [x] Verify budget appears in budget list

---

## 6.0 Data Management

### 6.1 Export 🟡 High
- [x] Export data to JSON file
- [x] Verify export filename includes date
- [x] Verify exported file contains all scenarios
- [x] Verify exported file contains all accounts
- [x] Verify exported file contains all transactions
- [x] Verify exported file contains all budgets
- [x] Verify exported file is valid JSON
- [ ] Test export in Electron (save dialog)
- [x] Test export in web browser (download)

### 6.2 Import 🟡 High
- [x] Import data from JSON file (replace mode)
- [x] Verify all data is replaced
- [x] Verify application reloads after import
- [x] Verify imported data displays correctly
- [ ] Test import in Electron (open dialog)
- [x] Test import in web browser (file picker)
- [ ] Test with invalid JSON file (error handling)
- [ ] Test with corrupted data (error handling)

### 6.3 Clear Data (Web Only) 🟡 High
- [x] Click clear data button
- [x] Verify confirmation dialog appears
- [x] Confirm clearing data
- [x] Verify all data is removed from localStorage
- [x] Verify application reloads
- [x] Cancel clear operation and verify data remains

### 6.4 Data Migration 🔴 Critical
- [x] Test migration from old transaction format to new
- [ ] Verify plannedTransactions and actualTransactions merge to transactions
- [ ] Verify budgets array is created if missing
- [ ] Verify account balance field migration
- [ ] Verify migration version is tracked correctly
- [ ] Verify migration only runs when needed

---

## 7.0 Keyboard Shortcuts

### 7.1 Navigation 🟢 Low
- [ ] Ctrl+1 to focus scenarios
- [ ] Ctrl+2 to focus accounts
- [ ] Ctrl+3 to focus transactions
- [ ] Ctrl+4 to focus projections

### 7.2 Actions 🟢 Low
- [ ] Ctrl+N to add new row
- [ ] Delete to remove selected rows
- [ ] Ctrl+S to save changes
- [ ] Ctrl+G to generate projections
- [ ] Ctrl+C to copy to clipboard
- [ ] ? to show shortcuts help

### 7.3 Help 🟢 Low
- [ ] Show shortcuts help dialog
- [ ] Verify all shortcuts are listed
- [ ] Verify descriptions are clear
- [ ] Close help dialog

---

## 8.0 Totals and Calculations

### 8.1 Transaction Totals 🔴 Critical
- [x] Verify Money In total is calculated correctly
- [x] Verify Money Out total is calculated correctly
- [x] Verify Net total is calculated correctly (Money In - Money Out)
- [x] Verify totals update when transactions change
- [x] Verify currency formatting is correct

### 8.2 Projection Totals 🔴 Critical
- [x] Verify projection totals display for each period
- [x] Verify totals include all transaction types
- [x] Verify totals include recurrence occurrences
- [x] Verify totals include periodic change applications
- [x] Verify totals update when projection regenerates

---

## Notes

- Check all operations across different scenarios
- Verify data persistence after application restart
- Test edge cases (empty values, special characters, etc.)
- Verify UI updates reflect data changes
- Check console for errors during all operations
- Test both Electron and web browser environments where applicable
- Verify all modal dialogs display and function correctly
- Test keyboard shortcuts don't interfere with normal typing
