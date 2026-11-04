import { saveStatementMapping, removeStatementMapping, updateStatementMappings } from '../../../app/services/statement-service.js';
import { createGrid } from '../grids/grid-factory.js';
import { MAPPING_FIELD_LABELS, mappingText } from '../../../shared/statement-mapping-utils.js';

export function buildStatementMappingEditor({scenario,scenarioId,accountId,onChanged,onError,state={}}) {
  const node=(tag,text='')=>{const e=document.createElement(tag);e.textContent=text;return e;};
  const button=(text,fn)=>{const e=node('button',text);e.type='button';e.className='icon-btn';e.onclick=()=>Promise.resolve().then(fn).catch(onError);return e;};
  const select=(label,options)=>{const e=node('select');e.setAttribute('aria-label',label);for(const [value,text] of options){const o=node('option',text);o.value=value;e.append(o);}return e;};
  const saved=(scenario.statementMappings || []).filter(r=>!accountId||Number(r.accountId)===Number(accountId));
  const selected=new Set((state.selectedIds || []).filter(id=>saved.some(r=>r.id===id))),checks=new Map();
  const details=node('details');details.className='statement-mappings';details.append(node('summary',`Mapping rules — ${saved.length} saved`),node('p','Click a cell to edit. Enter or leaving the cell saves; Escape cancels. Saved rules fill secondary accounts only. Saving refreshes suggestions and clears review approvals.'));
  const bulk=node('div');bulk.className='statement-mapping-bulk';const count=node('span');
  const syncSelection=()=>{state.selectedIds=[...selected];count.textContent=`${selected.size} selected · ${saved.filter(matches).length} of ${saved.length} shown`;};
  const accounts=scenario.accounts.map(a=>[String(a.id),a.name]);
  const filters=node('div');filters.className='statement-review-controls statement-mapping-filters';
  const descriptionFilter=node('input');descriptionFilter.type='search';descriptionFilter.placeholder='Find description / matching text';descriptionFilter.setAttribute('aria-label','Filter mappings by description');descriptionFilter.value=state.descriptionFilter || '';
  const accountFilter=select('Filter mappings by secondary account',[['','All secondary accounts'],...accounts]);accountFilter.value=state.secondaryFilter || '';
  function matches(rule){return (!descriptionFilter.value||mappingText(rule.pattern).includes(mappingText(descriptionFilter.value)))&&(!accountFilter.value||Number(rule.secondaryAccountId)===Number(accountFilter.value));}
  function applyFilters(){
    state.descriptionFilter=descriptionFilter.value;state.secondaryFilter=accountFilter.value;
    for(const id of selected)if(!saved.some(r=>r.id===id&&matches(r))){selected.delete(id);const check=checks.get(id);if(check)check.checked=false;}
    syncSelection();if(grid&&!destroyed)grid.setFilter(matches);
  }
  for(const [label,input] of [['Description / matching text',descriptionFilter],['Secondary account',accountFilter]]){const l=node('label',label);l.append(input);filters.append(l);}
  filters.append(button('Clear mapping filters',()=>{descriptionFilter.value='';accountFilter.value='';applyFilters();}));
  details.append(filters);
  descriptionFilter.oninput=applyFilters;accountFilter.onchange=applyFilters;
  // Selections outside restored filters must not participate in a later bulk edit.
  for(const id of selected)if(!saved.some(r=>r.id===id&&matches(r)))selected.delete(id);syncSelection();
  const fields=Object.entries(MAPPING_FIELD_LABELS),comparisons=[['contains','Contains'],['exact','Equals']],directions=[['out','Money out'],['in','Money in']];
  const bulkControls=[['secondaryAccountId','Secondary account',select('Bulk mapping secondary account',[['','Keep current'],...accounts.filter(([id])=>Number(id)!==Number(accountId))])],['field','Field',select('Bulk mapping field',[['','Keep current'],...fields])],['comparison','Comparison',select('Bulk mapping comparison',[['','Keep current'],...comparisons])],['direction','Direction',select('Bulk mapping direction',[['','Keep current'],...directions])]];
  const setSelection=checked=>{for(const rule of saved){if(checked&&matches(rule))selected.add(rule.id);else selected.delete(rule.id);const check=checks.get(rule.id);if(check)check.checked=selected.has(rule.id);}syncSelection();};
  bulk.append(button('Select all visible mappings',()=>setSelection(true)),button('Clear mapping selection',()=>setSelection(false)),count);
  for(const [,label,input] of bulkControls){const l=node('label',label);l.append(input);bulk.append(l);}
  bulk.append(button('Apply to selected mappings',async()=>{const changes={};for(const [key,,input] of bulkControls)if(input.value)changes[key]=input.value;const ids=saved.filter(r=>selected.has(r.id)&&matches(r)).map(r=>r.id);await updateStatementMappings(scenarioId,ids,changes);await onChanged({keepOpen:true});}));
  if(saved.length)details.append(bulk);
  const holder=node('div');holder.className='statement-mapping-grid';details.append(holder);
  let grid=null,building=null,destroyed=false;
  const safeText=cell=>node('span',cell.getValue()??'');
  const editor=(label,options)=> (cell,onRendered,success,cancel)=>{
    const input=options?select(`Edit mapping ${label}`,typeof options==='function'?options(cell):options):node('input');
    input.setAttribute('aria-label',`Edit mapping ${label}`);if(!options)input.maxLength=500;
    input.value=String(cell.getValue()??'');let done=false;
    const commit=()=>{if(!done){done=true;success(input.value);}};
    input.onchange=()=>{if(options)commit();};input.onblur=commit;
    input.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();done=true;cancel();}else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();commit();}};
    onRendered(()=>{input.focus();if(!options)input.select();});return input;
  };
  const column=(title,field,options)=>({title,field,minWidth:120,headerSort:true,editor:editor(title,options),formatter:options?cell=>{const values=typeof options==='function'?options(cell):options;return node('span',values.find(([id])=>String(id)===String(cell.getValue()))?.[1] || '(missing account)');}:safeText});
  async function ensureGrid(){
    if(building)return building;
    building=(async()=>{
      grid=await createGrid(holder,{data:saved.map(r=>({...r})),editTriggerEvent:'click',responsiveLayout:false,layout:'fitColumns',height:saved.length>8?'42vh':undefined,rowHeight:42,placeholder:saved.length?'No mappings match the current filters':'No saved mappings',columns:[
        {title:'Select',field:'selected',width:70,headerSort:false,formatter:cell=>{const r=cell.getData();const check=node('input');check.type='checkbox';check.checked=selected.has(r.id);check.setAttribute('aria-label',`Select mapping ${r.pattern}`);check.onclick=e=>e.stopPropagation();check.onchange=()=>{if(check.checked)selected.add(r.id);else selected.delete(r.id);syncSelection();};checks.set(r.id,check);return check;}},
        column('Primary account','accountId',accounts),column('Field','field',fields),column('Comparison','comparison',comparisons),{...column('Text','pattern'),widthGrow:2},column('Direction','direction',directions),column('Secondary account','secondaryAccountId',cell=>accounts.filter(([id])=>Number(id)!==Number(cell.getData().accountId))),
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
  const primary=select('Mapping primary account',accounts),field=select('Mapping field',fields),comparison=select('Mapping comparison',comparisons),direction=select('Mapping direction',directions),secondary=select('Mapping secondary account',[['','Choose secondary account'],...accounts]);
  const pattern=node('input');pattern.maxLength=500;pattern.setAttribute('aria-label','Mapping text');
  for(const [label,input] of [['Primary account',primary],['Field',field],['Comparison',comparison],['Text',pattern],['Direction',direction],['Secondary account',secondary]]){const l=node('label',label);l.append(input);form.append(l);}
  const save=button('Save mapping',async()=>{await saveStatementMapping(scenarioId,{accountId:primary.value,field:field.value,comparison:comparison.value,pattern:pattern.value,direction:direction.value,secondaryAccountId:secondary.value});await onChanged({keepOpen:true});});
  form.onsubmit=e=>{e.preventDefault();save.click();};form.append(save,button('Cancel mapping edit',()=>{form.hidden=true;}));
  function edit(rule={}){
    details.open=true;
    if(rule.id){ensureGrid().then(()=>{if(destroyed)return;if(!matches(rule)){descriptionFilter.value='';accountFilter.value='';applyFilters();}grid.scrollToRow(rule.id,'nearest',false).then(()=>grid.getRow(rule.id).getCell('pattern').edit());}).catch(onError);return;}
    primary.value=String(rule.accountId||accountId||scenario.accounts[0]?.id);field.value=rule.field||'originalDescription';comparison.value=rule.comparison||'contains';pattern.value=rule.pattern||'';direction.value=rule.direction||'out';secondary.value=String(rule.secondaryAccountId||'');form.hidden=false;pattern.focus();form.scrollIntoView({block:'nearest'});
  }
  details.append(form,button('New mapping',()=>edit()));
  return {element:details,edit,destroy(){destroyed=true;grid?.destroy();}};
}
