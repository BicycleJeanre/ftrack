import { saveStatementMapping, removeStatementMapping } from '../../../app/services/statement-service.js';
import { statementMappingLabel } from '../../../shared/statement-mapping-utils.js';

export function buildStatementMappingEditor({scenario,scenarioId,accountId,onChanged,onError}) {
  const node=(tag,text='')=>{const e=document.createElement(tag);e.textContent=text;return e;};
  const button=(text,fn)=>{const e=node('button',text);e.type='button';e.className='icon-btn';e.onclick=()=>Promise.resolve().then(fn).catch(onError);return e;};
  const select=(label,options)=>{const e=node('select');e.setAttribute('aria-label',label);for(const [value,text] of options){const o=node('option',text);o.value=value;e.append(o);}return e;};
  const details=node('details');details.className='statement-mappings';details.append(node('summary',`Mapping rules (${(scenario.statementMappings || []).length})`),node('p','Rules map source descriptions or categories to secondary accounts only. Actions are reviewed separately. Review generated drafts before saving; saving a rule never approves a transaction.'));
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
  for(const rule of scenario.statementMappings || []) {
    const line=node('div');line.className='statement-mapping-rule';
    line.append(node('span',`${scenario.accounts.find(a=>Number(a.id)===Number(rule.accountId))?.name || 'Missing account'} · ${rule.direction==='out'?'Money out':'Money in'} · ${statementMappingLabel({rule,conflict:false},scenario.accounts)}`),button('Edit mapping',()=>edit(rule)),button('Remove mapping',async()=>{await removeStatementMapping(scenarioId,rule.id);await onChanged();}));list.append(line);
  }
  details.append(form);
  const proposals=node('div');details.append(proposals);
  return {element:details,edit,showDrafts(rules){proposals.replaceChildren(node('p',`${rules.length} draft mapping(s). Review and save each to activate it.`));for(const rule of rules){const line=node('div');line.append(node('span',statementMappingLabel({rule,conflict:false},scenario.accounts)),button(`Review draft: ${rule.pattern}`,()=>edit(rule)));proposals.append(line);}details.open=true;}};
}
