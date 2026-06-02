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

  test('transaction split metadata stays in expanded row details', async ({ page }) => {
    await selectWorkflow(page, 'Transactions (Detail)');

    const transactionsTable = page.locator('#transactionsTable .grid-container.grid-detail.tabulator');
    await expect(transactionsTable).toBeVisible();

    const headerTitles = transactionsTable.locator('.tabulator-header .tabulator-col-title');
    await expect(headerTitles.filter({ hasText: /^Description$/ })).toHaveCount(1);
    await expect(headerTitles.filter({ hasText: /^Group$/ })).toHaveCount(0);
    await expect(headerTitles.filter({ hasText: /^Role$/ })).toHaveCount(0);
    await expect(headerTitles.filter({ hasText: /^Split Group$/ })).toHaveCount(0);
    await expect(headerTitles.filter({ hasText: /^Date$/ })).toHaveCount(0);

    const firstRow = transactionsTable.locator('.tabulator-row').first();
    await expect(firstRow).toBeVisible();
    await firstRow.locator('.tabulator-cell[tabulator-field="_detailsToggle"]').click();

    const rowDetails = firstRow.locator('.grid-row-details');
    await expect(rowDetails).toContainText('Transaction Group');
    await expect(rowDetails).toContainText('Group Role');
    await expect(rowDetails).toContainText('Split Account Group');
  });

  test('transactions detail grid does not expose planned or actual status controls', async ({ page }) => {
    await selectWorkflow(page, 'Transactions (Detail)');

    const transactionsTable = page.locator('#transactionsTable .grid-container.grid-detail.tabulator');
    await expect(transactionsTable.locator('.tabulator-cell[tabulator-field="_isActual"]')).toHaveCount(0);
    await openSectionFilters(page, '#transactionsSection');
    const filterModal = page.locator('.filter-modal');
    await expect(filterModal.locator('#tx-grouping-select option', { hasText: /^Status$/ })).toHaveCount(0);
    await closeFilterModal(page);
  });
});
