# Goal-Based Scenario Type: Conceptual Design (Final)

**Version**: 3.0.0  
**Date**: February 4, 2026  
**Purpose**: Design specification for goal-based planning integrated directly into the account model.

---

## 1.0 Overview

The **Goal-Based Planning** scenario type enables users to define a financial goal (target amount + date) **directly on each account**, then click "Generate" to automatically create the necessary recurring transactions using the existing recurrence and periodic change infrastructure.

### 1.1 Core Concept

Instead of a separate goals entity, goals are **lightweight properties on accounts**:
- `account.goalAmount` — Target balance to reach
- `account.goalDate` — Date by which to reach it

Users click a **"Generate"** button, and the system:
1. Calculates the required monthly contribution
2. Creates a recurring transaction with **the same recurrence/periodic change logic** as regular transactions
3. The generated transaction can be edited, duplicated, or deleted like any other transaction

### 1.2 Goal Use Case Groups

Goals map to a small set of repeatable workflows that fit the current account and transaction model.

#### 1.2.1 Savings Growth
- Build an emergency fund to $X by date Y
- Save for a down payment or large purchase
- Accumulate a sinking fund for annual expenses

**Interactive Example**: Emergency Fund
- Goal: $10,000 by Dec 2026
- User chooses contribution cadence:
  - Monthly → system shows $323/month
  - Weekly → system shows $74/week
  - Yearly → system shows $3,876/year
- User adjusts the **date** to Dec 2027 → system recalculates lower per‑period amount
- User increases **amount** to $12,000 → system recalculates higher per‑period amount

#### 1.2.2 Debt Reduction
- Pay off a credit card or loan to $0 by date Y
- Reduce a liability to a threshold amount
- Multi-debt payoff across several accounts

**Interactive Example**: Credit Card Payoff
- Goal: $0 by Sep 2026 on a $4,800 balance
- User sets a weekly payment cap ($120/week)
- System recalculates the **payoff date** based on that payment
- User moves date earlier → system recalculates higher payment

#### 1.2.3 Buffer and Stability
- Maintain a minimum balance by a target date
- Build a cash runway to cover N months of expenses
- Smooth seasonal income with a target buffer

**Interactive Example**: Cash Buffer
- Goal: Keep checking ≥ $1,000 by Apr 2026
- User changes contribution frequency to monthly
- System recalculates the monthly top‑up needed

#### 1.2.4 Investment Contribution
- Reach an investment balance target by date Y
- Combine deposits with expected return via periodic change

**Interactive Example**: Investment Target
- Goal: $25,000 by Dec 2027 with expected return
- User edits the target amount → system recalculates per‑period contribution

#### 1.2.5 Milestones and Staging
- Same account with staged goals such as $5k by June and $10k by December

**Interactive Example**: Staged Goals
- Goal 1: $5,000 by Jun 2026
- Goal 2: $10,000 by Dec 2026
- User adjusts the second date → system recalculates the second contribution amount

---

## 2.0 Data Model

### 2.1 Account Extensions

Add two fields to the existing account model:

```javascript
{
  id: 5,
  name: "Emergency Fund",
  type: { id: 1, name: "Asset" },
  currency: { id: 1, name: "ZAR" },
  startingBalance: 2000,
  openDate: "2026-02-04",
  periodicChange: null,
  // NEW FIELDS:
  goalAmount: 10000,              // Target balance to reach (null if no goal)
  goalDate: "2026-12-31"          // Target date to reach it (null if no goal)
}
```

### 2.2 No New Data Structure

- **No separate `goals[]` array** (unlike v2.0)
- Goals are properties of accounts, just like `startingBalance` or `periodicChange`
- Multiple accounts can have independent goals
- Single goal per account (or no goal if `goalAmount` is null)

### 2.3 Storage Location

Goals persist in `app-data.json` exactly where accounts are stored:

```json
{
  "scenarios": [
    {
      "id": 1,
      "name": "2026 Planning",
      "type": { "id": 4, "name": "Goal-Based" },
      "accounts": [
        {
          "id": 5,
          "name": "Emergency Fund",
          "startingBalance": 2000,
          "goalAmount": 10000,        // NEW
          "goalDate": "2026-12-31",   // NEW
          ...
        }
      ],
      "transactions": [
        // Generated transactions from goals
      ]
    }
  ]
}
```

---

## 3.0 Calculation Engine

### 3.1 Core Formula

Let:
- $PV$ = current balance (account's `startingBalance`)
- $FV$ = goal amount (account's `goalAmount`)
- $PMT$ = monthly payment (generated transaction amount)
- $APR$ = annual percentage rate (from account's periodic change if present)
- $r$ = monthly rate = $APR / 12$
- $n$ = number of months (between today and `goalDate`)

**Future Value with Regular Contributions:**
$$FV = PV(1+r)^n + PMT \cdot \frac{(1+r)^n - 1}{r}$$

### 3.2 Single Calculation Mode

**Primary Mode: Solve for Monthly Payment**

**Given**: 
- Account's `startingBalance` (PV)
- Account's `goalAmount` (FV)
- Account's `goalDate` (target date, calculates n)
- Account's optional `periodicChange` (APR)

**Calculate**: 
- Monthly payment (PMT) needed to reach goal

$$PMT = \frac{FV - PV(1+r)^n}{\frac{(1+r)^n - 1}{r}}$$

**Output**: 
Generate a recurring transaction with:
- Amount: Calculated PMT
- Type: Money In (deposit)
- Recurrence: Monthly, from today until `goalDate`
- Periodic Change: Inherit from account if present
- Description: "Goal: {accountName}"
- Tags: `['goal-generated']`

### 3.3 Adjustable Parameters and Solve Modes

Users should be able to “play with” goal parameters. The UI exposes a **Solve For** selector and a **Contribution Frequency** selector.

#### 3.3.1 Solve For Options
- **Contribution Amount**: Solve for periodic payment amount given goal amount and date.
- **Goal Date**: Solve for date given goal amount and periodic payment.
- **Goal Amount**: Solve for target amount given date and periodic payment.

#### 3.3.2 Contribution Frequency Options

The user can choose how often to contribute:
- **Weekly** (frequency id 2)
- **Monthly** (frequency id 3)
- **Quarterly** (frequency id 4)
- **Yearly** (frequency id 5)

The solver converts the goal horizon into periods and solves for the contribution amount per period. The generated transaction uses the selected recurrence frequency and computes the per‑period amount.

#### 3.3.3 Recalculation Behavior

When the user edits any of these inputs, the system recalculates immediately:
- Changing **Goal Date** recalculates contribution amount (for same goal amount)
- Changing **Contribution Amount** recalculates goal date (for same goal amount)
- Changing **Goal Amount** recalculates contribution amount (for same date)
- Changing **Frequency** recalculates the per‑period amount

The user can then click **[Generate]** to create the transaction with the currently selected parameters.

### 3.3 Using Existing Recurrence Logic

The generated transaction **reuses your existing recurrence system**:

```javascript
{
  id: <auto-generated>,
  primaryAccountId: account.id,
  secondaryAccountId: null,
  transactionTypeId: 1,           // Money In
  amount: <calculated PMT>,
  description: `Goal: ${account.name}`,
  effectiveDate: <today>,
  recurrence: {
    frequency: 3,                 // Monthly (from lookup-data.json)
    startDate: <today>,
    endDate: <account.goalDate>
  },
  periodicChange: account.periodicChange,  // Inherit from account (if present)
  status: { name: 'planned' },
  tags: ['goal-generated']
}
```

**This means**:
- Goals automatically support **yearly escalation** if the account has `periodicChange` defined
- Uses the **exact same recurrence utilities** (`generateRecurrenceDates()`) as regular transactions
- Can have **custom recurrence patterns** inherited from account settings
- Full integration with your **projection engine** (projections automatically include goal-generated transactions)

### 3.4 Validation Rules

Goals must satisfy:

1. **Required**: `goalAmount > startingBalance` (goal is forward-looking)
2. **Required**: `goalDate > today` (future-dated)
3. **Numeric**: `goalAmount >= 0`, `goalDate` is valid
4. **Temporal**: At least 1 month from today to goal date
5. **Impossibility Detection**:
   - If calculated PMT < 0: goal is impossible; show validation error
   - Show: "Cannot reach this goal; adjust target amount or date"

---

## 4.0 UI/UX Design

### 4.1 Scenario Type Definition

Add to `lookup-data.json`:

```json
{
  "id": 4,
  "name": "Goal-Based",
  "description": "Accounts with goals; generate transactions automatically",
  "showAccounts": true,
  "showPlannedTransactions": true,
  "showActualTransactions": false,
  "showProjections": true,
  "showGoals": false,
  "accountColumns": ["name", "type", "currency", "balance", "openDate", "goalAmount", "goalDate"],
  "transactionColumns": ["primaryAccount", "secondaryAccount", "transactionType", "amount", "description", "recurrence", "tags"]
}
```

### 4.2 Accounts Grid

When viewing a Goal-Based scenario, the Accounts grid displays **two new columns**:
- **Goal Amount** (currency input, editable)
- **Goal Date** (date picker, editable)

Each account row has an **[Generate]** button (or disabled if `goalAmount` is null).

```
┌─────────────────────────────────────────────────────────────────┐
│ Accounts                                                        │
├─────────────────────────────────────────────────────────────────┤
│ Name  │ Type  │ Currency │ Balance │ Goal Amount │ Goal Date   │
├─────────────────────────────────────────────────────────────────┤
│ Emergency  │ Asset │ ZAR │ 2,000 │ 10,000      │ 2026-12-31 │ [Generate] │
│ Vacation   │ Asset │ ZAR │ 1,500 │ 5,000       │ 2026-06-30 │ [Generate] │
│ Investment │ Asset │ ZAR │ 5,000 │ 20,000      │ 2026-12-31 │ [Generate] │
└─────────────────────────────────────────────────────────────────┘

### 4.3 Generate Plan Section

Below the Accounts grid, add a **Generate Plan** accordion/section. This section shows **only parameters that are not stored on the account**, and lets the user experiment before creating transactions.

**Inputs in Generate Plan** (not stored on the account):
- **Solve For**: Contribution Amount | Goal Date | Goal Amount
- **Contribution Frequency**: Weekly | Monthly | Quarterly | Yearly
- **Contribution Amount** (editable when Solve For ≠ Contribution Amount)

**Read-only outputs**:
- Calculated value for the selected Solve For
- Summary line (e.g., “$323/month to reach $10,000 by Dec 2026”)

**Actions**:
- **[Generate]**: Creates transactions using current parameters
- **[Reset]**: Resets Generate Plan inputs to defaults
```

### 4.4 Generate Button Workflow

When user clicks **[Generate]** for an account:

1. **Modal appears** showing:
   - Account name
   - Current balance
   - Goal amount
   - Goal date
   - Calculated monthly payment (read-only)
   - Any errors/warnings
   
2. **User confirms** by clicking [Generate Transaction]

3. **System**:
   - Validates goal parameters
   - Calculates PMT
   - Creates recurring transaction via `TransactionManager`
   - Adds `tags: ['goal-generated']` for easy identification
   - Closes modal

4. **Transaction appears** in the Transactions grid
   - Can be edited/deleted/duplicated like any transaction
   - Shows in projections automatically

### 4.5 Integration with Existing UI

- **Generate Plan** accordion below Accounts
- **Transactions grid** shows goal-generated transactions alongside manual ones
- **Projections** automatically include goal-generated transactions (via existing projection engine)
- **Optional**: Add visual badge/tag indicator for goal-generated transactions

---

## 5.0 Architecture Integration

### 5.1 Minimal Changes Required

**Add to account model**:
- `goalAmount: number | null`
- `goalDate: string | null` (YYYY-MM-DD format)

**Add utility function** in `goal-calculation-utils.js`:

```javascript
/**
 * Calculate monthly payment to reach a goal
 * @param {number} currentBalance - PV
 * @param {number} goalAmount - FV
 * @param {string} goalDate - Target date (YYYY-MM-DD)
 * @param {number} expectedAnnualReturn - APR (default 0)
 * @returns {Object} { monthlyPayment, isValid, errors }
 */
export function calculateMonthlyPaymentToGoal(currentBalance, goalAmount, goalDate, expectedAnnualReturn = 0) {
  // Use existing FV formula, solve for PMT
  // Return { monthlyPayment, isValid, errors }
}

/**
 * Validate goal parameters
 * @param {Object} account - Account with goalAmount and goalDate
 * @returns {Object} { isValid, errors }
 */
export function validateAccountGoal(account) {
  // Check: goalAmount > currentBalance, goalDate > today, etc.
  // Return { isValid, errors }
}
```

### 5.2 Generate Transaction Flow

```
User clicks [Generate] on account
    ↓
validateAccountGoal(account)
    ↓ (valid)
calculateMonthlyPaymentToGoal(...)
    ↓
Show modal with calculated PMT
    ↓
User confirms [Generate Transaction]
    ↓
Create transaction object with:
  - amount: <calculated PMT>
  - recurrence: from today to goalDate (monthly)
  - periodicChange: inherit from account
    ↓
TransactionManager.saveAll(scenarioId, [...transactions, newTransaction])
    ↓
DataStore persists
    ↓
Refresh Transactions grid + Projections
```

### 5.3 Reuse of Existing Infrastructure

- **Recurrence**: Uses existing `generateRecurrenceDates()` from `calculation-utils.js`
- **Periodic Change**: Transaction inherits account's `periodicChange` if present
- **Projections**: Generated transactions flow through existing `projection-engine.js`
- **Transaction Model**: No changes; generated transactions are standard transactions
- **Data Persistence**: Accounts and transactions persist as before via `DataStore`

### 5.4 Account Manager Extension

Add to `account-manager.js`:

```javascript
/**
 * Update account goal parameters
 * @param {number} scenarioId
 * @param {number} accountId
 * @param {number} goalAmount
 * @param {string} goalDate
 */
export async function updateGoal(scenarioId, accountId, goalAmount, goalDate) {
  return await update(scenarioId, accountId, { goalAmount, goalDate });
}
```

---

## 6.0 Calculation Examples

### Example 1: Basic Goal
**Account**:
- Current Balance: $2,000
- Goal Amount: $10,000
- Goal Date: 2026-12-31 (24 months)
- Expected Annual Return: 0% (no periodic change)

**Calculation**:
- $r = 0 / 12 = 0$ (simple case, no interest)
- $PMT = \frac{10,000 - 2,000}{24} = 333.33$

**Result**: "Generate monthly deposit of **$333/month**"
**Generated Transaction**: Recurring $333 monthly, ends 2026-12-31

### Example 2: Goal with Compound Interest
**Account**:
- Current Balance: $2,000
- Goal Amount: $10,000
- Goal Date: 2026-12-31 (24 months)
- Expected Annual Return: 2% APR (from account's `periodicChange`)

**Calculation**:
- $r = 0.02 / 12 = 0.001667$, $n = 24$
- $(1.001667)^{24} \approx 1.0408$
- $PMT = \frac{10,000 - 2,000(1.0408)}{\frac{1.0408 - 1}{0.001667}} \approx 323$

**Result**: "Generate monthly deposit of **$323/month**"
**Generated Transaction**: Recurring $323 monthly with account's periodic change, ends 2026-12-31

### Example 3: Multiple Accounts with Independent Goals
```
Scenario: "2026 Savings" (Goal-Based)
├─ Emergency Fund
│  ├─ Current: $2,000 | Goal: $10,000 by Dec 2026 (0% APR)
│  ├─ [Generate] → Transaction: $333/month
│  └─ Transaction appears in grid
├─ Vacation Savings
│  ├─ Current: $1,500 | Goal: $5,000 by Jun 2026 (0% APR)
│  ├─ [Generate] → Transaction: $583/month (only 6 months)
│  └─ Transaction appears in grid
├─ Investment Account
│  ├─ Current: $5,000 | Goal: $20,000 by Dec 2026 (5% APR)
│  ├─ [Generate] → Transaction: $250/month
│  └─ Transaction appears in grid with account's periodic change
```

Each goal generates **one independent transaction**. User can then:
- Edit individual transactions
- Add more transactions to same account
- See all transactions + projections together

---

## 7.0 Design Principles

### 7.1 Simplicity Through Reuse

- **Goals are account properties**, not separate entities
- **Generation uses existing recurrence logic** (no new patterns)
- **Periodic change inherits from account** (automatic escalation support)
- **Transactions are identical to user-created ones** (no special handling)

### 7.2 Minimal Schema Changes

Account model gains only 2 fields:
- `goalAmount` (optional, nullable)
- `goalDate` (optional, nullable)

No new tables, no new arrays, no new structures.

### 7.3 Full Integration

- Goal-generated transactions use **existing projection engine**
- Goal generation respects **existing recurrence patterns**
- Goals inherit **existing periodic change logic**
- Calculations use **existing financial utilities**

### 7.4 Multi-Account Support by Default

Each account can independently have:
- Different goal amounts
- Different goal dates
- Different expected returns (via account's `periodicChange`)
- Independent generated transactions

---

## 8.0 User Workflow

**User Journey**:

1. Create Goal-Based scenario
2. Create accounts (e.g., Emergency Fund, Vacation)
3. Set goal on each account:
   - Edit account's `goalAmount` field (e.g., $10,000)
   - Edit account's `goalDate` field (e.g., 2026-12-31)
4. Click **[Generate]** on Emergency Fund account
   - Modal shows: "Need $333/month to reach $10,000 by Dec 2026"
   - User confirms
   - Transaction created: $333/month, monthly recurrence
5. Click **[Generate]** on Vacation account
   - Modal shows: "Need $583/month to reach $5,000 by Jun 2026"
   - User confirms
   - Transaction created: $583/month, monthly recurrence
6. See all transactions in grid
   - Can edit amounts if desired
   - Can add more transactions manually
   - Projections automatically include goal transactions
7. View projections to see if goals are reachable with current plan

---

## 9.0 Future Extensions (Out of Scope)

1. **Goal Status Tracking**: Auto-update status based on actual vs. projected balance
2. **Recalculation**: "Update monthly payment if goal parameters change"
3. **Goal Templates**: Pre-built goals (emergency fund, down payment, etc.)
4. **Multi-Goal Optimization**: "Reach all goals with max $X/month total"
5. **What-If Analysis**: "Show me all goals if I increase monthly budget by $100"

---

## 10.0 Summary

The **Goal-Based Planning** scenario type is fundamentally simple:

- **Add two fields to accounts**: `goalAmount` and `goalDate`
- **Add one button**: [Generate] on each account in the grid
- **Reuse existing infrastructure**: Recurrence, periodic change, projections, transactions
- **Result**: Automatic transaction generation driven by user goals

This approach is elegant because it:
- Requires minimal code changes
- Leverages all existing patterns
- Maintains schema simplicity
- Supports multi-account scenarios naturally
- Allows full user refinement of generated transactions
