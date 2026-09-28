const { test, expect } = require('@playwright/test');
const { gotoFTrack } = require('../helpers/app-data');
const { selectWorkflow, openSectionFilters } = require('../helpers/ui');

async function collectAccessibilityIssues(page) {
  return page.evaluate(() => {
    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0 &&
        !el.closest('[aria-hidden="true"]');
    };

    const labelTextFor = (control) => {
      if (control.id) {
        const label = document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
        if (label?.textContent?.trim()) return label.textContent.trim();
      }
      const parentLabel = control.closest('label');
      return parentLabel?.textContent?.trim() || '';
    };

    const accessibleName = (el) => (
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.getAttribute('alt') ||
      el.textContent ||
      labelTextFor(el) ||
      ''
    ).trim();

    const describe = (el) => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      className: String(el.className || ''),
      title: el.getAttribute('title') || null,
      text: (el.textContent || '').trim().slice(0, 80)
    });

    const issues = [];

    document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]').forEach((el) => {
      if (!isVisible(el)) return;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'hidden') return;
      if (!accessibleName(el)) {
        issues.push({ rule: 'interactive-name', element: describe(el) });
      }
    });

    document.querySelectorAll('img').forEach((img) => {
      if (!isVisible(img)) return;
      if (!img.hasAttribute('alt')) {
        issues.push({ rule: 'image-alt', element: describe(img) });
      }
    });

    document.querySelectorAll('input, select, textarea').forEach((control) => {
      if (!isVisible(control)) return;
      const type = (control.getAttribute('type') || '').toLowerCase();
      if (type === 'hidden' || type === 'checkbox') return;
      if (!labelTextFor(control) && !control.getAttribute('aria-label') && !control.getAttribute('title')) {
        issues.push({ rule: 'form-label', element: describe(control) });
      }
    });

    return issues;
  });
}

test.describe('accessibility contracts', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFTrack(page);
  });

  test('dashboard controls have accessible names and visible form labels', async ({ page }) => {
    await selectWorkflow(page, 'General');
    const issues = await collectAccessibilityIssues(page);
    expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
  });

  test('filter popovers and validation modal support keyboard escape', async ({ page }) => {
    await selectWorkflow(page, 'General');
    await openSectionFilters(page, '#accountsSection');
    await expect(page.locator('.filter-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.filter-modal')).toHaveCount(0);

    await page.locator('#topbar-validate').click();
    await expect(page.locator('.validate-data-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.validate-data-modal')).toHaveCount(0);
  });
});
