# Budget & Forecast System - Complete Design Specification
**Date**: December 29, 2025  
**Purpose**: Full design for universal budget/forecast/projection system

---

## 1. Executive Summary

### 1.1. Approved Terminology
- ✅ **Scenario** (formerly Forecast Version)
- ✅ **Planned Transactions** (formerly Forecast Setup)
- ✅ **Projections** (formerly Forecast Results)

### 1.2. Core Requirements
1. Support multiple accounts per scenario
2. Allow scenario-specific account parameters (interest/growth rates)
3. Allow scenario-specific transaction parameters (amount/dates/recurrence)
4. Integrate with existing accounts and transactions
5. Manual "Generate Projection" button (not auto-calculate)
6. Add interest/growth to account schema
7. Primary account filtering with secondary account display
8. **Debits = Credits**: Every transaction creates paired debit/credit entries

### 1.3. Critical Design Challenges

**Challenge 1: Account Parameters Vary by Scenario**

**Problem**: Same account needs different parameters in different scenarios

**Example**:
- Scenario A: "Current Loan" - Home loan at 4.5% interest
- Scenario B: "Refinance Plan" - Same home loan at 3.8% interest
- Base account can't have both rates

**Solution**: Scenario-level account parameter overrides

**Challenge 2: Transaction Parameters Vary by Scenario**

**Problem**: Same transaction template needs different values in different scenarios

**Example**:
- Base transaction: "Monthly Rent" - $1500
- Scenario A: "Current Situation" - $1500/month
- Scenario B: "After Moving" - $1800/month
- Base transaction can't have both amounts

**Solution**: Scenario-level transaction parameter overrides

**Challenge 3: Double-Entry Bookkeeping**

**Problem**: Debits must equal credits for accurate accounting

**Requirement**: Every planned transaction generates two projection entries:
- Debit entry on primary account
- Credit entry on secondary account

**Solution**: Projection engine creates paired transactions ensuring balanced books

---

## 2. Integration with Existing Accounts & Transactions

### 2.1. Relationship Model

```
┌─────────────────┐
│    Accounts     │ ← Master list (shared across all scenarios)
│  (Base data)    │
└─────────────────┘
        ↑
        │ references
        │
┌─────────────────┐         ┌──────────────────┐
│   Scenario      │────────→│ Account Override │
│                 │         │ (per scenario)   │
└─────────────────┘         └──────────────────┘
        │
        │ contains
        ↓
┌─────────────────┐         ┌─────────────────┐
│ Planned Trans.  │────────→│  Transactions   │
│ (in scenario)   │ links   │  (Master list)  │
└─────────────────┘         └─────────────────┘
```

### 2.2. Accounts Integration

**Base Account** (from accounts page):
```json
{
  "id": 5,
  "name": "Checking Account",
  "type": "Asset",
  "balance": 2000,
  "interest": {
    "rate": 0.02,
    "compounding": "Monthly"
  },
  "growth": null
}
```

**Scenario Override** (scenario-specific parameters):
```json
{
  "scenarioId": 1,
  "accountId": 5,
  "overrides": {
    "interest": {
      "rate": 0.025,
      "compounding": "Monthly"
    },
    "balance": 2500,
    "customLabel": "Checking (after bonus)"
  }
}
```

**Effective Values** (when generating projections):
- If override exists → use override values
- If no override → use base account values

### 2.3. Transactions Integration

**Existing Transaction** (from transactions page):
```json
{
  "id": 100,
  "description": "Monthly Rent Payment",
  "debit_account": { "id": 5, "name": "Checking" },
  "credit_account": { "id": 20, "name": "Rent Expense" },
  "amount": 1500,
  "date": "2025-12-01",
  "isRecurring": false
}
```

**Planned Transaction** (references existing transaction):
```json
{
  "id": 1,
  "scenarioId": 1,
  "transactionTemplateId": 100,
  "description": "Monthly Rent Payment",
  "fromAccount": { "id": 5, "name": "Checking" },
  "toAccount": { "id": 20, "name": "Rent Expense" },
  "amount": 1500,
  "recurrence": {
    "type": "recurring",
    "frequency": "Monthly",
    "dayOfMonth": 1
  },
  "enabled": true
}
```

**Creating New Transaction from Planned Transaction**:
When user types new transaction name in dropdown:
1. Create planned transaction in scenario
2. Also create base transaction in transactions list (simple version)
3. Link via `transactionTemplateId`

---

## 3. Complete Data Schemas

### 3.1. Scenario Schema

**File**: `scenario-grid.json` (formerly forecast-template-grid.json)

```json
{
  "id": 1,
  "name": "2026 Monthly Budget v1",
  "type": "budget",
  "description": "Conservative spending plan for 2026",
  "startDate": "2026-01-01",
  "endDate": "2026-12-31",
  "projectionPeriod": "Month",
  "accounts": [
    { "id": 5, "name": "Checking Account", "isPrimary": true },
    { "id": 6, "name": "Savings Account", "isPrimary": false }
  ],
  "accountOverrides": [
    {
      "accountId": 5,
      "interest": { "rate": 0.025, "compounding": "Monthly" },
      "growth": null,
      "startingBalance": 2500
    }
  ],
  "transactionOverrides": [
    {
      "plannedTransactionId": 10,
      "amount": 1800,
      "recurrence": {
        "startDate": "2026-06-01"
      }
    }
  ],
  "createdDate": "2025-12-29",
  "lastCalculated": null,
  "tags": ["2026", "budget", "v1"]
}
```

**Fields**:
- `id`: Unique identifier
- `name`: User-friendly name
- `type`: "budget" | "loan-payoff" | "investment" | "general"
- `description`: Optional notes
- `startDate`: Projection start
- `endDate`: Projection end
- `projectionPeriod`: "Day" | "Week" | "Month" | "Quarter" | "Year"
- `accounts`: Array of accounts included in scenario (one must be primary)
- `accountOverrides`: Scenario-specific parameters for accounts
- `transactionOverrides`: Scenario-specific parameters for planned transactions
- `createdDate`: When scenario was created
- `lastCalculated`: Last projection generation timestamp
- `tags`: Organization tags

### 3.2. Account Override Schema

**Structure** (embedded in scenario):
```json
{
  "accountId": 5,
  "interest": {
    "rate": 0.025,
    "compounding": "Monthly",
    "calculationType": "Compound"
  },
  "growth": {
    "rate": 0.07,
    "type": "Compound-Annual"
  },
  "startingBalance": 2500,
  "customLabel": "Checking (after tax refund)"
}
```

**Fields**:
- `accountId`: Which account to override
- `interest`: Override interest parameters (optional)
- `growth`: Override growth parameters (optional)
- `startingBalance`: Override opening balance (optional)
- `customLabel`: Display name override (optional)

### 3.2b. Transaction Override Schema

**Structure** (embedded in scenario):
```json
{
  "plannedTransactionId": 10,
  "amount": 1800,
  "fromAccount": { "id": 5, "name": "Checking" },
  "toAccount": { "id": 22, "name": "New Rent Expense" },
  "recurrence": {
    "startDate": "2026-06-01",
    "endDate": "2026-12-31"
  },
  "description": "Monthly Rent (after moving)",
  "enabled": true
}
```

**Fields**:
- `plannedTransactionId`: Which planned transaction to override
- `amount`: Override amount (optional)
- `fromAccount`: Override source account (optional)
- `toAccount`: Override destination account (optional)
- `recurrence`: Override recurrence parameters (optional, partial override supported)
- `description`: Override description (optional)
- `enabled`: Override enabled state (optional)

**Note**: Overrides are partial - only specified fields are overridden, others use base planned transaction values

### 3.3. Planned Transaction Schema

**File**: `planned-transactions-grid.json` (formerly forecast-setup-grid.json)

```json
{
  "id": 1,
  "scenarioId": 1,
  "transactionTemplateId": 100,
  "description": "Monthly Salary Deposit",
  "fromAccount": { "id": 10, "name": "Income: Salary" },
  "toAccount": { "id": 5, "name": "Checking Account" },
  "amount": 5000,
  "recurrence": {
    "type": "recurring",
    "frequency": "Monthly",
    "interval": 1,
    "startDate": "2026-01-15",
    "endDate": null,
    "dayOfMonth": 15,
    "dayOfWeek": null,
    "monthOfYear": null
  },
  "enabled": true,
  "category": "Income",
  "tags": ["salary", "primary-income"]
}
```

**Fields**:
- `id`: Unique identifier
- `scenarioId`: Parent scenario
- `transactionTemplateId`: Link to base transaction (null if scenario-specific)
- `description`: Transaction description
- `fromAccount`: Source account (debit)
- `toAccount`: Destination account (credit)
- `amount`: Transaction amount
- `recurrence`: Recurrence pattern (see below)
- `enabled`: Can disable without deleting
- `category`: Auto-categorized ("Income" | "Expense" | "Transfer")
- `tags`: Organization tags

### 3.4. Recurrence Schema

```json
{
  "type": "one-time" | "recurring",
  "frequency": "Daily" | "Weekly" | "Biweekly" | "Monthly" | "Quarterly" | "Yearly",
  "interval": 1,
  "startDate": "2026-01-15",
  "endDate": "2026-12-31",
  "dayOfMonth": 15,
  "dayOfWeek": 1,
  "monthOfYear": 1
}
```

**Fields**:
- `type`: One-time or recurring
- `frequency`: How often
- `interval`: Every X periods (e.g., every 2 weeks)
- `startDate`: When to start
- `endDate`: When to end (null = use scenario end)
- `dayOfMonth`: For monthly/quarterly/yearly (1-31)
- `dayOfWeek`: For weekly (1=Mon, 7=Sun)
- `monthOfYear`: For yearly (1-12)

### 3.5. Projection Schema

**File**: `projections-grid.json` (formerly forecast-snapshot-grid.json)

```json
{
  "id": 1,
  "scenarioId": 1,
  "accountId": 5,
  "accountName": "Checking Account",
  "isPrimary": true,
  "period": "2026-01-31",
  "periodLabel": "January 2026",
  "periodType": "Month",
  "openingBalance": 2000.00,
  "totalDebits": 3200.00,
  "totalCredits": 5000.00,
  "netTransactions": 1800.00,
  "interestEarned": 4.17,
  "growthAmount": 0.00,
  "netChange": 1804.17,
  "projectedBalance": 3804.17,
  "transactionCount": 8,
  "calculatedAt": "2025-12-29T15:30:00Z"
}
```

**Fields**:
- `id`: Unique identifier
- `scenarioId`: Parent scenario
- `accountId`: Which account
- `accountName`: Account display name
- `isPrimary`: Whether this is the primary account for the scenario
- `period`: Period end date
- `periodLabel`: Human-readable period
- `periodType`: "Day" | "Week" | "Month" | etc.
- `openingBalance`: Balance at period start
- `totalDebits`: Sum of all debits to this account
- `totalCredits`: Sum of all credits to this account
- `netTransactions`: Credits - Debits (net change from transactions)
- `interestEarned`: Interest calculated
- `growthAmount`: Growth calculated
- `netChange`: Total change (netTransactions + interest + growth)
- `projectedBalance`: Ending balance
- `transactionCount`: Number of transactions affecting this account
- `calculatedAt`: When calculated

**Note**: Every planned transaction creates TWO projection entries:
1. Debit entry on one account (reduces balance)
2. Credit entry on another account (increases balance)

This ensures debits always equal credits across all accounts.

---

## 4. Enhanced Account Schema

**File**: `accounts-grid.json`

**Add fields**:
```json
{
  "field": "interest",
  "header": "Interest Settings",
  "type": "modal",
  "editable": true,
  "display": true,
  "modalSchema": {
    "columns": [
      {
        "field": "enabled",
        "header": "Enable Interest",
        "type": "checkbox",
        "default": false
      },
      {
        "field": "rate",
        "header": "Annual Rate (%)",
        "type": "number",
        "default": 0
      },
      {
        "field": "compounding",
        "header": "Compounding",
        "type": "select",
        "optionsSource": "compoundingFrequencies",
        "default": "Monthly"
      },
      {
        "field": "calculationType",
        "header": "Calculation Type",
        "type": "select",
        "optionsSource": "calculationTypes",
        "default": "Compound"
      }
    ]
  },
  "default": null
}
```

```json
{
  "field": "growth",
  "header": "Growth Settings",
  "type": "modal",
  "editable": true,
  "display": true,
  "modalSchema": {
    "columns": [
      {
        "field": "enabled",
        "header": "Enable Growth",
        "type": "checkbox",
        "default": false
      },
      {
        "field": "rate",
        "header": "Annual Rate (%)",
        "type": "number",
        "default": 0
      },
      {
        "field": "type",
        "header": "Growth Type",
        "type": "select",
        "optionsSource": "growthTypes",
        "default": "Compound-Annual"
      }
    ]
  },
  "default": null
}
```

**Add option lists**:
```json
"compoundingFrequencies": [
  { "id": 1, "name": "Daily" },
  { "id": 2, "name": "Weekly" },
  { "id": 3, "name": "Monthly" },
  { "id": 4, "name": "Quarterly" },
  { "id": 5, "name": "Annually" }
],
"calculationTypes": [
  { "id": 1, "name": "Simple" },
  { "id": 2, "name": "Compound" }
],
"growthTypes": [
  { "id": 1, "name": "Linear" },
  { "id": 2, "name": "Compound-Annual" }
]
```

---

## 5. Workflow Examples

### 5.1. Creating a Budget from Scratch

**Step 1: Create Scenario**
```
Section 1: Scenarios
- Click "Add New Scenario"
- Name: "2026 Monthly Budget"
- Type: Budget
- Start Date: 2026-01-01
- End Date: 2026-12-31
- Projection Period: Month
- Add Accounts:
  - Checking Account (primary)
  - Savings Account
- Override Checking interest: 2.5% (better rate than base 2.0%)
- Save
```

**Step 2: Add Planned Transactions**
```
Section 2: Planned Transactions (filtered to active scenario)
- Add: Monthly Salary
  - From: Income: Salary (select from dropdown)
  - To: Checking Account
  - Amount: 5000
  - Recurrence: Monthly, 15th of month
  
- Add: Rent Payment
  - From: Checking Account
  - To: Rent Expense
  - Amount: 1500
  - Recurrence: Monthly, 1st of month
  
- Add: Savings Transfer
  - From: Checking Account
  - To: Savings Account
  - Amount: 500
  - Recurrence: Monthly, 16th of month
```

**Step 3: Generate Projections**
```
- Click "Generate Projection" button
- System calculates:
  - 12 periods (January - December 2026)
  - For each account (Checking, Savings)
  - Applies transactions, interest, growth
  
Section 3: Projections (view results)
- Table showing month-by-month projections
- Checking ending balance: $25,000
- Savings ending balance: $6,300 (includes interest)
```

### 5.2. Using Existing Transactions

**Scenario**: User already has recurring rent transaction in transactions list

**Planned Transaction Creation**:
```
1. In planned transactions dropdown: select "Monthly Rent Payment"
2. System auto-fills:
   - From: Checking Account
   - To: Rent Expense
   - Amount: 1500
   - Description: "Monthly Rent Payment"
3. User sets recurrence pattern
4. transactionTemplateId = 100 (links to base transaction)
```

### 5.3. Creating New Simple Transaction

**Scenario**: User types "Netflix Subscription" (doesn't exist)

**What Happens**:
```
1. User types "Netflix Subscription" in planned transaction dropdown
2. System creates:
   a. Planned Transaction (in scenario):
      - description: "Netflix Subscription"
      - transactionTemplateId: 150 (newly generated)
      
   b. Base Transaction (in transactions list):
      - id: 150
      - description: "Netflix Subscription"
      - amount: 0 (placeholder)
      - isRecurring: false
      
3. User completes planned transaction:
   - From: Checking
   - To: Entertainment Expense
   - Amount: 15
   - Recurrence: Monthly
```

**Result**: Transaction now exists in both places, properly linked

### 5.4. Testing Different Interest Rates (What-If)

**Scenario A**: "Current Home Loan"
```
- Account: Home Loan (balance: $250,000)
- Override interest: 4.5%
- Planned transaction: $2,000/month payment
- Projection: Paid off in 15.2 years
```

**Clone to Scenario B**: "Refinance at Lower Rate"
```
- Same account: Home Loan
- Override interest: 3.8%
- Same planned transaction: $2,000/month payment
- Projection: Paid off in 14.1 years
- Savings: 1.1 years faster, $18,500 less interest
```

---

## 6. Data Manager Updates

### 6.1. New Methods Needed

```javascript
// Scenarios
dataManager.saveScenarios(scenarios)
dataManager.getScenario(scenarioId)
dataManager.cloneScenario(scenarioId, newName)

// Planned Transactions
dataManager.savePlannedTransactions(plannedTransactions, scenarioId)
dataManager.getPlannedTransactions(scenarioId)

// When creating planned transaction with new transaction template
dataManager.createPlannedTransactionWithTemplate(plannedTx, scenarioId) {
  // 1. Check if transactionTemplateId exists in transactions
  // 2. If not, create base transaction
  // 3. Save planned transaction
  // 4. Link via transactionTemplateId
}

// Projections
dataManager.saveProjections(projections, scenarioId)
dataManager.getProjections(scenarioId, accountId)
dataManager.clearProjections(scenarioId)

// Account overrides (part of scenario)
// Stored in scenario.accountOverrides array
```

### 6.2. Auto-Linking Logic

**When saving planned transaction**:
```javascript
async savePlannedTransactions(plannedTransactions, scenarioId) {
  await this.loadData();
  
  for (const plannedTx of plannedTransactions) {
    // Check if transaction template exists
    if (plannedTx.transactionTemplateId) {
      const exists = this.cachedData.transactions.find(
        t => t.id === plannedTx.transactionTemplateId
      );
      
      if (!exists) {
        // Create base transaction
        const newTransaction = {
          id: plannedTx.transactionTemplateId,
          description: plannedTx.description,
          debit_account: plannedTx.fromAccount,
          credit_account: plannedTx.toAccount,
          amount: plannedTx.amount,
          isRecurring: true,
          date: plannedTx.recurrence.startDate
        };
        this.cachedData.transactions.push(newTransaction);
      }
    }
    
    // Ensure scenarioId is set
    plannedTx.scenarioId = scenarioId;
  }
  
  // Filter existing planned transactions for this scenario
  this.cachedData.plannedTransactions = this.cachedData.plannedTransactions
    .filter(pt => pt.scenarioId !== scenarioId);
  
  // Add updated planned transactions
  this.cachedData.plannedTransactions.push(...plannedTransactions);
  
  await this.saveData();
}
```

---

## 7. Projection Engine Specification

### 7.1. High-Level Algorithm

```javascript
function generateProjections(scenario) {
  // 1. Get scenario data
  const plannedTransactions = getPlannedTransactions(scenario.id);
  const accounts = scenario.accounts;
  
  // 2. Calculate periods
  const periods = calculatePeriods(
    scenario.startDate,
    scenario.endDate,
    scenario.projectionPeriod
  );
  
  // 3. For each account in scenario
  const allProjections = [];
  for (const account of accounts) {
    const projections = projectAccount(
      account,
      scenario,
      plannedTransactions,
      periods
    );
    allProjections.push(...projections);
  }
  
  return allProjections;
}
```

### 7.2. Period Calculation

```javascript
function calculatePeriods(startDate, endDate, periodType) {
  const periods = [];
  let currentDate = new Date(startDate);
  const end = new Date(endDate);
  
  while (currentDate <= end) {
    const periodEnd = addPeriod(currentDate, periodType);
    periods.push({
      startDate: new Date(currentDate),
      endDate: periodEnd,
      label: formatPeriodLabel(currentDate, periodType),
      days: daysBetween(currentDate, periodEnd)
    });
    currentDate = new Date(periodEnd);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return periods;
}
```

### 7.3. Transaction Expansion

```javascript
function expandRecurrence(plannedTransaction, period) {
  if (plannedTransaction.recurrence.type === 'one-time') {
    // Check if one-time date falls in period
    const txDate = new Date(plannedTransaction.recurrence.startDate);
    if (txDate >= period.startDate && txDate <= period.endDate) {
      return [{
        date: txDate,
        amount: plannedTransaction.amount,
        fromAccount: plannedTransaction.fromAccount,
        toAccount: plannedTransaction.toAccount
      }];
    }
    return [];
  }
  
  // Recurring: generate instances in period
  const instances = [];
  const recurrence = plannedTransaction.recurrence;
  
  // Generate based on frequency
  // ... implementation details
  
  return instances;
}
```

### 7.4. Account Projection (Double-Entry)

```javascript
function projectAccount(account, scenario, plannedTransactions, periods) {
  const projections = [];
  
  // Get effective account parameters (with overrides)
  const effectiveParams = getEffectiveAccountParams(account, scenario);
  let currentBalance = effectiveParams.startingBalance || account.balance;
  
  for (const period of periods) {
    // 1. Expand planned transactions for this period
    const periodTransactions = plannedTransactions
      .filter(pt => pt.enabled)
      .flatMap(pt => expandRecurrence(pt, period));
    
    // 2. Calculate debits and credits for this account
    // Each planned transaction creates TWO entries:
    //   - Debit on fromAccount
    //   - Credit on toAccount
    const debits = periodTransactions
      .filter(tx => tx.fromAccount.id === account.id)
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const credits = periodTransactions
      .filter(tx => tx.toAccount.id === account.id)
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const netTransactions = credits - debits;
    
    // 3. Calculate interest
    let interest = 0;
    if (effectiveParams.interest?.enabled) {
      interest = calculateInterest(
        currentBalance,
        effectiveParams.interest.rate,
        effectiveParams.interest.compounding,
        period.days
      );
    }
    
    // 4. Calculate growth
    let growth = 0;
    if (effectiveParams.growth?.enabled) {
      growth = calculateGrowth(
        currentBalance,
        effectiveParams.growth.rate,
        effectiveParams.growth.type,
        period.days
      );
    }
    
    // 5. Calculate projected balance
    const netChange = netTransactions + interest + growth;
    const projectedBalance = currentBalance + netChange;
    
    // 6. Create projection
    projections.push({
      scenarioId: scenario.id,
      accountId: account.id,
      accountName: account.name,
      isPrimary: account.isPrimary,
      period: period.endDate,
      periodLabel: period.label,
      periodType: scenario.projectionPeriod,
      openingBalance: currentBalance,
      totalDebits: debits,
      totalCredits: credits,
      netTransactions: netTransactions,
      interestEarned: interest,
      growthAmount: growth,
      netChange: netChange,
      projectedBalance: projectedBalance,
      transactionCount: periodTransactions.filter(tx => 
        tx.fromAccount.id === account.id || tx.toAccount.id === account.id
      ).length
    });
    
    // 7. Carry forward
    currentBalance = projectedBalance;
  }
  
  return projections;
}

// Validation: Ensure debits = credits across all accounts
function validateDoubleEntry(allProjections, period) {
  const totalDebits = allProjections
    .filter(p => p.period === period)
    .reduce((sum, p) => sum + p.totalDebits, 0);
  
  const totalCredits = allProjections
    .filter(p => p.period === period)
    .reduce((sum, p) => sum + p.totalCredits, 0);
  
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error(
      `Double-entry validation failed for ${period}: ` +
      `Debits=${totalDebits}, Credits=${totalCredits}`
    );
  }
}
```

### 7.5. Interest Calculation

```javascript
function calculateInterest(principal, annualRate, compounding, days) {
  const rate = annualRate / 100; // Convert percentage
  
  switch (compounding) {
    case 'Daily':
      return principal * Math.pow(1 + rate/365, days) - principal;
    case 'Monthly':
      const months = days / 30.44; // Average days per month
      return principal * Math.pow(1 + rate/12, months) - principal;
    case 'Quarterly':
      const quarters = days / 91.31;
      return principal * Math.pow(1 + rate/4, quarters) - principal;
    case 'Annually':
      const years = days / 365.25;
      return principal * Math.pow(1 + rate, years) - principal;
    default:
      return 0;
  }
}
```

### 7.6. Growth Calculation

```javascript
function calculateGrowth(principal, annualRate, type, days) {
  const rate = annualRate / 100;
  const years = days / 365.25;
  
  switch (type) {
    case 'Linear':
      return principal * rate * years;
    case 'Compound-Annual':
      return principal * Math.pow(1 + rate, years) - principal;
    default:
      return 0;
  }
}
```

---

## 8. UI/UX Specifications

### 8.1. Page Layout (3-Section)

**Section 1: Scenarios**
- Grid showing all scenarios
- Columns: Name, Type, Date Range, Primary Account, Last Calculated, Actions
- Select row → becomes "active scenario"
- Actions: Edit, Clone, Delete, Generate
- "Generate Projection" button (for active scenario)

**Section 2: Planned Transactions**
- **Primary Account Filter**: Dropdown to select which primary account to view
- Auto-filtered to:
  - Active scenario
  - Transactions involving the selected primary account
- Grid with: Description, From Account, To Account, Amount, Recurrence, Enabled
- Add/Edit/Delete
- Dropdown can select existing transactions or create new
- Shows transactions where:
  - From Account = Primary Account (debits from primary)
  - To Account = Primary Account (credits to primary)

**Section 3: Projections**
- **Primary Account Filter**: Same dropdown as Section 2
- Auto-filtered to:
  - Active scenario
  - Selected primary account AND its related secondary accounts
- Grid with: Period, Account, Is Primary, Opening, Debits, Credits, Net, Interest, Growth, Closing
- Separate rows per account per period
- Primary account rows highlighted/grouped
- Secondary account rows shown indented or with visual distinction
- Read-only
- Chart/graph visualization option
- Export to CSV option

### 8.2. Scenario Selection Flow

```
User clicks scenario in Section 1
  ↓
Scenario row highlighted as "active"
  ↓
Section 2 filters to show only planned transactions for that scenario
  ↓
Section 3 loads projections for that scenario (if they exist)
  ↓
"Generate Projection" button enabled
```

### 8.3. Generate Projection Flow

```
User clicks "Generate Projection" button
  ↓
Show loading indicator
  ↓
Clear existing projections for this scenario
  ↓
Run projection engine
  ↓
Save projections to data file
  ↓
Update Section 3 with new projections
  ↓
Update scenario.lastCalculated timestamp
  ↓
Show success message: "Projection generated for 12 periods"
```

---

## 9. File Renames & Migrations

### 9.1. Schema File Renames

| Current File | New File |
|--------------|----------|
| `forecast-template-grid.json` | `scenario-grid.json` |
| `forecast-setup-grid.json` | `planned-transactions-grid.json` |
| `forecast-snapshot-grid.json` | `projections-grid.json` |

### 9.2. app-data.json Structure

**Current**:
```json
{
  "forecastDefinitions": [...],
  "forecastSetup": [...],
  "forecastSnapshots": [...]
}
```

**New**:
```json
{
  "scenarios": [...],
  "plannedTransactions": [...],
  "projections": [...]
}
```

### 9.3. Migration Script Concept

```javascript
async function migrateToNewStructure() {
  const oldData = await loadAppData();
  
  const newData = {
    accounts: oldData.accounts,
    transactions: oldData.transactions,
    scenarios: oldData.forecastDefinitions.map(fd => ({
      id: fd.id,
      name: fd.name,
      type: "budget",
      description: fd.notes || "",
      startDate: fd.startDate,
      endDate: fd.endDate,
      projectionPeriod: fd.periodType?.name || "Month",
      accounts: [{
        id: fd.accounts?.id,
        name: fd.accounts?.name,
        isPrimary: true
      }],
      accountOverrides: [],
      createdDate: fd.createdDate || new Date().toISOString(),
      lastCalculated: null,
      tags: fd.tags || []
    })),
    plannedTransactions: oldData.forecastSetup || [],
    projections: oldData.forecastSnapshots || []
  };
  
  await saveAppData(newData);
}
```

---

## 10. Implementation Phases (for Copilot Agent)

### Phase 1: Schema Updates
- Rename schema files
- Update field names in schemas
- Add interest/growth fields to accounts schema
- Update scenario schema with accountOverrides
- Update planned transactions schema with recurrence

### Phase 2: Data Migration
- Migrate app-data.json structure
- Convert existing forecast data to new format
- Add default values for new fields

### Phase 3: Data Manager Updates
- Add scenario methods (save, get, clone)
- Add planned transaction methods (with template linking)
- Add projection methods (save, get, clear)
- Update account save to handle interest/growth

### Phase 4: UI Updates
- Update forecast.js to use new terminology
- Update grid headers/labels
- Add scenario selection logic
- Add "Generate Projection" button
- Filter planned transactions by active scenario

### Phase 5: Projection Engine
- Implement period calculator
- Implement recurrence expander
- Implement interest calculator
- Implement growth calculator
- Implement main projection generator
- Wire up to "Generate" button

### Phase 6: Account Override UI
- Add account override modal in scenario
- Allow setting scenario-specific interest/growth
- Show effective vs. base values

### Phase 7: Testing & Refinement
- Test basic budget scenario
- Test loan payoff scenario
- Test what-if scenarios (different rates)
- Test multi-account scenarios
- Performance testing

---

## 11. Design Decisions (APPROVED)

### 11.1. Transaction Template Linking ✅

**Decision**: Deep copy with transaction overrides

**Implementation**:
- Planned transaction gets full copy of base transaction data
- `transactionTemplateId` links back to original for reference
- Changes to planned transaction don't affect base transaction
- Transaction overrides in scenario allow scenario-specific modifications
- Example: Base rent = $1500, Scenario A uses $1500, Scenario B overrides to $1800

### 11.2. Account/Transaction Override UI ✅

**Decision**: In scenario modal

**Implementation**:
- Edit scenario opens modal
- Modal tabs: General | Accounts | Transaction Overrides
- Accounts tab: List included accounts, set overrides (interest, growth, starting balance)
- Transaction Overrides tab: List planned transactions, set overrides (amount, dates, etc.)
- Keeps all scenario configuration in one place

### 11.3. Projection Regeneration ✅

**Decision**: Manual only

**Implementation**:
- User must click "Generate Projection" button
- Changes to scenario/planned transactions don't auto-regenerate
- User has full control over when expensive calculations run
- Last calculated timestamp shows in scenario grid
- Optional: Show "(outdated)" indicator if scenario modified after last calculation

### 11.4. Multiple Account Display ✅

**Decision**: Primary account filtering with separate rows

**Implementation**:
- Dropdown above Sections 2 & 3: "Primary Account: [Checking ▼]"
- Section 2 (Planned Transactions): Shows only transactions involving selected primary account
- Section 3 (Projections): Shows:
  - Primary account rows (highlighted/bold)
  - Secondary account rows (related accounts from transactions)
  - Separate row per account per period
  - Visual grouping by period

**Example Display**:
```
Primary Account: [Checking Account ▼]

Period       | Account              | Is Primary | Opening | Debits | Credits | Net    | Closing
Jan 2026     | Checking Account     | ●          | 2000    | 3200   | 5000    | +1800  | 3800
Jan 2026     | ├─ Rent Expense      |            | 0       | 0      | 1500    | +1500  | 1500
Jan 2026     | ├─ Groceries         |            | 0       | 0      | 800     | +800   | 800
Jan 2026     | └─ Salary Income     |            | 5000    | 5000   | 0       | -5000  | 0
Feb 2026     | Checking Account     | ●          | 3800    | 3200   | 5000    | +1800  | 5600
...
```

### 11.5. Double-Entry Bookkeeping ✅

**Decision**: Enforce debits = credits

**Implementation**:
- Every planned transaction creates TWO projection entries:
  1. Debit entry on fromAccount (reduces balance)
  2. Credit entry on toAccount (increases balance)
- Projection engine validates: sum(all debits) = sum(all credits) for each period
- If validation fails, projection generation aborts with error message
- Ensures accounting accuracy and data integrity

---

## 12. Success Criteria

The redesigned system should enable users to:

1. ✅ Create multiple budget scenarios
2. ✅ Test different interest rates without modifying base accounts
3. ✅ Test different transaction amounts without modifying base transactions
4. ✅ Reuse existing transactions in planned transactions
5. ✅ Create new simple transactions from scenario setup
6. ✅ Project multiple accounts simultaneously
7. ✅ Apply interest and growth calculations
8. ✅ Compare scenarios side-by-side
9. ✅ Clone scenarios for what-if testing
10. ✅ Generate projections on demand
11. ✅ Understand where money will be in future periods
12. ✅ Filter by primary account to see related transactions
13. ✅ View both primary and secondary account projections
14. ✅ Verify debits equal credits for accounting accuracy
15. ✅ Track money flow between primary and secondary accounts

---

## 13. Next Steps

### Phase 1: Design Complete ✅
1. ✅ Complete design specification created
2. ✅ All open questions answered
3. ✅ Transaction overrides added
4. ✅ Double-entry bookkeeping specified
5. ✅ Primary account filtering defined

### Phase 2: Implementation Planning (Next)
1. **Create detailed task breakdown** for Copilot agent
2. **Prepare code examples** for complex parts:
   - Transaction override merging logic
   - Double-entry projection generation
   - Primary account filtering
   - Debit/credit validation
3. **Define acceptance criteria** for each phase
4. **Create test scenarios** to validate implementation

### Phase 3: Hand-off to Copilot Agent
1. **Package specification** with all design documents
2. **Provide reference code** for projection engine
3. **Define success metrics** and testing approach
4. **Create GitHub issue** with complete requirements
5. **Initiate Copilot agent** to implement in background

### Ready for Implementation Planning?

The design is now complete with all requirements specified. We can proceed to create the detailed implementation plan and task breakdown for the Copilot coding agent.
