const baseConfig = require('./playwright.config.cjs');
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  ...baseConfig,
  testIgnore: ['**/visual-regression.spec.js'],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }
  ]
});
