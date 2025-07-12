# accounts.md

## Purpose
Defines the Accounts page, where users can add, edit, and delete financial accounts, including setting interest rates and compounding options. Now uses a reusable modal component for interest settings.

## Key Elements
- **Form**: For adding/updating account name and starting balance.
- **Table**: Lists all accounts with their balances and interest settings.
- **Interest Modal**: Now managed by `modal-interest.js` as a reusable component.
- **Script Includes**: Loads all required JS for data, logic, and UI.

## Interactions
- Reads and writes account data to the global state (window.accounts).
- Triggers `afterDataChange` to save to localStorage and update the UI.
- Interacts with `transactions.js` for account dropdowns.
- Uses `forecast-storage.js`, `default-data.js`, and `data-startup.js` for data persistence and initialization.
- Imports and uses `InterestModal` from `modal-interest.js` for interest editing.

## Diagrams
```mermaid
flowchart TD
  Form[Account Form] -->|submit| Table[Accounts Table]
  Table -->|edit/delete| Modal[InterestModal Component]
  Form & Modal -->|change| afterDataChange
  afterDataChange -->|save| localStorage
  afterDataChange -->|update| renderAccounts
  Modal -->|imported by| AccountsJS[accounts.js]
```
