# transactions.md

## Purpose
Defines the Transactions page, where users can add, edit, and delete financial transactions that affect accounts. Supports recurring transactions and percentage changes.

## Key Elements
- **Form**: For adding/updating transactions (name, account, amount, date, recurrence, etc.).
- **Table**: Lists all transactions with their details and actions.
- **Script Includes**: Loads all required JS for data, logic, and UI.

## Interactions
- Reads and writes transaction data to the global state (window.transactions).
- Triggers `afterDataChange` to save to localStorage and update the UI.
- Interacts with `accounts.js` for account selection.
- Uses `forecast-storage.js`, `default-data.js`, and `data-startup.js` for data persistence and initialization.

## Diagrams
```mermaid
flowchart TD
  Form[Transaction Form] -->|submit| Table[Transactions Table]
  Table -->|edit/delete| Form
  Form -->|change| afterDataChange
  afterDataChange -->|save| localStorage
  afterDataChange -->|update| renderTransactions
```
