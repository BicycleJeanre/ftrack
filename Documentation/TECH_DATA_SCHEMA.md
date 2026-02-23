# Data Schema

## 1.0 Purpose

This document formally defines the data structures used in FTrack. All application code, QC tests, and user data must conform to these structures. This is the **authoritative reference** for field names, types, and relationships.

## 1.1 Root Data Object

FTrack persists a single root object. Export and import operations read and write this object as-is.

### 1.1.1 Structure

```typescript
type AppData = {
  schemaVersion: number,
  scenarios: Scenario[],
  uiState: UiState
}

type UiState = {
  lastWorkflowId: string,                 // Persist last selected workflow across reload/import (defaults to "general")
  lastScenarioId: number | null,           // Persist last selected scenario across reload/import
  lastScenarioVersion: number | null,      // Redundant safety for versioned scenarios
  viewPeriodTypeIds: {                     // Period views are per-card, not derived from projections
    transactions: number,                  // Period ID (1=Day|2=Week|3=Month|4=Quarter|5=Year)
    budgets: number,                       // Period ID (1=Day|2=Week|3=Month|4=Quarter|5=Year)
    projections: number                    // Period ID (1=Day|2=Week|3=Month|4=Quarter|5=Year)
  }
}
```

1.1.2 Schema Versioning

- `schemaVersion` is incremented for breaking storage changes.
- This workflow-based refactor targets `schemaVersion = 43`.

1.1.3 Period Views Are Not Projections

- UI period grouping for transactions and budgets is a view concern.
- Projections period type is an engine concern.
- These must be stored independently (see `UiState.viewPeriodTypeIds`).

---

## 2.0 Scenario

A scenario is a named version of user content (accounts, transactions, and optional budgets). UI workflows are NOT stored on scenarios.

### 2.1 Structure

```typescript
{
  id: number,
  version: number,                          // Starts at 1; increments on duplication
  name: string,
  description: string | null,
  lineage?: ScenarioLineage | null,
  accounts: Account[],
  transactions?: Transaction[],
  budgets?: BudgetOccurrence[],
  budgetWindow?: BudgetBundle | null,        // Budget config (independent of projection)
  projection?: ProjectionBundle | null,      // Projection config + last generated output
  planning?: ScenarioPlanning | null         // Planning windows for goal tooling (Generate Plan / Solver)
}
```

### 2.2 Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | number | Yes | Unique within profile |
| `version` | number | Yes | Starts at 1; increments on duplication |
| `name` | string | Yes | Display name |
| `description` | string \| null | No | Free-form user notes |
| `lineage` | ScenarioLineage \| null | No | Tracks duplication source and ancestor IDs |
| `accounts` | Account[] | Yes | Must have at least 1 account |
| `transactions` | Transaction[] | No | Can be empty |
| `budgets` | BudgetOccurrence[] | No | Optional; workflow-driven UI may show/hide budget tooling |
| `budgetWindow` | BudgetBundle | Yes (if using budgets) | Independent budget configuration; required if budgets workflow is active |
| `projection` | ProjectionBundle \| null | No | Stored projection config and last generated results |
| `planning` | ScenarioPlanning \| null | No | Planning windows used by goal tooling; independent of projection config |

### 2.3 ScenarioLineage

Scenario lineage is a lightweight history for duplication only. No merge semantics are defined.

```typescript
type ScenarioLineage = {
  duplicatedFromScenarioId: number | null,
  ancestorScenarioIds: number[]             // Ordered oldest → newest
}
```

### 2.4 ProjectionBundle

Projection settings are stored under `scenario.projection.config` (not on the scenario root).

```typescript
type ProjectionBundle = {
  config: ProjectionConfig,
  rows?: ProjectionPoint[],
  generatedAt?: string | null               // ISO datetime string
}

type ProjectionConfig = {
  startDate: string,
  endDate: string,
  periodTypeId: number,                    // Period ID (1=Day|2=Week|3=Month|4=Quarter|5=Year)
  source?: "transactions" | "budget"       // Optional; defaults to "transactions"
}
```

2.4.1 Projection Source Semantics

- `source = "transactions"` uses planned transactions as the forward-looking input.
- `source = "budget"` is new functionality: uses budget occurrences as the forward-looking input and treats budget occurrences marked `status.name = "actual"` as locked.
- Locked means: once a budget occurrence is marked complete via `status.name = "actual"`, it remains in the data and projections must include it from its actual date (`status.actualDate` if present, otherwise `occurrenceDate`) onward.

---

## 2.4.2 BudgetBundle

Budget window is independent from projection config and is stored under `scenario.budgetWindow.config`.

```typescript
type BudgetBundle = {
  config: BudgetWindowConfig
}

type BudgetWindowConfig = {
  startDate: string,                       // Start of budget regeneration window (YYYY-MM-DD)
  endDate: string                          // End of budget regeneration window (YYYY-MM-DD)
}
```

2.4.2.1 Budget Window Semantics

- Budget window is the date range for "Regenerate from Planned Transactions" action.
- It is **required** and independent from projection config; budgets and projections have completely separate scopes.
- Budget regeneration expands **planned transactions WITH recurrence** (including one-time recurrence) within this window.
- No default; must be explicitly configured by user.

## 2.5 ScenarioPlanning

Goal tooling uses explicit planning windows that can differ from the projection window.

2.5.1 Rules

- Planning windows default to the projection window (`scenario.projection.config.startDate/endDate`) when missing.
- Goal-based workflow uses `scenario.planning.generatePlan` as the planning horizon.
- Advanced Goal Solver uses `scenario.planning.advancedGoalSolver` as the solver horizon.
- Projections always use `scenario.projection.config` (planning windows do not change engine behavior).

```typescript
type ScenarioPlanning = {
  generatePlan: PlanningWindow,
  advancedGoalSolver: PlanningWindow
}

type PlanningWindow = {
  startDate: string,
  endDate: string
}
```

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
  goalDate?: string | null,
  tags?: string[]                            // User-defined tags for categorization
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
| `tags` | string[] | No | User-defined tags for categorization and filtering |

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
| `tags` | string[] | No | User-defined categories |

4.2.1 Note: Transaction Actuals Are Not Stored

- Transactions do not store actuals or completion status.
- Locking and actual capture are modeled on budget occurrences (see 4.5).

### 4.3 Transaction Types

| ID | Name | Meaning |
|----|------|---------|
| 1 | Income | Money flowing in |
| 2 | Expense | Money flowing out |

---

### 4.4 Variable Interest Rates

FTrack supports variable interest rates on accounts by using `Account.periodicChangeSchedule` (see 3.3). Transactions remain the correct model for payments, fees, and other cashflow events.


## 4.5 BudgetOccurrence

A budget occurrence is a dated, editable instance of a planned transaction. Budget occurrences are also the only persisted location for completion status and locking semantics.

### 4.5.1 Structure

```typescript
type BudgetOccurrence = {
  id: number,
  sourceTransactionId: number | null,      // Reference to planned transaction (ID only)
  primaryAccountId: number | null,
  secondaryAccountId: number | null,
  transactionTypeId: number | null,
  amount: number,
  description: string,
  recurrenceDescription: string,
  occurrenceDate: string,                 // YYYY-MM-DD
  periodicChange: PeriodicChange | null,
  status: {
    name: "planned" | "actual",
    actualAmount: number | null,
    actualDate: string | null
  },
  tags: string[]
}
```

### 4.5.2 Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | number | Yes | Unique within scenario budgets array |
| `sourceTransactionId` | number \| null | No | If derived from a transaction, stores the source transaction ID |
| `primaryAccountId` | number \| null | No | Account ID (nullable for partially-specified entries) |
| `secondaryAccountId` | number \| null | No | Counterparty account ID (nullable for partially-specified entries) |
| `transactionTypeId` | number \| null | No | Type classification (1=Income, 2=Expense) |
| `amount` | number | Yes | Planned amount (unsigned) |
| `description` | string | Yes | Display name |
| `recurrenceDescription` | string | Yes | Human-readable recurrence pattern (UI convenience) |
| `occurrenceDate` | string | Yes | Budget occurrence date (YYYY-MM-DD) |
| `periodicChange` | PeriodicChange \| null | No | Optional escalation data carried from source transaction |
| `status` | Status object | Yes | See 4.5.3 |
| `tags` | string[] | No | User-defined categories |

### 4.5.3 Status And Locking

- `status.name = "actual"` indicates the occurrence is complete and locked.
- `status.actualAmount` stores the completed amount (nullable when planned).
- `status.actualDate` stores the completed date; if null, `occurrenceDate` is the effective date for locked actuals.


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
type ProjectionPoint = {
  accountId: number,
  date: string,
  balance: number,
  income: number,
  expenses: number,
  netChange: number,
  periodIndex: number                       // 0-based index within generated periods
}
```

---

## 9.0 Consistency Rules

### 9.1 Reference Integrity

- All `*Id` fields must reference valid entities in the same scenario
- `primaryAccountId` and `secondaryAccountId` must exist in `accounts[]`
- `transactionTypeId` must be 1–2

### 9.2 Date Ranges

- `scenario.projection.config.startDate` must be ≤ `scenario.projection.config.endDate`
- If `recurrence.startDate` is before the projection window, the engine uses the projection window start as the effective start (no occurrences before the projection start are generated).
- If `recurrence.startDate` is after the projection window end, the transaction generates no occurrences for that projection run.
- `recurrence.endDate` (if present) must be ≥ `recurrence.startDate`

### 9.3 Numeric Constraints

- `startingBalance` can be any number (positive, negative, or zero)
- `amount` in transactions must be positive (sign determined by transactionTypeId)
- `value` in periodicChange must be positive

### 9.4 Enum Validation

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
| BudgetOccurrence | status.actualAmount | ✗ | ✓ | ✗ |
| Recurrence | endDate | ✗ | ✓ | ✗ |
| PeriodicChange | customCompounding | ✗ | ✓ | ✗ |

---

## 11.0 Version History

| Date | Version | Changes |
|------|---------|----------|
| 2026-02-22 | 2.0 | Proposed workflow-based schema targeting `schemaVersion = 43`: scenarios simplified; added scenario `version` and `lineage`; projection config moved under `scenario.projection.config`; added `uiState` with workflow + per-card period view settings; added projection source semantics (`transactions` vs `budget`) |
| 2026-02-12 | 1.1 | All LookupReferences must be numeric IDs only (no objects, no names) |
| 2026-02-12 | 1.0 | Initial formal schema definition |
