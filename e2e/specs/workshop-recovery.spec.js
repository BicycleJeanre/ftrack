const { test, expect } = require('@playwright/test');
const { seedAppData, loadSmokeData, readAppData } = require('../helpers/app-data');
const { selectWorkflow } = require('../helpers/ui');

test('reopens legacy scenarios and adds missing scenarios from cloud history without replacing current ones', async ({ page }) => {
  const active = loadSmokeData();
  active.scenarios[0].name = 'Current workspace scenario';
  const recovered = structuredClone(active);
  recovered.scenarios[0].name = 'Outdated scenario name';
  recovered.scenarios.push({
    ...structuredClone(active.scenarios[0]), id: 2, name: 'Previous contribution scenario',
    planning: { ...active.scenarios[0].planning, goalWorkshopMode: 'simple' }
  });
  await page.route('**/js/vendor/firebase-client.bundle.js*', async route => {
    await route.fulfill({
      contentType: 'text/javascript',
      body: `
        import { encodeCloudSnapshot } from '/js/app/services/cloud-snapshot-codec.js';
        const active = ${JSON.stringify(active)};
        const history = ${JSON.stringify(recovered)};
        export const isFirebaseConfigured = () => true;
        export const initializeFirebaseCloud = async () => {};
        export const observeFirebaseAuth = async callback => {
          setTimeout(() => callback({ uid: 'fixture' }), 0);
          return () => {};
        };
        export const getWorkspaceManifest = async () => ({
          activeRevision: 'active-1', sha256: (await encodeCloudSnapshot(active)).sha256
        });
        export const observeWorkspaceManifest = async () => () => {};
        export const listWorkspaceRevisions = async () => [
          { id: 'history-1', createdAt: '2026-11-15T12:00:00Z' }
        ];
        export const loadWorkspaceRevision = async (_uid, _workspace, id) => {
          const metadata = await encodeCloudSnapshot(id === 'active-1' ? active : history);
          return { metadata, chunks: metadata.chunks };
        };
        export const publishWorkspaceRevision = async () => 'updated-2';
        export const createFirebaseAccount = async () => {};
        export const sendFirebasePasswordReset = async () => {};
        export const signInFirebase = async () => {};
        export const signOutFirebase = async () => {};
      `
    });
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('fixture-cloud-seeded')) return;
    sessionStorage.setItem('fixture-cloud-seeded', '1');
    localStorage.setItem('ftrack:cloud-sync-meta:v1', JSON.stringify({
      installationId: 'fixture-browser', pending: false,
      accounts: { fixture: { lastSyncedRevision: 'active-1' } }
    }));
  });
  await seedAppData(page, { ...active, scenarios: [] });
  await page.goto('/pages/ftrack.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.scenario-list-item')).toHaveCount(1);
  await expect(page.locator('.scenario-list-item')).toContainText('Current workspace scenario');
  await page.getByRole('button', { name: /synced/i }).click();
  await page.getByRole('button', { name: 'Find missing scenarios' }).click();
  await page.getByRole('button', { name: 'Check for missing scenarios' }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 missing scenario' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore missing scenarios' }).click();
  await page.getByTitle('Confirm', { exact: true }).click();
  await expect(page.locator('.scenario-list-item')).toHaveCount(2);
  const after = await readAppData(page);
  expect(after.scenarios.map(scenario => scenario.name)).toEqual(['Current workspace scenario', 'Previous contribution scenario']);
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await selectWorkflow(page, 'Workshop');
  await page.locator('[data-scenario-id="2"]').click();
  await expect(page.getByLabel('Scenario setup strategy')).toHaveValue('goal-contribution');
  await page.locator(`[data-scenario-id="${active.scenarios[0].id}"]`).click();
  await expect(page.getByLabel('Scenario setup strategy')).toHaveValue('balanced');
});
