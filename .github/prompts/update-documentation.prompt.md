# Update Documentation Prompt

## 1.0 Purpose
Keep the in-app documentation in sync with code changes.

**Definition of Done**:
- Relevant sections in `pages/documentation.html` reflect the current behavior.
- No new documentation files are created.

---

## 2.0 Inputs
Provide:
- Branch name
- Summary of what changed (or a list of changed files)
- Whether changes are user-facing, technical-only, or both

If inputs are missing:
- Derive changed files from git status/diff.

---

## 3.0 Steps
3.1 Identify impacted areas
- Review changed files and map them to documentation topics.
- Prefer updating existing `.doc-panel` sections over adding new sections.

3.2 Update `pages/documentation.html`
- Find the smallest existing section that should change.
- Update descriptions, steps, examples, and screenshots text if present.
- Avoid duplicating content already explained elsewhere.

3.3 Keep links accurate
- Ensure file references are valid and match actual paths.
- Keep instructions consistent with current UI labels and menus.

3.4 Validate
- Confirm documentation aligns with current UI flow.
- If behavior is ambiguous, ask the user for the intended behavior before writing docs.

---

## 4.0 Outputs
Return:
- A short summary of doc changes
- Which sections were updated (by heading/title)
- Any open questions or mismatches found

---

## 5.0 Validation Checks
- The described steps match the actual UI.
- No new documentation files were added.
- The documentation remains concise and non-repetitive.
