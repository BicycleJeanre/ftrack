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

  test('adds a recurring plan rule from the unified Plan & Actuals section', async ({ page }) => {
    await selectWorkflow(page, 'General');
    const before = (await currentScenario(page)).transactions.length;

    await expect(page.getByRole('tab', { name: 'Recurring' }))
      .toHaveAttribute('aria-selected', 'true');
    await openSectionFilters(page, '#budgetSection');
    await page.locator('.filter-modal button[title="Add recurring rule"]').click();
    await waitForCollectionCount(page, 'transactions', before + 1);
    await closeFilterModal(page);

    await expect(page.locator('#budgetTable .recurring-rule-card')).toHaveCount(before + 1);
  });

  test('adds a planned item from the unified Plan & Actuals workflow', async ({ page }) => {
    await selectWorkflow(page, 'Budget');
    const before = (await currentScenario(page)).transactionOccurrences.length;

    await openSectionFilters(page, '#budgetSection');
    await page.locator('.filter-modal button[title="Add item"]').click();
    await closeFilterModal(page);

    const form = page.locator('#budgetSection .plan-actuals-new-item form');
    await expect(form).toBeVisible();
    await form.locator('.grid-summary-field', { hasText: 'Secondary account' })
      .locator('select')
      .selectOption('5');
    await form.locator('.grid-summary-field', { hasText: 'Date' })
      .locator('input')
      .fill('2026-01-20');
    await form.locator('.grid-summary-field', { hasText: 'Current plan' })
      .locator('input')
      .fill('87.65');
    await form.locator('.grid-summary-field', { hasText: 'Description' })
      .locator('input')
      .fill('Unexpected school supplies');
    await form.getByRole('button', { name: 'Add item' }).click();

    await waitForCollectionCount(page, 'transactionOccurrences', before + 1);
    await expect(page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Unexpected school supplies'
    })).toBeVisible();
  });
});
