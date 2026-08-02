const { test, expect } = require('@playwright/test');
const { gotoFTrack } = require('../helpers/app-data');

test.describe('supported keyboard shortcuts', () => {
  test('opens accurate shortcut help with the physical question-mark key', async ({ page }) => {
    await gotoFTrack(page);

    await page.keyboard.press('Shift+/');

    const modal = page.locator('.modal-shortcuts');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Focus Plan & Actuals');
    await expect(modal).not.toContainText('Generate Projections');

    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
  });
});
