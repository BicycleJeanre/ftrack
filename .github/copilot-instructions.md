# GitHub Copilot Instructions

**Version**: 4.2.0  
**Last Updated**: February 8, 2026  
**Purpose**: Lightweight, high-importance rules for working in this repo

---

## 1.0 Core Principles

1.1 Keep responses concise and focused
1.2 Use actual file paths in references
1.3 Follow existing patterns in the project
1.4 Only edit what was explicitly requested
1.5 Reuse existing code and logic before adding new code
1.6 Prefer minimal, targeted changes over refactors
1.7 Keep in-app documentation accurate (`pages/documentation.html`)

## 2.0 AI Workflows

2.1 Repeatable workflows live as prompt files in `.github/prompts/`.
2.2 Keep this file lightweight; do not paste workflow checklists here.

## 3.0 Documentation Standards

3.1 After code changes, update relevant documentation files
3.2 Prefer documenting user-impacting behavior in `pages/documentation.html`
3.3 Keep format consistent across documentation
3.4 Only update affected documentation
3.5 Use Mermaid diagrams for visual representations when helpful
3.6 In Mermaid diagrams, do not use brackets "()" in names/descriptions - use brackets ONLY for circular nodes
3.7 ALL documentation files MUST use legal numbering format (1.0, 1.1, 1.1.1, etc.)
3.8 Keep All documentation short, simple and concise. Avoid replication of information across sections.

## 4.0 Response Format

4.1 At the end of each response, include which instruction rules were applied
4.2 Format: **Applied Rules**: [list of rule numbers, e.g., 1.0, 2.0, 3.1]
4.3 Only list rules that were directly relevant to the response

## 5.0 Self-Update Rules

5.1 Suggest updates to these instructions when patterns emerge or user requests changes
5.2 ALWAYS get user confirmation before updating this file
5.3 When suggesting updates: Explain what rule should be added, why it's beneficial, show example
5.4 When updating: Increment version (PATCH for clarifications, MINOR for new rules, MAJOR for breaking changes), update "Last Updated" date

---

When making updates, keep the in-app documentation in `pages/documentation.html` aligned with user-visible behavior.
