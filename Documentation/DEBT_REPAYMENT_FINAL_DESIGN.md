# Debt Repayment - Final Design Summary

**Version**: 1.0.0  
**Last Updated**: February 2, 2026  
**Status**: REFINED & READY FOR IMPLEMENTATION  
**Complexity**: Medium (includes new Summary Cards component)  
**Effort**: 3–5 hours

---

<!-- DESIGN CHANGE HISTORY (Keep only last 3 changes) -->
<!-- 
v1.0.0 - February 2, 2026
- Initial design with generic, reusable Summary Cards component
- Per-account cards + overall total card layout
- Removes Budget grid, keeps Accounts + Transactions + Projections
-->

---

## Design Decision

✅ **Chosen: Accounts + Transactions + Projections + NEW Summary Cards**

Why this is better than original:
- ❌ Original was too similar to Budget scenario
- ✅ New design is optimized for debt payoff use case
- ✅ Removes confusing elements (Budget section, Actual Transactions)
- ✅ Front-loads important information (Summary Cards)
- ✅ Cleaner mental model for users

---

## The Layout (Final)

```
Scenarios
    ↓
Summary Cards (NEW - Generic, Reusable)
  ├─ [Visa CC] Current: $5,000 | End: $0 | Interest: $750
  ├─ [Student Loan] Current: $10,000 | End: $0 | Interest: $1,700
  └─ [TOTAL] Current: $15,000 | End: $0 | Interest: $2,450
    ↓
Accounts (Debts)
  ├─ Visa CC: $5,000 @ 18% APR
  └─ Loan: $10,000 @ 5% APR
    ↓
Transactions (Payment Strategy)
  ├─ $250/month → Visa CC
  └─ $100/month → Loan
    ↓
Projections (Payoff Schedule)
  ├─ Month 1: Visa $4,875 (interest $75, payment $200)
  ├─ Month 2: Visa $4,748 (interest $73, payment $200)
  └─ ... continues until payoff
```

---

## What's Different from Budget Scenario

| Aspect | Budget | Debt Repayment |
|--------|--------|---|
| **Summary Cards** | ❌ No (but could add!) | ✅ Yes (per-account + overall) |
| **Accounts Section** | ✅ Yes | ✅ Yes (same) |
| **Transactions Section** | ✅ Yes | ✅ Yes (same) |
| **Actual Transactions** | ✅ Yes | ❌ No (hidden) |
| **Budget Section** | ✅ Yes | ❌ No (hidden) |
| **Projections** | ✅ Yes | ✅ Yes (same) |
| **Total Sections** | 6 | 5 |

**Note**: Summary Cards is a generic, reusable component that could be added to Budget, Funds, or General scenarios in the future.

---

## Configuration

**File**: `assets/lookup-data.json`

Add this single entry:

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

---

## Implementation Components

### 1. Configuration (30 minutes)
- ✅ Add entry to lookup-data.json
- ✅ Add new `showSummaryCards` flag

### 2. Summary Cards Component (2–3 hours) - NEW
- Generic and reusable design (works for any scenario type)
- One card per account showing: Current, Projected End, Interest, Payoff Date
- One overall summary card showing: Total Current, Total Projected End, Total Interest, Account Count
- Dynamic layout based on number of accounts
- Responsive grid design

### 3. forecast.js Changes (1–2 hours)
- Add `loadDebtSummaryCards()` function
- Add Summary Cards section to HTML
- Hook up visibility logic based on typeConfig
- Update calls to refresh summary cards when needed

### 4. Optional Styling (30 minutes)
- CSS grid for 4 cards
- Responsive design
- Match existing app theme

---

## What the Summary Cards Show

**Design Philosophy**: Generic and reusable across scenario types. Shows one card per account + one overall total card.

---

### Per-Account Cards (Dynamic)

One card for each account in the scenario. Example with 2 debts:

#### Card 1: Visa CC
```
┌──────────────────────────────────┐
│           Visa CC                │
│   Current: $5,000                │
│   Projected End: $0              │
│   Payoff: March 2027             │
│   Interest Paid: $750            │
└──────────────────────────────────┘
```

#### Card 2: Student Loan
```
┌──────────────────────────────────┐
│        Student Loan              │
│   Current: $10,000               │
│   Projected End: $0              │
│   Payoff: June 2027              │
│   Interest Paid: $1,700          │
└──────────────────────────────────┘
```

**Calculation per card:**
- **Current Balance**: From accounts grid
- **Projected End Balance**: Last projection row for this account
- **Payoff Date**: First month where balance ≤ 0 (if applicable)
- **Interest Paid**: Sum of interest across all projection periods (if applicable)

---

### Overall Summary Card (Always Last)

#### Card 3: Overall Total
```
┌──────────────────────────────────┐
│        OVERALL TOTAL             │
│   Current: $15,000               │
│   Projected End: $0              │
│   Total Interest: $2,450         │
│   Accounts: 2                    │
└──────────────────────────────────┘
```

**Calculation:**
- **Current Total**: Sum of all account current balances
- **Projected End Total**: Sum of all account projected end balances
- **Total Interest**: Sum of all interest paid across all accounts
- **Account Count**: Number of accounts in scenario

---

## User Experience Flow

### Step 1: Create Scenario
```
Select "Debt Repayment" from dropdown
→ Summary Cards appear (empty/0 values initially)
```

### Step 2: Add Debts
```
Click "+ Add New" in Accounts
  Visa CC: $5,000 @ 18% APR
  Loan: $10,000 @ 5% APR
→ Summary Cards update: Total Debt = $15,000
```

### Step 3: Define Payment Strategy
```
Click "+ Add New Transaction"
  $250/month → Visa CC
  $100/month → Loan
→ Summary Cards update: Monthly Payment = $350
```

### Step 4: Generate Projections
```
Click "Generate Projections"
→ System calculates month-by-month interest and payments
→ Summary Cards update with:
  - Payoff Date: March 15, 2027
  - Total Interest: $2,450
```

### Step 5: Adjust & Compare
```
Edit transaction: Change $250 to $300
Click "Generate Projections" again
→ Summary Cards update instantly:
  - Payoff Date: March 1, 2027 (2 weeks sooner)
  - Total Interest: $2,380 (saves $70)
  - Monthly Payment: $400
```

---

## Why This Design Is Better

| Criteria | Original Design | Refined Design |
|----------|---|---|
| **Clarity** | Confusing (looks like Budget) | Clear (debt-specific) |
| **User Focus** | Scattered across 5 sections | Centered on outcomes |
| **Cognitive Load** | High (Budget section confusing) | Low (only relevant sections) |
| **Implementation** | Configuration-only (too simple?) | Configuration + new component |
| **Visual Hierarchy** | Flat | Summary cards draw attention |
| **Customization** | Generic | Optimized for debt |

---

## Implementation Priority

### Must-Have (MVP)
1. ✅ Configuration in lookup-data.json
2. ✅ Hide Budget section
3. ✅ Hide Actual Transactions section
4. ✅ Summary cards (basic version with calculated values)

### Nice-to-Have
- Responsive styling for cards
- Card animations/transitions
- Clickable cards to drill down
- Card icons/colors

---

## Testing Strategy

### Phase 1: Basic (10 minutes)
1. Debt Repayment type appears in dropdown
2. Summary cards visible
3. All sections visible/hidden correctly

### Phase 2: Functional (30 minutes)
1. Add account → Total Debt updates
2. Add transaction → Monthly Payment updates
3. Generate projections → Payoff Date & Interest updates

### Phase 3: Edge Cases (20 minutes)
1. Multiple debts
2. Early payoff
3. Zero payment
4. Adjust and re-project

### Phase 4: UX (10 minutes)
1. Cards responsive on narrow screens
2. Cards update smoothly (no lag)
3. Values formatted correctly (currency, dates)

---

## Success Criteria (Final)

- [ ] Summary cards component built and functional
- [ ] 4 cards display: Total Debt, Payoff Date, Monthly Payment, Total Interest
- [ ] Cards calculate correct values
- [ ] Cards update on account changes
- [ ] Cards update on transaction changes
- [ ] Cards update on projection regeneration
- [ ] Budget section completely hidden
- [ ] Actual Transactions section completely hidden
- [ ] Accounts grid works
- [ ] Transactions grid works
- [ ] Projections grid works
- [ ] No console errors
- [ ] Responsive layout

---

## Files to Modify

1. **assets/lookup-data.json** (30 min)
   - Add Debt Repayment entry

2. **js/forecast.js** (2–3 hours)
   - Add `loadDebtSummaryCards()` function
   - Add Summary Cards HTML section
   - Add visibility logic
   - Hook up refresh logic

3. **styles/app.css** (30 min) - Optional
   - Add CSS for summary cards grid
   - Responsive styles

---

## Estimated Timeline

- **Phase 1 (Config)**: 30 minutes
- **Phase 2 (Summary Cards)**: 1.5–2 hours
- **Phase 3 (forecast.js)**: 1–1.5 hours
- **Phase 4 (Styling)**: 0–30 minutes
- **Phase 5 (Testing)**: 1 hour
- **Total**: 3–5 hours

---

## Next Steps

1. ✅ Finalize design (you chose Option B + Summary Cards)
2. ⏭ Implement configuration
3. ⏭ Build Summary Cards component
4. ⏭ Integrate with forecast.js
5. ⏭ Test all scenarios
6. ⏭ Deploy

Ready to proceed? All documentation updated in:
- [DEBT_REPAYMENT_COMPLETE_GUIDE.md](DEBT_REPAYMENT_COMPLETE_GUIDE.md) — Full spec
- [DEBT_REPAYMENT_REFINED_DESIGN.md](DEBT_REPAYMENT_REFINED_DESIGN.md) — Implementation tasks

