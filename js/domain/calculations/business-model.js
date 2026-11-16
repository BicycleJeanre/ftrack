// Scenario Setup compiles assumptions into the same rules used by Plan & Actuals.
// It does not store rules, modify the scenario, or run a second balance engine.
export const BUSINESS_FLOW_KINDS = {
  revenue: 'Revenue', cost: 'Operating cost', investment: 'Startup / investment',
  funding: 'Funding received', repayment: 'Financing payment'
};

export const BUSINESS_RATE_MODELS = {
  fixed: 'Fixed amount',
  volume: 'Quantity × rate',
  occupancy: 'Capacity × occupancy % × rate',
  share: 'Percentage of a variable',
  revenueShare: 'Percentage of modeled revenue',
  stepped: 'Base amount + increase at threshold',
  tiered: 'Usage with a second rate above threshold'
};

const MAX_MONTHS = 120;
const MAX_CASES = 30;
const money = n => Math.round((n + Number.EPSILON) * 100) / 100;
const string = (value, limit = 120) => ['string', 'number'].includes(typeof value)
  ? String(value).slice(0, limit) : '';
const fromList = (list, limit, normalize) => Array.isArray(list)
  ? list.slice(0, limit).filter(item => item && typeof item === 'object').map(normalize) : [];
const pick = (value, choices, fallback) => typeof value === 'string' && Object.hasOwn(choices, value) ? value : fallback;

// Preserve incomplete drafts as typed. Validate numeric values and references at preview time.
export function normalizeBusinessModel(raw = {}) {
  const model = raw || {};
  return {
    cashAccountId: string(model.cashAccountId),
    ownerAccountId: string(model.ownerAccountId),
    minimumCash: string(model.minimumCash),
    sweep: {
      variable: string(model.sweep?.variable), start: string(model.sweep?.start),
      end: string(model.sweep?.end), step: string(model.sweep?.step)
    },
    variables: fromList(model.variables, 40, variable => ({
      id: string(variable.id), name: string(variable.name), value: string(variable.value),
      overrides: string(variable.overrides, 2400)
    })),
    flows: fromList(model.flows, 80, flow => ({
      name: string(flow.name),
      kind: pick(flow.kind, BUSINESS_FLOW_KINDS, 'revenue'),
      model: pick(flow.model, BUSINESS_RATE_MODELS, 'fixed'),
      frequency: flow.frequency === 'once' ? 'once' : 'monthly',
      startDate: string(flow.startDate, 10), endDate: string(flow.endDate, 10),
      delay: string(flow.delay), accountId: string(flow.accountId),
      counterpartyId: string(flow.counterpartyId), quantity: string(flow.quantity),
      occupancy: string(flow.occupancy), rateVariable: string(flow.rateVariable),
      rate: string(flow.rate), threshold: string(flow.threshold),
      secondRate: string(flow.secondRate), minimum: string(flow.minimum)
    }))
  };
}

function number(raw, label, { fallback, min = 0, max = 1e12, integer = false } = {}) {
  const empty = raw == null || String(raw).trim() === '';
  const value = empty ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}.`);
  }
  return value;
}

function monthNumber(date) {
  const [year, month] = date.split('-').map(Number);
  return year * 12 + month - 1;
}

function monthDate(monthIndex, day = 1) {
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function date(value, label) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)
    || monthDate(monthNumber(value), +value.slice(-2)) !== value) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return value;
}

function readVariables(variables) {
  const byId = new Map();
  for (const variable of variables) {
    const name = variable.name.trim();
    if (!name || !variable.id || byId.has(variable.id)) throw new Error('Give every variable a name and a unique ID.');
    const value = number(variable.value, name);
    const overrides = new Map();
    for (const entry of variable.overrides.split(/[\n,;]+/).filter(part => part.trim())) {
      const match = /^\s*(\d{4}-(?:0[1-9]|1[0-2]))\s*=\s*(.*?)\s*$/.exec(entry);
      if (!match || overrides.has(match[1])) throw new Error(`${name}: enter one override per month, as YYYY-MM=value.`);
      overrides.set(match[1], number(match[2], `${name} in ${match[1]}`));
    }
    byId.set(variable.id, { name, value, overrides });
  }
  return byId;
}

function getValue(byId, id, month, label, override) {
  const variable = byId.get(id);
  if (!variable) throw new Error(`${label}: select an existing variable.`);
  return override?.id === id ? override.value : variable.overrides.get(month) ?? variable.value;
}

function rateFor(flow, byId, month, revenue, override) {
  const variable = (id, label) => getValue(byId, id, month, `${flow.name} — ${label}`, override);
  const quantity = () => variable(flow.quantity, 'quantity');
  const rate = flow.rateVariable ? variable(flow.rateVariable, 'rate') : number(flow.rate, `${flow.name} — rate`);
  const threshold = () => number(flow.threshold, `${flow.name} — threshold`);
  const secondRate = () => number(flow.secondRate, `${flow.name} — second amount/rate`);
  switch (flow.model) {
    case 'volume': return quantity() * rate;
    case 'occupancy': return quantity() * number(variable(flow.occupancy, 'occupancy'), 'Occupancy %', { max: 100 }) / 100 * rate;
    case 'share': return quantity() * rate / 100;
    case 'revenueShare': return revenue * rate / 100;
    case 'stepped': return rate + (quantity() >= threshold() ? secondRate() : 0);
    case 'tiered': {
      const units = quantity();
      const limit = threshold();
      return Math.max(number(flow.minimum, `${flow.name} — minimum charge`, { fallback: 0 }),
        Math.min(units, limit) * rate + Math.max(0, units - limit) * secondRate());
    }
    default: return rate;
  }
}

export function buildBusinessModelPlan(scenario, rawModel, override = null) {
  const model = normalizeBusinessModel(rawModel);
  const timeframe = scenario.timeframe || scenario.projection?.config || {};
  const startDate = date(timeframe.startDate, 'scenario start date');
  const endDate = date(timeframe.endDate, 'scenario end date');
  const firstMonth = monthNumber(startDate);
  const lastMonth = monthNumber(endDate);
  if (startDate > endDate || lastMonth - firstMonth >= MAX_MONTHS) {
    throw new Error(`Business Model needs a scenario timeframe of at most ${MAX_MONTHS} months.`);
  }
  const accountIds = new Set((scenario.accounts || []).filter(account =>
    Number(account.id) > 0 && account.name !== 'Select Account').map(account => String(account.id)));
  if (!accountIds.has(model.cashAccountId)) throw new Error('Select a cash account to track in the preview.');
  if (model.ownerAccountId && (!accountIds.has(model.ownerAccountId) || model.ownerAccountId === model.cashAccountId)) {
    throw new Error('Select a different existing account for the owner cash preview.');
  }
  if (!model.flows.length) throw new Error('Add at least one revenue, cost, or funding row.');
  const variables = readVariables(model.variables);
  const floors = model.minimumCash === '' ? null : number(model.minimumCash, 'Minimum closing cash', { min: -1e12 });
  if (override) {
    if (!variables.has(override.id)) throw new Error('Select an existing variable to test.');
    number(override.value, 'Test value');
  }

  const flows = model.flows.map((flow, index) => {
    const name = flow.name.trim();
    if (!name) throw new Error(`Name flow ${index + 1}.`);
    const from = date(flow.startDate || startDate, `${name} start date`);
    const through = flow.frequency === 'once' ? from : date(flow.endDate || endDate, `${name} end date`);
    if (from < startDate || through > endDate || from > through) {
      throw new Error(`${name}: activity dates must be inside the scenario timeframe and in order.`);
    }
    const accountId = flow.accountId || model.cashAccountId;
    if (!accountIds.has(accountId) || (flow.counterpartyId && !accountIds.has(flow.counterpartyId))) {
      throw new Error(`${name}: select existing transaction accounts.`);
    }
    if (accountId === flow.counterpartyId) throw new Error(`${name}: the two accounts must be different.`);
    if (flow.kind === 'revenue' && flow.model === 'revenueShare') {
      throw new Error(`${name}: revenue cannot be a share of itself. Use Percentage of a variable instead.`);
    }
    return { ...flow, name, from, through, accountId, delay: number(flow.delay, `${name} — payment delay`, {
      fallback: 0, max: 24, integer: true
    }) };
  });

  const totals = new Map();
  const rules = [];
  let deferredCount = 0;
  let maxId = 0;
  for (const collection of [scenario.transactions, scenario.transactionOccurrences]) {
    for (const item of collection || []) {
      for (const field of ['id', 'sourceTransactionId', 'seriesRootId', 'supersedesTransactionId']) {
        const id = Number(item[field]);
        if (Number.isSafeInteger(id) && id > maxId) maxId = id;
      }
    }
  }
  let nextId = maxId + 1;
  const payments = new Map(flows.map(flow => [flow, []]));
  for (let index = firstMonth; index <= lastMonth; index++) {
    const month = monthDate(index).slice(0, 7);
    const activity = flows.flatMap(flow => {
      const day = +flow.from.slice(-2);
      const activityDate = monthDate(index, day);
      return activityDate >= flow.from && activityDate <= flow.through ? [{ flow, day }] : [];
    });
    let revenue = 0;
    const amounts = new Map();
    const calculate = (flow, gross) => money(number(rateFor(flow, variables, month, gross, override), `${flow.name} — calculated amount`));
    for (const { flow } of activity) {
      if (flow.kind === 'revenue') {
        const amount = calculate(flow, 0);
        amounts.set(flow, amount);
        revenue += amount;
      }
    }
    for (const { flow, day } of activity) {
      const amount = amounts.get(flow) ?? calculate(flow, revenue);
      if (!amount) continue;
      const payment = monthDate(index + flow.delay, day);
      if (payment > endDate) {
        deferredCount++;
        continue;
      }
      payments.get(flow).push({ index: index + flow.delay, date: payment, amount });
      const key = payment.slice(0, 7);
      const current = totals.get(key) || { revenue: 0, cost: 0 };
      if (flow.kind === 'revenue' || flow.kind === 'cost') current[flow.kind] = money(current[flow.kind] + amount);
      totals.set(key, current);
    }
  }

  for (const [flow, entries] of payments) {
    // Compact consecutive equal payments on stable days. Dates 29–31 stay explicit
    // so a short first month cannot change the intended payment day.
    for (let i = 0; i < entries.length;) {
      const first = entries[i];
      let j = i + 1;
      const day = +flow.from.slice(-2);
      while (day <= 28 && entries[j]?.amount === first.amount &&
        entries[j].index === entries[j - 1].index + 1) j++;
      rules.push({
        id: nextId++,
        primaryAccountId: Number(flow.accountId),
        secondaryAccountId: Number(flow.counterpartyId) || null,
        transactionTypeId: ['revenue', 'funding'].includes(flow.kind) ? 1 : 2,
        amount: first.amount, description: flow.name, effectiveDate: first.date,
        recurrence: j - i > 1 ? {
          recurrenceType: { id: 4, name: 'Monthly - Day of Month' },
          interval: 1, dayOfMonth: day, startDate: first.date, endDate: entries[j - 1].date
        } : null,
        tags: ['workshop-business-model']
      });
      i = j;
    }
  }
  return { rules, totals, deferredCount, minimumCash: floors, startDate, endDate,
    cashAccountId: Number(model.cashAccountId), ownerAccountId: Number(model.ownerAccountId) || null };
}

export function getBusinessModelTestCases(rawModel) {
  const model = normalizeBusinessModel(rawModel);
  const { variable, start, end, step } = model.sweep;
  if (!variable) throw new Error('Choose a variable to test.');
  const from = number(start, 'Test from');
  const to = number(end, 'Test to', { min: from });
  const by = number(step, 'Test step', { min: 0.000001, fallback: 1 });
  const count = Math.floor((to - from) / by + 1e-9) + 1;
  if (count > MAX_CASES) throw new Error(`Test up to ${MAX_CASES} values at a time. Increase the step or narrow the range.`);
  return Array.from({ length: count }, (_, i) => ({ id: variable, value: Number((from + i * by).toFixed(8)) }));
}
