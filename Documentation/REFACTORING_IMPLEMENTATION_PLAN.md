# FTrack Refactoring Implementation Plan

**Version**: 1.0.0  
**Date**: January 11, 2026  
**Branch**: refactor/simplify-architecture  
**Status**: POC Validated ✅

---

## Implementation Steps

### Phase 1: Library Integration (Steps 1-3)

1. **Install remaining libraries**
   - Add financejs for calculations
   - Verify Tabulator installation working

2. **Create utility wrappers**
   - Tabulator grid factory helper
   - Financial calculation wrapper

3. **Test libraries in isolation**
   - Verify Tabulator features work
   - Test financial calculations

### Phase 2: Data Layer Refactor (Steps 4-6)

4. **Create data-store.js**
   - Generic CRUD functions (read, write, query)
   - Replace readAppData/writeAppData

5. **Create scenario-manager.js**
   - Move scenario business logic from data-manager
   - Centralize scenario operations

6. **Create account-manager.js & transaction-manager.js**
   - Extract account/transaction logic
   - Single location for business rules

### Phase 3: Grid Migration (Steps 7-12)

7. **Migrate Accounts grid**
   - Replace accounts.js with Tabulator version
   - Wire up to new managers
   - Test all functionality

8. **Migrate Scenarios grid**
   - Convert forecast scenario selector
   - Use Tabulator for scenario list

9. **Migrate Planned Transactions grid**
   - Convert to Tabulator
   - Add modal support for recurrence

10. **Migrate Actual Transactions grid**
    - Convert to Tabulator
    - Period filtering

11. **Migrate Projections grid**
    - Read-only Tabulator grid
    - Formatted projections display

12. **Remove editable-grid.js**
    - Verify all grids migrated
    - Delete old implementation

### Phase 4: Page Simplification (Steps 13-15)

13. **Refactor forecast.js**
    - Reduce to initialization only
    - Remove redundant code
    - Use grid factory

14. **Refactor accounts.js & transactions.js**
    - Simplify to grid setup
    - Remove duplicate patterns

15. **Clean up imports**
    - Remove unused modules
    - Update references

### Phase 5: Calculations & Features (Steps 16-18)

16. **Integrate financejs**
    - Replace compound interest calculations
    - Update projection-engine.js

17. **Add modal support**
    - Tabulator popup editors for complex fields
    - Recurrence modal
    - Periodic change modal

18. **Implement keyboard shortcuts**
    - Use Tabulator's built-in keybindings
    - Add custom shortcuts where needed

### Phase 6: Testing & Cleanup (Steps 19-20)

19. **Comprehensive testing**
    - Test all user features
    - Verify data persistence
    - Check cross-platform compatibility

20. **Remove obsolete files**
    - Delete unused helpers
    - Clean up config.js
    - Remove modal.js if unused

---

## Success Metrics

- ✅ All current features working
- ✅ ~2,500 fewer lines of code
- ✅ No breaking changes to data format
- ✅ Improved performance
- ✅ Easier to maintain

## Rollback Plan

- Keep dev branch for old implementation
- Can cherry-pick bug fixes if needed
- Full git history preserved

## Estimated Effort

- **Phase 1**: 2 hours
- **Phase 2**: 4 hours
- **Phase 3**: 8 hours
- **Phase 4**: 3 hours
- **Phase 5**: 5 hours
- **Phase 6**: 3 hours
- **Total**: ~25 hours

---

**Next Step**: Begin Phase 1, Step 1 - Install financejs

**Applied Rules**: 1.0, 1.1, 5.5, 6.1
