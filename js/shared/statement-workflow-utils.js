// Account-independent statement workflow. These upgrades never alter retained CSV rows or decisions.
export const STATEMENT_ACTIONS={line:'Add line item',match:'Add actual + close plan',create:'Create period transaction',createPlan:'Create period transaction + add to recurring plan',future:'Actual + update future plan',ignore:'Ignore'};

export function upgradeStatementMapping(rule) {
  if(!rule||typeof rule!=='object')return rule;
  const {accountId,action,...rest}=rule;
  return {...rest,primaryAccountId:rule.primaryAccountId??accountId,
    defaultAction:rule.defaultAction==='existing'?'match':rule.defaultAction??(action==='ignore'?'ignore':action==='create'?'create':action==='prefer-match'?'match':'line'),
    ...(accountId!==undefined?{legacyStatementAccountId:rule.legacyStatementAccountId??accountId}:{}),
    ...(action!==undefined?{legacyAction:rule.legacyAction??action}:{})};
}
export function upgradeStatementImport(batch) {
  if(!batch||typeof batch!=='object')return batch;
  const {accountId,...rest}=batch;
  return {...rest,...(accountId!==undefined?{legacyAccountId:batch.legacyAccountId??accountId}:{})};
}
export function validateStatementPeriod(period) {
  const valid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  if(!period||!valid(period.startDate)||!valid(period.endDate)||period.startDate>period.endDate)throw new Error('Choose a valid reporting/budget period.');
  return {id:String(period.id||`${period.startDate}:${period.endDate}`),type:String(period.type||'Custom'),startDate:period.startDate,endDate:period.endDate};
}
export function inStatementPeriod(date,period){return Boolean(date&&date>=period.startDate&&date<=period.endDate);}

// A budget period identifies the FTrack occurrence; the independent source
// window identifies which bank dates may be reconciled into it.
export function statementSourceWindow(period) {
  if(period.type!=='Month')return {startDate:period.startDate,endDate:period.endDate};
  const [year,month]=period.startDate.split('-').map(Number);
  const priorMonth=month===1?12:month-1,priorYear=month===1?year-1:year;
  return {startDate:`${priorYear}-${String(priorMonth).padStart(2,'0')}-25`,endDate:`${year}-${String(month).padStart(2,'0')}-25`};
}

export function suggestStatementAction({occurrences,entry,primaryAccountId,secondaryAccountId,period,rowCount=1,defaultAction}) {
  const all=statementPairOccurrences(occurrences,{primaryAccountId,secondaryAccountId,period});
  if(defaultAction==='ignore')return {action:'ignore',targetKey:null};
  if(!all.length)return {action:'create',targetKey:null};
  return {action:rowCount>1?'line':'match',targetKey:all.length===1?all[0].occurrenceKey:null};
}
export function statementAccountPairMatches(o,primary,secondary) {
  return (Number(o.primaryAccountId)===Number(primary)&&Number(o.secondaryAccountId)===Number(secondary))
    ||(Number(o.primaryAccountId)===Number(secondary)&&Number(o.secondaryAccountId)===Number(primary));
}
export function statementPairOccurrences(occurrences,{primaryAccountId,secondaryAccountId,period}) {
  return occurrences.filter(o=>statementAccountPairMatches(o,primaryAccountId,secondaryAccountId)&&inStatementPeriod(o.scheduledDate,period));
}
export function statementTargetCandidates(occurrences,{primaryAccountId,secondaryAccountId,transactionTypeId,period,action='line'}) {
  return statementPairOccurrences(occurrences,{primaryAccountId,secondaryAccountId,period}).filter(o=>!o.transactionGroupId&&!o.baselineFrozen&&o.status!=='skipped'
    &&(action==='existing'?o.status==='actual':['planned','actual'].includes(o.status))
    &&(action!=='future'||Boolean(o.sourceTransactionId)));
}
