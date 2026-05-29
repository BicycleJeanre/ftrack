const path = require('node:path');
const { test, expect } = require('@playwright/test');
const {
  gotoFTrack,
  loadSmokeData,
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

const malformedImportFixturePath = path.resolve(__dirname, '../fixtures/malformed-import-data.json');

test.describe('deeper edit paths and error states', () => {
  test('edits a budget summary card amount and description', async ({ page }) => {
    await gotoFTrack(page);
    await selectWorkflow(page, 'Budget');
    const firstBudget = (await currentScenario(page)).budgets[0];

    const card = page.locator('#budgetSection .grid-summary-card').first();
    await card.click();
    const form = card.locator('.grid-summary-form');
    await expect(form).toBeVisible();
    await form.locator('input[type="number"]').first().fill('321.45');
    await form.locator('input[type="text"]').first().fill('Edited budget item');
    await page.locator('.topbar').click();

    await waitForScenario(page, (scenario) => {
      const budget = scenario.budgets.find((item) => Number(item.id) === Number(firstBudget.id));
      return budget?.description === 'Edited budget item' && Number(budget?.amount) === 321.45;
    }, 'budget summary edit persisted');
  });

  test('adds and removes an account tag from the account edit form', async ({ page }) => {
    await gotoFTrack(page);
    await selectWorkflow(page, 'General');

    const card = page.locator('.account-card', { hasText: 'Checking' });
    await card.click();
    const form = card.locator('.account-card-form');
    await expect(form).toBeVisible();
    await form.locator('input[placeholder="Add tag…"]').fill('review');
    await form.locator('button[title="Add Tag"]').click();
    await page.locator('.topbar').click();

    await waitForScenario(page, (scenario) => {
      const account = scenario.accounts.find((item) => Number(item.id) === 1);
      return account?.tags?.includes('review');
    }, 'account tag added');

    await card.click();
    await card.locator('.tag-badge', { hasText: 'review' }).locator('button[aria-label="Remove tag"]').click();
    await page.locator('.topbar').click();

    await waitForScenario(page, (scenario) => {
      const account = scenario.accounts.find((item) => Number(item.id) === 1);
      return !account?.tags?.includes('review');
    }, 'account tag removed');
  });

  test('shows an error when adding a transaction with no accounts', async ({ page }) => {
    const emptyAccountsData = loadSmokeData();
    emptyAccountsData.scenarios[0].accounts = [];
    emptyAccountsData.scenarios[0].transactions = [];
    emptyAccountsData.scenarios[0].budgets = [];

    await gotoFTrack(page, emptyAccountsData);
    await selectWorkflow(page, 'General');
    await openSectionFilters(page, '#transactionsSection');
    await page.locator('.filter-modal button[title="Add Transaction"]').click();
    await expect(page.locator('.notify-toast-error')).toContainText('Please create at least one account');
  });

  test('validation modal reports intentionally invalid stored data', async ({ page }) => {
    const invalidData = loadSmokeData();
    invalidData.scenarios[0].accounts[0].openDate = 'not-a-date';

    await gotoFTrack(page, invalidData);
    await page.locator('#topbar-validate').click();
    await expect(page.locator('.validate-data-modal')).toBeVisible();
    await expect(page.locator('.validate-data-modal')).toContainText('issue');
    await expect(page.locator('.validate-data-modal')).toContainText('openDate');
  });

  test('rejects malformed import JSON without changing stored data', async ({ page }) => {
    await gotoFTrack(page);
    const before = await readAppData(page);

    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Import/ }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(malformedImportFixturePath);

    await confirmDialog(page);
    await expect(page.locator('.notify-toast-error')).toContainText('Import failed');

    const after = await readAppData(page);
    expect(after.scenarios).toHaveLength(before.scenarios.length);
    expect(after.scenarios[0].name).toBe(before.scenarios[0].name);
  });
});
