import * as DataStore from './storage-service.js';
import { parseStatement } from '../../shared/statement-utils.js';
import { normalizeStatementMapping } from '../../shared/statement-mapping-utils.js';

export async function saveStatementMapping(scenarioId, rule) {
  return DataStore.transaction(data=>{
    const scenario=data.scenarios.find(s=>Number(s.id)===Number(scenarioId));
    if(!scenario) throw new Error('Scenario not found.');
    const rules=scenario.statementMappings ||= [];
    if(rule.id && !rules.some(r=>r.id===rule.id)) throw new Error('This mapping was removed. Reload before saving.');
    const normalized=normalizeStatementMapping({...rule,id:rule.id || crypto.randomUUID()},scenario.accounts);
    const sameCondition=r=>Number(r.accountId)===normalized.accountId && r.field===normalized.field && r.comparison===normalized.comparison && r.direction===normalized.direction && r.pattern.toLowerCase().trim()===normalized.pattern.toLowerCase().trim();
    if(rules.some(r=>r.id!==normalized.id && sameCondition(r))) throw new Error('A rule already exists for this condition. Edit that rule instead.');
    const index=rules.findIndex(r=>r.id===normalized.id);
    if(index<0) rules.push(normalized); else rules[index]=normalized;
    return data;
  });
}

export async function removeStatementMapping(scenarioId, id) {
  return DataStore.transaction(data=>{
    const scenario=data.scenarios.find(s=>Number(s.id)===Number(scenarioId));
    if(!scenario) throw new Error('Scenario not found.');
    scenario.statementMappings=(scenario.statementMappings || []).filter(r=>r.id!==id);
    return data;
  });
}

// A bulk edit is one validated transaction: never partially update the selected rules.
export async function updateStatementMappings(scenarioId, ids, changes) {
  if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw new Error('Select at least one mapping.');
  const allowed=['secondaryAccountId','field','comparison','direction'];
  if(!changes||!Object.keys(changes).length||Object.keys(changes).some(k=>!allowed.includes(k)))throw new Error('Choose fields to change for the selected mappings.');
  return DataStore.transaction(data=>{
    const scenario=data.scenarios.find(s=>Number(s.id)===Number(scenarioId));
    if(!scenario)throw new Error('Scenario not found.');
    const rules=scenario.statementMappings || [];
    if(ids.some(id=>!rules.some(r=>r.id===id)))throw new Error('A selected mapping was removed. Reload before saving.');
    const updated=rules.map(rule=>ids.includes(rule.id)?normalizeStatementMapping({...rule,...changes},scenario.accounts):rule);
    const condition=r=>JSON.stringify([Number(r.accountId),r.field,r.comparison,r.direction,r.pattern.toLowerCase().trim()]);
    for(const rule of updated.filter(r=>ids.includes(r.id)))if(updated.some(r=>r.id!==rule.id&&condition(r)===condition(rule)))throw new Error('A rule already exists for this condition. No mappings were changed.');
    scenario.statementMappings=updated;
    return data;
  });
}

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
