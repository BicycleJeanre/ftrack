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
