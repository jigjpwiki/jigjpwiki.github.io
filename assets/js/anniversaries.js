'use strict';
(() => {
  try {
    const model = JSON.parse(document.getElementById('anniversary-data').textContent);
    const core = window.Anniversaries;
    let today = core.jstToday(); let month = today.slice(0, 7); let selected = today;
    const linked = model.events.find(e=>e.id===new URLSearchParams(location.search).get('event'));
    if(linked) {
      for(let year=Math.max(Number(today.slice(0,4)),linked.date.year||0);year<=2200;year++) {
        const item=core.occurrence(linked,year); if(item) { selected=item.day; month=selected.slice(0,7); break; }
      }
    }
    const filters = () => ({ type: document.getElementById('event-type').value, organization: document.getElementById('event-organization').value });
    const draw = () => {
      const nextToday = core.jstToday();
      if (nextToday !== today && month === today.slice(0, 7)) month = nextToday.slice(0, 7);
      today = nextToday;
      document.getElementById('month-label').textContent = month;
      document.getElementById('upcoming-heading').textContent = '直近30日間';
      if(selected.slice(0,7)!==month) selected=month+'-01';
      document.getElementById('calendar').innerHTML = core.calendar(model, month, today, filters(), selected, true);
      document.getElementById('day-details').innerHTML=core.dayDetails(model,selected,filters());
      document.getElementById('day-details').hidden=false;
      document.getElementById('upcoming').innerHTML = core.upcoming(model, today, filters());
      document.getElementById('upcoming-range').textContent = `${today}から${core.addDays(today,29)}まで（当日を含む30日間）`;
      document.getElementById('calendar-status').textContent = `${month}の記念日を表示中・選択日 ${selected}`;
    };
    for (const [id, n] of [['previous-month', -1], ['next-month', 1]]) document.getElementById(id).onclick = () => {
      const next = core.monthShift(month, n); if (Number(next.slice(0,4)) >= 1900 && Number(next.slice(0,4)) <= 2200) { month = next; draw(); }
    };
    document.getElementById('current-month').onclick = () => { selected=core.jstToday(); month = selected.slice(0,7); draw(); };
    for (const id of ['event-type','event-organization']) document.getElementById(id).onchange = draw;
    document.getElementById('calendar').addEventListener('click',event=> { const button=event.target.closest('[data-day]'); if(!button)return; selected=button.dataset.day; draw(); document.querySelector(`[data-day="${selected}"]`).focus(); });
    document.getElementById('calendar').addEventListener('keydown',event=> { const button=event.target.closest('[data-day]'); const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key]; if(!button||!delta)return; const next=core.addDays(button.dataset.day,delta); if(Number(next.slice(0,4))<1900||Number(next.slice(0,4))>2200)return; event.preventDefault(); selected=next; month=next.slice(0,7); draw(); document.querySelector(`[data-day="${selected}"]`).focus(); });
    document.getElementById('calendar-tools').hidden = false;
    draw();
    document.getElementById('calendar-reference').hidden = true;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) draw(); });
    setInterval(() => { if (core.jstToday() !== today) draw(); }, 60000);
  } catch { document.getElementById('calendar-status').textContent = '操作機能を読み込めませんでした。静的カレンダーと一覧をご利用ください。'; }
})();
