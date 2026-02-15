# Repo Analysis Prompt

## 1.0 Purpose
Perform a comprehensive repository analysis focused on maintainability, code quality, and documentation accuracy.

**Definition of Done**:
- Identifies the highest-impact code quality and maintainability issues.
- Provides specific, minimal recommendations with concrete file paths.
- Validates documentation accuracy against actual implementation.
- Identifies cleanup candidates (unused, duplicated, obsolete files/modules) with safe deletion or consolidation paths.
- Checks application design and user features for regressions; flags removals or behavior loss as issues.

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

### 3.2 Documentation
3.2.1 User-facing documentation
- Treat `Documentation/*.md` as the primary user-facing documentation source.
- File naming/display rules:
  - Filename starts with a grouping prefix (first word)
  - First H1 is the user-facing display name

3.2.2 Repository docs surfaced in-app
- Use the Repository Docs panel implementation to validate how repo docs are consumed:
  - `assets/docs-manifest.json`
  - `scripts/generate-docs-manifest.mjs`
  - `js/doc-repo-manifest.js`

3.2.3 In-app documentation coverage pass
- This is not functional testing.
- Map user-facing flows, buttons, grids, dialogs, and shortcuts by reading code in:
  - `pages/home.html`
  - `pages/forecast.html`
  - `js/*` UI modules (navbar, doc panel, modals, grid handlers, keyboard shortcuts)
- Ensure documentation describes what the app does now (not what it used to do).

3.2.4 Accuracy and hygiene checks
- Compare documented workflows, data flows, and UI behaviors to the code.
- Flag mismatches, stale references, or missing coverage.
- If repository documents are added/removed/renamed under `Documentation/`:
  - Update the docs set accordingly (create/delete as appropriate).
  - Regenerate or update `assets/docs-manifest.json` to match (via `scripts/generate-docs-manifest.mjs`).
- Ensure `CHANGELOG.md` is updated when changes are user-impacting.
- Ensure technical docs reflect reality (architecture, UI layer, and usage guides stay consistent with code).

### 3.3 Codebase Cleanup
3.3.1 Identify cleanup candidates (files and modules)
- Look for unused modules, dead utilities, orphaned scripts, duplicated helpers, and obsolete docs.
- Look for UI modules that are no longer referenced by pages or navigation.
- Look for stale assets and unused manifest entries (docs manifest, icons, lookup data).
- Prefer “prove unused” indicators: no imports/requires, no DOM references, not registered/loaded.

3.3.2 File size and responsibility boundaries
- Identify files that are unusually large or doing too many jobs.
- Suggest specific extraction targets and destination paths that match existing patterns.

3.3.3 Maintainability hotspots
- Identify TODO/FIXME hotspots and error-handling gaps.
- Identify hard-coded values and magic numbers that should be configuration.
- Identify risky coupling between modules.

### 3.4 Logic and Design Reuse
3.4.1 Duplication and parallel implementations
- Find duplicated utilities, repeated event wiring, repeated modal patterns.
- Recommend consolidations that preserve current architecture.

3.4.2 Reuse-first validation
- Check whether similar logic already exists.
- Prefer reusing or extending existing utilities/managers over new parallel logic.
- Flag duplicate helpers and recommend a single canonical implementation.

3.4.3 Design patterns and project conventions
- Validate how patterns are applied in this repository (module boundaries, manager/util split, UI wiring conventions).
- Reference and follow: `.github/prompts/code-review.prompt.md`

### 3.5 Logic and Design Implementation
3.5.1 Architecture and separation of concerns
- Confirm UI code delegates business logic to managers and utilities.
- Confirm persistence flows through the data/store layer.
- Verify logging/error handling patterns are consistent.

3.5.2 Library usage
- Inventory third-party libraries and versions.
- Identify where custom code duplicates library capabilities.
- For grid-related logic, confirm customizations are domain-driven.

3.5.3 Data model validation
- Run the data model drift check (especially after major changes)
  - Reference and follow: `.github/prompts/data-model-check.prompt.md`

3.5.4 Optimization opportunities
- Performance: find unnecessary transformations, repeated computations, or inefficient loops.
- Suggest optimizations only when evidence supports it.
- Code organization: prioritize changes by impact vs effort and avoid recommending rewrites.

### 3.6 Design Standards
3.6.1 Styles and UI consistency
- Check `styles/app.css` and UI modules for consistency (layout rules, class usage, grid styling).
- Flag style drift where UI behavior is documented but styling no longer matches.

### 3.7 Application Design and User Features
3.7.1 Feature inventory
- List the main user-facing features implied by:
  - `pages/home.html` and `pages/forecast.html`
  - UI wiring in `js/*` modules (navbar, toolbar totals, modals, keyboard shortcuts, grid handlers)
  - `Documentation/*`

3.7.2 Regression and removal detection
- Using the diff/log context, check whether any user-visible features, flows, shortcuts, or UI affordances were removed or degraded.
- If a feature appears removed, do not assume it was intended: flag it explicitly as an issue and point to the exact change.
- Distinguish between:
  - “Removed intentionally but undocumented”
  - “Accidentally removed”
  - “Still present but relocated or renamed”

---

## 4.0 Outputs
Provide a single markdown response using this exact, short layout.

### 4.1 Report Format Rules
- Keep the full report concise (prefer short bullets; avoid long paragraphs).
- If a section has no findings, write: `None.`
- Use this single-line bullet format for findings:
  - `- [H|M|L] <path>: <issue> -> <minimal fix>`
- For user-facing regressions/removals, use:
  - `- [REGRESSION] <path>: <what changed> -> <impact> -> <fix or confirm intent>`
- Cap findings per section to the top 3 by impact (unless the user requested exhaustive output).

### 4.2 Executive Summary (max 5 bullets)

### 4.3 Scope and Diff Context (max 5 bullets)
- Branch/compare targets used (e.g., `main..HEAD`)
- 1-3 key areas touched
- Persisted data risk (Yes/No)

### 4.4 Findings

#### 4.4.1 Documentation
- Include `Documentation/*.md` accuracy notes
- If docs were added/removed/renamed: confirm `assets/docs-manifest.json` matches
- Note whether `CHANGELOG.md` should be updated (and why)

#### 4.4.2 Codebase Cleanup
- Unused/obsolete/duplicated modules or files (only when you can support “unused”)
- Large-file responsibility boundary issues (only when actionable)

#### 4.4.3 Logic and Design Reuse
- Duplication and parallel implementations
- Reuse-first violations and canonical targets

#### 4.4.4 Logic and Design Implementation
- Architecture/separation of concerns gaps
- Library duplication notes (only if meaningful)
- Data model drift relevance (applies/does not apply)

#### 4.4.5 Design Standards
- Styles/UI consistency drift

#### 4.4.6 Application Design and User Features
- Feature inventory (max 5 bullets)
- Regressions/removals (must be explicitly flagged)

### 4.5 Recommended Actions (Top 5, prioritized)
- Each action must reference concrete paths

### 4.6 Items Already Optimal (max 5 bullets)

---

## 5.0 File Modification Scope

5.1 Analysis-only by default
- This prompt performs analysis and recommendations only.
- Do not modify, delete, or create files unless explicitly requested.
- Present findings and let the user decide which recommendations to implement.

5.2 User approval required
- Propose cleanup actions but do not execute them.
- If cleanup requires file deletions or major refactors, ask for explicit user approval first.
- Surface conflicts: if multiple sessions touch the same file, defer to user.

---

## 6.0 Validation Checks
- Recommendations are grounded in actual code, not assumptions.
- Suggestions preserve the existing architecture.
- Avoid unrelated refactors.
- Include file paths for all actionable items.
- Includes previous code change analysis (diff/log) for the scoped changes.
- Validates in-app user functionality documentation coverage.
- Validates `Documentation/` coverage for user-facing behavior.
- Applies reuse-first as a primary decision rule.
- Runs or references data model drift checks when persisted data may change.
- Includes a styles and UI consistency pass.
- Includes an explicit cleanup candidates pass (unused/duplicated/obsolete files and modules).
- Flags user-facing feature removals or regressions as issues (do not bury them under “nice-to-have cleanup”).- Respects file modification scope (analysis only unless explicitly requested).