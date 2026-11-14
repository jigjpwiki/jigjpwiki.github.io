'use strict';
(() => {
  try {
    const model = JSON.parse(document.getElementById('anniversary-data').textContent);
    const core = window.Anniversaries;
    let today = core.jstToday(); let month = today.slice(0, 7);
    const filters = () => ({ type: document.getElementById('event-type').value, organization: document.getElementById('event-organization').value });
    const draw = () => {
      today = core.jstToday();
      document.getElementById('month-label').textContent = month;
      document.getElementById('calendar').innerHTML = core.calendar(model, month, today, filters());
      document.getElementById('upcoming').innerHTML = core.upcoming(model, today, filters());
      document.getElementById('upcoming-range').textContent = `${today}から${core.addDays(today,29)}まで（当日を含む30日間）`;
      document.getElementById('calendar-status').textContent = `${month}の記念日を表示中`;
    };
    for (const [id, n] of [['previous-month', -1], ['next-month', 1]]) document.getElementById(id).onclick = () => {
      const next = core.monthShift(month, n); if (Number(next.slice(0,4)) >= 1900 && Number(next.slice(0,4)) <= 2200) { month = next; draw(); }
    };
    document.getElementById('current-month').onclick = () => { month = core.jstToday().slice(0,7); draw(); };
    for (const id of ['event-type','event-organization']) document.getElementById(id).onchange = draw;
    document.getElementById('calendar-tools').hidden = false;
    draw();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) draw(); });
    setInterval(() => { if (core.jstToday() !== today) draw(); }, 60000);
  } catch { document.getElementById('calendar-status').textContent = '操作機能を読み込めませんでした。静的カレンダーと一覧をご利用ください。'; }
})();
