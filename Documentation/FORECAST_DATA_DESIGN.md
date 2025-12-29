# Financial Forecast Data Design
**Date**: December 29, 2025  
**Purpose**: Define data structure and relationships for the 3-section forecast system

---

## 1. Overview

The financial forecast system consists of three linked sections:

1. **Forecast Version** - Template/configuration defining time parameters
2. **Forecast Setup** - Transaction definitions that will be applied to the forecast
3. **Forecast Results** - Calculated snapshots showing projected account balances

---

## 2. Section 1: Forecast Version (Template)

### 2.1. Purpose
Defines the **time parameters** and **scope** for a forecast. Think of this as the "container" or "configuration" for a forecast run.

### 2.2. Current Schema Fields

```json
{
  "id": 1,
  "name": "Q1 2026 Budget",
  "mode": { "id": 2, "name": "periods" },
  "startDate": "2026-01-01",
  "endDate": "2026-03-31",
  "periodType": { "id": 3, "name": "Month" },
  "periodCount": 3,
  "accounts": { "id": 5, "name": "Checking Account" },
  "notes": "First quarter budget forecast",
  "tags": ["2026", "Q1"]
}
```

### 2.3. Field Analysis

| Field | Purpose | Issues/Changes Needed |
|-------|---------|----------------------|
| `id` | Unique identifier | ✅ Good |
| `name` | Human-readable version name | ✅ Good |
| `mode` | How to calculate periods: `dateRange` or `periods` | ✅ Good |
| `startDate` | Forecast start date | ✅ Good |
| `endDate` | Forecast end date (for dateRange mode) | ✅ Good |
| `periodType` | Period granularity (Day/Week/Month/etc) | ✅ Good |
| `periodCount` | Number of periods to forecast | ✅ Good |
| `accounts` | **PRIMARY ACCOUNT** for forecast | ⚠️ Rename to `primaryAccount` for clarity |
| `notes` | User notes | ✅ Good |
| `tags` | Organization tags | ✅ Good |

### 2.4. Recommended Changes

**Change 1**: Rename `accounts` → `primaryAccount`
- Current name is confusing (plural suggests multiple)
- This is THE account being forecasted
- All transactions in setup flow through this account

**Change 2**: Add `createdDate` field
- Track when version was created
- Useful for sorting/history

**Change 3**: Add `lastCalculated` field
- Timestamp of last forecast generation
- Know if results are stale

**Updated Schema**:
```json
{
  "id": 1,
  "name": "Q1 2026 Budget",
  "mode": { "id": 2, "name": "periods" },
  "startDate": "2026-01-01",
  "endDate": "2026-03-31",
  "periodType": { "id": 3, "name": "Month" },
  "periodCount": 3,
  "primaryAccount": { "id": 5, "name": "Checking Account" },
  "createdDate": "2025-12-29",
  "lastCalculated": "2025-12-29T14:30:00Z",
  "notes": "First quarter budget forecast",
  "tags": ["2026", "Q1"]
}
```

---

## 3. Section 2: Forecast Setup (Transaction Definitions)

### 3.1. Purpose
Defines **recurring transactions** or **expected one-time transactions** that will occur during the forecast period. These are the "inputs" to the forecast calculation.

### 3.2. Current Schema Fields

```json
{
  "id": 1,
  "versionId": 1,
  "account": { "id": 10, "name": "Salary Income" },
  "transaction": { "id": 50, "name": "Monthly Paycheck" },
  "amount": 5000,
  "date": "2026-01-15",
  "movement": { "id": 1, "name": "Credit" },
  "notes": "Monthly salary deposit"
}
```

### 3.3. Field Analysis

| Field | Purpose | Issues/Changes Needed |
|-------|---------|----------------------|
| `id` | Unique identifier | ✅ Good |
| `versionId` | Links to forecast version | ✅ Good - essential link |
| `account` | Account involved in transaction | ⚠️ Confusing - which account? |
| `transaction` | Reference to transaction template | ⚠️ May not be needed |
| `amount` | Transaction amount | ✅ Good |
| `date` | When transaction occurs | ⚠️ Needs clarification for recurring |
| `movement` | Credit or Debit | ⚠️ Redundant if using fromAccount/toAccount |
| `notes` | Description | ✅ Good |

### 3.4. Problems with Current Design

**Problem 1: Unclear Account Flow**
- Should use `fromAccount` and `toAccount` like transactions page
- Current `account` field is ambiguous
- `movement` becomes redundant when using from/to

**Problem 2: Transaction Reference Confusion**
- `transaction` field links to existing transactions
- But we're defining NEW forecast transactions
- This should be a template, not a reference

**Problem 3: No Recurrence Pattern**
- Setup should define if/how transaction repeats
- Need: frequency, interval, end condition

**Problem 4: Missing Primary Account Link**
- Setup transactions should automatically link to version's primaryAccount
- One side should always be the primaryAccount from version
- Other side is the income/expense account

### 3.5. Recommended Redesign

**Option A: Simplified Model (Income/Expense focused)**
```json
{
  "id": 1,
  "versionId": 1,
  "category": "Income",
  "account": { "id": 10, "name": "Salary Income" },
  "description": "Monthly Paycheck",
  "amount": 5000,
  "recurrence": {
    "frequency": "Monthly",
    "interval": 1,
    "startDate": "2026-01-15",
    "endDate": null,
    "dayOfMonth": 15
  },
  "notes": "Regular salary deposit"
}
```

**Flow**: 
- Income: FROM income account → TO primaryAccount
- Expense: FROM primaryAccount → TO expense account

**Option B: Full Transaction Model**
```json
{
  "id": 1,
  "versionId": 1,
  "description": "Monthly Salary",
  "fromAccount": { "id": 10, "name": "Salary Income" },
  "toAccount": { "id": 5, "name": "Checking Account" },
  "amount": 5000,
  "recurrence": {
    "type": "recurring",
    "frequency": "Monthly",
    "interval": 1,
    "startDate": "2026-01-15",
    "endDate": null,
    "occurrences": null,
    "dayOfMonth": 15
  },
  "includeInForecast": true,
  "notes": "Regular paycheck"
}
```

**Flow**: Explicit from/to accounts

### 3.6. Recurrence Pattern Design

```json
{
  "type": "one-time" | "recurring",
  "frequency": "Daily" | "Weekly" | "Monthly" | "Quarterly" | "Yearly",
  "interval": 1,
  "startDate": "2026-01-15",
  "endDate": "2026-12-31",
  "occurrences": 12,
  "dayOfWeek": "Monday",
  "dayOfMonth": 15,
  "monthOfYear": "January"
}
```

**Rules**:
- One-time: Just `startDate`, `amount`
- Recurring: All fields, `endDate` OR `occurrences` (not both)
- Use version's date range if no explicit end

---

## 4. Section 3: Forecast Results (Calculated Snapshots)

### 4.1. Purpose
**Read-only calculated data** showing projected account balances over time. Generated by forecast engine based on Version + Setup.

### 4.2. Current Schema Fields

```json
{
  "id": 1,
  "versionId": 1,
  "movement": { "id": 2, "name": "Credit" },
  "accountPrimary": { "id": 2, "name": "Checking" },
  "accountSecondary": null,
  "period": "2026-01-01",
  "amount": 1248.40
}
```

### 4.3. Field Analysis

| Field | Purpose | Issues/Changes Needed |
|-------|---------|----------------------|
| `id` | Unique identifier | ✅ Good |
| `versionId` | Links to forecast version | ✅ Good |
| `movement` | Credit/Debit | ⚠️ Not needed for balance snapshots |
| `accountPrimary` | Main account | ⚠️ Should always be version's primaryAccount |
| `accountSecondary` | Other account | ⚠️ Confusing for balance snapshot |
| `period` | Date/period | ✅ Good |
| `amount` | Balance or transaction | ⚠️ Unclear what this represents |

### 4.4. What Should Results Show?

**Option A: Account Balance Snapshots**
```json
{
  "id": 1,
  "versionId": 1,
  "period": "2026-01-31",
  "periodLabel": "January 2026",
  "openingBalance": 5000,
  "totalIncome": 6500,
  "totalExpenses": 4200,
  "netChange": 2300,
  "closingBalance": 7300
}
```

**Option B: Transaction Details Per Period**
```json
{
  "id": 1,
  "versionId": 1,
  "period": "2026-01-31",
  "periodLabel": "January 2026",
  "transactions": [
    {
      "date": "2026-01-15",
      "description": "Salary",
      "fromAccount": "Income",
      "toAccount": "Checking",
      "amount": 5000,
      "type": "Income"
    }
  ],
  "openingBalance": 5000,
  "closingBalance": 7300
}
```

**Option C: Both (Recommended)**
Two result types:
1. Period summaries (for overview)
2. Transaction details (for drill-down)

### 4.5. Recommended Results Schema

```json
{
  "id": 1,
  "versionId": 1,
  "period": "2026-01-31",
  "periodLabel": "January 2026",
  "periodType": "Month",
  "accountId": 5,
  "accountName": "Checking Account",
  "openingBalance": 5000.00,
  "totalIncome": 6500.00,
  "totalExpenses": 4200.00,
  "netChange": 2300.00,
  "closingBalance": 7300.00,
  "transactionCount": 15,
  "calculatedAt": "2025-12-29T14:30:00Z"
}
```

---

## 5. Data Flow & Relationships

### 5.1. Creating a Forecast

```
1. User creates Forecast Version
   └─> Defines: time range, primary account, period type

2. User adds Setup Transactions
   └─> Each linked to versionId
   └─> Defines: what money moves in/out of primary account

3. System generates Results
   └─> Calculates balance for each period
   └─> Based on: opening balance + setup transactions
   └─> Stored with versionId link
```

### 5.2. Updating a Forecast

**Scenario 1: Edit Version**
- Change date range → Recalculate results
- Change primary account → Clear results, recalculate
- Change period type → Recalculate

**Scenario 2: Edit Setup**
- Add/edit/delete transaction → Recalculate results
- Auto-recalculate or manual trigger?

**Scenario 3: Manual Recalculation**
- User clicks "Generate Forecast" button
- Clears old results for this versionId
- Calculates new results

### 5.3. Deleting a Forecast

**Option A: Cascade Delete**
- Delete version → Delete all setup + results for that versionId

**Option B: Soft Delete**
- Mark version as deleted
- Keep setup + results for history

**Option C: Archive**
- Move to archived state
- Can restore later

---

## 6. Database Queries (Conceptual)

```javascript
// Get complete forecast
const version = forecastDefinitions.find(v => v.id === versionId);
const setup = forecastSetup.filter(s => s.versionId === versionId);
const results = forecastSnapshots.filter(r => r.versionId === versionId);

// Calculate forecast
function generateForecast(versionId) {
  const version = getVersion(versionId);
  const setupItems = getSetup(versionId);
  const periods = calculatePeriods(version);
  
  let balance = version.primaryAccount.balance;
  const results = [];
  
  for (const period of periods) {
    const transactions = expandRecurrence(setupItems, period);
    const income = sumIncome(transactions);
    const expenses = sumExpenses(transactions);
    
    results.push({
      period: period.endDate,
      openingBalance: balance,
      totalIncome: income,
      totalExpenses: expenses,
      netChange: income - expenses,
      closingBalance: balance + income - expenses
    });
    
    balance += income - expenses;
  }
  
  return results;
}
```

---

## 7. Recommended Changes Summary

### 7.1. Forecast Version Schema
- ✅ Keep: id, name, mode, dates, periodType, periodCount, notes, tags
- 🔄 Rename: `accounts` → `primaryAccount`
- ➕ Add: `createdDate`, `lastCalculated`

### 7.2. Forecast Setup Schema
- ✅ Keep: id, versionId, amount, notes
- ❌ Remove: `transaction`, `movement`
- 🔄 Change: `account` → `fromAccount` + `toAccount`
- 🔄 Change: `date` → `recurrence` object
- ➕ Add: `description`, `category`, `includeInForecast`

### 7.3. Forecast Results Schema
- ✅ Keep: id, versionId, period
- ❌ Remove: `movement`, `accountSecondary`
- 🔄 Simplify: `accountPrimary` → `accountId` + `accountName`
- ➕ Add: `periodLabel`, `openingBalance`, `totalIncome`, `totalExpenses`, `netChange`, `closingBalance`, `calculatedAt`

---

## 8. Implementation Priority

**Phase 1: Fix Version Schema**
1. Rename `accounts` → `primaryAccount`
2. Add `createdDate`, `lastCalculated`
3. Update UI and data-manager

**Phase 2: Redesign Setup Schema**
1. Replace account/transaction fields with fromAccount/toAccount
2. Add recurrence object
3. Update UI with recurrence controls

**Phase 3: Redesign Results Schema**
1. Change to balance snapshot model
2. Add period summary fields
3. Make read-only (non-editable)

**Phase 4: Build Forecast Engine**
1. Period calculator (based on mode/type)
2. Recurrence expander (one-time + recurring)
3. Balance calculator (opening + transactions → closing)
4. Results generator

---

## 9. Example Complete Forecast

```json
{
  "version": {
    "id": 1,
    "name": "2026 Q1 Budget",
    "mode": { "id": 2, "name": "periods" },
    "startDate": "2026-01-01",
    "endDate": null,
    "periodType": { "id": 3, "name": "Month" },
    "periodCount": 3,
    "primaryAccount": { "id": 5, "name": "Checking Account" },
    "createdDate": "2025-12-29",
    "lastCalculated": "2025-12-29T15:00:00Z",
    "notes": "First quarter forecast",
    "tags": ["2026", "Q1"]
  },
  "setup": [
    {
      "id": 1,
      "versionId": 1,
      "description": "Monthly Salary",
      "fromAccount": { "id": 10, "name": "Salary Income" },
      "toAccount": { "id": 5, "name": "Checking Account" },
      "amount": 5000,
      "recurrence": {
        "type": "recurring",
        "frequency": "Monthly",
        "interval": 1,
        "startDate": "2026-01-15",
        "dayOfMonth": 15
      },
      "includeInForecast": true
    },
    {
      "id": 2,
      "versionId": 1,
      "description": "Rent Payment",
      "fromAccount": { "id": 5, "name": "Checking Account" },
      "toAccount": { "id": 20, "name": "Rent Expense" },
      "amount": 1500,
      "recurrence": {
        "type": "recurring",
        "frequency": "Monthly",
        "interval": 1,
        "startDate": "2026-01-01",
        "dayOfMonth": 1
      },
      "includeInForecast": true
    }
  ],
  "results": [
    {
      "id": 1,
      "versionId": 1,
      "period": "2026-01-31",
      "periodLabel": "January 2026",
      "accountId": 5,
      "accountName": "Checking Account",
      "openingBalance": 2000.00,
      "totalIncome": 5000.00,
      "totalExpenses": 1500.00,
      "netChange": 3500.00,
      "closingBalance": 5500.00
    },
    {
      "id": 2,
      "versionId": 1,
      "period": "2026-02-28",
      "periodLabel": "February 2026",
      "accountId": 5,
      "accountName": "Checking Account",
      "openingBalance": 5500.00,
      "totalIncome": 5000.00,
      "totalExpenses": 1500.00,
      "netChange": 3500.00,
      "closingBalance": 9000.00
    }
  ]
}
```

---

## 10. Questions for User

1. **Setup Transaction Model**: Option A (simplified Income/Expense) or Option B (full from/to accounts)?

2. **Recurrence**: Should we support complex patterns (e.g., "2nd Tuesday of each month")?

3. **Results**: Just summaries, or also store detailed transactions per period?

4. **Auto-Calculate**: Should editing setup automatically recalculate, or require manual "Generate" button?

5. **Version Selection**: Should setup grid filter by selected version, or show all with version dropdown?

6. **Primary Account**: Should forecast support multiple accounts, or just one primaryAccount?

7. **Historical Data**: Should results include comparison to actual transactions if available?

8. **Interest/Growth**: Should forecast include compound interest calculations on balances?
