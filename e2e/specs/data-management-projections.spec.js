const fs = require('node:fs');
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
const invalidImportFixturePath = path.resolve(__dirname, '../fixtures/invalid-import-data.json');
const legacyImportFixturePath = path.resolve(__dirname, '../fixtures/legacy-schema43-data.json');

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

    expect(exported.schemaVersion).toBe(44);
    expect(exported.scenarios[0].name).toBe('E2E Frontend Smoke');
  });

  test('imports replacement JSON through the file chooser and upgrade review', async ({ page }) => {
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Import/ }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(importFixturePath);

    const review = page.locator('.data-upgrade-modal');
    await expect(review).toBeVisible();
    await expect(review).toContainText('Validation');
    await expect(review).toContainText('Passed');
    await review.getByRole('button', { name: /^Import (Validated|Upgraded) Data$/ }).click();

    await expect(page.locator('.scenario-list-item', { hasText: 'Imported Replacement' })).toBeVisible({
      timeout: 5000
    });
    await expect(page.locator('.account-card', { hasText: 'Imported Checking' })).toBeVisible();

    const data = await readAppData(page);
    expect(data.scenarios).toHaveLength(1);
    expect(data.scenarios[0].id).toBe(301);
  });

  test('rejects invalid import JSON without replacing current data', async ({ page }) => {
    const before = await readAppData(page);

    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Import/ }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(invalidImportFixturePath);

    const review = page.locator('.data-upgrade-modal');
    await expect(review).toBeVisible();
    await expect(review).toContainText('Failed');
    await expect(review.getByRole('button', { name: /Import/ })).toBeDisabled();
    await review.getByRole('button', { name: 'Cancel' }).click();

    const after = await readAppData(page);
    expect(after.scenarios).toHaveLength(before.scenarios.length);
    expect(after.scenarios[0].name).toBe(before.scenarios[0].name);
  });

  test('repairs required legacy fields and imports upgraded data with retained warnings', async ({ page }) => {
    const source = await readAppData(page);
    const scenario = source.scenarios[0];
    scenario.name = 'Repaired Legacy Import';
    scenario.accounts[0].currency = null;
    scenario.transactions[0].description = '';
    scenario.transactions[0].recurrence = {
      recurrenceType: 7,
      startDate: '2026-04-23',
      endDate: null,
      interval: 1,
      month: null,
      dayOfYear: null
    };
    source.migrationReport = {
      fromSchemaVersion: 43,
      toSchemaVersion: 44,
      migratedAt: '2026-08-01T00:00:00.000Z',
      summary: { warningCount: 1, recoveryRecordCount: 1 },
      scenarios: [{
        scenarioId: scenario.id,
        scenarioIndex: 0,
        issues: [{
          severity: 'warning',
          code: 'orphan-source-transaction',
          message: 'Preserved as a manual occurrence.',
          action: 'converted-to-manual',
          recoveryRecord: { id: 9001 }
        }]
      }]
    };

    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Import/ }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'legacy-required-fields.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(source))
    });

    const review = page.locator('.data-upgrade-modal');
    await expect(review).toContainText('Failed');
    await expect(review).toContainText('safe repairs available');
    await review.getByRole('button', { name: 'Preview Safe Repairs' }).click();
    await expect(review).toContainText('Passed');
    await expect(review).toContainText('1 historical notes');
    await review.getByRole('button', { name: 'Import Upgraded Data' }).click();

    await expect(page.locator('.scenario-list-item', { hasText: 'Repaired Legacy Import' })).toBeVisible();
    const imported = await readAppData(page);
    expect(imported.scenarios[0].accounts[0].currency).toBe(1);
    expect(imported.scenarios[0].transactions[0].description).toBe('Checking → Salary Income');
    expect(imported.scenarios[0].transactions[0].recurrence.month).toBe(4);
    expect(imported.scenarios[0].transactions[0].recurrence.dayOfYear).toBe(23);
    expect(imported.migrationReport.summary.recoveryRecordCount).toBe(1);
  });

  test('opens the data checker for the current browser data', async ({ page }) => {
    await page.locator('#topbar-validate').click();
    await expect(page.locator('.validate-data-modal')).toBeVisible();
    await expect(page.locator('.validate-data-modal')).toContainText('Upgrade & Validate Data');
    await page.getByRole('button', { name: 'Current Browser Data' }).click();
    await expect(page.locator('.validate-data-modal')).toContainText('Data Upgrade Review');
    await expect(page.locator('.validate-data-modal .vd-summary')).toContainText(/scenario/);
  });

  test('repairs a retired Budget workflow preference without changing plan items', async ({ page }) => {
    const source = await readAppData(page);
    source.uiState.lastWorkflowId = 'budget';
    const occurrenceCount = source.scenarios[0].transactionOccurrences.length;
    await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), {
      key: STORAGE_KEY,
      data: source
    });

    await page.locator('#topbar-validate').click();
    await page.getByRole('button', { name: 'Current Browser Data' }).click();
    const review = page.locator('.data-upgrade-modal');
    await expect(review).toContainText('Passed');
    await expect(review).toContainText('uiState.lastWorkflowId');
    await expect(review).toContainText('Routed the retired Budget workflow preference to General');
    await review.getByRole('button', { name: 'Apply Upgrade to Browser Data' }).click();

    await expect.poll(async () => (await readAppData(page)).uiState.lastWorkflowId).toBe('general');
    const applied = await readAppData(page);
    expect(applied.scenarios[0].transactionOccurrences).toHaveLength(occurrenceCount);
  });

  test('previews and applies safe browser-data repairs while separating migration history', async ({ page }) => {
    const damaged = await readAppData(page);
    damaged.scenarios[0].accounts[0].id = '1';
    damaged.scenarios[0].accounts[0].type = '1';
    damaged.scenarios[0].accounts[0].startingBalance = '1200.50';
    damaged.scenarios[0].transactions[0].recurrence.interval = '1';
    const historicalIssues = Array.from({ length: 105 }, (_, index) => ({
      severity: 'warning',
      code: `historical-${index + 1}`,
      message: 'Retained during an earlier migration',
      action: 'converted-to-manual',
      recoveryRecord: { startingBalance: '999' }
    }));
    damaged.migrationReport = {
      fromSchemaVersion: 43,
      toSchemaVersion: 44,
      migratedAt: '2026-08-01T00:00:00.000Z',
      summary: { recoveryRecordCount: historicalIssues.length },
      scenarios: [{
        scenarioId: damaged.scenarios[0].id,
        scenarioIndex: 0,
        issues: historicalIssues
      }]
    };
    await page.evaluate(({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
    }, { key: STORAGE_KEY, data: damaged });

    await page.locator('#topbar-validate').click();
    await page.getByRole('button', { name: 'Current Browser Data' }).click();
    const review = page.locator('.data-upgrade-modal');
    await expect(review).toContainText('Failed');
    await expect(review).toContainText('safe repairs available');
    await expect(review).toContainText('105 historical notes');
    await expect(review).toContainText('not active validation failures');
    await expect(review.locator('.data-upgrade-section').last().locator('li')).toHaveCount(100);

    await review.getByRole('button', { name: 'Preview Safe Repairs' }).click();
    await expect(review).toContainText('Passed');
    await expect(review).toContainText('Safe repairs are included in this preview');
    await expect(review).toContainText('scenarios[0].accounts[0].startingBalance');
    await review.getByRole('button', { name: 'Apply Safe Repairs to Browser Data' }).click();

    await expect.poll(async () => {
      const data = await readAppData(page);
      return data.scenarios[0].accounts[0].startingBalance;
    }).toBe(1200.5);
  });

  test('reviews recovered transactions as manual, removed, or linked to recurrence', async ({ page }) => {
    const source = await readAppData(page);
    const scenario = source.scenarios[0];
    const recurringRule = scenario.transactions.find((transaction) => transaction.id === 1002);
    const template = scenario.transactionOccurrences[0];
    const recovered = [
      { id: 4101, description: 'Recovery Link', scheduledDate: '2026-02-10' },
      { id: 4102, description: 'Recovery Manual', scheduledDate: '2026-03-10' },
      { id: 4103, description: 'Recovery Remove', scheduledDate: '2026-04-10' },
      ...Array.from({ length: 24 }, (_, index) => ({
        id: 4200 + index,
        description: `Recovery Pending ${index + 1}`,
        scheduledDate: '2026-05-10'
      }))
    ];
    scenario.transactionOccurrences.push(...recovered.map((entry) => ({
      ...template,
      ...entry,
      sourceTransactionId: null,
      occurrenceKey: `occurrence:${entry.id}`,
      origin: 'migrated'
    })));
    source.migrationReport = {
      fromSchemaVersion: 43,
      toSchemaVersion: 44,
      migratedAt: '2026-08-01T00:00:00.000Z',
      summary: { warningCount: 3, recoveryRecordCount: 3 },
      scenarios: [{
        scenarioId: scenario.id,
        scenarioIndex: 0,
        issues: recovered.map((entry, index) => ({
          severity: 'warning',
          code: index === 0 ? 'ambiguous-recurring-occurrence' : 'orphan-source-transaction',
          message: 'Preserved as a manual occurrence.',
          action: 'converted-to-manual',
          sourceId: entry.id,
          recoveryRecord: { id: entry.id, sourceTransactionId: recurringRule.id }
        }))
      }]
    };
    await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), {
      key: STORAGE_KEY,
      data: source
    });

    await page.locator('#topbar-validate').click();
    await page.getByRole('button', { name: 'Current Browser Data' }).click();
    const review = page.locator('.data-upgrade-modal');
    await review.getByRole('button', { name: 'Review Transactions' }).click();
    await expect(review).toContainText('0 of 27 reviewed');
    await expect(review).toContainText('Showing 1–25');
    await review.getByRole('button', { name: 'Next 25' }).click();
    await expect(review).toContainText('Showing 26–27');
    await review.getByRole('button', { name: 'Previous 25' }).click();

    const linkRow = review.locator('.data-upgrade-recovery-item', { hasText: 'Recovery Link' });
    await linkRow.locator('.data-recovery-rule').selectOption(String(recurringRule.id));
    await linkRow.getByRole('button', { name: 'Link to Recurrence' }).click();
    const manualRow = review.locator('.data-upgrade-recovery-item', { hasText: 'Recovery Manual' });
    await manualRow.getByRole('button', { name: 'Confirm Manual' }).click();
    const removeRow = review.locator('.data-upgrade-recovery-item', { hasText: 'Recovery Remove' });
    await removeRow.getByRole('button', { name: 'Remove Transaction' }).click();
    await expect(review).toContainText('3 of 27 reviewed');
    await review.getByRole('button', { name: 'Preview 3 Decisions' }).click();

    await expect(review).toContainText('24 historical notes');
    await review.getByRole('button', { name: 'Apply Recovery Decisions to Browser Data' }).click();

    await expect.poll(async () => {
      const data = await readAppData(page);
      return data.migrationReport?.resolutionHistory?.length;
    }).toBe(3);
    const applied = await readAppData(page);
    const linked = applied.scenarios[0].transactionOccurrences.find((entry) => entry.id === 4101);
    const manual = applied.scenarios[0].transactionOccurrences.find((entry) => entry.id === 4102);
    expect(linked.sourceTransactionId).toBe(recurringRule.id);
    expect(linked.occurrenceKey).toBe(`tx:${recurringRule.id}|date:2026-02-10|role:none`);
    expect(manual.sourceTransactionId).toBeNull();
    expect(applied.scenarios[0].transactionOccurrences.some((entry) => entry.id === 4103)).toBe(false);
  });

  test('relinks recoverable migrated occurrences without dropping financial records', async ({ page }) => {
    const source = await readAppData(page);
    const scenario = source.scenarios[0];
    const recurringRule = scenario.transactions.find((transaction) => transaction.id === 1002);
    const occurrenceTemplate = scenario.transactionOccurrences[0];
    const historicalIssues = [];
    for (let index = 0; index < 105; index += 1) {
      const monthIndex = index + 1;
      const year = 2026 + Math.floor(monthIndex / 12);
      const month = (monthIndex % 12) + 1;
      const scheduledDate = `${year}-${String(month).padStart(2, '0')}-10`;
      const id = 3000 + index;
      scenario.transactionOccurrences.push({
        ...occurrenceTemplate,
        id,
        sourceTransactionId: null,
        occurrenceKey: `occurrence:${id}`,
        scheduledDate,
        origin: 'migrated'
      });
      historicalIssues.push({
        severity: 'warning',
        code: 'ambiguous-recurring-occurrence',
        message: 'A linked recurring occurrence lacked stable scheduled identity and was preserved as a manual occurrence.',
        action: 'converted-to-manual',
        sourceId: id,
        recoveryRecord: {
          id,
          sourceTransactionId: recurringRule.id,
          occurrenceDate: scheduledDate,
          amount: recurringRule.amount
        }
      });
    }
    const occurrenceCount = scenario.transactionOccurrences.length;
    source.migrationReport = {
      fromSchemaVersion: 43,
      toSchemaVersion: 44,
      migratedAt: '2026-08-01T00:00:00.000Z',
      summary: { recoveryRecordCount: historicalIssues.length },
      scenarios: [{
        scenarioId: source.scenarios[0].id,
        scenarioIndex: 0,
        issues: historicalIssues
      }]
    };
    await page.evaluate(({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
    }, { key: STORAGE_KEY, data: source });

    await page.locator('#topbar-validate').click();
    await page.getByRole('button', { name: 'Current Browser Data' }).click();
    const review = page.locator('.data-upgrade-modal');
    await expect(review).toContainText('105 historical notes');
    await review.getByRole('button', { name: 'Resolve Recurring Links', exact: true }).click();
    await expect(review).toContainText('105 migrated occurrences will be relinked');
    await expect(review).toContainText('All associated recovery notes are resolved');
    await expect(review).toContainText('sourceTransactionId');
    await review.getByRole('button', { name: 'Apply Resolved Recurring Links' }).click();

    await expect.poll(async () => {
      const data = await readAppData(page);
      return {
        hasMigrationReport: Boolean(data.migrationReport),
        occurrenceCount: data.scenarios[0].transactionOccurrences.length,
        linkedCount: data.scenarios[0].transactionOccurrences.filter((occurrence) => (
          occurrence.id >= 3000 && occurrence.sourceTransactionId === recurringRule.id
        )).length
      };
    }).toEqual({ hasMigrationReport: false, occurrenceCount, linkedCount: 105 });
  });

  test('upgrades an uploaded legacy file and downloads its complete change report', async ({ page }) => {
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Import/ }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(legacyImportFixturePath);

    const review = page.locator('.data-upgrade-modal');
    await expect(review).toBeVisible();
    await expect(review).toContainText('43 → 44');
    await expect(review).toContainText('Passed');
    await expect(review).toContainText('What Changed');
    await expect(review).toContainText('scenarios[0].budgets');

    const reportPromise = page.waitForEvent('download');
    await review.getByRole('button', { name: 'Download Change Report' }).click();
    const reportDownload = await reportPromise;
    const stream = await reportDownload.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(report.fromSchemaVersion).toBe(43);
    expect(report.toSchemaVersion).toBe(44);
    expect(report.validationPassed).toBe(true);
    expect(report.changes.length).toBeGreaterThan(0);

    await review.getByRole('button', { name: 'Import Upgraded Data' }).click();
    await expect(page.locator('.scenario-list-item', { hasText: 'Legacy Browser Upgrade' })).toBeVisible({
      timeout: 5000
    });
    const upgraded = await readAppData(page);
    expect(upgraded.schemaVersion).toBe(44);
    expect(upgraded.scenarios[0].budgets).toBeUndefined();
    expect(upgraded.scenarios[0].transactionOccurrences).toHaveLength(1);
  });

  test('clears browser data after confirmation', async ({ page }) => {
    await page.getByRole('button', { name: /Clear/ }).click();
    await confirmDialog(page);

    await expect.poll(async () => {
      const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
      if (!raw) return 0;
      return JSON.parse(raw).scenarios?.length ?? -1;
    }).toBe(0);
  });

  test('refreshes projections from the Projections filter actions', async ({ page }) => {
    await selectWorkflow(page, 'General');
    expect((await currentScenario(page)).projection?.rows || []).toHaveLength(0);

    await openSectionFilters(page, '#projectionsSection');
    await page.locator('.filter-modal button[title="Refresh projections now"]').click();
    await waitForScenario(page, (scenario) => (scenario.projection?.rows || []).length > 0, 'projection rows generated');
    await closeFilterModal(page);

    await expect(page.locator('#projectionsContent')).not.toContainText('No projections available');
    await expect(page.locator('#projectionsSection .projection-freshness')).toHaveText('Current');
  });
});

test.describe('legacy browser cache upgrade review', () => {
  test('reviews raw legacy cache before replacing it', async ({ page }) => {
    const legacy = JSON.parse(fs.readFileSync(legacyImportFixturePath, 'utf8'));
    await page.addInitScript(({ key, data }) => {
      window.localStorage.setItem(key, JSON.stringify(data));
    }, { key: STORAGE_KEY, data: legacy });

    await page.goto('/pages/ftrack.html', { waitUntil: 'domcontentloaded' });

    const review = page.locator('.data-upgrade-modal');
    await expect(review).toBeVisible();
    await expect(review).toContainText('Current browser data');
    await expect(review).toContainText('43 → 44');
    await expect(review.getByRole('button', { name: 'Choose Another Source' })).toBeVisible();

    const beforeApply = await readAppData(page);
    expect(beforeApply.schemaVersion).toBe(43);

    await review.getByRole('button', { name: 'Apply Upgrade to Browser Data' }).click();
    await expect(page.locator('.app-container')).toBeVisible({ timeout: 5000 });

    const afterApply = await readAppData(page);
    expect(afterApply.schemaVersion).toBe(44);
    expect(afterApply.scenarios[0].budgets).toBeUndefined();
    expect(afterApply.scenarios[0].transactionOccurrences).toHaveLength(1);
  });
});
