# GitHub Copilot Instructions

**Version**: 4.0.0  
**Last Updated**: January 24, 2026  
**Purpose**: General interaction and workflow standards

---

## 1.0 Core Principles

1.1 Keep responses concise and focused
1.2 Use actual file paths in references
1.3 Follow existing patterns in the project
1.4 Only edit what was explicitly requested

## 2.0 Git Workflow

### 2.1 Commit Standards

When user requests git workflow:

2.1.1 Analyze all changes (staged and unstaged)
2.1.2 Stage all changes with `git add .`
2.1.3 Create detailed commit message based on changes
2.1.4 Commit using this format:

```bash
git commit -m "Short summary

Changed files:
- path/to/file1: what changed
- path/to/file2: what changed"
```

2.1.5 Do NOT push to origin unless explicitly requested

### 2.2 Merging

2.2.1 Check what the base branch is for the current branch before merging
2.2.2 Merge into the base branch (typically `main` or `develop`)
2.2.3 Provide one-liner commands for merge operations
2.2.4 Suggest deleting feature branches after successful merge

## 3.0 Documentation Standards

3.1 After code changes, update relevant documentation files
3.2 If structure, navigation, or data flow changes, update overview documentation
3.3 Keep format consistent across all documentation
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

When making any updates to this repo, always review `/Documentation/TECHNICAL_DOCUMENTATION.md` first to ensure the appropriate design standards are ALWAYS followed for this repository. Update this documentation with any relevant changes to the technical design. 
