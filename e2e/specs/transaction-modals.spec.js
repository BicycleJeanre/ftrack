const { test, expect } = require('@playwright/test');
const { gotoFTrack, waitForScenario } = require('../helpers/app-data');
const { selectWorkflow } = require('../helpers/ui');

test.describe('configuration modals', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFTrack(page);
  });

  test('updates transaction recurrence through the recurrence modal', async ({ page }) => {
    await selectWorkflow(page, 'Transactions (Detail)');
    await page.locator('#transactionsTable [title="Click to edit recurrence"]:visible').first().click();
    await expect(page.locator('.modal-recurrence')).toBeVisible();

    await page.locator('#recurrenceType').selectOption('1');
    await page.locator('.modal-recurrence button[title="Save"]').click();

    await waitForScenario(page, (scenario) => {
      return scenario.transactions.some((transaction) => {
        const recurrenceType = transaction?.recurrence?.recurrenceType;
        return Number(recurrenceType?.id || recurrenceType) === 1;
      });
    }, 'recurrence saved as one-time');
  });

  test('updates account periodic change through the periodic change modal', async ({ page }) => {
    await selectWorkflow(page, 'General');
    const card = page.locator('.account-card', { hasText: 'Checking' });
    await card.click();
    await card.locator('[title="Click to edit periodic change"]').click();
    await expect(page.locator('.modal-periodic')).toBeVisible();

    await page.locator('#value').fill('4.5');
    await page.locator('.modal-periodic button[title="Save"]').click();

    await waitForScenario(page, (scenario) => {
      const account = scenario.accounts.find((item) => Number(item.id) === 1);
      return Number(account?.periodicChange?.value) === 4.5;
    }, 'periodic change saved');
  });
});
