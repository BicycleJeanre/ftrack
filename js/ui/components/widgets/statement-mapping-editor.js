import { saveStatementMapping, removeStatementMapping } from '../../../app/services/statement-service.js';
import { statementMappingLabel } from '../../../shared/statement-mapping-utils.js';

export function buildStatementMappingEditor({scenario,scenarioId,accountId,onChanged,onError}) {
  const node=(tag,text='')=>{const e=document.createElement(tag);e.textContent=text;return e;};
  const button=(text,fn)=>{const e=node('button',text);e.type='button';e.className='icon-btn';e.onclick=()=>Promise.resolve().then(fn).catch(onError);return e;};
  const select=(label,options)=>{const e=node('select');e.setAttribute('aria-label',label);for(const [value,text] of options){const o=node('option',text);o.value=value;e.append(o);}return e;};
  const saved=(scenario.statementMappings || []).filter(r=>!accountId||Number(r.accountId)===Number(accountId));
  const details=node('details');details.className='statement-mappings';const summary=node('summary',`Mapping rules — ${saved.length} saved`);details.append(summary,node('p','Saved rules apply automatically to secondary accounts. Description matching ignores bank references, long numbers and dates. Saving refreshes review suggestions and clears approvals so you can review the new mapping. Actions remain separate.'));
  const list=node('div');details.append(list);
  const formTitle=node('h4','New mapping rule (not saved)');details.append(formTitle);
  const form=node('form');form.className='statement-mapping-form';let editingId=null;
  const primary=select('Mapping primary account',scenario.accounts.map(a=>[a.id,a.name]));primary.value=String(accountId || scenario.accounts[0]?.id);
  const field=select('Mapping field',[['originalDescription','Original description'],['description','Description'],['category','Category'],['parentCategory','Parent category']]);
  const comparison=select('Mapping comparison',[['contains','Contains'],['exact','Equals']]);
  const pattern=node('input');pattern.maxLength=500;pattern.setAttribute('aria-label','Mapping text');
  const direction=select('Mapping direction',[['out','Money out'],['in','Money in']]);
  const secondary=select('Mapping secondary account',[['','Choose secondary account'],...scenario.accounts.map(a=>[a.id,a.name])]);
  for(const [label,input] of [['Primary account',primary],['Field',field],['Comparison',comparison],['Text',pattern],['Direction',direction],['Secondary account',secondary]]){const l=node('label',label);l.append(input);form.append(l);}
  const edit=(rule={})=>{editingId=rule.id || null;formTitle.textContent=editingId?'Edit saved mapping rule':'New mapping rule (not saved)';primary.value=String(rule.accountId || accountId || scenario.accounts[0]?.id);field.value=rule.field || 'originalDescription';comparison.value=rule.comparison || 'contains';pattern.value=rule.pattern || '';direction.value=rule.direction || 'out';secondary.value=String(rule.secondaryAccountId || '');details.open=true;pattern.focus();};
  const save=button('Save mapping',async()=>{await saveStatementMapping(scenarioId,{id:editingId,accountId:primary.value,field:field.value,comparison:comparison.value,pattern:pattern.value,direction:direction.value,secondaryAccountId:secondary.value});await onChanged();});
  form.onsubmit=e=>{e.preventDefault();save.click();};form.append(save,button('New mapping',()=>edit()));
  for(const rule of saved) {
    const line=node('div');line.className='statement-mapping-rule';
    line.append(node('span',`${scenario.accounts.find(a=>Number(a.id)===Number(rule.accountId))?.name || 'Missing account'} · ${rule.direction==='out'?'Money out':'Money in'} · ${statementMappingLabel({rule,conflict:false},scenario.accounts)}`),button('Edit mapping',()=>edit(rule)),button('Remove mapping',async()=>{const keepOpen=details.open;await removeStatementMapping(scenarioId,rule.id);await onChanged({keepOpen});}));list.append(line);
  }
  details.append(form);
  return {element:details,edit};
}
