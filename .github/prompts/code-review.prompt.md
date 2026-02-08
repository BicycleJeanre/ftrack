# Code Review Prompt

## 1.0 Purpose
Review code changes for consistency with existing patterns and architecture.

**Definition of Done**:
- Identifies pattern violations and risky changes.
- Recommends minimal, consistent fixes.

---

## 2.0 Inputs
Provide:
- Branch name
- The scope to review (all changes, or specific files)

If inputs are missing:
- Review current uncommitted changes and latest commits on the branch.

---

## 3.0 Steps
3.1 Understand the intent
- Summarize what the change is trying to do.

3.2 Verify reuse-first
- Check whether similar logic already exists.
- Prefer reusing or extending existing utilities/managers over new parallel logic.

3.3 Validate architecture
- UI code should delegate business logic to managers.
- Persistence should flow through the data store layer.

3.4 Validate UI conventions
- Grids should follow established Tabulator/grid patterns.
- Naming and event wiring should match nearby code.

3.5 Identify risks
- Backwards compatibility with existing stored JSON data.
- Scenario type configuration changes.
- Edge cases (nulls, missing fields, date handling).

---

## 4.0 Outputs
Return:
- Findings grouped by severity (High/Medium/Low)
- Specific file-level recommendations
- Minimal patch suggestions (if requested)

---

## 5.0 Validation Checks
- Recommendations do not invent new architecture.
- Fixes preserve existing behavior unless explicitly changing it.
- No unrelated refactors.
