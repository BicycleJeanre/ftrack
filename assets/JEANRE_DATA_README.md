# Jeanre Budget Data - Asset Files

**Generated**: December 29, 2025  
**Source**: `Manual tracking/budget_jeanre.xlsx`

## Overview

These asset files contain accounts and transactions extracted from the Jeanre budget Excel file for use in the F-Track application.

## Files Created

### 1. jeanre-accounts.json
- **Total Accounts**: 43
  - **Income Accounts**: 9
  - **Expense Accounts**: 33
  - **Asset Accounts**: 1 (Primary checking account)

#### Income Accounts (ACC001-ACC009)
1. Salary - Employment income
2. Bicycle Claims - Reimbursements
3. Jodine U - Support from Jodine University fund
4. Jodine Transactional - Transfers from Jodine
5. Other - Miscellaneous income
6. Personal Wealth - Withdrawals from savings
7. Retained Balance - Carried forward balance
8. Tax Refund - Tax returns
9. Bernice Transactional - Transfers from Bernice

#### Expense Accounts (ACC010-ACC042)
1. Jeanre Credit Card - Credit card payments
2. Home Loan - Mortgage payment
3. Vehicle Loan - Car financing
4. Medical Aid - Health insurance
5. Netstar - Vehicle tracking subscription
6. Shortfall Insurance - Gap insurance
7. Vehicle Insurance - Car insurance
8. Home Insurance - Property insurance
9. Life Insurance - Life cover
10. Municipal Account - Water, electricity, rates
11. Internet - Broadband service
12. Fuel - Petrol and diesel
13. Running Costs - General household expenses
14. Administration - Bank fees and admin
15. Jodine Transactional - Transfers to Jodine
16. Jodine AIE - AIE University payments
17. Jodine U - University expenses
18. Emergency - Emergency fund contributions
19. Jeanre Retirement - Retirement savings
20. Vehicle Licenses - Vehicle registration
21. Other - Miscellaneous expenses
22. Accounts - Account payments
23. Events - Special events
24. Medical - Medical expenses
25. Tax - Tax payments
26. Cell Phones - Mobile phone costs
27. Jansie - Payments to Jansie
28. H Smith - H Smith payments
29. Vape - Vaping products
30. Easy Equities - Investment contributions
31. Gas - LPG gas
32. Child Fund - Child support fund
33. Personal Wealth - Savings deposits

#### Asset Account (ACC999)
- Jeanre Transactional - Primary checking account

### 2. jeanre-transactions.json
- **Total Transactions**: 429
- **Date Range**: May 2024 - December 2025 (20 months)
- **Total Income**: R688,375.35
- **Total Expenses**: R679,353.00
- **Net Balance**: R9,022.35

## Transaction Structure

Each transaction includes:
- **id**: Unique transaction ID (TXN0001-TXN0429)
- **date**: Transaction date (randomized within each month)
- **description**: Account name and month
- **amount**: Transaction amount in Rands
- **type**: "Income" or "Expense"
- **category**: Account category
- **fromAccount**: Source account ID
- **toAccount**: Destination account ID
- **recurrence**: "None" (no recurring transactions)
- **notes**: Description of the transaction

## Data Flow

### Income Transactions
- **FROM**: Income account (ACC001-ACC009)
- **TO**: Primary account (ACC999)
- **Example**: Salary payment goes from Salary account to Jeanre Transactional account

### Expense Transactions
- **FROM**: Primary account (ACC999)
- **TO**: Expense account (ACC010-ACC042)
- **Example**: Home loan payment goes from Jeanre Transactional account to Home Loan account

## How to Use

1. **Import Accounts**: Load `jeanre-accounts.json` into the F-Track app's accounts system
2. **Import Transactions**: Load `jeanre-transactions.json` into the F-Track app's transactions system
3. **View Data**: Navigate to the Accounts and Transactions pages to see the imported data

## Notes

- All account balances start at 0 and will be calculated based on transactions
- Transaction dates are randomized within each month (day 1-28) for realistic variation
- The data represents actual budget planning from the Excel file
- Currency amounts are in South African Rands (R)
