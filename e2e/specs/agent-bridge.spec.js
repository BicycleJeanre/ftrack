const { test, expect } = require('@playwright/test');
const { gotoFTrack, currentScenario } = require('../helpers/app-data');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

test.describe('Local MCP app bridge', () => {
  let broker;
  test.beforeAll(async ({ baseURL }) => {
    const { createAgentBroker } = await import(pathToFileURL(path.resolve('scripts/lib/ftrack-agent-broker.mjs')));
    broker = createAgentBroker({ origins: [new URL(baseURL).origin] });
    await new Promise((resolve, reject) => {
      broker.server.once('error', reject);
      broker.server.listen(17865, '127.0.0.1', resolve);
    });
  });
  test.afterAll(() => broker?.close());
  test('pairs, prepares in isolation, gates writes, applies once, refreshes, rejects stale edits and disconnects', async ({ page }) => {
    await gotoFTrack(page);
    const before = await currentScenario(page);
    await page.getByRole('button', { name: 'Agent connection', exact: true }).click();
    const dialog = page.locator('.agent-connection-dialog');
    const status = await broker.call('ftrack_status');
    await dialog.getByLabel('Pairing code').fill(status.pairingCode);
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Connected');
    const listing = await broker.call('ftrack_read', { resource: 'scenarios' });
    expect(listing.results[0].id).toBe(before.id);
    const command = { requestId: 'reminder-1', operations: [
      { operation: 'reminder.create', args: [before.id, { note: 'Agent review note' }] }
    ] };
    const proposal = await broker.call('ftrack_prepare', command);
    expect(proposal.applicable).toBe(true);
    expect((await currentScenario(page)).reviewReminders).toEqual(before.reviewReminders);
    await expect(broker.call('ftrack_apply', { proposalId: proposal.proposalId, approved: true })).rejects.toThrow('Allow agent changes');
    await dialog.getByLabel('Allow agent changes for this connection').check();
    const applied = await broker.call('ftrack_apply', { proposalId: proposal.proposalId, approved: true });
    expect(applied.applied).toBe(true);
    await expect.poll(async () => (await currentScenario(page)).reviewReminders.some(row => row.note === 'Agent review note')).toBe(true);
    const repeat = await broker.call('ftrack_apply', { proposalId: proposal.proposalId, approved: true });
    expect(repeat.alreadyApplied).toBe(true);
    expect((await currentScenario(page)).reviewReminders.filter(row => row.note === 'Agent review note')).toHaveLength(1);
    const stale = await broker.call('ftrack_prepare', { requestId: 'stale', operations: command.operations });
    const newer = await broker.call('ftrack_prepare', { requestId: 'newer', operations: [
      { operation: 'reminder.create', args: [before.id, { note: 'Newer change' }] }
    ] });
    await broker.call('ftrack_apply', { proposalId: newer.proposalId, approved: true });
    await expect(broker.call('ftrack_apply', { proposalId: stale.proposalId, approved: true })).rejects.toThrow('Workspace changed');
    const invalid = await broker.call('ftrack_prepare', { requestId: 'bad-validation', operations: [
      { operation: 'account.update', args: [before.id, 1, { startingBalance: 'invalid' }] }
    ] });
    expect(invalid.applicable).toBe(false);
    expect((await currentScenario(page)).accounts[0].startingBalance).toBe(before.accounts[0].startingBalance);
    const projection = await broker.call('ftrack_calculate', { calculation: 'projections', scenarioId: before.id });
    expect(projection.length).toBeGreaterThan(0);
    const goals = await broker.call('ftrack_calculate', { calculation: 'goals.solve', scenarioId: before.id });
    expect(goals.isFeasible).toBe(true);
    const duplicate = await broker.call('ftrack_prepare', { requestId: 'duplicate-scenario', operations: [
      { operation: 'scenario.duplicate', args: [before.id, 'Agent comparison scenario'] }
    ] });
    await broker.call('ftrack_apply', { proposalId: duplicate.proposalId, approved: true });
    const scenarios = await broker.call('ftrack_read', { resource: 'scenarios' });
    const copy = scenarios.results.find(row => row.name === 'Agent comparison scenario');
    expect(copy.id).not.toBe(before.id);
    await expect(page.locator('.scenario-list-item')).toHaveCount(2);
    const setup = await broker.call('ftrack_prepare', { requestId: 'business-setup', operations: [
      { operation: 'workshop.save', args: [copy.id, { strategy: 'business', businessModel: {
        cashAccountId: 1,
        variables: [{ id: 'n', name: 'Customers', value: 3 }],
        testRanges: [{ variable: 'n', start: 0, end: 10, step: 1, paused: true, objective: 'maximize' }],
        flows: [{ name: 'Subscription fees', kind: 'revenue', model: 'volume', quantity: 'n', rate: 100 }]
      } }] }
    ] });
    await broker.call('ftrack_apply', { proposalId: setup.proposalId, approved: true });
    const business = await broker.call('ftrack_calculate', { calculation: 'workshop.test', scenarioId: copy.id,
      startMonth: '2026-02', months: 1 });
    expect(business.total).toBe(1);
    expect(business.passing).toBe(1);
    expect(business.results[0].revenue).toBe(300);
    expect(business.best).toBeNull();
    const snapshot = await currentScenario(page);
    await dialog.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('Disconnected');
    await expect(broker.call('ftrack_read', { resource: 'scenarios' })).rejects.toThrow('Open FTrack');
    const backup = await page.evaluate(() => JSON.parse(localStorage.getItem('ftrack:agent-recovery:v1')));
    expect(backup.data.scenarios).toHaveLength(2);
    expect(backup.data.scenarios.find(row => row.id === copy.id).planning.businessModel).toBeUndefined();
    expect(snapshot.id).toBe(before.id);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  });
});
