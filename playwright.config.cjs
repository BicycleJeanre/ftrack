const { defineConfig, devices } = require('@playwright/test');

const port = Number(process.env.E2E_PORT || 8000);
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${port}`;

module.exports = defineConfig({
  testDir: './e2e/specs',
  timeout: 30_000,
  expect: {
    timeout: 8_000
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e-report', open: 'never' }]
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: `python3 server.py ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 15_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  outputDir: 'test-results/e2e'
});
