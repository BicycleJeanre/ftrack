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
export function statementTargetCandidates(occurrences,{primaryAccountId,secondaryAccountId,transactionTypeId,period,action='line'}) {
  return occurrences.filter(o=>Number(o.primaryAccountId)===Number(primaryAccountId)&&Number(o.secondaryAccountId)===Number(secondaryAccountId)&&Number(o.transactionTypeId)===Number(transactionTypeId)
    &&inStatementPeriod(o.scheduledDate,period)&&!o.transactionGroupId&&!o.baselineFrozen&&o.status!=='skipped'
    &&(action==='line'?['planned','actual'].includes(o.status):action==='existing'?o.status==='actual':o.status==='planned'&&!o.lineItems?.length)
    &&(action!=='future'||Boolean(o.sourceTransactionId)));
}
