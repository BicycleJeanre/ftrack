# Data Model Check Prompt

## 1.0 Purpose
Detect and prevent drift between code/data structures and documented expectations.

**Definition of Done**:
- Lists data structures impacted.
- Flags compatibility/migration concerns.

---

## 2.0 Inputs
Provide:
- What changed (files, feature description)
- Whether existing user data must remain compatible

If inputs are missing:
- Infer from git diff and from files in `userData/assets/`.

---

## 3.0 Steps
3.1 Identify the persisted models
- Scenarios
- Accounts
- Transactions
- Projections output (if persisted)

3.2 Compare usage across layers
- Where is the field created?
- Where is it read?
- Is it optional? What is the default?

3.3 Compatibility and migrations
- If fields are added: ensure safe defaults.
- If fields are renamed/removed: create a migration step and document it.

3.4 Documentation update guidance
- If this change affects user behavior, ensure relevant docs under `Documentation/` reflect it.
- If it affects only internals, document only what is needed to keep future changes safe.

---

## 4.0 Outputs
Return:
- A table of impacted entities and fields
- Compatibility notes (safe / needs migration)
- Required documentation updates (if any)

---

## 5.0 Validation Checks
- No breaking changes to stored JSON without a migration plan.
- All new fields have defaults.
