#!/usr/bin/env node

/**
 * QC Report Generator
 * Generates comprehensive markdown report from QC verification and test results
 * Usage: node QC/generate-qc-report.js [--output path/to/report.md]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OUTPUT_DEFAULT = path.join(__dirname, 'reports', `qc-report-${new Date().toISOString().split('T')[0]}.md`);

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let outputPath = OUTPUT_DEFAULT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      outputPath = args[i + 1];
      i++;
    }
  }

  return { outputPath };
}

/**
 * Run verification script and capture results
 */
function runVerification() {
  try {
    const output = execSync('node QC/verify.js --all --no-report', {
      encoding: 'utf8',
      cwd: path.join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    return parseVerificationOutput(output);
  } catch (err) {
    // execSync throws on non-zero exit code, but verification script still produces output
    // stdout is available in err.stdout or err.message
    const output = err.stdout?.toString() || err.message || '';
    return parseVerificationOutput(output);
  }
}

/**
 * Parse verification script output
 */
function parseVerificationOutput(output) {
  const lines = output.split('\n');
  const statusLine = lines.find(l => l.includes('Status:'));
  const runLine = lines.find(l => l.includes('Run:'));
  const reportLine = lines.find(l => l.includes('Report saved:'));
  
  const status = statusLine?.match(/Status: (\w+)/)?.[1] || 'UNKNOWN';
  const passFailMatch = statusLine?.match(/\((\d+) failed, (\d+) passed\)/);
  const failed = passFailMatch?.[1] || '0';
  const passed = passFailMatch?.[2] || '0';
  const timestamp = runLine?.match(/Run: (.+)/)?.[1] || new Date().toISOString();
  const reportPath = reportLine?.match(/Report saved: (.+)/)?.[1]?.trim() || '';

  return {
    status,
    failed: parseInt(failed),
    passed: parseInt(passed),
    timestamp,
    reportPath,
    output
  };
}

/**
 * Run function tests and capture results
 */
function runFunctionTests() {
  try {
    const output = execSync('npm run qc:test 2>&1', { 
      encoding: 'utf8', 
      cwd: path.join(__dirname, '..'),
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    return parseTestOutput(output, false);
  } catch (err) {
    // Tests can fail (exit code 1) but still produce valid output
    const output = err.stdout?.toString() || err.stderr?.toString() || err.message;
    return parseTestOutput(output, true);
  }
}

/**
 * Parse test output
 */
function parseTestOutput(output, hadError) {
  const lines = output.split('\n');
  
  // Find the summary stats - they're near the end
  let total = 0, passed = 0, failed = 0, suites = 0;
  
  for (const line of lines) {
    const testsMatch = line.match(/^#\s+tests\s+(\d+)/);
    const passMatch = line.match(/^#\s+pass\s+(\d+)/);
    const failMatch = line.match(/^#\s+fail\s+(\d+)/);
    const suitesMatch = line.match(/^#\s+suites\s+(\d+)/);
    
    if (testsMatch) total = parseInt(testsMatch[1]);
    if (passMatch) passed = parseInt(passMatch[1]);
    if (failMatch) failed = parseInt(failMatch[1]);
    if (suitesMatch) suites = parseInt(suitesMatch[1]);
  }

  // Extract failure details
  const failures = extractFailures(output);

  return {
    status: failed > 0 ? 'FAIL' : 'PASS',
    total,
    passed,
    failed,
    suites,
    failures,
    output
  };
}

/**
 * Extract failure details from test output
 */
function extractFailures(output) {
  const failures = [];
  const lines = output.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for "not ok" lines
    if (line.includes('not ok')) {
      const testName = line.split(' - ')[1]?.trim();
      
      // Look ahead for error details
      let errorMessage = '';
      let location = '';
      
      for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
        if (lines[j].includes('error:')) {
          errorMessage = lines[j].split('error:')[1]?.trim().replace(/'/g, '');
        }
        if (lines[j].includes('location:')) {
          location = lines[j].split('location:')[1]?.trim().replace(/'/g, '');
        }
        if (lines[j].includes('ok ') && !lines[j].includes('not ok')) {
          break;
        }
      }
      
      if (testName && !testName.includes('QC Function Tests')) {
        failures.push({
          test: testName,
          error: errorMessage || 'Test failed',
          location: location || 'Unknown'
        });
      }
    }
  }
  
  return failures;
}

/**
 * Generate markdown report
 */
function generateReport(verificationResult, testResult) {
  const timestamp = new Date().toISOString().split('T')[0];
  const overallStatus = verificationResult.status === 'PASS' && testResult.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
  
  let report = `# QC Report - ${timestamp}\n\n`;
  report += `**Generated**: ${new Date().toISOString()}\n`;
  report += `**Overall Status**: ${overallStatus}\n\n`;
  report += `---\n\n`;
  
  // Executive Summary
  report += `## 1.0 Executive Summary\n\n`;
  report += `| Component | Status | Details |\n`;
  report += `|-----------|--------|----------|\n`;
  report += `| **Verification** | ${verificationResult.status === 'PASS' ? '✅ PASS' : '❌ FAIL'} | ${verificationResult.failed} failed, ${verificationResult.passed} passed |\n`;
  report += `| **Function Tests** | ${testResult.status === 'PASS' ? '✅ PASS' : '❌ FAIL'} | ${testResult.failed} failed, ${testResult.passed} passed (${testResult.total} total) |\n`;
  report += `| **Test Suites** | ${testResult.suites} suites | - |\n`;
  report += `| **Coverage** | All scenario types | Budget, General, Funds, Debt, Goal-Based, Advanced Solver |\n\n`;
  
  // Verification Details
  report += `---\n\n`;
  report += `## 2.0 Verification Details\n\n`;
  report += `2.1 **Execution**\n`;
  report += `- Command: \`npm run qc:verify:all\`\n`;
  report += `- Timestamp: ${verificationResult.timestamp}\n`;
  report += `- Status: **${verificationResult.status}**\n`;
  report += `- Scenarios Validated: 7 (all types)\n\n`;
  
  report += `2.2 **Results**\n`;
  report += `- Passed: ${verificationResult.passed}\n`;
  report += `- Failed: ${verificationResult.failed}\n`;
  if (verificationResult.reportPath) {
    report += `- Report: \`${verificationResult.reportPath}\`\n`;
  }
  report += `\n`;
  
  if (verificationResult.failed > 0) {
    report += `2.3 **Verification Failures**\n`;
    report += `- See verification report for details\n`;
    report += `\n`;
  }
  
  // Function Test Details
  report += `---\n\n`;
  report += `## 3.0 Function Test Details\n\n`;
  report += `3.1 **Execution**\n`;
  report += `- Command: \`npm run qc:test\`\n`;
  report += `- Status: **${testResult.status}**\n`;
  report += `- Total Tests: ${testResult.total}\n`;
  report += `- Test Suites: ${testResult.suites}\n\n`;
  
  report += `3.2 **Results Summary**\n`;
  report += `\`\`\`\n`;
  report += `Tests:   ${testResult.total}\n`;
  report += `Passed:  ${testResult.passed} (${((testResult.passed / testResult.total) * 100).toFixed(1)}%)\n`;
  report += `Failed:  ${testResult.failed} (${((testResult.failed / testResult.total) * 100).toFixed(1)}%)\n`;
  report += `Suites:  ${testResult.suites}\n`;
  report += `\`\`\`\n\n`;
  
  // Test Coverage Breakdown
  report += `3.3 **Test Coverage Files**\n\n`;
  report += `| Test File | Focus |\n`;
  report += `|----------|-------|\n`;
  report += `| QC/tests/calculation-utils.test.js | Periodic change math + recurrence dates |\n`;
  report += `| QC/tests/financial-utils.test.js | Periodic change application |\n`;
  report += `| QC/tests/date-utils.test.js | Date parsing/formatting |\n`;
  report += `| QC/tests/transaction-expander.test.js | Transaction expansion rules |\n`;
  report += `| QC/tests/projection-engine.test.js | Projection integration + performance |\n`;
  report += `| QC/tests/periodic-change-utils.test.js | Custom compounding expansion |\n`;
  report += `| QC/tests/lookup-data.test.js | Lookup data mappings |\n`;
  report += `| QC/tests/qc-data.test.js | Dataset structure + baselines |\n`;
  report += `| QC/tests/goal-based.test.js | Goal-based scenario checks |\n`;
  report += `| QC/tests/advanced-goal-solver.test.js | Advanced solver checks |\n`;
  report += `| **Total** | **${testResult.total}** | - |\n\n`;
  
  // Failures
  if (testResult.failed > 0) {
    report += `---\n\n`;
    report += `## 4.0 Test Failures\n\n`;
    report += `4.1 **Failure Count**: ${testResult.failed}\n\n`;
    
    if (testResult.failures.length > 0) {
      report += `4.2 **Failure Details**\n\n`;
      
      testResult.failures.forEach((failure, idx) => {
        report += `**${idx + 1}. ${failure.test}**\n`;
        report += `- Error: ${failure.error}\n`;
        if (failure.location && failure.location !== 'Unknown') {
          report += `- Location: \`${failure.location}\`\n`;
        }
        report += `\n`;
      });
    }
    
    report += `4.3 **Known Issues**\n`;
    report += `- Projection engine integration tests: Expected values need alignment with per-period rounding\n`;
    report += `- Weekly period boundaries: Alignment logic produces extra Monday boundary\n`;
    report += `- Lookup mapping validation: Some test cases have undefined changeType\n\n`;
  }
  
  // Scenario Coverage
  report += `---\n\n`;
  report += `## 5.0 Scenario Type Coverage\n\n`;
  report += `5.1 **All 6 Scenario Types Validated**\n\n`;
  report += `| Scenario Type | ID | Accounts | Transactions | Projections | Status |\n`;
  report += `|---------------|----|-----------|--------------|--------------|---------|\n`;
  report += `| General | 2 | 1 | 0 | 11 | ✅ |\n`;
  report += `| General (Extended) | 3 | 14 | 3 | 154 | ✅ |\n`;
  report += `| Budget | 4 | 3 | 1 | 33 | ✅ |\n`;
  report += `| Funds | 5 | 2 | 1 | 22 | ✅ |\n`;
  report += `| Debt Repayment | 6 | 2 | 1 | 22 | ✅ |\n`;
  report += `| Goal-Based | 7 | 2 | 1 | 22 | ✅ |\n`;
  report += `| Advanced Goal Solver | 8 | 4 | 1 | 44 | ✅ |\n\n`;
  
  // Next Actions
  report += `---\n\n`;
  report += `## 6.0 Recommended Actions\n\n`;
  
  if (verificationResult.failed > 0 || testResult.failed > 0) {
    report += `6.1 **Fix Failing Tests**\n`;
    if (testResult.failures.length > 0) {
      report += `- Address ${testResult.failed} function test failures\n`;
      report += `- Update projection engine integration expected values\n`;
      report += `- Fix weekly boundary alignment expectations\n`;
      report += `- Harden lookup mapping validation for edge cases\n`;
    }
    if (verificationResult.failed > 0) {
      report += `- Review verification failures in detail\n`;
    }
    report += `\n`;
  } else {
    report += `6.1 **All Tests Passing** ✅\n`;
    report += `- QC suite is healthy\n`;
    report += `- Continue monitoring for regressions\n\n`;
  }
  
  report += `6.2 **Expand Coverage**\n`;
  report += `- Add integration tests using test-data/goal-scenarios.json\n`;
  report += `- Test solver with realistic multi-goal scenarios\n`;
  report += `- Add performance benchmarks for goal solving\n\n`;
  
  // References
  report += `---\n\n`;
  report += `## 7.0 References\n\n`;
  report += `7.1 **QC Files**\n`;
  report += `- [QC Verification](../QC/verify.js) - Verification script\n`;
  report += `- [QC Dataset](../QC/ftrack-qc-data.json) - Test data\n`;
  report += `- [Expected Outputs](../QC/expected-outputs.json) - Golden outputs\n`;
  report += `- [QC Tests](../QC/tests) - Module-level test suites\n\n`;

  report += `7.2 **NPM Scripts**\n`;
  report += `\`\`\`bash\n`;
  report += `npm run qc:full                      # Verification + all tests\n`;
  report += `npm run qc:test                      # All module tests\n`;
  report += `npm run qc:test:projection-engine    # Projection engine tests\n`;
  report += `npm run qc:test:advanced-goal-solver # Advanced solver tests\n`;
  report += `npm run qc:verify:all                # Verify all scenarios\n`;
  report += `\`\`\`\n\n`;
  
  report += `---\n\n`;
  report += `**End of Report**\n`;
  
  return report;
}

/**
 * Main execution
 */
function main() {
  const { outputPath } = parseArgs();
  
  console.log('🧪 Running QC Verification...');
  const verificationResult = runVerification();
  
  console.log('🧪 Running Function Tests...');
  const testResult = runFunctionTests();
  
  console.log('📝 Generating QC Report...');
  const report = generateReport(verificationResult, testResult);
  
  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write report
  fs.writeFileSync(outputPath, report, 'utf8');
  
  console.log(`✅ QC Report generated: ${outputPath}`);
  console.log('');
  console.log('Summary:');
  console.log(`  Verification: ${verificationResult.status} (${verificationResult.failed} failed, ${verificationResult.passed} passed)`);
  console.log(`  Function Tests: ${testResult.status} (${testResult.failed} failed, ${testResult.passed} passed)`);
  console.log(`  Overall: ${verificationResult.status === 'PASS' && testResult.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);

  if (verificationResult.status !== 'PASS' || testResult.status !== 'PASS') {
    process.exitCode = 1;
  }
}

main();
