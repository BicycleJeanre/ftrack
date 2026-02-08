# Repo Analysis Prompt

## 1.0 Purpose
Perform a comprehensive repository analysis focused on maintainability, code quality, and documentation accuracy.

**Definition of Done**:
- Identifies the highest-impact code quality and maintainability issues.
- Provides specific, minimal recommendations with concrete file paths.
- Validates documentation accuracy against actual implementation.

---

## 2.0 Inputs
Provide:
- Branch name (or PR link)
- Scope: `full` or a list of folders/files
- Focus: `code`, `docs`, `both`

If inputs are missing:
- Analyze the current workspace state and most recent commit on the current branch.

---

## 3.0 Steps

### 3.1 Establish repository context
3.1.1 Identify the main stack and runtime context (Electron vs web-hosted pages).
3.1.2 Map core modules vs utilities (e.g., managers, core data store, UI layer).
3.1.3 Find existing project rules:
- `.github/copilot-instructions.md`
- `.github/prompts/*.prompt.md`
3.1.4 Review recent changes (previous code change analysis)
- If a branch/PR is provided: compare against default branch (`main`) vs `HEAD`.
- Also compare against `dev` vs `HEAD` when `dev` exists and represents the production base (or when changes are being pushed to production from `dev`).
- Otherwise: analyze the latest commit(s) on the current branch.
- Use `git diff` and `git log` to identify:
  - What changed
  - Why it changed (inferred intent)
  - Which user-facing behaviors and persisted data could be impacted

### 3.2 Code quality analysis
3.2.1 File size and responsibility boundaries
- Identify files that are unusually large or doing too many jobs.
- Suggest specific extraction targets and destination paths that match existing patterns.

3.2.2 Duplication and parallel implementations
- Find duplicated utilities, repeated event wiring, repeated modal patterns.
- Recommend consolidations that preserve current architecture.

3.2.3 Reuse-first validation
- Check whether similar logic already exists.
- Prefer reusing or extending existing utilities/managers over new parallel logic.
- Flag duplicate helpers and recommend a single canonical implementation.

3.2.4 Architecture and separation of concerns
- Confirm UI code delegates business logic to managers and utilities.
- Confirm persistence flows through the data/store layer.
- Verify logging/error handling patterns are consistent.

3.2.5 Design patterns and project conventions
- Validate how patterns are applied in this repository (module boundaries, manager/util split, UI wiring conventions).
- Reference and follow: `.github/prompts/code-review.prompt.md`

### 3.3 Library usage
3.3.1 Inventory third-party libraries and versions.
3.3.2 Identify where custom code duplicates library capabilities.
3.3.3 For grid-related logic, confirm customizations are domain-driven.

### 3.4 Data model validation
3.4.1 Run the data model drift check (especially after major changes)
- Reference and follow: `.github/prompts/data-model-check.prompt.md`

### 3.5 Documentation verification
3.5.1 User-facing documentation
- Treat `pages/documentation.html` as the primary user-facing documentation surface.

3.5.2 Repository docs surfaced in-app
- Use the Repository Docs panel implementation to validate how repo docs are consumed:
  - `assets/docs-manifest.json`
  - `scripts/generate-docs-manifest.mjs`
  - `js/doc-repo-manifest.js`

3.5.3 In-app user functionality documentation pass
- This is not functional testing.
- Identify and document user-facing functionality from within the app surfaces (UI flows, buttons, grids, dialogs, shortcuts) by mapping code to:
  - `pages/home.html`
  - `pages/forecast.html`
  - `pages/documentation.html`
  - `js/*` UI modules (navbar, doc panel, modals, grid handlers)
- Ensure documentation describes what the app does now (not what it used to do).

3.5.4 Accuracy checks
- Compare documented workflows, data flows, and UI behaviors to the code.
- Flag mismatches, stale references, or missing coverage.

3.5.5 Documentation workflow and repo hygiene
- If repository documents are added/removed/renamed under `Documentation/`:
  - Update the docs set accordingly (create/delete as appropriate).
  - Regenerate or update `assets/docs-manifest.json` to match (via `scripts/generate-docs-manifest.mjs`).
- Ensure `CHANGELOG.md` is updated when changes are user-impacting.
- Ensure technical documentation reflects the repository (architecture, UI layer, and usage guides stay consistent with code).

### 3.6 Styles and UI consistency
3.6.1 Validate styling conventions and UI consistency
- Check `styles/app.css` and UI modules for consistency (layout rules, class usage, grid styling).
- Flag style drift where UI behavior is documented but styling no longer matches.

### 3.7 Maintainability assessment
3.7.1 Identify TODO/FIXME hotspots and error-handling gaps.
3.7.2 Identify hard-coded values and magic numbers that should be configuration.
3.7.3 Identify risky coupling between modules.

### 3.8 Optimization opportunities
3.8.1 Performance
- Find unnecessary transformations, repeated computations, or inefficient loops.
- Suggest optimizations only when evidence supports it.

3.8.2 Code organization
- Prioritize changes by impact vs effort.
- Avoid recommending rewrites.

---

## 4.0 Outputs
Provide a single markdown response with:

4.1 Executive Summary (3-5 bullets)

4.2 Repository Strengths

4.3 Critical Issues (High priority)

4.4 Code Quality Findings
- Size/responsibility findings with concrete extraction targets
- Duplication patterns with consolidation targets
- Architecture adherence gaps

4.5 Library Usage Findings

4.6 Documentation Gaps
- Missing
- Inaccurate
- Format violations (if applicable)

4.6.1 Docs manifest and changelog status
- If docs were added/removed/renamed: confirm `assets/docs-manifest.json` matches.
- Confirm whether `CHANGELOG.md` needs updates (and why).

4.7 Recommended Actions (prioritized)

4.8 Items Already Optimal (do not change)

---

## 5.0 Validation Checks
- Recommendations are grounded in actual code, not assumptions.
- Suggestions preserve the existing architecture.
- Avoid unrelated refactors.
- Include file paths for all actionable items.
- Includes previous code change analysis (diff/log) for the scoped changes.
- Validates in-app user functionality documentation coverage.
- Applies reuse-first as a primary decision rule.
- Runs or references data model drift checks when persisted data may change.
- Includes a styles and UI consistency pass.
