# GitHub Copilot Instructions

**Version**: 4.4.0  
**Last Updated**: February 12, 2026  
**Purpose**: Lightweight, high-importance rules for working in this repo

---

## 1.0 Core Principles

1.1 Keep responses concise and focused
1.2 Use actual file paths in references
1.3 Follow existing patterns in the project
1.4 Strict file modification scope: Only edit files explicitly requested by the user. Do not modify, delete, or create files outside the scope of the request, even if they seem related or beneficial. If tool operations touch unrelated files, leave them unchanged.
1.5 Reuse existing code and logic before adding new code
1.6 Prefer minimal, targeted changes over refactors
1.7 Keep documentation accurate (`Documentation/*.md`)
1.8 Conflicting changes: If multiple requested changes affect the same code section with conflicting outcomes, present the conflict to the user and defer the decision. Do not choose between them without explicit user guidance.

## 2.0 AI Workflows

2.1 Repeatable workflows live as prompt files in `.github/prompts/`.
2.2 Keep this file lightweight; do not paste workflow checklists here.
2.3 QC workflow: When user requests QC run, follow `.github/prompts/qc-run.prompt.md`. Execute the commands specified there and present the generated markdown report summary from `/QC/reports/qc-report-YYYY-MM-DD.md`.

## 3.0 Documentation Standards

3.1 After code changes, update relevant documentation files
3.2 Prefer documenting user-impacting behavior in `Documentation/*.md`
3.3 Keep format consistent across documentation
3.4 Only update affected documentation
3.5 Use Mermaid diagrams for visual representations when helpful
3.6 In Mermaid diagrams, do not use brackets "()" in names/descriptions - use brackets ONLY for circular nodes
3.7 ALL documentation files MUST use legal numbering format (1.0, 1.1, 1.1.1, etc.)
3.8 Keep All documentation short, simple and concise. Avoid replication of information across sections.
3.9 Documentation file naming and display rules
3.9.1 Documentation is stored and maintained under `Documentation/` as Markdown only.
3.9.2 File naming uses a grouping prefix as the first word (e.g., `concepts_*`, `USER_*`, `TECH_*`, `other_*`).
3.9.3 The first H1 in each Markdown file is the user-facing display name.

## 4.0 Response Format

4.1 At the end of each response, include which instruction rules were applied
4.2 Format: **Applied Rules**: [list of rule numbers, e.g., 1.0, 2.0, 3.1]
4.3 Only list rules that were directly relevant to the response

## 5.0 Self-Update Rules

5.1 Suggest updates to these instructions when patterns emerge or user requests changes
5.2 ALWAYS get user confirmation before updating this file
5.3 When suggesting updates: Explain what rule should be added, why it's beneficial, show example
5.4 When updating: Increment version (PATCH for clarifications, MINOR for new rules, MAJOR for breaking changes), update "Last Updated" date

## 6.0 Git Workflow & Commit Control

6.1 The user has full control over which files are committed
6.2 AI should not assume all changed files should be committed together
6.3 When work is complete, list all files modified so user can selectively stage/commit
6.4 Respect `git status` output; user decides what to include in each commit
6.5 When presenting completed work, clearly mark any files changed but not directly requested as "discovered changes"
6.6 Allow user to choose which files to include in commit via selective staging (not `git add -A`)

---

When making updates, keep the documentation in `Documentation/` aligned with user-visible behavior.
