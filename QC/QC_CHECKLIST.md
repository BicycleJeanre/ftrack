# Quality Control Checklist

**Version**: 2.0.0  
**Last Updated**: February 1, 2026  

---

## 1.0 Scenarios

### 1.1 Create/Add/New
- [x] Create new scenario
- [x] Verify scenario name is saved correctly
- [x] Verify scenario appears in scenario list

### 1.2 Edit
- [x] Edit scenario name
- [x] Edit scenario settings
- [x] Verify changes are saved

### 1.3 Duplicate
- [x] Duplicate scenario
- [x] Verify new scenario name is set correctly (includes "(Copy)")
- [x] Verify all accounts are duplicated
- [ ] Verify all transactions are duplicated
- [ ] Verify all budgets are duplicated
- [ ] Verify projections are NOT duplicated (reset to empty)
- [x] Verify duplicate scenario can be edited independently

### 1.4 Delete
- [x] Delete scenario
- [x] Verify scenario is removed from list
- [x] Verify data integrity after deletion

---

## 2.0 Accounts

### 2.1 Create/Add/New
- [x] Create new account
- [x] Verify account name is saved correctly
- [x] Verify account appears in account list
- [ ] Verify account type is set correctly (not setting default Yet)

### 2.2 Edit
- [x] Edit account name
- [x] Edit account type
- [x] Edit account settings
- [x] Verify changes are saved

### 2.3 Delete
- [x] Delete account
- [x] Verify account is removed from list
- [ ] Verify associated transactions are handled correctly
- [x] Verify data integrity after deletion

### 2.4 Periodic Change

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

### 3.1 Create/Add/New
- [ ] Create new transaction
- [ ] Verify transaction data is saved correctly
- [ ] Verify transaction appears in transaction list
- [ ] Verify transaction affects account balances correctly

### 3.2 Edit
- [ ] Edit transaction amount
- [ ] Edit transaction date
- [ ] Edit transaction account
- [ ] Edit transaction description
- [ ] Verify changes update calculations correctly

### 3.3 Delete
- [ ] Delete transaction
- [ ] Verify transaction is removed from list
- [ ] Verify account balances update correctly
- [ ] Verify data integrity after deletion

### 3.4 Periodic Change

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

### 3.5 Recurrence

#### 3.5.1 One Time
- [ ] Set one time recurrence
- [ ] Set specific start date
- [ ] Verify transaction appears once on specified date
- [ ] Verify description displays correctly

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
- [ ] Set monthly recurrence with interval 1
- [ ] Set monthly recurrence with interval > 1 (e.g., every 2 months)
- [ ] Set specific day of month (1-31)
- [ ] Test with day 31 in months with fewer days
- [ ] Set end date (optional)
- [ ] Verify transactions appear on correct dates
- [ ] Verify description displays correct day number

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
- [ ] Clear recurrence from transaction
- [ ] Verify recurrence persists after save
- [ ] Verify recurrence description displays correctly
- [ ] Verify recurrence affects projections correctly

### 3.6 Tags
- [ ] Add tags to transaction
- [ ] Add multiple tags
- [ ] Verify tags display correctly
- [ ] Verify tags persist after save
- [ ] Remove tags from transaction

---

## 4.0 Budgets

### 4.1 Create/Add/New
- [ ] Create new budget
- [ ] Verify budget data is saved correctly
- [ ] Verify budget appears in budget list
- [ ] Verify budget affects calculations correctly

### 4.2 Edit
- [ ] Edit budget amount
- [ ] Edit budget period
- [ ] Edit budget category
- [ ] Edit budget description
- [ ] Edit budget status (planned/actual)
- [ ] Edit actual amount (when status is actual)
- [ ] Edit actual date (when status is actual)
- [ ] Verify changes update forecasts correctly

### 4.3 Delete
- [ ] Delete budget
- [ ] Verify budget is removed from list
- [ ] Verify forecasts update correctly
- [ ] Verify data integrity after deletion

### 4.4 Generate from Projection
- [ ] Generate budget from projection
- [ ] Verify all projected transactions are converted to budget items
- [ ] Verify budget dates match projection dates
- [ ] Verify budget amounts match projection amounts
- [ ] Verify recurrence descriptions are preserved
- [ ] Verify budget can be edited after generation

### 4.5 Tags
- [ ] Add tags to budget item
- [ ] Add multiple tags
- [ ] Verify tags display correctly
- [ ] Verify tags persist after save
- [ ] Remove tags from budget item

---

## 5.0 Projection

### 5.1 Generate
- [ ] Generate projection
- [ ] Verify projection calculations are accurate
- [ ] Verify projection appears in projection view
- [ ] Verify projection date range is correct
- [ ] Verify recurrence patterns create correct occurrences
- [ ] Verify periodic changes are applied correctly
- [ ] Verify account balances update correctly over time
- [ ] Verify totals (Money In, Money Out, Net) are calculated correctly

### 5.2 Remove
- [ ] Remove projection
- [ ] Verify projection is cleared from view
- [ ] Verify data integrity after removal

### 5.3 Save as Budget
- [ ] Save projection as budget
- [ ] Verify budget is created correctly
- [ ] Verify budget data matches projection
- [ ] Verify budget appears in budget list

---

## 6.0 Data Management

### 6.1 Export
- [ ] Export data to JSON file
- [ ] Verify export filename includes date
- [ ] Verify exported file contains all scenarios
- [ ] Verify exported file contains all accounts
- [ ] Verify exported file contains all transactions
- [ ] Verify exported file contains all budgets
- [ ] Verify exported file is valid JSON
- [ ] Test export in Electron (save dialog)
- [ ] Test export in web browser (download)

### 6.2 Import
- [ ] Import data from JSON file (replace mode)
- [ ] Verify all data is replaced
- [ ] Verify application reloads after import
- [ ] Verify imported data displays correctly
- [ ] Test import in Electron (open dialog)
- [ ] Test import in web browser (file picker)
- [ ] Test with invalid JSON file (error handling)
- [ ] Test with corrupted data (error handling)

### 6.3 Clear Data (Web Only)
- [ ] Click clear data button
- [ ] Verify confirmation dialog appears
- [ ] Confirm clearing data
- [ ] Verify all data is removed from localStorage
- [ ] Verify application reloads
- [ ] Cancel clear operation and verify data remains

### 6.4 Data Migration
- [ ] Test migration from old transaction format to new
- [ ] Verify plannedTransactions and actualTransactions merge to transactions
- [ ] Verify budgets array is created if missing
- [ ] Verify account balance field migration
- [ ] Verify migration version is tracked correctly
- [ ] Verify migration only runs when needed

---

## 7.0 Keyboard Shortcuts

### 7.1 Navigation
- [ ] Ctrl+1 to focus scenarios
- [ ] Ctrl+2 to focus accounts
- [ ] Ctrl+3 to focus transactions
- [ ] Ctrl+4 to focus projections

### 7.2 Actions
- [ ] Ctrl+N to add new row
- [ ] Delete to remove selected rows
- [ ] Ctrl+S to save changes
- [ ] Ctrl+G to generate projections
- [ ] Ctrl+C to copy to clipboard
- [ ] ? to show shortcuts help

### 7.3 Help
- [ ] Show shortcuts help dialog
- [ ] Verify all shortcuts are listed
- [ ] Verify descriptions are clear
- [ ] Close help dialog

---

## 8.0 Totals and Calculations

### 8.1 Transaction Totals
- [ ] Verify Money In total is calculated correctly
- [ ] Verify Money Out total is calculated correctly
- [ ] Verify Net total is calculated correctly (Money In - Money Out)
- [ ] Verify totals update when transactions change
- [ ] Verify currency formatting is correct

### 8.2 Projection Totals
- [ ] Verify projection totals display for each period
- [ ] Verify totals include all transaction types
- [ ] Verify totals include recurrence occurrences
- [ ] Verify totals include periodic change applications
- [ ] Verify totals update when projection regenerates

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
