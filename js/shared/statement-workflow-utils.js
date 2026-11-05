// Account-independent statement workflow. These upgrades never alter retained CSV rows or decisions.
export const STATEMENT_ACTIONS={line:'Add line item',match:'Add actual + close plan',create:'Create period transaction',existing:'Already recorded (link only)',future:'Actual + update future plan',ignore:'Ignore'};

export function upgradeStatementMapping(rule) {
  if(!rule||typeof rule!=='object')return rule;
  const {accountId,action,...rest}=rule;
  return {...rest,primaryAccountId:rule.primaryAccountId??accountId,
    defaultAction:rule.defaultAction??(action==='ignore'?'ignore':action==='create'?'create':action==='prefer-match'?'match':'line'),
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
  const scope={primaryAccountId,secondaryAccountId,period,transactionTypeId:entry.amountCents>0?1:2};
  const all=statementTargetCandidates(occurrences,{...scope,action:'line'});
  if(defaultAction==='ignore')return {action:'ignore',targetKey:null};
  const exact=all.filter(o=>o.status==='actual'&&o.actualDate===entry.postingDate&&Math.round(Number(o.actualAmount)*100)===Math.abs(entry.amountCents));
  if(exact.length)return {action:'existing',targetKey:exact.length===1?exact[0].occurrenceKey:null};
  if(!all.length)return {action:'create',targetKey:null};
  if(all.length>1)return {action:'line',targetKey:null};
  const target=all[0];
  const itemized=rowCount>1||target.lineItems?.length||target.status==='actual';
  const action=itemized?'line':defaultAction==='future'&&target.sourceTransactionId?'future':'match';
  return {action,targetKey:target.occurrenceKey};
}
export function statementTargetCandidates(occurrences,{primaryAccountId,secondaryAccountId,transactionTypeId,period,action='line'}) {
  return occurrences.filter(o=>Number(o.primaryAccountId)===Number(primaryAccountId)&&Number(o.secondaryAccountId)===Number(secondaryAccountId)&&Number(o.transactionTypeId)===Number(transactionTypeId)
    &&inStatementPeriod(o.scheduledDate,period)&&!o.transactionGroupId&&!o.baselineFrozen&&o.status!=='skipped'
    &&(action==='line'?['planned','actual'].includes(o.status):action==='existing'?o.status==='actual':o.status==='planned'&&!o.lineItems?.length)
    &&(action!=='future'||Boolean(o.sourceTransactionId)));
}
