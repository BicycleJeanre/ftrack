import {
  BUSINESS_FLOW_KINDS, BUSINESS_RATE_MODELS,
  buildBusinessModelPlan, evaluateBusinessBreakEven, evaluateBusinessOperatingWindow,
  getBusinessModelTestCases, getBusinessOperatingMonths, isBetterBusinessTestCase, normalizeBusinessModel
} from '../../../domain/calculations/business-model.js?v=workshop-optimize-1';
import { generateProjectionsForScenario } from '../../../domain/calculations/projection-engine.js';
import { formatCurrency } from '../../../shared/format-utils.js';
import { createScenarioAccountSelectors } from '../widgets/scenario-account-select.js?v=workshop-accounts-1';

const drafts = new WeakMap();
let nextDisclosureId = 0;
const RESULTS_PER_PAGE = 50;
const CASES_PER_BATCH = 8;
const RESULT_INDEX_CHUNK = 4096;
const CASH_RESULT_FIELDS = ['breakEvenMargin', 'revenue', 'cost', 'otherRevenue', 'otherCost', 'repayments'];
const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

function createResultIndex() {
  const chunks = [];
  return {
    append(index, result) {
      const offset = index % RESULT_INDEX_CHUNK;
      if (!offset) chunks.push({
        ...Object.fromEntries(CASH_RESULT_FIELDS.map(field => [field, new Float64Array(RESULT_INDEX_CHUNK)])),
        met: new Uint8Array(RESULT_INDEX_CHUNK)
      });
      const chunk = chunks.at(-1);
      for (const field of CASH_RESULT_FIELDS) chunk[field][offset] = result.sortValues?.[field] ?? NaN;
      chunk.met[offset] = result.met ? 1 : 0;
    },
    get(index, field) {
      return chunks[Math.floor(index / RESULT_INDEX_CHUNK)][field][index % RESULT_INDEX_CHUNK];
    }
  };
}

function compileColumnFilter(raw, kind, label) {
  if (!raw.trim()) return null;
  if (kind === 'status') {
    if (raw === 'met') return value => Number.isFinite(value) && value >= 0;
    if (raw === 'below') return value => Number.isFinite(value) && value < 0;
    return value => !Number.isFinite(value);
  }
  const toKey = kind === 'currency' ? value => Number(value.toFixed(2)) : value => value;
  const values = raw.split(';').map(entry => {
    const clean = (kind === 'currency' ? entry.replace(/R/gi, '').replace(/\s/g, '') : entry.trim())
      .replace(/\u2212/g, '-').replace(',', '.');
    const value = Number(clean);
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(clean) || !Number.isFinite(value)) {
      throw new Error(`${label}: enter a number, or separate multiple values with semicolons.`);
    }
    return toKey(value);
  });
  const accepted = new Set(values);
  return value => Number.isFinite(value) && accepted.has(toKey(value));
}
const currencies = value => value == null ? '—' : formatCurrency(value);
const revenuePresets = [
  ['Recurring customers', 'volume'],
  ['Product sales', 'volume'],
  ['Billable hours or jobs', 'volume'],
  ['Contract milestone', 'fixed', 'once'],
  ['Rental or occupancy', 'occupancy'],
  ['Metered usage', 'tiered'],
  ['Commission or revenue share', 'share'],
  ['Licence fee or retainer', 'fixed']
];

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function button(text, handler, className = 'btn btn-secondary') {
  const element = node('button', text, className);
  element.type = 'button';
  element.addEventListener('click', handler);
  return element;
}

function table(title, headings, rows, sort = null, filters = []) {
  const wrapper = node('div', null, 'business-table-scroll');
  const grid = node('table', null, 'business-table');
  grid.append(node('caption', title));
  const head = grid.createTHead().insertRow();
  headings.forEach((name, index) => {
    const th = node('th', sort ? null : name);
    th.scope = 'col';
    if (sort) {
      th.setAttribute('aria-label', name);
      const toggle = button(name, () => sort(index), 'business-sort-header');
      const indicator = node('span', null, 'business-sort-indicator');
      indicator.setAttribute('aria-hidden', 'true');
      toggle.append(indicator);
      th.append(toggle);
    }
    if (filters[index]) th.append(filters[index]);
    head.append(th);
  });
  fillTableRows(grid.createTBody(), rows);
  wrapper.append(grid);
  return wrapper;
}

function fillTableRows(body, rows, decorate = null) {
  body.replaceChildren();
  rows.forEach(row => {
    const tr = body.insertRow();
    row.forEach(value => { tr.insertCell().textContent = value; });
    decorate?.(tr);
  });
}

function accountRows(projections, id) {
  return projections.filter(row => Number(row.accountId) === id);
}

function floorResult(plan, rows) {
  if (plan.minimumCash == null) return 'No cash floor set';
  const misses = rows.filter(row => row.balance < plan.minimumCash);
  return misses.length
    ? `${misses[0].date.slice(0, 7)}: short ${currencies(plan.minimumCash - misses[0].balance)} (${misses.length} month(s) below floor)`
    : 'Meets closing cash floor';
}

function minimumBalance(rows) {
  return rows.length ? Math.min(...rows.map(row => row.balance)) : null;
}

function breakEvenResult(result) {
  if (!result || result.status === 'unavailable') return 'Unavailable';
  const month = result.date.slice(0, 7);
  return result.status === 'met' ? `Meets · ${currencies(result.balance)} (${month})`
    : `Short by ${currencies(result.shortfall)} · ${currencies(result.balance)} (${month})`;
}

export function renderBusinessModel({ container, scenario, getScenario, onSave, onAccountsCreated, isRenderCurrent }) {
  const remembered = drafts.get(container);
  const model = remembered?.scenarioId === scenario.id
    ? remembered.model : normalizeBusinessModel(scenario.planning?.businessModel);
  drafts.set(container, { scenarioId: scenario.id, model });
  const timeframe = scenario.timeframe || scenario.projection?.config || {};
  const openDisclosures = new WeakSet();
  const accountName = id => scenario.accounts?.find(a => Number(a.id) === Number(id))?.name || 'External';
  const variableName = id => model.variables.find(variable => variable.id === id)?.name || 'Variable';
  const describeCase = entries => entries?.map(({ id, value }) => `${variableName(id)}: ${value}`).join(' · ');
  const describeBreakEven = condition => `${accountName(condition.accountId)} · ${condition.mode === 'lowest' ? 'Lowest monthly closing balance' : 'Ending balance'} ≥ ${currencies(condition.threshold)}`;
  const root = node('div', null, 'business-model');
  root.dataset.businessModel = '';
  container.append(root);
  const editor = node('div', null, 'business-editor');
  const status = node('p', '', 'text-muted');
  status.setAttribute('role', 'status');
  const results = node('div', null, 'business-results');
  let generation = 0;
  let busy = false;
  let chosenCase = null;
  const operatingMonths = getBusinessOperatingMonths(timeframe);
  const accountSelectors = createScenarioAccountSelectors({
    getScenario: () => scenario,
    isCurrent: () => isRenderCurrent() && root.isConnected,
    onCreated: (_account, updated) => onAccountsCreated(updated),
    onError: error => { status.textContent = error.message; }
  });

  const invalidate = () => {
    generation++;
    busy = false;
    results.replaceChildren();
    status.textContent = 'Inputs changed. Preview again to see the updated results.';
    cancelTestButton.hidden = true;
    if (previewButton) previewButton.disabled = false;
    if (sweepButton) sweepButton.disabled = false;
  };

  function field(parent, label, target, key, config = {}) {
    const wrapper = node('div', null, 'business-field');
    const caption = node('span', label, 'control-label');
    const input = config.accounts
      ? accountSelectors.create({ label, selectedId: target[key], emptyLabel: config.empty, missingLabel: 'Missing account' })
      : node(config.options ? 'select' : config.multiline ? 'textarea' : 'input');
    input.className = input.tagName === 'SELECT' ? 'input-select' : 'input-text';
    input.setAttribute('aria-label', label);
    if (!config.accounts && config.options) {
      for (const [value, name] of config.options) {
        const option = node('option', name);
        option.value = value;
        input.append(option);
      }
      if (target[key] && !Array.from(input.options).some(option => option.value === target[key])) {
        const missing = node('option', 'Missing variable (select a replacement)');
        missing.value = target[key];
        input.append(missing);
      }
      input.value = target[key] || '';
    } else if (!config.accounts) {
      if (input.tagName === 'INPUT') input.type = config.type || 'text';
      if (config.type === 'number') input.step = 'any';
      if (config.placeholder) input.placeholder = config.placeholder;
      if (config.multiline) input.rows = 2;
      if (input.type === 'text' || config.multiline) input.maxLength = config.multiline ? 2400 : 120;
      input.value = target[key] || config.defaultValue || '';
      if (config.defaultValue) {
        input.addEventListener('blur', () => {
          if (input.value === '') input.value = config.defaultValue;
        });
      }
    }
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
      target[key] = input.value === config.defaultValue ? '' : input.value;
      invalidate();
      if (!config.refresh) return;
      if (input.tagName === 'SELECT') {
        const controls = captureFieldPosition(input);
        renderEditor();
        restoreFieldPosition(controls);
      }
    });
    if (config.refresh && input.tagName !== 'SELECT') {
      input.addEventListener('change', () => {
        for (const option of editor.querySelectorAll('select[data-business-variable] option')) {
          if (option.value === target.id) option.textContent = input.value || 'Unnamed variable';
        }
      });
    }
    if (config.variable) input.dataset.businessVariable = '';
    wrapper.append(caption, input);
    parent.append(wrapper);
    return input;
  }

  const captureFieldPosition = input => {
    const scope = input.closest('fieldset');
    return { label: input.getAttribute('aria-label'), index: scope ? [...editor.querySelectorAll('fieldset')].indexOf(scope) : -1 };
  };

  function disclosure(row, target, getLabel) {
    const panel = node('div', null, 'business-disclosure');
    panel.id = `business-disclosure-${++nextDisclosureId}`;
    const fields = node('div', null, 'business-fields');
    panel.append(fields);
    const toggle = button(getLabel(), () => {
      if (openDisclosures.has(target)) openDisclosures.delete(target);
      else openDisclosures.add(target);
      sync();
    });
    const sync = () => {
      const open = openDisclosures.has(target);
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = getLabel();
    };
    toggle.setAttribute('aria-controls', panel.id);
    panel.addEventListener('input', sync);
    sync();
    row.append(toggle);
    return { panel, fields, sync };
  }
  const restoreFieldPosition = ({ label, index }) => {
    const scope = index < 0 ? editor : editor.querySelectorAll('fieldset')[index];
    [...(scope?.querySelectorAll('select') || [])].find(select => select.getAttribute('aria-label') === label)?.focus();
  };
  const selector = (parent, label, target, key, options, refresh = false) =>
    field(parent, label, target, key, { options, refresh });
  const inputNumber = (parent, label, target, key, placeholder) =>
    field(parent, label, target, key, { type: 'number', placeholder });
  const newVariable = () => {
    if (model.variables.length >= 40) return;
    model.variables.push({ id: crypto.randomUUID?.() || `var-${Date.now()}-${Math.random()}`, name: '', value: '', overrides: '' });
    invalidate();
    renderEditor();
    editor.querySelectorAll('[aria-label="Variable name"]').item(model.variables.length - 1)?.focus();
  };
  const newFlow = (kind, fields = {}) => {
    if (model.flows.length >= 80) return;
    const flow = normalizeBusinessModel({ flows: [{ kind, ...fields }] }).flows[0];
    model.flows.push(flow);
    invalidate();
    renderEditor();
    editor.querySelectorAll('[aria-label="Flow name"]').item(model.flows.length - 1)?.focus();
  };

  function renderEditor() {
    accountSelectors.destroy();
    editor.replaceChildren();
    const variableOptions = (empty = 'Choose variable') => [['', empty], ...model.variables.map(v => [v.id, v.name || 'Unnamed variable'])];
    const accountFields = node('div', null, 'business-fields');
    field(accountFields, 'Business cash account', model, 'cashAccountId', { accounts: true, empty: 'Choose a cash account' });
    field(accountFields, 'Owner cash account (optional)', model, 'ownerAccountId', { accounts: true, empty: 'No separate owner account' });
    inputNumber(accountFields, 'Minimum business closing cash (optional)', model, 'minimumCash');
    editor.append(accountFields);

    const variablesHeader = node('div', null, 'business-row-heading');
    variablesHeader.append(node('h3', 'Variables'), button('Add variable', newVariable));
    editor.append(variablesHeader, node('p', 'Name reusable inputs such as customers, units, hours or price. Optional monthly overrides use YYYY-MM=value, one per line.', 'text-muted'));
    model.variables.forEach((variable, index) => {
      const row = node('div', null, 'business-fields business-editor-row');
      field(row, 'Variable name', variable, 'name', { refresh: true });
      inputNumber(row, 'Default value', variable, 'value');
      const overrides = disclosure(row, variable, () => variable.overrides.trim()
        ? 'Monthly overrides · Set' : 'Monthly overrides');
      field(overrides.fields, 'Monthly overrides (optional)', variable, 'overrides', { multiline: true, placeholder: '2027-02=8' });
      row.append(button('Remove variable', () => {
        model.variables.splice(index, 1);
        invalidate();
        renderEditor();
        editor.querySelector('[aria-label="Variable name"]')?.focus();
      }));
      row.append(overrides.panel);
      editor.append(row);
    });

    const flowHeader = node('div', null, 'business-row-heading');
    flowHeader.append(node('h3', 'Revenue, costs & funding'), button('Add revenue', () => newFlow('revenue')),
      button('Add cost', () => newFlow('cost')), button('Add other flow', () => newFlow('investment')));
    const presets = node('div', null, 'business-row-heading');
    const presetSelect = node('select', null, 'input-select');
    presetSelect.setAttribute('aria-label', 'Revenue model preset');
    presetSelect.append(new Option('Choose a revenue preset', ''));
    revenuePresets.forEach(([name], index) => presetSelect.append(new Option(name, String(index))));
    const addPreset = button('Add preset', () => {
      const [name, calculation, frequency = 'monthly'] = revenuePresets[Number(presetSelect.value)];
      newFlow('revenue', { name, model: calculation, frequency });
    });
    addPreset.disabled = true;
    presetSelect.addEventListener('change', () => { addPreset.disabled = presetSelect.value === ''; });
    presets.append(presetSelect, addPreset);
    editor.append(flowHeader, node('p', 'Mix custom flows or start from a preset. For purchases or loan draws, choose One time. For repayments, enter the payment schedule as a financing flow.', 'text-muted'), presets);
    model.flows.forEach((flow, index) => {
      const row = node('fieldset', null, 'business-fields business-editor-row');
      row.append(node('legend', `Flow ${index + 1}`));
      field(row, 'Flow name', flow, 'name');
      selector(row, 'Flow type', flow, 'kind', Object.entries(BUSINESS_FLOW_KINDS), true);
      selector(row, 'Calculation', flow, 'model', Object.entries(BUSINESS_RATE_MODELS)
        .filter(([key]) => key !== 'revenueShare' || flow.kind !== 'revenue' || flow.model === key), true);
      selector(row, 'Frequency', flow, 'frequency', [['monthly', 'Monthly'], ['once', 'One time']], true);
      if (['volume', 'occupancy', 'stepped', 'share', 'tiered'].includes(flow.model)) {
        field(row, flow.model === 'share' ? 'Base value variable' : 'Quantity variable', flow, 'quantity',
          { options: variableOptions(), variable: true });
      }
      if (flow.model === 'occupancy') field(row, 'Occupancy % variable', flow, 'occupancy',
        { options: variableOptions(), variable: true });
      field(row, 'Rate or amount variable', flow, 'rateVariable',
        { options: variableOptions('Use fixed input'), variable: true, refresh: true });
      if (!flow.rateVariable) {
        const label = { share: 'Rate (%)', revenueShare: 'Rate (%)', fixed: 'Amount',
          stepped: 'Base amount', tiered: 'First unit rate' }[flow.model] || 'Rate per unit';
        inputNumber(row, label, flow, 'rate');
      }
      if (['stepped', 'tiered'].includes(flow.model)) {
        inputNumber(row, 'Quantity threshold', flow, 'threshold');
        inputNumber(row, flow.model === 'stepped' ? 'Increase at threshold' : 'Second unit rate', flow, 'secondRate');
      }
      if (flow.model === 'tiered') inputNumber(row, 'Minimum charge (optional)', flow, 'minimum');
      field(row, 'Primary account', flow, 'accountId', { accounts: true, empty: 'Use business cash account' });
      field(row, 'Counterparty account', flow, 'counterpartyId', { accounts: true, empty: 'External / no counterparty' });
      const timing = disclosure(row, flow, () => flow.startDate || (flow.frequency !== 'once' && flow.endDate) || Number(flow.delay || 0) !== 0
        ? 'Timing · Custom' : 'Timing · Scenario timeframe');
      const start = field(timing.fields, flow.frequency === 'once' ? 'Activity date' : 'First activity date', flow, 'startDate',
        { type: 'date', defaultValue: timeframe.startDate });
      const end = flow.frequency !== 'once' ? field(timing.fields, 'Last activity date', flow, 'endDate',
        { type: 'date', defaultValue: timeframe.endDate }) : null;
      const delay = field(timing.fields, 'Payment delay (whole months)', flow, 'delay', { type: 'number', defaultValue: '0' });
      timing.fields.append(button('Use scenario defaults', () => {
        flow.startDate = flow.endDate = flow.delay = '';
        start.value = timeframe.startDate || '';
        if (end) end.value = timeframe.endDate || '';
        delay.value = '0';
        timing.sync();
        invalidate();
      }));
      row.append(button('Remove flow', () => {
        model.flows.splice(index, 1);
        invalidate();
        renderEditor();
        editor.querySelectorAll('[aria-label="Flow name"]').item(Math.max(0, index - 1))?.focus();
      }));
      row.append(timing.panel);
      editor.append(row);
    });

    const testHeading = node('div', null, 'business-row-heading');
    const addRange = button('Add test variable', () => {
      model.testRanges.push({ variable: '', start: '', end: '', step: '', objective: 'none' });
      invalidate();
      renderEditor();
      [...editor.querySelectorAll('select[aria-label="Variable to test"]')].at(-1)?.focus();
    });
    addRange.disabled = model.testRanges.length >= model.variables.length;
    testHeading.append(node('h3', 'Test variables'), addRange);
    editor.append(testHeading, node('p',
      'Test every combination of the ranges below. Use Minimize or Maximize to rank combinations that break even. The first objective in the list takes priority; move a range up or down to change its priority. Tested values replace that variable’s monthly overrides.', 'text-muted'));
    model.testRanges.forEach((range, index) => {
      const row = node('fieldset', null, 'business-fields business-editor-row');
      row.append(node('legend', `Test range ${index + 1}`));
      field(row, 'Variable to test', range, 'variable', { options: variableOptions(), variable: true });
      inputNumber(row, 'Test from', range, 'start');
      inputNumber(row, 'Test to', range, 'end');
      inputNumber(row, 'Test step', range, 'step', '1');
      selector(row, 'Objective', range, 'objective', [
        ['none', 'Compare only'], ['minimize', 'Minimize'], ['maximize', 'Maximize']
      ]);
      const orderControls = node('div', null, 'business-row-heading');
      for (const [delta, label] of [[-1, 'Move up'], [1, 'Move down']]) {
        const next = index + delta;
        const move = button(label, () => {
          [model.testRanges[index], model.testRanges[next]] = [model.testRanges[next], model.testRanges[index]];
          invalidate();
          renderEditor();
          editor.querySelectorAll('select[aria-label="Objective"]')[next]?.focus();
        });
        move.disabled = next < 0 || next >= model.testRanges.length;
        orderControls.append(move);
      }
      row.append(orderControls);
      row.append(button('Remove test variable', () => {
        model.testRanges.splice(index, 1);
        invalidate();
        renderEditor();
        editor.querySelector('select[aria-label="Variable to test"]')?.focus();
      }));
      editor.append(row);
    });
    editor.append(node('h3', 'Optional cash balance check for the preview'));
    const conditionFields = node('div', null, 'business-fields');
    selector(conditionFields, 'Break-even check', model.breakEven, 'mode', [
      ['none', 'Off'], ['ending', 'Ending balance at least'], ['lowest', 'Every monthly closing balance at least']
    ], true);
    if (model.breakEven.mode !== 'none') {
      field(conditionFields, 'Break-even account', model.breakEven, 'accountId',
        { accounts: true, empty: 'Use business cash account', missingLabel: 'Missing account' });
      inputNumber(conditionFields, 'Break-even balance', model.breakEven, 'threshold', '0');
    }
    editor.append(conditionFields);
  }

  function renderProjection(plan, baseline, projected) {
    const cash = accountRows(projected, plan.cashAccountId);
    const baseCash = accountRows(baseline, plan.cashAccountId);
    const owner = accountRows(projected, plan.ownerAccountId);
    const baseOwner = accountRows(baseline, plan.ownerAccountId);
    const caseText = chosenCase ? ` · ${describeCase(chosenCase)}` : '';
    const output = node('div', null, 'business-projection');
    output.append(node('h3', `Preview${caseText}`),
      node('p', `${plan.rules.length} proposed Plan Rule(s) · Lowest projected closing cash: ${currencies(minimumBalance(cash))} · ${floorResult(plan, cash)}`));
    output.append(node('p', `Ending business cash: ${currencies(cash.at(-1)?.balance)}${plan.ownerAccountId ? ` · Ending owner cash: ${currencies(owner.at(-1)?.balance)}` : ''}`));
    if (plan.breakEven) {
      output.append(node('p', `Cash balance check: ${describeBreakEven(plan.breakEven)} — ${breakEvenResult(evaluateBusinessBreakEven(plan.breakEven, projected))}`));
    }
    if (plan.deferredCount) output.append(node('p', `${plan.deferredCount} payment(s) land after the scenario end and are not included. Extend the scenario timeframe to see them.`, 'text-muted'));
    const rows = cash.map((row, index) => {
      const month = row.date.slice(0, 7);
      const { revenue = 0, cost = 0 } = plan.totals.get(month) || {};
      return [month, currencies(revenue), currencies(cost), currencies(revenue - cost),
        currencies(baseCash[index]?.balance), currencies(row.balance),
        currencies(row.balance - (baseCash[index]?.balance ?? 0)),
        ...(plan.ownerAccountId ? [currencies(baseOwner[index]?.balance), currencies(owner[index]?.balance)] : [])];
    });
    output.append(table('Monthly cash flow and projected closing balances',
      ['Month', 'Scheduled revenue', 'Scheduled costs', 'Scheduled operating net', 'Cash without model', 'Cash with model', 'Cash difference',
        ...(plan.ownerAccountId ? ['Owner without model', 'Owner with model'] : [])], rows));
    const detail = node('details');
    detail.append(node('summary', `Review proposed Plan Rules (${plan.rules.length})`));
    detail.append(table('Proposed account movements', ['Plan Rule', 'From', 'To', 'Amount', 'Schedule'], plan.rules.map(rule => [
      rule.description,
      accountName(rule.transactionTypeId === 1 ? rule.secondaryAccountId : rule.primaryAccountId),
      accountName(rule.transactionTypeId === 1 ? rule.primaryAccountId : rule.secondaryAccountId),
      currencies(rule.amount),
      rule.recurrence ? `Monthly · ${rule.effectiveDate} → ${rule.recurrence.endDate}` : rule.effectiveDate
    ])));
    output.append(detail);
    return output;
  }

  async function run(sweep) {
    if (busy) return;
    const ticket = ++generation;
    const active = () => ticket === generation && isRenderCurrent() && root.isConnected;
    busy = true;
    previewButton.disabled = sweepButton.disabled = true;
    cancelTestButton.hidden = !sweep;
    results.replaceChildren();
    status.textContent = sweep ? 'Testing variable values…' : 'Calculating projections…';
    try {
      const latest = await getScenario();
      if (!active()) return;
      if (!latest || latest.id !== scenario.id) throw new Error('Reopen Scenario Setup for the active scenario.');
      const currentPlan = buildBusinessModelPlan(latest, model);
      const cases = sweep ? getBusinessModelTestCases(model) : [];
      const available = getBusinessOperatingMonths(currentPlan);
      const start = available.indexOf(monthPicker.value);
      const length = Number(lengthPicker.value);
      if (sweep && (start < 0 || !Number.isInteger(length) || length < 1 || start + length > available.length)) {
        throw new Error('Choose a break-even window made of full months inside the scenario timeframe.');
      }
      const window = { months: available.slice(start, start + length), includeRepayments: repaymentPicker.checked };
      const options = { startDate: currentPlan.startDate, endDate: currentPlan.endDate, periodTypeId: 3 };
      const baseline = await generateProjectionsForScenario(latest, options);
      const project = plan => generateProjectionsForScenario({
        ...latest, transactions: [...(latest.transactions || []), ...plan.rules]
      }, options);
      const projected = await project(currentPlan);
      if (!active()) return;
      chosenCase = null;
      const detail = node('div');
      detail.append(renderProjection(currentPlan, baseline, projected));
      if (sweep) {
        let metCount = 0;
        let unavailableCount = 0;
        let best = null;
        const resultIndex = createResultIndex();
        const cashMetric = (label, field, kind = 'currency') => [label, index => resultIndex.get(index, field), kind];
        const operatingMetrics = [
          ['Operating revenue', 'revenue'], ['Other revenue', 'otherRevenue'],
          ['Operating expenses', 'cost'], ['Other expenses', 'otherCost'],
          ...(window.includeRepayments ? [['Financing repayments', 'repayments']] : [])
        ];
        const metrics = [
          ...cases.at(0).map(({ id }, dimension) => [variableName(id), index => cases.valueAt(index, dimension)]),
          ...operatingMetrics.map(([label, field]) => cashMetric(label, field)),
          cashMetric('Break-even result', 'breakEvenMargin', 'status')
        ];
        const headers = metrics.map(([name]) => name);

        function evaluateCase(index) {
          const entry = cases.at(index);
          const values = entry.map(variable => variable.value);
          let plan;
          try {
            plan = buildBusinessModelPlan(latest, model, entry);
          } catch (error) {
            return {
              index, entry, valid: false, unavailable: true,
              error: error.message,
              row: [...values, ...operatingMetrics.map(() => '—'), 'Not evaluated']
            };
          }
          const amounts = evaluateBusinessOperatingWindow(plan, window);
          const { net, met } = amounts;
          return {
            index, entry, valid: true, met, net,
            sortValues: { ...amounts, breakEvenMargin: net },
            row: [...values, ...operatingMetrics.map(([, field]) => currencies(amounts[field])),
              met ? `Meets target · ${currencies(net)} net` : `Short by ${currencies(-net)}`]
          };
        }

        const firstPage = [];
        status.textContent = `Testing 0 of ${cases.length.toLocaleString()} combinations…`;
        await yieldToBrowser();
        for (let index = 0; index < cases.length && active(); index++) {
          const result = evaluateCase(index);
          resultIndex.append(index, result);
          if (result.met) metCount++;
          if (isBetterBusinessTestCase(result, best, cases)) best = { index, net: result.net };
          if (result.unavailable) unavailableCount++;
          if (index < RESULTS_PER_PAGE) firstPage.push(result);
          if ((index + 1) % CASES_PER_BATCH === 0 && active()) {
            status.textContent = `Testing ${(index + 1).toLocaleString()} of ${cases.length.toLocaleString()} combinations…`;
            await yieldToBrowser();
          }
        }
        if (!active()) return;

        const dateRange = length === 1 ? window.months[0] : `${window.months[0]} to ${window.months.at(-1)}`;
        const summary = `${metCount.toLocaleString()} of ${cases.length.toLocaleString()} combinations meet break-even${unavailableCount ? ` · ${unavailableCount.toLocaleString()} not evaluated` : ''}.`;
        results.append(node('p', `${summary} Window: ${dateRange} · Financing repayments ${window.includeRepayments ? 'included' : 'excluded'}.`));
        if (cases.objectives.length) {
          const recommendation = node('section', null, 'business-editor-row');
          const priorities = cases.objectives.map(({ variable, objective }) =>
            `${objective === 'minimize' ? 'Minimize' : 'Maximize'} ${variableName(variable)}`);
          recommendation.append(node('h3', 'Best tested combination'),
            node('p', `Priority: ${priorities.join(' → ')}.`));
          if (best) {
            recommendation.append(node('p', `${describeCase(cases.at(best.index))} · ${currencies(best.net)} net.`),
              button('Preview best combination', () => previewCase(best.index)));
          } else {
            recommendation.append(node('p', 'No tested combination meets break-even. Try changing the ranges or the model.'));
          }
          recommendation.append(node('p', 'If objectives tie, the higher net wins. If net also ties, the first tested combination wins. Table filters don’t change this recommendation.', 'text-muted'));
          results.append(recommendation);
        }
        results.append(node('p', 'To find the lowest passing input, show only passing results and sort that variable low to high. Select a result to see its full monthly preview below.'));
        const pageContent = node('div', null, 'business-results');
        const navigation = node('div', null, 'business-row-heading');
        const pageLabel = node('span');
        let pageStart = 0;
        let visibleIndices = null;
        let viewRequest = 0;
        let selectedCaseRequest = 0;
        let selectedIndex = null;
        const resetPreview = button('Preview current inputs', () => previewCase(null));
        const previous = button('Previous results', () => showPage(pageStart - RESULTS_PER_PAGE));
        const next = button('Next results', () => showPage(pageStart + RESULTS_PER_PAGE));
        navigation.append(previous, pageLabel, next);
        const controls = node('div', null, 'business-row-heading');
        const sortLabel = node('label', 'Sort results ');
        const sortSelect = node('select', null, 'input-select');
        sortSelect.append(new Option('Test order', ''));
        for (const [i, [name]] of metrics.entries()) {
          sortSelect.append(new Option(`${name}: low to high`, `${i}:1`), new Option(`${name}: high to low`, `${i}:-1`));
        }
        sortLabel.append(sortSelect);
        controls.append(sortLabel, resetPreview);
        const meetsOnly = node('input');
        meetsOnly.type = 'checkbox';
        const filterLabel = node('label', ' Meets break-even only');
        filterLabel.prepend(meetsOnly);
        controls.append(filterLabel);
        const filterForm = node('form', null, 'business-results');
        const filterError = node('p');
        filterError.setAttribute('aria-live', 'polite');
        let appliedFilters = [];
        const filterInputs = metrics.map(([name, , kind]) => {
          const input = node(kind === 'status' ? 'select' : 'input', null,
            `business-column-filter ${kind === 'status' ? 'input-select' : 'input-text'}`);
          input.setAttribute('aria-label', `Filter ${name}`);
          if (kind === 'status') {
            input.append(new Option('Any status', ''), new Option('Meets target', 'met'),
              new Option('Below target', 'below'), new Option('Not evaluated', 'unavailable'));
          } else {
            input.placeholder = 'Any value';
          }
          return input;
        });
        const filterActions = node('div', null, 'business-row-heading');
        const applyFilters = node('button', 'Apply column filters', 'btn btn-primary');
        applyFilters.type = 'submit';
        const clearFilters = button('Clear column filters', () => {
          filterForm.reset();
          applyColumnFilters();
        });
        filterActions.append(applyFilters, clearFilters);
        filterForm.append(node('p', 'Enter an exact value or separate several with semicolons (for example, 10; 20). A result must match every filled column.', 'text-muted'),
          filterActions, filterError, pageContent);
        filterForm.addEventListener('submit', event => {
          event.preventDefault();
          applyColumnFilters();
        });
        function applyColumnFilters() {
          try {
            const nextFilters = [];
            metrics.forEach(([name, valueAt, kind], column) => {
              const matches = compileColumnFilter(filterInputs[column].value, kind, name);
              if (matches) nextFilters.push(index => matches(valueAt(index)));
            });
            appliedFilters = nextFilters;
            filterError.textContent = '';
            void refreshOrder();
          } catch (error) {
            filterError.textContent = error.message;
          }
        }
        const visibleCount = () => visibleIndices?.length ?? cases.length;
        const resultMessage = node('p');
        resultMessage.setAttribute('aria-live', 'polite');
        sortSelect.addEventListener('change', refreshOrder);
        meetsOnly.addEventListener('change', refreshOrder);
        const comparison = table('Compare test values', headers, [], index => {
          sortSelect.value = `${index}:${sortSelect.value === `${index}:1` ? -1 : 1}`;
          void refreshOrder();
        }, filterInputs);
        pageContent.append(comparison);
        const comparisonHeaders = comparison.querySelectorAll('thead th');
        const comparisonBody = comparison.querySelector('tbody');

        async function refreshOrder() {
          const request = ++viewRequest;
          const live = () => active() && request === viewRequest;
          const filter = meetsOnly.checked;
          const sort = sortSelect.value;
          const filters = appliedFilters;
          previous.disabled = next.disabled = true;
          resultMessage.textContent = 'Updating results…';
          await yieldToBrowser();
          if (!live()) return;
          let order = null;
          if (filter || sort || filters.length) {
            order = [];
            for (let index = 0; index < cases.length; index++) {
              if ((!filter || resultIndex.get(index, 'met')) && filters.every(matches => matches(index))) order.push(index);
              if ((index + 1) % 16384 === 0) {
                await yieldToBrowser();
                if (!live()) return;
              }
            }
            if (sort) {
              const [metric, direction] = sort.split(':').map(Number);
              const valueAt = metrics[metric][1];
              order.sort((left, right) => {
                const a = valueAt(left), b = valueAt(right);
                if (!Number.isFinite(a)) return Number.isFinite(b) ? 1 : left - right;
                if (!Number.isFinite(b)) return -1;
                return direction * (a - b) || left - right;
              });
            }
          }
          visibleIndices = order;
          await showPage(0);
        }

        function renderPage(start, page) {
          pageStart = start;
          previous.disabled = start <= 0;
          next.disabled = start + page.length >= visibleCount();
          navigation.classList.toggle('hidden', visibleCount() <= RESULTS_PER_PAGE);
          pageLabel.textContent = `${(start + 1).toLocaleString()}–${(start + page.length).toLocaleString()} of ${visibleCount().toLocaleString()} combinations`;
          resultMessage.textContent = visibleCount() ? `Showing ${pageLabel.textContent}.`
            : appliedFilters.length ? 'No combinations match the selected filters.' : 'No combinations meet the break-even condition.';
          const [column, direction] = sortSelect.value ? sortSelect.value.split(':').map(Number) : [null, null];
          comparisonHeaders.forEach((th, index) => {
            if (index === column) th.setAttribute('aria-sort', direction === 1 ? 'ascending' : 'descending');
            else th.removeAttribute('aria-sort');
          });
          let rowIndex = 0;
          fillTableRows(comparisonBody, page.map(result => result.row), row => {
            const { index, entry, valid, error } = page[rowIndex++];
            if (!valid) {
              row.title = error;
              return;
            }
            const pick = button(String(entry[0].value), () => previewCase(index), 'business-sort-header business-preview-link');
            pick.setAttribute('aria-label', `Preview ${describeCase(entry)}`);
            row.cells[0].replaceChildren(pick);
            row.dataset.previewIndex = index;
            row.addEventListener('click', event => {
              if (!event.target.closest('button')) void previewCase(index);
            });
          });
          markSelected();
        }

        async function showPage(start) {
          if (start < 0 || (start && start >= visibleCount()) || !active()) return;
          const request = ++viewRequest;
          const live = () => active() && request === viewRequest;
          previous.disabled = next.disabled = true;
          try {
            const page = start === 0 && visibleIndices === null ? firstPage : [];
            if (page !== firstPage) {
              for (let offset = 0; offset < RESULTS_PER_PAGE && start + offset < visibleCount() && live(); offset++) {
                const position = start + offset;
                const index = visibleIndices?.[position] ?? position;
                page.push(firstPage[index] ?? evaluateCase(index));
                if ((offset + 1) % CASES_PER_BATCH === 0) await yieldToBrowser();
              }
            }
            if (live()) renderPage(start, page);
          } catch (error) {
            if (live()) {
              resultMessage.textContent = error.message;
              previous.disabled = pageStart === 0;
              next.disabled = visibleCount() - pageStart <= RESULTS_PER_PAGE;
            }
          }
        }

        function markSelected() {
          for (const row of comparisonBody.querySelectorAll('[data-preview-index]')) {
            const selected = selectedIndex !== null && Number(row.dataset.previewIndex) === selectedIndex;
            row.classList.toggle('is-previewed', selected);
            row.querySelector('button').setAttribute('aria-pressed', String(selected));
          }
        }
        async function previewCase(index) {
          const request = ++selectedCaseRequest;
          try {
            const entry = index === null ? null : cases.at(index);
            const plan = entry ? buildBusinessModelPlan(latest, model, entry) : currentPlan;
            const rows = entry ? await project(plan) : projected;
            if (!active() || request !== selectedCaseRequest) return;
            chosenCase = entry;
            selectedIndex = index;
            markSelected();
            detail.replaceChildren(renderProjection(plan, baseline, rows));
          } catch (error) {
            if (active() && request === selectedCaseRequest) status.textContent = error.message;
          }
        }
        const guide = node('details');
        guide.append(node('summary', 'What the result columns mean'));
        const descriptions = node('dl');
        const terms = [
          ['Test values', 'Each row is a tested combination. Select it to see monthly cash flow and closing balances for the full scenario.'],
          ['Operating revenue and expenses', 'Totals for the selected window. Expenses are shown as positive amounts to subtract.'],
          ['Other revenue and other expenses', 'Amounts from flows that do not depend on the tested variables. These are already included in the operating totals, not added again.'],
          ['Break-even result', 'Scheduled operating receipts minus operating payments during the selected window. A net of zero or more passes. Startup costs, funding and opening balances are excluded. Repayments count only when selected. The preview still shows the full projected cash position.']
        ];
        for (const [term, description] of terms) descriptions.append(node('dt', term), node('dd', description));
        guide.append(descriptions);
        results.append(controls, guide, resultMessage, filterForm, navigation);
        renderPage(0, firstPage);
      }
      results.append(detail);
      status.textContent = 'Preview only. No accounts, Plan Rules, actuals, or saved projections were changed.';
    } catch (error) {
      if (active()) status.textContent = error.message;
    } finally {
      if (active()) {
        busy = false;
        previewButton.disabled = sweepButton.disabled = false;
        cancelTestButton.hidden = true;
      }
    }
  }

  const previewButton = button('Preview projections', () => run(false), 'btn btn-primary');
  const sweepButton = button('Test range', () => run(true));
  const cancelTestButton = button('Cancel test', () => {
    invalidate();
    status.textContent = 'Range test canceled. No plan data was changed.';
  });
  cancelTestButton.hidden = true;
  const save = button('Save setup', async () => {
    save.disabled = true;
    try {
      await onSave(normalizeBusinessModel(model));
      if (root.isConnected) status.textContent = 'Setup saved. No Plan Rules were changed.';
    } catch (error) {
      if (root.isConnected) status.textContent = error.message;
    } finally {
      save.disabled = false;
    }
  });
  const actions = node('div', null, 'business-row-heading');
  const monthLabel = node('label', 'Window start month ');
  const monthPicker = node('select', null, 'input-select');
  for (const month of operatingMonths) monthPicker.append(new Option(month, month));
  if (!operatingMonths.length) {
    monthPicker.append(new Option('No full months in scenario', ''));
    monthPicker.disabled = true;
  }
  monthLabel.append(monthPicker);
  const lengthLabel = node('label', 'Window length ');
  const lengthPicker = node('select', null, 'input-select');
  for (const [length, label] of [[1, '1 month'], [3, '3 months'], [12, '12 months']]) {
    lengthPicker.append(new Option(label, length));
  }
  lengthLabel.append(lengthPicker);
  const repaymentLabel = node('label', ' Include financing repayments');
  const repaymentPicker = node('input');
  repaymentPicker.type = 'checkbox';
  repaymentLabel.prepend(repaymentPicker);
  for (const control of [monthPicker, lengthPicker, repaymentPicker]) {
    control.addEventListener('change', invalidate);
  }
  const windowFields = node('fieldset', null, 'business-editor-row');
  const windowControls = node('div', null, 'business-row-heading');
  windowControls.append(monthLabel, lengthLabel, repaymentLabel, sweepButton, cancelTestButton);
  windowFields.append(node('legend', 'Operating break-even window'),
    node('p', 'Tests whether modeled receipts cover operating costs in the selected window, independent of opening cash.', 'text-muted'),
    windowControls);
  actions.append(previewButton, save);
  root.append(node('h3', 'Business Model'), node('p',
    `Build a business from reusable variables and account movements. Preview uses the scenario timeframe (${timeframe.startDate || '—'} to ${timeframe.endDate || '—'}) and includes its current plan and actuals. Flows use that timeframe and have no payment delay unless you change Timing.`,
    'text-muted'), editor, actions, windowFields, status, results);
  renderEditor();
}
