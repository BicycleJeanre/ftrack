// Runs in a disposable Worker. Managers operate on an in-memory localStorage,
// never the real tab storage. A failed batch cannot partially write live data.
import * as Store from './storage-service.js';
import * as Scenario from '../managers/scenario-manager.js';
import * as Account from '../managers/account-manager.js';
import * as Occurrence from '../managers/occurrence-manager.js';
import * as Variant from '../managers/period-variant-manager.js';
import * as Statement from './statement-service.js';
import * as Projection from '../../domain/calculations/projection-engine.js';
import { validateAppData } from './validation-service.js';
import { resolveScenarioOccurrences } from '../../domain/queries/resolve-scenario-occurrences.js';
import { loadLookup } from './lookup-service.js';
import { analyzeAppDataUpgrade } from './data-upgrade-service.js';
import { getDefaultFundSettings, buildProjectionsIndex, computeNav, computeFixedSharesReport,
  computeInvestorFlows } from '../../domain/utils/fund-utils.js';
import { buildBusinessModelPlan, getBusinessModelTestCases, getBusinessOperatingMonths,
  evaluateBusinessOperatingWindow, isBetterBusinessTestCase } from '../../domain/calculations/business-model.js?v=workshop-pause-range-1';
import { AGENT_COMMANDS, AGENT_READS, AGENT_CALCULATIONS, assertSafeAgentInput } from '../../shared/agent-command-catalog.mjs';

const managers = { Scenario, Account, Occurrence, Variant, Statement, Projection,
  Upgrade: { async repair(options = {}) {
    const result = analyzeAppDataUpgrade(await Store.read(), { ...options, sourceKind: 'browser' });
    if (!result.canApply) throw new Error('Repair cannot pass the existing validation rules. Review upgradeReview first.');
    await Store.write(result.data);
  } } };
const clone = value => structuredClone(value);
function findScenario(data, id) {
  const scenario = data.scenarios.find(item => item.id === id);
  if (!scenario) throw new Error('Select an existing numeric scenarioId.');
  return scenario;
}
export function describeAgentChanges(before, after) {
  const changes = [];
  const summarize = value => {
    if (Array.isArray(value)) return value.map(summarize);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) =>
      [key, key === 'rawCsv' || key === 'rows' && Object.hasOwn(value, 'rawCsv')
        ? '[retained source; request statementSource explicitly]' : summarize(child)]));
  };
  const visit = (left, right, path) => {
    if (JSON.stringify(left) === JSON.stringify(right)) return;
    if (changes.length >= 200) return;
    if (left && right && !Array.isArray(left) && !Array.isArray(right) &&
      typeof left === 'object' && typeof right === 'object') {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
        visit(left[key], right[key], path ? path + '.' + key : key);
      }
    } else {
      changes.push({ path, before: summarize(left ?? null), after: summarize(right ?? null) });
    }
  };
  const old = new Map(before.scenarios.map(s => [s.id, s]));
  const next = new Map(after.scenarios.map(s => [s.id, s]));
  for (const id of new Set([...old.keys(), ...next.keys()])) {
    visit(old.get(id), next.get(id), 'scenario:' + id);
  }
  return changes;
}

export async function runAgentEngine(workspace, request) {
  assertSafeAgentInput(request);
  // Worker-local only; Node tests use a fresh engine realm/process.
  const memory = new Map([[Store.STORAGE_KEY, JSON.stringify(workspace)]]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key)
  } });
  const data = await Store.read();
  if (request.kind === 'prepare') {
    const operations = request.operations;
    if (!Array.isArray(operations) || !operations.length || operations.length > 30) {
      throw new Error('Prepare between 1 and 30 commands per batch.');
    }
    for (const { operation, args } of operations) {
      if (!Object.hasOwn(AGENT_COMMANDS, operation)) throw new Error('Unknown application command: ' + operation);
      const [manager, method, parameters] = AGENT_COMMANDS[operation];
      if (!Array.isArray(args) || args.length > parameters.length) throw new Error('Invalid positional args for ' + operation);
      if (parameters[0] === 'scenarioId') findScenario(await Store.read(), args[0]);
      if (operation === 'scenario.update') {
        const allowed = ['name', 'description', 'timeframe', 'advancedGoalSettings'];
        if (!args[1] || Object.keys(args[1]).some(key => !allowed.includes(key))) {
          throw new Error('Use dedicated commands for scenario collections.');
        }
      }
      if (operation === 'scenario.create' && args[0]?.id !== undefined ||
        operation === 'account.create' && args[1]?.id !== undefined) throw new Error('IDs are allocated by FTrack.');
      if (operation === 'account.update' && args[2]?.id !== undefined) throw new Error('Account IDs cannot be edited.');
      await managers[manager][method](...args);
    }
    const after = await Store.read();
    const validation = validateAppData(after);
    if (!validation.isValid) return { validation, applicable: false };
    return { validation, applicable: true, data: after, changes: describeAgentChanges(data, after) };
  }
  if (request.kind === 'read') {
    const { resource, scenarioId, startDate, endDate } = request;
    if (!AGENT_READS.includes(resource)) throw new Error('Unknown read resource.');
    if (resource === 'validation') return validateAppData(data);
    if (resource === 'upgradeReview') {
      const { data: _candidate, ...report } = analyzeAppDataUpgrade(data, { sourceKind: 'browser' });
      return report;
    }
    if (resource === 'lookups') return loadLookup('lookup-data.json');
    if (resource === 'scenarios') return data.scenarios.map(s => ({
      id: s.id, name: s.name, description: s.description, timeframe: s.timeframe,
      accounts: s.accounts.length, rules: s.transactions.length
    }));
    const s = findScenario(data, scenarioId);
    if (resource === 'scenario') {
      // Original statement text must be requested explicitly.
      const safe = clone(s);
      safe.statementImports = (safe.statementImports || []).map(({ rawCsv, rows, ...metadata }) => metadata);
      return safe;
    }
    if (resource === 'occurrences') {
      return resolveScenarioOccurrences({ scenario: s,
        startDate: startDate || s.timeframe?.startDate,
        endDate: endDate || s.timeframe?.endDate, lookupData: await loadLookup('lookup-data.json') });
    }
    if (resource === 'variants') return s.planning?.periodVariants || [];
    if (resource === 'statementSource') return (s.statementImports || []).find(row => row.id === request.sourceId) || null;
    if (resource === 'statements') return (s.statementImports || []).map(({ rawCsv, rows, ...metadata }) => metadata);
    const fields = { accounts: 'accounts', rules: 'transactions', reminders: 'reviewReminders',
      groups: 'accountGroups', mappings: 'statementMappings' };
    return s[fields[resource]] || [];
  }
  if (request.kind !== 'calculate' || !AGENT_CALCULATIONS.includes(request.calculation)) throw new Error('Unknown calculation.');
  const scenario = findScenario(data, request.scenarioId);
  if (request.calculation === 'projections') return Projection.generateProjectionsForScenario(scenario, request.options || {});
  if (request.calculation === 'funds.report') {
    const projections = await Projection.generateProjectionsForScenario(scenario, request.options || {});
    const projectionsIndex = buildProjectionsIndex(projections);
    const accounts = scenario.accounts;
    return { nav: computeNav({ accounts, projectionsIndex }),
      shares: computeFixedSharesReport({ scenario, accounts, projectionsIndex,
        fundSettings: scenario.fundSettings || getDefaultFundSettings() }),
      investorFlows: computeInvestorFlows({ scenario, accounts }) };
  }
  if (request.calculation === 'goals.solve') {
    await import('../../vendor/agent-solver.bundle.js');
    const { solveAdvancedGoals } = await import('../../domain/utils/advanced-goal-solver.js');
    return solveAdvancedGoals({ scenario, settings: request.settings || scenario.advancedGoalSettings });
  }
  const model = request.businessModel || scenario.planning?.businessModel;
  if (!model) throw new Error('Save or supply a Business Model setup.');
  const plan = buildBusinessModelPlan(scenario, model, request.values || null);
  if (request.calculation === 'workshop.preview') return {
    rules: plan.rules,
    totals: [...plan.totals],
    projections: await Projection.generateProjectionsForScenario({
      ...scenario, transactions: [...scenario.transactions, ...plan.rules]
    }, { startDate: plan.startDate, endDate: plan.endDate, periodTypeId: 3 })
  };
  const cases = getBusinessModelTestCases(model);
  const available = getBusinessOperatingMonths(plan);
  const start = available.indexOf(request.startMonth || available[0]);
  const months = request.months ?? 1;
  if (start < 0 || !Number.isInteger(months) || months < 1 || start + months > available.length) {
    throw new Error('Choose a full operating window inside the scenario timeframe.');
  }
  const offset = request.offset ?? 0, limit = request.limit ?? 50;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('Invalid pagination.');
  const results = [];
  let best = null, passing = 0, inactive = 0, invalid = 0, seen = 0;
  const window = { months: available.slice(start, start + months), includeRepayments: request.includeRepayments === true };
  for (let index = 0; index < cases.length; index++) {
    const values = cases.at(index);
    let result;
    try {
      const testPlan = buildBusinessModelPlan(scenario, model, values);
      result = { index, values, ...evaluateBusinessOperatingWindow(testPlan, window) };
    } catch (error) { result = { index, values, error: error.message, met: false }; invalid++; }
    if (result.met) passing++;
    if (result.inactive) inactive++;
    if (isBetterBusinessTestCase(result, best, cases)) best = result;
    if (!request.meetsOnly || result.met) {
      if (seen >= offset && results.length < limit) results.push(result);
      seen++;
    }
  }
  return { window, total: cases.length, passing, inactive, invalid, matching: seen, offset, results, best };
}
