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

### 3.2 Code quality analysis
3.2.1 File size and responsibility boundaries
- Identify files that are unusually large or doing too many jobs.
- Suggest specific extraction targets and destination paths that match existing patterns.

3.2.2 Duplication and parallel implementations
- Find duplicated utilities, repeated event wiring, repeated modal patterns.
- Recommend consolidations that preserve current architecture.

3.2.3 Architecture and separation of concerns
- Confirm UI code delegates business logic to managers and utilities.
- Confirm persistence flows through the data/store layer.
- Verify logging/error handling patterns are consistent.

### 3.3 Library usage
3.3.1 Inventory third-party libraries and versions.
3.3.2 Identify where custom code duplicates library capabilities.
3.3.3 For grid-related logic, confirm customizations are domain-driven.

### 3.4 Documentation verification
3.4.1 User-facing documentation
- Treat `pages/documentation.html` as the primary user-facing documentation surface.

3.4.2 Repository docs surfaced in-app
- Use the Repository Docs panel implementation to validate how repo docs are consumed:
  - `assets/docs-manifest.json`
  - `scripts/generate-docs-manifest.mjs`
  - `js/doc-repo-manifest.js`

3.4.3 Accuracy checks
- Compare documented workflows, data flows, and UI behaviors to the code.
- Flag mismatches, stale references, or missing coverage.

### 3.5 Maintainability assessment
3.5.1 Identify TODO/FIXME hotspots and error-handling gaps.
3.5.2 Identify hard-coded values and magic numbers that should be configuration.
3.5.3 Identify risky coupling between modules.

### 3.6 Optimization opportunities
3.6.1 Performance
- Find unnecessary transformations, repeated computations, or inefficient loops.
- Suggest optimizations only when evidence supports it.

3.6.2 Code organization
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

4.7 Recommended Actions (prioritized)

4.8 Items Already Optimal (do not change)

---

## 5.0 Validation Checks
- Recommendations are grounded in actual code, not assumptions.
- Suggestions preserve the existing architecture.
- Avoid unrelated refactors.
- Include file paths for all actionable items.
