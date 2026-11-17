'use strict';
(() => {
 const update=()=>{
  for(const row of document.querySelectorAll('[data-event-times]')){
   const phase=window.EventDates.phase(JSON.parse(row.dataset.eventTimes)),section=document.querySelector(`[data-event-group="${phase==='ongoing'?'upcoming':phase}"] ul`);
   const label=row.querySelector('[data-event-phase]');if(label)label.textContent={past:'過去のイベント',upcoming:'開催予定',ongoing:'開催時間内',unknown:'日時・終了時刻未確認'}[phase];
   if(section)section.append(row);
  }
  document.dispatchEvent(new Event('catalog:refresh'));
 };
 update();setInterval(update,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
})();
