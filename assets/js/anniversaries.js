'use strict';
(() => {
 try {
  const model=JSON.parse(document.getElementById('anniversary-data').textContent),core=window.Anniversaries;
  let today=core.jstToday(),month=today.slice(0,7),selected=today;
  const type=document.getElementById('event-type'),org=document.getElementById('event-organization');
  const filters=()=>({type:type.value,organization:org.value});
  function restore(){
   const view=core.viewFromQuery(location.search,model,core.jstToday());month=view.month;selected=view.day;type.value=view.type;org.value=view.organization;
  }
  function save(){
   const u=new URL(location.href);for(const k of ['event','date','month','type','organization'])u.searchParams.delete(k);
   if(selected!==today)u.searchParams.set('date',selected);if(month!==today.slice(0,7))u.searchParams.set('month',month);
   if(type.value)u.searchParams.set('type',type.value);if(org.value)u.searchParams.set('organization',org.value);
   if(u.href!==location.href)history.pushState({},'',u);
  }
  function draw(push=false){
   const next=core.jstToday();if(next!==today){if(selected===today)selected=next;if(month===today.slice(0,7))month=next.slice(0,7);today=next;}
   if(selected.slice(0,7)!==month)selected=month+'-01';
   document.getElementById('month-label').textContent=month;
   document.getElementById('upcoming-heading').textContent='直近30日間';
   document.getElementById('calendar').innerHTML=core.calendar(model,month,today,filters(),selected,true);
   document.getElementById('day-details').innerHTML=core.dayDetails(model,selected,filters());document.getElementById('day-details').hidden=false;
   document.getElementById('upcoming').innerHTML=core.upcoming(model,today,filters());
   document.getElementById('upcoming-range').textContent=`${today}から${core.addDays(today,29)}まで（当日を含む30日間）`;
   document.getElementById('calendar-status').textContent=`${month}の記念日を表示中・選択日 ${selected}`;
   for(const img of document.querySelectorAll('.anniversary-person img')){img.classList.add('is-managed');const load=()=>{if(img.naturalWidth)img.classList.add('is-loaded');};img.onload=load;if(img.complete)load();}
   if(push)save();
  }
  for(const [id,n]of [['previous-month',-1],['next-month',1]])document.getElementById(id).onclick=()=>{const next=core.monthShift(month,n);if(Number(next.slice(0,4))>=1900&&Number(next.slice(0,4))<=2200){month=next;draw(true);}};
  document.getElementById('current-month').onclick=()=>{selected=core.jstToday();month=selected.slice(0,7);draw(true);};
  document.getElementById('calendar-reset').onclick=()=>{type.value='';org.value='';draw(true);};
  type.onchange=org.onchange=()=>draw(true);
  const focus=()=>document.querySelector(`[data-day="${selected}"]`)?.focus();
  document.getElementById('calendar').addEventListener('click',e=>{const b=e.target.closest('[data-day]');if(b){selected=b.dataset.day;draw(true);focus();}});
  document.getElementById('calendar').addEventListener('keydown',e=>{const b=e.target.closest('[data-day]'),delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];if(!b||!delta)return;const next=core.addDays(b.dataset.day,delta);if(Number(next.slice(0,4))<1900||Number(next.slice(0,4))>2200)return;e.preventDefault();selected=next;month=next.slice(0,7);draw(true);focus();});
  window.addEventListener('popstate',()=>{restore();draw();});restore();document.getElementById('calendar-tools').hidden=false;draw();document.getElementById('calendar-reference').hidden=true;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)draw();});setInterval(()=>{if(core.jstToday()!==today)draw();},60000);
 }catch{document.getElementById('calendar-status').textContent='操作機能を読み込めませんでした。静的カレンダーと一覧をご利用ください。';}
})();
