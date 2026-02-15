# Release Prompt

## 1.0 Purpose
Prepare a consistent release (patch/minor/major) with correct versioning and release notes.

**Definition of Done**:
- Version bumped correctly.
- `CHANGELOG.md` updated.
- Release is tagged.
- Merge/push steps are proposed but require user confirmation.

---

## 2.0 Inputs
Provide:
- Target version (e.g., `0.7.2-beta`)
- Release type (patch/minor/major)
- Branches involved (e.g., feature → dev → main)

---

## 3.0 Steps
3.1 Gather changes
- Summarize changes since last tag (or since last release section in CHANGELOG).

3.2 Update version sources
- `package.json` version
- `CHANGELOG.md` (move items from Unreleased into a new version section)
- `pages/home.html` What's New (keep last 3 releases)

3.3 Tag
- Create an annotated tag: `vX.Y.Z[-suffix]`.

3.4 Propose merge/push
- Provide exact commands.
- Do not push or merge to `main` without explicit user confirmation.
- Do not auto-commit release changes; ask user which files to include.
- User decides if release changes are committed alone or bundled with other work.

---

## 4.0 Outputs
Return:
- Files to be changed
- Proposed CHANGELOG entry (Added/Changed/Fixed/Removed)
- Exact git commands for commit/tag
- Questions blocking release (if any)

---

## 5.0 Validation Checks
- Version matches semantic versioning rules.
- CHANGELOG format remains Keep-a-Changelog style.
- Tag name matches `vX.Y.Z[-suffix]`.
