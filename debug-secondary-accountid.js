import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load modules
const projectionEngine = await import('./js/domain/calculations/projection-engine.js');

// Simple scenario with secondaryAccountId === null
const scenario1 = {
  id: 999,
  startDate: '2026-02-01',
  endDate: '2026-03-01',
  projectionPeriod: 3,
  accounts: [{ id: 1, name: 'A1' }],
  transactions: [{
    id: 1,
    primaryAccountId: 1,
    secondaryAccountId: null,
    transactionTypeId: 1,
    amount: 100,
    effectiveDate: '2026-02-15',
    description: 'test',
    recurrence: null,
    periodicChange: null,
    status: { name: 'planned', actualAmount: null, actualDate: null },
    tags: []
  }],
  projections: [],
  budgets: []
};

const lookupData = {};
const p1 = await projectionEngine.generateProjectionsForScenario(scenario1, {}, lookupData);
console.log('With secondaryAccountId=null: balance=' + p1[p1.length-1]?.balance);

// With secondaryAccountId === 2
const scenario2 = JSON.parse(JSON.stringify(scenario1));
scenario2.transactions[0].secondaryAccountId = 2;
scenario2.accounts.push({ id: 2, name: 'A2' });

const p2 = await projectionEngine.generateProjectionsForScenario(scenario2, {}, lookupData);
console.log('With secondaryAccountId=2: balance=' + p2[0]?.balance);
console.log('Account 2, period 0: balance=' + p2.find(p => p.accountId === 2)?.balance);

// With secondaryAccountId === 1 (the original problem)
const scenario3 = JSON.parse(JSON.stringify(scenario1));
scenario3.transactions[0].secondaryAccountId = 1;

const p3 = await projectionEngine.generateProjectionsForScenario(scenario3, {}, lookupData);
console.log('With secondaryAccountId=1 (same as primary): balance=' + p3[p3.length-1]?.balance);
