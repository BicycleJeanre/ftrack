import { createModal } from './modal-factory.js';
import { parseStatement, suggestStatementMatches, signedOccurrenceAmount, defaultStatementWindow } from '../../../shared/statement-utils.js';
import { retainStatement, appliedStatementFingerprints } from '../../../app/services/statement-service.js';
import { applyStatementDecisions } from '../../../app/managers/occurrence-manager.js';
import { getScenario } from '../../../app/services/data-service.js';
import { resolveScenarioOccurrences } from '../../../domain/queries/resolve-scenario-occurrences.js';
import { statementMappingFor,counterpartyId,statementMappingLabel,relevantMappingText } from '../../../shared/statement-mapping-utils.js';
import { createGrid } from '../grids/grid-factory.js';
import { buildStatementMappingEditor } from '../widgets/statement-mapping-editor.js';
import { buildStatementReviewGrid } from '../widgets/statement-review-grid.js';
import { openStatementMatchPicker } from '../widgets/statement-match-picker.js';

function el(tag,text='',className='') { const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node; }
function button(text,action) { const node=el('button',text,'icon-btn');node.type='button';node.addEventListener('click',action);return node; }
function select(options) { const node=el('select'); for(const [value,label] of options) {const option=el('option',label);option.value=value;node.append(option);}return node; }
function download(text,name,type) {const url=URL.createObjectURL(new Blob([text],{type}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export async function openStatementReconciliationModal({scenarioId,onApplied}={}) {
  const {modal,close:closeModal}=createModal({contentClass:'statement-reconciliation-modal',onClose:()=>{grids.forEach(g=>g.destroy());grids=[];}});
  let scenario,activeId=null,primaryId=null,timeframe=defaultStatementWindow();let grids=[];const drafts=new Map(),gridState={},mappingState={};const content=el('div');const error=el('p','','statement-error');error.setAttribute('role','alert');
  const close=closeModal;
  modal.append(el('h2','Statement reconciliation'),el('p','Review bank entries before applying. Recurring planned values change only with the explicit future-plan action.'),error,content,button('Close',close));
  const guard=fn=>async()=>{error.textContent='';delete error.dataset.state;try {await fn();}catch(e){error.textContent=e.message;}};
  const refresh=async()=>{scenario=await getScenario(scenarioId);if(!scenario)throw new Error('Scenario no longer exists.');await render();};
  async function render() {
    grids.forEach(g=>g.destroy());grids=[];
    content.replaceChildren();
    const account=select([['','Choose FTrack account'],...scenario.accounts.map(a=>[String(a.id),a.name])]);account.setAttribute('aria-label','Statement primary account');
    account.value=primaryId || '';account.onchange=guard(async()=>{primaryId=account.value;activeId=null;await render();});
    const toolbar=el('div','','statement-source-toolbar');const sources=el('div','','statement-source-selectors');const imports=el('div','','statement-source-imports');
    const label=el('label','Primary account');label.append(account);sources.append(label);toolbar.append(sources,imports);content.append(toolbar);
    const file=el('input');file.type='file';file.accept='.csv,text/csv';file.setAttribute('aria-label','Statement CSV');
    const importLabel=el('label','Retain new source');importLabel.append(file);imports.append(importLabel);file.disabled=!primaryId;
    file.onchange=guard(async()=>{
      if(!account.value || !file.files[0])throw new Error('Select an account and CSV file.');
      activeId=await retainStatement(scenarioId,account.value,file.files[0].name,await file.files[0].text());await refresh();
    });
    const batches=(scenario.statementImports || []).filter(b=>Number(b.accountId)===Number(primaryId));
    const mappingEditor=buildStatementMappingEditor({scenario,scenarioId,accountId:primaryId,state:mappingState,onError:e=>{delete error.dataset.state;error.textContent=e.message;},onChanged:async({keepOpen=true}={})=>{
      const scrollTop=modal.scrollTop;
      error.textContent='';delete error.dataset.state;
      // Reapply newly saved rules even to rows previously edited manually; never keep stale approvals.
      drafts.clear();
      await refresh();
      content.querySelector('.statement-mappings').open=keepOpen;
      if(keepOpen)modal.scrollTop=scrollTop;
    }});content.append(mappingEditor.element);grids.push(mappingEditor);
    if(!primaryId){content.append(el('p','Choose a primary account to view its statements or upload a CSV.'));return;}
    if(!batches.length){content.append(el('p','No statements retained for this account. Choose a CSV above to retain it automatically.'));return;}
    const archive=select([['','Choose retained source'],...batches.map(b=>[b.id,`${b.fileName} — ${b.importedAt.slice(0,10)}`])]);archive.value=activeId || '';archive.setAttribute('aria-label','Retained statements');archive.addEventListener('change',guard(async()=>{activeId=archive.value;await render();}));const archiveLabel=el('label','Retained statements');archiveLabel.append(archive);sources.append(archiveLabel);
    const batch=batches.find(b=>b.id===activeId);if(!batch)return;
    const parsed=parseStatement(batch.rawCsv);const seen=appliedStatementFingerprints(scenario,batch.accountId);
    const inWindow=entry=>!timeframe || entry.postingDate>=timeframe.startDate&&entry.postingDate<timeframe.endDate;
    const windowEntries=parsed.entries.filter(inWindow);
    const flagged=windowEntries.filter(e=>e.insufficientFunds);
    const dates=el('div','','statement-review-controls statement-timeframe');
    const from=el('input');from.type='date';from.value=timeframe?.startDate || parsed.startDate;from.setAttribute('aria-label','Statement review from');
    const to=el('input');to.type='date';to.value=timeframe?.endDate || parsed.endDate;to.setAttribute('aria-label','Statement review to (exclusive)');
    dates.append(el('span','Time frame: from (inclusive)'),from,el('span','to (exclusive)'),to,button('Apply time frame',guard(async()=>{
      if(!from.value || !to.value || from.value>=to.value)throw new Error('Choose a valid start date before the end date.');
      timeframe={startDate:from.value,endDate:to.value};await render();
    })),button('Show full statement',()=>{timeframe=null;void render();}),button('Current 25th-to-25th cycle',()=>{timeframe=defaultStatementWindow();void render();}));
    content.append(dates);
    const flags=el('details','','statement-flagged');flags.classList.toggle('has-flags',flagged.length>0);flags.open=flagged.length>0;flags.append(el('summary',`Flagged / excluded entries (${flagged.length})`));
    flags.append(el('p','Failed insufficient-funds entries are not completed payments. They are excluded from the review and approval list, not deleted from the source. Any existing budget item stays planned. Charged fees remain separate reconcilable rows.'));
    flagged.forEach(entry=>flags.append(el('p',`Source row ${entry.index+1} · ${entry.postingDate} · ${entry.description} · Insufficient funds — excluded`,'statement-insufficient-funds')));content.append(flags);
    content.append(el('p',`${parsed.entries.length} source rows; ${parsed.entries.filter(e=>e.monetary).length} monetary rows. ${parsed.balanceIssues.length ? 'Balance validation FAILED: applying is blocked.' : 'Running balance checks passed.'} Date range: ${parsed.startDate} to ${parsed.endDate}.`));
    imports.append(button('Download original CSV',()=>download(batch.rawCsv,batch.fileName,'text/csv')),
      button('Download reconciliation report',()=>download(JSON.stringify({fileName:batch.fileName,sha256:batch.sha256,accountId:batch.accountId,decisions:batch.decisions,flags:parsed.entries.filter(e=>e.insufficientFunds).map(e=>({index:e.index,reason:'insufficient-funds',excluded:true}))},null,2),'statement-reconciliation.json','application/json')));
    const source=el('details');source.append(el('summary','Full original source table (all columns and rows)'));
    const sourceWrap=el('div','','statement-table-wrap');const sourceGrid=el('div','','statement-source-grid');sourceWrap.append(sourceGrid);source.append(sourceWrap);content.append(source);
    let originalGrid=null;source.ontoggle=async()=>{if(!source.open)return;if(originalGrid){originalGrid.redraw(true);return;}originalGrid=await createGrid(sourceGrid,{height:'35vh',responsiveLayout:false,data:parsed.rows.map((r,id)=>({id,...Object.fromEntries(r.map((v,i)=>[`c${i}`,v]))})),columns:parsed.headers.map((title,i)=>({title,field:`c${i}`,headerSort:true,minWidth:120,sorter:['Nr','Money In','Money Out','Fee','Balance'].includes(title)?'number':'string',formatter:cell=>{const node=el('span',cell.getValue());if(parsed.entries[cell.getData().id].insufficientFunds)node.className='statement-insufficient-funds';return node;}}))});grids.push(originalGrid);};
    const start=new Date(parsed.startDate+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-7);const end=new Date(parsed.endDate+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+7);
    const {occurrences}=resolveScenarioOccurrences({scenario,startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10)});
    const wrap=el('div','','statement-table-wrap');const table=el('table');table.className='table';const heading=el('tr');['Approve','Date','Description','Original description','Category','Parent category','Amount','Actions','Secondary account / mapping'].forEach(h=>heading.append(el('th',h)));table.append(heading);
    const pending=[],gridRows=[];
    windowEntries.filter(e=>!e.insufficientFunds).forEach(entry=>{
      const tr=el('tr');const check=el('input');check.type='checkbox';check.setAttribute('aria-label',`Approve source row ${entry.index+1}`);
      const first=el('td');first.append(check);tr.append(first,el('td',entry.postingDate),el('td',entry.description),el('td',entry.originalDescription),el('td',entry.category),el('td',entry.parentCategory),el('td',(entry.amountCents/100).toFixed(2)));
      const reviewed=batch.decisions?.[entry.index];const duplicate=entry.monetary && seen.has(entry.fingerprint);
      if(reviewed || duplicate || !entry.monetary){check.disabled=true;const status=reviewed ? `Reviewed: ${reviewed.action}` : duplicate ? 'Already reconciled in retained source' : 'Non-monetary source record';const reason=statementMappingLabel(statementMappingFor(entry,scenario.statementMappings,batch.accountId,scenario.accounts),scenario.accounts);tr.append(el('td',status),el('td',reason));gridRows.push({entry,tr,check,status,reason,draft:{}});return;}
      const mapping=statementMappingFor(entry,scenario.statementMappings,batch.accountId,scenario.accounts);
      const mappedPlan=Boolean(mapping.rule?.secondaryAccountId);
      const suggestions=mappedPlan?suggestStatementMatches(entry,occurrences.filter(o=>counterpartyId(o,batch.accountId)===Number(mapping.rule.secondaryAccountId)),batch.accountId):[];
      const action=select([['match','Select planned payment'],...suggestions.map(s=>[`${s.status==='actual'?'existing':'match'}:${s.occurrenceKey}`,s.description || '(no description)']),['create','Record standalone actual'],['ignore','Ignore']]);action.hidden=true;
      const operation=select([['match','Add actual + close plan'],['line','Add line item'],['future','Actual + update future plan'],['existing','Already recorded (link only)'],['create','Record standalone actual'],['ignore','Ignore']]);operation.setAttribute('aria-label',`Action source row ${entry.index+1}`);
      const secondary=select([['','Choose secondary account'],...scenario.accounts.filter(a=>Number(a.id)!==Number(batch.accountId)).map(a=>[String(a.id),a.name])]);secondary.setAttribute('aria-label',`Secondary account source row ${entry.index+1}`);
      const draftKey=`${batch.id}:${entry.index}`;
      if(!drafts.has(draftKey)){
        let chosen='match',account='',reason=statementMappingLabel(mapping,scenario.accounts);
        if(mapping.rule){
          account=String(mapping.rule.secondaryAccountId || '');
          const mapped=suggestions.filter(s=>counterpartyId(occurrences.find(o=>o.occurrenceKey===s.occurrenceKey),batch.accountId)===Number(account));
          if(mapped.length && (mapped.length===1 || mapped[0].score>mapped[1].score)) chosen=`${mapped[0].status==='actual'?'existing':'match'}:${mapped[0].occurrenceKey}`;
        }
        drafts.set(draftKey,{action:chosen,secondary:account,reason,approved:false,manual:false});
      }
      const draft=drafts.get(draftKey);draft.reason=statementMappingLabel(mapping,scenario.accounts);if(![...action.options].some(o=>o.value===draft.action)){const o=el('option',draft.action);o.value=draft.action;action.append(o);}action.value=draft.action;operation.value=draft.action.split(':')[0];secondary.value=draft.secondary;check.checked=draft.approved;
      const ruleCell=el('td');const reason=el('span',draft.reason);ruleCell.append(reason);
      const matchInfo=el('p','','statement-match-info');
      const chooseMatch=button('Choose payment',()=>openStatementMatchPicker({entry,occurrences,accountId:batch.accountId,secondaryAccountId:secondary.value,accounts:scenario.accounts,existing:operation.value==='existing',lineItems:operation.value==='line',recurring:operation.value==='future',onChoose:o=>{
        const value=`${operation.value}:${o.occurrenceKey}`;
        if(![...action.options].some(option=>option.value===value)){const option=el('option',o.description);option.value=value;action.append(option);}
        action.value=value;action.dispatchEvent(new Event('change'));syncMapping();grid.draw();
      }}));chooseMatch.setAttribute('aria-label',`Choose match source row ${entry.index+1}`);
      const syncSecondary=()=>{const key=action.value.slice(action.value.indexOf(':')+1);const match=action.value.includes(':')&&occurrences.find(o=>o.occurrenceKey===key);if(match)secondary.value=String(counterpartyId(match,batch.accountId));secondary.disabled=false;
        operation.title=operation.selectedOptions[0]?.textContent || '';
        chooseMatch.hidden=!['match','existing','line','future'].includes(operation.value);matchInfo.textContent=match?`Linked to: ${match.description || '(no description)'} · ${match.actualDate || match.plannedDate || match.scheduledDate} · ${(signedOccurrenceAmount(match,batch.accountId)/100).toFixed(2)}. Bank actual: ${(entry.amountCents/100).toFixed(2)}`:!chooseMatch.hidden?'Select a transaction before approving.':operation.value==='create'?'Creates a separate actual; does not close a planned payment.':'';
      };syncSecondary();
      action.addEventListener('change',()=>{operation.value=action.value.split(':')[0];syncSecondary();draft.action=action.value;draft.secondary=secondary.value;draft.manual=true;draft.approved=false;check.checked=false;});
      operation.addEventListener('change',()=>{const desired=operation.value;const key=action.value.includes(':')?action.value.slice(action.value.indexOf(':')+1):null;const target=occurrences.find(o=>o.occurrenceKey===key);const compatible=target&&(desired==='line'||desired==='future'&&target.status==='planned'&&target.sourceTransactionId||desired==='match'&&target.status==='planned'||desired==='existing'&&target.status==='actual');const value=compatible?`${desired}:${key}`:desired;if(![...action.options].some(o=>o.value===value)){const o=el('option',value);o.value=value;action.append(o);}action.value=value;action.dispatchEvent(new Event('change'));grid.draw();});
      const saveMapping=button('Create mapping',()=>{
        if(!secondary.value){error.textContent='Choose a secondary account first. Actions are independent of mapping rules.';return;}
        const existing=mapping.rule;
        const field=existing?.field || (entry.originalDescription?'originalDescription':'description');
        mappingEditor.edit({id:existing?.id,accountId:batch.accountId,field,comparison:existing?.comparison || 'contains',pattern:existing?.pattern || relevantMappingText(entry[field]) || '',direction:entry.amountCents>0?'in':'out',secondaryAccountId:secondary.value});
      });
      const syncMapping=()=>{const changed=mapping.rule&&Number(secondary.value)!==Number(mapping.rule.secondaryAccountId);saveMapping.hidden=Boolean(mapping.rule&&!changed);saveMapping.textContent='💾';saveMapping.title=changed?'Update mapping':'Create mapping';saveMapping.setAttribute('aria-label',changed?'Update mapping':'Create mapping');reason.textContent=draft.reason+(changed?' (account changed — not saved)':'');};
      const viewMapping=button('↗',()=>{if(mapping.rule)mappingEditor.edit(mapping.rule);});viewMapping.title='View mapping';viewMapping.setAttribute('aria-label',`View mapping source row ${entry.index+1}`);viewMapping.hidden=!mapping.rule;
      ruleCell.append(saveMapping,viewMapping);syncMapping();
      secondary.addEventListener('change',()=>{
        // Changing the account re-evaluates payment candidates, never writes a mapping implicitly.
        const candidates=secondary.value?suggestStatementMatches(entry,occurrences.filter(o=>counterpartyId(o,batch.accountId)===Number(secondary.value)),batch.accountId):[];
        const best=candidates[0];let value='match';
        if(best&&(candidates.length===1||best.score>candidates[1].score))value=`${best.status==='actual'?'existing':'match'}:${best.occurrenceKey}`;
        if(value.includes(':')&&![...action.options].some(o=>o.value===value)){const option=el('option',best.description);option.value=value;action.append(option);}
        action.value=value;action.dispatchEvent(new Event('change'));syncMapping();grid.draw();
      });
      const actionCell=el('td');actionCell.append(operation,action,chooseMatch,matchInfo);const secondaryCell=el('td');secondaryCell.append(secondary,...ruleCell.childNodes);tr.append(actionCell,secondaryCell);
      gridRows.push({entry,tr,check,action,secondary,draft,get reason(){return draft.reason;},isReady(){
        if(parsed.balanceIssues.length)return false;
        const o=action.value.includes(':')&&occurrences.find(o=>o.occurrenceKey===action.value.slice(action.value.indexOf(':')+1));
        if(action.value==='ignore')return true;
        if((scenario.baselinePeriods || []).some(p=>(o?.scheduledDate || entry.postingDate)>=p.startDate && (o?.scheduledDate || entry.postingDate)<=p.endDate))return false;
        if(o){if(o.transactionGroupId)return false;if(action.value.startsWith('line:'))return ['planned','actual'].includes(o.status);if(action.value.startsWith('future:'))return o.status==='planned'&&Boolean(o.sourceTransactionId)&&!o.lineItems?.length;return !o.lineItems?.length&&(action.value.startsWith('match:')?o.status==='planned':o.status==='actual'&&signedOccurrenceAmount(o,batch.accountId)===entry.amountCents&&o.actualDate===entry.postingDate);}
        return action.value==='create'&&Boolean(secondary.value);
      }});
      pending.push({entry,check,action,secondary});
    });
    wrap.append(table);content.append(el('h3','Review transactions'),wrap);
    const grid=await buildStatementReviewGrid({table,heading,rows:gridRows,state:gridState,onError:e=>{delete error.dataset.state;error.textContent=e.message;}});wrap.before(grid.controls);grids.push(grid);
    const apply=button('Apply approved rows',guard(async()=>{
      const decisions=pending.filter(p=>p.check.checked).map(p=>{
        const [action,...rest]=p.action.value.split(':');const occurrenceKey=rest.join(':');
        const target=occurrences.find(o=>o.occurrenceKey===occurrenceKey);
        return {index:p.entry.index,action:action==='future'?'match':action,updateFuture:action==='future',occurrenceKey,secondaryAccountId:Number(p.secondary.value),expectedAmount:target?.plannedAmount,expectedActualAmount:target?.actualAmount??0};
      });
      if(!decisions.length)throw new Error('Tick at least one row to approve.');
      apply.disabled=true;
      try {const result=await applyStatementDecisions(scenarioId,batch.id,decisions);await onApplied?.();await refresh();error.dataset.state='success';error.textContent=`Applied ${result.changes.length} reviewed row(s). Download the reconciliation report for details.`;}finally {apply.disabled=false;}
    }));apply.disabled=parsed.balanceIssues.length>0;content.append(apply);
  }
  await guard(refresh)();
}
