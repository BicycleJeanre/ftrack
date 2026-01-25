# FTrack Usage Guide

**Version**: 0.3.0-alpha  
**Last Updated**: January 9, 2026  
**Audience**: New users, no accounting background required

---

## 1.0 Welcome to FTrack

### 1.1 What is FTrack?

FTrack is a personal financial planning and forecasting application that helps you:
- Track your current accounts (checking, savings, credit cards)
- Plan future income and expenses
- See how your money will flow over the next months or years
- Understand what-if scenarios (What if I get a raise? What if I pay off debt early?)
- Make informed decisions about your financial future

### 1.2 Who Should Use FTrack?

FTrack is designed for individuals and families who want to:
- Get ahead of their finances instead of reacting to surprises
- Plan major purchases or life changes
- See if they can afford a goal (vacation, car, down payment)
- Understand their cash flow trends
- Experiment with different financial strategies

### 1.3 How is FTrack Different?

Unlike budgeting apps that only track what already happened, FTrack lets you **plan forward**. You define what you expect to happen (paychecks, bills, purchases) and FTrack shows you what your account balances will look like months from now.

---

## 2.0 Core Concepts Explained

Before diving into the app, let's understand the key concepts FTrack uses.

### 2.1 Accounts

**What they are**: Accounts represent real places where your money lives.

**Examples**:
- **Checking Account**: Your main bank account for daily transactions
- **Savings Account**: Long-term savings, emergency fund
- **Credit Card**: Money you owe (starts negative, payments make it less negative)
- **Cash**: Physical money you keep at home
- **Investment Account**: Stocks, bonds, retirement accounts

**In FTrack**: Each account shows its current balance and what the balance will be in the future based on your planned transactions.

### 2.2 Transactions

**What they are**: Any movement of money between accounts or in/out of your finances.

**Every transaction has TWO sides** (this is called "dual-entry"):
1. **Primary Account**: Where the money comes FROM or goes TO
2. **Secondary Account**: The other side of the transaction

**Examples**:
- **Paycheck**: Money comes FROM "Income" INTO "Checking Account"
  - Primary: Checking Account (receives money)
  - Secondary: Income (source of money)
  
- **Grocery Purchase**: Money goes FROM "Checking Account" TO "Groceries"
  - Primary: Checking Account (loses money)
  - Secondary: Groceries (expense category)
  
- **Credit Card Payment**: Money goes FROM "Checking" TO "Credit Card"
  - Primary: Checking Account (loses money)
  - Secondary: Credit Card (debt decreases)

**Key Point**: You don't need to understand accounting - just remember every transaction involves two accounts: where money comes FROM and where it goes TO.

### 2.3 Planned Transactions

**What they are**: Transactions you EXPECT to happen in the future.

**Examples**:
- Your monthly salary (every two weeks, $2,500)
- Rent payment (1st of every month, $1,200)
- Groceries (weekly, estimated $150)
- Car payment (monthly, $350)
- Annual insurance (once per year, $1,800)

**In FTrack**: You define these once, set their recurrence pattern (weekly, monthly, etc.), and FTrack automatically creates them for future months.

**Why they matter**: Planned transactions are your financial roadmap. They tell FTrack what to expect so it can show you future balances.

### 2.4 Actual Transactions

**What they are**: The REAL transactions that actually happened (or adjustments to planned ones).

**When to use them**:
- Mark a planned transaction as "completed" when it happens
- Adjust the amount if it was different than planned ($150 groceries actually cost $167)
- Record unexpected transactions that weren't planned

**Example**:
1. You planned "Groceries: $150" for January 5th
2. On January 5th, you actually spent $142.37
3. In FTrack, you mark it as complete and update the amount to $142.37

**Why they matter**: Actual transactions let you track reality vs. your plan, so your projections become more accurate as time goes on.

### 2.5 Projections

**What they are**: FTrack's calculations of what your account balances will be in the future.

**How they work**:
1. Start with your current account balance
2. Add all planned income transactions
3. Subtract all planned expense transactions
4. Show you the resulting balance for each future month

**Example**:
- Checking Account today: $3,500
- January planned: +$5,000 (paychecks), -$4,200 (expenses)
- Projected balance end of January: $4,300

**Why they matter**: Projections answer questions like "Can I afford this?" or "Will I run out of money?" before it happens.

### 2.6 Scenarios

**What they are**: Different versions of your financial plan to compare options.

**Examples**:
- **Baseline**: Your current reality (current job, current spending)
- **New Job**: What if you accepted that job offer with higher pay?
- **Debt Payoff**: What if you paid extra $500/month on credit card?
- **Big Purchase**: What if you bought a car in March?

**How to use them**:
1. Create a "Baseline" scenario with your current situation
2. Duplicate it to create "What-If" scenarios
3. Change planned transactions in each scenario
4. Compare the projections to see which future looks better

**Why they matter**: Scenarios let you experiment without risk. Test different financial strategies before committing.

---

## 3.0 Working with FTrack

### 3.1 Getting Started

When you first open FTrack, you'll see example data to help you learn. This includes:
- Sample accounts (Checking, Savings, Credit Card)
- Sample planned transactions (salary, rent, groceries)
- Sample projections showing future balances

**Your first steps**:
1. Explore the example data to understand the layout
2. Start customizing: change account names and balances to match YOUR accounts
3. Update planned transactions to match YOUR income and expenses
4. Watch the projections update in real-time

### 3.2 The Home Page

**What you see**:
- Overview of all your accounts and current balances
- Quick navigation to other sections

**Common actions**:
- Click on an account name to see its details
- Use the navigation menu to switch between sections

### 3.3 Accounts Section

**Purpose**: Manage all your financial accounts.

#### 3.3.1 Viewing Accounts

The accounts grid shows:
- **Name**: Account name (e.g., "Chase Checking")
- **Type**: Category (Asset, Liability, Income, Expense)
- **Balance**: Current amount in the account
- **Status**: Active or Inactive

**Account Types Explained**:
- **Asset**: Accounts with positive value (Checking, Savings, Cash)
- **Liability**: Debts you owe (Credit Cards, Loans) - shown as negative
- **Income**: Sources of money (Salary, Freelance, Gifts)
- **Expense**: Where you spend money (Groceries, Rent, Entertainment)

#### 3.3.2 Creating a New Account

1. Click "Add Row" button
2. Enter account name (e.g., "Wells Fargo Checking")
3. Select account type (Asset for bank accounts)
4. Enter current balance (check your real account)
5. Set status to "Active"
6. Click save icon or press Enter

**Example**: Adding your checking account
- Name: "Main Checking"
- Type: Asset
- Balance: $2,847.53 (your actual current balance)
- Status: Active

#### 3.3.3 Editing an Account

1. Click on any cell in the account row
2. Modify the value
3. Press Enter or click the save icon

**Common edits**:
- Update balance when reconciling with bank
- Rename account for clarity
- Deactivate account you closed

### 3.4 Planned Transactions Section

**Purpose**: Define all your expected future income and expenses.

#### 3.4.1 Understanding the Grid

Columns explained:
- **Description**: What is this transaction? (e.g., "Biweekly Paycheck")
- **Account**: Primary account affected (where money goes or comes from)
- **Secondary Account**: The other side (where money comes from or goes to)
- **Amount**: How much money
- **Type**: Credit (money IN) or Debit (money OUT)
- **Start Date**: When does this transaction begin?
- **Recurrence**: How often does it repeat?
- **End Date**: When does it stop? (leave blank for ongoing)

#### 3.4.2 Creating Your First Planned Transaction

**Example**: Adding your salary

1. Click "Add Row"
2. Fill in the details:
   - Description: "Salary - Acme Corp"
   - Account: "Checking Account" (where paycheck deposits)
   - Secondary Account: "Salary Income" (source)
   - Amount: 2500.00
   - Type: Credit (money coming IN)
   - Start Date: Your next payday
   - Recurrence Type: Weekly
   - Recurrence Interval: 2 (every 2 weeks)
   - End Date: (leave blank - salary continues)
3. Click save

**What happens**: FTrack now knows you get $2,500 every two weeks and will add this to your projections.

#### 3.4.3 Common Recurrence Patterns

**Weekly**:
- Interval 1 = Every week (e.g., weekly groceries)
- Interval 2 = Every 2 weeks (biweekly paycheck)

**Monthly - Day of Month**:
- Day: 1 = First of every month (rent)
- Day: 15 = Middle of month (car payment)
- Interval 1 = Every month
- Interval 3 = Every 3 months (quarterly)

**Monthly - Week of Month**:
- Week: 2, Day: Monday = Second Monday of every month
- Week: -1, Day: Friday = Last Friday of every month

**Yearly**:
- Date: 12/25 = Every December 25th (annual gift budget)
- Interval 1 = Every year

#### 3.4.4 Transaction Type Guide

**Money In**:
- Paycheck: Checking Account ← Salary Income
- Interest earned: Savings Account ← Interest Income
- Refund: Checking Account ← Refund Income

**Money Out**:
- Rent payment: Checking Account → Rent Expense
- Groceries: Checking Account → Groceries Expense
- Credit card payment: Checking Account → Credit Card Account

**Transfers** (Money moving between YOUR accounts):
- Savings transfer: Checking Account → Savings Account
- Both are debits/credits depending on perspective
- Choose the account losing money as primary

#### 3.4.5 Tips for Planning

**Start with the big stuff**:
1. Income (salary, side gigs)
2. Fixed expenses (rent, car payment, insurance)
3. Variable but regular (groceries, gas, utilities)
4. Periodic expenses (quarterly subscriptions, annual fees)
5. Savings goals (monthly transfer to savings)

**Be realistic**:
- Estimate high for expenses, low for income (build in a cushion)
- Round to easy numbers ($150 instead of $147.32)
- Adjust as you track actuals

**Review monthly**:
- Check if planned amounts match reality
- Update as your situation changes
- Remove transactions that end

### 3.5 Actual Transactions Section

**Purpose**: Track what REALLY happened vs. what you planned.

#### 3.5.1 How Actuals Work

FTrack generates a list of all planned transactions for the current period (month). For each one, you can:
- Mark it as "Executed" (✓ = it happened)
- Update the actual amount if different
- See the date it occurred

**The Grid**:
- Shows all planned transactions for selected month
- Checkbox to mark executed
- Amount field to record actual cost
- Date shows when it was planned

#### 3.5.2 Marking Transactions as Complete

**Example**: Recording January's grocery trip

1. Go to Actual Transactions section
2. Select January 2026 from period dropdown
3. Find "Groceries - Weekly" for Jan 5th
4. Check the "Executed" box (✓)
5. Update amount if needed ($150 planned → $142.37 actual)
6. FTrack automatically saves

**What this does**:
- Updates your account balance with the ACTUAL amount
- Helps you see if you're over/under budget
- Makes future projections more accurate

#### 3.5.3 Monthly Workflow

**At the end of each month**:
1. Open Actual Transactions for that month
2. Go through each planned transaction
3. Mark executed and update amounts based on bank statements
4. Any unmarked transactions = didn't happen (FTrack won't count them)

**This takes 10-15 minutes per month and keeps your projections accurate.**

### 3.6 Projections Section

**Purpose**: See your future account balances month by month.

#### 3.6.1 Reading the Projections Grid

**Columns**:
- **Account**: Which account is being projected
- **Month Columns**: Each future month shows projected balance

**How to read**:
- Current month shows actual balance (if you've tracked actuals)
- Future months show what balance WILL BE if planned transactions occur
- Negative numbers in red = account will be overdrawn
- Positive numbers in green = healthy balance

**Example**:
```
Account          | Jan 2026  | Feb 2026  | Mar 2026
Checking         | $3,200    | $2,850    | $4,100
Savings          | $10,000   | $10,500   | $11,000
Credit Card      | -$1,200   | -$800     | -$400
```

**Reading**: 
- Checking will drop to $2,850 in Feb (more expenses than income)
- Savings grows $500/month (regular transfers working)
- Credit Card debt decreasing (paying down balance)

#### 3.6.2 Using Projections for Decisions

**Question**: "Can I afford a $2,000 vacation in April?"

**How to check**:
1. Look at Checking Account projection for April
2. If balance is $5,000+ → Yes, you can afford it
3. If balance is $2,500 → Maybe, but tight
4. If balance is $1,800 → No, you'd overdraw

**Question**: "When will I pay off my credit card?"

**How to check**:
1. Look at Credit Card row
2. Find the month where balance reaches $0
3. That's your payoff date

**Question**: "What if I lose my job in March?"

**How to check**:
1. Create a new scenario
2. Remove salary transactions starting March
3. Compare projections to see how long savings last

### 3.7 Working with Scenarios

**Purpose**: Test different financial strategies safely.

#### 3.7.1 Creating Your First Scenario

**Step 1**: Create a baseline
1. Go to Scenarios section
2. Name it "Baseline - Current Situation"
3. Enter all your real accounts, transactions, etc.

**Step 2**: Create a "what-if"
1. Click "Duplicate Scenario"
2. Name it "What If: New Job"
3. Modify planned transactions:
   - Increase salary amount
   - Maybe add commuting expense
   - Keep everything else the same

**Step 3**: Compare
1. Switch between scenarios using dropdown
2. Look at projections in each
3. See which future looks better

#### 3.7.2 Common Scenario Ideas

**Scenario: Aggressive Debt Payoff**
- Baseline: Current payments
- What-If: Double credit card payment
- Compare: How much faster is payoff? Can you afford it?

**Scenario: Emergency Fund Goal**
- Baseline: Current savings rate
- What-If: Save $500/month instead of $200
- Compare: When do you reach $10,000 emergency fund?

**Scenario: Major Purchase**
- Baseline: Normal spending
- What-If: Add $15,000 car purchase in June
- Compare: Can you recover? Do you need to save first?

**Scenario: Lifestyle Change**
- Baseline: Current expenses
- What-If: Move to cheaper apartment (-$300/month rent)
- Compare: How much faster do savings grow?

---

## 4.0 Sample Workflows

### 4.1 Complete Setup Workflow (New User)

**Time required**: 30-45 minutes

**Step 1**: Gather your information
- Current balance of all accounts (check bank/credit card apps)
- List of regular income (paychecks, side gigs)
- List of regular expenses (rent, bills, subscriptions)
- Recent bank statements for reference

**Step 2**: Set up accounts
1. Open Accounts section
2. Delete example accounts (or modify them)
3. Add your real accounts:
   - All checking accounts
   - All savings accounts
   - All credit cards
   - Income categories (Salary, Freelance, etc.)
   - Expense categories (Rent, Groceries, Gas, etc.)
4. Enter current balances from your banks

**Step 3**: Set up planned transactions
1. Open Planned Transactions section
2. Add your income:
   - Salary (biweekly or monthly)
   - Any side income
3. Add fixed expenses:
   - Rent/mortgage
   - Car payment
   - Insurance
   - Subscriptions (Netflix, gym, etc.)
4. Add variable expenses (estimate):
   - Groceries (weekly)
   - Gas (weekly or monthly)
   - Utilities (monthly)
   - Entertainment (monthly budget)
5. Add savings goals:
   - Monthly transfer to savings

**Step 4**: Check projections
1. Open Projections section
2. Review next 3-6 months
3. Look for:
   - Negative balances (warning signs)
   - Months with unusually low balances
   - Overall trend (growing or shrinking?)

**Step 5**: Adjust as needed
- If projections look bad, reduce expenses or increase income
- If projections look good, consider increasing savings
- Make sure it feels realistic

### 4.2 Monthly Maintenance Workflow

**Time required**: 15-20 minutes/month

**What to do**:

1. **Update actuals** (10 min):
   - Open Actual Transactions for previous month
   - Go through each planned transaction
   - Mark what happened, update amounts
   - Compare bank statement to catch anything missed

2. **Review projections** (5 min):
   - Open Projections section
   - Check if future still looks accurate
   - Note any surprises or concerns

3. **Adjust plans** (5 min):
   - Add any new recurring transactions
   - Remove any that stopped
   - Update amounts if patterns changed

**Best practices**:
- Do this the first weekend of each month
- Keep bank statements handy
- Make it a habit (like paying bills)

### 4.3 Planning a Major Purchase

**Example**: Planning to buy a $5,000 used car in 6 months

**Step 1**: Check if you can afford it
1. Look at projections 6 months out
2. See what Checking balance will be
3. If balance > $7,000, you probably can
4. If balance < $5,000, you need to save first

**Step 2**: Create a savings plan
1. Go to Planned Transactions
2. Add new transaction:
   - "Car Savings Fund"
   - Checking → Savings
   - $800/month for 6 months
3. Check projections again

**Step 3**: Create scenario to model the purchase
1. Duplicate your baseline scenario
2. Name it "Car Purchase Plan"
3. Add one-time transaction:
   - "Used Car Purchase"
   - Month 6, $5,000
   - Checking → Expense
4. Review projections in this scenario

**Step 4**: Make decision
- If projections still look good → Go ahead
- If Checking goes negative → Save longer or reduce purchase price
- If tight but workable → Reduce other expenses during that time

---

## 5.0 Tips for Success

### 5.1 Start Simple

Don't try to track every penny on day one:
1. Start with major income and expenses only
2. Add detail as you get comfortable
3. It's better to track 10 things accurately than 100 things poorly

### 5.2 Review and Adjust

Your first plan won't be perfect:
- Projections will be wrong at first
- That's normal - you're learning your patterns
- Update based on actuals each month
- It gets more accurate over time

### 5.3 Use Scenarios Liberally

Try out ideas before committing:
- "What if I cancel this subscription?"
- "What if I pick up a weekend job?"
- "What if I refinance this loan?"
- Scenarios let you explore without risk

### 5.4 Don't Stress Over Perfection

**Remember**:
- FTrack is a planning TOOL, not a crystal ball
- Life happens - unexpected expenses, income changes
- The goal is to be AWARE and PREPARED, not perfect
- Even rough projections are better than no plan

### 5.5 Focus on Trends, Not Exact Numbers

What matters:
- ✅ Are you trending toward or away from goals?
- ✅ Are you living within your means?
- ✅ Do you have a cushion for emergencies?
- ❌ Not: Having exact penny predictions

---

## 6.0 Common Questions

### 6.1 "Do I need to know accounting?"

**No.** FTrack uses dual-entry behind the scenes, but you don't need to understand it. Just remember:
- Every transaction involves TWO accounts
- Pick where money comes FROM and where it goes TO
- FTrack handles the rest

### 6.2 "How far ahead should I project?"

**Recommendation**:
- Minimum: 3 months (catch upcoming issues)
- Typical: 6-12 months (plan major events)
- Maximum: 2-3 years (long-term goals)

### 6.3 "Should I track every transaction?"

**No.** Two approaches:

**Simplified** (recommended for beginners):
- Plan major recurring transactions only
- Lump small expenses into categories
- "Groceries: $600/month" instead of every trip

**Detailed**:
- Track individual transactions
- More accurate but more work
- Good if you want to find spending leaks

### 6.4 "What if actual amounts differ from planned?"

**This is expected!** That's why actuals exist:
1. Plan with your best estimate
2. Track actuals to see reality
3. Adjust future plans based on patterns
4. Example: Planned groceries $500, average actual $650 → Update plan to $650

### 6.5 "How do I handle irregular expenses?"

**Examples**: Quarterly insurance, annual subscriptions, car repairs

**Option 1**: Plan them when they happen
- Add transaction for specific month
- July: "Car Insurance - $1,200"

**Option 2**: Spread cost over months (better for budgeting)
- Monthly: "Car Insurance Fund - $100"
- Checking → Savings
- When bill comes, pay from savings

### 6.6 "What if I have multiple accounts at same bank?"

**Track them separately in FTrack**:
- "Chase Checking"
- "Chase Savings"
- "Chase Emergency Fund"

This gives better insight into how you're using money.

---

## 7.0 Quick Reference

### 7.1 Account Types Cheat Sheet

| Type      | Examples                  | Balance |
|-----------|---------------------------|---------|
| Asset     | Checking, Savings, Cash   | Positive|
| Liability | Credit Cards, Loans       | Negative|
| Income    | Salary, Freelance, Gifts  | N/A     |
| Expense   | Rent, Groceries, Gas      | N/A     |

### 7.2 Transaction Type Cheat Sheet

| Situation                | Primary Account | Secondary Account | Type      |
|--------------------------|-----------------|-------------------|-----------|
| Get paid                 | Checking        | Salary Income     | Money In  |
| Pay rent                 | Checking        | Rent Expense      | Money Out |
| Buy groceries            | Checking        | Groceries         | Money Out |
| Transfer to savings      | Checking        | Savings           | Money Out |
| Pay credit card          | Checking        | Credit Card       | Money Out |
| Buy with credit card     | Credit Card     | Shopping Expense  | Money Out |
| Receive interest         | Savings         | Interest Income   | Money In  |

### 7.3 Keyboard Shortcuts

- **Enter**: Save current cell
- **Tab**: Move to next cell
- **Esc**: Cancel edit
- **Delete**: Clear cell content
- **Ctrl/Cmd + S**: Save all changes

---

## 8.0 Getting Help

### 8.1 Sample Data

FTrack comes with example data to help you learn. Explore it to see:
- How accounts are set up
- How transactions are structured
- What projections look like

### 8.2 Common Mistakes to Avoid

**Mistake**: Forgetting the secondary account
- **Fix**: Every transaction needs TWO accounts

**Mistake**: Wrong transaction type
- **Fix**: Credit = money IN, Debit = money OUT

**Mistake**: Planning too far ahead initially
- **Fix**: Start with 1-3 months, extend as you get comfortable

**Mistake**: Not updating actuals
- **Fix**: Set a monthly reminder to review

**Mistake**: Giving up when projections are wrong
- **Fix**: Projections improve with time and actual data

---

## 9.0 Next Steps

Now that you understand FTrack:

1. **Start with your baseline**: Set up your current reality
2. **Track for one month**: Update actuals, see how accurate you are
3. **Refine your plans**: Adjust based on what you learned
4. **Experiment with scenarios**: Test ideas for improving your finances
5. **Build the habit**: Monthly review becomes routine

**Remember**: Financial planning is a journey, not a destination. FTrack is here to help you make informed decisions and build a better financial future.

**Good luck!**

---

**Applied Rules**: 1.0, 1.1, 1.2, 1.4, 5.1, 7.1
