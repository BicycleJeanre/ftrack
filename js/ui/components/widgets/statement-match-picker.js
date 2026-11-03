import { createModal } from '../modals/modal-factory.js';
import { signedOccurrenceAmount } from '../../../shared/statement-utils.js';
import { counterpartyId } from '../../../shared/statement-mapping-utils.js';

export function openStatementMatchPicker({entry,occurrences,accountId,secondaryAccountId,accounts,existing=false,onChoose}) {
  const {modal,close}=createModal({contentClass:'statement-match-picker'});
  const node=(tag,text='')=>{const e=document.createElement(tag);e.textContent=text;return e;};
  modal.append(node('h2',existing?'Link an already recorded actual':'Match an existing planned payment'),node('p',`Bank entry: ${entry.description} · ${entry.postingDate} · ${(entry.amountCents/100).toFixed(2)}. These are existing FTrack transactions, not new actions. Choose one to link this bank entry.`));
  const search=node('input');search.placeholder='Search payment descriptions';search.setAttribute('aria-label','Search matching payments');const list=node('div');modal.append(search,list);
  function render(){
    list.replaceChildren();
    const candidates=occurrences.filter(o=>{
      if(o.status!==(existing?'actual':'planned') || o.lineItems?.length || o.transactionGroupId)return false;
      const signed=signedOccurrenceAmount(o,accountId),date=o.actualDate || o.plannedDate || o.scheduledDate;
      if(signed===null || Math.sign(signed)!==Math.sign(entry.amountCents))return false;
      if(secondaryAccountId && counterpartyId(o,accountId)!==Number(secondaryAccountId))return false;
      if(existing ? signed!==entry.amountCents || date!==entry.postingDate : Math.abs(Date.parse(date)-Date.parse(entry.postingDate))>7*86400000)return false;
      return String(o.description || '').toLowerCase().includes(search.value.toLowerCase());
    });
    if(!candidates.length)list.append(node('p','No compatible payments found for this account and date. Change the secondary account, or choose Create new actual.'));
    for(const o of candidates){const label=`${o.description || '(no description)'} · ${o.actualDate || o.plannedDate || o.scheduledDate} · ${(signedOccurrenceAmount(o,accountId)/100).toFixed(2)} · ${accounts.find(a=>Number(a.id)===counterpartyId(o,accountId))?.name || ''}`;const b=node('button',label);b.type='button';b.className='statement-match-choice icon-btn';b.onclick=()=>{onChoose(o);close();};list.append(b);}
  }
  search.oninput=render;render();const cancel=node('button','Cancel');cancel.type='button';cancel.className='icon-btn';cancel.onclick=close;modal.append(cancel);
}
