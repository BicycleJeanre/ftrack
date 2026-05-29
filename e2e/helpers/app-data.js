const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('@playwright/test');

const STORAGE_KEY = 'ftrack:app-data';
const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/frontend-smoke-data.json');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSmokeData(overrides = {}) {
  const base = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  return {
    ...clone(base),
    ...overrides,
    uiState: {
      ...base.uiState,
      ...(overrides.uiState || {})
    }
  };
}

async function seedAppData(page, appData = loadSmokeData()) {
  await page.addInitScript(({ key, data }) => {
    const seededKey = `${key}:e2e-seeded`;
    if (!window.sessionStorage.getItem(seededKey) && !window.localStorage.getItem(key)) {
      window.localStorage.setItem(key, JSON.stringify(data));
      window.sessionStorage.setItem(seededKey, '1');
    }
  }, { key: STORAGE_KEY, data: appData });
}

async function readAppData(page) {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)), STORAGE_KEY);
}

async function currentScenario(page) {
  const data = await readAppData(page);
  const id = Number(data?.uiState?.lastScenarioId || data?.scenarios?.[0]?.id);
  return data.scenarios.find((scenario) => Number(scenario.id) === id) || data.scenarios[0];
}

async function waitForAppReady(page) {
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('.app-container')).toBeVisible();
  await expect(page.locator('#workflowNav')).toBeAttached();
  await expect(page.locator('.scenario-list-item')).toHaveCount(1);
}

async function gotoFTrack(page, appData = loadSmokeData()) {
  await seedAppData(page, appData);
  await page.goto('/pages/ftrack.html', { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
}

async function waitForScenarioCount(page, expected) {
  await expect.poll(async () => {
    const data = await readAppData(page);
    return data.scenarios.length;
  }).toBe(expected);
}

async function waitForCollectionCount(page, collectionName, expected) {
  await expect.poll(async () => {
    const scenario = await currentScenario(page);
    return Array.isArray(scenario?.[collectionName]) ? scenario[collectionName].length : 0;
  }).toBe(expected);
}

async function waitForScenario(page, predicate, message = 'scenario predicate') {
  await expect.poll(async () => {
    const scenario = await currentScenario(page);
    return Boolean(predicate(scenario));
  }, { message }).toBe(true);
}

module.exports = {
  STORAGE_KEY,
  loadSmokeData,
  seedAppData,
  readAppData,
  currentScenario,
  gotoFTrack,
  waitForAppReady,
  waitForScenarioCount,
  waitForCollectionCount,
  waitForScenario
};
