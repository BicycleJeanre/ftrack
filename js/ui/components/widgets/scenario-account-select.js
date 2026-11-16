import { populateAccountSelect } from './account-selector-filter.js?v=20260901-account-group-filter-42';
import { openQuickAccountModal } from '../modals/quick-account-modal.js?v=workshop-accounts-1';
import * as AccountManager from '../../../app/managers/account-manager.js';

// Shared scenario-backed account controls: one picker/filter/quick-create flow
// for review rows, mapping forms, bulk edits and mapping-grid cell editors.
export function createScenarioAccountSelectors({getScenario,onCreated=()=>{},onError=()=>{},isCurrent=()=>true}) {
  const controls=new Map();
  const addValue='__add_account__';
  function populate(select,options,value=select.value){
    const scenario=getScenario();
    const accounts=(scenario.accounts||[]).filter(account=>Number(account.id)>0&&account.name!=='Select Account'&&
      (!options.requireGoal||Boolean(account.goalDate)));
    populateAccountSelect(select,{accounts,accountGroups:scenario.accountGroups||[],includeAll:false,
      emptyLabel:options.emptyLabel||'Choose account',selectedValue:value,getAccountLabel:options.getAccountLabel,
      selectedLabel:options.missingLabel&&value?options.missingLabel:undefined,
      ...(options.allowCreate!==false?{extraOptions:[{value:addValue,label:'＋ Add new account…'}],actionValues:[addValue]}:{})});
  }
  function create({label,selectedId='',emptyLabel,allowCreate=true,defaultTypeId=1,requireGoal=false,getAccountLabel,missingLabel}={}){
    const select=document.createElement('select');select.setAttribute('aria-label',label||'Account');
    const options={emptyLabel,allowCreate,requireGoal,getAccountLabel,missingLabel};controls.set(select,options);populate(select,options,String(selectedId??''));
    let previous=select.value;
    select.addEventListener('change',async event=>{
      if(select.value!==addValue){previous=select.value;return;}
      event.stopImmediatePropagation();populate(select,options,previous);
      try{
        const scenario=getScenario();
        const payload=await openQuickAccountModal({defaultTypeId,requireGoal});if(!payload||!isCurrent()||!select.isConnected)return;
        const data=await AccountManager.create(scenario.id,{...payload,openDate:scenario.timeframe?.startDate||scenario.projection?.config?.startDate||null},{notify:false});
        const updated=data.scenarios.find(s=>Number(s.id)===Number(scenario.id));
        // AccountManager appends the created account in the serialized write.
        const account=updated?.accounts.at(-1);
        if(!account)throw new Error('The new account could not be found.');
        scenario.accounts=updated.accounts;
        if(!isCurrent())return;
        for(const [control,config] of controls){
          if(control.isConnected)populate(control,config,control===select?String(account.id):control.value);
          else controls.delete(control);
        }
        previous=String(account.id);await onCreated(account,updated);
        if(!isCurrent()||!select.isConnected)return;
        select.dispatchEvent(new Event('change',{bubbles:true}));
      }catch(error){onError(error);}
    });
    return select;
  }
  return {create,destroy:()=>controls.clear()};
}
