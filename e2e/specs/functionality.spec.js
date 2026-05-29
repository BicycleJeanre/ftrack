const { test, expect } = require('@playwright/test');
const {
  gotoFTrack,
  currentScenario,
  waitForCollectionCount
} = require('../helpers/app-data');
const {
  selectWorkflow,
  openSectionFilters,
  closeFilterModal,
  confirmDialog
} = require('../helpers/ui');

test.describe('frontend add and remove functionality', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFTrack(page);
  });

  test('adds and removes an account from the Accounts section', async ({ page }) => {
    await selectWorkflow(page, 'General');
    const before = (await currentScenario(page)).accounts.length;

    await openSectionFilters(page, '#accountsSection');
    await page.locator('.filter-modal button[title="Add Account"]').click();
    await waitForCollectionCount(page, 'accounts', before + 1);
    await closeFilterModal(page);

    await expect(page.locator('.account-card', { hasText: 'New Account' })).toBeVisible();
    await page.locator('.account-card', { hasText: 'New Account' }).locator('button[title="Delete Account"]').click();
    await confirmDialog(page);
    await waitForCollectionCount(page, 'accounts', before);
  });

  test('adds and removes a planned transaction from the Transactions section', async ({ page }) => {
    await selectWorkflow(page, 'General');
    const before = (await currentScenario(page)).transactions.length;

    await openSectionFilters(page, '#transactionsSection');
    await page.locator('.filter-modal button[title="Add Transaction"]').click();
    await waitForCollectionCount(page, 'transactions', before + 1);
    await closeFilterModal(page);

    const deleteButtons = page.locator('#transactionsTable button[title="Delete Transaction"]');
    await expect(deleteButtons).toHaveCount(before + 1);
    await deleteButtons.last().click();
    await confirmDialog(page);
    await waitForCollectionCount(page, 'transactions', before);
  });

  test('adds and removes a budget entry from the Budget workflow', async ({ page }) => {
    await selectWorkflow(page, 'Budget');
    const before = (await currentScenario(page)).budgets.length;

    await openSectionFilters(page, '#budgetSection');
    await page.locator('.filter-modal button[title="Add Budget Entry"]').click();
    await waitForCollectionCount(page, 'budgets', before + 1);
    await closeFilterModal(page);

    const deleteButtons = page.locator('#budgetTable button[title="Delete Budget Entry"]');
    await expect(deleteButtons).toHaveCount(before + 1);
    await deleteButtons.last().click();
    await confirmDialog(page);
    await waitForCollectionCount(page, 'budgets', before);
  });
});
