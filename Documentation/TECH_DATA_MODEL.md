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
Stored in `app-data.json` under `transactions` array.
```json
{
  "id": "string (uuid)",
  "date": "string (ISO-8601 YYYY-MM-DD)",
  "description": "string",
  "amount": "number",
  "accountId": "string (ref: account.id)",
  "scenarioId": "string (ref: scenario.id)",
  "status": "string (cleared|pending)"
}
```

### 3.2 Accounts
Stored in `app-data.json` under `accounts` array.
```json
{
  "id": "string",
  "name": "string",
  "type": "string (ref: lookup:accountTypes)",
  "currency": "string (ref: lookup:currencies)",
  "openingBalance": "number",
  "institution": "string"
}
```

### 3.3 Scenarios
Stored in `app-data.json` under `scenarios` array.
Used to filter transactions for different projection models.
```json
{
  "id": "number",
  "name": "string",
  "type": "object (ref: lookup:scenarioTypes)",
  "description": "string",
  "startDate": "string (ISO-8601 YYYY-MM-DD)",
  "endDate": "string (ISO-8601 YYYY-MM-DD)",
  "projectionPeriod": "object (ref: lookup:periodTypes)",
  "accounts": "array",
  "transactions": "array",
  "projections": "array",
  "budgets": "array"
}
```

### 3.4 Budgets
Stored within each scenario under `budgets` array.
Budgets are snapshots of projections that become editable working datasets for planning.
```json
{
  "id": "number",
  "sourceTransactionId": "number (optional, ref: transaction.id)",
  "date": "string (ISO-8601 YYYY-MM-DD)",
  "amount": "number",
  "plannedAmount": "number",
  "actualAmount": "number (nullable)",
  "description": "string",
  "debitAccount": "object (ref: account)",
  "creditAccount": "object (ref: account)",
  "recurrence": "object (nullable)",
  "status": "string (planned|actual)"
}
```

**Budget Workflow**:
1. User generates projections from transactions
2. User clicks "Save as Budget" to create a budget snapshot
3. Budget becomes the editable working dataset
4. User can edit amounts, dates, descriptions, and track actuals
5. User can generate new projections from budget ("Project from Budget")
6. Original transactions remain available for regenerating from source

## 4.0 Lookup Data (Static)
Defined in `assets/lookup-data.json`. This replaces previous fragmented JSON files.

- **Scenario Types**: `[ "actuals", "forecast", "budget" ]`
- **Account Types**: `[ "checking", "savings", "credit_card", "investment" ]`
- **Currencies**: `[ "USD", "EUR", "GBP", ... ]`
- **Period Types**: `[ "daily", "weekly", "monthly", "yearly" ]` (Used for recurrence)

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
