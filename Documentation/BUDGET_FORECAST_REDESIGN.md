# Budget & Forecast System - Unified Design
**Date**: December 29, 2025  
**Purpose**: Redesign forecast system as universal budget/projection tool

---

## 1. Core Insight: Everything is Account Projection

Your app fundamentally does one thing: **predict how account balances change over time**.

Whether you call it:
- "Budget" - planned income/expenses for checking account
- "Loan payoff plan" - projected loan balance reduction
- "Investment forecast" - asset growth prediction
- "What-if scenario" - testing different financial strategies

...it's all the same underlying mechanism: **account(s) + planned transactions + time = projected balances**

---

## 2. Proposed Terminology

### Current vs. Proposed

| Current Term | Proposed Term | Reasoning |
|--------------|---------------|-----------|
| Forecast Version | **Scenario** | More intuitive - "Budget Scenario v1", "Loan Payoff Scenario" |
| Forecast Setup | **Planned Transactions** | Clear what they are - transactions that will happen |
| Forecast Results | **Projections** or **Snapshots** | What you get - projected account balances |

### Alternative Naming

| Current | Option A | Option B | Option C |
|---------|----------|----------|----------|
| Forecast Version | Scenario | Budget Template | Plan |
| Forecast Setup | Budget Items | Expected Transactions | Plan Items |
| Forecast Results | Projections | Balance Forecast | Timeline |

**Recommendation**: Use **Scenario / Planned Transactions / Projections**

---

## 3. Unified Data Model

### 3.1. Scenario (formerly Forecast Version)

A scenario is a named collection of assumptions and parameters for projecting account balances.

```json
{
  "id": 1,
  "name": "2026 Monthly Budget v1",
  "type": "budget",
  "description": "Conservative spending plan",
  "primaryAccount": { "id": 5, "name": "Checking Account" },
  "startDate": "2026-01-01",
  "endDate": "2026-12-31",
  "projectionPeriod": "Month",
  "includeInterest": true,
  "includeGrowth": true,
  "createdDate": "2025-12-29",
  "lastCalculated": "2025-12-29T15:00:00Z",
  "tags": ["2026", "budget", "v1"]
}
```

**Key Fields**:
- `type`: "budget" | "loan-payoff" | "investment" | "general" (categorization)
- `primaryAccount`: The main account being projected
- `projectionPeriod`: Granularity of projections (Day/Week/Month/Quarter/Year)
- `includeInterest`: Apply account interest rates in projection
- `includeGrowth`: Apply account growth rates in projection

### 3.2. Planned Transaction (formerly Forecast Setup)

A planned transaction defines expected money movement.

```json
{
  "id": 1,
  "scenarioId": 1,
  "description": "Monthly Salary",
  "fromAccount": { "id": 10, "name": "Income: Salary" },
  "toAccount": { "id": 5, "name": "Checking Account" },
  "amount": 5000,
  "recurrence": {
    "type": "recurring",
    "frequency": "Monthly",
    "interval": 1,
    "startDate": "2026-01-15",
    "endDate": null,
    "dayOfMonth": 15
  },
  "enabled": true,
  "category": "Income",
  "tags": ["salary", "primary-income"]
}
```

**Key Fields**:
- `scenarioId`: Links to parent scenario
- `fromAccount` / `toAccount`: Standard transaction flow (same as transactions page)
- `recurrence`: Defines pattern (one-time or recurring)
- `enabled`: Can disable without deleting (what-if testing)
- `category`: Auto-categorization (Income/Expense/Transfer)

**Recurrence Object**:
```json
{
  "type": "one-time" | "recurring",
  "frequency": "Daily" | "Weekly" | "Biweekly" | "Monthly" | "Quarterly" | "Yearly",
  "interval": 1,
  "startDate": "2026-01-15",
  "endDate": "2026-12-31",
  "dayOfWeek": 1,
  "dayOfMonth": 15,
  "monthOfYear": 1
}
```

### 3.3. Projection (formerly Forecast Results)

Calculated snapshot of account balance at a point in time.

```json
{
  "id": 1,
  "scenarioId": 1,
  "accountId": 5,
  "accountName": "Checking Account",
  "period": "2026-01-31",
  "periodLabel": "January 2026",
  "openingBalance": 2000.00,
  "plannedIncome": 5000.00,
  "plannedExpenses": 3200.00,
  "interestEarned": 5.50,
  "growthAmount": 0.00,
  "netChange": 1805.50,
  "projectedBalance": 3805.50,
  "calculatedAt": "2025-12-29T15:00:00Z"
}
```

**Key Fields**:
- `scenarioId`: Links to parent scenario
- `accountId`: Which account this projection is for
- `period`: End date of this period
- `openingBalance`: Balance at start of period
- `plannedIncome`: Sum of income transactions in period
- `plannedExpenses`: Sum of expense transactions in period
- `interestEarned`: Interest calculated based on account rate
- `growthAmount`: Growth calculated based on account growth rate
- `netChange`: Total change (income - expenses + interest + growth)
- `projectedBalance`: Ending balance (opening + netChange)

---

## 4. How It Works: Universal Projection Engine

### 4.1. Creating a Budget

```javascript
// 1. Create Scenario
const budgetScenario = {
  name: "2026 Monthly Budget",
  type: "budget",
  primaryAccount: checkingAccount,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  projectionPeriod: "Month"
};

// 2. Add Planned Transactions
const plannedTransactions = [
  {
    description: "Salary",
    fromAccount: salaryIncomeAccount,
    toAccount: checkingAccount,
    amount: 5000,
    recurrence: { type: "recurring", frequency: "Monthly", dayOfMonth: 15 }
  },
  {
    description: "Rent",
    fromAccount: checkingAccount,
    toAccount: rentExpenseAccount,
    amount: 1500,
    recurrence: { type: "recurring", frequency: "Monthly", dayOfMonth: 1 }
  }
];

// 3. Generate Projections
const projections = generateProjections(budgetScenario, plannedTransactions);
```

### 4.2. Projection Engine Algorithm

```javascript
function generateProjections(scenario, plannedTransactions) {
  const periods = calculatePeriods(scenario);
  const projections = [];
  
  let currentBalance = scenario.primaryAccount.balance;
  
  for (const period of periods) {
    // 1. Get all transactions that occur in this period
    const periodTransactions = expandRecurrence(plannedTransactions, period);
    
    // 2. Calculate income/expenses
    const income = sumIncome(periodTransactions, scenario.primaryAccount);
    const expenses = sumExpenses(periodTransactions, scenario.primaryAccount);
    
    // 3. Calculate interest (if enabled and account has interest rate)
    let interest = 0;
    if (scenario.includeInterest && scenario.primaryAccount.interest) {
      interest = calculateInterest(
        currentBalance, 
        scenario.primaryAccount.interest,
        period.days
      );
    }
    
    // 4. Calculate growth (if enabled and account has growth rate)
    let growth = 0;
    if (scenario.includeGrowth && scenario.primaryAccount.growth) {
      growth = calculateGrowth(
        currentBalance,
        scenario.primaryAccount.growth,
        period.days
      );
    }
    
    // 5. Calculate net change
    const netChange = income - expenses + interest + growth;
    const projectedBalance = currentBalance + netChange;
    
    // 6. Create projection snapshot
    projections.push({
      scenarioId: scenario.id,
      accountId: scenario.primaryAccount.id,
      accountName: scenario.primaryAccount.name,
      period: period.endDate,
      periodLabel: period.label,
      openingBalance: currentBalance,
      plannedIncome: income,
      plannedExpenses: expenses,
      interestEarned: interest,
      growthAmount: growth,
      netChange: netChange,
      projectedBalance: projectedBalance
    });
    
    // 7. Carry forward balance to next period
    currentBalance = projectedBalance;
  }
  
  return projections;
}
```

### 4.3. Supporting Multiple Accounts

For scenarios tracking multiple accounts (e.g., full budget with checking + savings):

```json
{
  "id": 1,
  "name": "Complete 2026 Budget",
  "type": "budget",
  "accounts": [
    { "id": 5, "name": "Checking", "isPrimary": true },
    { "id": 6, "name": "Savings", "isPrimary": false },
    { "id": 7, "name": "Investment", "isPrimary": false }
  ],
  "startDate": "2026-01-01",
  "endDate": "2026-12-31",
  "projectionPeriod": "Month"
}
```

Then projections are generated for each account, with transactions flowing between them.

---

## 5. Use Cases with Unified Model

### 5.1. Monthly Budget

**Scenario**:
```json
{
  "name": "January 2026 Budget",
  "type": "budget",
  "primaryAccount": { "id": 5, "name": "Checking" },
  "projectionPeriod": "Month"
}
```

**Planned Transactions**:
- Monthly salary (income)
- Rent, utilities, groceries (expenses)
- Savings transfer

**Result**: Projected checking account balance over 12 months

### 5.2. Loan Payoff Projection

**Scenario**:
```json
{
  "name": "Home Loan Payoff Plan",
  "type": "loan-payoff",
  "primaryAccount": { "id": 15, "name": "Home Loan" },
  "projectionPeriod": "Month",
  "includeInterest": true
}
```

**Planned Transactions**:
- Monthly payment (from checking to loan)

**Interest Calculation**:
- Loan account has interest rate
- Interest added each period
- Balance reduces as payments exceed interest

**Result**: Projected loan balance showing payoff timeline

### 5.3. Investment Growth

**Scenario**:
```json
{
  "name": "Retirement Savings Projection",
  "type": "investment",
  "primaryAccount": { "id": 20, "name": "401k" },
  "projectionPeriod": "Year",
  "includeGrowth": true
}
```

**Planned Transactions**:
- Monthly contributions

**Growth Calculation**:
- Account has annual growth rate (e.g., 7%)
- Compound growth applied each period

**Result**: Projected investment value over 30 years

### 5.4. What-If Testing

**Base Scenario**: "2026 Budget v1"
**Clone to**: "2026 Budget v2 - Aggressive Savings"

**Changes**:
- Increase savings transaction amount
- Reduce entertainment expenses

**Compare Projections**:
- v1: Checking balance after 12 months = $5,000
- v2: Checking balance after 12 months = $8,500

---

## 6. Account Schema Enhancements

To support projections, accounts need optional interest/growth fields:

```json
{
  "id": 5,
  "name": "Checking Account",
  "type": "Asset",
  "balance": 2000,
  "interest": {
    "enabled": true,
    "rate": 0.02,
    "compoundingFrequency": "Monthly",
    "calculationType": "Simple"
  },
  "growth": {
    "enabled": false,
    "rate": 0,
    "type": "Percentage"
  }
}
```

**Loan Account Example**:
```json
{
  "id": 15,
  "name": "Home Loan",
  "type": "Liability",
  "balance": 250000,
  "interest": {
    "enabled": true,
    "rate": 0.045,
    "compoundingFrequency": "Monthly",
    "calculationType": "Compound"
  }
}
```

**Investment Account Example**:
```json
{
  "id": 20,
  "name": "401k Retirement",
  "type": "Asset",
  "balance": 50000,
  "growth": {
    "enabled": true,
    "rate": 0.07,
    "type": "Compound-Annual"
  }
}
```

---

## 7. Page Structure Recommendation

### Option A: Keep 3-Section Layout

**Section 1: Scenarios**
- Create/edit budget scenarios
- Select active scenario
- Clone scenario for what-if testing

**Section 2: Planned Transactions**
- Add/edit expected transactions for selected scenario
- Enable/disable without deleting
- Filter by active scenario

**Section 3: Projections**
- View calculated balance projections
- Charts/graphs of account trajectory
- Read-only (regenerate on demand)

### Option B: Separate Pages

**Page 1: Budgets (Scenarios)**
- Manage budget scenarios

**Page 2: Budget Setup (when scenario selected)**
- Configure planned transactions
- Generate projection button

**Page 3: Budget Analysis (Projections)**
- View projections
- Compare scenarios
- Export reports

### Recommendation: Option A (Current 3-section structure)

---

## 8. UI Workflow

### Creating a Budget

```
1. Section 1: Create Scenario
   - Name: "2026 Monthly Budget v1"
   - Type: Budget
   - Primary Account: Checking
   - Period: Month
   - Dates: Jan 1 - Dec 31, 2026

2. Section 2: Add Planned Transactions
   - Salary: $5000/month, 15th of month
   - Rent: $1500/month, 1st of month
   - Groceries: $600/month, 1st of month
   - Utilities: $200/month, 5th of month

3. Click "Generate Projection" button

4. Section 3: View Results
   - Table showing monthly projections
   - Chart showing balance over time
   - Summary: Ending balance = $X
```

### Testing What-If

```
1. Clone existing scenario
   - "2026 Monthly Budget v1" → "2026 Budget v2 - Higher Savings"

2. Modify planned transactions in v2
   - Add: Savings transfer $500/month

3. Generate projection for v2

4. Compare:
   - v1 ending balance: $5,000
   - v2 ending balance: $8,500
   - Difference: $3,500 (exactly $500 × 12 months - savings worked!)
```

---

## 9. Data Structure Updates

### 9.1. Rename Fields

**File**: `forecast-template-grid.json` → `scenario-grid.json`
- `accounts` → `primaryAccount`
- Add: `type`, `includeInterest`, `includeGrowth`

**File**: `forecast-setup-grid.json` → `planned-transactions-grid.json`
- `versionId` → `scenarioId`
- Replace `account`/`transaction`/`movement` with `fromAccount`/`toAccount`
- Replace `date` with `recurrence` object
- Add: `enabled`, `category`

**File**: `forecast-snapshot-grid.json` → `projections-grid.json`
- `versionId` → `scenarioId`
- Remove: `movement`, `accountSecondary`
- Add: `plannedIncome`, `plannedExpenses`, `interestEarned`, `growthAmount`, `netChange`, `projectedBalance`

### 9.2. Update app-data.json

```json
{
  "scenarios": [],
  "plannedTransactions": [],
  "projections": []
}
```

---

## 10. Implementation Phases

### Phase 1: Terminology & Schema Updates
- Rename database fields
- Update grid schemas
- Update UI labels
- Migrate existing data

### Phase 2: Enhanced Account Model
- Add interest/growth fields to accounts schema
- Update accounts page UI
- Add interest/growth calculators

### Phase 3: Recurrence System
- Design recurrence object structure
- Build recurrence UI component
- Implement recurrence expander

### Phase 4: Projection Engine
- Build period calculator
- Build transaction expander (recurrence → instances)
- Build interest calculator
- Build growth calculator
- Build balance projector

### Phase 5: UI Enhancements
- "Generate Projection" button
- Charts/graphs for projections
- Scenario comparison view
- Clone scenario feature

### Phase 6: Advanced Features
- Multi-account scenarios
- Actual vs. projected comparison
- Budget tracking (mark transactions as complete)
- Alerts (projected shortfall warnings)

---

## 11. Terminology Decision Matrix

| Term | Pros | Cons | Score |
|------|------|------|-------|
| **Scenario** | ✅ Familiar (what-if scenarios)<br>✅ Works for all use cases<br>✅ Professional | ⚠️ Generic | 9/10 |
| Budget Template | ✅ Clear for budgeting use case | ❌ Doesn't fit loan/investment cases | 6/10 |
| Plan | ✅ Simple<br>✅ Universal | ⚠️ Vague | 7/10 |
| **Planned Transaction** | ✅ Very clear what it is<br>✅ Distinguishes from actual transactions | ⚠️ Longer name | 9/10 |
| Budget Item | ✅ Clear for budgeting | ❌ Doesn't fit other use cases | 6/10 |
| Expected Transaction | ✅ Clear | ⚠️ Sounds uncertain | 7/10 |
| **Projection** | ✅ Clear it's calculated/forecasted<br>✅ Professional term | | 9/10 |
| Forecast | ✅ Clear | ⚠️ Weather connotation | 8/10 |
| Snapshot | ✅ Point-in-time clarity | ⚠️ Suggests past, not future | 7/10 |

**Recommendation**: **Scenario / Planned Transactions / Projections**

---

## 12. Recommended Next Steps

1. **Review & Decide**: 
   - Approve terminology (Scenario/Planned/Projections)
   - Approve data model
   - Approve account enhancements (interest/growth)

2. **Update Schemas**:
   - Rename files and fields
   - Update grid definitions
   - Migrate sample data

3. **Build Recurrence Component**:
   - UI for defining recurrence patterns
   - Validator for recurrence rules

4. **Build Projection Engine**:
   - Start with simple case (no interest/growth)
   - Add interest calculation
   - Add growth calculation

5. **Test End-to-End**:
   - Create budget scenario
   - Add planned transactions
   - Generate projections
   - Verify accuracy

Would you like me to proceed with implementing the schema updates and data migrations?
