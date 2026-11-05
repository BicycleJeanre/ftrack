import { saveStatementMapping, removeStatementMapping, removeStatementMappings, updateStatementMappings } from '../../../app/services/statement-service.js';
import { confirmDialog } from '../../../shared/notifications.js';
import { createGrid } from '../grids/grid-factory.js';
import { MAPPING_FIELD_LABELS, compileMappingSearch } from '../../../shared/statement-mapping-utils.js';
import { STATEMENT_ACTIONS, normalizeAmountMatching } from '../../../shared/statement-workflow-utils.js';
import { createScenarioAccountSelectors } from './scenario-account-select.js';

export function buildStatementMappingEditor({scenario,scenarioId,accountId,accountSelectors:providedSelectors,onChanged,onError,state={}}) {
  const accountSelectors=providedSelectors||createScenarioAccountSelectors({getScenario:()=>scenario,onError});
  const accountSelect=(label,options={})=>accountSelectors.create({label,...options});
  const node=(tag,text='')=>{const e=document.createElement(tag);e.textContent=text;return e;};
  const button=(text,fn)=>{const e=node('button',text);e.type='button';e.className='icon-btn';e.onclick=()=>Promise.resolve().then(fn).catch(onError);return e;};
  const select=(label,options)=>{const e=node('select');e.setAttribute('aria-label',label);for(const [value,text] of options){const o=node('option',text);o.value=value;e.append(o);}return e;};
  const saved=scenario.statementMappings || [];
  const selected=new Set((state.selectedIds || []).filter(id=>saved.some(r=>r.id===id))),checks=new Map();
  const details=node('details');details.className='statement-mappings';details.append(node('summary',`Mapping rules — ${saved.length} saved`),node('p','Click a cell to edit. Rules map statements to FTrack accounts. A single row completes the matching period payment; repeated rows add line items. Future-plan changes and recurring-plan creation are manual choices. Ignore preferences are retained. Saving clears review approvals.'));
  const bulk=node('div');bulk.className='statement-mapping-bulk';const count=node('span');
  let removeSelected=null;
  const syncSelection=()=>{state.selectedIds=[...selected];count.textContent=`${selected.size} selected · ${saved.filter(matches).length} of ${saved.length} shown`;if(removeSelected)removeSelected.disabled=selected.size===0;};
  const accounts=()=>scenario.accounts.map(a=>[String(a.id),a.name]);
  const filters=node('div');filters.className='statement-review-controls statement-mapping-filters';
  const descriptionFilter=node('input');descriptionFilter.type='search';descriptionFilter.placeholder='Find description / matching text';descriptionFilter.setAttribute('aria-label','Filter mappings by description');descriptionFilter.value=state.descriptionFilter || '';
  descriptionFilter.maxLength=500;
  descriptionFilter.title='Case-insensitive contains search: * = zero or more characters; % = exactly one. Use ** for a literal * and %% for a literal %.';
  const accountFilter=accountSelect('Filter mappings by secondary account',{emptyLabel:'All secondary accounts',selectedId:state.secondaryFilter||'',allowCreate:false});
  let searchValue=null,searchMatch=null;
  function matches(rule){if(searchValue!==descriptionFilter.value){searchValue=descriptionFilter.value;searchMatch=compileMappingSearch(searchValue);}return searchMatch(rule.pattern)&&(!accountFilter.value||Number(rule.secondaryAccountId)===Number(accountFilter.value));}
  function applyFilters(){
    state.descriptionFilter=descriptionFilter.value;state.secondaryFilter=accountFilter.value;
    for(const id of selected)if(!saved.some(r=>r.id===id&&matches(r))){selected.delete(id);const check=checks.get(id);if(check)check.checked=false;}
    syncSelection();if(grid&&!destroyed)grid.setFilter(matches);
  }
  for(const [label,input] of [['Description / matching text',descriptionFilter],['Secondary account',accountFilter]]){const l=node('label',label);l.append(input);filters.append(l);}
  filters.append(button('Clear mapping filters',()=>{descriptionFilter.value='';accountFilter.value='';accountFilter.dispatchEvent(new Event('change',{bubbles:true}));applyFilters();}));
  details.append(filters);
  filters.append(node('small','Search: * = any number of characters · % = one character · ** / %% = literal * / %. Case-insensitive.'));
  descriptionFilter.oninput=applyFilters;accountFilter.onchange=applyFilters;
  // Selections outside restored filters must not participate in a later bulk edit.
  for(const id of selected)if(!saved.some(r=>r.id===id&&matches(r)))selected.delete(id);syncSelection();
  const fields=Object.entries(MAPPING_FIELD_LABELS),comparisons=[['contains','Contains'],['exact','Equals']],directions=[['out','Money out'],['in','Money in']],actions=Object.entries(STATEMENT_ACTIONS);
  const amountModes=[['false','Off'],['true','On']],varianceDirections=[['both','Both'],['up','Above plan'],['down','Below plan']];
  const percentInput=(label)=>{const input=node('input');input.type='number';input.min='0';input.max='100';input.step='0.01';input.setAttribute('aria-label',label);return input;};
  const bulkControls=[['primaryAccountId','Primary account',accountSelect('Bulk mapping primary account',{emptyLabel:'Keep current'})],['secondaryAccountId','Secondary account',accountSelect('Bulk mapping secondary account',{emptyLabel:'Keep current',defaultTypeId:5})],['defaultAction','Default action',select('Bulk mapping default action',[['','Keep current'],...actions])],['field','Field',select('Bulk mapping field',[['','Keep current'],...fields])],['comparison','Comparison',select('Bulk mapping comparison',[['','Keep current'],...comparisons])],['direction','Direction',select('Bulk mapping direction',[['','Keep current'],...directions])]];
  bulkControls.push(['amountMatchingEnabled','Amount matching',select('Bulk mapping amount matching',[['','Keep current'],...amountModes])],['amountVariancePercent','Variance %',percentInput('Bulk mapping variance percent')],['amountVarianceDirection','Variance direction',select('Bulk mapping variance direction',[['','Keep current'],...varianceDirections])]);
  const setSelection=checked=>{for(const rule of saved){if(checked&&matches(rule))selected.add(rule.id);else selected.delete(rule.id);const check=checks.get(rule.id);if(check)check.checked=selected.has(rule.id);}syncSelection();};
  bulk.append(button('Select all visible mappings',()=>setSelection(true)),button('Clear mapping selection',()=>setSelection(false)),count);
  for(const [,label,input] of bulkControls){const l=node('label',label);l.append(input);bulk.append(l);}
  bulk.append(button('Apply to selected mappings',async()=>{const changes={};for(const [key,,input] of bulkControls)if(input.value)changes[key]=input.value;const ids=saved.filter(r=>selected.has(r.id)&&matches(r)).map(r=>r.id);await updateStatementMappings(scenarioId,ids,changes);await onChanged({keepOpen:true});}));
  removeSelected=button('Remove selected mappings',async()=>{
    const ids=saved.filter(r=>selected.has(r.id)&&matches(r)).map(r=>r.id);
    if(!ids.length)throw new Error('Select at least one mapping to remove.');
    if(!await confirmDialog(`Remove ${ids.length} selected mapping${ids.length===1?'':'s'}? Only these saved rules will be removed. Transactions and statement sources will not be deleted.`))return;
    await removeStatementMappings(scenarioId,ids);await onChanged({keepOpen:true});
  });removeSelected.classList.add('icon-btn--danger');removeSelected.disabled=selected.size===0;bulk.append(removeSelected);
  if(saved.length)details.append(bulk);
  const holder=node('div');holder.className='statement-mapping-grid';details.append(holder);
  let grid=null,building=null,destroyed=false;
  const safeText=cell=>node('span',cell.getValue()??'');
  const editor=(label,options)=> (cell,onRendered,success,cancel)=>{
    const input=options?select(`Edit mapping ${label}`,typeof options==='function'?options(cell):options):node('input');
    input.setAttribute('aria-label',`Edit mapping ${label}`);if(!options)input.maxLength=500;
    if(label==='Variance %'){input.type='number';input.min='0';input.max='100';input.step='0.01';}
    input.value=String(cell.getValue()??'');let done=false;
    const commit=()=>{if(!done){done=true;success(input.value);}};
    input.onchange=()=>{if(options)commit();};input.onblur=commit;
    input.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();done=true;cancel();}else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();commit();}};
    onRendered(()=>{input.focus();if(!options)input.select();});return input;
  };
  const column=(title,field,options)=>({title,field,minWidth:120,headerSort:true,editor:editor(title,options),formatter:options?cell=>{const values=typeof options==='function'?options(cell):options;return node('span',values.find(([id])=>String(id)===String(cell.getValue()))?.[1] || '(missing account)');}:safeText});
  const accountColumn=(title,field)=>({...column(title,field,accounts),editor:(cell,onRendered,success,cancel)=>{
    const holder=node('div'),input=accountSelect(`Edit mapping ${title}`,{selectedId:cell.getValue(),defaultTypeId:field==='secondaryAccountId'?5:1});
    holder.append(input);input.addEventListener('change',()=>success(input.value));
    holder.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}};
    onRendered(()=>queueMicrotask(()=>holder.querySelector('button')?.focus()));return holder;
  }});
  async function ensureGrid(){
    if(building)return building;
    building=(async()=>{
      grid=await createGrid(holder,{data:saved.map(r=>({...r,...normalizeAmountMatching(r)})),editTriggerEvent:'click',responsiveLayout:false,layout:'fitColumns',height:saved.length>8?'42vh':undefined,rowHeight:42,placeholder:saved.length?'No mappings match the current filters':'No saved mappings',columns:[
        {title:'Select',field:'selected',width:70,headerSort:false,formatter:cell=>{const r=cell.getData();const check=node('input');check.type='checkbox';check.checked=selected.has(r.id);check.setAttribute('aria-label',`Select mapping ${r.pattern}`);check.onclick=e=>e.stopPropagation();check.onchange=()=>{if(check.checked)selected.add(r.id);else selected.delete(r.id);syncSelection();};checks.set(r.id,check);return check;}},
        accountColumn('Primary account','primaryAccountId'),column('Field','field',fields),column('Comparison','comparison',comparisons),{...column('Text','pattern'),widthGrow:2},column('Direction','direction',directions),accountColumn('Secondary account','secondaryAccountId'),column('Default action','defaultAction',actions),column('Amount matching','amountMatchingEnabled',amountModes),column('Variance %','amountVariancePercent'),column('Variance direction','amountVarianceDirection',varianceDirections),
        {title:'Actions',field:'actions',width:80,headerSort:false,formatter:cell=>{const remove=button('×',async()=>{await removeStatementMapping(scenarioId,cell.getData().id);await onChanged({keepOpen:true});});remove.title='Remove mapping';remove.setAttribute('aria-label','Remove mapping');return remove;}}
      ],cellEdited:async cell=>{
        try{await updateStatementMappings(scenarioId,[cell.getData().id],{[cell.getField()]:cell.getValue()});await onChanged({keepOpen:true});}
        catch(error){if(!destroyed)cell.restoreOldValue();onError(error);}
      }});
      if(destroyed){grid.destroy();return;}
      await new Promise(resolve=>grid.on('tableBuilt',resolve));
      applyFilters();
      if(state.sort?.length)grid.setSort(state.sort);
      grid.on('dataSorted',sorters=>{state.sort=sorters.map(s=>({column:s.field,dir:s.dir}));});
    })();return building;
  }
  details.ontoggle=()=>{if(details.open)ensureGrid().catch(onError);};
  // The small form is only for creating a new mapping; existing rules edit in grid cells.
  const form=node('form');form.className='statement-mapping-form';form.hidden=true;
  const primary=accountSelect('Mapping primary account'),field=select('Mapping field',fields),comparison=select('Mapping comparison',comparisons),direction=select('Mapping direction',directions),secondary=accountSelect('Mapping secondary account',{emptyLabel:'Choose secondary account',defaultTypeId:5});
  const defaultAction=select('Mapping default action',actions),amountMode=select('Mapping amount matching',amountModes),variancePercent=percentInput('Mapping variance percent'),varianceDirection=select('Mapping variance direction',varianceDirections);
  variancePercent.value='0';
  const pattern=node('input');pattern.maxLength=500;pattern.setAttribute('aria-label','Mapping text');
  for(const [label,input] of [['Primary account',primary],['Field',field],['Comparison',comparison],['Text',pattern],['Direction',direction],['Secondary account',secondary],['Default action',defaultAction],['Amount matching',amountMode],['Variance %',variancePercent],['Variance direction',varianceDirection]]){const l=node('label',label);l.append(input);form.append(l);}
  form.append(node('small','Optional suggestion filter. 0% means exact; Above/Below/Both compare the statement amount with the planned amount. You can bypass it for a review row.'));
  const save=button('Save mapping',async()=>{await saveStatementMapping(scenarioId,{primaryAccountId:primary.value,field:field.value,comparison:comparison.value,pattern:pattern.value,direction:direction.value,secondaryAccountId:secondary.value,defaultAction:defaultAction.value,amountMatchingEnabled:amountMode.value,amountVariancePercent:variancePercent.value,amountVarianceDirection:varianceDirection.value});await onChanged({keepOpen:true});});
  form.onsubmit=e=>{e.preventDefault();save.click();};form.append(save,button('Cancel mapping edit',()=>{form.hidden=true;}));
  function edit(rule={}){
    details.open=true;
    if(rule.id){ensureGrid().then(()=>{if(destroyed)return;if(!matches(rule)){descriptionFilter.value='';accountFilter.value='';applyFilters();}grid.scrollToRow(rule.id,'nearest',false).then(()=>grid.getRow(rule.id).getCell('pattern').edit());}).catch(onError);return;}
    primary.value=String(rule.primaryAccountId||accountId||scenario.accounts[0]?.id);primary.dispatchEvent(new Event('change',{bubbles:true}));field.value=rule.field||'originalDescription';comparison.value=rule.comparison||'contains';pattern.value=rule.pattern||'';direction.value=rule.direction||'out';secondary.value=String(rule.secondaryAccountId||'');secondary.dispatchEvent(new Event('change',{bubbles:true}));defaultAction.value=rule.defaultAction||'line';amountMode.value=String(rule.amountMatchingEnabled??false);variancePercent.value=String(rule.amountVariancePercent??0);varianceDirection.value=rule.amountVarianceDirection||'both';form.hidden=false;pattern.focus();form.scrollIntoView({block:'nearest'});
  }
  details.append(form,button('New mapping',()=>edit()));
  return {element:details,edit,destroy(){destroyed=true;grid?.destroy();if(!providedSelectors)accountSelectors.destroy();}};
}
