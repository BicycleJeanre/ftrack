# FTrack Comprehensive Test Setup Guide

**Version**: 1.0.0  
**Last Updated**: January 8, 2026  
**Purpose**: Complete test data setup to validate all application functionality

---

## 1.0 Account Setup

Create the following accounts to test different account types and structures:

### 1.1 Income Accounts
- **Primary Salary**
  - Type: Income
  - Initial Balance: $0.00
  - Description: Main employment income

- **Side Business**
  - Type: Income
  - Initial Balance: $0.00
  - Description: Freelance/consulting income

- **Investment Returns**
  - Type: Income
  - Initial Balance: $0.00
  - Description: Dividends and interest

### 1.2 Expense Accounts
- **Rent/Mortgage**
  - Type: Expense
  - Initial Balance: $0.00
  - Description: Monthly housing payment

- **Utilities**
  - Type: Expense
  - Initial Balance: $0.00
  - Description: Electric, water, gas, internet

- **Groceries**
  - Type: Expense
  - Initial Balance: $0.00
  - Description: Food and household items

- **Transportation**
  - Type: Expense
  - Initial Balance: $0.00
  - Description: Gas, car payment, insurance, maintenance

- **Insurance**
  - Type: Expense
  - Initial Balance: $0.00
  - Description: Health, life, home insurance

- **Entertainment**
  - Type: Expense
  - Initial Balance: $0.00
  - Description: Dining out, subscriptions, hobbies

- **Debt Payments**
  - Type: Expense
  - Initial Balance: $0.00
  - Description: Credit cards, loans

### 1.3 Asset Accounts
- **Checking Account**
  - Type: Asset
  - Initial Balance: $5,000.00
  - Description: Primary checking account

- **Savings Account**
  - Type: Asset
  - Initial Balance: $15,000.00
  - Description: Emergency fund

- **Investment Account**
  - Type: Asset
  - Initial Balance: $25,000.00
  - Description: Brokerage account

### 1.4 Liability Accounts
- **Credit Card**
  - Type: Liability
  - Initial Balance: $2,500.00
  - Description: Credit card balance

- **Car Loan**
  - Type: Liability
  - Initial Balance: $18,000.00
  - Description: Auto loan balance

- **Student Loan**
  - Type: Liability
  - Initial Balance: $35,000.00
  - Description: Student debt

---

## 2.0 Scenario Setup

### 2.1 Budget Scenario: "2026 Budget"
- **Name**: 2026 Budget
- **Type**: Budget
- **Description**: Primary budget for 2026
- **Start Date**: 2026-01-01
- **End Date**: 2026-12-31
- **Projection Period**: Month

---

## 3.0 Planned Transactions - All Recurrence Types

**Important**: Each transaction requires:
- **Primary Account**: The account context (select from accounts grid first)
- **Transaction Type**: Debit (money leaving primary) or Credit (money entering primary)
- **Secondary Account**: The other account involved in the transfer
- **Amount**: Transaction amount
- **Recurrence**: How often the transaction repeats

### 3.1 Weekly Recurrence
**Primary Account**: Checking Account
- **Transaction Type**: Debit
- **Secondary Account**: Groceries
- **Amount**: $150.00
- **Recurrence**: Weekly
- **Start Date**: 2026-01-06
- **Description**: Weekly grocery shopping
- *(Money flows: Checking → Groceries)*

### 3.2 Bi-Weekly Recurrence
**Primary Account**: Checking Account
- **Transaction Type**: Credit
- **Secondary Account**: Primary Salary
- **Amount**: $3,200.00
- **Recurrence**: Bi-weekly
- **Start Date**: 2026-01-10
- **Description**: Bi-weekly paycheck
- *(Money flows: Primary Salary → Checking)*

### 3.3 Semi-Monthly Recurrence
**Primary Account**: Checking Account
- **Transaction Type**: Credit
- **Secondary Account**: Side Business
- **Amount**: $1,500.00
- **Recurrence**: Semi-monthly
- **Start Date**: 2026-01-15
- **Description**: Client payments (15th and 30th)
- *(Money flows: Side Business → Checking)*

### 3.4 Monthly Recurrence

**Transaction 1 - Rent Payment**
**Primary Account**: Checking Account
- **Transaction Type**: Debit
- **Secondary Account**: Rent/Mortgage
- **Amount**: $2,200.00
- **Recurrence**: Monthly
- **Start Date**: 2026-01-01
- **Description**: Monthly rent due on 1st
- *(Money flows: Checking → Rent/Mortgage)*

**Transaction 2 - Utilities**
**Primary Account**: Checking Account
- **Transaction Type**: Debit
- **Secondary Account**: Utilities
- **Amount**: $250.00
- **Recurrence**: Monthly
- **Start Date**: 2026-01-05
- **Description**: Combined utilities
- *(Money flows: Checking → Utilities)*

**Transaction 3 - Car Payment**
**Primary Account**: Checking Account
- **Transaction Type**: Debit
- **Secondary Account**: Car Loan
- **Amount**: $425.00
- **Recurrence**: Monthly
- **Start Date**: 2026-01-15
- **Description**: Auto loan payment
- *(Money flows: Checking → Car Loan liability)*

**Transaction 4 - Insurance Premium**
**Primary Account**: Checking Account
- **Transaction Type**: Debit
- **Secondary Account**: Insurance
- **Amount**: $350.00
- **Recurrence**: Monthly
- **Start Date**: 2026-01-01
- **Description**: Combined insurance
- *(Money flows: Checking → Insurance)*

**Transaction 5 - Savings Transfer**
**Primary Account**: Checking Account
- **Transaction Type**: Debit
- **Secondary Account**: Savings Account
- **Amount**: $500.00
- **Recurrence**: Monthly
- **Start Date**: 2026-01-15
- **Description**: Automatic savings
- *(Money flows: Checking → Savings)*

### 3.5 Quarterly Recurrence

**Transaction 1 - Investment Dividends**
**Primary Account**: Checking Account
- **Transaction Type**: Credit
- **Secondary Account**: Investment Returns
- **Amount**: $425.00
- **Recurrence**: Quarterly
- **Start Date**: 2026-01-31
- **Description**: Quarterly dividend payment
- *(Money flows: Investment Returns → Checking)*

**Transaction 2 - Car Maintenance**
**Primary Account**: Checking Account
- **Transaction Type**: Debit
- **Secondary Account**: Transportation
- **Amount**: $200.00
- **Recurrence**: Quarterly
- **Start Date**: 2026-03-01
- **Description**: Regular vehicle maintenance
- *(Money flows: Checking → Transportation)*

### 3.6 Semi-Annual Recurrence

**Transaction 1 - Property Tax**
**Primary Account**: Checking Account
- **Transaction Type**: Debit
- **Secondary Account**: Rent/Mortgage
- **Amount**: $1,800.00
- **Recurrence**: Semi-annual
- **Start Date**: 2026-04-01
- **Description**: Property tax installment
- *(Money flows: Checking → Rent/Mortgage)*

**Transaction 2 - Car Insurance**
**Primary Account**: Checking Account
- **Transaction Type**: Debit
- **Secondary Account**: Transportation
- **Amount**: $650.00
- **Recurrence**: Semi-annual
- **Start Date**: 2026-01-15
- **Description**: 6-month premium
- *(Money flows: Checking → Transportation)*

### 3.7 Annual Recurrence

**Transaction 1 - Tax Refund**
**Primary Account**: Checking Account
- **Transaction Type**: Credit
- **Secondary Account**: Primary Salary (or create "Tax Refund" income account)
- **Amount**: $2,500.00
- **Recurrence**: Annual
- **Start Date**: 2026-04-15
- **Description**: Annual tax refund
- *(Money flows: Tax source → Checking)*

**Transaction 2 - Annual Membership**
**Primary Account**: Checking Account
- **Transaction Type**: Debit
- **Secondary Account**: Entertainment
- **Amount**: $120.00
- **Recurrence**: Annual
- **Start Date**: 2026-02-01
- **Description**: Gym membership renewal
- *(Money flows: Checking → Entertainment)*

### 3.8 One-Time Transactions

**Transaction 1 - Vacation Expense**
**Primary Account**: Checking Account
- **Transaction Type**: Debit
- **Secondary Account**: Entertainment
- **Amount**: $3,500.00
- **Recurrence**: One-time
- **Start Date**: 2026-07-15
- **Description**: Summer vacation
- *(Money flows: Checking → Entertainment)*

**Transaction 2 - Bonus Payment**
**Primary Account**: Checking Account
- **Transaction Type**: Credit
- **Secondary Account**: Primary Salary
- **Amount**: $5,000.00
- **Recurrence**: One-time
- **Start Date**: 2026-12-15
- **Description**: Year-end bonus
- *(Money flows: Primary Salary → Checking)*

---

## 4.0 Actual Transactions - Testing Period View

### 4.1 January 2026 Actual Transactions
Add these to test the actual transaction grid and period views.
**Note**: Select Checking Account as primary account, then add these transactions:

- **01/03/2026**: Debit → Groceries - $162.45 - Grocery Shopping
- **01/05/2026**: Debit → Utilities - $243.18 - Monthly utilities
- **01/10/2026**: Credit → Primary Salary - $3,200.00 - Paycheck
- **01/10/2026**: Debit → Groceries - $148.76 - Grocery Shopping
- **01/15/2026**: Debit → Car Loan - $425.00 - Car Payment
- **01/15/2026**: Credit → Side Business - $1,500.00 - Client payment
- **01/17/2026**: Debit → Groceries - $155.23 - Grocery Shopping
- **01/20/2026**: Debit → Entertainment - $85.50 - Movie night
- **01/24/2026**: Credit → Primary Salary - $3,200.00 - Paycheck
- **01/25/2026**: Debit → Transportation - $65.00 - Gas
- **01/28/2026**: Debit → Entertainment - $125.00 - Dining Out
- **01/30/2026**: Debit → Credit Card - $500.00 - Credit Card Payment

### 4.2 February 2026 Actual Transactions
**Primary Account**: Checking Account

- **02/01/2026**: Debit → Rent/Mortgage - $2,200.00 - Rent
- **02/05/2026**: Debit → Utilities - $265.32 - Monthly utilities
- **02/07/2026**: Credit → Primary Salary - $3,200.00 - Paycheck
- **02/14/2026**: Debit → Entertainment - $180.00 - Valentine's Dinner
- **02/15/2026**: Credit → Side Business - $1,500.00 - Client payment
- **02/21/2026**: Credit → Primary Salary - $3,200.00 - Paycheck
- **02/28/2026**: Debit → Credit Card - $500.00 - Credit Card Payment

---

## 5.0 Test Scenarios and Expected Behaviors

### 5.1 Account Balance Validation
**Test**: Verify account balances calculate correctly
- Check Checking Account starting balance: $5,000.00
- Verify balance updates after actual transactions
- Confirm negative balances display correctly for liability accounts

### 5.2 Recurrence Pattern Testing
**Test**: Verify all 8 recurrence types generate correct dates

#### Weekly (Grocery Shopping)
- **Expected**: Every 7 days from 01/06/2026
- **Verify**: 01/06, 01/13, 01/20, 01/27, 02/03, 02/10...

#### Bi-Weekly (Primary Salary)
- **Expected**: Every 14 days from 01/10/2026
- **Verify**: 01/10, 01/24, 02/07, 02/21, 03/07...

#### Semi-Monthly (Side Business)
- **Expected**: 15th and 30th (or last day) of each month
- **Verify**: 01/15, 01/30, 02/15, 02/28, 03/15, 03/30...

#### Monthly (Rent, Utilities, etc.)
- **Expected**: Same day each month
- **Verify**: Rent on 1st, Car Payment on 15th, etc.

#### Quarterly (Dividends, Maintenance)
- **Expected**: Every 3 months from start date
- **Verify**: 01/31, 04/30, 07/31, 10/31...

#### Semi-Annual (Property Tax, Car Insurance)
- **Expected**: Every 6 months
- **Verify**: 01/15, 07/15, 01/15/2027...

#### Annual (Tax Refund, Memberships)
- **Expected**: Same date each year
- **Verify**: 04/15/2026, 04/15/2027...

#### One-Time (Vacation, Bonus)
- **Expected**: Only on specified date
- **Verify**: Single occurrence, no repeats

### 5.3 Period-Centric View Testing
**Test**: Verify period calculation and transaction display

1. Select the "2026 Budget" scenario
2. Open Planned Transactions accordion
3. **Test Master List View**:
   - Click "Master List" button
   - Verify all planned transactions display
   - Verify no period filtering

4. **Test Period View**:
   - Select "January 2026" from period dropdown
   - **Verify**: Only planned transactions for January display
   - **Verify**: Dates calculated correctly from recurrence patterns
   - Use ◀ and ▶ buttons to navigate periods
   - **Verify**: Period changes and transactions update

5. **Test Actual Transactions**:
   - Open Actual Transactions accordion
   - Select "January 2026" from period dropdown
   - **Verify**: All 12 January actual transactions appear
   - **Verify**: Sorted by date
   - Navigate periods with ◀ and ▶ buttons
   - Add actual transaction to current period
   - **Verify**: Transaction saves to correct period

### 5.4 Scenario Testing
**Test**: Verify scenario functionality

1. **Budget Scenario** (2026 Budget):
   - Select scenario from dropdown
   - **Verify shows**: Accounts, Planned Transactions, Actual Transactions, Projections
   - **Verify**: All accordions are present and functional
   - **Verify**: Period selectors work for both planned and actual transactions

### 5.5 Projection Engine Testing
**Test**: Verify projection calculations

1. Open Projections accordion
2. Click "Generate Projections" button
3. **Verify Projections Grid**:
   - Grid populates with data
   - Periods match scenario projection period (Month/Quarter/Year)
   - Starting balances match account balances
   - All planned transactions applied to correct periods
   - Running balance calculated accurately
   - One-time transactions appear only once
   - Recurring transactions repeat correctly
   - Final projected balances reasonable

4. **Test Clear Projections**:
   - Click "Clear Projections"
   - Verify grid empties
   - Regenerate and verify data reappears

### 5.6 Grid Operations Testing
**Test**: Verify CRUD operations in all grids

#### Scenarios Grid
- ✅ Create new scenario
- ✅ Edit scenario name, description, dates
- ✅ Verify scenario type is Budget
- ✅ Delete scenario
- ✅ Verify projection period dropdown (Week, Month, Quarter, Year)

#### Accounts Grid
- ✅ Create new account
- ✅ Edit account name/type/balance
- ✅ Delete unused account
- ✅ Verify type dropdown (Income, Expense, Asset, Liability)

#### Planned Transactions Grid
- ✅ Create transaction with each recurrence type
- ✅ Edit transaction details
- ✅ Change recurrence type
- ✅ Delete transaction
- ✅ Verify date picker works

#### Actual Transactions Grid
- ✅ Add actual transaction
- ✅ Edit amount and description
- ✅ Delete transaction
- ✅ Verify period filtering

#### Projections Grid
- ✅ Generate projections
- ✅ View by period
- ✅ Export data
- ✅ Clear projections

### 5.7 Data Persistence Testing
**Test**: Verify data saves and loads correctly

1. Add all test data above
2. Close application
3. Reopen application
4. **Verify**:
   - All accounts present with correct balances
   - All scenarios intact
   - All planned transactions preserved
   - All actual transactions retained
   - Projections regenerate correctly

### 5.8 Edge Cases and Error Handling

#### Date Edge Cases
- **Leap Year**: Create monthly transaction on 02/29
- **Month End**: Semi-monthly on 30th in February
- **DST**: Transactions around daylight saving changes

#### Financial Edge Cases
- **Zero Amount**: Try creating $0.00 transaction
- **Negative Amount**: Enter negative values
- **Large Numbers**: Test with amounts over $1,000,000
- **Decimal Precision**: Test with values like $123.456

#### Recurrence Edge Cases
- **Past Start Date**: Create recurring transaction with past start date
- **Future Start Date**: Create transaction starting in 2030
- **Overlapping Dates**: Multiple transactions same day
- **End Date**: Test with defined end dates for recurrence

#### Data Edge Cases
- **Empty Scenario**: Scenario with no transactions
- **Empty Account**: Account with no transactions
- **Duplicate Names**: Try creating duplicate account names
- **Special Characters**: Use symbols in descriptions

---

## 6.0 Expected Results Summary

### 6.1 Financial Totals (Monthly Average)
Based on planned transactions:

**Income**:
- Primary Salary: $6,400.00/month (bi-weekly)
- Side Business: $3,000.00/month (semi-monthly)
- Investment Returns: ~$142.00/month (quarterly average)
- **Total Monthly Income**: ~$9,542.00

**Expenses**:
- Rent: $2,200.00
- Utilities: $250.00
- Groceries: ~$650.00 (weekly)
- Transportation: ~$565.00 (car payment + gas + quarterly maintenance)
- Insurance: $350.00 + ~$108.00 (semi-annual car insurance)
- Entertainment: ~$10.00 (annual membership average)
- **Total Monthly Expenses**: ~$4,133.00

**Net Monthly**: ~$5,409.00 positive cash flow

### 6.2 Account Balance Projections (Dec 31, 2026)
- Checking Account: ~$5,000 + deposits - withdrawals
- Savings Account: ~$21,000 ($15,000 + $500/month × 12)
- Investment Account: ~$26,700 ($25,000 + $1,700 dividends)

### 6.3 Key Validation Points
- ✅ No calculation errors in projections
- ✅ All recurrence patterns generate correctly
- ✅ Period views show accurate data
- ✅ Actual transactions display and save correctly
- ✅ Data persists across sessions
- ✅ Grid operations work without errors
- ✅ All accordions expand/collapse properly

---

## 7.0 Test Execution Checklist

**Pre-Test Setup**:
- [ ] Fresh app installation or cleared data
- [ ] Verified app version (0.3-alpha)
- [ ] Console open for error monitoring

**Account Setup** (Section 1.0):
- [ ] Created all 6 income/expense accounts
- [ ] Created all 3 asset accounts
- [ ] Created all 3 liability accounts
- [ ] Verified initial balances

**Scenario Setup** (Section 2.0):
- [ ] Created base scenario
- [ ] Created "2026 Budget" scenario
- [ ] Set scenario dates (Jan 1 - Dec 31, 2026)
- [ ] Set projection period to Month
**Planned Transactions** (Section 3.0):
- [ ] Added weekly recurrence
- [ ] Added bi-weekly recurrence
- [ ] Added semi-monthly recurrence
- [ ] Added monthly recurrence (5 transactions)
- [ ] Added quarterly recurrence
- [ ] Added semi-annual recurrence
- [ ] Added annual recurrence
- [ ] Added one-time transactions

**Actual Transactions** (Section 4.0):
- [ ] Added all January transactions
- [ ] Added all February transactions

**Testing** (Section 5.0):
- [ ] Account balance validation
- [ ] Recurrence pattern testing
- [ ] Period-centric view testing
- [ ] Scenario comparison testing
- [ ] Projection engine testing
- [ ] Grid operations testing
- [ ] Data persistence testing
- [ ] Edge cases testing

**Post-Test**:
- [ ] No console errors
- [ ] Data saved correctly
- [ ] App performance acceptable
- [ ] All features functional

---

## 8.0 Known Issues to Watch For

During testing, watch for these potential issues:

1. **Date Calculation Issues**:
   - Semi-monthly on February (28/29 vs 30)
   - Quarterly calculations crossing year boundaries
   - Bi-weekly patterns drifting

2. **UI/UX Issues**:
   - Grid scrolling performance with many rows
   - Period selector dropdown behavior
   - Modal form validation

3. **Data Issues**:
   - Large decimal precision rounding
   - Very large amounts display
   - Special characters in descriptions

4. **Performance Issues**:
   - Projection generation time with many transactions
   - Grid rendering with 100+ rows
   - App startup time

---

**Testing Version**: Alpha 0.3  
**Test Data Version**: 1.0  
**Estimated Test Time**: 2-3 hours for complete validation
