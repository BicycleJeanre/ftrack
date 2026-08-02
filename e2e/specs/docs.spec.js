const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

function collectMarkdownFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath.replaceAll(path.sep, '/'));
    }
  }
  return files;
}

test.describe('documentation frontend', () => {
  test('docs manifest exposes every markdown document', async () => {
    const repoRoot = path.resolve(__dirname, '../..');
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'assets/docs-manifest.json'), 'utf8'));
    const markdownFiles = collectMarkdownFiles(path.join(repoRoot, 'Documentation'))
      .map((file) => path.relative(repoRoot, file).replaceAll(path.sep, '/'));
    const manifestFiles = new Set(manifest.items.map((item) => item.file));
    const missing = markdownFiles.filter((file) => !manifestFiles.has(file));

    expect(missing, `Run npm run docs:manifest. Missing docs:\n${missing.join('\n')}`).toEqual([]);
  });

  test('documentation page renders manifest navigation and document content', async ({ page }) => {
    await page.goto('/pages/documentation.html#repo-docs/USER_BUDGET_WORKFLOW');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('#repo-docs-nav')).toContainText('Plan & Actuals Workflow');
    await expect(page.locator('#repo-doc-title')).toContainText('Plan & Actuals Workflow');
    await expect(page.locator('#repo-doc-content')).toContainText('one transaction-based plan');
  });
});
