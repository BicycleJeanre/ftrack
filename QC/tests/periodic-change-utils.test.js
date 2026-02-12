const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const { getLookupData, loadCoreModules } = require('./helpers');

const lookupData = getLookupData();
let periodicChangeUtils;

before(async () => {
  ({ periodicChangeUtils } = await loadCoreModules());
});

describe('Periodic Change Utils - Custom Compounding', () => {
  it('preserves custom compounding settings during expansion', () => {
    const periodicChange = {
      value: 6,
      changeMode: 1,
      changeType: 7,
      customCompounding: {
        period: 2,
        frequency: 12
      }
    };

    const expanded = periodicChangeUtils.expandPeriodicChangeForCalculation(periodicChange, lookupData);
    assert.ok(expanded, 'Expected expanded periodic change');
    assert.deepStrictEqual(expanded.customCompounding, { period: 2, frequency: 12 });
  });
});
