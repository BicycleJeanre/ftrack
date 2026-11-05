import { createGrid } from '../grids/grid-factory.js';

// Shared FTrack grid; DOM controls retain their identity when sorting and grouping.
export async function buildStatementReviewGrid({table,heading,rows,onError,state={}}) {
  const controls=document.createElement('div');controls.className='statement-review-controls';
  const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.className='icon-btn';b.textContent=text;b.onclick=e=>{e.stopPropagation();fn();};return b;};
  const label=document.createElement('label');label.textContent='Group by ';
  const picker=document.createElement('select');picker.setAttribute('aria-label','Group statement rows by');
  for(const [key,name] of [['','None'],['description','Description'],['originalDescription','Original description'],['category','Bank category'],['parentCategory','Parent category'],['primary','Primary account'],['secondary','Secondary account'],['mapping','Saved mapping rule'],['action','Action'],['month','Month']]){const o=document.createElement('option');o.value=key;o.textContent=name;picker.append(o);}
  picker.value=state.group || '';label.append(picker);const summary=document.createElement('span');controls.append(label,summary);
  const target=row=>row.action?.value.includes(':')?row.action.value.slice(row.action.value.indexOf(':')+1):null;
  function approve(list,checked){
    const used=new Set(rows.filter(r=>r.check.checked&&!list.includes(r)&&!r.action?.value.startsWith('line:')).map(target).filter(Boolean));let skipped=0;
    for(const row of list){if(!checked){row.check.checked=false;row.draft.approved=false;continue;}if(row.check.disabled||!row.isReady?.()||target(row)&&used.has(target(row))){row.check.checked=false;row.draft.approved=false;skipped++;continue;}row.check.checked=true;row.draft.approved=true;if(target(row)&&!row.action.value.startsWith('line:'))used.add(target(row));}
    draw();if(skipped)onError(new Error(`${skipped} row(s) not approved: incomplete choices or the same planned item is already selected.`));
  }
  controls.append(button('Approve all eligible rows',()=>approve(rows,true)),button('Clear approvals',()=>approve(rows,false)));
  const fields=['approve','date','description','originalDescription','category','parentCategory','amount','primary','secondary','action'];
  const data=()=>rows.map(row=>({id:row.entry.index,row,approve:Number(row.check.checked),date:row.entry.postingDate,description:row.entry.description,originalDescription:row.entry.originalDescription,category:row.entry.category,parentCategory:row.entry.parentCategory,amount:row.entry.amountCents/100,action:row.status||row.action?.value.split(':')[0]||'line',primary:row.primary?.selectedOptions[0]?.textContent||'(unmapped)',secondary:row.secondary?.selectedOptions[0]?.textContent||'(unmapped)',mapping:row.reason,month:row.entry.postingDate.slice(0,7)}));
  const columns=[...heading.children].map((th,index)=>({title:th.textContent,field:fields[index],headerSort:true,sorter:index===0||index===6?'number':'string',minWidth:index===0?65:index===6?100:index===7?150:index===8?210:index===9?200:110,width:index===0?75:undefined,widthGrow:index===7||index===8?2:1,variableHeight:true,formatter:cell=>{
    const row=cell.getData().row;
    if(index===0)return row.check;
    if(index>=7){row.cells ||= {};if(row.cells[index])return row.cells[index];const node=document.createElement('div');node.className='statement-grid-cell';node.title=row.tr.children[index].title;node.append(...row.tr.children[index].childNodes);row.cells[index]=node;return node;}
    const node=document.createElement('span');node.textContent=cell.getValue()??'';
    if(index===6){node.className=cell.getValue()<0?'negative':'positive';node.textContent=new Intl.NumberFormat(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}).format(cell.getValue());}return node;
  }}));
  const element=document.createElement('div');element.className='statement-review-grid';table.replaceWith(element);
  const grid=await createGrid(element,{data:data(),columns,rowHeight:undefined,responsiveLayout:false,height:'48vh',layout:'fitColumns',groupBy:state.group||false,groupHeader:(value,count,groupData)=>{
    const node=document.createElement('div');node.className='statement-group-row';const title=document.createElement('strong');title.textContent=`${value || '(blank)'} — ${count} rows — ${groupData.reduce((s,r)=>s+r.amount,0).toFixed(2)}`;
    node.append(title,button('Approve group',()=>approve(groupData.map(r=>r.row),true)),button('Clear group',()=>approve(groupData.map(r=>r.row),false)));return node;
  }});
  let initialized=false;
  grid.on('tableBuilt',()=>{initialized=true;if(state.sort)grid.setSort(state.sort);});
  grid.on('dataSorted',sorters=>{state.sort=sorters.map(s=>({column:s.field,dir:s.dir}));});
  function draw(){summary.textContent=`${rows.filter(r=>r.check.checked&&!r.check.disabled).length} approved`;if(initialized){for(const record of data()){const row=grid.getRow(record.id);if(row)Object.assign(row.getData(),record);}if(state.group)grid.setGroupBy(state.group);}}
  picker.onchange=()=>{state.group=picker.value;grid.setGroupBy(picker.value||false);};
  for(const row of rows){row.check.addEventListener('change',()=>{row.draft.approved=row.check.checked;draw();});row.action?.addEventListener('change',draw);row.primary?.addEventListener('change',draw);row.secondary?.addEventListener('change',draw);}
  draw();return {controls,draw,destroy:()=>grid.destroy()};
}
