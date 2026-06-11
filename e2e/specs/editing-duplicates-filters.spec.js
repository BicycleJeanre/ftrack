const { test, expect } = require('@playwright/test');
const {
  gotoFTrack,
  readAppData,
  currentScenario,
  waitForCollectionCount,
  waitForScenario,
  waitForScenarioCount
} = require('../helpers/app-data');
const {
  openSidebar,
  selectWorkflow,
  openSectionFilters,
  closeFilterModal
} = require('../helpers/ui');

test.describe('frontend editing, duplicate, and filter behavior', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFTrack(page);
  });

  test('edits an account and preserves the change after reload', async ({ page }) => {
    await selectWorkflow(page, 'General');

    const card = page.locator('.account-card', { hasText: 'Checking' });
    await card.click();

    const inputs = card.locator('.account-card-form .accounts-detail-input');
    await inputs.nth(0).fill('Operating Account');
    await card.locator('.account-card-form input[type="number"]').first().fill('2345.67');
    await page.locator('.topbar').click();

    await waitForScenario(page, (scenario) => {
      const account = scenario.accounts.find((item) => Number(item.id) === 1);
      return account?.name === 'Operating Account' && Number(account?.startingBalance) === 2345.67;
    }, 'account edit persisted to storage');

    await page.reload();
    await expect(page.locator('.account-card', { hasText: 'Operating Account' })).toBeVisible();
    await expect(page.locator('.account-card', { hasText: 'Operating Account' })).toContainText('R 2 345,67');
  });

  test('duplicates a scenario, account, transaction, and budget entry', async ({ page }) => {
    await openSidebar(page);
    const scenarioCount = (await readAppData(page)).scenarios.length;
    await page.locator('.scenario-list-item', { hasText: 'E2E Frontend Smoke' }).locator('button[title="Duplicate Scenario"]').click();
    await waitForScenarioCount(page, scenarioCount + 1);
    await expect(page.locator('.scenario-list-item')).toHaveCount(scenarioCount + 1);

    await selectWorkflow(page, 'General');
    const startingScenario = await currentScenario(page);
    const accountCount = startingScenario.accounts.length;
    const transactionCount = startingScenario.transactions.length;

    await page.locator('.account-card', { hasText: 'Checking' }).locator('button[title="Duplicate Account"]').click();
    await waitForCollectionCount(page, 'accounts', accountCount + 1);

    await page.locator('#transactionsTable button[title="Duplicate Transaction"]').first().click();
    await waitForCollectionCount(page, 'transactions', transactionCount + 1);

    await selectWorkflow(page, 'Budget');
    const budgetCount = (await currentScenario(page)).budgets.length;
    await page.locator('#budgetTable button[title="Duplicate Budget Entry"]').first().click();
    await waitForCollectionCount(page, 'budgets', budgetCount + 1);
  });

  test('applies account and transaction filters from filter popovers', async ({ page }) => {
    await selectWorkflow(page, 'General');

    await openSectionFilters(page, '#accountsSection');
    await page.locator('.filter-modal select').first().selectOption('Liability');
    await closeFilterModal(page);
    await expect(page.locator('.account-card', { hasText: 'Credit Card' })).toBeVisible();
    await expect(page.locator('.account-card', { hasText: 'Checking' })).toHaveCount(0);

    await openSectionFilters(page, '#transactionsSection');
    await page.locator('.filter-modal select').first().selectOption({ label: 'Salary Income' });
    await closeFilterModal(page);
    await expect(page.locator('#transactionsTable button[title="Delete Transaction"]')).toHaveCount(1);
    await expect(page.locator('#transactionsTable')).toContainText('Salary Income');
  });
});
