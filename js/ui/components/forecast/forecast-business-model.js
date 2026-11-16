import {
  BUSINESS_FLOW_KINDS, BUSINESS_RATE_MODELS,
  buildBusinessModelPlan, evaluateBusinessBreakEven, getBusinessModelTestCases, normalizeBusinessModel
} from '../../../domain/calculations/business-model.js?v=workshop-results-1';
import { generateProjectionsForScenario } from '../../../domain/calculations/projection-engine.js';
import { formatCurrency } from '../../../shared/format-utils.js';
import { createScenarioAccountSelectors } from '../widgets/scenario-account-select.js?v=workshop-accounts-1';

const drafts = new WeakMap();
let nextDisclosureId = 0;
const RESULTS_PER_PAGE = 50;
const CASES_PER_BATCH = 8;
const RESULT_INDEX_CHUNK = 4096;
const CASH_RESULT_FIELDS = ['business', 'lowest', 'operatingNet', 'owner', 'floorMargin', 'breakEvenMargin'];
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

function table(title, headings, rows, sort = null) {
  const wrapper = node('div', null, 'business-table-scroll');
  const grid = node('table', null, 'business-table');
  grid.append(node('caption', title));
  const head = grid.createTHead().insertRow();
  headings.forEach((name, index) => {
    const th = node('th', sort ? null : name);
    th.scope = 'col';
    if (sort) {
      const direction = sort.column === index ? sort.direction : null;
      if (direction) th.setAttribute('aria-sort', direction === 1 ? 'ascending' : 'descending');
      const toggle = button(name, () => sort.onSort(index, direction === 1 ? -1 : 1), 'business-sort-header');
      toggle.dataset.sortColumn = String(index);
      const indicator = node('span', null, 'business-sort-indicator');
      indicator.setAttribute('aria-hidden', 'true');
      toggle.append(indicator);
      th.append(toggle);
    }
    head.append(th);
  });
  const body = grid.createTBody();
  rows.forEach(row => {
    const tr = body.insertRow();
    row.forEach(value => { tr.insertCell().textContent = value; });
  });
  wrapper.append(grid);
  return wrapper;
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
      model.testRanges.push({ variable: '', start: '', end: '', step: '' });
      invalidate();
      renderEditor();
      [...editor.querySelectorAll('select[aria-label="Variable to test"]')].at(-1)?.focus();
    });
    addRange.disabled = model.testRanges.length >= model.variables.length;
    testHeading.append(node('h3', 'Test variables'), addRange);
    editor.append(testHeading, node('p',
      'Test every combination of the ranges below. Tested values replace the selected variables for every month; other variables keep their monthly overrides.', 'text-muted'));
    model.testRanges.forEach((range, index) => {
      const row = node('fieldset', null, 'business-fields business-editor-row');
      row.append(node('legend', `Test range ${index + 1}`));
      field(row, 'Variable to test', range, 'variable', { options: variableOptions(), variable: true });
      inputNumber(row, 'Test from', range, 'start');
      inputNumber(row, 'Test to', range, 'end');
      inputNumber(row, 'Test step', range, 'step', '1');
      row.append(button('Remove test variable', () => {
        model.testRanges.splice(index, 1);
        invalidate();
        renderEditor();
        editor.querySelector('select[aria-label="Variable to test"]')?.focus();
      }));
      editor.append(row);
    });
    editor.append(node('h3', 'Break-even condition'));
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
    if (plan.breakEven) {
      output.append(node('p', `Break-even: ${describeBreakEven(plan.breakEven)} — ${breakEvenResult(evaluateBusinessBreakEven(plan.breakEven, projected))}`));
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
        const breakEven = currentPlan.breakEven;
        const resultIndex = createResultIndex();
        const cashMetric = (label, field) => [label, index => resultIndex.get(index, field)];
        const metrics = [
          ...cases.at(0).map(({ id }, dimension) => [variableName(id), index => cases.valueAt(index, dimension)]),
          cashMetric('Ending business cash', 'business'),
          cashMetric('Lowest closing cash', 'lowest'),
          cashMetric('Scheduled operating net', 'operatingNet'),
          ...(currentPlan.ownerAccountId ? [cashMetric('Ending owner cash', 'owner')] : []),
          cashMetric('Cash floor check', 'floorMargin'),
          ...(breakEven ? [cashMetric('Break-even result', 'breakEvenMargin')] : [])
        ];
        const headers = metrics.map(([name]) => name);

        async function evaluateCase(index) {
          const entry = cases.at(index);
          const values = entry.map(variable => variable.value);
          let plan;
          try {
            plan = buildBusinessModelPlan(latest, model, entry);
          } catch (error) {
            return {
              index, entry, valid: false, unavailable: true,
              row: [...values, '—', '—', '—', ...(currentPlan.ownerAccountId ? ['—'] : []),
                error.message, ...(breakEven ? ['Not evaluated'] : [])]
            };
          }
          const withModel = await project(plan);
          const cash = accountRows(withModel, plan.cashAccountId);
          const owner = accountRows(withModel, plan.ownerAccountId);
          const lowest = minimumBalance(cash);
          const operatingNet = [...plan.totals.values()].reduce((net, values) => net + values.revenue - values.cost, 0);
          const outcome = evaluateBusinessBreakEven(plan.breakEven, withModel);
          const sortValues = {
            business: cash.at(-1)?.balance,
            lowest,
            operatingNet,
            owner: owner.at(-1)?.balance,
            floorMargin: plan.minimumCash == null || lowest == null ? null : lowest - plan.minimumCash,
            breakEvenMargin: outcome?.balance == null ? null : outcome.balance - plan.breakEven.threshold
          };
          return {
            index, entry, valid: true, met: outcome?.status === 'met', unavailable: outcome?.status === 'unavailable',
            sortValues,
            row: [...values, currencies(sortValues.business), currencies(lowest), currencies(operatingNet),
              ...(plan.ownerAccountId ? [currencies(sortValues.owner)] : []), floorResult(plan, cash),
              ...(breakEven ? [breakEvenResult(outcome)] : [])]
          };
        }

        const firstPage = [];
        status.textContent = `Testing 0 of ${cases.length.toLocaleString()} combinations…`;
        await yieldToBrowser();
        for (let index = 0; index < cases.length && active(); index++) {
          const result = await evaluateCase(index);
          resultIndex.append(index, result);
          if (result.met) metCount++;
          if (result.unavailable) unavailableCount++;
          if (index < RESULTS_PER_PAGE) firstPage.push(result);
          if ((index + 1) % CASES_PER_BATCH === 0 && active()) {
            status.textContent = `Testing ${(index + 1).toLocaleString()} of ${cases.length.toLocaleString()} combinations…`;
            await yieldToBrowser();
          }
        }
        if (!active()) return;

        if (breakEven) {
          const summary = `${metCount.toLocaleString()} of ${cases.length.toLocaleString()} combinations meet break-even${unavailableCount ? ` · ${unavailableCount.toLocaleString()} not evaluated` : ''}.`;
          results.append(node('p', `${summary} ${describeBreakEven(breakEven)}.`));
        }
        const pageContent = node('div', null, 'business-results');
        const navigation = node('div', null, 'business-row-heading');
        const pageLabel = node('span');
        let pageStart = 0;
        let visibleIndices = null;
        let viewRequest = 0;
        let selectedCaseRequest = 0;
        const select = node('select', null, 'input-select');
        select.setAttribute('aria-label', 'Preview test case');
        const selectRow = node('div', null, 'business-fields');
        const label = node('label', 'Preview test case');
        label.append(select);
        selectRow.append(label);
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
        controls.append(sortLabel);
        const meetsOnly = node('input');
        meetsOnly.type = 'checkbox';
        if (breakEven) {
          const filterLabel = node('label', ' Meets break-even only');
          filterLabel.prepend(meetsOnly);
          controls.append(filterLabel);
        }
        const visibleCount = () => visibleIndices?.length ?? cases.length;
        const resultMessage = node('p');
        resultMessage.setAttribute('aria-live', 'polite');
        sortSelect.addEventListener('change', refreshOrder);
        meetsOnly.addEventListener('change', refreshOrder);

        async function refreshOrder() {
          const request = ++viewRequest;
          const live = () => active() && request === viewRequest;
          const filter = meetsOnly.checked;
          const sort = sortSelect.value;
          previous.disabled = next.disabled = true;
          resultMessage.textContent = 'Updating results…';
          await yieldToBrowser();
          if (!live()) return;
          let order = null;
          if (filter || sort) {
            order = [];
            for (let index = 0; index < cases.length; index++) {
              if (!filter || resultIndex.get(index, 'met')) order.push(index);
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
          resultMessage.textContent = visibleCount() ? `Showing ${pageLabel.textContent}.` : 'No combinations meet the break-even condition.';
          const focusedColumn = pageContent.contains(document.activeElement) ? document.activeElement.dataset.sortColumn : null;
          const [column, direction] = sortSelect.value ? sortSelect.value.split(':').map(Number) : [null, null];
          const sort = { column, direction, onSort(index, nextDirection) {
            sortSelect.value = `${index}:${nextDirection}`;
            void refreshOrder();
          } };
          pageContent.replaceChildren(...(page.length ? [table('Compare test values', headers, page.map(result => result.row), sort)] : []));
          if (focusedColumn != null) pageContent.querySelector(`[data-sort-column="${focusedColumn}"]`)?.focus({ preventScroll: true });
          select.replaceChildren(new Option('Current inputs', ''));
          for (const { index, entry, valid } of page) {
            if (valid) select.append(new Option(entry.length === 1 ? String(entry[0].value) : describeCase(entry), String(index)));
          }
          selectedCaseRequest++;
          chosenCase = null;
          detail.replaceChildren(renderProjection(currentPlan, baseline, projected));
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
                page.push(firstPage[index] ?? await evaluateCase(index));
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

        select.addEventListener('change', async () => {
          const request = ++selectedCaseRequest;
          try {
            const entry = select.value === '' ? null : cases.at(Number(select.value));
            const plan = entry ? buildBusinessModelPlan(latest, model, entry) : currentPlan;
            const rows = entry ? await project(plan) : projected;
            if (!active() || request !== selectedCaseRequest) return;
            chosenCase = entry;
            detail.replaceChildren(renderProjection(plan, baseline, rows));
          } catch (error) {
            if (active() && request === selectedCaseRequest) status.textContent = error.message;
          }
        });
        results.append(controls, resultMessage, pageContent, navigation, selectRow);
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
  actions.append(previewButton, sweepButton, cancelTestButton, save);
  root.append(node('h3', 'Business Model'), node('p',
    `Build a business from reusable variables and account movements. Preview uses the scenario timeframe (${timeframe.startDate || '—'} to ${timeframe.endDate || '—'}) and includes its current plan and actuals. Flows use that timeframe and have no payment delay unless you change Timing.`,
    'text-muted'), editor, actions, status, results);
  renderEditor();
}
