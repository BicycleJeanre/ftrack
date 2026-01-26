# Data Model & Persistence

## 1.0 Data Strategy
The application uses a **File-Based JSON Database**. It loads all data into memory on startup and writes to disk on change.

## 2.0 Storage Locations
- **User Data**: `userData/assets/app-data.json`
  - Contains mutable user data (Transactions, Accounts, Scenarios).
  - *Note: In dev, this may be copied from `assets/app-data.sample.json` if missing.*
- **Static Assets**: `assets/lookup-data.json`
  - Contains immutable lookup definitions (Currencies, Account Types).

## 3.0 Core Entities (User Data)

### 3.1 Transactions
Stored in `app-data.json` under each scenario's `transactions` array.

**Schema**:
```json
{
  "id": "number|string (auto-generated)",
  "primaryAccountId": "number (ref: account.id)",
  "secondaryAccountId": "number (ref: account.id)",
  "transactionTypeId": "number (ref: lookup:transactionTypes)",
  "amount": "number",
  "description": "string",
  "recurrence": {
    "recurrenceType": {
      "id": "number (1-11, see recurrenceTypes)",
      "name": "string"
    },
    "startDate": "string (ISO-8601 YYYY-MM-DD, nullable)",
    "endDate": "string (ISO-8601 YYYY-MM-DD, nullable)",
    "interval": "number",
    "dayOfWeek": {
      "id": "number (0=Sunday, 1=Monday, ..., 6=Saturday, nullable)",
      "name": "string (nullable)"
    },
    "dayOfMonth": "number (1-31, or -1 for last day, nullable)",
    "weekOfMonth": {
      "id": "number (1-5, nullable)",
      "name": "string (nullable)"
    },
    "dayOfWeekInMonth": {
      "id": "number (0=Sunday, 1=Monday, ..., 6=Saturday, nullable)",
      "name": "string (nullable)"
    },
    "dayOfQuarter": "number (1-92, nullable)",
    "month": {
      "id": "number (1-12, nullable)",
      "name": "string (nullable)"
    },
    "dayOfYear": "number (1-365, nullable)",
    "customDates": "string (comma-separated dates, nullable)",
    "id": "null"
  },
  "periodicChange": {
    "value": "number",
    "changeMode": "object",
    "changeType": "object",
    "period": "object (nullable)",
    "ratePeriod": "object (nullable)",
    "frequency": "object (nullable)"
  },
  "status": {
    "name": "string (planned|actual)",
    "actualAmount": "number (nullable)",
    "actualDate": "string (ISO-8601 YYYY-MM-DD, nullable)"
  },
  "tags": "array"
}
```

**Data Normalization**:
- **Account References**: Stored as `primaryAccountId` and `secondaryAccountId` (ID only)
  - Full account objects resolved at runtime from scenario's `accounts` array
  - Prevents data anomalies when account properties change
- **Transaction Type**: Stored as `transactionTypeId` (ID only)
  - Resolved from lookup data at runtime
- **Status**: Stored as object with `name`, `actualAmount`, and `actualDate`
  - Not a lookup - contains transaction-specific execution data

**Transaction Type** (ref: `lookup-data.json/transactionTypes`):
1. **Money In** (`id: 1`): Flows from `secondaryAccount` → `primaryAccount`
   - Examples: Salary deposit, investment return, refund
2. **Money Out** (`id: 2`): Flows from `primaryAccount` → `secondaryAccount`
   - Examples: Rent payment, grocery expense, transfer to savings

**Status Object**:
- `name`: "planned" (not yet executed) or "actual" (completed/reconciled)
- `actualAmount`: Populated when status.name = "actual", records executed amount
- `actualDate`: Populated when status.name = "actual", records execution date

**Recurrence Object**:
Defines the pattern for recurring transactions. Generated from the Recurrence modal interface.

**Full Schema**:
```json
{
  "recurrenceType": {
    "id": "number (1-11, see recurrenceTypes)",
    "name": "string"
  },
  "startDate": "string (ISO-8601 YYYY-MM-DD, nullable)",
  "endDate": "string (ISO-8601 YYYY-MM-DD, nullable)",
  "interval": "number (default: 1)",
  "dayOfWeek": {
    "id": "number (0=Sunday, 1=Monday, ..., 6=Saturday)",
    "name": "string"
  },
  "dayOfMonth": "number (1-31, or -1 for last day of month, nullable)",
  "weekOfMonth": {
    "id": "number (1=First, 2=Second, 3=Third, 4=Fourth, 5=Last)",
    "name": "string"
  },
  "dayOfWeekInMonth": {
    "id": "number (0=Sunday, 1=Monday, ..., 6=Saturday)",
    "name": "string"
  },
  "dayOfQuarter": "number (1-92, nullable)",
  "month": {
    "id": "number (1=January, ..., 12=December)",
    "name": "string"
  },
  "dayOfYear": "number (1-365, nullable)",
  "customDates": "string (comma-separated YYYY-MM-DD dates, nullable)",
  "id": "null (legacy field, always null)"
}
```

**Recurrence Types**:

1. **One Time** (`id: 1`)
   - Single occurrence on `startDate`
   - No repeat pattern
   - Example: One-time bonus payment on 2026-12-15

2. **Daily** (`id: 2`)
   - Repeats every N days (defined by `interval`)
   - Required fields: `interval`
   - Example: Every 3 days → `{recurrenceType: {id: 2}, interval: 3}`

3. **Weekly** (`id: 3`)
   - Repeats every N weeks on a specific day of week
   - Required fields: `interval`, `dayOfWeek`
   - Example: Every Monday → `{recurrenceType: {id: 3}, interval: 1, dayOfWeek: {id: 1}}`
   - Example: Bi-weekly on Friday → `{recurrenceType: {id: 3}, interval: 2, dayOfWeek: {id: 5}}`

4. **Monthly - Day of Month** (`id: 4`)
   - Repeats on specific day of month (e.g., 15th)
   - Required fields: `dayOfMonth`
   - Example: 15th of every month → `{recurrenceType: {id: 4}, dayOfMonth: 15}`
   - Example: Last day of month → `{recurrenceType: {id: 4}, dayOfMonth: -1}`
   - Handles months with fewer days (e.g., day 31 in February becomes day 28/29)

5. **Monthly - Week of Month** (`id: 5`)
   - Repeats on Nth occurrence of weekday (e.g., 2nd Tuesday)
   - Required fields: `weekOfMonth`, `dayOfWeekInMonth`
   - Example: First Monday → `{recurrenceType: {id: 5}, weekOfMonth: {id: 1}, dayOfWeekInMonth: {id: 1}}`
   - Example: Last Friday → `{recurrenceType: {id: 5}, weekOfMonth: {id: 5}, dayOfWeekInMonth: {id: 5}}`

6. **Quarterly** (`id: 6`)
   - Repeats every 3 months on specific day of quarter
   - Required fields: `dayOfQuarter`
   - Example: First day of quarter → `{recurrenceType: {id: 6}, dayOfQuarter: 1}`
   - Quarters: Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec

7. **Yearly** (`id: 7`)
   - Repeats annually on specific date
   - Required fields: `month`, `dayOfYear`
   - Example: April 15th → `{recurrenceType: {id: 7}, month: {id: 4}, dayOfYear: 15}`

8. **Custom Dates** (`id: 11`)
   - Specific list of dates (no pattern)
   - Required fields: `customDates`
   - Example: `{recurrenceType: {id: 11}, customDates: "2026-03-15,2026-06-20,2026-09-10"}`

**Field Usage by Recurrence Type**:

| Type | startDate | endDate | interval | dayOfWeek | dayOfMonth | weekOfMonth | dayOfWeekInMonth | dayOfQuarter | month | dayOfYear | customDates |
|------|-----------|---------|----------|-----------|------------|-------------|------------------|--------------|-------|-----------|-------------|
| One Time | ✓ | - | - | - | - | - | - | - | - | - | - |
| Daily | ✓ | ✓ | ✓ | - | - | - | - | - | - | - | - |
| Weekly | ✓ | ✓ | ✓ | ✓ | - | - | - | - | - | - | - |
| Monthly - Day | ✓ | ✓ | - | - | ✓ | - | - | - | - | - | - |
| Monthly - Week | ✓ | ✓ | - | - | - | ✓ | ✓ | - | - | - | - |
| Quarterly | ✓ | ✓ | - | - | - | - | - | ✓ | - | - | - |
| Yearly | ✓ | ✓ | - | - | - | - | - | - | ✓ | ✓ | - |
| Custom Dates | - | - | - | - | - | - | - | - | - | - | ✓ |

**Date Generation Logic**:
- `startDate`: First possible occurrence (nullable for inherited dates)
- `endDate`: Last possible occurrence (null = infinite)
- `interval`: Multiplier for period (e.g., 2 for bi-weekly, 3 for every 3 days)
- When `startDate` is null, first occurrence is calculated from scenario start date
- Projection engine uses `generateRecurrenceDates()` to expand recurrence into actual dates

**Examples**:

*Weekly Paycheck (Bi-weekly on Friday)*:
```json
{
  "recurrenceType": {"id": 3, "name": "Weekly"},
  "startDate": "2026-01-03",
  "endDate": null,
  "interval": 2,
  "dayOfWeek": {"id": 5, "name": "Friday"},
  "dayOfMonth": 1,
  "weekOfMonth": null,
  "dayOfWeekInMonth": null,
  "dayOfQuarter": 1,
  "month": null,
  "dayOfYear": 1,
  "customDates": null,
  "id": null
}
```

*Monthly Rent (1st of month)*:
```json
{
  "recurrenceType": {"id": 4, "name": "Monthly - Day of Month"},
  "startDate": null,
  "endDate": null,
  "interval": 1,
  "dayOfWeek": null,
  "dayOfMonth": 1,
  "weekOfMonth": null,
  "dayOfWeekInMonth": null,
  "dayOfQuarter": 1,
  "month": null,
  "dayOfYear": 1,
  "customDates": null,
  "id": null
}
```

*Quarterly Investment Return (First day of quarter)*:
```json
{
  "recurrenceType": {"id": 6, "name": "Quarterly"},
  "startDate": "2026-03-01",
  "endDate": null,
  "interval": 1,
  "dayOfWeek": null,
  "dayOfMonth": 1,
  "weekOfMonth": null,
  "dayOfWeekInMonth": null,
  "dayOfQuarter": 1,
  "month": null,
  "dayOfYear": 1,
  "customDates": null,
  "id": null
}
```

*One-Time Bonus*:
```json
{
  "recurrenceType": {"id": 1, "name": "One Time"},
  "startDate": "2026-12-15",
  "endDate": null,
  "interval": 1,
  "dayOfWeek": null,
  "dayOfMonth": 1,
  "weekOfMonth": null,
  "dayOfWeekInMonth": null,
  "dayOfQuarter": 1,
  "month": null,
  "dayOfYear": 1,
  "customDates": null,
  "id": null
}
```

**Nullability**:
- Non-recurring transactions (actual/completed) can have `recurrence: null`
- Unused fields for a given recurrence type are set to `null`
- Default values (like `dayOfMonth: 1`) are included even when not used for consistency

**Periodic Change**:
- Optional escalation/growth applied to recurring values over time
- Can be applied to both transaction amounts and account balances
- Supports both standard types (predefined interest/growth patterns) and custom configurations

**Full Schema**:
```json
{
  "value": "number",
  "changeMode": {
    "id": "number (1=Percentage Rate, 2=Fixed Amount)",
    "name": "string (Percentage Rate|Fixed Amount)"
  },
  "changeType": {
    "id": "number (1-7, see periodicChangeTypes)",
    "name": "string"
  },
  "period": {
    "id": "number (optional, for Fixed Amount mode)",
    "name": "string (Daily|Weekly|Monthly|Quarterly|Yearly)"
  },
  "ratePeriod": {
    "id": "number (optional, for Custom type)",
    "name": "string (Annual|Monthly|Quarterly|Daily)"
  },
  "frequency": {
    "id": "number (optional, for Custom type)",
    "name": "string (Daily|Weekly|Monthly|Quarterly|Yearly)"
  }
}
```

**Change Mode** (ref: `lookup-data.json/changeModes`):
1. **Percentage Rate**: Apply percentage growth to balance
   - Value represents percentage (e.g., 3 = 3%)
   - Used for interest rates, investment returns, salary increases
2. **Fixed Amount**: Add fixed dollar amount per period
   - Value represents currency amount (e.g., 50 = $50)
   - Requires `period` field to specify frequency
   - Used for fixed monthly increases, recurring deposits

**Standard Periodic Change Types** (ref: `lookup-data.json/periodicChangeTypes`):
1. **Nominal Annual (No Compounding)**: Simple interest calculation
   - Formula: `FV = PV × (1 + r × t)`
   - Use case: Simple salary escalation (e.g., 3% annual raise)
2. **Nominal Annual, Compounded Monthly**: Interest compounded 12 times/year
   - Formula: `FV = PV × (1 + r/12)^(12×t)`
   - Use case: Savings accounts, most credit cards
3. **Nominal Annual, Compounded Daily**: Interest compounded 365 times/year
   - Formula: `FV = PV × (1 + r/365)^(365×t)`
   - Use case: High-yield savings accounts
4. **Nominal Annual, Compounded Quarterly**: Interest compounded 4 times/year
   - Formula: `FV = PV × (1 + r/4)^(4×t)`
   - Use case: Some bonds and CDs
5. **Nominal Annual, Compounded Annually**: Interest compounded once/year
   - Formula: `FV = PV × (1 + r)^t`
   - Use case: Simple investment returns
6. **Nominal Annual, Continuous Compounding**: Mathematical limit of compounding
   - Formula: `FV = PV × e^(r×t)`
   - Use case: Theoretical maximum growth
7. **Custom**: User-defined rate period and compounding frequency
   - Requires `ratePeriod` and `frequency` fields
   - Use case: Non-standard financial instruments

**Custom Periodic Change Configuration**:
When `changeType.id = 7` (Custom), additional fields are required:
- `ratePeriod`: Defines the time period for the rate value
  - Example: If rate is "1% monthly", ratePeriod = "Monthly"
- `frequency`: Defines how often compounding occurs
  - Example: Monthly rate compounded daily, frequency = "Daily"
- Allows modeling complex scenarios like "0.5% monthly rate compounded daily"

**Examples**:

*Standard Interest Rate (Savings Account)*:
```json
{
  "value": 2.5,
  "changeMode": {"id": 1, "name": "Percentage Rate"},
  "changeType": {"id": 2, "name": "Nominal Annual, Compounded Monthly"}
}
```

*Simple Annual Raise*:
```json
{
  "value": 3,
  "changeMode": {"id": 1, "name": "Percentage Rate"},
  "changeType": {"id": 1, "name": "Nominal Annual (No Compounding)"}
}
```

*Fixed Monthly Increase*:
```json
{
  "value": 50,
  "changeMode": {"id": 2, "name": "Fixed Amount"},
  "period": {"id": 3, "name": "Monthly"}
}
```

*Custom: 0.5% Monthly Compounded Daily*:
```json
{
  "value": 0.5,
  "changeMode": {"id": 1, "name": "Percentage Rate"},
  "changeType": {"id": 7, "name": "Custom"},
  "ratePeriod": {"id": 2, "name": "Monthly"},
  "frequency": {"id": 1, "name": "Daily"}
}
```

**Nullability**:
- Set to `null` or empty string when no periodic change applies
- All optional fields (`period`, `ratePeriod`, `frequency`) omitted when not applicable

### 3.2 Accounts
Stored in `app-data.json` under each scenario's `accounts` array.

**Schema**:
```json
{
  "id": "number (auto-generated)",
  "name": "string",
  "type": {
    "id": "number",
    "name": "string (Asset|Liability|Income|Expense)"
  },
  "currency": {
    "id": "number",
    "name": "string (USD|EUR|ZAR, etc.)"
  },
  "startingBalance": "number",
  "openDate": "string (ISO-8601 YYYY-MM-DD)",
  "periodicChange": {
    "value": "number",
    "changeMode": "object",
    "changeType": "object",
    "period": "object (nullable)",
    "ratePeriod": "object (nullable)",
    "frequency": "object (nullable)"
  }
}
```

**Account Types**:
- **Asset**: Checking, Savings, Investment accounts (positive balance = good)
- **Liability**: Credit cards, Loans (positive balance = owe money)
- **Income**: Salary, Returns, Revenue sources
- **Expense**: Rent, Groceries, Utilities, etc.

**Periodic Change on Accounts**:
- Applies growth/decline to account balances over time
- Common use cases:
  - Interest on savings accounts (e.g., 2.5% compounded monthly)
  - Investment returns (e.g., 7% annual growth)
  - Inflation adjustments for expense accounts
- Uses same schema and calculation as transaction periodic change (see 3.1)

### 3.3 Scenarios
Stored in `app-data.json` under `scenarios` array.
Scenarios are self-contained planning environments with their own accounts, transactions, and projections.

**Schema**:
```json
{
  "id": "number (auto-generated)",
  "name": "string",
  "type": {
    "id": "number",
    "name": "string (Budget|Forecast|Actuals)",
    "description": "string",
    "showAccounts": "boolean",
    "showPlannedTransactions": "boolean",
    "showActualTransactions": "boolean",
    "showProjections": "boolean",
    "accountColumns": "array (column names to display)",
    "transactionColumns": "array (column names to display)"
  },
  "description": "string",
  "startDate": "string (ISO-8601 YYYY-MM-DD)",
  "endDate": "string (ISO-8601 YYYY-MM-DD)",
  "projectionPeriod": {
    "id": "number",
    "name": "string (Day|Week|Month|Quarter|Year)"
  },
  "accounts": "array (Account objects - see 3.2)",
  "transactions": "array (Transaction objects - see 3.1)",
  "projections": "array (Projection objects)",
  "budgets": "array (Budget objects - see 3.4)"
}
```

**Scenario Types**:
- **Budget**: Planning scenario with editable budgets for tracking planned vs actual
- **Forecast**: Forward-looking projections based on assumptions
- **Actuals**: Historical tracking of completed transactions

**Key Features**:
- Each scenario is self-contained with its own accounts and transactions
- Scenario type determines which UI features are enabled (showAccounts, showProjections, etc.)
- `projectionPeriod` defines the time granularity for projections (monthly, quarterly, etc.)
- Column configuration controls which fields display in grids

### 3.4 Budgets
Stored within each scenario under `budgets` array.
Each budget represents a single dated occurrence expanded from a recurring transaction pattern, and can be edited independently.

**Schema**:
```json
{
  "id": "number (auto-generated)",
  "sourceTransactionId": "number (ref: transaction.id)",
  "primaryAccountId": "number (ref: account.id)",
  "secondaryAccountId": "number (ref: account.id)",
  "transactionTypeId": "number (ref: lookup:transactionTypes)",
  "amount": "number",
  "description": "string (nullable)",
  "occurrenceDate": "string (ISO-8601 YYYY-MM-DD)",
  "recurrenceDescription": "string (e.g., 'Monthly - Day of Month (Day 1)', 'Weekly (Friday)')",
  "periodicChange": {
    "value": "number",
    "changeMode": "object",
    "changeType": "object",
    "period": "object (nullable)",
    "ratePeriod": "object (nullable)",
    "frequency": "object (nullable)"
  },
  "status": {
    "name": "string (planned|actual)",
    "actualAmount": "number (nullable)",
    "actualDate": "string (ISO-8601 YYYY-MM-DD, nullable)"
  },
  "tags": "array"
}
```

**Data Normalization**:
- **Account References**: Stored as `primaryAccountId` and `secondaryAccountId` (ID only)
  - Full account objects resolved at runtime from scenario's `accounts` array
  - Prevents data duplication and ensures account updates propagate correctly
- **Transaction Type**: Stored as `transactionTypeId` (ID only)
  - Resolved from lookup data at runtime
- **Status**: Stored as object with `name`, `actualAmount`, and `actualDate`
  - Not a lookup - contains transaction-specific execution data

**Field Descriptions**:

- `id`: Auto-generated unique identifier for this budget occurrence
- `sourceTransactionId`: References the original transaction that generated this budget
- `primaryAccountId`: ID reference to primary account (resolved at runtime)
- `secondaryAccountId`: ID reference to secondary account (resolved at runtime)
- `transactionTypeId`: ID reference to transaction type (1=Money In, 2=Money Out)
- `amount`: Editable amount for this specific occurrence
- `description`: Transaction description, inherited from source transaction
- `occurrenceDate`: Specific date this budget occurrence is scheduled (YYYY-MM-DD)
- `recurrenceDescription`: Human-readable recurrence pattern (e.g., "Monthly - Day 1") for reference
- `periodicChange`: Full periodic change object copied from source transaction
- `status`: Object containing execution status
  - `name`: "planned" or "actual"
  - `actualAmount`: Actual executed amount when name="actual" (nullable)
  - `actualDate`: Date when executed (nullable)
- `tags`: Array of tags, inherited from source transaction

**Budget Generation Process**:
1. User creates recurring transactions with recurrence patterns
2. User saves transaction as a budget
3. Budget creation expands the recurrence pattern into individual dated occurrences
4. Each occurrence becomes a standalone budget record within the scenario date range
5. Each budget occurrence is independent and can be edited without affecting the source transaction or other occurrences

**Budget vs Transaction**:

| Aspect | Transaction | Budget |
|--------|-------------|---------|
| Purpose | Define recurring pattern | Track specific dated occurrence |
| Storage | Single record with recurrence pattern | Expanded: one per occurrence date |
| Amount | Base amount | Editable per occurrence |
| Date | Start/end dates for pattern | Specific occurrence date |
| Editing | Changes affect source and all future | Changes only this occurrence |
| Actuals | Not tracked | `actualAmount` when executed |
| Status | planned/actual | planned/actual |
| Independence | Linked to future occurrences | Standalone, independent record |

**Money Flow**:
- Budget inherits `primaryAccount` and `secondaryAccount` from source transaction
- `transactionType` determines direction:
  - **Money In**: `secondaryAccount` → `primaryAccount` (e.g., salary deposit)
  - **Money Out**: `primaryAccount` → `secondaryAccount` (e.g., rent payment)
- Same double-entry accounting model as transactions

**Workflow**:
1. **Create**: User creates recurring transactions with recurrence patterns
2. **Generate**: User clicks "Save as Budget" to expand transactions into dated occurrences
3. **Plan**: User edits `amount` for specific occurrences (e.g., expecting higher grocery cost in December)
4. **Execute**: When transaction occurs, user enters `status.actualAmount` and `status.actualDate`
5. **Track**: Compare `amount` (planned) vs `status.actualAmount` (actual) for variance analysis
6. **Regenerate**: User can regenerate from source transactions to reset to original projections

**Example Budget Occurrence**:

*Stored Data (ID references only)*:
```json
{
  "id": 15,
  "sourceTransactionId": 3,
  "primaryAccountId": 4,
  "secondaryAccountId": 11,
  "transactionTypeId": 2,
  "amount": 2200,
  "description": "Monthly rent payment",
  "occurrenceDate": "2026-02-01",
  "recurrenceDescription": "Monthly - Day of Month (Day 1)",
  "periodicChange": null,
  "status": {
    "name": "planned",
    "actualAmount": null,
    "actualDate": null
  },
  "tags": []
}
```

*Runtime Resolution (UI display)*:
When displaying in UI, IDs are resolved to full objects:
- `primaryAccountId: 4` → Lookup in scenario.accounts → `{id: 4, name: "Checking Account", ...}`
- `secondaryAccountId: 11` → Lookup in scenario.accounts → `{id: 11, name: "Rent", ...}`
- `transactionTypeId: 2` → Lookup in transactionTypes → `{id: 2, name: "Money Out", ...}`
- `status` object remains as-is (not a lookup)

This ensures:
- Single source of truth for account data
- Account updates automatically reflect in all transactions/budgets
- Smaller file size (no duplicated account objects)
- Each budget occurrence is completely independent
- Transaction-specific execution data (actualAmount, actualDate) stays with each budget

**Use Cases**:
- **Budget Planning**: Edit individual occurrence amounts for seasonal variations (holiday spending, quarterly bonuses)
- **Actual Tracking**: Record actual amounts as transactions execute
- **Variance Analysis**: Compare planned vs actual for budget performance
- **What-if Analysis**: Test different spending scenarios without changing source transactions
- **Historical Reference**: Each budget maintains link to source transaction via `sourceTransactionId`

### 3.5 Projections
Stored within each scenario under `projections` array.
Projections are calculated forecasts of account balances over time based on transactions and recurrence patterns.

**Schema**:
```json
{
  "id": "number (auto-generated)",
  "scenarioId": "number (ref: scenario.id)",
  "accountId": "number (ref: account.id)",
  "date": "string (ISO-8601 YYYY-MM-DD)",
  "balance": "number",
  "income": "number",
  "expenses": "number",
  "netChange": "number",
  "period": "number"
}
```

**Field Descriptions**:
- `id`: Auto-generated unique identifier for this projection record
- `scenarioId`: Reference to parent scenario
- `accountId`: Reference to the account being projected
- `date`: The date for this projection period (typically start of period)
- `balance`: Projected account balance at this point in time
- `income`: Total income for this period
- `expenses`: Total expenses for this period
- `netChange`: Net change in balance (income - expenses)
- `period`: Period number within the scenario (1, 2, 3, etc.)

**Projection Generation Process**:
1. User creates transactions with recurrence patterns
2. Projection engine expands recurring transactions into individual occurrences
3. For each period in scenario date range:
   - Calculate transactions that occur in that period
   - Apply periodic change to recurring amounts
   - Sum income and expenses
   - Calculate running balance from starting balance
4. Generate one projection record per account per period

**Use Cases**:
- **Cash Flow Forecasting**: See projected balances over time
- **Budget Planning**: Identify periods with negative cash flow
- **Scenario Comparison**: Compare different financial strategies
- **Visualization**: Display charts and graphs of projected finances

## 4.0 Lookup Data (Static)
Defined in `assets/lookup-data.json`. This file contains immutable reference data used across the application.

### 4.1 Scenario Types
```json
[
  {
    "id": 1,
    "name": "Budget",
    "description": "Budget tracking scenario",
    "showAccounts": true,
    "showPlannedTransactions": true,
    "showActualTransactions": true,
    "showProjections": true,
    "accountColumns": ["name", "type", "currency", "startingBalance", "openDate"],
    "transactionColumns": ["debitAccount", "creditAccount", "amount", "description", "tags"]
  },
  {
    "id": 2,
    "name": "General",
    "description": "General financial planning scenario"
  },
  {
    "id": 3,
    "name": "Funds",
    "description": "Investment funds tracking scenario"
  }
]
```

### 4.2 Account Types
```json
[
  {"id": 1, "name": "Asset"},
  {"id": 2, "name": "Liability"},
  {"id": 3, "name": "Equity"},
  {"id": 4, "name": "Income"},
  {"id": 5, "name": "Expense"}
]
```

### 4.3 Currencies
```json
[
  {"id": 1, "name": "ZAR"},
  {"id": 2, "name": "USD"},
  {"id": 3, "name": "EUR"},
  {"id": 4, "name": "GBP"}
]
```

### 4.4 Transaction Types
```json
[
  {"id": 1, "name": "Money In", "description": "Flow from secondary to primary account"},
  {"id": 2, "name": "Money Out", "description": "Flow from primary to secondary account"}
]
```

### 4.5 Recurrence Types
```json
[
  {"id": 1, "name": "One Time"},
  {"id": 2, "name": "Daily"},
  {"id": 3, "name": "Weekly"},
  {"id": 4, "name": "Monthly - Day of Month"},
  {"id": 5, "name": "Monthly - Week of Month"},
  {"id": 6, "name": "Quarterly"},
  {"id": 7, "name": "Yearly"},
  {"id": 11, "name": "Custom Dates"}
]
```

### 4.6 Period Types
```json
[
  {"id": 1, "name": "Day"},
  {"id": 2, "name": "Week"},
  {"id": 3, "name": "Month"},
  {"id": 4, "name": "Quarter"},
  {"id": 5, "name": "Year"}
]
```

### 4.7 Periodic Change Types
```json
[
  {"id": 1, "name": "Nominal Annual (No Compounding)"},
  {"id": 2, "name": "Nominal Annual, Compounded Monthly"},
  {"id": 3, "name": "Nominal Annual, Compounded Daily"},
  {"id": 4, "name": "Nominal Annual, Compounded Quarterly"},
  {"id": 5, "name": "Nominal Annual, Compounded Annually"},
  {"id": 6, "name": "Nominal Annual, Continuous Compounding"},
  {"id": 7, "name": "Custom"}
]
```

### 4.8 Change Modes
```json
[
  {"id": 1, "name": "Percentage Rate"},
  {"id": 2, "name": "Fixed Amount"}
]
```

### 4.9 Rate Periods
```json
[
  {"id": 1, "name": "Annual"},
  {"id": 2, "name": "Monthly"},
  {"id": 3, "name": "Quarterly"},
  {"id": 4, "name": "Daily"}
]
```

### 4.10 Frequencies
```json
[
  {"id": 1, "name": "Daily"},
  {"id": 2, "name": "Weekly"},
  {"id": 3, "name": "Monthly"},
  {"id": 4, "name": "Quarterly"},
  {"id": 5, "name": "Yearly"}
]
```

## 5.0 DataStore API (`js/core/data-store.js`)
The `DataStore` class is the generic interface for all data operations.

- `init()`: Loads `app-data.json` into `this._data`.
- `save()`: Writes `this._data` to `app-data.json`.
- `read()`: Returns current data snapshot.
- `transaction(callback)`: Executes data modifications atomically.

### 5.1 Manager Classes
Business logic is organized into manager classes that use DataStore:

- **ScenarioManager** (`js/managers/scenario-manager.js`): CRUD operations for scenarios
- **AccountManager** (`js/managers/account-manager.js`): CRUD operations for accounts within scenarios
- **TransactionManager** (`js/managers/transaction-manager.js`): CRUD operations for transactions
- **BudgetManager** (`js/managers/budget-manager.js`): CRUD operations for budget occurrences

### 5.2 Data Manager Utilities (`js/data-manager.js`)
Helper functions for common data operations:

- `getScenario(id)`: Retrieve scenario by ID
- `saveProjections(scenarioId, projections)`: Save projection results
- `saveBudget(scenarioId, budgets)`: Save budget snapshot
- `getBudget(scenarioId)`: Retrieve budget occurrences
- `clearBudget(scenarioId)`: Remove all budget occurrences
