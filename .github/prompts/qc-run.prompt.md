# QC Run Prompt

## 1.0 Purpose
Execute the full QC pipeline and generate a structured report for the user.

**Definition of Done**:
- QC verification script runs successfully
- Function tests execute using node:test
- AI generates a concise QC report with pass/fail status and next actions
- User reviews report and addresses failures (if any)

---

## 2.0 Inputs
User requests QC run with optional filters:
- `--scenario=<id|name|type>` - Run QC for specific scenario
- `--all` - Run QC for all scenarios
- `--verbose` - Show detailed output

If no filter provided, default to General scenario.

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
node --test QC/qc-tests.js
```

Capture test results (pass/fail counts and any failures).

### 3.3 Read generated reports
- Read the JSON report from QC/reports/ (most recent)
- Read the function test output
- Extract failures, causes, and impacted features

### 3.4 Generate AI QC report
Create a concise report following this format:

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

Function Test Results:
- Periodic change calculations: <X/Y passed>
- Recurrence date generation: <X/Y passed>
- Date utilities: <X/Y passed>
- Dataset validation: <X/Y passed>

Failures (if any):
- <module>: <issue description>
  Expected: <value>  Actual: <value>
  
Likely Causes (if any):
- <cause 1>
- <cause 2>

Next Actions (if any):
- <action 1>
- <action 2>

Report saved: <path to JSON report>
```

---

## 4.0 AI Analysis Requirements

### 4.1 Read outputs
- JSON report from QC/reports/
- Console output from verification script
- Test output from node:test

### 4.2 Compare to expected values
- Check golden outputs from QC/expected-outputs.json
- Validate tolerance thresholds for numeric comparisons
- Flag any mismatches or unexpected results

### 4.3 Identify failures and causes
- Group failures by module (data structure, config, calculations, etc.)
- Infer likely causes based on error patterns
- Map failures to impacted features

### 4.4 Generate next actions
- Prioritize by criticality (data integrity > calculations > UI)
- Provide specific file/function references
- Suggest investigation or fix approach

---

## 5.0 Success Criteria
- Verification script executed without errors
- Function tests executed without errors
- JSON report generated in QC/reports/
- AI report generated and displayed to user
- Exit code reflects pass/fail status (0 = pass, 1 = fail)

---

## 6.0 Failure Handling
If verification script or tests fail:
- Capture all error output
- Include in AI report under "Failures"
- Provide likely causes and next actions
- Do not stop - complete full analysis

---

## 7.0 Example Usage

**User**: "Run QC"
**AI**:
1. Executes `npm run qc:verify`
2. Executes `node --test QC/qc-tests.js`
3. Reads JSON report and test output
4. Generates and displays AI QC report
5. User reviews and addresses failures

**User**: "Run QC for all scenarios"
**AI**:
1. Executes `npm run qc:verify:all`
2. Executes `node --test QC/qc-tests.js`
3. Reads JSON report and test output
4. Generates and displays AI QC report
5. User reviews and addresses failures
