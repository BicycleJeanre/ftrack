#!/usr/bin/env node

/**
 * QC/migrate-app-data-to-schema43.js
 *
 * Standalone migration utility (QC-only) that converts legacy app data into
 * schemaVersion 43 (workflow-based scenarios + projection bundle + uiState).
 *
 * This module must not be imported by runtime application code.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { input: null, output: null };

  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    const val = args[i + 1];
    if (key === '--input' || key === '-i') {
      out.input = val;
      i += 1;
      continue;
    }
    if (key === '--output' || key === '-o') {
      out.output = val;
      i += 1;
      continue;
    }
  }

  return out;
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function importModule(relativePathFromRepo) {
  const absolutePath = path.resolve(process.cwd(), relativePathFromRepo);
  return import(pathToFileURL(absolutePath).href);
}

function safeNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function coercePeriodTypeId(value, mapPeriodTypeNameToId) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const id = safeNumber(value.id, null);
    return id != null ? id : null;
  }
  if (typeof value === 'string') {
    const mapped = mapPeriodTypeNameToId(value);
    return mapped != null ? mapped : null;
  }
  return null;
}

function inferLastWorkflowId({ legacy, scenarios, getWorkflowById, getWorkflowIdFromLegacyScenarioTypeId, DEFAULT_WORKFLOW_ID }) {
  const uiState = legacy?.uiState && typeof legacy.uiState === 'object' ? legacy.uiState : {};
  const fromUi = uiState.lastWorkflowId;
  const validFromUi = getWorkflowById(fromUi)?.id || null;
  if (validFromUi) return validFromUi;

  const lastScenarioId = safeNumber(uiState.lastScenarioId, null);
  const lastScenario = lastScenarioId != null ? scenarios.find((s) => safeNumber(s?.id, null) === lastScenarioId) : null;
  const legacyType = lastScenario?.type ?? legacy?.scenarioType ?? null;
  const fromType = getWorkflowIdFromLegacyScenarioTypeId(legacyType);
  if (fromType) return fromType;

  const firstScenario = scenarios[0] || null;
  const fromFirst = getWorkflowIdFromLegacyScenarioTypeId(firstScenario?.type ?? null);
  return fromFirst || DEFAULT_WORKFLOW_ID;
}

function migrateScenario({
  legacyScenario,
  sanitizeScenarioForWrite,
  mapPeriodTypeNameToId,
  getDefaultProjectionWindowDates
}) {
  const s = legacyScenario && typeof legacyScenario === 'object' ? legacyScenario : {};

  const defaults = getDefaultProjectionWindowDates();

  const startDate =
    (s?.projection?.config && typeof s.projection.config === 'object' ? s.projection.config.startDate : null) ||
    s.startDate ||
    defaults.startDate;
  const endDate =
    (s?.projection?.config && typeof s.projection.config === 'object' ? s.projection.config.endDate : null) ||
    s.endDate ||
    defaults.endDate;

  const periodTypeIdRaw =
    (s?.projection?.config && typeof s.projection.config === 'object' ? s.projection.config.periodTypeId : null) ??
    s.projectionPeriod ??
    null;
  const periodTypeId = coercePeriodTypeId(periodTypeIdRaw, mapPeriodTypeNameToId) || 3;

  const sourceRaw =
    (s?.projection?.config && typeof s.projection.config === 'object' ? s.projection.config.source : null) || null;
  const source = sourceRaw === 'budget' ? 'budget' : 'transactions';

  const rows = Array.isArray(s?.projection?.rows)
    ? s.projection.rows
    : (Array.isArray(s?.projections) ? s.projections : []);

  const migrated = {
    id: safeNumber(s.id, 0) || 0,
    version: safeNumber(s.version, 1) || 1,
    name: typeof s.name === 'string' && s.name ? s.name : 'Unnamed Scenario',
    description: s.description === null || typeof s.description === 'string' ? s.description : null,
    lineage: s.lineage && typeof s.lineage === 'object' ? s.lineage : null,
    accounts: Array.isArray(s.accounts) ? s.accounts : [],
    transactions: Array.isArray(s.transactions) ? s.transactions : [],
    budgets: Array.isArray(s.budgets) ? s.budgets : [],
    projection: {
      config: {
        startDate: String(startDate),
        endDate: String(endDate),
        periodTypeId,
        source
      },
      ...(rows.length ? { rows } : {}),
      generatedAt: s?.projection?.generatedAt ?? null
    },
    planning: {
      generatePlan: { startDate: String(startDate), endDate: String(endDate) },
      advancedGoalSolver: { startDate: String(startDate), endDate: String(endDate) }
    }
  };

  if (s.advancedGoalSettings !== undefined) migrated.advancedGoalSettings = s.advancedGoalSettings;
  if (s.fundSettings !== undefined) migrated.fundSettings = s.fundSettings;

  return sanitizeScenarioForWrite(migrated);
}

async function main() {
  const { input, output } = parseArgs(process.argv);

  if (!input) {
    console.error('Usage: node QC/migrate-app-data-to-schema43.js --input <legacy.json> [--output <schema43.json>]');
    process.exit(2);
  }

  const inputPath = path.resolve(process.cwd(), input);
  const raw = fs.readFileSync(inputPath, 'utf8');
  const legacy = JSON.parse(raw);

  const {
    CURRENT_SCHEMA_VERSION,
    createDefaultUiState,
    getDefaultProjectionWindowDates,
    mapPeriodTypeNameToId,
    sanitizeScenarioForWrite
  } = await importModule('js/shared/app-data-utils.js');
  const { DEFAULT_WORKFLOW_ID, getWorkflowById, getWorkflowIdFromLegacyScenarioTypeId } = await importModule(
    'js/shared/workflow-registry.js'
  );

  if (typeof sanitizeScenarioForWrite !== 'function') {
    throw new Error('sanitizeScenarioForWrite is not exported from js/shared/app-data-utils.js');
  }

  const legacyScenarios = Array.isArray(legacy?.scenarios) ? legacy.scenarios : [];
  const scenarios = legacyScenarios.map((legacyScenario) =>
    migrateScenario({
      legacyScenario,
      sanitizeScenarioForWrite,
      mapPeriodTypeNameToId,
      getDefaultProjectionWindowDates
    })
  );

  const lastWorkflowId = inferLastWorkflowId({
    legacy,
    scenarios: legacyScenarios,
    getWorkflowById,
    getWorkflowIdFromLegacyScenarioTypeId,
    DEFAULT_WORKFLOW_ID
  });

  const legacyUiState = legacy?.uiState && typeof legacy.uiState === 'object' ? legacy.uiState : {};
  const lastScenarioId = safeNumber(legacyUiState.lastScenarioId, null);
  const lastScenarioVersion = safeNumber(legacyUiState.lastScenarioVersion, null);

  const migrated = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    scenarios,
    uiState: createDefaultUiState({
      lastWorkflowId,
      lastScenarioId: lastScenarioId != null ? lastScenarioId : null,
      lastScenarioVersion: lastScenarioVersion != null ? lastScenarioVersion : null,
      viewPeriodTypeIds: legacyUiState.viewPeriodTypeIds || undefined
    })
  };

  const json = JSON.stringify(migrated, null, 2) + '\n';

  if (output) {
    const outPath = path.resolve(process.cwd(), output);
    ensureDir(outPath);
    fs.writeFileSync(outPath, json, 'utf8');
    console.log(`Wrote schemaVersion ${migrated.schemaVersion} data to ${path.relative(process.cwd(), outPath)}`);
  } else {
    process.stdout.write(json);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[QC][Migrate] Fatal error:', err);
    process.exit(1);
  });
}
