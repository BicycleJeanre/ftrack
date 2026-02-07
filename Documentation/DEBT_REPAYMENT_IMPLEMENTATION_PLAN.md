# Debt Repayment - Minimal Implementation Plan

**Version**: 1.0.0  
**Date**: February 2, 2026  
**Status**: PLAN READY FOR EXECUTION  
**Complexity**: Low-Medium  
**Estimated Effort**: 2–3 hours  

---

## 1.0 Overview

This document provides a minimal, step-by-step implementation plan for the Debt Repayment scenario type within the current ftrack architecture. The design leverages existing patterns and requires minimal code changes.

## 2.0 Core Requirements

From [DEBT_REPAYMENT_FINAL_DESIGN.md](DEBT_REPAYMENT_FINAL_DESIGN.md):

1. ✅ Configuration entry in `lookup-data.json`
2. ✅ New `showSummaryCards` flag support
3. ✅ Hide Budget section for this scenario
4. ✅ Hide Actual Transactions for this scenario
5. ✅ Summary Cards component (per-account + overall total)
6. ✅ Integration with forecast.js visibility logic
7. ✅ Calculate and display: Current Balance, Projected End, Interest Paid, Payoff Date

---

## 3.0 Implementation Tasks

### 3.1 Task 1: Add Configuration Entry (15 min)

**File**: [assets/lookup-data.json](../assets/lookup-data.json)

**Action**: Add new scenario type entry to `scenarioTypes` array.

**Details**:
- Existing config has 3 types (Budget, General, Funds)
- New type: "Debt Repayment" (id: 4)
- Set `showSummaryCards: true` (new flag)
- Set `showBudget: false` (implies budgetSection hidden)
- Set `showActualTransactions: false` (already a supported flag)
- Include columns for debt scenarios (interestRate, balance, etc.)

**Code Location**: `scenarioTypes` array, add after Funds entry

```json
{
  "id": 4,
  "name": "Debt Repayment",
  "description": "Track and model debt payoff scenarios",
  "showAccounts": true,
  "showPlannedTransactions": true,
  "showActualTransactions": false,
  "showBudget": false,
  "showProjections": true,
  "showSummaryCards": true,
  "accountColumns": [
    "name", "type", "currency", "balance", "openDate",
    "interestRate", "periodicChange", "description"
  ],
  "transactionColumns": [
    "primaryAccount", "secondaryAccount", "transactionType",
    "amount", "description", "recurrence", "periodicChange", "tags"
  ]
}
```

**Success Criteria**:
- ✅ JSON is valid
- ✅ "Debt Repayment" appears in scenario type dropdown
- ✅ No existing scenarios break

---

### 3.2 Task 2: Update forecast.js Visibility Logic (30 min)

**File**: [js/forecast.js](../js/forecast.js)

**Action 1**: Handle `showBudget` flag

**Location**: Around line 2231 (where `budgetSection.classList.remove('hidden')` is hardcoded)

**Current Code**:
```javascript
budgetSection.classList.remove('hidden');
```

**Change To**:
```javascript
if (typeConfig.showBudget !== false) {
  budgetSection.classList.remove('hidden');
} else {
  budgetSection.classList.add('hidden');
}
```

**Rationale**: Budget section should only hide if `showBudget` is explicitly false. Default is visible for backward compatibility.

---

### 3.3 Task 3: Create Summary Cards HTML Section (20 min)

**File**: [js/forecast.js](../js/forecast.js)

**Action**: Add new section to `buildGridContainer()` function

**Location**: Insert AFTER Scenarios section, BEFORE Accounts section

**Code Structure**:
```javascript
// Summary Cards section (NEW)
const summaryCardsSection = document.createElement('div');
summaryCardsSection.id = 'summaryCardsSection';
summaryCardsSection.className = 'bg-main bordered rounded shadow-lg mb-lg';

const summaryCardsHeader = document.createElement('div');
summaryCardsHeader.className = 'pointer flex-between accordion-header section-padding';
summaryCardsHeader.innerHTML = `<h2 class="text-main section-title">Summary</h2><span class="accordion-arrow">&#9662;</span>`;
summaryCardsHeader.addEventListener('click', () => window.toggleAccordion('summaryCardsContent'));
window.add(summaryCardsSection, summaryCardsHeader);

const summaryCardsContent = document.createElement('div');
summaryCardsContent.id = 'summaryCardsContent';
summaryCardsContent.className = 'accordion-content section-content';
window.add(summaryCardsSection, summaryCardsContent);

window.add(forecastEl, summaryCardsSection);
```

**Return Update**: Add `summaryCardsContent` to the returned object (for later reference)

**Success Criteria**:
- ✅ Section renders without errors
- ✅ Header toggles accordion
- ✅ Content area ready for cards

---

### 3.4 Task 4: Add Summary Cards Show/Hide Logic (15 min)

**File**: [js/forecast.js](../js/forecast.js)

**Location**: Around line 2230-2231 (where sections get visibility applied)

**Add**:
```javascript
const summaryCardsSection = getEl('summaryCardsSection');
if (typeConfig.showSummaryCards) {
  summaryCardsSection.classList.remove('hidden');
} else {
  summaryCardsSection.classList.add('hidden');
}
```

**Placement**: After budget section logic, before clearing downstream grids

**Success Criteria**:
- ✅ Summary Cards visible when `showSummaryCards: true`
- ✅ Hidden when `showSummaryCards: false` or undefined
- ✅ No console errors

---

### 3.5 Task 5: Create Summary Cards Rendering Function (45 min)

**File**: [js/forecast.js](../js/forecast.js)

**Function Name**: `loadDebtSummaryCards(container)`

**Location**: Add as new function (after projection-related functions, around line 1900)

**Responsibilities**:
1. Clear container
2. Extract accounts and their projections
3. Calculate per-account metrics
4. Render card grid
5. Handle edge cases (no accounts, no projections)

**Per-Account Card Calculations**:
```javascript
// For each account:
const currentBalance = account.balance;
const projectionRows = projections.filter(p => p.accountId === account.id);
const projectedEnd = projectionRows.length ? projectionRows[projectionRows.length - 1].balance : currentBalance;
const payoffDate = projectionRows.find(p => p.balance <= 0)?.date || null;
const interestPaid = projectionRows.reduce((sum, p) => sum + (p.interest || 0), 0);
```

**Overall Total Card Calculations**:
```javascript
const totalCurrent = accounts.reduce((sum, a) => sum + a.balance, 0);
const totalProjectedEnd = accounts.reduce((sum, a) => {
  const rows = projections.filter(p => p.accountId === a.id);
  return sum + (rows.length ? rows[rows.length - 1].balance : a.balance);
}, 0);
const totalInterest = projections.reduce((sum, p) => sum + (p.interest || 0), 0);
const accountCount = accounts.length;
```

**HTML Card Structure**:
```html
<div class="summary-cards-grid">
  <div class="summary-card">
    <div class="summary-card-title">Account Name</div>
    <div class="summary-card-row">
      <span class="label">Current:</span>
      <span class="value">$5,000</span>
    </div>
    <div class="summary-card-row">
      <span class="label">Projected End:</span>
      <span class="value">$0</span>
    </div>
    <div class="summary-card-row">
      <span class="label">Payoff Date:</span>
      <span class="value">March 2027</span>
    </div>
    <div class="summary-card-row">
      <span class="label">Interest Paid:</span>
      <span class="value">$750</span>
    </div>
  </div>
  <!-- Additional cards... -->
  <!-- Overall Total card (always last) -->
</div>
```

**Success Criteria**:
- ✅ Cards render with no errors
- ✅ Calculations are correct
- ✅ Handles no-data gracefully (empty message)
- ✅ Handles no-projections gracefully (shows current only)

---

### 3.6 Task 6: Hook Summary Cards to Refresh Logic (20 min)

**File**: [js/forecast.js](../js/forecast.js)

**Action**: Call `loadDebtSummaryCards()` after projection generation or data changes

**Locations**:
1. After `loadAccountsGrid()` completes (refresh when accounts change)
2. After `generateProjections()` is called (refresh when projections generated)
3. In any "reload scenario" function

**Code Pattern**:
```javascript
if (typeConfig.showSummaryCards) {
  await loadDebtSummaryCards(containers.summaryCardsContent);
}
```

**Success Criteria**:
- ✅ Cards update when accounts added
- ✅ Cards update when transactions added
- ✅ Cards update when projections regenerated
- ✅ No console errors
- ✅ No stale data

---

### 3.7 Task 7: Add Minimal CSS (30 min)

**File**: [styles/app.css](../styles/app.css)

**Add**:
```css
/* Summary Cards Grid */
.summary-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--spacing-md);
  padding: var(--spacing-md) 0;
}

.summary-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  box-shadow: var(--shadow-sm);
}

.summary-card-title {
  font-weight: 600;
  font-size: 1.1rem;
  margin-bottom: var(--spacing-sm);
  color: var(--color-text-primary);
  border-bottom: 2px solid var(--color-accent);
  padding-bottom: var(--spacing-xs);
}

.summary-card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-xs) 0;
  border-bottom: 1px solid var(--color-border-light);
}

.summary-card-row:last-child {
  border-bottom: none;
}

.summary-card-row .label {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.summary-card-row .value {
  font-weight: 500;
  color: var(--color-text-primary);
  text-align: right;
}

/* Overall Total Card - Visual Distinction */
.summary-card.overall-total {
  background: var(--color-accent-subtle);
  border: 2px solid var(--color-accent);
}

.summary-card.overall-total .summary-card-title {
  color: var(--color-accent);
}
```

**Alternative**: If CSS variables don't exist, use existing pattern from `app.css` (check existing button/card styles)

**Success Criteria**:
- ✅ Cards render in responsive grid
- ✅ Overall Total card visually distinguished
- ✅ Responsive on narrow screens
- ✅ Matches app theme

---

## 4.0 Integration Checklist

- [ ] **Task 1**: lookup-data.json updated with Debt Repayment type
- [ ] **Task 2**: forecast.js `showBudget` flag handling added
- [ ] **Task 3**: Summary Cards HTML section created
- [ ] **Task 4**: Summary Cards visibility logic added
- [ ] **Task 5**: `loadDebtSummaryCards()` function implemented
- [ ] **Task 6**: Summary Cards refresh hooks added
- [ ] **Task 7**: CSS styling added

---

## 5.0 Testing Strategy

### Phase 1: Configuration (5 min)
```
1. Create new scenario
2. Select "Debt Repayment" from dropdown
3. Verify: Dropdown shows type
4. Verify: Accounts section visible
5. Verify: Transactions section visible
6. Verify: Budget section HIDDEN
7. Verify: Projections section visible
8. Verify: Summary Cards section visible
```

### Phase 2: Basic Cards (10 min)
```
1. Add account: "Credit Card" - $5,000 @ 18% APR
2. Verify: Summary card appears
3. Verify: Current: $5,000
4. Verify: Projected End: $5,000 (no transactions yet)
5. Verify: Interest Paid: $0
```

### Phase 3: Transactions & Projections (15 min)
```
1. Add transaction: $250/month to Credit Card
2. Generate projections (Monthly)
3. Verify: Summary card updates
4. Verify: Projected End: $0 (or near zero)
5. Verify: Payoff Date: Calculated correctly
6. Verify: Interest Paid: Non-zero value
7. Verify: Overall Total card shows aggregate values
```

### Phase 4: Multi-Debt (10 min)
```
1. Add second account: "Student Loan" - $10,000 @ 5% APR
2. Add transaction: $100/month to Student Loan
3. Generate projections
4. Verify: 2 per-account cards + 1 overall card (3 total)
5. Verify: Overall Total sums correctly
```

### Phase 5: Adjustments (5 min)
```
1. Edit transaction: Change $250 to $300
2. Generate projections
3. Verify: Summary cards update instantly
4. Verify: Payoff date moves up
5. Verify: Interest paid decreases
```

---

## 6.0 File Dependencies

| File | Changes | Impact |
|------|---------|--------|
| [assets/lookup-data.json](../assets/lookup-data.json) | Add entry | Configuration only |
| [js/forecast.js](../js/forecast.js) | 5 edits | Core integration |
| [styles/app.css](../styles/app.css) | Add CSS | Styling only (optional) |

**No changes needed**:
- data-manager.js
- projection-engine.js
- managers/*.js
- Any modal files

---

## 7.0 Edge Cases to Handle

| Scenario | Handling |
|----------|----------|
| No accounts added yet | Show "No accounts" message in Summary Cards |
| No projections generated | Show current balances only |
| Accounts with $0 balance | Display correctly, no negative values |
| Multiple accounts same type | List each with individual card |
| Account already paid off (balance = $0) | Show Payoff Date as "Paid Off" |
| Negative interest (savings account) | Display correctly with sign |

---

## 8.0 Success Criteria (Final)

- [ ] Debt Repayment appears in scenario type dropdown
- [ ] Summary Cards section appears when type selected
- [ ] Budget section hides when type selected
- [ ] Actual Transactions section hides when type selected
- [ ] Per-account cards calculate and display correctly
- [ ] Overall Total card displays aggregate metrics
- [ ] Cards update on account changes
- [ ] Cards update on transaction changes
- [ ] Cards update on projection regeneration
- [ ] No console errors in any state
- [ ] Responsive layout on narrow screens
- [ ] All values formatted correctly (currency, dates)
- [ ] Works with 1+ accounts
- [ ] Works with no projections (shows current balances)
- [ ] UI matches existing app theme

---

## 9.0 Implementation Order

**Recommended sequence** (enables testing after each step):

1. **Task 1** → Verify dropdown updated
2. **Task 2** → Verify budget section behavior changes
3. **Task 3** → Verify section renders
4. **Task 4** → Verify section hides/shows
5. **Task 5** → Verify cards render (empty initially)
6. **Task 6** → Verify cards populate with data
7. **Task 7** → Verify styling looks good

**Est. Total Time**: 2–3 hours (including testing)

---

## 10.0 Future Enhancements (Out of Scope)

- Card animations/transitions
- Clickable cards to drill down to transactions
- Card icons/colors by account type
- Export summary to PDF
- Historical payoff date tracking
- What-if comparison UI

---

## 11.0 References

- [DEBT_REPAYMENT_FINAL_DESIGN.md](DEBT_REPAYMENT_FINAL_DESIGN.md) — Design spec
- [TECH_ARCHITECTURE.md](TECH_ARCHITECTURE.md) — Layer patterns
- [TECHNICAL_OVERVIEW.md](TECHNICAL_OVERVIEW.md) — Entry point

