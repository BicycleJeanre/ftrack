# Universal Grid Refactor: AI Execution Plan

## Objective
Enhance the universal EditableGrid component to support dynamic actions, improved UI/UX, and external code/modal integration, while maintaining existing design patterns and modularity.

---

## AI Prompting Guidelines
- **Be explicit:** Clearly specify the intent, expected outcome, and constraints for each step.
- **Be atomic:** Each instruction should be a single, self-contained task.
- **Be contextual:** Reference relevant files, modules, and design patterns.
- **Be state-aware:** Always check the current state of the codebase before making changes.
- **Be modular:** Prefer isolated, testable changes that do not break existing functionality.
- **Be incremental:** Require a commit and documentation update after each atomic change.
- **Be self-validating:** After each step, verify that the change is complete and does not introduce regressions.
- **Be consistent:** Use the project's established naming, formatting, and documentation conventions.

---

## High-Level Steps
1. **Branching**
    - Create a new feature branch: `feature/universal-grid-actions`
2. **Iterative Implementation**
    - For each item below, complete the code change, commit, and update documentation before moving to the next.
3. **Documentation**
    - Update or create relevant documentation files after each change (including `editable-grid.md`, affected module docs, and `PROJECT_OVERVIEW.md` if data flow or navigation changes).

---

## Optimized Step-by-Step Plan (AI-Ready)

### 1. Dynamic Action Support (Foundation for All Other Steps)
**Intent:** Refactor `EditableGrid` to accept an `actions` config object/array, allowing dynamic enabling/disabling of add, edit, delete, and custom actions per grid instance.
- **Files:** `js/editable-grid.js`, all grid consumers, `documentation/editable-grid.md`
- **Constraints:** Maintain backward compatibility. Do not remove existing features unless required.
- **Validation:** All grid instances must work with the new config. No regressions in existing grid usage.
- **Documentation:** Update usage examples and API reference in `editable-grid.md`.

### 2. External Code/Modal Triggers (Core API for Modals/Icons)
**Intent:** Add support for per-column and per-cell callbacks in the grid config, so grid content can trigger external code (e.g., open a modal).
- **Files:** `js/editable-grid.js`, all grid consumers, `documentation/editable-grid.md`
- **Constraints:** Callbacks must be optional and not break existing columns. Must support both cell and icon triggers.
- **Validation:** Demonstrate with a test column that triggers a dummy modal or function.
- **Documentation:** Add callback usage to `editable-grid.md`.

### 3. Modal Display Icon and Callback (Generalized Modal/Icon System)
**Intent:** Allow columns to specify an optional modal display icon and callback.
- **Files:** `js/editable-grid.js`, all grid consumers, `documentation/editable-grid.md`, relevant modal docs
- **Constraints:** Icon and callback must be fully configurable per column. Must not interfere with normal cell editing.
- **Validation:** Demonstrate for recurrence, amount change, and interest columns.
- **Documentation:** Add icon/callback config to `editable-grid.md` and update modal docs.

### 4. Add Icon Placement (UI/UX Enhancement)
**Intent:** Move the "Add" (quick add) button to appear as an icon centered below the grid, using the new dynamic actions system.
- **Files:** `js/editable-grid.js`, relevant CSS, all grid consumers, `documentation/editable-grid.md`
- **Constraints:** Icon must be accessible and keyboard-navigable. Style must match existing icons.
- **Validation:** Confirm icon placement and accessibility in all grid contexts.
- **Documentation:** Update grid usage and UI screenshots in `editable-grid.md`.

### 5. Text Input Sizing (UI/UX Enhancement)
**Intent:** Ensure all text input boxes in the grid scale to fit their cell and do not overflow.
- **Files:** `styles/app.css`, `js/editable-grid.js`, `documentation/editable-grid.md`
- **Constraints:** Inputs must be responsive and not break layout. No horizontal scrollbars.
- **Validation:** Test with long values and various grid sizes.
- **Documentation:** Add CSS guidelines and before/after screenshots to `editable-grid.md`.

### 6. Double-Click Row Editing (General Editing UX)
**Intent:** Implement double-click on any row to enter edit mode for the cell under the cursor, using the new dynamic actions and callback system.
- **Files:** `js/editable-grid.js`, `documentation/editable-grid.md`
- **Constraints:** Must work for all editable cell types. Must not interfere with single-click actions.
- **Validation:** Test double-click editing in all grid contexts.
- **Documentation:** Add double-click editing instructions to `editable-grid.md`.

### 7. Double-Click Interest Modal (Specialized Modal Trigger)
**Intent:** Implement double-click on the interest cell to open the interest modal directly, using the modal display icon/callback system.
- **Files:** `js/editable-grid.js`, `js/accounts.js`, `documentation/editable-grid.md`, `documentation/accounts.md`
- **Constraints:** Must be configurable via the grid's column definition. Must not break other modal triggers.
- **Validation:** Test with interest modal and other modal columns.
- **Documentation:** Add interest modal double-click usage to both `editable-grid.md` and `accounts.md`.

---

## Rationale for Order
- Steps 1–3 establish a flexible, extensible API for all grid actions and modal triggers, minimizing code churn and avoiding double-editing the same logic.
- Steps 4–5 are UI/UX improvements that depend on the new dynamic actions and callback system.
- Steps 6–7 are advanced interaction features that leverage the new API and UI enhancements, ensuring no redundant code changes.

---

## Commit & Documentation Checklist (per item)
- [ ] Code change implemented and tested
- [ ] All affected files updated
- [ ] Documentation updated or created
- [ ] Commit with clear message (list files and what changed)
- [ ] Validation steps completed and results noted

---

## Example Commit Message
```
git checkout -b feature/universal-grid-actions
# ...make changes for item 1...
git add .
git commit -m "feat: Add dynamic action support to EditableGrid\n\nChanged files:\n- js/editable-grid.js: Refactored to support dynamic actions\n- js/accounts.js, js/transactions.js: Updated grid usage\n- documentation/editable-grid.md: Documented new config options\n\nValidation: All grid instances tested and working as expected."
```

---

## Final Note
This AI-ready plan ensures each step is atomic, explicit, and validated, resulting in a robust, modular, and well-documented universal grid system.
