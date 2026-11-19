import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runAgentEngine } from '../../js/app/services/agent-engine.js';
import { agentCatalog, AGENT_COMMANDS } from '../../js/shared/agent-command-catalog.mjs';

const fixture = () => JSON.parse(readFileSync(new URL('../../e2e/fixtures/frontend-smoke-data.json', import.meta.url)));
const lookup = readFileSync(new URL('../../assets/lookup-data.json', import.meta.url), 'utf8');
globalThis.fetch = async () => ({ text: async () => lookup });

test('every allowlisted command resolves to an existing manager, never agent-supplied code', async () => {
  const paths = { Scenario: 'managers/scenario-manager.js', Account: 'managers/account-manager.js',
    Occurrence: 'managers/occurrence-manager.js', Variant: 'managers/period-variant-manager.js',
    Statement: 'services/statement-service.js', Projection: '../domain/calculations/projection-engine.js' };
  for (const [manager, method] of Object.values(AGENT_COMMANDS)) {
    if (manager === 'Upgrade') continue;
    const module = await import(new URL('../../js/app/' + paths[manager], import.meta.url));
    assert.equal(typeof module[method], 'function', manager + '.' + method);
  }
  assert.ok(agentCatalog().commands.length > 40);
});

test('agent preparation uses canonical managers without mutating its input; invalid batches fail closed', async () => {
  const data = fixture(), original = structuredClone(data);
  const id = data.scenarios[0].id;
  const result = await runAgentEngine(data, { kind: 'prepare', operations: [
    { operation: 'reminder.create', args: [id, { note: 'Review insurance', reviewDate: '2026-12-01' }] },
    { operation: 'account.create', args: [id, { name: 'Agent-created', startingBalance: 0, openDate: '2026-01-01' }] }
  ] });
  assert.equal(result.applicable, true);
  assert.equal(result.data.scenarios[0].accounts.at(-1).name, 'Agent-created');
  assert.equal(result.data.scenarios[0].reviewReminders.at(-1).note, 'Review insurance');
  assert.deepEqual(data, original);
  await assert.rejects(() => runAgentEngine(data, { kind: 'prepare', operations: [
    { operation: 'reminder.create', args: [id, { note: 'Not committed' }] },
    { operation: 'reminder.create', args: [id, { note: '' }] }
  ] }));
  assert.deepEqual(data, original);
  await assert.rejects(() => runAgentEngine(data, { kind: 'prepare', operations: [
    { operation: 'scenario.update', args: [id, { accounts: [] }] }
  ] }), /dedicated commands/);
  await assert.rejects(() => runAgentEngine(data, { kind: 'prepare', operations: [
    { operation: 'eval', args: ['bad'] }
  ] }), /Unknown application command/);
});

test('agent marks an occurrence actual using the same history rules as the app', async () => {
  const data = fixture(), id = data.scenarios[0].id;
  const found = await runAgentEngine(data, { kind: 'read', resource: 'occurrences',
    scenarioId: id, startDate: '2026-02-01', endDate: '2026-02-28' });
  const target = found.occurrences.find(row => row.status === 'planned');
  const result = await runAgentEngine(data, { kind: 'prepare', operations: [
    { operation: 'occurrence.actual', args: [id, target.occurrenceKey,
      { actualAmount: 123, actualDate: '2026-02-10' }] }
  ] });
  assert.equal(result.applicable, true);
  assert.ok(result.data.scenarios[0].transactionOccurrences.some(row => row.actualAmount === 123));
});

test('break-even through agent honors defaults, inactive safeguard and objectives; projections are read-only', async () => {
  const data = fixture(), original = structuredClone(data), id = data.scenarios[0].id;
  const businessModel = { cashAccountId: 1, variables: [
    { id: 'n', name: 'Subscribers', value: 3, overrides: '2026-02=8' },
    { id: 'fee', name: 'Fee', value: 100 }
  ], testRanges: [
    { variable: 'n', start: 0, end: 5, step: 1, paused: true, objective: 'maximize' },
    { variable: 'fee', start: 0, end: 100, step: 100, objective: 'minimize' }
  ], flows: [{ name: 'Fees', model: 'volume', quantity: 'n', rateVariable: 'fee', kind: 'revenue' }] };
  const result = await runAgentEngine(data, { kind: 'calculate', calculation: 'workshop.test',
    scenarioId: id, businessModel, startMonth: '2026-02' });
  assert.equal(result.total, 2);
  assert.equal(result.inactive, 1);
  assert.equal(result.passing, 1);
  assert.equal(result.best.revenue, 300);
  assert.deepEqual(result.best.values.map(row => row.value), [3, 100]);
  const projected = await runAgentEngine(data, { kind: 'calculate', calculation: 'projections', scenarioId: id });
  assert.ok(projected.length > 0);
  const solved = await runAgentEngine(data, { kind: 'calculate', calculation: 'goals.solve', scenarioId: id });
  assert.equal(solved.isFeasible, true);
  assert.deepEqual(data, original);
});

test('original statements are returned only through explicit source reads', async () => {
  const data = fixture(), scenario = data.scenarios[0];
  scenario.statementImports = [{ id: 'source1', fileName: 'private.csv', rawCsv: 'PRIVATE', rows: ['PRIVATE'] }];
  const metadata = await runAgentEngine(data, { kind: 'read', resource: 'statements', scenarioId: scenario.id });
  assert.ok(!JSON.stringify(metadata).includes('PRIVATE'));
  const source = await runAgentEngine(data, { kind: 'read', resource: 'statementSource', sourceId: 'source1', scenarioId: scenario.id });
  assert.equal(source.rawCsv, 'PRIVATE');
});
