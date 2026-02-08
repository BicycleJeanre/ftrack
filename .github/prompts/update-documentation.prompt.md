# Update Documentation Prompt

## 1.0 Purpose
Keep the repository documentation in sync with code changes.

**Definition of Done**:
- Relevant Markdown docs under `Documentation/` reflect the current behavior.
- If a new doc is required, it follows the naming/display rules:
	- Filename starts with a grouping prefix (first word)
	- First H1 is the user-facing display name

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
- Prefer updating existing Markdown docs over creating new docs.

3.2 Update `Documentation/*.md`
- Find the smallest existing doc that should change.
- Update descriptions, steps, and examples as needed.
- Keep docs short and avoid duplicating content already explained elsewhere.
- If you add/rename/remove docs, update the docs manifest (`assets/docs-manifest.json`) via `scripts/generate-docs-manifest.mjs`.

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
- New documentation files are added only when required, and follow the naming/display rules.
- The documentation remains concise and non-repetitive.
