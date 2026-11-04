import { createModal } from '../modals/modal-factory.js';
import { signedOccurrenceAmount } from '../../../shared/statement-utils.js';
import { counterpartyId } from '../../../shared/statement-mapping-utils.js';

export function openStatementMatchPicker({entry,occurrences,accountId,secondaryAccountId,accounts,existing=false,lineItems=false,recurring=false,onChoose}) {
  const {modal,close}=createModal({contentClass:'statement-match-picker'});
  const node=(tag,text='')=>{const e=document.createElement(tag);e.textContent=text;return e;};
  modal.append(node('h2',lineItems?'Add bank entry as a line item':existing?'Already recorded — link only':'Match an existing planned payment'),node('p',`Bank entry: ${entry.description} · ${entry.postingDate} · ${(entry.amountCents/100).toFixed(2)}. These are existing FTrack transactions. ${lineItems?'The bank amount will be added to the selected transaction total.':existing?'No amounts will change; this only records that the bank entry is already accounted for.':recurring?'Records the actual and sets future recurring planned values to this amount.':'Records the actual and closes the selected planned payment.'}`));
  const search=node('input');search.placeholder='Search payment descriptions';search.setAttribute('aria-label','Search matching payments');const list=node('div');modal.append(search,list);
  function render(){
    list.replaceChildren();
    const candidates=occurrences.filter(o=>{
      if((lineItems?!['planned','actual'].includes(o.status):o.status!==(existing?'actual':'planned')) || !lineItems&&o.lineItems?.length || o.transactionGroupId||o.baselineFrozen||recurring&&!o.sourceTransactionId)return false;
      const signed=signedOccurrenceAmount(o,accountId),date=o.actualDate || o.plannedDate || o.scheduledDate;
      if(signed===null || Math.sign(signed)!==Math.sign(entry.amountCents))return false;
      if(secondaryAccountId && counterpartyId(o,accountId)!==Number(secondaryAccountId))return false;
      if(existing ? signed!==entry.amountCents || date!==entry.postingDate : lineItems?date.slice(0,7)!==entry.postingDate.slice(0,7):Math.abs(Date.parse(date)-Date.parse(entry.postingDate))>7*86400000)return false;
      return String(o.description || '').toLowerCase().includes(search.value.toLowerCase());
    });
    if(!candidates.length)list.append(node('p','No compatible transactions for this account and date. Change the secondary account, or choose No planned payment — record standalone actual.'));
    for(const o of candidates){const label=`${o.description || '(no description)'} · ${o.actualDate || o.plannedDate || o.scheduledDate} · ${(signedOccurrenceAmount(o,accountId)/100).toFixed(2)} · ${accounts.find(a=>Number(a.id)===counterpartyId(o,accountId))?.name || ''}`;const b=node('button',label);b.type='button';b.className='statement-match-choice icon-btn';b.onclick=()=>{onChoose(o);close();};list.append(b);}
  }
  search.oninput=render;render();const cancel=node('button','Cancel');cancel.type='button';cancel.className='icon-btn';cancel.onclick=close;modal.append(cancel);
}
