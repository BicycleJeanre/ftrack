# QC Run Prompt

## 1.0 Purpose
Execute the full QC pipeline and generate a structured report for the user.

**Definition of Done**:
- QC verification script runs successfully
- Function tests execute using node:test
- QC report is generated via the report script
- AI generates a concise QC report with pass/fail status and next actions
- User reviews report and addresses failures (if any)

---

## 2.0 Inputs
User requests QC run with optional filters:
- `--scenario=<id|name|type>` - Run QC for specific scenario
- `--all` - Run QC for all scenarios
- `--verbose` - Show detailed output

If no filter provided, ask the user which scope to run. Recommend the full QC run (`npm run qc:full`) and wait for confirmation before executing.

---

## 3.0 Steps

### 3.1 Run verification script
Execute the verification script using the appropriate npm command:
- `npm run qc:verify` - Default (General scenario)
- `npm run qc:verify:all` - All scenarios
- `npm run qc:verify:verbose` - Verbose output
- `node QC/verify.js --scenario=<name>` - Custom scenario

Capture console output and report file path.

### 3.2 Run function tests
Execute the node:test suite:
```bash
npm run qc:test
```

Capture test results (pass/fail counts and any failures).

### 3.3 Generate QC report
Generate the QC report JSON:
```bash
npm run qc:report
```

Capture the generated report path.

### 3.4 Read generated reports
- Read the JSON report from QC/reports/ (most recent)
- Read the function test output
- Extract failures, causes, and impacted features

### 3.5 Generate AI QC report
# QC Run Prompt

## 1.0 Purpose
Define the single source of QC workflow guidance. All QC documentation lives here.

**Definition of Done**:
- Unified QC script runs successfully
- Module-specific QC script runs successfully when requested
- Verification output and test output are analyzed
- AI produces a concise QC report with pass/fail status and next actions

---

## 2.0 Inputs
User requests QC run with optional filters:
- `--scenario=<id|name|type>` - Run QC for specific scenario
- `--all` - Run QC for all scenarios
- `--verbose` - Show detailed output

If no filter provided, default to General scenario.

---

## 3.0 Scripts And Locations

### 3.1 One Script For Everything
- `npm run qc:full` runs `QC/run-all.js`
  - Runs verification for all scenarios
  - Runs every module test in QC/tests

### 3.2 Module Scripts
Each module has a dedicated runner in QC/:
- `npm run qc:test:calculation-utils`
- `npm run qc:test:financial-utils`
- `npm run qc:test:date-utils`
- `npm run qc:test:transaction-expander`
- `npm run qc:test:projection-engine`
- `npm run qc:test:periodic-change-utils`
- `npm run qc:test:lookup-data`
- `npm run qc:test:qc-data`
- `npm run qc:test:goal-based`
- `npm run qc:test:advanced-goal-solver`

### 3.3 Test Locations
Tests are self-documenting and live here:
- QC/tests/calculation-utils.test.js
- QC/tests/financial-utils.test.js
- QC/tests/date-utils.test.js
- QC/tests/transaction-expander.test.js
- QC/tests/projection-engine.test.js
- QC/tests/periodic-change-utils.test.js
- QC/tests/lookup-data.test.js
- QC/tests/qc-data.test.js
- QC/tests/goal-based.test.js
- QC/tests/advanced-goal-solver.test.js

Verification remains in QC/verify.js.

---

## 4.0 Steps

### 4.1 Run Verification
Choose the appropriate command:
- `npm run qc:verify` (default scenario)
- `npm run qc:verify:all`
- `npm run qc:verify:verbose`
- `node QC/verify.js --scenario=<name>`

Capture console output and any report path produced.

### 4.2 Run Tests
- Full suite: `npm run qc:test`
- Module suite: `npm run qc:test:<module>`

Capture pass/fail counts and failure details.

### 4.3 Generate AI QC Report
Create a concise report in this format:

```
QC Report
Run: <timestamp>
Dataset: QC/ftrack-qc-data.json
Scenario Filter: <filter or "all">

Overall Status: <PASS|FAIL> (<failed count> of <total count> checks failed)

Verification Results:
- Data structure: <PASS|FAIL>
- Configuration: <PASS|FAIL>
- Scenario validation: <PASS|FAIL>

Module Test Results:
- <module>: <X/Y passed>

Failures (if any):
- <module>: <issue description>
  Expected: <value>  Actual: <value>

Likely Causes (if any):
- <cause 1>
- <cause 2>

Next Actions (if any):
- <action 1>
- <action 2>
```

---

## 5.0 AI Analysis Requirements

### 5.1 Read Outputs
- Console output from QC/verify.js
- node:test output from QC/tests

### 5.2 Compare To Expected Values
- Use QC/expected-outputs.json as the baseline
- Respect tolerance rules used in the tests

### 5.3 Identify Failures And Causes
- Group failures by module
- Map failures to affected features

### 5.4 Generate Next Actions
- Prioritize by criticality
- Provide file and function references

---

## 6.0 Success Criteria
- Verification script executed without errors
- Requested test suite executed without errors
- AI report generated and displayed to user
- Exit code reflects pass/fail status (0 = pass, 1 = fail)

---

## 7.0 Failure Handling
If verification script or tests fail:
- Capture all error output
- Include in AI report under "Failures"
- Provide likely causes and next actions
- Do not stop - complete full analysis
