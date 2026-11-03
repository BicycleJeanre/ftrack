import { createModal } from './modal-factory.js';
import { parseStatement, suggestStatementMatches, signedOccurrenceAmount } from '../../../shared/statement-utils.js';
import { retainStatement, appliedStatementFingerprints } from '../../../app/services/statement-service.js';
import { applyStatementDecisions } from '../../../app/managers/occurrence-manager.js';
import { getScenario } from '../../../app/services/data-service.js';
import { resolveScenarioOccurrences } from '../../../domain/queries/resolve-scenario-occurrences.js';

function el(tag,text='',className='') { const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node; }
function button(text,action) { const node=el('button',text,'icon-btn');node.type='button';node.addEventListener('click',action);return node; }
function select(options) { const node=el('select'); for(const [value,label] of options) {const option=el('option',label);option.value=value;node.append(option);}return node; }
function download(text,name,type) {const url=URL.createObjectURL(new Blob([text],{type}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export async function openStatementReconciliationModal({scenarioId,onApplied}={}) {
  const {modal,close}=createModal({contentClass:'statement-reconciliation-modal'});
  let scenario,activeId=null;const content=el('div');const error=el('p','','statement-error');error.setAttribute('role','alert');
  modal.append(el('h2','Statement reconciliation'),el('p','Retain a CSV source, review suggestions, then apply only the rows you approve. No recurring rules are changed.'),error,content,button('Close',close));
  const guard=fn=>async()=>{error.textContent='';delete error.dataset.state;try {await fn();}catch(e){error.textContent=e.message;}};
  const refresh=async()=>{scenario=await getScenario(scenarioId);if(!scenario)throw new Error('Scenario no longer exists.');await render();};
  async function render() {
    content.replaceChildren();
    const account=select([['','Choose FTrack account'],...scenario.accounts.map(a=>[String(a.id),a.name])]);account.setAttribute('aria-label','Statement primary account');
    const file=el('input');file.type='file';file.accept='.csv,text/csv';file.setAttribute('aria-label','Statement CSV');
    content.append(el('h3','Retain new source'),account,file,button('Retain CSV for review',guard(async()=>{
      if(!account.value || !file.files[0])throw new Error('Select an account and CSV file.');
      activeId=await retainStatement(scenarioId,account.value,file.files[0].name,await file.files[0].text());await refresh();
    })));
    const batches=scenario.statementImports || [];
    if(!batches.length){content.append(el('p','No statements retained yet. This version supports the bank CSV with Posting Date, Money In, Money Out, Fee and Balance.'));return;}
    const archive=select([['','Choose retained source'],...batches.map(b=>[b.id,`${b.fileName} — ${scenario.accounts.find(a=>Number(a.id)===Number(b.accountId))?.name || 'Missing account'} — ${b.importedAt.slice(0,10)}`])]);archive.value=activeId || '';archive.setAttribute('aria-label','Retained statements');archive.addEventListener('change',guard(async()=>{activeId=archive.value;await render();}));content.append(el('h3','Retained statements'),archive);
    const batch=batches.find(b=>b.id===activeId);if(!batch)return;
    const parsed=parseStatement(batch.rawCsv);const seen=appliedStatementFingerprints(scenario,batch.accountId);
    content.append(el('p',`${parsed.entries.length} source rows; ${parsed.entries.filter(e=>e.monetary).length} monetary rows. ${parsed.balanceIssues.length ? 'Balance validation FAILED: applying is blocked.' : 'Running balance checks passed.'} Date range: ${parsed.startDate} to ${parsed.endDate}.`));
    content.append(button('Download original CSV',()=>download(batch.rawCsv,batch.fileName,'text/csv')),
      button('Download reconciliation report',()=>download(JSON.stringify({fileName:batch.fileName,sha256:batch.sha256,accountId:batch.accountId,decisions:batch.decisions},null,2),'statement-reconciliation.json','application/json')));
    const source=el('details');source.append(el('summary','Full original source table (all columns and rows)'));
    const sourceWrap=el('div','','statement-table-wrap');const sourceTable=el('table');const head=el('tr');parsed.headers.forEach(h=>head.append(el('th',h)));sourceTable.append(head);
    parsed.rows.forEach(r=>{const tr=el('tr');r.forEach(v=>tr.append(el('td',v)));sourceTable.append(tr);});sourceWrap.append(sourceTable);source.append(sourceWrap);content.append(source);
    const start=new Date(parsed.startDate+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-7);const end=new Date(parsed.endDate+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+7);
    const {occurrences}=resolveScenarioOccurrences({scenario,startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10)});
    const wrap=el('div','','statement-table-wrap');const table=el('table');const heading=el('tr');['Approve','Date','Description','Amount','Review / suggested match','Secondary account for new actual'].forEach(h=>heading.append(el('th',h)));table.append(heading);
    const pending=[];
    parsed.entries.forEach(entry=>{
      const tr=el('tr');const check=el('input');check.type='checkbox';check.setAttribute('aria-label',`Approve source row ${entry.index+1}`);
      const first=el('td');first.append(check);tr.append(first,el('td',entry.postingDate),el('td',entry.description),el('td',(entry.amountCents/100).toFixed(2)));
      const reviewed=batch.decisions?.[entry.index];const duplicate=entry.monetary && seen.has(entry.fingerprint);
      if(reviewed || duplicate || !entry.monetary){check.disabled=true;tr.append(el('td',reviewed ? `Reviewed: ${reviewed.action}` : duplicate ? 'Already reconciled in retained source' : 'Non-monetary source record'),el('td'));table.append(tr);return;}
      const suggestions=suggestStatementMatches(entry,occurrences,batch.accountId);
      const otherPlans=occurrences.filter(o=>o.status==='planned' && !o.lineItems?.length && !o.transactionGroupId && Math.sign(signedOccurrenceAmount(o,batch.accountId))===Math.sign(entry.amountCents) && !suggestions.some(s=>s.occurrenceKey===o.occurrenceKey));
      const action=select([['','Choose action'],...suggestions.map(s=>[`${s.status==='actual'?'existing':'match'}:${s.occurrenceKey}`,`${s.status==='actual'?'Link existing actual':'Match planned'}: ${s.description || '(no description)'} | ${s.date} | ${s.amount.toFixed(2)} | ${s.reason}`]),['create','Create unplanned actual'],['ignore','Ignore (retain source only)']]);action.setAttribute('aria-label',`Action source row ${entry.index+1}`);
      otherPlans.forEach(o=>{const option=el('option',`Other planned item: ${o.description || '(no description)'} | ${o.scheduledDate} | ${(signedOccurrenceAmount(o,batch.accountId)/100).toFixed(2)}`);option.value=`match:${o.occurrenceKey}`;action.append(option);});
      // Suggestions are visible but never approved or applied automatically.
      if(suggestions.length && suggestions[0].status==='planned') action.value=`match:${suggestions[0].occurrenceKey}`;
      const secondary=select([['','Choose secondary account'],...scenario.accounts.filter(a=>Number(a.id)!==Number(batch.accountId)).map(a=>[String(a.id),a.name])]);secondary.setAttribute('aria-label',`Secondary account source row ${entry.index+1}`);
      const actionCell=el('td');actionCell.append(action);const secondaryCell=el('td');secondaryCell.append(secondary);tr.append(actionCell,secondaryCell);table.append(tr);
      pending.push({entry,check,action,secondary});
    });
    wrap.append(table);content.append(el('h3','Review transactions'),el('p','Tick only rows you approve. Several rows cannot match the same planned item. Amount changes are shown in each suggestion. No match? Create a new actual or leave the row pending.'),wrap);
    const apply=button('Apply approved rows',guard(async()=>{
      const decisions=pending.filter(p=>p.check.checked).map(p=>{
        const [action,...rest]=p.action.value.split(':');const occurrenceKey=rest.join(':');
        return {index:p.entry.index,action,occurrenceKey,secondaryAccountId:Number(p.secondary.value),expectedAmount:occurrences.find(o=>o.occurrenceKey===occurrenceKey)?.plannedAmount};
      });
      if(!decisions.length)throw new Error('Tick at least one row to approve.');
      apply.disabled=true;
      try {const result=await applyStatementDecisions(scenarioId,batch.id,decisions);await onApplied?.();await refresh();error.dataset.state='success';error.textContent=`Applied ${result.changes.length} reviewed row(s). Download the reconciliation report for details.`;}finally {apply.disabled=false;}
    }));apply.disabled=parsed.balanceIssues.length>0;content.append(apply);
  }
  await guard(refresh)();
}
