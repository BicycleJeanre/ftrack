import { saveStatementMapping, removeStatementMapping, updateStatementMappings } from '../../../app/services/statement-service.js';
import { statementMappingLabel } from '../../../shared/statement-mapping-utils.js';

export function buildStatementMappingEditor({scenario,scenarioId,accountId,onChanged,onError,state={}}) {
  const node=(tag,text='')=>{const e=document.createElement(tag);e.textContent=text;return e;};
  const button=(text,fn)=>{const e=node('button',text);e.type='button';e.className='icon-btn';e.onclick=()=>Promise.resolve().then(fn).catch(onError);return e;};
  const select=(label,options)=>{const e=node('select');e.setAttribute('aria-label',label);for(const [value,text] of options){const o=node('option',text);o.value=value;e.append(o);}return e;};
  const saved=(scenario.statementMappings || []).filter(r=>!accountId||Number(r.accountId)===Number(accountId));
  const details=node('details');details.className='statement-mappings';const summary=node('summary',`Mapping rules — ${saved.length} saved`);details.append(summary,node('p','Saved rules apply automatically to secondary accounts. Description matching ignores bank references, long numbers and dates. Saving refreshes review suggestions and clears approvals so you can review the new mapping. Actions remain separate.'));
  const selected=new Set((state.selectedIds || []).filter(id=>saved.some(r=>r.id===id))),lines=new Map(),checks=[];
  const bulk=node('div');bulk.className='statement-mapping-bulk';const count=node('span',`${selected.size} selected`);
  const syncSelection=()=>{state.selectedIds=[...selected];count.textContent=`${selected.size} selected`;};syncSelection();
  const secondaryOptions=[['','Keep current'],...scenario.accounts.filter(a=>Number(a.id)!==Number(accountId)).map(a=>[a.id,a.name])];
  const bulkSecondary=select('Bulk mapping secondary account',secondaryOptions);
  const bulkField=select('Bulk mapping field',[['','Keep current'],['originalDescription','Original description'],['description','Description'],['category','Category'],['parentCategory','Parent category']]);
  const bulkComparison=select('Bulk mapping comparison',[['','Keep current'],['contains','Contains'],['exact','Equals']]);
  const bulkDirection=select('Bulk mapping direction',[['','Keep current'],['out','Money out'],['in','Money in']]);
  const setSelection=checked=>{for(const [id,check] of checks){check.checked=checked;if(checked)selected.add(id);else selected.delete(id);}syncSelection();};
  bulk.append(button('Select all mappings',()=>setSelection(true)),button('Clear mapping selection',()=>setSelection(false)),count);
  for(const [label,input] of [['Secondary account',bulkSecondary],['Field',bulkField],['Comparison',bulkComparison],['Direction',bulkDirection]]){const l=node('label',label);l.append(input);bulk.append(l);}
  bulk.append(button('Apply to selected mappings',async()=>{const changes={};for(const [key,input] of [['secondaryAccountId',bulkSecondary],['field',bulkField],['comparison',bulkComparison],['direction',bulkDirection]])if(input.value)changes[key]=input.value;await updateStatementMappings(scenarioId,[...selected],changes);await onChanged({keepOpen:true});}));
  if(saved.length)details.append(bulk);
  const list=node('div');details.append(list);
  const editor=node('div');editor.className='statement-inline-mapping-editor';editor.hidden=true;
  const formTitle=node('h4','New mapping rule (not saved)');editor.append(formTitle);
  const form=node('form');form.className='statement-mapping-form';let editingId=null;
  const primary=select('Mapping primary account',scenario.accounts.map(a=>[a.id,a.name]));primary.value=String(accountId || scenario.accounts[0]?.id);
  const field=select('Mapping field',[['originalDescription','Original description'],['description','Description'],['category','Category'],['parentCategory','Parent category']]);
  const comparison=select('Mapping comparison',[['contains','Contains'],['exact','Equals']]);
  const pattern=node('input');pattern.maxLength=500;pattern.setAttribute('aria-label','Mapping text');
  const direction=select('Mapping direction',[['out','Money out'],['in','Money in']]);
  const secondary=select('Mapping secondary account',[['','Choose secondary account'],...scenario.accounts.map(a=>[a.id,a.name])]);
  for(const [label,input] of [['Primary account',primary],['Field',field],['Comparison',comparison],['Text',pattern],['Direction',direction],['Secondary account',secondary]]){const l=node('label',label);l.append(input);form.append(l);}
  const edit=(rule={})=>{editingId=rule.id || null;(lines.get(editingId)||details).append(editor);editor.hidden=false;formTitle.textContent=editingId?'Edit saved mapping rule':'New mapping rule (not saved)';primary.value=String(rule.accountId || accountId || scenario.accounts[0]?.id);field.value=rule.field || 'originalDescription';comparison.value=rule.comparison || 'contains';pattern.value=rule.pattern || '';direction.value=rule.direction || 'out';secondary.value=String(rule.secondaryAccountId || '');details.open=true;pattern.focus();editor.scrollIntoView({block:'nearest'});};
  const save=button('Save mapping',async()=>{await saveStatementMapping(scenarioId,{id:editingId,accountId:primary.value,field:field.value,comparison:comparison.value,pattern:pattern.value,direction:direction.value,secondaryAccountId:secondary.value});await onChanged({keepOpen:true});});
  form.onsubmit=e=>{e.preventDefault();save.click();};form.append(save,button('Cancel mapping edit',()=>{editor.hidden=true;}));
  for(const rule of saved) {
    const line=node('div');line.className='statement-mapping-rule';
    const check=node('input');check.type='checkbox';check.checked=selected.has(rule.id);check.setAttribute('aria-label',`Select mapping ${rule.pattern}`);check.onchange=()=>{if(check.checked)selected.add(rule.id);else selected.delete(rule.id);syncSelection();};checks.push([rule.id,check]);lines.set(rule.id,line);
    line.append(check,node('span',`${scenario.accounts.find(a=>Number(a.id)===Number(rule.accountId))?.name || 'Missing account'} · ${rule.direction==='out'?'Money out':'Money in'} · ${statementMappingLabel({rule,conflict:false},scenario.accounts)}`),button('Edit mapping',()=>edit(rule)),button('Remove mapping',async()=>{const keepOpen=details.open;await removeStatementMapping(scenarioId,rule.id);await onChanged({keepOpen});}));list.append(line);
  }
  editor.append(form);details.append(editor,button('New mapping',()=>edit()));
  return {element:details,edit};
}
