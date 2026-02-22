#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TODAY = new Date().toISOString().split('T')[0];
const OUTPUT_DEFAULT = path.join(__dirname, 'reports', `qc-report-${TODAY}.md`);

const WORKFLOW_RUNNERS = [
  {
    workflow: 'Budget',
    command: 'node QC/tests/scenario-types/budget.test.js'
  },
  {
    workflow: 'General',
    command: 'node QC/tests/scenario-types/general.test.js'
  },
  {
    workflow: 'Funds',
    command: 'node QC/tests/scenario-types/funds.test.js'
  },
  {
    workflow: 'Debt Repayment',
    command: 'node QC/tests/scenario-types/debt-repayment.test.js'
  },
  {
    workflow: 'Goal-Based',
    command: 'node QC/tests/scenario-types/goal-based.test.js'
  },
  {
    workflow: 'Advanced Goal Solver',
    command: 'node QC/tests/scenario-types/advanced-goal-solver.test.js'
  }
];

function parseArgs() {
  const args = process.argv.slice(2);
  let outputPath = OUTPUT_DEFAULT;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--output' || args[i] === '-o') {
      outputPath = args[i + 1];
      i += 1;
    }
  }

  return { outputPath };
}

function extractJsonObjectFromText(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not find JSON payload in scenario test output');
  }

  const jsonString = text.slice(start, end + 1);
  return JSON.parse(jsonString);
}

function runWorkflowScript({ workflow, command }) {
  try {
    const stdout = execSync(command, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024
    });

    return {
      workflow,
      command,
      passed: true,
      result: extractJsonObjectFromText(stdout),
      rawOutput: stdout
    };
  } catch (error) {
    const stdout = error.stdout ? error.stdout.toString() : '';
    const stderr = error.stderr ? error.stderr.toString() : '';
    const combined = `${stdout}\n${stderr}`.trim();

    let parsedResult = null;
    try {
      parsedResult = extractJsonObjectFromText(combined);
    } catch {
      parsedResult = null;
    }

    return {
      workflow,
      command,
      passed: false,
      result: parsedResult,
      rawOutput: combined,
      errorMessage: error.message
    };
  }
}

function formatMismatch(mismatch) {
  const details = [];
  if (mismatch.path) details.push(`path=${mismatch.path}`);
  if (mismatch.check) details.push(`check=${mismatch.check}`);
  if (mismatch.expected !== undefined) details.push(`expected=${JSON.stringify(mismatch.expected)}`);
  if (mismatch.actual !== undefined) details.push(`actual=${JSON.stringify(mismatch.actual)}`);
  if (mismatch.message) details.push(`message=${mismatch.message}`);
  return details.join(' | ');
}

function summarizeScenarioRun(run) {
  const result = run.result || {};
  const comparison = result.comparison || {};
  const universal = Array.isArray(result.universal) ? result.universal : [];

  const universalChecks = universal.reduce((sum, item) => sum + (item.checkCount || 0), 0);
  const universalMismatches = universal.reduce((sum, item) => sum + (item.mismatchCount || 0), 0);

  return {
    workflow: run.workflow,
    command: run.command,
    passed: Boolean(result.passed) && run.passed,
    checkedScenarioCount: comparison.checkedScenarioCount || 0,
    checkedUseCaseCount: comparison.checkedUseCaseCount || 0,
    comparisonMismatchCount: comparison.mismatchCount || 0,
    universalChecks,
    universalMismatches,
    universal,
    comparisonMismatches: Array.isArray(comparison.mismatches) ? comparison.mismatches : [],
    rawOutput: run.rawOutput,
    parseFailed: !run.result
  };
}

function generateReport(runSummaries) {
  const generatedAt = new Date().toISOString();
  const failedRuns = runSummaries.filter((run) => !run.passed);
  const passedRuns = runSummaries.length - failedRuns.length;
  const overallPassed = failedRuns.length === 0;

  const totalCheckedScenarios = runSummaries.reduce((sum, run) => sum + run.checkedScenarioCount, 0);
  const totalCheckedUseCases = runSummaries.reduce((sum, run) => sum + run.checkedUseCaseCount, 0);
  const totalUniversalChecks = runSummaries.reduce((sum, run) => sum + run.universalChecks, 0);
  const totalMismatches = runSummaries.reduce(
    (sum, run) => sum + run.comparisonMismatchCount + run.universalMismatches,
    0
  );

  let markdown = '';
  markdown += `# QC Report - ${TODAY}\n\n`;
  markdown += `**Generated**: ${generatedAt}\n`;
  markdown += `**Overall Status**: ${overallPassed ? '✅ PASS' : '❌ FAIL'}\n\n`;

  markdown += `## 1.0 Summary\n\n`;
  markdown += `- Workflow runs: ${runSummaries.length}\n`;
  markdown += `- Passed: ${passedRuns}\n`;
  markdown += `- Failed: ${failedRuns.length}\n`;
  markdown += `- Checked scenarios: ${totalCheckedScenarios}\n`;
  markdown += `- Checked use cases: ${totalCheckedUseCases}\n`;
  markdown += `- Universal checks: ${totalUniversalChecks}\n`;
  markdown += `- Total mismatches: ${totalMismatches}\n\n`;

  markdown += `## 2.0 Workflow Results\n\n`;
  markdown += `| Workflow | Status | Checked Scenarios | Checked Use Cases | Universal Checks | Mismatches |\n`;
  markdown += `|---|---|---:|---:|---:|---:|\n`;

  runSummaries.forEach((run) => {
    const rowMismatchCount = run.comparisonMismatchCount + run.universalMismatches;
    markdown += `| ${run.workflow} | ${run.passed ? '✅ PASS' : '❌ FAIL'} | ${run.checkedScenarioCount} | ${run.checkedUseCaseCount} | ${run.universalChecks} | ${rowMismatchCount} |\n`;
  });

  markdown += `\n## 3.0 Failure Details\n\n`;
  if (failedRuns.length === 0) {
    markdown += `- No mismatches found across all scenario-type QC runs.\n\n`;
  } else {
    failedRuns.forEach((run, index) => {
      markdown += `### 3.${index + 1} ${run.workflow}\n\n`;
      markdown += `- Command: \`${run.command}\`\n`;
      markdown += `- Comparison mismatches: ${run.comparisonMismatchCount}\n`;
      markdown += `- Universal mismatches: ${run.universalMismatches}\n`;

      if (run.parseFailed) {
        markdown += `- Unable to parse JSON output for this run.\n`;
        markdown += `\n\`\`\`\n${run.rawOutput}\n\`\`\`\n\n`;
        return;
      }

      if (run.comparisonMismatches.length > 0) {
        markdown += `\n**Comparison Mismatches**\n`;
        run.comparisonMismatches.forEach((mismatch) => {
          markdown += `- ${formatMismatch(mismatch)}\n`;
        });
      }

      const universalMismatchRows = run.universal
        .flatMap((item) => (Array.isArray(item.mismatches) ? item.mismatches : []));

      if (universalMismatchRows.length > 0) {
        markdown += `\n**Universal Mismatches**\n`;
        universalMismatchRows.forEach((mismatch) => {
          markdown += `- ${formatMismatch(mismatch)}\n`;
        });
      }

      markdown += '\n';
    });
  }

  markdown += `## 4.0 Commands Used\n\n`;
  WORKFLOW_RUNNERS.forEach((runner) => {
    markdown += `- \`${runner.command}\`\n`;
  });
  markdown += '\n';

  return {
    markdown,
    overallPassed,
    failedRuns: failedRuns.length,
    passedRuns
  };
}

function ensureOutputDirectory(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function main() {
  const { outputPath } = parseArgs();

  const runSummaries = WORKFLOW_RUNNERS
    .map(runWorkflowScript)
    .map(summarizeScenarioRun);

  const { markdown, overallPassed, failedRuns, passedRuns } = generateReport(runSummaries);
  ensureOutputDirectory(outputPath);
  fs.writeFileSync(outputPath, markdown, 'utf8');

  console.log(`QC report generated: ${outputPath}`);
  console.log(`Scenario-type runs: ${runSummaries.length}`);
  console.log(`Passed: ${passedRuns}`);
  console.log(`Failed: ${failedRuns}`);
  console.log(`Overall: ${overallPassed ? 'PASS' : 'FAIL'}`);

  if (!overallPassed) {
    process.exitCode = 1;
  }
}

main();
