const { test, expect } = require('@playwright/test');
const { gotoFTrack } = require('../helpers/app-data');
const { selectWorkflow, expectNoHorizontalOverflow } = require('../helpers/ui');

const viewports = [
  { name: '1k desktop', width: 1024, height: 768 },
  { name: 'compact laptop', width: 1280, height: 720 },
  { name: 'desktop', width: 1366, height: 768 },
  { name: 'mobile', width: 390, height: 844 }
];

for (const viewport of viewports) {
  test(`has no shell overflow at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await gotoFTrack(page);

    await expectNoHorizontalOverflow(page);
    await selectWorkflow(page, 'Budget');
    await expectNoHorizontalOverflow(page);
    await selectWorkflow(page, 'Goal Workshop');
    await expectNoHorizontalOverflow(page);

    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('.dash-layout')).toBeVisible();
  });
}
