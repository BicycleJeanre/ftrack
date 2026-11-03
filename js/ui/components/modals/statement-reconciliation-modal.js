import { createModal } from './modal-factory.js';
import { parseStatement, suggestStatementMatches, signedOccurrenceAmount } from '../../../shared/statement-utils.js';
import { retainStatement, appliedStatementFingerprints } from '../../../app/services/statement-service.js';
import { applyStatementDecisions } from '../../../app/managers/occurrence-manager.js';
import { getScenario } from '../../../app/services/data-service.js';
import { resolveScenarioOccurrences } from '../../../domain/queries/resolve-scenario-occurrences.js';
import { statementMappingFor,generateStatementMappingDrafts,counterpartyId } from '../../../shared/statement-mapping-utils.js';
import { buildStatementMappingEditor } from '../widgets/statement-mapping-editor.js';
import { buildStatementReviewGrid } from '../widgets/statement-review-grid.js';

function el(tag,text='',className='') { const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node; }
function button(text,action) { const node=el('button',text,'icon-btn');node.type='button';node.addEventListener('click',action);return node; }
function select(options) { const node=el('select'); for(const [value,label] of options) {const option=el('option',label);option.value=value;node.append(option);}return node; }
function download(text,name,type) {const url=URL.createObjectURL(new Blob([text],{type}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export async function openStatementReconciliationModal({scenarioId,onApplied}={}) {
  const {modal,close}=createModal({contentClass:'statement-reconciliation-modal'});
  let scenario,activeId=null;const drafts=new Map(),gridState={};const content=el('div');const error=el('p','','statement-error');error.setAttribute('role','alert');
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
    const mappingEditor=buildStatementMappingEditor({scenario,scenarioId,accountId:batches.find(b=>b.id===activeId)?.accountId,onError:e=>{delete error.dataset.state;error.textContent=e.message;},onChanged:async()=>{
      for(const [key,draft] of drafts)if(!draft.manual)drafts.delete(key);
      await refresh();content.querySelector('.statement-mappings').open=true;
    }});content.append(mappingEditor.element);
    if(!batches.length){content.append(el('p','No statements retained yet. This version supports the bank CSV with Posting Date, Money In, Money Out, Fee and Balance.'));return;}
    const archive=select([['','Choose retained source'],...batches.map(b=>[b.id,`${b.fileName} — ${scenario.accounts.find(a=>Number(a.id)===Number(b.accountId))?.name || 'Missing account'} — ${b.importedAt.slice(0,10)}`])]);archive.value=activeId || '';archive.setAttribute('aria-label','Retained statements');archive.addEventListener('change',guard(async()=>{activeId=archive.value;await render();}));content.append(el('h3','Retained statements'),archive);
    const batch=batches.find(b=>b.id===activeId);if(!batch)return;
    const parsed=parseStatement(batch.rawCsv);const seen=appliedStatementFingerprints(scenario,batch.accountId);
    content.append(el('p',`${parsed.entries.length} source rows; ${parsed.entries.filter(e=>e.monetary).length} monetary rows. ${parsed.balanceIssues.length ? 'Balance validation FAILED: applying is blocked.' : 'Running balance checks passed.'} Date range: ${parsed.startDate} to ${parsed.endDate}.`));
    content.append(button('Download original CSV',()=>download(batch.rawCsv,batch.fileName,'text/csv')),
      button('Download reconciliation report',()=>download(JSON.stringify({fileName:batch.fileName,sha256:batch.sha256,accountId:batch.accountId,decisions:batch.decisions},null,2),'statement-reconciliation.json','application/json')));
    const source=el('details');source.append(el('summary','Full original source table (all columns and rows)'));
    const sourceWrap=el('div','','statement-table-wrap');const sourceTable=el('table');const head=el('tr');parsed.headers.forEach(h=>head.append(el('th',h)));sourceTable.append(head);
    parsed.rows.forEach((r,index)=>{const tr=el('tr');tr.dataset.sourceIndex=String(index);r.forEach(v=>tr.append(el('td',v)));sourceTable.append(tr);});
    let sourceSort=-1,sourceDescending=false;
    [...head.children].forEach((th,column)=>{const title=th.textContent;th.textContent='';th.append(button(title,()=>{
      sourceDescending=sourceSort===column?!sourceDescending:false;sourceSort=column;
      const numeric=['Nr','Money In','Money Out','Fee','Balance'].includes(parsed.headers[column]);
      const ordered=[...sourceTable.querySelectorAll('tr[data-source-index]')].sort((a,b)=>{
        const x=parsed.rows[Number(a.dataset.sourceIndex)][column],y=parsed.rows[Number(b.dataset.sourceIndex)][column];
        return (numeric?Number(x)-Number(y):x.localeCompare(y,undefined,{numeric:true}))*(sourceDescending?-1:1);
      });
      ordered.forEach(tr=>sourceTable.append(tr));[...head.children].forEach((h,i)=>h.setAttribute('aria-sort',i===column?sourceDescending?'descending':'ascending':'none'));
    }));});sourceWrap.append(sourceTable);source.append(sourceWrap);content.append(source);
    const start=new Date(parsed.startDate+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-7);const end=new Date(parsed.endDate+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+7);
    const {occurrences}=resolveScenarioOccurrences({scenario,startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10)});
    const wrap=el('div','','statement-table-wrap');const table=el('table');const heading=el('tr');['Approve','Date','Description','Category','Amount','Review / suggested match','Secondary account','Mapping rule'].forEach(h=>heading.append(el('th',h)));table.append(heading);
    const pending=[],gridRows=[];
    parsed.entries.forEach(entry=>{
      const tr=el('tr');const check=el('input');check.type='checkbox';check.setAttribute('aria-label',`Approve source row ${entry.index+1}`);
      const first=el('td');first.append(check);tr.append(first,el('td',entry.postingDate),el('td',entry.description),el('td',entry.category),el('td',(entry.amountCents/100).toFixed(2)));
      const reviewed=batch.decisions?.[entry.index];const duplicate=entry.monetary && seen.has(entry.fingerprint);
      if(reviewed || duplicate || !entry.monetary){check.disabled=true;const status=reviewed ? `Reviewed: ${reviewed.action}` : duplicate ? 'Already reconciled in retained source' : 'Non-monetary source record';tr.append(el('td',status),el('td'),el('td'));gridRows.push({entry,tr,check,status,draft:{}});return;}
      const mapping=statementMappingFor(entry,scenario.statementMappings,batch.accountId,scenario.accounts);
      const mappedPlan=Boolean(mapping.rule && mapping.rule.action==='prefer-match');
      const suggestions=suggestStatementMatches(entry,mappedPlan?occurrences.filter(o=>counterpartyId(o,batch.accountId)===Number(mapping.rule.secondaryAccountId)):occurrences,batch.accountId,{allowAmountDifference:mappedPlan});
      const otherPlans=occurrences.filter(o=>o.status==='planned' && !o.lineItems?.length && !o.transactionGroupId && Math.sign(signedOccurrenceAmount(o,batch.accountId))===Math.sign(entry.amountCents) && !suggestions.some(s=>s.occurrenceKey===o.occurrenceKey));
      const action=select([['','Choose action'],...suggestions.map(s=>[`${s.status==='actual'?'existing':'match'}:${s.occurrenceKey}`,`${s.status==='actual'?'Link existing actual':'Match planned'}: ${s.description || '(no description)'} | ${s.date} | ${s.amount.toFixed(2)} | ${s.reason}`]),['create','Create unplanned actual'],['ignore','Ignore (retain source only)']]);action.setAttribute('aria-label',`Action source row ${entry.index+1}`);
      otherPlans.forEach(o=>{const option=el('option',`Other planned item: ${o.description || '(no description)'} | ${o.scheduledDate} | ${(signedOccurrenceAmount(o,batch.accountId)/100).toFixed(2)}`);option.value=`match:${o.occurrenceKey}`;action.append(option);});
      const secondary=select([['','Choose secondary account'],...scenario.accounts.filter(a=>Number(a.id)!==Number(batch.accountId)).map(a=>[String(a.id),a.name])]);secondary.setAttribute('aria-label',`Secondary account source row ${entry.index+1}`);
      const draftKey=`${batch.id}:${entry.index}`;
      if(!drafts.has(draftKey)){
        let chosen='',account='',reason=mapping.conflict?'Conflicting mapping rules':'No saved mapping';
        if(mapping.rule){
          account=String(mapping.rule.secondaryAccountId || '');reason=`Rule: ${mapping.rule.pattern}`;
          const mapped=suggestions.filter(s=>counterpartyId(occurrences.find(o=>o.occurrenceKey===s.occurrenceKey),batch.accountId)===Number(account));
          if(mapping.rule.action==='ignore')chosen='ignore';
          else if(mapping.rule.action==='create')chosen='create';
          else if(mapped.length && (mapped.length===1 || mapped[0].score>mapped[1].score)) chosen=`${mapped[0].status==='actual'?'existing':'match'}:${mapped[0].occurrenceKey}`;
          else if(!mapped.length)chosen='create';
          else reason+=' — ambiguous plan match';
        }else if(!mapping.conflict && suggestions.length && (suggestions.length===1 || suggestions[0].score>suggestions[1].score)){
          chosen=`${suggestions[0].status==='actual'?'existing':'match'}:${suggestions[0].occurrenceKey}`;
          account=String(counterpartyId(occurrences.find(o=>o.occurrenceKey===suggestions[0].occurrenceKey),batch.accountId));reason=suggestions[0].reason;
        }
        drafts.set(draftKey,{action:chosen,secondary:account,reason,approved:false,manual:false});
      }
      const draft=drafts.get(draftKey);action.value=draft.action;secondary.value=draft.secondary;check.checked=draft.approved;
      const ruleCell=el('td');const reason=el('span',draft.reason);ruleCell.append(reason);
      const syncSecondary=()=>{const key=action.value.slice(action.value.indexOf(':')+1);const match=action.value.includes(':')&&occurrences.find(o=>o.occurrenceKey===key);if(match)secondary.value=String(counterpartyId(match,batch.accountId));secondary.disabled=Boolean(match)||action.value==='ignore';};syncSecondary();
      action.addEventListener('change',()=>{syncSecondary();draft.action=action.value;draft.secondary=secondary.value;draft.manual=true;draft.approved=false;check.checked=false;draft.reason='Manual choice';reason.textContent=draft.reason;});
      secondary.addEventListener('change',()=>{draft.secondary=secondary.value;draft.manual=true;draft.approved=false;check.checked=false;draft.reason='Manual choice';reason.textContent=draft.reason;});
      ruleCell.append(button('Save as mapping',()=>{
        if(!action.value || action.value!=='ignore'&&!secondary.value){error.textContent='Choose an action and secondary account first.';return;}
        const existing=statementMappingFor(entry,scenario.statementMappings,batch.accountId,scenario.accounts).rule;
        mappingEditor.edit({id:existing?.id,accountId:batch.accountId,field:existing?.field || 'originalDescription',comparison:existing?.comparison || 'exact',pattern:existing?.pattern || entry.originalDescription || entry.description,direction:entry.amountCents>0?'in':'out',action:action.value==='ignore'?'ignore':action.value==='create'?'create':'prefer-match',secondaryAccountId:secondary.value});mappingEditor.element.scrollIntoView({block:'nearest'});
      }));
      const actionCell=el('td');actionCell.append(action);const secondaryCell=el('td');secondaryCell.append(secondary);tr.append(actionCell,secondaryCell,ruleCell);
      gridRows.push({entry,tr,check,action,secondary,draft,get reason(){return draft.reason;},isReady(){
        if(parsed.balanceIssues.length)return false;
        const o=action.value.includes(':')&&occurrences.find(o=>o.occurrenceKey===action.value.slice(action.value.indexOf(':')+1));
        if(action.value==='ignore')return true;
        if((scenario.baselinePeriods || []).some(p=>(o?.scheduledDate || entry.postingDate)>=p.startDate && (o?.scheduledDate || entry.postingDate)<=p.endDate))return false;
        if(o)return !o.lineItems?.length&&!o.transactionGroupId&&(action.value.startsWith('match:')?o.status==='planned':o.status==='actual'&&signedOccurrenceAmount(o,batch.accountId)===entry.amountCents&&o.actualDate===entry.postingDate);
        return action.value==='create'&&Boolean(secondary.value);
      }});
      pending.push({entry,check,action,secondary});
    });
    mappingEditor.element.append(button('Generate draft mappings',()=>{
      const examples=[];
      for(const old of batches.filter(b=>Number(b.accountId)===Number(batch.accountId))){const entries=parseStatement(old.rawCsv).entries;for(const [index,decision] of Object.entries(old.decisions || {})){const o=occurrences.find(o=>o.occurrenceKey===decision.occurrenceKey),entry=entries[index];if(o&&entry)examples.push({pattern:entry.originalDescription || entry.description,direction:entry.amountCents>0?'in':'out',secondaryAccountId:counterpartyId(o,batch.accountId)});}}
      for(const entry of parsed.entries){const strong=suggestStatementMatches(entry,occurrences,batch.accountId).filter(s=>s.score>=85);if(strong.length===1)examples.push({pattern:entry.originalDescription || entry.description,direction:entry.amountCents>0?'in':'out',secondaryAccountId:counterpartyId(occurrences.find(o=>o.occurrenceKey===strong[0].occurrenceKey),batch.accountId)});}
      mappingEditor.showDrafts(generateStatementMappingDrafts(parsed.entries,scenario,batch.accountId,examples));
    }));
    const grid=buildStatementReviewGrid({table,heading,rows:gridRows,state:gridState,onError:e=>{delete error.dataset.state;error.textContent=e.message;}});
    wrap.append(table);content.append(el('h3','Review transactions'),el('p','Click column headers to sort. Group rows and approve a group, then apply below. Sorting and grouping retain your choices. No changes are made until Apply approved rows.'),grid.controls,wrap);
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
