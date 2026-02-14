# QC Run Prompt

## 1.0 Purpose
Define the QC execution workflow and reporting output for this repository.

**Definition of Done**:
- Requested QC scope is executed with the correct npm scripts
- Scenario-type QC validations run when requested
- Generated markdown report is reviewed and summarized
- AI provides concise pass or fail status with next actions

---

## 2.0 Inputs
User requests QC run with optional filters:
- `--scenario=<id|name|type>`
- `--all`
- `--verbose`

If no filter is provided:
1.0 Default to scenario-type QC run (`npm run qc:test:all-scenario-types`) for current architecture checks.
2.0 Use `npm run qc:full` when user explicitly asks for the full legacy verification plus report path.

---

## 3.0 Scripts And Locations

### 3.1 Scenario-Type QC Scripts
Run scenario-type validators under `QC/tests/scenario-types/` using:
- `npm run qc:test:budget`
- `npm run qc:test:general`
- `npm run qc:test:funds`
- `npm run qc:test:debt`
- `npm run qc:test:goal-based`
- `npm run qc:test:advanced-goal-solver`
- `npm run qc:test:all-scenario-types`

### 3.2 Universal Assertions
Scenario-type validators include universal checks from:
- `QC/tests/universal/recurrence-assertions.js`
- `QC/tests/universal/periodic-change-assertions.js`
- `QC/tests/universal/date-boundary-assertions.js`

### 3.3 QC Report Script
- `npm run qc:report`
- `node QC/generate-qc-report.js`
- Optional output path: `node QC/generate-qc-report.js --output <path>`

Output file location:
- `QC/reports/qc-report-YYYY-MM-DD.md`

### 3.4 Legacy Verification Scripts
Use these when user asks for verification workflow explicitly:
- `npm run qc:verify`
- `npm run qc:verify:all`
- `npm run qc:verify:verbose`
- `node QC/verify.js --scenario=<name>`

### 3.5 Module-Level Test Scripts
Module-level tests remain available:
- `npm run qc:test`
- `npm run qc:test:calculation-utils`
- `npm run qc:test:financial-utils`
- `npm run qc:test:date-utils`
- `npm run qc:test:transaction-expander`
- `npm run qc:test:projection-engine`
- `npm run qc:test:periodic-change-utils`
- `npm run qc:test:lookup-data`
- `npm run qc:test:qc-data`

---

## 4.0 Execution Steps

### 4.1 Determine Requested Scope
1.0 Identify whether user wants scenario-type validation, module tests, verification, or full report generation.
2.0 Run only the required commands.

### 4.2 Run Scenario-Type QC (Default)
1.0 Execute `npm run qc:test:all-scenario-types` unless user requests a narrower scope.
2.0 Capture pass or fail status and mismatch counts by scenario type.

### 4.3 Generate Report
1.0 Execute `npm run qc:report`.
2.0 Read the newest file in `QC/reports/`.
3.0 Summarize overall status, scenario-type statuses, mismatch details, and next actions.

### 4.4 Optional Legacy Verification
If user requests verification mode, run `qc:verify` scripts and include outcomes separately from scenario-type QC results.

---

## 5.0 AI Analysis Requirements

### 5.1 Read Outputs
- Scenario-type script output JSON
- Markdown report from `QC/reports/`
- Any requested module or verification command output

### 5.2 Compare Against QC Baselines
Use current QC files only:
- `QC/qc-input-data.json`
- `QC/qc-expected-outputs.json`
- `QC/mappings/use-case-to-scenario-type.json`

### 5.3 Failure Analysis
- Group failures by scenario type and check category
- Include expected vs actual when available
- Provide likely root cause and impacted feature area

### 5.4 Next Actions
- Prioritize by impact
- Provide targeted file paths for fixes

---

## 6.0 Success Criteria
- Correct npm command(s) executed for user request
- Report generated when requested
- AI summary includes status, failures (if any), and next actions
- Exit status respected (0 pass, non-zero fail)

---

## 7.0 Failure Handling
If any command fails:
1.0 Capture command output and error details.
2.0 Continue analysis using available results.
3.0 Provide concise remediation actions.
