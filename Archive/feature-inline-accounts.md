# Feature Plan: Inline Account Management

**Objective:** To refactor the Accounts page UI/UX by enabling direct in-grid editing, introducing a "quick add" feature, and updating the data model to include a current balance. This will streamline account management, moving away from the top-level form to a more interactive table.

---

## 1. Branching Strategy

First, a new feature branch will be created to isolate these changes:

```bash
git checkout -b feature/accounts-inline-editing
```

---

## 2. Task Breakdown & Implementation Plan

This feature will be implemented by modifying three key files: `assets/app-data.json`, `js/accounts.js`, and `styles/app.css`. The top-level form in `pages/accounts.html` will be removed.

### Task 2.1: Update Data Model

**File:** `assets/app-data.json`

**Action:** Add a `current_balance` field to each account object.
**Reasoning:** This field is necessary to track the balance as it changes due to transactions, separating it from the initial starting balance. For now, it will be initialized to the same value as the starting `balance`.

**Example:**
```json
{
  "name": "Transactional",
  "balance": 10000,
  "current_balance": 10000, // Add this field
  "interest": 2,
  "interest_period": "year",
  "compound_period": "month",
  "interest_type": "compound"
}
```

### Task 2.2: Refactor UI and Logic

**File:** `js/accounts.js`

**Actions:**

1.  **Remove Top Form Logic:** Delete the event listeners and logic associated with the old `#accountForm`, including the `editingAccount` and `newAccountInterest` state variables at the top level.
2.  **Introduce SVG Icons:** Create a helper object to store SVG icons for actions (Edit, Delete, Save, Cancel, Interest). This keeps the `renderAccounts` function clean and avoids managing separate image files.
3.  **Update `renderAccounts` Function:**
    *   Add a "Current Balance" column to the table header.
    *   Display `acct.current_balance` in the new column for each row.
    *   Replace the text-based action buttons with the new SVG icon buttons. Each row will have a `data-idx` attribute corresponding to its index in the `window.accounts` array.
4.  **Implement Inline Editing (`toggleEditState`):**
    *   Create a function `toggleEditState(row, isEditing)` that takes a table row element and a boolean.
    *   If `isEditing` is `true`, it will:
        *   Make the "Name" and "Start Balance" cells `contenteditable="true"`.
        *   Show "Save" and "Cancel" icons, while hiding "Edit" and "Delete".
    *   If `isEditing` is `false`, it will revert the above changes.
5.  **Implement "Quick Add" Feature:**
    *   Programmatically create a `+ Add Account` button below the table.
    *   On click, this button will add a new, blank row to the table, immediately putting it into the edit state.
    *   The "Save" handler for this new row will create a new account object and push it to `window.accounts`. The "Cancel" handler will simply remove the row from the DOM.
6.  **Update Event Handlers:**
    *   Attach event listeners to the new action icons using event delegation on the table body.
    *   The "Save" icon's handler will read the `textContent` from the editable cells, update the `window.accounts` array, call `window.afterDataChange()` to persist data, and then exit the edit state.
    *   The "Interest" icon will continue to open the existing interest modal.

### Task 2.3: Update HTML Structure

**File:** `pages/accounts.html`

**Action:** Remove the entire `<form id="accountForm" ...>` element and its contents. The space will be reclaimed, creating a cleaner layout.

### Task 2.4: Styling

**File:** `styles/app.css`

**Actions:**

1.  **Icon Button Styles:** Add a new `.icon-btn` class for the SVG action buttons, including styles for size, padding, cursor, and hover/focus effects to ensure they are user-friendly.
2.  **Editable Cell Styles:** Add a style for `[contenteditable="true"]` cells to provide a clear visual cue that they are editable (e.g., a subtle background color change and an `outline`).

---

## 3. Design & Style Justification

*   **`contenteditable` vs. `<input>`:** Using the `contenteditable` attribute is a more modern and less disruptive approach than replacing `<td>` elements with `<input>` fields. It results in simpler DOM manipulation and a smoother user experience.
*   **SVG Icons:** Embedding SVGs directly in the JavaScript is efficient. It avoids extra HTTP requests, keeps the component self-contained, and allows for easy styling via CSS.
*   **Separation of Concerns:** The logic for updating the `current_balance` is intentionally excluded from this plan. That logic belongs with the transaction processing feature. This plan focuses solely on the UI/UX refactor of the accounts grid as requested.
*   **Consistency:** All new UI elements and styles will adhere to the existing dark theme and responsive design of the application.

This plan provides a comprehensive roadmap for implementing the requested features while maintaining code quality and adhering to existing design patterns.
