const { test, expect } = require('@playwright/test');
const {
  gotoFTrack,
  readAppData,
  currentScenario,
  waitForScenario,
  waitForScenarioCount
} = require('../helpers/app-data');
const {
  openSidebar,
  selectWorkflow,
  openSectionFilters,
  closeFilterModal,
  confirmDialog
} = require('../helpers/ui');

test.describe('scenario, plan and actuals, and account group functional flows', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFTrack(page);
  });

  test('adds, edits, selects, and deletes a scenario from the sidebar', async ({ page }) => {
    await openSidebar(page);
    const before = (await readAppData(page)).scenarios.length;

    await page.locator('button[title="Add New Scenario"]').click();
    await waitForScenarioCount(page, before + 1);

    const createdScenario = (await readAppData(page)).scenarios.at(-1);
    const item = page.locator(`.scenario-list-item[data-scenario-id="${createdScenario.id}"]`);
    await expect(item).toBeVisible();
    await item.locator('.grid-summary-content').click();
    await expect.poll(async () => (await readAppData(page)).uiState.lastScenarioId).toBe(createdScenario.id);
    await item.locator('.grid-summary-content').click();

    const form = item.locator('.grid-summary-form');
    await expect(form).toBeVisible();
    await form.locator('input').nth(0).fill('E2E Scenario Edited');
    await form.locator('input').nth(1).fill('Edited in browser automation');
    await page.locator('.topbar').click();

    await expect(page.locator('.scenario-list-item', { hasText: 'E2E Scenario Edited' })).toBeVisible();
    await waitForScenario(page, (scenario) => (
      scenario.name === 'E2E Scenario Edited' &&
      scenario.description === 'Edited in browser automation'
    ), 'scenario edit persisted');

    await page.locator('.scenario-list-item', { hasText: 'E2E Scenario Edited' })
      .locator('button[title="Delete Scenario"]')
      .click();
    await confirmDialog(page);
    await waitForScenarioCount(page, before);
    await expect(page.locator('.scenario-list-item', { hasText: 'E2E Scenario Edited' })).toHaveCount(0);
  });

  test('marks a planned occurrence actual and preserves its planned amount and date', async ({ page }) => {
    await selectWorkflow(page, 'General');
    await page.getByRole('tab', { name: 'Period', exact: true }).click();
    const card = page.locator('#budgetSection .plan-actuals-item', { hasText: 'Groceries budget' });
    const occurrenceKey = await card.getAttribute('data-occurrence-key');

    await card.locator('.plan-actuals-completion input[type="checkbox"]').check();

    await waitForScenario(page, (scenario) => {
      const occurrence = scenario.transactionOccurrences.find(
        (item) => item.occurrenceKey === occurrenceKey
      );
      return occurrence?.status === 'actual' &&
        Number(occurrence?.actualAmount) === 450 &&
        occurrence?.actualDate === '2026-01-10';
    }, 'actual occurrence persisted');
  });

  test('creates an account group and assigns an account through the account group modal', async ({ page }) => {
    await selectWorkflow(page, 'General');
    await openSectionFilters(page, '#accountsSection');
    await page.locator('.filter-modal button[title="Manage Account Groups"]').click();

    const modal = page.locator('.modal-account-groups');
    await expect(modal).toBeVisible();
    await expect(modal.locator('#account-group-members label', { hasText: 'Checking' })).toBeVisible();
    await expect(modal.locator('#account-group-name')).toHaveValue('New Group');
    await modal.locator('#account-group-name').fill('Operating Group');
    await modal.locator('#account-group-members label', { hasText: 'Checking' }).locator('input').check();
    await modal.locator('#account-group-save').click({ force: true });
    await expect(modal.locator('.modal-account-groups-item', { hasText: 'Operating Group' })).toBeVisible();

    await waitForScenario(page, (scenario) => {
      const group = (scenario.accountGroups || []).find((item) => item.name === 'Operating Group');
      return Boolean(group && group.accountIds.includes(1));
    }, 'account group created with Checking membership');

    await modal.locator('#account-group-cancel').click();
    await closeFilterModal(page);

    await openSectionFilters(page, '#accountsSection');
    await page.locator('#account-modal-grouping-select-dialog-trigger').click();
    const groupingDialog = page.locator('.selection-dialog');
    await groupingDialog.locator('.selection-dialog-search').fill('Account Group');
    await expect(groupingDialog).toBeVisible();
    await groupingDialog.getByRole('option', { name: 'Account Group', exact: true }).click();
    await closeFilterModal(page);

    await expect(page.locator('#accountsSection')).toContainText('Operating Group');

    await page.getByRole('tab', { name: 'Period', exact: true }).click();
    const savedGroup = (await currentScenario(page)).accountGroups.find(
      (group) => group.name === 'Operating Group'
    );
    const accountPicker = page.locator('#plan-account-inline');
    await page.locator('#plan-account-inline-dialog-trigger').click();
    const accountDialog = page.locator('.selection-dialog');
    await accountDialog.locator('.selection-dialog-group-filter')
      .selectOption(`group:${savedGroup.id}`);
    await expect(accountDialog).toBeVisible();
    await accountDialog.getByRole('option', { name: /^Checking/ }).click();
    await expect(accountPicker).toHaveAttribute(
      'data-account-scope',
      `group:${savedGroup.id}`
    );
    await expect(accountPicker.locator('option[value="1"]')).toHaveText('Checking');
    await expect(accountPicker.locator('option[value="2"]')).toHaveCount(0);
  });
});
