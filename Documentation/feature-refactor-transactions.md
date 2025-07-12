# Feature Plan: Transaction Management Overhaul

**Objective:** To completely refactor the transaction management system by introducing a reusable, editable grid component, enhancing the data model with accounting-standard features, and streamlining the user interface for a more intuitive and powerful experience.

---

## 1. Branching Strategy

First, a new feature branch will be created to isolate these changes from the main development line:

```bash
git checkout -b feature/transactions-refactor
```

---

## 2. Task Breakdown & Implementation Plan

This is a significant architectural refactor. The plan is broken down into sequential tasks, starting with creating a reusable component and then building the new functionality upon it.

### Task 2.1: Create a Reusable Editable Grid Module

**File:** `js/editable-grid.js` (New File)

**Action:**
1.  Create a new JavaScript module that encapsulates the logic for an editable grid. This module will be designed as a class or factory function.
2.  Abstract the core functionality from the recently updated `js/accounts.js`, including:
    *   Rendering table rows from a data array.
    *   Handling inline editing via `contenteditable`.
    *   Displaying and managing action icons (Edit, Save, Cancel, Delete).
    *   Event delegation for all user actions.
    *   A "quick add" button and its associated logic.
3.  The module must be highly configurable, accepting an options object that defines:
    *   The target table element.
    *   Column definitions (field name, header, type: text, number, select, etc.).
    *   Callbacks for `onSave`, `onDelete`, and `onUpdate` events.

**Reasoning:** This directly addresses the requirement to make the grid logic reusable. Creating this foundational component first will simplify the refactoring of the Accounts page and the creation of the new Transactions page.

### Task 2.2: Refactor Accounts Page to Use the Grid Module

**File:** `js/accounts.js`

**Action:**
1.  Import and instantiate the new `EditableGrid` module.
2.  Remove the bespoke grid rendering, event handling, and inline editing logic from `accounts.js`.
3.  Configure the `EditableGrid` instance with the specific columns and callbacks required for managing accounts.

**Reasoning:** This step serves as a crucial validation of the `EditableGrid` module's design and functionality before it's used for the more complex transactions grid.

### Task 2.3: Update Data Models for Accounts & Transactions

**File:** `assets/app-data.json`

**Action:**
1.  **Accounts:** Add two new properties to each account object:
    *   `group`: A string for standard accounting categories. Default to `"uncategorized"`.
    *   `tags`: An array of strings for custom user tagging. Default to `[]`.
2.  **Transactions:** Redefine the transaction object to support the new requirements. This represents the "transaction definition".
    *   `description`: (Previously `name`) A clear description of the transaction.
    *   `amount`: The base monetary value.
    *   `account`: The name of the account this transaction affects.
    *   `isRecurring`: A boolean flag.
    *   `executionDate`: For non-recurring transactions, the specific date the transaction occurs (e.g., "2025-07-15").
    *   `recurrence`: An object containing `{ frequency: 'monthly', endDate: 'YYYY-MM-DD', dayOfMonth: 1 }` if `isRecurring` is true. The `dayOfMonth` is the execution day, defaulting to the 1st.
    *   `amountChange`: An optional object to model value changes over time.
        *   `type`: The type of change: `'value'` (fixed amount), `'percentage'` (e.g., 2 for 2%), or `'ratio'` (e.g., 0.02 for 2%).
        *   `value`: The numeric value of the change.
        *   `frequency`: The period of the change (e.g., `'monthly'`, `'yearly'`), independent of the transaction's own recurrence.
    *   `tags`: An array for custom user tagging.

**Example Data Structure:**
```json
"accounts": [
  {
    "name": "Checking",
    "balance": 5000,
    "current_balance": 5000,
    "group": "Assets", // New
    "tags": ["primary", "salary"] // New
    // ... interest properties
  }
],
"transactions": [
  {
    "description": "Netflix Subscription",
    "amount": -15.99,
    "account": "Checking",
    "isRecurring": true,
    "recurrence": {
      "frequency": "monthly",
      "endDate": "2028-12-31",
      "dayOfMonth": 1
    },
    "amountChange": {
      "type": "value",
      "value": 0.50,
      "frequency": "yearly"
    },
    "tags": ["entertainment", "subscription"]
  },
  {
    "description": "Car Repair",
    "amount": -450.00,
    "account": "Checking",
    "isRecurring": false,
    "executionDate": "2025-08-20", // For one-time transactions
    "recurrence": null,
    "amountChange": null,
    "tags": ["auto", "unexpected"]
  }
]
```

### Task 2.4: Implement the New Transactions Page

**Files:** `pages/transactions.html`, `js/transactions.js`

**Action:**
1.  **`pages/transactions.html`:**
    *   Remove the old form-based UI.
    *   Add a simple panel structure containing a `<table>` element, which will be the target for the new `EditableGrid`.
    *   Add tooltips to column headers to replace lengthy descriptions.
2.  **`js/transactions.js`:**
    *   Create the new JavaScript module for the transactions page.
    *   Import and instantiate the `EditableGrid` module.
    *   Define the column configuration for the transaction grid, including dynamic fields:
        *   The `endDate` and `dayOfMonth` columns should be hidden or disabled if `isRecurring` is false.
        *   The `executionDate` column should be hidden or disabled if `isRecurring` is true.
        *   The `account` column should be a dropdown (`<select>`) populated from `window.accounts`.
        *   The `amountChange` column will likely require a pop-up or modal to configure its object properties.
    *   Implement the save callback to handle creating and updating transaction definitions in the `window.transactions` array.
    *   The logic for creating "transaction instances" for the forecast will be deferred as per the notes. This implementation focuses on managing the definitions.

### Task 2.5: Enhance Account Management from Transactions Page

**File:** `js/transactions.js`

**Action:**
1.  Modify the `account` column in the grid configuration.
2.  When the account dropdown is selected, include a `"-- Create New Account --"` option.
3.  If selected, open a simplified modal that allows the user to create a new account.
4.  When creating an account from this context, the `group` property should default to `"Expense"`.
5.  After creation, the new account should be added to `window.accounts`, saved via `afterDataChange()`, and the dropdown in the grid should be refreshed and selected.

---

## 3. Design & Style Justification

*   **Modular Grid:** Creating a reusable grid component is a core principle of DRY (Don't Repeat Yourself). It will significantly reduce code duplication, simplify maintenance, and ensure a consistent user experience across different pages.
*   **Data Model:** The separation of "transaction definition" from "transaction instance" is a critical architectural decision that enables accurate, long-term forecasting without creating millions of data points upfront. The new fields for `group` and `tags` provide powerful, industry-standard data filtering and reporting capabilities for future features.
*   **UX Enhancements:** Moving to a fully editable grid with a "quick add" button is a major UX improvement that streamlines the workflow. Hiding irrelevant fields (like `endDate` for non-recurring items) reduces clutter and user error.

This plan provides a robust, phased approach to implementing the requested features, prioritizing architectural soundness and user experience.
