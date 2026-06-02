const { test, expect } = require('@playwright/test');
const { gotoFTrack } = require('../helpers/app-data');
const { selectWorkflow, openSectionFilters, closeFilterModal } = require('../helpers/ui');

test.describe('documented workflow smoke coverage', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFTrack(page);
  });

  test('Budget exposes budget and projection controls', async ({ page }) => {
    await selectWorkflow(page, 'Budget');
    await openSectionFilters(page, '#budgetSection');
    await expect(page.locator('.filter-modal')).toContainText('Filter Budget');
    await expect(page.locator('.filter-modal button[title="Add Budget Entry"]')).toBeVisible();
    await closeFilterModal(page);

    await openSectionFilters(page, '#projectionsSection');
    await expect(page.locator('.filter-modal')).toContainText('Filter Projections');
    await closeFilterModal(page);
  });

  test('Budget row accordion hides the budget section body', async ({ page }) => {
    await selectWorkflow(page, 'Budget');

    const budgetSection = page.locator('#budgetSection');
    const budgetBody = budgetSection.locator(':scope > .dash-row-body');
    await expect(budgetBody).toBeVisible();

    await budgetSection.locator(':scope > .dash-row-header').click();
    await expect(budgetSection).toHaveClass(/collapsed/);
    await expect(budgetBody).toBeHidden();
  });

  test('General exposes summary and projection controls', async ({ page }) => {
    await selectWorkflow(page, 'General');
    await expect(page.locator('#summaryCardsContent')).toContainText('OVERALL TOTAL');

    await openSectionFilters(page, '#projectionsSection');
    await expect(page.locator('.filter-modal')).toContainText('Filter Projections');
    await closeFilterModal(page);
  });

  test('Funds exposes fund totals and equity detail', async ({ page }) => {
    await selectWorkflow(page, 'Funds');
    await expect(page.locator('#summaryCardsContent')).toContainText('FUND TOTALS');
    await expect(page.locator('#summaryCardsContent')).toContainText('Equity Accounts');
  });

  test('Debt Repayment exposes debt summary and schedule-capable account cards', async ({ page }) => {
    await selectWorkflow(page, 'Debt Repayment');
    await expect(page.locator('#summaryCardsContent')).toContainText('OVERALL TOTAL');
    await expect(page.locator('#summaryCardsContent')).toContainText('Credit Card');
    await expect(page.locator('#accountsSection')).toContainText('Credit Card');
  });

  test('Goal Workshop exposes advanced goal controls', async ({ page }) => {
    await selectWorkflow(page, 'Goal Workshop');
    await expect(page.locator('#generatePlanSection')).toContainText('Goal Workshop');
    await expect(page.locator('#generatePlanSection')).toContainText('Constraints');
    await expect(page.locator('#generatePlanSection')).toContainText('Goals');
    await expect(page.locator('#generatePlanSection button[title="Solve — calculate suggested transactions"]')).toBeVisible();
  });
});
