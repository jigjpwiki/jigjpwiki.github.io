'use strict';
(() => {
 const dates=window.EventDates;
 const update=()=>{
  const rows=[...document.querySelectorAll('[data-event-times]')].map(row=>({row,event:JSON.parse(row.dataset.eventTimes)}));
  const groups={upcoming:[],past:[],unknown:[]};
  for(const item of rows){
   const phase=dates.phase(item.event),group=phase==='ongoing'?'upcoming':phase;
   item.row.dataset.phase=phase;
   const label=item.row.querySelector('[data-event-phase]');
   if(label)label.textContent=dates.labels[phase];
   groups[group].push(item);
  }
  for(const [group,items] of Object.entries(groups)){
   const section=document.querySelector('[data-event-group="'+group+'"]');
   if(!section)continue;
   const list=section.querySelector('ul');
   const ordered=items.sort((a,b)=>dates.compare(a.event,b.event,group)||a.row.dataset.eventId.localeCompare(b.row.dataset.eventId));
   if(list&&ordered.some((item,i)=>list.children[i]!==item.row))list.append(...ordered.map(item=>item.row));
   const count=section.querySelector('[data-event-count]');
   if(count)count.textContent=items.length+'件';
  }
  for(const detail of document.querySelectorAll('[data-event-detail-times]')){
   const phase=dates.phase(JSON.parse(detail.dataset.eventDetailTimes));
   detail.dataset.phase=phase;
   const label=detail.querySelector('[data-event-phase]');
   label.textContent=dates.labels[phase];label.hidden=false;
  }
  document.dispatchEvent(new Event('catalog:refresh'));
 };
 update();setInterval(update,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
})();
