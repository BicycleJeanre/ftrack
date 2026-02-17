# Data Schema

## 1.0 Purpose

This document formally defines the data structures used in FTrack. All application code, QC tests, and user data must conform to these structures. This is the **authoritative reference** for field names, types, and relationships.

---

## 2.0 Scenario

A scenario is a complete financial plan containing accounts, transactions, and projections.

### 2.1 Structure

```typescript
{
  id: number,
  name: string,
  type: number,                             // Scenario Type ID (1=Budget|2=General|3=Funds|4=Debt|5=Goal|6=Advanced)
  description: string | null,
  startDate: string,
  endDate: string,
  projectionPeriod: number,                 // Period ID (1=Day|2=Week|3=Month|4=Quarter|5=Year)
  accounts: Account[],
  transactions?: Transaction[],
  budgets?: Budget[],                       // Optional, scenario-type dependent
  projections?: Projection[]                // Calculated output, not user-defined
}
```

### 2.2 Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | number | Yes | Unique within profile |
| `name` | string | Yes | Display name |
| `type` | number | Yes | Scenario type ID (1–6) |
| `description` | string \| null | No | Free-form user notes |
| `startDate` | string | Yes | Projection window start |
| `endDate` | string | Yes | Projection window end |
| `projectionPeriod` | number | Yes | Period ID (1–5): 1=Day, 2=Week, 3=Month, 4=Quarter, 5=Year |
| `accounts` | Account[] | Yes | Must have at least 1 account |
| `transactions` | Transaction[] | No | Can be empty |
| `budgets` | Budget[] | No | Only for Budget scenario types |
| `projections` | Projection[] | No | System-generated, not user-provided |

---

## 3.0 Account

An account represents a place where money lives or is owed.

### 3.1 Structure

```typescript
{
  id: number,
  name: string,
  type: number,                              // Account type ID (1=Asset, 2=Liability, 3=Income, 4=Expense, 5=Debt)
  currency: number,                          // Currency ID (1=USD, 2=ZAR, 3=GBP, 4=EUR, etc.)
  startingBalance: number,
  openDate: string,
  periodicChange?: PeriodicChange | null,
  periodicChangeSchedule?: PeriodicChangeScheduleEntry[] | null,
  goalAmount?: number | null,
  goalDate?: string | null
}
```

### 3.2 Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | number | Yes | Unique within scenario |
| `name` | string | Yes | Display name (e.g., "Checking Account") |
| `type` | number | Yes | Account type ID: 1=Asset, 2=Liability, 3=Equity, 4=Income, 5=Expense |
| `currency` | number | Yes | Currency ID (1=ZAR, 2=USD, 3=EUR, 4=GBP) |
| `startingBalance` | number | Yes | Opening balance in currency units |
| `openDate` | string | Yes | Date account opened |
| `periodicChange` | PeriodicChange \| null | No | Growth/decay applied to account balance (interest, inflation) |
| `periodicChangeSchedule` | PeriodicChangeScheduleEntry[] \| null | No | Optional date-bounded overrides for `periodicChange` (variable rates) |
| `goalAmount` | number \| null | No | Target balance (for goal-based scenarios) |
| `goalDate` | string \| null | No | Date when goal should be reached |

### 3.3 Periodic Change Schedule

`periodicChangeSchedule` is an optional array of date-bounded overrides for an account's `periodicChange`.

3.3.1 Rules

- Entries are evaluated by date; at most one entry may apply to any given date (no overlaps).
- If no schedule entry applies on a date, the engine falls back to the account's `periodicChange`.
- If an entry has `endDate = null`, it is open-ended and should typically be the last entry.

3.3.2 Structure

```typescript
type PeriodicChangeScheduleEntry = {
  startDate: string,
  endDate: string | null,
  periodicChange: PeriodicChange | null
}
```

3.3.3 Example

```json
{
  "id": 12,
  "name": "Mortgage",
  "startingBalance": -250000,
  "periodicChange": { "value": 7.5, "changeMode": 1, "changeType": 2 },
  "periodicChangeSchedule": [
    {
      "startDate": "2026-06-01",
      "endDate": "2026-12-31",
      "periodicChange": { "value": 8.25, "changeMode": 1, "changeType": 2 }
    },
    {
      "startDate": "2027-01-01",
      "endDate": null,
      "periodicChange": { "value": 7.9, "changeMode": 1, "changeType": 2 }
    }
  ]
}
```

---

## 4.0 Transaction

A transaction represents movement of money between accounts.

### 4.1 Structure

```typescript
{
  id: number,
  primaryAccountId: number,                 // Source/destination account
  secondaryAccountId: number,               // Counterparty account
  transactionTypeId: number,                // Type ID: 1=Income, 2=Expense
  amount: number,
  description: string,
  recurrence: Recurrence,
  periodicChange: PeriodicChange | null,
  status: {
    name: "planned" | "actual",
    actualAmount: number | null,
    actualDate: string | null
  },
  tags: string[]
}
```

### 4.2 Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | number | Yes | Unique within scenario |
| `primaryAccountId` | number | Yes | ID of source or destination account (depends on transaction type) |
| `secondaryAccountId` | number | Yes | ID of counterparty account |
| `transactionTypeId` | number | Yes | Type classification (see 4.3) |
| `amount` | number | Yes | Transaction amount (positive, direction determined by type) |
| `description` | string | Yes | Display name (e.g., "Monthly Rent", "Paycheck") |
| `recurrence` | Recurrence | Yes | When/how often transaction occurs (see section 5.0) |
| `periodicChange` | PeriodicChange \| null | No | Growth adjustment to transaction amount over time |
| `status` | Status object | Yes | Planned vs Actual tracking |
| `tags` | string[] | No | User-defined categories |

### 4.3 Transaction Types

| ID | Name | Meaning |
|----|------|---------|
| 1 | Income | Money flowing in |
| 2 | Expense | Money flowing out |

---

### 4.4 Variable Interest Rates

FTrack supports variable interest rates on accounts by using `Account.periodicChangeSchedule` (see 3.3). Transactions remain the correct model for payments, fees, and other cashflow events.


---

## 5.0 Recurrence

Defines when and how often a transaction occurs.

### 5.1 Structure

```typescript
{
  recurrenceType: number,                   // Recurrence type ID (1=OneTime, 2=Daily, 3=Weekly, 4=MonthDay, 5=MonthWeek, 6=Quarterly, 7=Yearly, 8=Custom)
  startDate: string,
  endDate: string | null,
  interval: number | null,
  dayOfWeek: number | null,                 // 0=Sunday...6=Saturday
  dayOfMonth: number | null,                // 1-31 or -1 for last day
  weekOfMonth: number | null,               // Week ID (1=1st, 2=2nd, 3=3rd, 4=4th, 5=Last)
  dayOfWeekInMonth: number | null,          // Day ID (1=Monday, 2=Tuesday, ..., 7=Sunday)
  dayOfQuarter: number | null,              // 1-92
  month: number | null,                    // Month ID (1=January...12=December)
  dayOfYear: number | null,                 // 1-366
  customDates: string | null,               // Custom date list as string
  id: null                                  // Reserved for future use
}
```

### 5.2 Recurrence Types

From `assets/lookup-data.json` periodicChangeTypes:

| ID | Name |
|----|------|
| 1 | One Time |
| 2 | Daily |
| 3 | Weekly |
| 4 | Monthly - Day of Month |
| 5 | Monthly - Week of Month |
| 6 | Quarterly |
| 7 | Yearly |
| 8 | Custom Dates |

### 5.3 Field Usage by Recurrence Type

| Type | Required Fields | Optional Fields |
|------|-----------------|-----------------|
| One Time | startDate | - |
| Daily | startDate, interval | endDate |
| Weekly | startDate, dayOfWeek, interval | endDate |
| Monthly - Day of Month | startDate, dayOfMonth | endDate, interval |
| Monthly - Week of Month | startDate, weekOfMonth, dayOfWeekInMonth | endDate, interval |
| Quarterly | startDate, dayOfQuarter | endDate |
| Yearly | startDate, month, dayOfYear | endDate |
| Custom Dates | customDates | - |

---

## 6.0 Periodic Change

Defines automatic adjustments to transaction amounts or account balances over time.

### 6.1 Structure

```typescript
{
  value: number,                            // Percentage (if changeMode=1) or fixed amount (if changeMode=2)
  changeMode: number,                       // Type ID: 1=PercentageRate, 2=FixedAmount
  changeType: number,                       // Change type ID (1–7, required for percentage mode)
  period?: number,                          // Period ID for fixed amounts: 1=Daily, 2=Weekly, 3=Monthly, 4=Quarterly, 5=Yearly
  ratePeriod?: number,                      // Rate period ID: 1=Annual, 2=Monthly, 3=Quarterly, 4=Daily
  customCompounding?: {
    period: number,                         // Period ID (1=Annual, 2=Monthly, 3=Quarterly, 4=Daily)
    frequency: number                       // Compounding frequency per period
  }
}
```

### 6.2 Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `value` | number | Yes | Percentage (e.g., 5 for 5%) or absolute amount |
| `changeMode` | number | Yes | Change mode ID: 1=PercentageRate, 2=FixedAmount |
| `changeType` | number | Yes (for percentage) | Change type ID (1–7) |
| `period` | number | No (required if Fixed Amount) | Period ID (1–5): 1=Daily, 2=Weekly, 3=Monthly, 4=Quarterly, 5=Yearly |
| `ratePeriod` | number | No | Rate period ID: 1=Annual, 2=Monthly, 3=Quarterly, 4=Daily |
| `customCompounding` | Object | No (for Custom type only) | Period ID and compounding frequency |

### 6.3 Change Types Reference

From `assets/lookup-data.json` periodicChangeTypes:

| ID | Name | Example |
|----|------|---------|
| 1 | Nominal Annual (No Compounding) | Simple interest at 6% annually |
| 2 | Nominal Annual, Compounded Monthly | 6% compounded monthly |
| 3 | Nominal Annual, Compounded Daily | 6% compounded daily |
| 4 | Nominal Annual, Compounded Quarterly | 6% compounded quarterly |
| 5 | Nominal Annual, Compounded Annually | 6% compounded annually |
| 6 | Nominal Annual, Continuous Compounding | Continuous compounding |
| 7 | Custom | Custom period + frequency |

### 6.4 Change Modes Reference

From `assets/lookup-data.json` changeModes:

| ID | Name | Value Field | Period Field |
|----|------|-------------|--------------|
| 1 | Percentage Rate | 6 (6%) | Not used |
| 2 | Fixed Amount | 100 (add $100) | Period ID (1=Daily, 2=Weekly, 3=Monthly, 4=Quarterly, 5=Yearly) |

### 6.5 Frequency/Period Reference

From `assets/lookup-data.json` frequencies:

| ID | Name |
|----|------|
| 1 | Daily |
| 2 | Weekly |
| 3 | Monthly |
| 4 | Quarterly |
| 5 | Yearly |

### 6.6 Usage Examples

**Percentage Rate (Annual Compound Monthly)**
```json
{
  "value": 6,
  "changeMode": 1,
  "changeType": 2
}
```

**Fixed Amount (Monthly)**
```json
{
  "value": 100,
  "changeMode": 2,
  "period": 3
}
```

**Custom Compounding**
```json
{
  "value": 6,
  "changeMode": 1,
  "changeType": 7,
  "customCompounding": {
    "period": 3,
    "frequency": 12
  }
}
```

---

## 7.0 LookupReference

All references to lookup values must be stored as numeric IDs only. Never store full objects or names.

### 7.1 Correct Format (ID Only)

```typescript
{
  changeMode: 1,              // ID only
  changeType: 2,              // ID only
  accountType: 1,             // ID only
  recurrenceType: 3,          // ID only
  period: 3                   // ID only
}
```

### 7.2 Incorrect Formats (NOT Allowed)

❌ Do NOT use objects:
```typescript
{
  changeMode: { "id": 1, "name": "Percentage Rate" }     // WRONG
}
```

❌ Do NOT use names:
```typescript
{
  changeMode: "Percentage Rate"                           // WRONG
}
```

### 7.3 Validation

All numeric IDs must reference valid entries in `assets/lookup-data.json`. Code validation should map IDs to display names for UI rendering.

---

## 8.0 Projection

System-generated forecast of account balances. NOT user-provided.

### 8.1 Structure

```typescript
{
  id: number,
  scenarioId: number,
  accountId: number,
  account: string,                          // Account name
  date: string,
  balance: number,
  income: number,
  expenses: number,
  netChange: number,
  period: number                            // Period count
}
```

---

## 9.0 Consistency Rules

### 9.1 Reference Integrity

- All `*Id` fields must reference valid entities in the same scenario
- `primaryAccountId` and `secondaryAccountId` must exist in `accounts[]`
- `transactionTypeId` must be 1–2

### 9.2 Date Ranges

- `startDate` must be ≤ `endDate` in scenarios
- Transaction `startDate` must be within scenario date range
- `endDate` (if present) must be ≥ `startDate`

### 9.3 Numeric Constraints

- `startingBalance` can be any number (positive, negative, or zero)
- `amount` in transactions must be positive (sign determined by transactionTypeId)
- `value` in periodicChange must be positive

### 9.4 Enum Validation

- `type` in scenarios must match a valid scenarioTypes entry
- `type` in accounts must match a valid accountTypes entry
- `changeMode` must be 1 or 2
- `changeType` must be 1–7
- All lookup references must exist in `assets/lookup-data.json`

---

## 10.0 Comparison Table: Required vs Optional

| Entity | Field | Required | Can Be Null | Can Be Empty |
|--------|-------|----------|-------------|--------------|
| Scenario | id | ✓ | ✗ | ✗ |
| Scenario | accounts | ✓ | ✗ | ✗ |
| Scenario | transactions | ✓ | ✗ | ✓ |
| Account | periodicChange | ✗ | ✓ | ✗ |
| Transaction | periodicChange | ✗ | ✓ | ✗ |
| Transaction | status.actualAmount | ✗ | ✓ | ✗ |
| Recurrence | endDate | ✗ | ✓ | ✗ |
| PeriodicChange | customCompounding | ✗ | ✓ | ✗ |

---

## 11.0 Version History

| Date | Version | Changes |
|------|---------|----------|
| 2026-02-12 | 1.1 | All LookupReferences must be numeric IDs only (no objects, no names) |
| 2026-02-12 | 1.0 | Initial formal schema definition |
