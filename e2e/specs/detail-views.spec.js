const { test, expect } = require('@playwright/test');
const { gotoFTrack } = require('../helpers/app-data');
const { selectWorkflow, openSectionFilters, closeFilterModal } = require('../helpers/ui');

test.describe('detail workflow reachability', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFTrack(page);
  });

  test('detail views isolate their target sections and expose filters', async ({ page }) => {
    await selectWorkflow(page, 'Accounts (Detail)');
    await expect(page.locator('#accountsSection')).toBeVisible();
    await expect(page.locator('#transactionsSection')).toBeHidden();
    await openSectionFilters(page, '#accountsSection');
    await expect(page.locator('.filter-modal')).toContainText('Filter Accounts');
    await closeFilterModal(page);

    await selectWorkflow(page, 'Transactions (Detail)');
    await expect(page.locator('#transactionsSection')).toBeVisible();
    await expect(page.locator('#accountsSection')).toBeHidden();
    await openSectionFilters(page, '#transactionsSection');
    await expect(page.locator('.filter-modal')).toContainText('Filter Transactions');
    await closeFilterModal(page);

    await selectWorkflow(page, 'Budget (Detail)');
    await expect(page.locator('#budgetSection')).toBeVisible();
    await expect(page.locator('#transactionsSection')).toBeHidden();

    await selectWorkflow(page, 'Projections (Detail)');
    await expect(page.locator('#projectionsSection')).toBeVisible();
    await expect(page.locator('#budgetSection')).toBeHidden();
  });
});
