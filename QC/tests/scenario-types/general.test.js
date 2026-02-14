const fs = require('fs');
const path = require('path');

const { loadAllQcData, getScenariosByType } = require('../../lib/load-qc-data');
const { extractActualsForScenarioType } = require('../../lib/extract-actuals');
const { compareActualsToExpected } = require('../../lib/compare-results');

const { runRecurrenceAssertions } = require('../universal/recurrence-assertions');
const { runPeriodicChangeAssertions } = require('../universal/periodic-change-assertions');
const { runDateBoundaryAssertions } = require('../universal/date-boundary-assertions');

function loadLookupData() {
  const lookupPath = path.resolve(process.cwd(), 'assets', 'lookup-data.json');
  return JSON.parse(fs.readFileSync(lookupPath, 'utf8'));
}

async function runGeneralScenarioTypeTest() {
  const scenarioType = 'General';
  const { qcInput, qcExpected, useCaseMapping } = loadAllQcData();
  const scenarios = getScenariosByType(qcInput, scenarioType);
  const lookupData = loadLookupData();

  const universalResults = [
    runRecurrenceAssertions({ scenarios }),
    runPeriodicChangeAssertions({ scenarios }),
    runDateBoundaryAssertions({ scenarios })
  ];

  const actualData = await extractActualsForScenarioType({
    scenarioType,
    qcInputData: qcInput,
    useCaseMapping,
    lookupData,
    qcExpectedData: qcExpected
  });

  const comparison = compareActualsToExpected({
    expectedData: qcExpected,
    actualData,
    scenarioType,
    options: { tolerance: 0.01 }
  });

  const universalMismatchCount = universalResults.reduce((sum, result) => sum + result.mismatchCount, 0);
  const passed = comparison.passed && universalMismatchCount === 0;

  const output = {
    scenarioType,
    passed,
    universal: universalResults,
    comparison
  };

  console.log(JSON.stringify(output, null, 2));

  if (!passed) {
    process.exitCode = 1;
  }

  return output;
}

if (require.main === module) {
  runGeneralScenarioTypeTest().catch((error) => {
    console.error('[QC][General] Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  runGeneralScenarioTypeTest
};
