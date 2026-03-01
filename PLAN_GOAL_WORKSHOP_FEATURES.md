# Goal Workshop First — Implementation Plan

**Rename**: Already complete  
**Effort**: ~11.5 hours across 6 phases  
**Pattern**: Extend existing constraint/goal cards with conditional fields  
**Files**: [forecast-generate-plan.js](js/ui/components/forecast/forecast-generate-plan.js) (1536 lines), [advanced-goal-solver.js](js/domain/utils/advanced-goal-solver.js) (753 lines)

---

## Phase 2: Existing Transaction Constraints (90 min)

**Goal**: Treat existing user transactions as immutable constraints.

### Data Model
```javascript
// New constraint row type (stored alongside fundingAccount, maxOutflow, etc.):
{
  type: 'existingTransactions',
  startDate: string | null,           // defaults to planning window
  endDate: string | null,
  mode: 'all' | 'include' | 'exclude',
  transactionIds: number[]            // for include/exclude modes
}
```

### Implementation
1. **UI**: Extend existing constraint card
   - Add to `buildConstraintTypeOptions()`: `{ value: 'existingTransactions', label: 'Existing transactions' }`
   - In `buildConstraintCard()`, show conditional fields when `type === 'existingTransactions'`:
     - Date range inputs (startDate, endDate)
     - Mode dropdown: "All" / "Include only" / "Exclude"
     - Transaction multi-select (visible when mode !== 'all')
   
2. **Solver**:
   - Extend `buildConstraintsObjectFromRows()` to parse existingTransactions constraint
   - New function: `buildExistingTransactionConstraints({ scenario, constraint, planningWindow })` 
     - Filters transactions by date range, mode, and IDs
     - Groups by account + month, calculates net flow
     - Returns LP constraint coefficients
   - In `solveWithLp()`, add fixed constraints from existing transactions
   
3. **Validation**: Suggested txs must have different tags (e.g., 'adv-goal-generated')

---

## Phase 3: New Goal Types (2 hours)

**Goal**: Support minimize_payment, minimize_end_date, use_account_goal.

### New Types

| Type | Input | Solver Finds |
|------|-------|--------------|
| `minimize_payment` | targetAmount + endDate | minimum monthly payment |
| `minimize_end_date` | targetAmount + fixedPayment | earliest feasible date |
| `use_account_goal` | accountId | reads account.goalAmount + goalDate |

### Data Model
```javascript
{
  type: 'minimize_payment' | 'minimize_end_date' | 'use_account_goal',
  targetAmount: number,
  fixedPayment: number | null,          // for minimize_end_date
  maxEndDate: string | null             // for minimize_end_date (search cutoff)
}
```

### Implementation
1. **UI**:
   - Add types to `buildGoalTypeOptions()`
   - In `buildGoalCard()`, extend conditional field logic:
     - `minimize_end_date`: show fixedPayment, maxEndDate
     - `use_account_goal`: show accountId (read-only target/date from account)
   
2. **Solver**:
   - Extend `normalizeGoal()` with new fields
   - New function: `resolveAccountGoal(goal, account)` reads account's goalAmount/goalDate
   - New function: `findMinimumEndDateBinarySearch({ goal, fixedPayment, constraints, lp })` 
     - Binary search on endDate; test LP feasibility at each iteration
     - Returns earliest feasible endDate
   - Update `buildGoalRequirements()` to handle new types

---

## Phase 4: Final Payment Support (1.5 hours)

**Goal**: Generate "recurring + smaller final" payment solutions.

### Data Model
```javascript
// In suggested transaction (not persisted):
{
  recurrence: Recurrence,
  finalPayment: {
    amount: number,
    date: string
  } | null
}
```

### Implementation
1. **Solver**:
   - New function: `calculateFinalPayment({ totalRequired, recurringAmount, months })`
   - In `buildSuggestedTransactions()`, calculate and attach finalPayment
   - Update description: "Plus $X on [date]"
   
2. **Validation**:
   - In `evaluateGoals()`, expand finalPayment when generating projections
   - Verify: total = (recurring × months) + final
   
3. **UI**: In solution display, show final payment below recurring line

---

## Phase 5: Account Filters (60 min)

**Goal**: Filter which accounts participate in solver.

### Data Model
```javascript
// New constraint row type:
{
  type: 'ignoredAccounts',
  accountIds: number[]
}
```

### Implementation
1. **UI**: Add to constraint types; show account multi-select
2. **Solver**: Filter goals for ignored account IDs in `solveAdvancedGoals()`

---

## Phase 6: Impact Highlighting (2 hours)

**Goal**: Show which ignored/excluded items affect solution.

### Data Model
```javascript
// In suggested transaction:
{
  affectedByIgnored: boolean,
  ignoredItemsInvolved: { accountIds: number[], transactionIds: number[] } | null
}
```

### Implementation
1. **Solver**:
   - New function: `detectIgnoredItemsImpact({ scenario, settings, originalSolution })`
   - Re-solve with ignored items included; compare solutions
   - Populate metadata if solutions differ
   
2. **UI**: Highlight affected txs with badge; show callout

---

## Phase 7: Transaction Preview (1.5 hours)

**Goal**: Display expanded recurrence before saving.

### Implementation
1. **New function**: `expandTransactionForDisplay(tx)` 
   - Formats: "From [A] to [B], $X recurring [pattern], plus $Y on [date]"
   - Shows first 3 occurrences + "and N more"
   
2. **UI**: Render preview cards in solution section; add "Expand all" toggle

---

## Code Patterns

### Constraint Card Conditional Fields
```javascript
const updateConstraintFieldVisibility = () => {
  const t = typeSelect.value;
  dateFields.style.display = t === 'existingTransactions' ? '' : 'none';
  modeSelect.style.display = t === 'existingTransactions' ? '' : 'none';
  txSelect.style.display = t === 'existingTransactions' && mode !== 'all' ? '' : 'none';
  accountSelect.style.display = t === 'ignoredAccounts' ? '' : 'none';
};
```

### Goal Card Conditional Fields (line 820)
```javascript
const updateGAmountVisibility = () => {
  const t = typeSelect.value;
  fixedPaymentField.style.display = t === 'minimize_end_date' ? '' : 'none';
  maxEndDateField.style.display = t === 'minimize_end_date' ? '' : 'none';
};
```

### Normalization (line 151)
Extend `normalizeGoal()` and `normalizeConstraintRow()` with new fields.

### Binary Search Pattern
```javascript
async function findMinimumEndDateBinarySearch({ goal, fixedPayment, lp, constraints }) {
  let minDate = goal.startDate;
  let maxDate = goal.maxEndDate || addYears(minDate, 5);
  let bestDate = null;
  
  for (let i = 0; i < 20; i++) {
    const midDate = dateBetween(minDate, maxDate);
    const testGoal = { ...goal, endDate: midDate };
    const { result } = solveWithLp({ lp, requirements: [testGoal], constraints });
    
    if (result?.feasible) {
      bestDate = midDate;
      maxDate = midDate;
    } else {
      minDate = midDate;
    }
  }
  return bestDate;
}
```

---

## Effort

| Phase | Est. |
|-------|------|
| 2: Existing TX constraints | 90 min |
| 3: New goal types | 120 min |
| 4: Final payments | 90 min |
| 5: Account filters | 60 min |
| 6: Impact highlighting | 120 min |
| 7: Transaction preview | 90 min |
| QC + Docs | 120 min |
| **Total** | **11.5 hours** |

---

## Testing

- [ ] Existing txs correctly constrain LP model
- [ ] minimize_end_date finds earliest date
- [ ] Final payment calculation correct
- [ ] Ignored accounts don't affect goals
- [ ] Impact detection identifies differences
- [ ] Preview expands all occurrences
- [ ] Existing QC tests pass
