const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { _: [] };
  argv.forEach((arg) => {
    if (!arg.startsWith('--')) {
      args._.push(arg);
      return;
    }
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (value === undefined) {
      args[key] = true;
    } else {
      args[key] = value;
    }
  });
  return args;
}

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function isValidDate(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

function pickExistingPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveAccountKey(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object') {
    if (value.id !== undefined) {
      return value.id;
    }
    if (value.name !== undefined) {
      return value.name;
    }
  }
  return null;
}

function toIdSet(list) {
  if (!Array.isArray(list)) {
    return new Set();
  }
  return new Set(list.map((item) => item && item.id).filter((id) => id !== undefined));
}

function toNameSet(list) {
  if (!Array.isArray(list)) {
    return new Set();
  }
  return new Set(list.map((item) => item && item.name).filter((name) => name));
}

function recordCheck(report, status, id, message, details) {
  report.checks.push({ status, id, message, details: details || null });
  if (status === 'pass') {
    report.summary.passed += 1;
  } else {
    report.summary.failed += 1;
  }
}

function compareWithTolerance(actual, expected, tolerance) {
  if (!tolerance) {
    return actual === expected;
  }
  return Math.abs(actual - expected) <= tolerance;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function validateAgainstExpected(scenario, expectedOutputs, report) {
  const label = `scenario-${scenario.id}-expected`;
  const expected = expectedOutputs.scenarios.find(s => s.id === scenario.id);
  
  if (!expected) {
    return; // No expected outputs defined for this scenario
  }
  
  const exp = expected.expectedOutputs;
  const errors = [];

  const accounts = ensureArray(scenario.accounts);
  const transactions = ensureArray(scenario.transactions);
  const projections = ensureArray(scenario.projections);
  const budgets = ensureArray(scenario.budgets);
  
  // Validate counts
  if (accounts.length !== exp.accountCount) {
    errors.push(`Account count: expected ${exp.accountCount}, got ${accounts.length}`);
  }
  if (transactions.length !== exp.transactionCount) {
    errors.push(`Transaction count: expected ${exp.transactionCount}, got ${transactions.length}`);
  }
  if (projections.length !== exp.projectionCount) {
    errors.push(`Projection count: expected ${exp.projectionCount}, got ${projections.length}`);
  }
  if (budgets.length !== exp.budgetCount) {
    errors.push(`Budget count: expected ${exp.budgetCount}, got ${budgets.length}`);
  }
  
  // Validate first projection
  if (exp.firstProjection && projections.length > 0) {
    const first = projections[0];
    const expFirst = exp.firstProjection;
    
    if (first.date !== expFirst.date) {
      errors.push(`First projection date: expected ${expFirst.date}, got ${first.date}`);
    }
    if (first.accountId !== expFirst.accountId) {
      errors.push(`First projection accountId: expected ${expFirst.accountId}, got ${first.accountId}`);
    }
    
    const tolerance = expFirst.tolerance ?? 0;
    if (!compareWithTolerance(first.balance, expFirst.balance, tolerance)) {
      errors.push(`First projection balance: expected ${expFirst.balance} ± ${tolerance}, got ${first.balance}`);
    }
    
    if (expFirst.income !== undefined && first.income !== expFirst.income) {
      errors.push(`First projection income: expected ${expFirst.income}, got ${first.income}`);
    }
    if (expFirst.expenses !== undefined && first.expenses !== expFirst.expenses) {
      errors.push(`First projection expenses: expected ${expFirst.expenses}, got ${first.expenses}`);
    }
    if (expFirst.netChange !== undefined && first.netChange !== expFirst.netChange) {
      errors.push(`First projection netChange: expected ${expFirst.netChange}, got ${first.netChange}`);
    }
  }
  
  // Validate last projection
  if (exp.lastProjection && projections.length > 0) {
    const last = projections[projections.length - 1];
    const expLast = exp.lastProjection;
    
    if (last.date !== expLast.date) {
      errors.push(`Last projection date: expected ${expLast.date}, got ${last.date}`);
    }
    if (last.accountId !== expLast.accountId) {
      errors.push(`Last projection accountId: expected ${expLast.accountId}, got ${last.accountId}`);
    }
    
    const tolerance = expLast.tolerance ?? 0;
    if (!compareWithTolerance(last.balance, expLast.balance, tolerance)) {
      errors.push(`Last projection balance: expected ${expLast.balance} ± ${tolerance}, got ${last.balance}`);
    }
  }
  
  if (errors.length > 0) {
    recordCheck(report, 'fail', label, `Scenario ${scenario.name} failed expected output validation.`, errors);
  } else {
    recordCheck(report, 'pass', label, `Scenario ${scenario.name} passed expected output validation.`);
  }
}

function validateLookupConfig(lookup) {
  const errors = [];
  if (!lookup || typeof lookup !== 'object') {
    errors.push('Lookup data is not an object.');
    return errors;
  }

  const requiredArrays = [
    'scenarioTypes',
    'periodTypes',
    'accountTypes',
    'currencies',
    'periodicChangeTypes',
    'changeModes',
    'ratePeriods',
    'frequencies'
  ];

  requiredArrays.forEach((key) => {
    if (!Array.isArray(lookup[key])) {
      errors.push(`Missing lookup array: ${key}.`);
    }
  });

  return errors;
}

function validateScenario(scenario, lookup) {
  const errors = [];
  const label = `${scenario.id}:${scenario.name}`;

  if (typeof scenario.id !== 'number') {
    errors.push(`${label} missing numeric id.`);
  }
  if (typeof scenario.name !== 'string' || !scenario.name.trim()) {
    errors.push(`${label} missing name.`);
  }
  if (!scenario.type || typeof scenario.type.id !== 'number') {
    errors.push(`${label} missing scenario type id.`);
  }
  if (!scenario.type || typeof scenario.type.name !== 'string') {
    errors.push(`${label} missing scenario type name.`);
  }

  if (!isValidDate(scenario.startDate)) {
    errors.push(`${label} has invalid startDate.`);
  }
  if (!isValidDate(scenario.endDate)) {
    errors.push(`${label} has invalid endDate.`);
  }
  if (isValidDate(scenario.startDate) && isValidDate(scenario.endDate)) {
    const start = new Date(scenario.startDate).getTime();
    const end = new Date(scenario.endDate).getTime();
    if (start > end) {
      errors.push(`${label} startDate is after endDate.`);
    }
  }

  const scenarioTypeIds = toIdSet(lookup.scenarioTypes);
  if (scenario.type && scenario.type.id !== undefined && !scenarioTypeIds.has(scenario.type.id)) {
    errors.push(`${label} scenario type id not found in lookup data.`);
  }

  const periodTypeIds = toIdSet(lookup.periodTypes);
  if (!scenario.projectionPeriod || typeof scenario.projectionPeriod.id !== 'number') {
    errors.push(`${label} missing projectionPeriod id.`);
  } else if (!periodTypeIds.has(scenario.projectionPeriod.id)) {
    errors.push(`${label} projectionPeriod id not found in lookup data.`);
  }

  if (!Array.isArray(scenario.accounts)) {
    errors.push(`${label} accounts is not an array.`);
  }
  if (!Array.isArray(scenario.transactions)) {
    errors.push(`${label} transactions is not an array.`);
  }
  if (!Array.isArray(scenario.projections)) {
    errors.push(`${label} projections is not an array.`);
  }

  const accountTypeIds = toIdSet(lookup.accountTypes);
  const changeModeIds = toIdSet(lookup.changeModes);
  const changeTypeIds = toIdSet(lookup.periodicChangeTypes);
  const frequencyIds = toIdSet(lookup.frequencies);
  const currencyIds = toIdSet(lookup.currencies);
  const currencyNames = toNameSet(lookup.currencies);

  const accountIdSet = new Set();
  const accountNameSet = new Set();

  if (Array.isArray(scenario.accounts)) {
    scenario.accounts.forEach((account) => {
      if (typeof account.id !== 'number') {
        errors.push(`${label} account missing numeric id.`);
      } else if (accountIdSet.has(account.id)) {
        errors.push(`${label} duplicate account id ${account.id}.`);
      } else {
        accountIdSet.add(account.id);
      }

      if (typeof account.name !== 'string' || !account.name.trim()) {
        errors.push(`${label} account ${account.id || '?'} missing name.`);
      } else {
        accountNameSet.add(account.name);
      }

      if (!account.type || typeof account.type.id !== 'number') {
        errors.push(`${label} account ${account.name || account.id || '?'} missing type id.`);
      } else if (!accountTypeIds.has(account.type.id)) {
        errors.push(`${label} account ${account.name || account.id || '?'} type id not in lookup data.`);
      }

      if (account.currency !== null && account.currency !== undefined) {
        const currencyKey = resolveAccountKey(account.currency);
        if (typeof currencyKey === 'number' && !currencyIds.has(currencyKey)) {
          errors.push(`${label} account ${account.name || account.id || '?'} currency id not in lookup data.`);
        }
        if (typeof currencyKey === 'string' && !currencyNames.has(currencyKey)) {
          errors.push(`${label} account ${account.name || account.id || '?'} currency name not in lookup data.`);
        }
      }

      if (account.periodicChange) {
        const { changeMode, changeType, frequency } = account.periodicChange;
        if (typeof changeMode !== 'number' || !changeModeIds.has(changeMode)) {
          errors.push(`${label} account ${account.name || account.id || '?'} invalid changeMode.`);
        }
        if (typeof changeType !== 'number' || !changeTypeIds.has(changeType)) {
          errors.push(`${label} account ${account.name || account.id || '?'} invalid changeType.`);
        }
        if (frequency !== undefined && !frequencyIds.has(frequency)) {
          errors.push(`${label} account ${account.name || account.id || '?'} frequency not in lookup data.`);
        }
      }
    });
  }

  if (Array.isArray(scenario.transactions)) {
    scenario.transactions.forEach((tx) => {
      const primaryKey = resolveAccountKey(tx.primaryAccount);
      if (primaryKey !== null && !accountIdSet.has(primaryKey) && !accountNameSet.has(primaryKey)) {
        errors.push(`${label} transaction primaryAccount not found.`);
      }
      const secondaryKey = resolveAccountKey(tx.secondaryAccount);
      if (secondaryKey !== null && !accountIdSet.has(secondaryKey) && !accountNameSet.has(secondaryKey)) {
        errors.push(`${label} transaction secondaryAccount not found.`);
      }
    });
  }

  if (Array.isArray(scenario.projections)) {
    scenario.projections.forEach((projection) => {
      if (projection.scenarioId !== undefined && projection.scenarioId !== scenario.id) {
        errors.push(`${label} projection scenarioId mismatch.`);
      }
      if (typeof projection.accountId === 'number' && !accountIdSet.has(projection.accountId)) {
        errors.push(`${label} projection accountId not found.`);
      }
      if (projection.date && !isValidDate(projection.date)) {
        errors.push(`${label} projection has invalid date.`);
      }
      if (projection.date && isValidDate(scenario.startDate) && isValidDate(scenario.endDate)) {
        const dateValue = new Date(projection.date).getTime();
        const start = new Date(scenario.startDate).getTime();
        const end = new Date(scenario.endDate).getTime();
        if (dateValue < start || dateValue > end) {
          errors.push(`${label} projection date outside scenario range.`);
        }
      }
    });
  }

  return errors;
}

function buildReportFileName(runId) {
  const safeStamp = runId.replace(/[:.]/g, '-');
  return `qc-report-${safeStamp}.json`;
}

function printReport(report, verbose) {
  const status = report.summary.failed > 0 ? 'FAIL' : 'PASS';
  console.log('QC Verification Report');
  console.log(`Run: ${report.runId}`);
  console.log(`Dataset: ${report.datasetPath || 'missing'}`);
  console.log(`Config: ${report.configPath || 'missing'}`);
  if (report.scenarioFilter) {
    console.log(`Scenario Filter: ${report.scenarioFilter}`);
  }
  console.log(`Status: ${status} (${report.summary.failed} failed, ${report.summary.passed} passed)`);

  if (verbose || report.summary.failed > 0) {
    report.checks.forEach((check) => {
      const prefix = check.status === 'pass' ? 'PASS' : 'FAIL';
      console.log(`${prefix}: ${check.id} - ${check.message}`);
      if (check.details && (verbose || check.status !== 'pass')) {
        check.details.forEach((detail) => console.log(`  - ${detail}`));
      }
    });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '..');

  const datasetPath = pickExistingPath([
    args.data,
    path.join(__dirname, 'ftrack-qc-data.json'),
    path.join(__dirname, 'Archive', 'ftrack-qc-data.json')
  ]);

  const configPath = pickExistingPath([
    args.config,
    path.join(repoRoot, 'assets', 'lookup-data.json')
  ]);

  const reportDir = args['report-dir']
    ? path.resolve(repoRoot, args['report-dir'])
    : path.join(__dirname, 'reports');

  const expectedOutputsPath = pickExistingPath([
    args.expected,
    path.join(__dirname, 'expected-outputs.json')
  ]);

  const report = {
    runId: new Date().toISOString(),
    datasetPath,
    configPath,
    expectedOutputsPath,
    scenarioFilter: args.all ? 'all' : args.scenario || null,
    checks: [],
    summary: { passed: 0, failed: 0 }
  };

  const shouldWriteReport = !args['no-report'];

  if (!datasetPath) {
    recordCheck(report, 'fail', 'dataset-path', 'QC dataset file not found.', [
      'Provide --data=/absolute/or/relative/path.json',
      'Expected QC/ftrack-qc-data.json or QC/Archive/ftrack-qc-data.json'
    ]);
  }

  if (!configPath) {
    recordCheck(report, 'fail', 'config-path', 'Lookup data file not found.', [
      'Provide --config=/absolute/or/relative/path.json',
      'Expected assets/lookup-data.json'
    ]);
  }

  let dataset = null;
  let lookup = null;
  let expectedOutputs = null;

  if (datasetPath) {
    try {
      dataset = loadJson(datasetPath);
      recordCheck(report, 'pass', 'dataset-load', 'QC dataset loaded.');
    } catch (error) {
      recordCheck(report, 'fail', 'dataset-load', 'Failed to load QC dataset.', [String(error.message || error)]);
    }
  }

  if (configPath) {
    try {
      lookup = loadJson(configPath);
      recordCheck(report, 'pass', 'lookup-load', 'Lookup data loaded.');
    } catch (error) {
      recordCheck(report, 'fail', 'lookup-load', 'Failed to load lookup data.', [String(error.message || error)]);
    }
  }

  if (expectedOutputsPath) {
    try {
      expectedOutputs = loadJson(expectedOutputsPath);
      recordCheck(report, 'pass', 'expected-load', 'Expected outputs loaded.');
    } catch (error) {
      recordCheck(report, 'fail', 'expected-load', 'Failed to load expected outputs.', [String(error.message || error)]);
    }
  }

  if (lookup) {
    const lookupErrors = validateLookupConfig(lookup);
    if (lookupErrors.length) {
      recordCheck(report, 'fail', 'lookup-structure', 'Lookup data missing required lists.', lookupErrors);
    } else {
      recordCheck(report, 'pass', 'lookup-structure', 'Lookup data contains required lists.');
    }
  }

  if (dataset && Array.isArray(dataset.scenarios)) {
    let scenarios = dataset.scenarios;
    if (!args.all && args.scenario) {
      const needle = String(args.scenario).toLowerCase();
      scenarios = scenarios.filter((scenario) => {
        const matchesId = String(scenario.id) === needle;
        const matchesName = (scenario.name || '').toLowerCase() === needle;
        const matchesType = (scenario.type && scenario.type.name || '').toLowerCase() === needle;
        return matchesId || matchesName || matchesType;
      });
    }

    if (!scenarios.length) {
      recordCheck(report, 'fail', 'scenario-filter', 'No scenarios matched the provided filter.', [
        'Use --all to run every scenario.',
        'Use --scenario=<id|name|type>'
      ]);
    }

    if (lookup) {
      scenarios.forEach((scenario) => {
        const errors = validateScenario(scenario, lookup);
        if (errors.length) {
          recordCheck(report, 'fail', `scenario-${scenario.id}`, `Scenario ${scenario.name} failed validation.`, errors.slice(0, 20));
        } else {
          recordCheck(report, 'pass', `scenario-${scenario.id}`, `Scenario ${scenario.name} passed validation.`);
        }
        
        // Validate against expected outputs if available
        if (expectedOutputs) {
          validateAgainstExpected(scenario, expectedOutputs, report);
        }
      });
    }
  } else if (dataset) {
    recordCheck(report, 'fail', 'dataset-structure', 'QC dataset missing scenarios array.');
  }

  if (shouldWriteReport) {
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, buildReportFileName(report.runId));
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    printReport(report, Boolean(args.verbose));
    console.log(`Report saved: ${reportPath}`);
  } else {
    printReport(report, Boolean(args.verbose));
  }

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main();
