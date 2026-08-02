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
  test('shows plan descriptions and direction-aware money movement', async ({ page }) => {
    await gotoFTrack(page);
    await selectWorkflow(page, 'Budget');

    const moneyOutCard = page.locator('#budgetSection .grid-summary-card', { hasText: 'Groceries budget' });
    await expect(moneyOutCard.locator('.grid-summary-description')).toHaveText('Groceries budget');
    await expect(moneyOutCard.locator('.grid-summary-flow'))
      .toHaveText(/Money Out: Checking.*→.*Groceries Expense/);
    expect(await moneyOutCard.evaluate((card) => {
      const movement = card.querySelector('.plan-actuals-movement');
      const description = card.querySelector('.plan-actuals-description');
      return Boolean(
        movement &&
        description &&
        (movement.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING)
      );
    })).toBe(true);

    const moneyInCard = page.locator('#budgetSection .grid-summary-card', { hasText: 'Monthly salary' });
    await expect(moneyInCard.locator('.grid-summary-description')).toHaveText('Monthly salary');
    await expect(moneyInCard.locator('.grid-summary-flow'))
      .toHaveText(/Money In: Salary Income.*→.*Checking/);
  });

  test('edits a plan occurrence amount and description', async ({ page }) => {
    await gotoFTrack(page);
    await selectWorkflow(page, 'Budget');

    const card = page.locator('#budgetSection .grid-summary-card', { hasText: 'Groceries budget' });
    const occurrenceKey = await card.getAttribute('data-occurrence-key');
    await card.locator('button[title="Edit item"]').click();
    const form = card.locator('.grid-summary-form');
    await expect(form).toBeVisible();
    await form.locator('.grid-summary-field', { hasText: 'Current plan' })
      .locator('input')
      .fill('321.45');
    await form.locator('.grid-summary-field', { hasText: 'Description' })
      .locator('input')
      .fill('Edited plan item');
    await form.getByRole('button', { name: 'Save' }).click();

    await waitForScenario(page, (scenario) => {
      const occurrence = scenario.transactionOccurrences.find(
        (item) => item.occurrenceKey === occurrenceKey
      );
      return occurrence?.description === 'Edited plan item' &&
        Number(occurrence?.plannedAmount) === 321.45;
    }, 'plan occurrence edit persisted');
  });

  test('adds and removes an account tag from the account edit form', async ({ page }) => {
    await gotoFTrack(page);
    await selectWorkflow(page, 'General');

    const card = page.locator('.account-card', { hasText: 'Checking' });
    await card.click();
    const form = card.locator('.account-card-form');
    await expect(form).toBeVisible();
    const tagInput = form.locator('input[placeholder="Add tag…"]');
    await tagInput.fill('review');
    await tagInput.press('Enter');
    await expect(card.locator('.tag-badge', { hasText: 'review' })).toBeVisible();
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

  test('shows an error when adding a recurring plan rule with no accounts', async ({ page }) => {
    const emptyAccountsData = loadSmokeData();
    emptyAccountsData.scenarios[0].accounts = [];
    emptyAccountsData.scenarios[0].transactions = [];
    emptyAccountsData.scenarios[0].transactionOccurrences = [];

    await gotoFTrack(page, emptyAccountsData);
    await selectWorkflow(page, 'General');
    await openSectionFilters(page, '#budgetSection');
    await page.locator('.filter-modal button[title="Add recurring rule"]').click();
    await expect(page.locator('.notify-toast-error')).toContainText(
      'Please create at least one account before adding a recurring plan rule.'
    );
  });

  test('keeps the recurring safe editor open when Save or Enter cannot commit', async ({ page }) => {
    const endedRuleData = loadSmokeData();
    const salaryRule = endedRuleData.scenarios[0].transactions.find(
      (transaction) => Number(transaction.id) === 1001
    );
    salaryRule.recurrence.endDate = '2026-01-25';
    salaryRule.activeTo = '2026-01-25';

    await gotoFTrack(page, endedRuleData);
    await selectWorkflow(page, 'Plan Rules (Detail)');
    const salaryRow = page.locator(
      '#budgetTable .recurring-rules-detail-grid .tabulator-row',
      { hasText: 'Monthly salary' }
    );
    await salaryRow.locator('button[title="Edit recurring rule safely"]').click();
    const card = salaryRow.locator('.recurring-rule-card');
    await card.click();
    const form = card.locator('.grid-summary-form');
    await expect(form).toBeVisible();

    await form.locator('button[title="Save recurring rule"]').click();
    await expect(page.locator('.notify-toast-error').last()).toContainText(
      'no unresolved future occurrence'
    );
    await expect(form).toBeVisible();

    await page.locator('.notify-toast-error').last().click();
    await form.locator('.tag-input-row').evaluate((element) => element.remove());
    const description = form.locator('.grid-summary-field', { hasText: 'Description' })
      .locator('input');
    await description.press('Enter');
    await expect(page.locator('.notify-toast-error').last()).toContainText(
      'no unresolved future occurrence'
    );
    await expect(form).toBeVisible();
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
