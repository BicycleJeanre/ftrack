import * as DataStore from './storage-service.js';
import { parseStatement } from '../../shared/statement-utils.js';

export async function retainStatement(scenarioId, accountId, fileName, rawCsv) {
  const parsed = parseStatement(rawCsv);
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(rawCsv));
  const hash = [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  let importId;
  await DataStore.transaction(data => {
    const scenario = data.scenarios.find(s=>Number(s.id)===Number(scenarioId));
    if (!scenario?.accounts.some(a=>Number(a.id)===Number(accountId))) throw new Error('Select an existing primary account.');
    scenario.statementImports ||= [];
    if (scenario.statementImports.some(b=>parseStatement(b.rawCsv).sourceAccount===parsed.sourceAccount && Number(b.accountId)!==Number(accountId))) throw new Error('This bank account is already mapped to another FTrack account.');
    const existing = scenario.statementImports.find(b=>b.sha256===hash);
    if (existing && Number(existing.accountId)!==Number(accountId)) throw new Error('This source is already retained under a different account.');
    if (existing) { importId=existing.id; return data; }
    importId=crypto.randomUUID();
    scenario.statementImports.push({id:importId,accountId:Number(accountId),fileName:String(fileName).slice(0,255),rawCsv,headers:parsed.headers,rows:parsed.rows,sha256:hash,importedAt:new Date().toISOString(),decisions:{}});
    return data;
  });
  return importId;
}

export function appliedStatementFingerprints(scenario, accountId) {
  const seen = new Set();
  for (const batch of scenario.statementImports || []) {
    if (Number(batch.accountId)!==Number(accountId)) continue;
    const parsed = parseStatement(batch.rawCsv);
    for (const [index,decision] of Object.entries(batch.decisions || {})) {
      if (['match','create','existing'].includes(decision.action) && parsed.entries[Number(index)]) seen.add(parsed.entries[Number(index)].fingerprint);
    }
  }
  return seen;
}
