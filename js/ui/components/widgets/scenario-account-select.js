import { populateAccountSelect } from './account-selector-filter.js?v=20260901-account-group-filter-42';
import { openQuickAccountModal } from '../modals/quick-account-modal.js';
import * as AccountManager from '../../../app/managers/account-manager.js';

// Shared scenario-backed account controls: one picker/filter/quick-create flow
// for review rows, mapping forms, bulk edits and mapping-grid cell editors.
export function createScenarioAccountSelectors({getScenario,onCreated=()=>{},onError=()=>{}}) {
  const controls=new Map();
  const addValue='__add_account__';
  function populate(select,options,value=select.value){
    const scenario=getScenario();
    populateAccountSelect(select,{accounts:scenario.accounts,accountGroups:scenario.accountGroups||[],includeAll:false,
      emptyLabel:options.emptyLabel||'Choose account',selectedValue:value,
      ...(options.allowCreate!==false?{extraOptions:[{value:addValue,label:'＋ Add new account…'}],actionValues:[addValue]}:{})});
  }
  function create({label,selectedId='',emptyLabel,allowCreate=true,defaultTypeId=1}={}){
    const select=document.createElement('select');select.setAttribute('aria-label',label||'Account');
    const options={emptyLabel,allowCreate,defaultTypeId};controls.set(select,options);populate(select,options,String(selectedId));
    let previous=select.value;
    select.addEventListener('change',async event=>{
      if(select.value!==addValue){previous=select.value;return;}
      event.stopImmediatePropagation();populate(select,options,previous);
      try{
        const payload=await openQuickAccountModal({defaultTypeId});if(!payload)return;
        const scenario=getScenario();
        const data=await AccountManager.create(scenario.id,{...payload,openDate:scenario.timeframe?.startDate||scenario.projection?.config?.startDate||null},{notify:false});
        const updated=data.scenarios.find(s=>Number(s.id)===Number(scenario.id));
        const account=updated.accounts.find(a=>!scenario.accounts.some(old=>Number(old.id)===Number(a.id)));
        if(!account)throw new Error('The new account could not be found.');
        scenario.accounts=updated.accounts;
        for(const [control,config] of controls){if(control.isConnected||control===select)populate(control,config,control===select?String(account.id):control.value);}
        previous=String(account.id);await onCreated(account);
        select.dispatchEvent(new Event('change',{bubbles:true}));
      }catch(error){onError(error);}
    });
    return select;
  }
  return {create,destroy:()=>controls.clear()};
}
