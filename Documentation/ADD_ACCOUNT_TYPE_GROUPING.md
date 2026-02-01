# Add Account Type Grouping - Analysis & Implementation

**Date**: 1 February 2026  
**Request**: Add "Account Type" as a grouping option for Transactions and Budget grids

---

## 1.0 Current State

### 1.1 Transaction Grid Grouping Options

**Location**: [forecast.js](js/forecast.js#L846-L852)

Current options:
- None
- Type (Money In/Out) → field: `transactionTypeName`
- Recurrence Period → field: `recurrenceSummary`
- Account → field: `primaryAccountName`

### 1.2 Budget Grid Grouping Options

**Location**: [forecast.js](js/forecast.js#L1683-L1689)

Current options:
- None
- Type (Money In/Out) → field: `transactionTypeName`
- Recurrence Period → field: `recurrenceDescription`
- Account → field: `primaryAccountName`

---

## 2.0 What Data is Available?

### 2.1 Account Objects in Transformed Rows

Each transaction row contains account information:

```javascript
{
  primaryAccount: {
    id: 1,
    name: "Jeanre Transactional",
    type: { id: 1, name: "Asset" },      // ← Account Type!
    currency: { id: 1, name: "ZAR" },
    startingBalance: 0,
    // ... other fields
  },
  primaryAccountName: "Jeanre Transactional",
  primaryAccountType: undefined,           // ← NOT SET YET
  primaryAccountTypeName: undefined,       // ← NOT SET YET
  
  secondaryAccount: {
    id: 4,
    name: "Jeanre Credit Card",
    type: { id: 2, name: "Liability" },   // ← Account Type!
    // ... other fields
  },
  secondaryAccountName: "Jeanre Credit Card",
  secondaryAccountType: undefined,         // ← NOT SET YET
  secondaryAccountTypeName: undefined      // ← NOT SET YET
}
```

**Key Finding**: The account objects have `type` with both `id` and `name`, but we need to extract the type name as separate fields for grouping.

---

## 3.0 Implementation Strategy

### 3.1 Phase 1: Add Account Type Fields to Transformed Rows (5 min)

**File**: [transaction-row-transformer.js](js/transaction-row-transformer.js#L47)

Modify `transformTransactionToRows()` to add account type information:

```javascript
export function transformTransactionToRows(tx, accounts = []) {
  // ... existing code ...

  const primaryRow = {
    ...base,
    // ... existing fields ...
    primaryAccount,
    secondaryAccount,
    primaryAccountName: primaryAccount?.name || '',
    primaryAccountTypeName: primaryAccount?.type?.name || '',  // ← ADD THIS
    secondaryAccountName: secondaryAccount?.name || '',
    secondaryAccountTypeName: secondaryAccount?.type?.name || '' // ← ADD THIS
  };

  rows.push(primaryRow);

  if (tx.secondaryAccountId) {
    // ... existing code ...
    rows.push({
      ...base,
      // ... existing fields ...
      primaryAccount: secondaryAccount,
      secondaryAccount: primaryAccount,
      primaryAccountName: secondaryAccount?.name || '',
      primaryAccountTypeName: secondaryAccount?.type?.name || '',  // ← ADD THIS
      secondaryAccountName: primaryAccount?.name || '',
      secondaryAccountTypeName: primaryAccount?.type?.name || ''   // ← ADD THIS
    });
  }

  return rows;
}
```

**Why**: Tabulator needs the field value as a property on each row to group by it.

### 3.2 Phase 2: Update UI Dropdowns (10 min)

#### 2A: Transactions Grid

**Location**: [forecast.js](js/forecast.js#L846-L852)

```javascript
const groupingControl = document.createElement('div');
groupingControl.className = 'toolbar-item grouping-control';
groupingControl.innerHTML = `
  <label for="tx-grouping-select" class="text-muted control-label">Group By:</label>
  <select id="tx-grouping-select" class="input-select control-select">
    <option value="">None</option>
    <option value="transactionTypeName">Type (Money In/Out)</option>
    <option value="primaryAccountTypeName">Account Type</option>
    <option value="recurrenceSummary">Recurrence Period</option>
    <option value="primaryAccountName">Account</option>
  </select>
`;
window.add(toolbar, groupingControl);
```

#### 2B: Budget Grid

**Location**: [forecast.js](js/forecast.js#L1683-L1689)

```javascript
const groupingControl = document.createElement('div');
groupingControl.className = 'toolbar-item grouping-control';
groupingControl.innerHTML = `
  <label for="budget-grouping-select" class="text-muted control-label">Group By:</label>
  <select id="budget-grouping-select" class="input-select control-select">
    <option value="">None</option>
    <option value="transactionTypeName">Type (Money In/Out)</option>
    <option value="primaryAccountTypeName">Account Type</option>
    <option value="recurrenceDescription">Recurrence Period</option>
    <option value="primaryAccountName">Account</option>
  </select>
`;
window.add(toolbar, groupingControl);
```

**Order**: Placed after "Type" since it's a related categorical grouping.

---

## 4.0 Data Flow

```
Primary Transaction (no secondary account)
├── Account ID: 1
├── Account Name: "Jeanre Transactional"
├── Account Type ID: 1
└── Account Type Name: "Asset" ← Extracted to primaryAccountTypeName

Row Display
├── primaryAccountTypeName: "Asset"
├── primaryAccountName: "Jeanre Transactional"
└── Tabulator can now group by "primaryAccountTypeName"

Secondary Transaction (flipped perspective)
├── Primary (was secondary):
│   ├── Account ID: 4
│   ├── Account Name: "Jeanre Credit Card"
│   ├── Account Type ID: 2
│   └── Account Type Name: "Liability" ← Extracted to primaryAccountTypeName
└── (Row displays this as primary)
```

---

## 5.0 Example Output

### 5.1 Transactions Grouped by Account Type

```
Asset (23 items, Total: -45,000 ZAR)
  Transaction 1: Jeanre Transactional → Easy Equities (5,000 ZAR)
  Transaction 2: Child Fund → Bulk Fund (2,000 ZAR)
  ...

Liability (15 items, Total: -92,000 ZAR)
  Transaction 1: Home Loan (Payment) (7,500 ZAR)
  Transaction 2: Jeanre Credit Card → Running Costs (1,800 ZAR)
  ...

Expense (42 items, Total: -125,000 ZAR)
  Transaction 1: Insurance (1,200 ZAR)
  Transaction 2: Fuel (800 ZAR)
  ...

Income (8 items, Total: 35,000 ZAR)
  Transaction 1: Bicycle (7,000 ZAR)
  Transaction 2: Dean (28,000 ZAR)
```

### 5.2 Budget Grouped by Account Type

Similar structure but with planned budget amounts and actual amounts for tracking.

---

## 6.0 Files to Modify

| File | Location | Change | Impact |
|------|----------|--------|--------|
| transaction-row-transformer.js | Lines 47-100 | Add `primaryAccountTypeName` and `secondaryAccountTypeName` fields | Core data transformation |
| forecast.js | Lines 846-852 | Add "Account Type" option to tx-grouping-select | UI dropdown |
| forecast.js | Lines 1683-1689 | Add "Account Type" option to budget-grouping-select | UI dropdown |

---

## 7.0 Edge Cases

### 7.1 Missing Account Type

If `primaryAccount.type` is null or undefined:
- Current: Falls back to empty string `''`
- Result: Rows group under "Unspecified"
- Solution: Already handled by existing formatGroupLabel logic

### 7.2 Accounts Without Assigned Types

Budget data that links to accounts might reference accounts with null types:
- Already safe: `primaryAccount?.type?.name || ''` returns empty string

### 7.3 Flipped Perspective Rows

When viewing from secondary account perspective:
- The `primaryAccountTypeName` will be the secondary account's type
- Correct behavior: Groups appear under the perspective account's type

---

## 8.0 Testing Checklist

- [ ] Add fields to transaction-row-transformer.js
- [ ] Update transactions grid dropdown (4 options)
- [ ] Update budget grid dropdown (4 options)
- [ ] Select "Account Type" grouping in transactions
- [ ] Verify rows group by asset/liability/expense/income
- [ ] Check group headers show correct type labels
- [ ] Select "Account Type" grouping in budget
- [ ] Verify filtering still works with grouping active
- [ ] Test flipped perspective rows group correctly
- [ ] Test with missing account types (edge case)
- [ ] Verify totals calculate correctly per group
- [ ] Check scroll position/state preservation works

---

## 9.0 Implementation Complexity

**Difficulty**: ⭐ Easy (5 min implementation)  
**Risk Level**: 🟢 Low (no breaking changes)  
**Testing**: 🟢 Low (straightforward UI feature)

---

## 10.0 Future Enhancements

- Add secondary account type as separate option
- Add combined option: "Account (Primary & Secondary Type)"
- Add status grouping: "Planned vs Actual"
- Add tag-based grouping (if tags are used)
- Smart grouping by expense categories (based on account type patterns)
