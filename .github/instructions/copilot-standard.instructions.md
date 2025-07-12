## applyTo: '\*\*'

# Copilot Rules

## Code Editing

* Use built-in `execute query` and `get tables` tools when possible.
* Only edit what was explicitly requested.
* Keep all existing comments and formatting.
* Follow naming conventions and code patterns.
* Always include error handling in DB functions.
* Apply updates directly to code files.

## Git Commit

* Stage all changes with `git add .`
* Use this commit format:

  ```
  git commit -m "Short summary

  Changed files:
  - path/to/file1: what changed
  - path/to/file2: what changed"
  ```
* Use aliases: `git`, `gitit`, `commit`

## Git Branching

* Create a branch for any new feature or major change.
* Provide a one-liner that includes branching and committing.
* Alias: `branch`

## Git Merging

* `mergeup`: merge current branch into its origin.
* Provide one-liner for this.
* Suggest deleting the feature branch after merge.

## Documentation Updates

* After code changes, update relevant `.md` files in the `documentation/` folder.
* If structure, navigation, or data flow changes, update `PROJECT_OVERVIEW.md`.
* Keep format consistent, use Mermaid diagrams when needed.
* Only update affected docs. Add new ones for new files.
