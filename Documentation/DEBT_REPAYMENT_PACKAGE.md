# Debt Repayment Implementation - Complete Planning Package

**Version**: 1.0.0  
**Status**: READY FOR EXECUTION  
**Date**: February 2, 2026  

---

## Overview

This package contains the complete planning, architecture, and implementation details for adding the **Debt Repayment** scenario type to ftrack. The feature leverages the existing layered architecture and requires minimal code changes (~250 lines across 3 files).

**Key Numbers**:
- **Tasks**: 7 independent, sequential steps
- **Effort**: 2–3 hours total
- **Files Modified**: 3 (lookup-data.json, forecast.js, app.css)
- **Lines Added**: ~250 (mostly forecast.js function)
- **Breaking Changes**: 0
- **New Dependencies**: 0

---

## Documentation Map

### 1. [DEBT_REPAYMENT_FINAL_DESIGN.md](DEBT_REPAYMENT_FINAL_DESIGN.md)
**What**: The design spec that drove this implementation plan.

**Read if**:
- You want to understand the user-facing design
- You need to validate that implementation matches requirements
- You want to see the decision rationale (why Summary Cards, why hide Budget, etc.)

**Key Sections**:
- The Layout (visual hierarchy)
- What's Different from Budget Scenario (feature comparison)
- Configuration entry needed
- User Experience Flow
- Success Criteria

---

### 2. [DEBT_REPAYMENT_IMPLEMENTATION_PLAN.md](DEBT_REPAYMENT_IMPLEMENTATION_PLAN.md) ⭐ START HERE
**What**: Step-by-step implementation guide with code snippets.

**Read if**:
- You're about to implement the feature
- You need to understand what each task does and why
- You want code patterns and examples
- You're tracking progress

**Structure**:
- 7 labeled Tasks (15 min → 45 min each)
- Detailed requirements for each task
- Exact code patterns and locations
- Edge cases to handle
- Testing strategy (4 phases)
- Success criteria checklist

**Use as**: Your primary implementation guide.

---

### 3. [DEBT_REPAYMENT_QUICKREF.md](DEBT_REPAYMENT_QUICKREF.md)
**What**: One-page visual summary of the entire project.

**Read if**:
- You want a visual overview
- You need a quick reference while coding
- You want to see the data flow
- You're explaining the project to someone else

**Includes**:
- 7 Tasks flowchart
- Architecture Fit diagram
- What Gets Hidden table
- Key Code Pattern
- Summary Card Calculations
- Testing Flow
- Dependencies Check

**Use as**: Quick lookup during implementation.

---

### 4. [DEBT_REPAYMENT_ARCHITECTURE.md](DEBT_REPAYMENT_ARCHITECTURE.md)
**What**: How the new code fits into the existing architecture.

**Read if**:
- You're a reviewer checking architectural fit
- You want to understand data flow
- You're curious about design decisions
- You need to debug integration issues

**Includes**:
- Mermaid diagrams of implementation flow
- Data flow from scenario selection to card rendering
- Code modification summary
- Section visibility matrix
- Summary Card calculation engine
- List of unchanged components

**Use as**: Verification that implementation follows patterns.

---

## Quick Start Path

### For Implementers:
1. Read [DEBT_REPAYMENT_IMPLEMENTATION_PLAN.md](DEBT_REPAYMENT_IMPLEMENTATION_PLAN.md) Section 3.0 (Overview of 7 Tasks)
2. Skim [DEBT_REPAYMENT_QUICKREF.md](DEBT_REPAYMENT_QUICKREF.md) for visual understanding
3. Execute each task in order: Task 1 → Task 7
4. Reference exact code patterns from IMPLEMENTATION_PLAN.md
5. Use QUICKREF.md for quick lookups
6. Verify against FINAL_DESIGN.md success criteria

### For Reviewers:
1. Read [DEBT_REPAYMENT_FINAL_DESIGN.md](DEBT_REPAYMENT_FINAL_DESIGN.md) to understand design
2. Scan [DEBT_REPAYMENT_ARCHITECTURE.md](DEBT_REPAYMENT_ARCHITECTURE.md) for fit
3. Check [DEBT_REPAYMENT_IMPLEMENTATION_PLAN.md](DEBT_REPAYMENT_IMPLEMENTATION_PLAN.md) Section 8.0 (Success Criteria)
4. Verify no changes to: data-manager.js, projection-engine.js, managers/*

### For Designers:
1. Read [DEBT_REPAYMENT_FINAL_DESIGN.md](DEBT_REPAYMENT_FINAL_DESIGN.md) (the design you approved)
2. Reference [DEBT_REPAYMENT_QUICKREF.md](DEBT_REPAYMENT_QUICKREF.md) HTML Output Example
3. Review CSS section in [DEBT_REPAYMENT_IMPLEMENTATION_PLAN.md](DEBT_REPAYMENT_IMPLEMENTATION_PLAN.md) Task 7

---

## Key Design Decisions Recap

### Why This Approach?

| Decision | Why |
|----------|-----|
| **Configuration-driven** | Reuses existing visibility pattern |
| **No data schema changes** | Works with existing account/projection data |
| **Summary Cards component** | Generic design allows reuse in other scenarios (Budget, Funds) |
| **Hide Budget section** | Debt repayment users don't need budget tracking |
| **Hide Actual Transactions** | Debt repayment is about projections, not actuals |
| **Minimal JS changes** | ~50 lines of new code; rest is existing pattern reuse |

### What Makes This Minimal?

- ✅ Uses existing `getScenarioTypeConfig()` pattern
- ✅ Uses existing visibility conditional pattern
- ✅ Uses existing `generateProjections()` and `getProjections()`
- ✅ No new managers or data layers needed
- ✅ No SQL or database changes
- ✅ No npm dependencies added
- ✅ CSS is just styling, not behavior

---

## Integration Points

### Where the Code Plugs In

```
forecast.js (Main Controller)
├── buildGridContainer()          ← Task 3: Add summaryCardsSection HTML
├── getScenarioTypeConfig()       ← Existing (no changes)
├── loadScenario()                ← Calls visibility logic (Task 4)
├── Visibility Logic Block        ← Task 2 + Task 4: Handle new flags
└── loadDebtSummaryCards()        ← Task 5: NEW function
    ├── Reads currentScenario.accounts       (existing data)
    ├── Reads currentScenario.projections    (existing data)
    ├── Calculates metrics                    (Task 5 logic)
    └── Renders HTML to container            (Task 5 logic)

lookup-data.json
└── scenarioTypes array           ← Task 1: Add new entry

app.css
└── New classes                   ← Task 7: Add styling
    ├── .summary-cards-grid
    ├── .summary-card
    └── .overall-total
```

---

## Implementation Checkpoints

After completing each task, verify:

| Task | After Completion | Verify |
|------|------------------|--------|
| 1 | lookup-data.json updated | Debt Repayment appears in dropdown |
| 2 | Visibility logic updated | Budget section behavior changed |
| 3 | HTML section added | Section renders without errors |
| 4 | Show/hide logic added | Section hides/shows correctly |
| 5 | Function implemented | Cards render with empty state |
| 6 | Refresh hooks added | Cards update on data changes |
| 7 | CSS added | Cards styled and responsive |

---

## Success Criteria Checklist

Use this after implementation to verify all requirements met:

- [ ] Debt Repayment appears in scenario type dropdown
- [ ] Selecting type shows Summary Cards section
- [ ] Budget section hides for this type
- [ ] Actual Transactions section hides for this type
- [ ] Per-account cards display all metrics correctly
- [ ] Overall Total card displays aggregate correctly
- [ ] Cards update when accounts added
- [ ] Cards update when transactions added
- [ ] Cards update when projections regenerated
- [ ] No console errors in any state
- [ ] Responsive layout works on narrow screens
- [ ] All currency/date formatting correct
- [ ] Works with 1, 2, 3+ accounts
- [ ] Works when no projections generated
- [ ] Matches existing app styling/theme

---

## Testing Scenarios

### Scenario 1: Single Debt
```
1. Create "Debt Repayment" scenario
2. Add account: "Credit Card" - $5,000 @ 18% APR
3. Add transaction: $250/month to CC
4. Generate projections (monthly)
5. Verify: Card shows current ($5k), projected ($0), payoff date, interest
```

### Scenario 2: Multiple Debts
```
1. Previous scenario + add second account: "Loan" - $10k @ 5%
2. Add transaction: $100/month to Loan
3. Generate projections
4. Verify: 2 per-account cards + 1 overall card
5. Verify: Totals sum correctly
```

### Scenario 3: Adjustment
```
1. Previous scenario
2. Edit transaction: $250 → $300/month to CC
3. Generate projections again
4. Verify: Cards update instantly
5. Verify: Payoff date moves up, interest decreases
```

### Scenario 4: Edge Cases
```
1. No accounts added yet → Cards show "No accounts" message
2. Accounts added, no projections → Cards show current only
3. Account already paid off ($0) → Cards handle correctly
4. Delete account → Overall Total updates
5. Clear all projections → Cards show current only
```

---

## File Dependencies Summary

| File | Role | Changes |
|------|------|---------|
| [assets/lookup-data.json](../assets/lookup-data.json) | Configuration | +1 entry |
| [js/forecast.js](../js/forecast.js) | Core logic | +~150 lines |
| [styles/app.css](../styles/app.css) | Styling | +50 lines |

**No Changes Needed**:
- [js/data-manager.js](../js/data-manager.js)
- [js/projection-engine.js](../js/projection-engine.js)
- [js/managers/](../js/managers/)
- [js/modal-*.js](../js/)
- [userData/](../userData/)
- Data schema (app-data.json)

---

## Estimated Timeline

| Phase | Time | Tasks |
|-------|------|-------|
| Configuration | 15 min | Task 1 |
| Visibility Logic | 30 min | Task 2 |
| HTML Section | 20 min | Task 3 |
| Show/Hide Logic | 15 min | Task 4 |
| Render Function | 45 min | Task 5 |
| Refresh Hooks | 20 min | Task 6 |
| Styling | 30 min | Task 7 |
| Testing | 45 min | All phases |
| **Total** | **3–4 hours** | All |

---

## Questions? Start Here

| Question | Answer Location |
|----------|------------------|
| What does this feature do? | [DEBT_REPAYMENT_FINAL_DESIGN.md](DEBT_REPAYMENT_FINAL_DESIGN.md) |
| How do I implement it? | [DEBT_REPAYMENT_IMPLEMENTATION_PLAN.md](DEBT_REPAYMENT_IMPLEMENTATION_PLAN.md) |
| What's the code structure? | [DEBT_REPAYMENT_ARCHITECTURE.md](DEBT_REPAYMENT_ARCHITECTURE.md) |
| Show me a quick overview | [DEBT_REPAYMENT_QUICKREF.md](DEBT_REPAYMENT_QUICKREF.md) |
| What's the exact code? | Section 3.x in IMPLEMENTATION_PLAN.md |
| How do I test? | Section 5.0 in IMPLEMENTATION_PLAN.md |
| Did I miss anything? | Success Criteria in IMPLEMENTATION_PLAN.md |

---

## Related Documentation

- [TECHNICAL_OVERVIEW.md](TECHNICAL_OVERVIEW.md) - Architecture entry point
- [TECH_ARCHITECTURE.md](TECH_ARCHITECTURE.md) - Layered architecture pattern
- [TECH_DATA_MODEL.md](TECH_DATA_MODEL.md) - Schema and data relationships
- [TECH_UI_LAYER.md](TECH_UI_LAYER.md) - Tabulator and grid patterns

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Feb 2, 2026 | Initial complete planning package |

---

## Next Steps

1. ✅ Review this planning package
2. ⏭ Read [DEBT_REPAYMENT_IMPLEMENTATION_PLAN.md](DEBT_REPAYMENT_IMPLEMENTATION_PLAN.md)
3. ⏭ Begin Task 1: Configuration
4. ⏭ Complete all 7 tasks in order
5. ⏭ Run testing scenarios
6. ⏭ Verify success criteria

**Ready to start? Begin with [DEBT_REPAYMENT_IMPLEMENTATION_PLAN.md](DEBT_REPAYMENT_IMPLEMENTATION_PLAN.md) Section 3.0.**

