import { createModal } from './modal-factory.js';
import { parseStatement, signedOccurrenceAmount, defaultStatementWindow } from '../../../shared/statement-utils.js';
import { retainStatement, appliedStatementFingerprints } from '../../../app/services/statement-service.js';
import { applyStatementDecisions } from '../../../app/managers/occurrence-manager.js';
import { getScenario } from '../../../app/services/data-service.js';
import { resolveScenarioOccurrences } from '../../../domain/queries/resolve-scenario-occurrences.js';
import { statementMappingFor, statementMappingLabel, relevantMappingText } from '../../../shared/statement-mapping-utils.js';
import { STATEMENT_ACTIONS, statementTargetCandidates, statementPairOccurrences, validateStatementPeriod, inStatementPeriod, statementSourceWindow, suggestStatementAction, normalizeAmountMatching, statementAmountMatches } from '../../../shared/statement-workflow-utils.js';
import { generatePeriods } from '../../../domain/calculations/period-utils.js';
import { createGrid } from '../grids/grid-factory.js';
import { buildStatementMappingEditor } from '../widgets/statement-mapping-editor.js';
import { buildStatementReviewGrid } from '../widgets/statement-review-grid.js';
import { createScenarioAccountSelectors } from '../widgets/scenario-account-select.js';
import { openRecurrenceModal } from './recurrence-modal.js?v=20260926-future-plan-47';

function el(tag,text='',className=''){const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n;}
function button(text,fn){const n=el('button',text,'icon-btn');n.type='button';n.onclick=fn;return n;}
function select(options,label){const n=el('select');if(label)n.setAttribute('aria-label',label);for(const [value,text] of options){const o=el('option',text);o.value=value;n.append(o);}return n;}
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export async function openStatementReconciliationModal({scenarioId,onApplied}={}){
  let grids=[],scenario,activeId=null,periodType='Month',periodId=null,customPeriod=null;
  const drafts=new Map(),sourceWindows=new Map(),gridState={},mappingState={};
  const {modal,close}=createModal({contentClass:'statement-reconciliation-modal',onClose:()=>{grids.forEach(g=>g.destroy());grids=[];}});
  const content=el('div'),error=el('p','','statement-error');error.setAttribute('role','alert');
  modal.append(el('h2','Statement reconciliation'),el('p','Statements are source records. Map each row to FTrack accounts and a reporting/budget period, then approve the proposed transaction lines.'),error,content,button('Close',close));
  const fail=e=>{delete error.dataset.state;error.textContent=e.message;};
  const guard=fn=>async()=>{error.textContent='';delete error.dataset.state;try{await fn();}catch(e){fail(e);}};
  const refresh=async()=>{scenario=await getScenario(scenarioId);if(!scenario)throw new Error('Scenario no longer exists.');await render();};
  function chooseTarget(entry,candidates,onChoose,amountMatching={}){
    const {modal:picker,close:dismiss}=createModal({contentClass:'statement-match-picker'});
    picker.append(el('h2','Choose period transaction'),el('p',`${entry.description} · ${entry.postingDate} · ${(entry.amountCents/100).toFixed(2)}. These are FTrack transactions for the selected account pair and period.`));
    if(!candidates.length)picker.append(el('p','No compatible transaction in this period. Add line item can create a new period transaction.'));
    for(const o of candidates)picker.append(button(`${o.description||'(no description)'} · ${o.scheduledDate} · Budget ${Number(o.plannedAmount).toFixed(2)} · ${o.status}${amountMatching.amountMatchingEnabled?(statementAmountMatches(entry,o,amountMatching)?' · Within amount tolerance':' · Outside amount tolerance (manual override)'):''}`,()=>{onChoose(o);dismiss();}));
    picker.append(button('Cancel',dismiss));
  }
  async function render(){
    grids.forEach(g=>g.destroy());grids=[];content.replaceChildren();
    const accountSelectors=createScenarioAccountSelectors({getScenario:()=>scenario,onCreated:()=>onApplied?.(),onError:fail});grids.push(accountSelectors);
    const batches=scenario.statementImports||[],batch=batches.find(b=>b.id===activeId),parsed=batch?parseStatement(batch.rawCsv):null;
    const toolbar=el('div','','statement-source-toolbar'),sources=el('div','','statement-source-selectors'),imports=el('div','','statement-source-imports');toolbar.append(sources,imports);content.append(toolbar);
    const archive=select([['','Choose retained source'],...batches.map(b=>[b.id,`${b.fileName} — ${b.importedAt.slice(0,10)}`])],'Retained statements');archive.value=activeId||'';archive.onchange=guard(async()=>{activeId=archive.value;periodId=null;drafts.clear();await render();});const archiveLabel=el('label','Retained statements');archiveLabel.append(archive);sources.append(archiveLabel);
    const file=el('input');file.type='file';file.accept='.csv,text/csv';file.setAttribute('aria-label','Statement CSV');const fileLabel=el('label','Retain new source');fileLabel.append(file);imports.append(fileLabel);
    file.onchange=guard(async()=>{if(!file.files[0])return;activeId=await retainStatement(scenarioId,file.files[0].name,await file.files[0].text());periodId=null;drafts.clear();await refresh();});
    const mappingEditor=buildStatementMappingEditor({scenario,scenarioId,accountSelectors,state:mappingState,onError:fail,onChanged:async({keepOpen=true}={})=>{const scroll=modal.scrollTop;error.textContent='';delete error.dataset.state;drafts.clear();await refresh();content.querySelector('.statement-mappings').open=keepOpen;modal.scrollTop=scroll;}});content.append(mappingEditor.element);grids.push(mappingEditor);
    if(!batch){content.append(el('p',batches.length?'Choose a retained statement to review, or upload another CSV. No FTrack account attachment is required.':'Choose a CSV above to retain it automatically. No FTrack account attachment is required.'));return;}
    imports.append(button('Download original CSV',()=>download(batch.rawCsv,batch.fileName,'text/csv')),button('Download reconciliation report',()=>download(JSON.stringify({fileName:batch.fileName,sha256:batch.sha256,legacyAccountId:batch.legacyAccountId??null,decisions:batch.decisions,flags:parsed.entries.filter(e=>e.insufficientFunds).map(e=>({index:e.index,reason:'insufficient-funds',excluded:true}))},null,2),'statement-reconciliation.json','application/json')));

    const periodBar=el('div','','statement-review-controls statement-timeframe');
    const field=(name,input)=>{const label=el('label',name);label.append(input);periodBar.append(label);return input;};
    const type=select(['Month','Week','Quarter','Year','Custom'].map(v=>[v,v]),'Statement period type');type.value=periodType;
    type.onchange=guard(async()=>{periodType=type.value;periodId=null;drafts.clear();await render();});field('Budget period',type);
    let period;
    if(periodType==='Custom'){
      if(!customPeriod){const window=defaultStatementWindow();const end=new Date(window.endDate+'T12:00:00Z');end.setUTCDate(end.getUTCDate()-1);customPeriod={type:'Custom',startDate:window.startDate,endDate:end.toISOString().slice(0,10)};}
      period=validateStatementPeriod(customPeriod);
      const from=el('input'),to=el('input');from.type=to.type='date';from.value=period.startDate;to.value=period.endDate;from.setAttribute('aria-label','Custom budget from');to.setAttribute('aria-label','Custom budget to');
      periodBar.append(from,to,button('Apply custom period',guard(async()=>{customPeriod=validateStatementPeriod({type:'Custom',startDate:from.value,endDate:to.value});drafts.clear();await render();})));
    }else{
      const start=[scenario.timeframe?.startDate||parsed.startDate,parsed.startDate].sort()[0],end=[scenario.timeframe?.endDate||parsed.endDate,parsed.endDate].sort().at(-1);
      // Calendar boundaries avoid month-end stepping skipping shorter months and
      // keep quarter/year periods complete rather than clipped to source dates.
      const periods=generatePeriods(`${start.slice(0,4)}-01-01`,`${end.slice(0,4)}-12-31`,periodType).map(p=>{
        if(periodType!=='Week')return p;
        const last=new Date(`${p.startDate}T12:00:00Z`);last.setUTCDate(last.getUTCDate()+6);
        return {...p,endDate:last.toISOString().slice(0,10)};
      });if(!periods.length)throw new Error('No reporting periods are available.');
      let chosen=periods.find(p=>p.id===periodId)||periods.find(p=>inStatementPeriod(parsed.endDate,p))||periods[0];periodId=chosen.id;period=validateStatementPeriod({...chosen,type:periodType});
      const picker=select(periods.map(p=>[p.id,p.label]),'Statement budget period');picker.value=periodId;picker.title=`${period.startDate} to ${period.endDate} (inclusive)`;picker.onchange=guard(async()=>{periodId=picker.value;drafts.clear();await render();});field('Period',picker);
    }
    const windowKey=`${batch.id}:${period.id}:${period.startDate}:${period.endDate}`;
    const transactionWindow=validateStatementPeriod(sourceWindows.get(windowKey)||statementSourceWindow(period));
    const sourceFrom=el('input'),sourceTo=el('input');sourceFrom.type=sourceTo.type='date';sourceFrom.value=transactionWindow.startDate;sourceTo.value=transactionWindow.endDate;
    sourceFrom.setAttribute('aria-label','Statement review from');sourceTo.setAttribute('aria-label','Statement review to (inclusive)');
    field('Transactions from',sourceFrom);field('Transactions to (inclusive)',sourceTo);
    periodBar.append(button('Apply dates',guard(async()=>{const next=validateStatementPeriod({type:'Custom',startDate:sourceFrom.value,endDate:sourceTo.value});sourceWindows.set(windowKey,next);drafts.clear();await render();})));
    content.append(periodBar);
    const windowEntries=parsed.entries.filter(e=>inStatementPeriod(e.postingDate,transactionWindow)),flagged=windowEntries.filter(e=>e.insufficientFunds);
    const flags=el('details','','statement-flagged');flags.classList.toggle('has-flags',Boolean(flagged.length));flags.open=Boolean(flagged.length);flags.append(el('summary',`Flagged / excluded entries (${flagged.length})`),el('p','Failed payments are excluded from approval, not deleted from the original source. Charged fees remain separate review rows.'));
    flagged.forEach(e=>flags.append(el('p',`Source row ${e.index+1} · ${e.postingDate} · ${e.description} · Insufficient funds — excluded`,'statement-insufficient-funds')));content.append(flags,el('p',`${parsed.entries.length} source rows; ${parsed.entries.filter(e=>e.monetary).length} monetary rows. ${parsed.balanceIssues.length?'Balance validation FAILED: applying is blocked.':'Running balance checks passed.'}`));
    imports.append(button('View full source',guard(async()=>{
      let originalGrid=null;
      const {modal:source,close:dismiss}=createModal({contentClass:'statement-source-modal',onClose:()=>originalGrid?.destroy()});
      source.append(el('h2',batch.fileName),el('p','Complete original CSV, including rows outside the transaction timeframe.'));
      const holder=el('div','','statement-source-grid');source.append(holder,button('Close source',dismiss));
      originalGrid=await createGrid(holder,{height:'65vh',responsiveLayout:false,data:parsed.rows.map((r,id)=>({id,...Object.fromEntries(r.map((v,i)=>[`c${i}`,v]))})),columns:parsed.headers.map((title,i)=>({title,field:`c${i}`,headerSort:true,minWidth:120,sorter:['Nr','Money In','Money Out','Fee','Balance'].includes(title)?'number':'string',formatter:cell=>el('span',cell.getValue(),parsed.entries[cell.getData().id].insufficientFunds?'statement-insufficient-funds':'')}))});
    })));
    const {occurrences}=resolveScenarioOccurrences({scenario,startDate:period.startDate,endDate:period.endDate});
    const seen=appliedStatementFingerprints(scenario),mappings=new Map(windowEntries.map(entry=>[entry.index,statementMappingFor(entry,scenario.statementMappings,scenario.accounts)])),wrap=el('div','','statement-table-wrap'),table=el('table'),heading=el('tr');
    ['Approve','Date','Description','Original description','Category','Parent category','Amount','Budget amount','Primary account','Secondary account / mapping','Actions'].forEach(h=>heading.append(el('th',h)));table.append(heading);const rows=[];let grid=null;
    for(const entry of windowEntries.filter(e=>!e.insufficientFunds)){
      const tr=el('tr'),check=el('input');check.type='checkbox';check.setAttribute('aria-label',`Approve source row ${entry.index+1}`);const first=el('td');first.append(check);tr.append(first,...[entry.postingDate,entry.description,entry.originalDescription,entry.category,entry.parentCategory,(entry.amountCents/100).toFixed(2)].map(v=>el('td',v)));
      const mapping=mappings.get(entry.index),reason=statementMappingLabel(mapping,scenario.accounts),reviewed=batch.decisions?.[entry.index],duplicate=entry.monetary&&seen.has(entry.fingerprint);
      const budgetCell=el('span','—');tr.append(el('td'));tr.lastChild.append(budgetCell);
      if(reviewed||duplicate||!entry.monetary){check.disabled=true;const status=reviewed?`Reviewed: ${reviewed.action}`:duplicate?'Already reconciled in retained source':'Non-monetary source record';const mappingCell=el('td');mappingCell.title=reason;tr.append(el('td',reviewed?.primaryAccountId?scenario.accounts.find(a=>Number(a.id)===Number(reviewed.primaryAccountId))?.name||'':'Historical source'),mappingCell,el('td',status));rows.push({entry,tr,check,status,reason,draft:{}});continue;}
      const key=`${batch.id}:${period.startDate}:${period.endDate}:${entry.index}`;
      if(!drafts.has(key))drafts.set(key,{primary:String(mapping.rule?.primaryAccountId||''),secondary:String(mapping.rule?.secondaryAccountId||''),operation:'create',autoAction:true,targetKey:null,approved:false});
      const draft=drafts.get(key),primary=accountSelectors.create({label:`Primary account source row ${entry.index+1}`,emptyLabel:'Choose primary account',selectedId:draft.primary}),secondary=accountSelectors.create({label:`Secondary account source row ${entry.index+1}`,emptyLabel:'Choose secondary account',selectedId:draft.secondary,defaultTypeId:5}),operation=select(Object.entries(STATEMENT_ACTIONS),`Action source row ${entry.index+1}`),action=select([]);action.hidden=true;operation.value=draft.operation;check.checked=draft.approved;
      const amountSettings=()=>{const settings=normalizeAmountMatching(mapping.rule||{});return {...settings,amountMatchingEnabled:settings.amountMatchingEnabled&&draft.useAmountMatching!==false};};
      const candidates=()=>{
        if(!primary.value||!secondary.value||['create','createPlan','ignore'].includes(operation.value))return [];
        return statementTargetCandidates(occurrences,{primaryAccountId:primary.value,secondaryAccountId:secondary.value,transactionTypeId:entry.amountCents>0?1:2,period,action:operation.value}).filter(o=>operation.value!=='existing'||signedOccurrenceAmount(o,Number(primary.value))===entry.amountCents&&o.actualDate===entry.postingDate);
      };
      const choose=button('↗',()=>chooseTarget(entry,candidates(),o=>{draft.autoAction=false;draft.targetKey=o.occurrenceKey;update(true,false);},normalizeAmountMatching(mapping.rule||{})));choose.title='Choose payment';choose.setAttribute('aria-label',`Choose match source row ${entry.index+1}`);
      const amountToggle=button('%',()=>{draft.useAmountMatching=!amountSettings().amountMatchingEnabled;draft.autoAction=true;update(true);});amountToggle.classList.add('statement-amount-toggle');amountToggle.setAttribute('aria-label',`Use amount tolerance source row ${entry.index+1}`);amountToggle.hidden=!normalizeAmountMatching(mapping.rule||{}).amountMatchingEnabled;
      const save=button('💾',()=>{if(!primary.value||!secondary.value||primary.value===secondary.value){fail(new Error('Choose two different FTrack accounts before saving a mapping.'));return;}const rule=mapping.rule;mappingEditor.edit({id:rule?.id,primaryAccountId:Number(primary.value),secondaryAccountId:Number(secondary.value),defaultAction:operation.value,field:rule?.field||'originalDescription',pattern:rule?.pattern||relevantMappingText(entry.originalDescription||entry.description),comparison:rule?.comparison||'contains',direction:entry.amountCents>0?'in':'out'});});
      const view=button('↗',()=>mappingEditor.edit(mapping.rule));view.setAttribute('aria-label',`View mapping source row ${entry.index+1}`);view.title='View mapping';view.hidden=!mapping.rule;
      const repeat=button('⟳',()=>openRecurrenceModal(draft.recurrence||{recurrenceType:4,interval:1,startDate:period.startDate,dayOfMonth:Number(entry.postingDate.slice(8)),endDate:null},value=>{draft.recurrence=value;update(true);}));repeat.title='Set repeat frequency and end date';repeat.setAttribute('aria-label',`Repeat source row ${entry.index+1}`);
      const primaryCell=el('td');primaryCell.append(primary);const secondaryCell=el('td');secondaryCell.title=reason;secondaryCell.append(secondary,save,view);const actionCell=el('td');actionCell.append(operation,action,choose,repeat,amountToggle);tr.append(primaryCell,secondaryCell,actionCell);
      function update(changed=false,reselect=false){
        draft.primary=primary.value;draft.secondary=secondary.value;
        if(draft.autoAction){
          const rowCount=windowEntries.filter(other=>{if(!other.monetary||other.insufficientFunds||batch.decisions?.[other.index]?.action==='ignore')return false;const reviewed=batch.decisions?.[other.index],saved=drafts.get(`${batch.id}:${period.startDate}:${period.endDate}:${other.index}`),rule=mappings.get(other.index)?.rule;const p=String(reviewed?.primaryAccountId??saved?.primary??rule?.primaryAccountId??''),s=String(reviewed?.secondaryAccountId??saved?.secondary??rule?.secondaryAccountId??'');return p===primary.value&&s===secondary.value||p===secondary.value&&s===primary.value;}).length;
          const suggestion=suggestStatementAction({occurrences,entry,primaryAccountId:primary.value,secondaryAccountId:secondary.value,period,rowCount,defaultAction:mapping.rule?.defaultAction,amountMatching:amountSettings()});
          operation.value=suggestion.action;draft.targetKey=suggestion.targetKey;
        }
        draft.operation=operation.value;
        const choices=candidates();if(reselect&&!draft.autoAction||draft.targetKey&&!choices.some(o=>o.occurrenceKey===draft.targetKey))draft.targetKey=null;
        if(!draft.targetKey&&choices.length===1&&!draft.autoAction)draft.targetKey=choices[0].occurrenceKey;
        action.replaceChildren();const option=el('option');option.value=draft.targetKey?`${operation.value}:${draft.targetKey}`:operation.value;action.append(option);action.value=option.value;
        choose.hidden=['ignore','create','createPlan'].includes(operation.value)||!choices.length;
        repeat.hidden=operation.value!=='createPlan';
        const target=choices.find(o=>o.occurrenceKey===draft.targetKey);
        amountToggle.setAttribute('aria-pressed',String(amountSettings().amountMatchingEnabled));amountToggle.title=`Amount tolerance ${amountSettings().amountMatchingEnabled?'on':'bypassed'}: ${amountSettings().amountVariancePercent}% ${amountSettings().amountVarianceDirection}. Click to toggle for this row only.`;
        amountToggle.textContent=amountSettings().amountMatchingEnabled?`${{up:'+',down:'−',both:'±'}[amountSettings().amountVarianceDirection]}${amountSettings().amountVariancePercent}%`:'% off';
        draft.amountMatching=amountSettings();draft.amountToleranceOverridden=Boolean(normalizeAmountMatching(mapping.rule||{}).amountMatchingEnabled&&(!amountSettings().amountMatchingEnabled||target&&!statementAmountMatches(entry,target,mapping.rule)));
        const pairItems=statementPairOccurrences(occurrences,{primaryAccountId:primary.value,secondaryAccountId:secondary.value,period});
        for(const option of operation.options)if(['create','createPlan'].includes(option.value))option.disabled=Boolean(pairItems.length);
        draft.budgetAmount=target?.plannedAmount??(pairItems.length===1?pairItems[0].plannedAmount:null);
        budgetCell.textContent=draft.budgetAmount==null?'—':new Intl.NumberFormat(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}).format(draft.budgetAmount);
        budgetCell.title=pairItems.length>1&&!target?'Choose a target to see its budget amount.':draft.budgetAmount==null?'No transaction in this budget period.':'Current planned amount for the matching budget transaction.';
        actionCell.title=operation.title=target?`Linked to: ${target.description||'(no description)'} · ${target.scheduledDate} · Actual ${(Number(target.actualAmount)||0).toFixed(2)}`:pairItems.length&&!choices.length?'An existing transaction is skipped, frozen or split. Review it instead of creating a duplicate.':choices.length>1?'Multiple transactions in this period. Choose a target.':operation.value==='ignore'?'Excluded from FTrack changes.':['line','create','createPlan'].includes(operation.value)?'Creates a period-only transaction if needed; subsequent approved lines use the same transaction.':'Select a compatible transaction in this period.';
        if(!target&&choices.length&&amountSettings().amountMatchingEnabled)operation.title=actionCell.title='No unique match within the mapping amount tolerance. Choose a target manually or bypass tolerance for this row.';
        const changedRule=mapping.rule&&(Number(primary.value)!==Number(mapping.rule.primaryAccountId)||Number(secondary.value)!==Number(mapping.rule.secondaryAccountId)||operation.value!==mapping.rule.defaultAction);
        save.hidden=Boolean(mapping.rule&&!changedRule);save.setAttribute('aria-label',changedRule?'Update mapping':'Create mapping');save.title=changedRule?'Update mapping':'Create mapping';
        if(changed){draft.approved=false;check.checked=false;grid?.draw();}
      }
      const accountChanged=()=>{draft.autoAction=true;update(true,true);for(const row of rows)row.updateAuto?.();};
      primary.onchange=accountChanged;secondary.onchange=accountChanged;operation.onchange=()=>{draft.autoAction=false;update(true,true);if(operation.value==='createPlan'&&!draft.recurrence)repeat.click();};update();
      const row={entry,tr,check,primary,secondary,action,draft,reason,updateAuto:()=>{if(draft.autoAction)update(true);},isReady(){
        if(parsed.balanceIssues.length)return false;if(operation.value==='ignore')return true;
        if(!primary.value||!secondary.value||primary.value===secondary.value)return false;
        const target=draft.targetKey&&occurrences.find(o=>o.occurrenceKey===draft.targetKey);
        if((scenario.baselinePeriods||[]).some(p=>inStatementPeriod(target?.scheduledDate||period.startDate,p)))return false;
        if(['create','createPlan'].includes(operation.value)&&statementPairOccurrences(occurrences,{primaryAccountId:primary.value,secondaryAccountId:secondary.value,period}).length)return false;
        if(operation.value==='createPlan'&&(!draft.recurrence||Number(draft.recurrence.recurrenceType?.id??draft.recurrence.recurrenceType)===1))return false;
        if(!target)return ['line','create','createPlan'].includes(operation.value)&&!statementPairOccurrences(occurrences,{primaryAccountId:primary.value,secondaryAccountId:secondary.value,period}).length;
        return candidates().some(o=>o.occurrenceKey===target.occurrenceKey);
      }};check.addEventListener('change',()=>{if(check.checked&&!row.isReady()){check.checked=false;draft.approved=false;fail(new Error('Complete the account pair and select an unambiguous period transaction before approving.'));}});rows.push(row);
    }
    for(const row of rows)row.updateAuto?.();
    wrap.append(table);content.append(el('h3','Review transactions'),wrap);
    grid=await buildStatementReviewGrid({table,heading,rows,state:gridState,onError:fail});wrap.before(grid.controls);grids.push(grid);
    const apply=button('Apply approved rows',guard(async()=>{
      const approved=rows.filter(r=>r.check.checked&&!r.check.disabled);if(!approved.length)throw new Error('Tick at least one row to approve.');if(approved.some(r=>!r.isReady()))throw new Error('Resolve incomplete or ambiguous rows before applying.');
      const decisions=approved.map(r=>{const [operation,...rest]=r.action.value.split(':'),occurrenceKey=rest.join(':')||null,target=occurrences.find(o=>o.occurrenceKey===occurrenceKey);return {index:r.entry.index,action:operation==='future'?'match':operation,updateFuture:operation==='future',recurrence:r.draft.recurrence,amountMatching:r.draft.amountMatching,amountToleranceOverridden:r.draft.amountToleranceOverridden,occurrenceKey,primaryAccountId:Number(r.primary.value),secondaryAccountId:Number(r.secondary.value),period,transactionWindow,expectedAmount:target?.plannedAmount,expectedActualAmount:target?.actualAmount??0};});
      apply.disabled=true;try{const result=await applyStatementDecisions(scenarioId,batch.id,decisions);await onApplied?.();await refresh();error.dataset.state='success';error.textContent=`Applied ${result.changes.length} reviewed row(s). Download the reconciliation report for details.`;}finally{apply.disabled=false;}
    }));apply.disabled=Boolean(parsed.balanceIssues.length);content.append(apply);
  }
  await guard(refresh)();
}
