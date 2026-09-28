import test from 'node:test';
import assert from 'node:assert/strict';

const { resolveScenarioOccurrences } = await import(
  '../../js/domain/queries/resolve-scenario-occurrences.js'
);

function makeAccount(id, name, typeId = 1) {
  return {
    id,
    name,
    type: { id: typeId, name: typeId === 4 ? 'Income' : (typeId === 5 ? 'Expense' : 'Asset') },
    startingBalance: 0,
    openDate: '2026-01-01'
  };
}

function makeScenario(overrides = {}) {
  return {
    id: 1,
    accounts: [
      makeAccount(1, 'Checking'),
      makeAccount(2, 'Loan'),
      makeAccount(3, 'Expense', 5),
      makeAccount(4, 'Income', 4)
    ],
    transactions: [],
    transactionOccurrences: [],
    splitTransactionSets: [],
    ...overrides
  };
}

function makePlannedRule(overrides = {}) {
  return {
    id: 10,
    primaryAccountId: 1,
    secondaryAccountId: 3,
    transactionTypeId: 2,
    amount: 100,
    effectiveDate: '2026-01-15',
    description: 'Monthly expense',
    recurrence: {
      recurrenceType: 4,
      startDate: '2026-01-15',
      endDate: null,
      interval: 1,
      dayOfMonth: 15
    },
    periodicChange: null,
    status: { name: 'planned', actualAmount: null, actualDate: null },
    tags: ['household'],
    ...overrides
  };
}

function makeStoredOccurrence(overrides = {}) {
  return {
    id: 100,
    sourceTransactionId: 10,
    primaryAccountId: 1,
    secondaryAccountId: 3,
    transactionTypeId: 2,
    amount: 100,
    description: 'Monthly expense',
    recurrenceDescription: 'Monthly',
    occurrenceDate: '2026-01-15',
    periodicChange: null,
    status: { name: 'planned', actualAmount: null, actualDate: null },
    tags: ['household'],
    ...overrides
  };
}

function resolve(scenario, {
  startDate = '2026-01-01',
  endDate = '2026-01-31',
  asOfDate = '2026-01-01'
} = {}) {
  return resolveScenarioOccurrences({ scenario, startDate, endDate, asOfDate });
}

function diagnosticText(diagnostic) {
  return `${diagnostic?.code || ''} ${diagnostic?.message || ''}`.toLowerCase();
}

test('recurrence expansion uses anchor-stable dates and occurrence keys across overlapping windows', () => {
  const scenario = makeScenario({
    transactions: [
      makePlannedRule({
        recurrence: {
          recurrenceType: 2,
          startDate: '2026-01-01',
          endDate: null,
          interval: 2
        },
        effectiveDate: '2026-01-01'
      })
    ]
  });

  const wide = resolve(scenario, {
    startDate: '2026-01-01',
    endDate: '2026-01-07',
    asOfDate: '2026-01-01'
  });
  const narrow = resolve(scenario, {
    startDate: '2026-01-02',
    endDate: '2026-01-06',
    asOfDate: '2026-01-02'
  });

  assert.deepEqual(
    wide.occurrences.map((row) => row.scheduledDate),
    ['2026-01-01', '2026-01-03', '2026-01-05', '2026-01-07']
  );
  assert.deepEqual(
    narrow.occurrences.map((row) => row.scheduledDate),
    ['2026-01-03', '2026-01-05']
  );
  assert.deepEqual(
    narrow.occurrences.map((row) => row.occurrenceKey),
    [
      'tx:10|date:2026-01-03|role:none',
      'tx:10|date:2026-01-05|role:none'
    ]
  );
  assert.deepEqual(
    narrow.occurrences.map((row) => row.occurrenceKey),
    wide.occurrences
      .filter((row) => row.scheduledDate === '2026-01-03' || row.scheduledDate === '2026-01-05')
      .map((row) => row.occurrenceKey)
  );
});

test('schemaVersion 44 rules without legacy status expand as planned occurrences', () => {
  const transaction = makePlannedRule({
    id: 12,
    effectiveDate: '2026-01-15',
    recurrence: null
  });
  delete transaction.status;
  const scenario = makeScenario({ transactions: [transaction] });

  const { occurrences } = resolveScenarioOccurrences({
    scenario,
    startDate: '2026-01-01',
    endDate: '2026-01-31'
  });

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].sourceTransactionId, 12);
  assert.equal(occurrences[0].status, 'planned');
});

test('a linked planned occurrence overlays one generated occurrence without duplicating it', () => {
  const scenario = makeScenario({
    transactions: [makePlannedRule()],
    transactionOccurrences: [
      makeStoredOccurrence({
        amount: 125,
        description: 'Adjusted monthly expense',
        tags: ['adjusted']
      })
    ]
  });

  const { occurrences, diagnostics } = resolve(scenario);

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].occurrenceKey, 'tx:10|date:2026-01-15|role:none');
  assert.equal(occurrences[0].sourceTransactionId, 10);
  assert.equal(occurrences[0].sourceOccurrenceId, 100);
  assert.equal(occurrences[0].hasStoredOverride, true);
  assert.equal(occurrences[0].generatedAmount, 100);
  assert.equal(occurrences[0].plannedAmount, 125);
  assert.equal(occurrences[0].description, 'Adjusted monthly expense');
  assert.deepEqual(occurrences[0].tags, ['adjusted']);
  assert.deepEqual(diagnostics, []);
});

test('an untouched generated snapshot inherits later rule changes', () => {
  const scenario = makeScenario({
    transactions: [
      makePlannedRule({
        amount: 140,
        description: 'Updated source rule'
      })
    ],
    transactionOccurrences: [
      makeStoredOccurrence({
        amount: 100,
        plannedAmount: 100,
        description: 'Old generated snapshot',
        origin: 'generated',
        isOverride: false
      })
    ]
  });

  const { occurrences } = resolve(scenario);

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].sourceOccurrenceId, 100);
  assert.equal(occurrences[0].hasPlanOverride, false);
  assert.equal(occurrences[0].plannedAmount, 140);
  assert.equal(occurrences[0].description, 'Updated source rule');
});

test('an untouched generated snapshot does not survive a rule schedule change as an orphan', () => {
  const scenario = makeScenario({
    transactions: [
      makePlannedRule({
        effectiveDate: '2026-01-20',
        recurrence: {
          recurrenceType: 4,
          startDate: '2026-01-20',
          endDate: null,
          interval: 1,
          dayOfMonth: 20
        }
      })
    ],
    transactionOccurrences: [
      makeStoredOccurrence({
        amount: 100,
        plannedAmount: 100,
        occurrenceDate: '2026-01-15',
        scheduledDate: '2026-01-15',
        occurrenceKey: 'tx:10|date:2026-01-15|role:none',
        origin: 'generated',
        isOverride: false
      })
    ]
  });

  const { occurrences } = resolve(scenario);

  assert.deepEqual(
    occurrences.map((occurrence) => occurrence.scheduledDate),
    ['2026-01-20']
  );
  assert.equal(occurrences[0].hasStoredOverride, false);
});

test('an actual replaces its matching plan and preserves an explicit zero amount and actual date', () => {
  const scenario = makeScenario({
    transactions: [makePlannedRule()],
    transactionOccurrences: [
      makeStoredOccurrence({
        status: {
          name: 'actual',
          actualAmount: 0,
          actualDate: '2026-01-20'
        }
      })
    ]
  });

  const { occurrences } = resolve(scenario, { asOfDate: '2026-01-20' });

  assert.equal(occurrences.length, 1);
  const [actual] = occurrences;
  assert.equal(actual.occurrenceKey, 'tx:10|date:2026-01-15|role:none');
  assert.equal(actual.status, 'actual');
  assert.equal(actual.scheduledDate, '2026-01-15');
  assert.equal(actual.actualDate, '2026-01-20');
  assert.equal(actual.effectiveDate, '2026-01-20');
  assert.equal(actual.plannedAmount, 100);
  assert.equal(actual.actualAmount, 0);
  assert.equal(actual.forecastAmount, 0);
  assert.equal(actual.isIncludedInForecast, true);
});

test('a legacy actual transaction replaces its linked planned occurrence without double counting', () => {
  const scenario = makeScenario({
    transactions: [
      makePlannedRule({
        status: {
          name: 'actual',
          actualAmount: 120,
          actualDate: '2026-01-16'
        }
      })
    ],
    transactionOccurrences: [
      makeStoredOccurrence({
        amount: 100,
        plannedAmount: 100,
        scheduledDate: '2026-01-15'
      })
    ]
  });

  const { occurrences } = resolve(scenario, { asOfDate: '2026-01-16' });

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].occurrenceKey, 'tx:10|date:2026-01-15|role:none');
  assert.equal(occurrences[0].sourceOccurrenceId, 100);
  assert.equal(occurrences[0].status, 'actual');
  assert.equal(occurrences[0].plannedAmount, 100);
  assert.equal(occurrences[0].actualAmount, 120);
  assert.equal(occurrences[0].actualDate, '2026-01-16');
  assert.equal(occurrences[0].forecastAmount, 120);
});

test('a cross-period legacy actual retains its linked stored plan and baseline', () => {
  const scenario = makeScenario({
    transactions: [
      makePlannedRule({
        amount: 80,
        status: {
          name: 'actual',
          actualAmount: 120,
          actualDate: '2026-02-16'
        }
      })
    ],
    transactionOccurrences: [
      makeStoredOccurrence({
        amount: 100,
        plannedAmount: 100,
        baselineAmount: 100,
        scheduledDate: '2026-01-15'
      })
    ]
  });

  const { occurrences } = resolveScenarioOccurrences({
    scenario,
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    asOfDate: '2026-02-16'
  });

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].occurrenceKey, 'tx:10|date:2026-01-15|role:none');
  assert.equal(occurrences[0].sourceOccurrenceId, 100);
  assert.equal(occurrences[0].status, 'actual');
  assert.equal(occurrences[0].baselineAmount, 100);
  assert.equal(occurrences[0].plannedAmount, 100);
  assert.equal(occurrences[0].actualAmount, 120);
  assert.equal(occurrences[0].actualDate, '2026-02-16');
});

test('a mismatched legacy plan date cannot be rebound to a cross-period one-time actual', () => {
  const scenario = makeScenario({
    transactions: [
      makePlannedRule({
        amount: 80,
        status: {
          name: 'actual',
          actualAmount: 120,
          actualDate: '2026-02-16'
        }
      })
    ],
    transactionOccurrences: [
      makeStoredOccurrence({
        amount: 100,
        plannedAmount: 100,
        baselineAmount: 100,
        occurrenceDate: '2026-01-20'
      })
    ]
  });

  const { occurrences } = resolveScenarioOccurrences({
    scenario,
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    asOfDate: '2026-02-16'
  });

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].occurrenceKey, 'actual-tx:10');
  assert.equal(occurrences[0].status, 'actual');
  assert.equal(occurrences[0].actualAmount, 120);
});

test('an explicit source-less manual actual retains a zero baseline and is marked unplanned', () => {
  const scenario = makeScenario({
    transactionOccurrences: [
      makeStoredOccurrence({
        id: 200,
        sourceTransactionId: null,
        amount: 55,
        plannedAmount: 0,
        baselineAmount: 0,
        origin: 'manual',
        description: 'Unexpected repair',
        occurrenceDate: '2026-01-18',
        status: {
          name: 'actual',
          actualAmount: 55,
          actualDate: '2026-01-18'
        }
      })
    ]
  });

  const { occurrences } = resolve(scenario, { asOfDate: '2026-01-18' });

  assert.equal(occurrences.length, 1);
  const [actual] = occurrences;
  assert.equal(actual.occurrenceKey, 'occurrence:200');
  assert.equal(actual.sourceTransactionId, null);
  assert.equal(actual.sourceOccurrenceId, 200);
  assert.equal(actual.origin, 'manual');
  assert.equal(actual.status, 'actual');
  assert.equal(actual.baselineAmount, 0);
  assert.equal(actual.plannedAmount, 0);
  assert.equal(actual.actualAmount, 55);
  assert.equal(actual.isUnplannedActual, true);
});

test('an unfrozen manual plan derives its baseline from its current planned amount', () => {
  const scenario = makeScenario({
    transactions: [],
    transactionOccurrences: [{
      id: 201,
      sourceTransactionId: null,
      occurrenceKey: 'occurrence:201',
      scheduledDate: '2026-01-12',
      plannedDate: null,
      actualDate: null,
      baselineAmount: null,
      plannedAmount: 85,
      actualAmount: null,
      status: 'planned',
      origin: 'manual',
      primaryAccountId: 1,
      secondaryAccountId: 2,
      transactionTypeId: 2,
      description: 'Unexpected fee',
      tags: []
    }]
  });

  const { occurrences } = resolveScenarioOccurrences({
    scenario,
    startDate: '2026-01-01',
    endDate: '2026-01-31'
  });

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].baselineAmount, 85);
  assert.equal(occurrences[0].plannedAmount, 85);
});

test('skipped occurrences remain visible but are excluded from forecast input', () => {
  const scenario = makeScenario({
    transactions: [makePlannedRule()],
    transactionOccurrences: [
      makeStoredOccurrence({
        status: {
          name: 'skipped',
          actualAmount: null,
          actualDate: null
        }
      })
    ]
  });

  const { occurrences } = resolve(scenario, { asOfDate: '2026-01-20' });

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].status, 'skipped');
  assert.equal(occurrences[0].displayStatus, 'skipped');
  assert.equal(occurrences[0].plannedAmount, 100);
  assert.equal(occurrences[0].isIncludedInForecast, false);
});

test('an open past-due plan is marked overdue and forecasts at an explicit as-of date', () => {
  const scenario = makeScenario({
    transactions: [makePlannedRule()]
  });

  const { occurrences } = resolve(scenario, { asOfDate: '2026-01-20' });

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].status, 'planned');
  assert.equal(occurrences[0].displayStatus, 'overdue');
  assert.equal(occurrences[0].isOverdue, true);
  assert.equal(occurrences[0].scheduledDate, '2026-01-15');
  assert.equal(occurrences[0].forecastDate, '2026-01-20');
  assert.equal(occurrences[0].forecastAmount, 100);
  assert.equal(occurrences[0].isIncludedInForecast, true);
});

test('an explicit commitment history boundary carries an older open item into the forecast window', () => {
  const scenario = makeScenario({
    transactions: [
      makePlannedRule({
        recurrence: null,
        effectiveDate: '2026-01-15'
      })
    ]
  });

  const { occurrences } = resolveScenarioOccurrences({
    scenario,
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    asOfDate: '2026-02-10',
    openCommitmentStartDate: '2026-01-01'
  });

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].scheduledDate, '2026-01-15');
  assert.equal(occurrences[0].displayStatus, 'overdue');
  assert.equal(occurrences[0].forecastDate, '2026-02-10');
});

test('a realized occurrence remains available for its scheduled-period comparison after its actual date moves', () => {
  const scenario = makeScenario({
    transactions: [makePlannedRule()],
    transactionOccurrences: [
      makeStoredOccurrence({
        scheduledDate: '2026-01-15',
        occurrenceKey: 'tx:10|date:2026-01-15|role:none',
        status: {
          name: 'actual',
          actualAmount: 110,
          actualDate: '2026-02-02'
        }
      })
    ]
  });

  const { occurrences } = resolveScenarioOccurrences({
    scenario,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    asOfDate: '2026-02-02'
  });

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].scheduledDate, '2026-01-15');
  assert.equal(occurrences[0].actualDate, '2026-02-02');
  assert.equal(occurrences[0].status, 'actual');
});

test('duplicate planned overrides select the highest occurrence id and emit a diagnostic', () => {
  const scenario = makeScenario({
    transactions: [makePlannedRule()],
    transactionOccurrences: [
      makeStoredOccurrence({ id: 90, amount: 120 }),
      makeStoredOccurrence({ id: 100, amount: 130 })
    ]
  });

  const { occurrences, diagnostics } = resolve(scenario);

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].sourceOccurrenceId, 100);
  assert.deepEqual(occurrences[0].sourceOccurrenceIds, [90, 100]);
  assert.equal(occurrences[0].plannedAmount, 130);
  assert.ok(
    diagnostics.some((diagnostic) => diagnosticText(diagnostic).includes('duplicate')),
    'expected a duplicate-override diagnostic'
  );
});

test('a future legacy recurring row cannot hijack the sole generated occurrence in a narrower window', () => {
  const scenario = makeScenario({
    transactions: [makePlannedRule()],
    transactionOccurrences: [
      makeStoredOccurrence({
        id: 100,
        amount: 125,
        plannedAmount: 125,
        occurrenceDate: '2026-01-15'
      }),
      makeStoredOccurrence({
        id: 200,
        amount: 999,
        plannedAmount: 999,
        occurrenceDate: '2026-02-15'
      })
    ]
  });

  const { occurrences, diagnostics } = resolve(scenario);

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].scheduledDate, '2026-01-15');
  assert.equal(occurrences[0].sourceOccurrenceId, 100);
  assert.equal(occurrences[0].plannedAmount, 125);
  assert.deepEqual(diagnostics, []);
});

test('actual overrides beat higher-id planned duplicates and conflicting actuals resolve by highest actual id', () => {
  const scenario = makeScenario({
    transactions: [makePlannedRule()],
    transactionOccurrences: [
      makeStoredOccurrence({ id: 100, amount: 150 }),
      makeStoredOccurrence({
        id: 89,
        amount: 115,
        status: { name: 'actual', actualAmount: 117, actualDate: '2026-01-16' }
      }),
      makeStoredOccurrence({
        id: 91,
        amount: 125,
        status: { name: 'actual', actualAmount: 131, actualDate: '2026-01-17' }
      })
    ]
  });

  const { occurrences, diagnostics } = resolve(scenario, { asOfDate: '2026-01-20' });

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].status, 'actual');
  assert.equal(occurrences[0].sourceOccurrenceId, 91);
  assert.deepEqual(occurrences[0].sourceOccurrenceIds, [89, 91, 100]);
  assert.equal(occurrences[0].plannedAmount, 125);
  assert.equal(occurrences[0].actualAmount, 131);
  assert.equal(occurrences[0].actualDate, '2026-01-17');
  assert.ok(
    diagnostics.some((diagnostic) => {
      const text = diagnosticText(diagnostic);
      return text.includes('actual') && (text.includes('conflict') || text.includes('duplicate'));
    }),
    'expected a conflicting-actual diagnostic'
  );
});

test('split-set components produce distinct role-qualified occurrences', () => {
  const scenario = makeScenario({
    transactions: [
      makePlannedRule({
        id: 20,
        amount: 800,
        effectiveDate: '2026-01-10',
        recurrence: null,
        description: 'Loan payment',
        secondaryAccountId: 2,
        transactionGroupId: 'split-1',
        transactionGroupRole: 'principal'
      })
    ],
    splitTransactionSets: [
      {
        id: 'split-1',
        description: 'Loan payment',
        payingAccountId: 1,
        effectiveDate: '2026-01-10',
        strategy: 'manual',
        totalAmount: 1000,
        components: [
          {
            role: 'principal',
            accountId: 2,
            transactionTypeId: 2,
            accountGroupId: 20,
            value: 800,
            amountMode: 'remainder'
          },
          {
            role: 'interest',
            accountId: 3,
            transactionTypeId: 2,
            accountGroupId: 30,
            value: 200,
            amountMode: 'fixed'
          }
        ]
      }
    ]
  });

  const { occurrences } = resolve(scenario);

  assert.deepEqual(
    occurrences.map((row) => row.occurrenceKey),
    [
      'tx:20|date:2026-01-10|role:interest',
      'tx:20|date:2026-01-10|role:principal'
    ]
  );

  const principal = occurrences.find((row) => row.transactionGroupRole === 'principal');
  const interest = occurrences.find((row) => row.transactionGroupRole === 'interest');
  assert.equal(principal.transactionGroupId, 'split-1');
  assert.equal(principal.transactionGroupAccountGroupId, 20);
  assert.equal(principal.plannedAmount, 800);
  assert.equal(interest.transactionGroupId, 'split-1');
  assert.equal(interest.transactionGroupAccountGroupId, 30);
  assert.equal(interest.plannedAmount, 200);
});

test('an invalid legacy occurrence date is not silently shifted into the requested window', () => {
  const scenario = makeScenario({
    transactionOccurrences: [
      makeStoredOccurrence({
        id: 300,
        sourceTransactionId: null,
        occurrenceDate: '2026-02-31'
      })
    ]
  });

  const { occurrences, diagnostics } = resolve(scenario, {
    startDate: '2026-02-01',
    endDate: '2026-03-31',
    asOfDate: '2026-02-01'
  });

  assert.deepEqual(occurrences, []);
  assert.ok(
    diagnostics.some((diagnostic) => {
      const text = diagnosticText(diagnostic);
      return text.includes('date') && text.includes('invalid');
    }),
    'expected an invalid-date diagnostic'
  );
});

test('invalid explicit amounts are diagnosed and excluded', () => {
  const scenario = makeScenario({
    transactionOccurrences: [
      makeStoredOccurrence({
        id: 301,
        sourceTransactionId: null,
        plannedAmount: 'not-a-number'
      })
    ]
  });

  const { occurrences, diagnostics } = resolve(scenario);

  assert.deepEqual(occurrences, []);
  assert.ok(
    diagnostics.some((diagnostic) => diagnostic.code === 'invalid-occurrence-amount'),
    'expected an invalid-amount diagnostic'
  );
});

test('resolution is deterministic, sorted, and does not mutate scenario data', () => {
  const scenario = makeScenario({
    transactions: [
      makePlannedRule({
        id: 11,
        effectiveDate: '2026-01-25',
        recurrence: {
          recurrenceType: 4,
          startDate: '2026-01-25',
          endDate: null,
          interval: 1,
          dayOfMonth: 25
        },
        description: 'Later item'
      }),
      makePlannedRule({
        id: 10,
        effectiveDate: '2026-01-05',
        recurrence: null,
        description: 'Earlier item'
      })
    ],
    transactionOccurrences: [
      makeStoredOccurrence({
        id: 201,
        sourceTransactionId: null,
        occurrenceDate: '2026-01-15',
        description: 'Middle item'
      })
    ]
  });
  const before = structuredClone(scenario);

  const first = resolve(scenario, { asOfDate: '2026-01-01' });
  const second = resolve(scenario, { asOfDate: '2026-01-01' });

  assert.deepEqual(first, second);
  assert.deepEqual(scenario, before);
  assert.deepEqual(
    first.occurrences.map((row) => row.effectiveDate),
    ['2026-01-05', '2026-01-15', '2026-01-25']
  );

  first.occurrences[0].tags.push('output-only');
  first.occurrences.find((row) => row.recurrence).recurrence.interval = 99;
  assert.deepEqual(scenario, before);
});
