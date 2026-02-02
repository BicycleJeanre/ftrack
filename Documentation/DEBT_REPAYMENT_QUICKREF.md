# Debt Repayment Implementation - Quick Reference

## 7 Tasks, ~2-3 Hours Total

```
┌─────────────────────────────────────────────────────────────┐
│  TASK 1: Configuration (15 min)                             │
│  File: assets/lookup-data.json                              │
│  Action: Add new scenario type entry (id: 4)                │
│  - showSummaryCards: true                                   │
│  - showBudget: false                                        │
│  - showActualTransactions: false                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  TASK 2: Visibility Logic (30 min)                          │
│  File: js/forecast.js (line ~2231)                          │
│  Action: Change budgetSection.classList.remove('hidden')    │
│  To: Conditional based on typeConfig.showBudget             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  TASK 3: HTML Section (20 min)                              │
│  File: js/forecast.js (buildGridContainer)                  │
│  Action: Add new summaryCardsSection element                │
│  - Insert after Scenarios section                           │
│  - Add accordion header + content divs                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  TASK 4: Show/Hide Logic (15 min)                           │
│  File: js/forecast.js (line ~2230)                          │
│  Action: Add conditional visibility for summaryCardsSection │
│  - Show if typeConfig.showSummaryCards                      │
│  - Hide otherwise                                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  TASK 5: Cards Renderer (45 min)                            │
│  File: js/forecast.js (new function)                        │
│  Action: Create loadDebtSummaryCards(container)             │
│  Calculations:                                              │
│  - Per-account: Current, Projected End, Interest, Payoff    │
│  - Overall Total: Sum of all metrics + Account Count        │
│  HTML: Card grid with rows for each metric                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  TASK 6: Refresh Hooks (20 min)                             │
│  File: js/forecast.js (multiple locations)                  │
│  Action: Call loadDebtSummaryCards() after:                 │
│  - loadAccountsGrid() completes                             │
│  - generateProjections() called                             │
│  - Scenario reload                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  TASK 7: Styling (30 min)                                   │
│  File: styles/app.css                                       │
│  Action: Add CSS for summary-cards-grid & cards             │
│  - Responsive grid layout                                   │
│  - Card styling (border, padding, etc.)                     │
│  - Overall Total card distinction                           │
└─────────────────────────────────────────────────────────────┘
```

## Architecture Fit

```
Existing Layered Pattern:

UI Layer (forecast.js)
  ↓
  Calls: getScenarioTypeConfig() [existing pattern]
  ↓
  Uses: typeConfig.showBudget, showSummaryCards, etc.
  ↓
  Calls: loadDebtSummaryCards() [NEW]
  ↓
Manager Layer
  ↓ (no changes needed)
  Uses: getProjections(), getAccounts() [existing]
  ↓
Data Layer (data-manager.js)
  ↓ (no changes needed)
  Reads: currentScenario.projections, accounts
```

## What Gets Hidden

For Debt Repayment scenario type:

```
SHOWN:
✅ Scenarios dropdown
✅ Summary Cards (NEW)
✅ Accounts grid
✅ Transactions grid (Planned only)
✅ Projections grid

HIDDEN:
❌ Budget section
❌ Actual Transactions section
```

## Key Code Pattern (Existing)

How visibility works now (line ~2229 in forecast.js):

```javascript
const typeConfig = getScenarioTypeConfig();
if (typeConfig.showAccounts) accountsSection.classList.remove('hidden');
if (typeConfig.showProjections) projectionsSection.classList.remove('hidden');
```

**New line to add**:
```javascript
if (typeConfig.showSummaryCards) summaryCardsSection.classList.remove('hidden');
```

## Summary Card Calculations

For each account:
```javascript
currentBalance = account.balance
projectedEnd = lastProjectionRow.balance (or currentBalance if no projections)
payoffDate = firstProjectionRow where balance ≤ 0 (or null if never pays off)
interestPaid = sum of all projection interest for this account
```

For overall total:
```javascript
totalCurrent = sum of all account.balance
totalProjectedEnd = sum of each account's lastProjectionRow.balance
totalInterest = sum of all projection interest across all accounts
accountCount = number of accounts
```

## HTML Output Example

```html
<div class="summary-cards-grid">
  <!-- Per-account card -->
  <div class="summary-card">
    <div class="summary-card-title">Visa CC</div>
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
      <span class="value">Mar 2027</span>
    </div>
    <div class="summary-card-row">
      <span class="label">Interest Paid:</span>
      <span class="value">$750</span>
    </div>
  </div>
  
  <!-- Overall Total card (always last) -->
  <div class="summary-card overall-total">
    <div class="summary-card-title">OVERALL TOTAL</div>
    <div class="summary-card-row">
      <span class="label">Current:</span>
      <span class="value">$15,000</span>
    </div>
    <!-- ... other rows ... -->
    <div class="summary-card-row">
      <span class="label">Accounts:</span>
      <span class="value">2</span>
    </div>
  </div>
</div>
```

## Testing Flow

```
1. Create scenario → Select "Debt Repayment" type
   ✓ Verify dropdown has new option
   ✓ Verify Budget section hidden
   
2. Add account → "CC" $5,000 @ 18%
   ✓ Verify Summary Card appears
   ✓ Current = $5,000
   
3. Add transaction → $250/month to CC
   ✓ Verify transaction added
   
4. Generate projections
   ✓ Verify Summary Card updates
   ✓ Projected End, Payoff Date, Interest all calculated
   
5. Add second account → "Loan" $10,000 @ 5%
   ✓ Verify 2nd card appears
   ✓ Verify Overall Total card appears
   ✓ Verify totals are correct
   
6. Edit transaction → $300/month
   ✓ Regenerate projections
   ✓ Verify cards update with new values
```

## Dependencies Check

✅ No new npm packages needed
✅ No data schema changes required
✅ No new managers needed
✅ Uses existing: getProjections(), getAccounts(), generateProjections()
✅ Follows existing patterns: Section visibility, accordion handling, currency formatting

## Files to Modify (Summary)

| File | Lines | Changes |
|------|-------|---------|
| lookup-data.json | +20 | Add 1 JSON entry |
| forecast.js | ~5 places | Add section + show/hide logic + function + hooks |
| app.css | +50 | Add card styles |

