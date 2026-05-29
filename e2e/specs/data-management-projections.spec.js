const path = require('node:path');
const { test, expect } = require('@playwright/test');
const {
  STORAGE_KEY,
  gotoFTrack,
  readAppData,
  currentScenario,
  waitForScenario
} = require('../helpers/app-data');
const {
  selectWorkflow,
  openSectionFilters,
  closeFilterModal,
  confirmDialog
} = require('../helpers/ui');

const importFixturePath = path.resolve(__dirname, '../fixtures/import-replacement-data.json');

test.describe('data management and projection browser flows', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFTrack(page);
  });

  test('exports current app data as a JSON backup', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export/ }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^ftrack-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));

    expect(exported.schemaVersion).toBe(43);
    expect(exported.scenarios[0].name).toBe('E2E Frontend Smoke');
  });

  test('imports replacement JSON through the file chooser and confirmation dialog', async ({ page }) => {
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Import/ }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(importFixturePath);

    await confirmDialog(page);
    await expect(page.locator('.scenario-list-item', { hasText: 'Imported Replacement' })).toBeVisible({
      timeout: 5000
    });
    await expect(page.locator('.account-card', { hasText: 'Imported Checking' })).toBeVisible();

    const data = await readAppData(page);
    expect(data.scenarios).toHaveLength(1);
    expect(data.scenarios[0].id).toBe(301);
  });

  test('clears browser data after confirmation', async ({ page }) => {
    await page.getByRole('button', { name: /Clear/ }).click();
    await confirmDialog(page);

    await expect.poll(async () => {
      return page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
    }).toBeNull();
  });

  test('generates and clears projections from the Projections filter actions', async ({ page }) => {
    await selectWorkflow(page, 'General');
    expect((await currentScenario(page)).projection?.rows || []).toHaveLength(0);

    await openSectionFilters(page, '#projectionsSection');
    await page.locator('.filter-modal button[title="Generate projections"]').click();
    await waitForScenario(page, (scenario) => (scenario.projection?.rows || []).length > 0, 'projection rows generated');
    await closeFilterModal(page);

    await expect(page.locator('#projectionsContent')).not.toContainText('No projections available');

    await openSectionFilters(page, '#projectionsSection');
    await page.locator('.filter-modal button[title="Clear projections"]').click();
    await waitForScenario(page, (scenario) => (scenario.projection?.rows || []).length === 0, 'projection rows cleared');
  });
});
