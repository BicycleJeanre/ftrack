const { describe, it } = require('node:test');
const assert = require('node:assert');

const { getExpectedOutputs, getLookupData } = require('./helpers');

const expectedOutputs = getExpectedOutputs();
const lookupData = getLookupData();

describe('Lookup Data Mappings', () => {
  it('contains ids referenced by periodic change tests', () => {
    const changeModeIds = new Set(lookupData.changeModes.map((mode) => mode.id));
    const changeTypeIds = new Set(lookupData.periodicChangeTypes.map((type) => type.id));
    const ratePeriodIds = new Set(lookupData.ratePeriods.map((period) => period.id));
    const frequencyIds = new Set(lookupData.frequencies.map((frequency) => frequency.id));

    const checkPeriodicChange = (periodicChange) => {
      if (!periodicChange) return;
      const modeId = periodicChange.changeMode?.id ?? periodicChange.changeMode;
      const typeId = periodicChange.changeType?.id ?? periodicChange.changeType;

      assert.ok(changeModeIds.has(modeId), `Missing changeMode id ${modeId}`);
      assert.ok(changeTypeIds.has(typeId), `Missing changeType id ${typeId}`);

      if (periodicChange.ratePeriod) {
        const ratePeriodId = periodicChange.ratePeriod?.id ?? periodicChange.ratePeriod;
        assert.ok(ratePeriodIds.has(ratePeriodId), `Missing ratePeriod id ${ratePeriodId}`);
      }

      if (periodicChange.frequency) {
        const frequencyId = periodicChange.frequency?.id ?? periodicChange.frequency;
        assert.ok(frequencyIds.has(frequencyId), `Missing frequency id ${frequencyId}`);
      }
    };

    expectedOutputs.functionTests.periodicChange.forEach((testCase) => {
      checkPeriodicChange(testCase.periodicChange);
    });

    expectedOutputs.functionTests.applyPeriodicChangeAccounts.forEach((testCase) => {
      checkPeriodicChange(testCase.periodicChange);
    });

    expectedOutputs.functionTests.applyPeriodicChangeTransactions.forEach((testCase) => {
      checkPeriodicChange(testCase.periodicChange);
    });
  });
});
