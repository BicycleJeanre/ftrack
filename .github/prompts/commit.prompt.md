# Commit Prompt

## 1.0 Purpose
Create consistent git commits using one single command.

This prompt supports two commit types:
- **Minor commits**: small working commits while building.
- **Major commits**: larger features or completed work items.

**Definition of Done**:
- Produces exactly one combined command that both stages and commits.
- Commit message matches the chosen commit type rules.

---

## 2.0 Inputs
Provide:
- Commit type: `minor` or `major`
- What changed (plain-English, user-impacting if possible)
- Any important behavior changes, edge cases, or data model changes

If inputs are missing:
- Infer changes from `git diff` and `git status`.

---

## 3.0 Steps

### 3.1 Confirm commit type
- Use `minor` for incremental progress.
- Use `major` for larger features or completed work items.

### 3.2 Write the commit message

#### 3.2.1 Minor commit message rules
- One short sentence.
- Present tense, action-oriented.
- No file lists.

**Template**:
- `Add ...`
- `Fix ...`
- `Update ...`
- `Refine ...`

#### 3.2.2 Major commit message rules
- First line: one quick overview sentence.
- Then: up to **10–15** descriptive points.
- Points describe the changes (behavior/outcomes), not a list of files.
- Keep points concise; prefer user impact and key technical shifts.

**Point ideas** (use only what applies):
- New capability added
- Behavior change
- Bug fix and its symptom
- Data model or migration impact
- Edge case handling
- Performance or reliability impact
- UX change

---

## 4.0 Outputs
Return exactly one command the user can run.

### 4.1 Minor commit command
```bash
git commit -m "<one-sentence description>"
```

Notes:
- User must selectively stage files before committing (see section 6.0 below).
- Do not use `git add -A`; let the user choose which files to stage.

### 4.2 Major commit command
Use a single command that includes a title + bullet list body.

```bash
git commit -m "<overview sentence>" -m $'- <point 1>\n- <point 2>\n- <point 3>'
```

Notes:
- The `$'...'` form is supported by `zsh` (macOS default) and allows `\n` newlines inside a single `-m`.
- Keep the bullet list to 10–15 points maximum.
- User must selectively stage files before committing (see section 6.0 below).

---

## 5.0 Validation Checks
- Minor: message is one sentence (no bullets).
- Major: has one overview sentence + 10–15 bullets max.
- Bullets describe behavior/changes, not a file list.
- Output includes exactly one commit command (no `git add -A`).

## 6.0 File Staging Control

6.1 Do not auto-stage all files
- The user must selectively stage the files they want to commit.
- Different AI work sessions may touch different files; the user decides what to include in each commit.

6.2 List files before committing
- Before providing the commit command, list all files that are currently staged/unstaged.
- Show which files are part of this work session vs. pre-existing changes.

6.3 User chooses staging strategy
Provide guidance on selective staging:
```bash
git status                    # See all changes
git add <file1> <file2>       # Stage specific files
git add :<filename>           # Remove file from staging if needed
git commit -m "..."
```

6.4 Conflicting changes
- If the same file was changed by multiple AI sessions or the user, surface the conflict.
- Do not commit conflicting changes; ask the user to resolve first.
