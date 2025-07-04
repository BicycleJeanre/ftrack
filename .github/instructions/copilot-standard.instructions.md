---
applyTo: '**'
---
# Copilot Standard Rules

- Use the built-in execute query and get tables tools as far as possible
- When editing files do not change anything that wasn't specifically requested
- Always retain existing comments and formatting
- Use established naming conventions and code patterns
- Include error handling in all database functions
- Update code the actual code files where applicable
- when commiting use the AI Helper Files > Commit workflow file. 

# GIT Commit Rules
- first pull from origin with `git pull origin HEAD`
- Always stage all changes with `git add .`
- Use the following commit message format:
  ```
  git commit -m "Brief description of what changed

  Changed files:
  - path/to/file1: what changed in this file
  - path/to/file2: what changed in this file"
  ```
- Push to origin with `git push origin HEAD`