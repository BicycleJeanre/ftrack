// Pure matching rules. No statement text is sent to an external service.
export const mappingText = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
// Keep merchant identity, discard volatile bank references rather than fuzzy-match arbitrary words.
export function relevantMappingText(value) {
  return mappingText(value)
    .replace(/\b(?:reference|ref|auth|authorization|trace|card no|card number)\s*[:#-]?\s*\S.*$/i,'')
    .replace(/\b\d{1,4}[/-]\d{1,2}(?:[/-]\d{1,4})?\b/g,' ')
    .replace(/\b\S*\d{3,}\S*\b/g,' ')
    .replace(/^(?:card purchase|pos purchase|pos payment|card payment|purchase)\s*[:*-]?\s*/i,'')
    .replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
}
export const MAPPING_FIELDS = ['description','originalDescription','category','parentCategory'];
export const MAPPING_FIELD_LABELS = {description:'Description',originalDescription:'Original description',category:'Category',parentCategory:'Parent category'};
export function statementMappingLabel(mapping, accounts) {
  if(mapping.conflict)return 'Conflicting saved mapping rules';
  const rule=mapping.rule;if(!rule)return 'No saved mapping';
  return `${MAPPING_FIELD_LABELS[rule.field]} ${rule.comparison==='exact'?'equals':'contains'} “${rule.pattern}” → ${rule.action==='ignore'?'Ignore':accounts.find(a=>Number(a.id)===Number(rule.secondaryAccountId))?.name || '(missing account)'}`;
}

export function normalizeStatementMapping(rule, accounts) {
  if(typeof rule.pattern!=='string' || rule.id && typeof rule.id!=='string') throw new Error('Mapping text and ID must be strings.');
  const result = {
    id:String(rule.id || ''), accountId:Number(rule.accountId),
    field:String(rule.field || 'originalDescription'), pattern:String(rule.pattern || '').trim(),
    comparison:String(rule.comparison || 'contains'), direction:String(rule.direction || 'out'),
    ...(rule.action ? {action:String(rule.action)} : {}), secondaryAccountId:rule.action === 'ignore' ? null : Number(rule.secondaryAccountId)
  };
  if (!result.id || !accounts.some(a=>Number(a.id)===result.accountId)) throw new Error('Choose an existing primary account.');
  if (!MAPPING_FIELDS.includes(result.field) || !['exact','contains'].includes(result.comparison) || !['in','out'].includes(result.direction)) throw new Error('Invalid mapping condition.');
  if (!result.pattern || result.pattern.length>500) throw new Error('Enter a mapping pattern of 1–500 characters.');
  if (result.action && !['prefer-match','create','ignore'].includes(result.action)) throw new Error('Invalid legacy mapping action.');
  if(result.action!=='ignore' && (result.secondaryAccountId===result.accountId || !accounts.some(a=>Number(a.id)===result.secondaryAccountId))) throw new Error('Choose a different, existing secondary account.');
  return result;
}

export function statementMappingFor(entry, rules, accountId, accounts) {
  const matches = (rules || []).filter(rule=>{
    if(Number(rule.accountId)!==Number(accountId) || rule.direction!==(entry.amountCents>0?'in':'out')) return false;
    if(rule.action!=='ignore' && !accounts.some(a=>Number(a.id)===Number(rule.secondaryAccountId))) return false;
    const descriptive=['description','originalDescription'].includes(rule.field);
    const clean=descriptive?relevantMappingText:mappingText;
    const value=clean(entry[rule.field]), pattern=clean(rule.pattern);
    return pattern && (rule.comparison==='exact'?value===pattern:value.includes(pattern));
  });
  if(!matches.length) return {rule:null,conflict:false};
  // Reconciliation actions are independent of account mapping (including legacy action hints).
  const signatures=new Set(matches.map(r=>JSON.stringify([r.secondaryAccountId])));
  return {rule:signatures.size===1?matches[0]:null,conflict:signatures.size>1};
}

export function counterpartyId(occurrence, accountId) {
  return Number(occurrence.primaryAccountId)===Number(accountId) ? Number(occurrence.secondaryAccountId) : Number(occurrence.primaryAccountId);
}

export function generateStatementMappingDrafts(entries, scenario, accountId, priorExamples=[]) {
  const drafts=[];const seen=new Set();
  for(const entry of entries.filter(e=>e.monetary&&!e.insufficientFunds)) {
    const pattern=relevantMappingText(entry.originalDescription || entry.description);
    if(pattern.length<3)continue;
    const signature=JSON.stringify([mappingText(pattern),Math.sign(entry.amountCents)]);
    if(seen.has(signature)) continue;seen.add(signature);
    if(statementMappingFor(entry,scenario.statementMappings,accountId,scenario.accounts).rule) continue;
    const previous=priorExamples.filter(e=>relevantMappingText(e.pattern)===pattern && e.direction===(entry.amountCents>0?'in':'out'));
    const previousIds=[...new Set(previous.map(e=>Number(e.secondaryAccountId)))];
    const haystack=mappingText(entry.description+' '+entry.originalDescription+' '+entry.category+' '+entry.parentCategory);
    const named=scenario.accounts.filter(a=>Number(a.id)!==Number(accountId) && mappingText(a.name).length>=3 && haystack.includes(mappingText(a.name)));
    // Existing plan descriptions provide text evidence, never amount/date proximity.
    const described=(scenario.transactions || []).filter(t=>{
      const primary=Number(t.primaryAccountId)===Number(accountId),secondary=Number(t.secondaryAccountId)===Number(accountId);
      if(!primary&&!secondary)return false;
      const sign=(Number(t.transactionTypeId)===1?1:-1)*(primary?1:-1);
      const text=mappingText(t.description);
      return sign===Math.sign(entry.amountCents)&&text.length>=4&&/[a-z]/i.test(text)&&haystack.includes(text);
    }).map(t=>counterpartyId(t,accountId));
    const candidates=[...new Set(previousIds.length ? previousIds : [...named.map(a=>Number(a.id)),...described])].filter(id=>id!==Number(accountId)&&scenario.accounts.some(a=>Number(a.id)===id));
    if(candidates.length!==1) continue;
    drafts.push({accountId:Number(accountId),field:entry.originalDescription?'originalDescription':'description',pattern,comparison:'contains',direction:entry.amountCents>0?'in':'out',secondaryAccountId:candidates[0]});
  }
  return drafts;
}
