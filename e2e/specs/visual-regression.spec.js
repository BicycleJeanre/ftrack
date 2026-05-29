const { test, expect } = require('@playwright/test');
const { gotoFTrack } = require('../helpers/app-data');
const { selectWorkflow } = require('../helpers/ui');

async function disableVolatileEffects(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
    `
  });
}

test.describe('visual regression baselines', () => {
  test('General dashboard at 1k desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await gotoFTrack(page);
    await disableVolatileEffects(page);
    await selectWorkflow(page, 'General');
    await expect(page).toHaveScreenshot('general-dashboard-1024.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02
    });
  });

  test('Budget workflow at compact laptop size', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await gotoFTrack(page);
    await disableVolatileEffects(page);
    await selectWorkflow(page, 'Budget');
    await expect(page).toHaveScreenshot('budget-compact-laptop.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02
    });
  });

  test('account filter modal on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFTrack(page);
    await disableVolatileEffects(page);
    await selectWorkflow(page, 'General');
    await expect(page.locator('.sidebar-backdrop')).not.toBeVisible();
    await page.locator('#accountsSection button[title="Open filters"]').click();
    await expect(page).toHaveScreenshot('account-filter-mobile.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02
    });
  });
});
