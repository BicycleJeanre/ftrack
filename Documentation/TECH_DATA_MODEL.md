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
  "id": "string",
  "name": "string",
  "type": "string (ref: lookup:scenarioTypes)"
}
```

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
- `addTransaction(t)`: Pushes to array and saves.
- `updateTransaction(id, updates)`: Finds, merges, and saves.
- `getTransactions()`: Returns array.
