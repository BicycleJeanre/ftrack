// Pure matching rules. No statement text is sent to an external service.
export const mappingText = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
export const MAPPING_FIELDS = ['description','originalDescription','category','parentCategory'];

export function normalizeStatementMapping(rule, accounts) {
  if(typeof rule.pattern!=='string' || rule.id && typeof rule.id!=='string') throw new Error('Mapping text and ID must be strings.');
  const result = {
    id:String(rule.id || ''), accountId:Number(rule.accountId),
    field:String(rule.field || 'originalDescription'), pattern:String(rule.pattern || '').trim(),
    comparison:String(rule.comparison || 'contains'), direction:String(rule.direction || 'out'),
    action:String(rule.action || 'prefer-match'), secondaryAccountId:rule.action === 'ignore' ? null : Number(rule.secondaryAccountId)
  };
  if (!result.id || !accounts.some(a=>Number(a.id)===result.accountId)) throw new Error('Choose an existing primary account.');
  if (!MAPPING_FIELDS.includes(result.field) || !['exact','contains'].includes(result.comparison) || !['in','out'].includes(result.direction)) throw new Error('Invalid mapping condition.');
  if (!result.pattern || result.pattern.length>500) throw new Error('Enter a mapping pattern of 1–500 characters.');
  if (!['prefer-match','create','ignore'].includes(result.action)) throw new Error('Invalid mapping action.');
  if(result.action!=='ignore' && (result.secondaryAccountId===result.accountId || !accounts.some(a=>Number(a.id)===result.secondaryAccountId))) throw new Error('Choose a different, existing secondary account.');
  return result;
}

export function statementMappingFor(entry, rules, accountId, accounts) {
  const matches = (rules || []).filter(rule=>{
    if(Number(rule.accountId)!==Number(accountId) || rule.direction!==(entry.amountCents>0?'in':'out')) return false;
    if(rule.action!=='ignore' && !accounts.some(a=>Number(a.id)===Number(rule.secondaryAccountId))) return false;
    const value=mappingText(entry[rule.field]), pattern=mappingText(rule.pattern);
    return pattern && (rule.comparison==='exact'?value===pattern:value.includes(pattern));
  });
  if(!matches.length) return {rule:null,conflict:false};
  const signatures=new Set(matches.map(r=>JSON.stringify([r.action,r.secondaryAccountId])));
  return {rule:signatures.size===1?matches[0]:null,conflict:signatures.size>1};
}

export function counterpartyId(occurrence, accountId) {
  return Number(occurrence.primaryAccountId)===Number(accountId) ? Number(occurrence.secondaryAccountId) : Number(occurrence.primaryAccountId);
}

export function generateStatementMappingDrafts(entries, scenario, accountId, priorExamples=[]) {
  const drafts=[];const seen=new Set();
  for(const entry of entries.filter(e=>e.monetary&&!e.insufficientFunds)) {
    const pattern=entry.originalDescription || entry.description;
    const signature=JSON.stringify([mappingText(pattern),Math.sign(entry.amountCents)]);
    if(seen.has(signature)) continue;seen.add(signature);
    if(statementMappingFor(entry,scenario.statementMappings,accountId,scenario.accounts).rule) continue;
    const previous=priorExamples.filter(e=>mappingText(e.pattern)===mappingText(pattern) && e.direction===(entry.amountCents>0?'in':'out'));
    const previousIds=[...new Set(previous.map(e=>Number(e.secondaryAccountId)))];
    const haystack=mappingText(entry.description+' '+entry.originalDescription+' '+entry.category);
    const named=scenario.accounts.filter(a=>Number(a.id)!==Number(accountId) && mappingText(a.name).length>=3 && haystack.includes(mappingText(a.name)));
    const candidates=previousIds.length ? previousIds : named.map(a=>Number(a.id));
    if(candidates.length!==1) continue;
    drafts.push({accountId:Number(accountId),field:'originalDescription',pattern,comparison:'exact',direction:entry.amountCents>0?'in':'out',action:'prefer-match',secondaryAccountId:candidates[0]});
  }
  return drafts;
}
