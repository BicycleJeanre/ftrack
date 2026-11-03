// Sorting/grouping move DOM rows only; source indices and drafts retain their identity.
export function buildStatementReviewGrid({table,heading,rows,onError,state={}}) {
  let sort=state.sort || 'index',descending=Boolean(state.descending),group=state.group || '';
  const body=document.createElement('tbody');table.append(body);
  const controls=document.createElement('div');controls.className='statement-review-controls';
  const btn=(text,fn)=>{const b=document.createElement('button');b.type='button';b.className='icon-btn';b.textContent=text;b.onclick=fn;return b;};
  const label=document.createElement('label');label.textContent='Group by ';
  const picker=document.createElement('select');picker.setAttribute('aria-label','Group statement rows by');
  for(const [key,name] of [['','None'],['description','Description'],['originalDescription','Original description'],['category','Bank category'],['parentCategory','Parent category'],['secondary','Secondary account'],['mapping','Saved mapping rule'],['action','Action'],['month','Month']]){const o=document.createElement('option');o.value=key;o.textContent=name;picker.append(o);}
  picker.value=group;label.append(picker);controls.append(label);const summary=document.createElement('span');controls.append(summary);
  const value=(row,key)=>({index:row.entry.index,approve:Number(row.check.checked),date:row.entry.postingDate,description:row.entry.description,originalDescription:row.entry.originalDescription,category:row.entry.category,parentCategory:row.entry.parentCategory,amount:row.entry.amountCents,action:row.status || row.action?.value.split(':')[0] || '(unassigned)',secondary:row.secondary?.value?row.secondary.selectedOptions[0]?.textContent:'(unmapped)',mapping:row.reason || 'No saved mapping',month:row.entry.postingDate.slice(0,7)})[key];
  const target=row=>row.action?.value.includes(':')?row.action.value.slice(row.action.value.indexOf(':')+1):null;
  const ready=row=>!row.check.disabled && Boolean(row.isReady?.());
  const approve=(list,checked)=>{
    const used=new Set(rows.filter(r=>r.check.checked && !list.includes(r)).map(target).filter(Boolean));let skipped=0;
    for(const row of list){if(!checked){row.check.checked=false;row.draft.approved=false;continue;}if(!ready(row) || target(row)&&used.has(target(row))){row.check.checked=false;row.draft.approved=false;skipped++;continue;}row.check.checked=true;row.draft.approved=true;if(target(row))used.add(target(row));}
    draw();if(skipped)onError(new Error(`${skipped} row(s) not approved: incomplete choices or the same planned item is already selected.`));
  };
  controls.append(btn('Approve all eligible rows',()=>approve(rows,true)),btn('Clear approvals',()=>approve(rows,false)));
  const columns=['approve','date','description','originalDescription','category','parentCategory','amount','action','secondary','mapping'];
  [...heading.children].forEach((th,index)=>{const key=columns[index];const name=th.textContent;th.textContent='';th.append(btn(name,()=>{descending=sort===key?!descending:false;sort=key;draw();}));});
  function draw(){
    Object.assign(state,{sort,descending,group});
    body.replaceChildren();summary.textContent=`${rows.filter(r=>r.check.checked&&!r.check.disabled).length} approved`;
    [...heading.children].forEach((th,i)=>th.setAttribute('aria-sort',sort===columns[i]?descending?'descending':'ascending':'none'));
    const sorted=[...rows].sort((a,b)=>{const x=value(a,sort),y=value(b,sort);return (typeof x==='number'?x-y:String(x).localeCompare(String(y),undefined,{numeric:true}))*(descending?-1:1) || a.entry.index-b.entry.index;});
    const groups=new Map();for(const row of sorted){const key=group?String(value(row,group)):'';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
    for(const [name,list] of groups){if(group){const tr=document.createElement('tr');tr.className='statement-group-row';const td=document.createElement('td');td.colSpan=columns.length;const title=document.createElement('strong');title.textContent=`${name || '(blank)'} — ${list.length} rows — ${(list.reduce((s,r)=>s+r.entry.amountCents,0)/100).toFixed(2)}`;td.append(title,btn('Approve group',()=>approve(list,true)),btn('Clear group',()=>approve(list,false)));tr.append(td);body.append(tr);}for(const row of list)body.append(row.tr);}
  }
  picker.onchange=()=>{group=picker.value;draw();};
  for(const row of rows){row.check.addEventListener('change',()=>{row.draft.approved=row.check.checked;draw();});row.action?.addEventListener('change',draw);row.secondary?.addEventListener('change',draw);}
  draw();return {controls,draw};
}
