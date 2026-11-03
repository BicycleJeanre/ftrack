// Local-only CSV extraction. Source strings are retained independently of normalized entries.
export const STATEMENT_HEADERS = ['Nr', 'Account', 'Posting Date', 'Transaction Date', 'Description', 'Original Description', 'Parent Category', 'Category', 'Money In', 'Money Out', 'Fee', 'Balance'];

export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  text = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || !cell) quoted = !quoted;
      else throw new Error('Unexpected quote in CSV.');
    } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      row.push(cell); cell = '';
      if (c !== ',') { if (row.some(v => v !== '')) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
    } else cell += c;
  }
  if (quoted) throw new Error('Unclosed quoted CSV field.');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function cents(value) {
  if (value === '') return 0;
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) throw new Error('Invalid monetary value in CSV.');
  const n = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(n)) throw new Error('CSV amount is too large.');
  return n;
}
function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new Error('Invalid posting date in CSV.');
  return value;
}
export function parseStatement(rawCsv) {
  if (typeof rawCsv !== 'string' || rawCsv.length > 2000000) throw new Error('Choose a CSV smaller than 2 MB.');
  const [headers, ...rows] = parseCsv(rawCsv);
  if (!headers || new Set(headers).size !== headers.length || STATEMENT_HEADERS.some(h => !headers.includes(h))) throw new Error('Unsupported CSV. Expected the bank export with Posting Date, Money In, Money Out, Fee and Balance.');
  if (!rows.length || rows.length > 10000) throw new Error('Statement must contain 1–10,000 rows.');
  const seen = new Map(); let previousBalance = null; const balanceIssues = [];
  const entries = rows.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has the wrong number of columns.`);
    const r = Object.fromEntries(headers.map((h,i) => [h,values[i]]));
    const postingDate = date(r['Posting Date']);
    const incoming = cents(r['Money In']), outgoing = cents(r['Money Out']), fee = cents(r.Fee);
    if (incoming < 0 || outgoing > 0 || fee > 0 || [incoming,outgoing,fee].filter(Boolean).length > 1) throw new Error(`Row ${index + 2}: expected one signed movement or fee per row.`);
    const amountCents = incoming + outgoing + fee;
    const balance = r.Balance === '' ? null : cents(r.Balance);
    if (!r.Account.trim()) throw new Error('CSV account is missing.');
    if (amountCents && balance === null) throw new Error('Monetary rows require a running balance.');
    if (balance !== null) {
      if (previousBalance !== null && balance !== previousBalance + amountCents) balanceIssues.push(index);
      previousBalance = balance;
    }
    const identity = JSON.stringify([r.Account,postingDate,r['Transaction Date'],r['Original Description'],incoming,outgoing,fee,balance]);
    const ordinal = (seen.get(identity) || 0) + 1; seen.set(identity,ordinal);
    return { index, postingDate, description:r.Description, originalDescription:r['Original Description'], amountCents, balanceCents:balance, fingerprint:identity + ':' + ordinal, monetary:amountCents !== 0 };
  });
  if (new Set(rows.map(r => r[headers.indexOf('Account')])).size !== 1) throw new Error('Import one bank account at a time.');
  return { headers, rows, entries, balanceIssues, sourceAccount:rows[0][headers.indexOf('Account')], startDate:entries.map(e=>e.postingDate).sort()[0], endDate:entries.map(e=>e.postingDate).sort().at(-1) };
}

export function signedOccurrenceAmount(occurrence, accountId) {
  const primary = Number(occurrence.primaryAccountId) === Number(accountId);
  if (!primary && Number(occurrence.secondaryAccountId) !== Number(accountId)) return null;
  const sign = Number(occurrence.transactionTypeId) === 1 ? 1 : -1;
  return (primary ? sign : -sign) * Math.round(Number(occurrence.status === 'actual' ? occurrence.actualAmount : occurrence.plannedAmount) * 100);
}

export function suggestStatementMatches(entry, occurrences, accountId) {
  if (!entry.monetary) return [];
  const words = s => new Set(String(s || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  const sourceWords = words(entry.description + ' ' + entry.originalDescription);
  return occurrences.flatMap(o => {
    const signed = signedOccurrenceAmount(o, accountId);
    if (signed === null || Math.sign(signed) !== Math.sign(entry.amountCents) || o.status === 'skipped' || o.baselineFrozen || o.lineItems?.length || o.transactionGroupId) return [];
    const days = Math.abs(Date.parse(entry.postingDate) - Date.parse(o.actualDate || o.plannedDate || o.scheduledDate)) / 86400000;
    if (days > 7) return [];
    const exact = signed === entry.amountCents;
    const overlap = [...words(o.description)].some(w => sourceWords.has(w));
    if (!exact && !overlap) return [];
    return [{ occurrenceKey:o.occurrenceKey, status:o.status, amount:signed / 100, date:o.actualDate || o.plannedDate || o.scheduledDate, description:o.description, score:(exact ? 60 : 0) + (overlap ? 25 : 0) + (days === 0 ? 15 : 7-days), reason:`${exact ? 'Same amount' : 'Different amount'}; ${days} day(s) apart${overlap ? '; description overlaps' : ''}` }];
  }).sort((a,b)=>b.score-a.score).slice(0,8);
}
