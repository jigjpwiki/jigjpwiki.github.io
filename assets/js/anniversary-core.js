(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Anniversaries = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const types = { birthday: '誕生日', debut: 'デビュー記念日', group: 'グループ記念日', other: 'その他' };
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const iso = date => date.toISOString().slice(0, 10);
  const jstToday = (now = new Date()) => iso(new Date(now.getTime() + 9 * 3600000));
  const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  function monthShift(month, n) { const [y, m] = month.split('-').map(Number); return iso(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7); }
  function occurrence(event, year) {
    if ((!event.recursYearly && year !== event.date.year) || (event.date.year !== null && year < event.date.year)) return null;
    const d = new Date(Date.UTC(year, event.date.month - 1, event.date.day));
    if (d.getUTCMonth() !== event.date.month - 1 || d.getUTCDate() !== event.date.day) return null; // Feb 29 is not moved to another date.
    return { event, day: iso(d), years: event.countYears && event.date.year !== null ? year - event.date.year : null };
  }
  function between(events, start, end) {
    const result = [];
    for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) for (const event of events) {
      const item = occurrence(event, y); if (item && item.day >= start && item.day < end) result.push(item);
    }
    return result.sort((a, b) => a.day.localeCompare(b.day) || a.event.id.localeCompare(b.event.id));
  }
  function filtered(model, filters = {}) {
    return model.events.filter(event => {
      if (filters.type && event.type !== filters.type) return false;
      if (!filters.organization) return true;
      const groups = model.groups.filter(g => event.groupIds.includes(g.id));
      const ids = new Set([...event.talentIds, ...groups.flatMap(g => g.talentIds)]);
      return groups.some(g => g.organizationId === filters.organization) || model.people.some(t => ids.has(t.id) && t.affiliations.some(a => a.organizationId === filters.organization));
    });
  }
  function subjectLinks(event, model) {
    const groupPeople = model.groups.filter(g => event.groupIds.includes(g.id)).flatMap(g => g.talentIds);
    return model.groups.filter(g=>event.groupIds.includes(g.id)).map(g=>`<a class="anniversary-group" href="/talents/?group=${encodeURIComponent(g.id)}">${escape(g.name)}</a>`).join('・') + model.people.filter(t=>event.talentIds.includes(t.id)||groupPeople.includes(t.id)).map(({id}) => {
      const talent = model.people.find(p => p.id === id);
      const image=talent?.image;let safe=false;try{const u=new URL(image,'https://www.jigdule.jp');safe=Boolean(image)&&u.protocol==='https:'&&!u.username&&!u.password&&!/[<>"']/.test(image);}catch{}
      if(talent?.profileHidden)return `<span class="anniversary-person">${escape(talent.displayName)}</span>`;
      return talent ? `<a class="anniversary-person" href="${model.detailsReady ? `/talents/${id}/` : `/talents/#${id}`}">${safe?`<span class="anniversary-avatar" aria-hidden="true"><span>${escape(talent.displayName.slice(0,1))}</span><img src="${escape(image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`:''}${escape(talent.displayName)}</a>` : '';
    }).join('・');
  }
  function simpleEventPerson(event, model) {
    const person = event.talentIds.length === 1 && !event.groupIds.length ? model.people.find(p => p.id === event.talentIds[0]) : null;
    return person && event.title === `${person.displayName} ${types[event.type]}` ? person : null;
  }
  function eventHtml(item, model, compact = false) {
    const years = item.years > 0 ? ` <span class="anniversary-years">${item.years}周年</span>` : '';
    const event = item.event;
    const simple = simpleEventPerson(event, model);
    return `<li data-event-id="${escape(item.event.id)}"${simple ? ' class="anniversary-simple-event"' : ""}><div class="anniversary-event-meta"><span class="category" data-kind="${item.event.type}">${types[item.event.type]}</span>${years}</div><strong>${escape(item.event.title)}</strong><div class="anniversary-subjects">${subjectLinks(item.event, model)}</div></li>`;
  }
  function calendar(model, month, today, filters = {}, selected = today, interactive = false) {
    const events = filtered(model, filters); const first = month + '-01'; const next = monthShift(month, 1) + '-01';
    const items = between(events, first, next); const [year, m] = month.split('-').map(Number);
    const weekday = new Date(first + 'T00:00:00Z').getUTCDay(); const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
    let html = `<table class="anniversary-calendar"><caption>${year}年${m}月（日本時間）</caption><thead><tr>${['日', '月', '火', '水', '木', '金', '土'].map(x => `<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>`;
    for (let i = 0; i < Math.ceil((weekday + days) / 7) * 7; i++) {
      if (i % 7 === 0) html += '<tr>';
      const day = i - weekday + 1;
      if (day < 1 || day > days) html += '<td class="outside"></td>';
      else {
        const date = `${month}-${String(day).padStart(2, '0')}`;
        const onDay = items.filter(e => e.day === date);
        const previewEvent = onDay[0]?.event;
        const preview = previewEvent ? `<span class="day-preview" aria-hidden="true" title="${escape(previewEvent.title)}"><span class="dot ${previewEvent.type}"></span><span class="day-preview-title">${escape(simpleEventPerson(previewEvent, model)?.displayName || previewEvent.title)}</span></span>` : '';
        const content = `<time datetime="${date}"${date === today ? ' aria-current="date"' : ''}>${day}</time><span class="day-markers" aria-hidden="true">${[...new Set(onDay.map(i=>i.event.type))].map(type=>`<span class="dot ${type}"></span>`).join('')}</span>${preview}<span class="day-count" data-count="${onDay.length}">${onDay.length?`${onDay.length}件`:''}</span>`;
        const label = `${year}年${m}月${day}日${date===today?' 今日':''}、記念日${onDay.length}件`;
        html += `<td${date === today ? ' class="calendar-today"' : ''}>${interactive ? `<button type="button" class="day-button" data-day="${date}" aria-label="${label}" aria-pressed="${date===selected}">${content}</button>` : onDay.length ? `<a class="day-static" href="#ann-day-${date}" aria-label="${label}">${content}</a>` : `<span class="day-static">${content}</span>`}</td>`;
      }
      if (i % 7 === 6) html += '</tr>';
    }
    return html + '</tbody></table>' + (!interactive && items.length ? `<div class="month-fallback">${[...new Set(items.map(i=>i.day))].map(day=>`<section id="ann-day-${day}">${dayDetails(model,day,filters)}</section>`).join('')}</div>` : '') + (items.length ? '' : '<p class="empty-state">この月の記念日はありません。</p>');
  }
  function dayDetails(model, day, filters = {}) {
    const items = between(filtered(model,filters),day,addDays(day,1));
    return `<h2><time datetime="${day}">${day.replaceAll('-','/')}</time> の記念日</h2>${items.length ? `<ul>${items.map(item=>eventHtml(item,model,true)).join('')}</ul>` : '<p>この日の記念日はありません。</p>'}`;
  }
  function horizon(model,today,filters={},excludeToday=false){
    return between(filtered(model,filters),excludeToday?addDays(today,1):today,addDays(today,30));
  }
  function todayEvents(model,today,filters={}){
    const items=between(filtered(model,filters),today,addDays(today,1));
    return items.length?'<ul class="anniversary-today-list">'+items.map(i=>eventHtml(i,model)).join('')+'</ul>':'<p class="anniversary-no-today">この日の記念日はありません。</p>';
  }
  function upcoming(model,today,filters={},interactive=false,excludeToday=false){
    const items=horizon(model,today,filters,excludeToday);
    if(!items.length)return '<p class="empty-state">'+(excludeToday?'明日から29日間':'直近30日間')+'の記念日はありません。</p>';
    const groups=new Map();
    for(const item of items){if(!groups.has(item.day))groups.set(item.day,[]);groups.get(item.day).push(item);}
    return '<ul class="event-list anniversary-agenda">'+[...groups].map(([day,rows])=>{
      const days=Math.round((Date.parse(day+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
      const date=day.slice(5).replace('-','/'),weekday=['日','月','火','水','木','金','土'][new Date(day+'T00:00:00Z').getUTCDay()];
      const label='<time datetime="'+day+'">'+date+' <span class="agenda-weekday">('+weekday+')</span></time><span class="agenda-relative">'+(days===0?'当日':'あと'+days+'日')+'</span>';
      return '<li class="agenda-day"><div class="agenda-date">'+(interactive?'<button type="button" data-anniversary-day="'+day+'" aria-label="'+day+'のカレンダーを表示">'+label+'</button>':label)+'</div><ul class="agenda-items">'+rows.map(item=>eventHtml(item,model)).join('')+'</ul></li>';
    }).join('')+'</ul>';
  }
  function viewFromQuery(query,model,today=jstToday()) {
    const p=new URLSearchParams(query),validDay=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number(s.slice(0,4))>=1900&&Number(s.slice(0,4))<=2200&&!Number.isNaN(Date.parse(s))&&iso(new Date(s+'T00:00:00Z'))===s;
    let day=validDay(p.get('date'))?p.get('date'):today;
    const linked=model.events.find(e=>e.id===p.get('event'));
    if(linked&&!p.has('date')&&!p.has('month'))for(let y=Math.max(Number(today.slice(0,4)),linked.date.year||0);y<=2200;y++){const item=occurrence(linked,y);if(item){day=item.day;break;}}
    let month=day.slice(0,7);if(validDay(p.get('month')+'-01'))month=p.get('month');if(day.slice(0,7)!==month)day=month+'-01';
    return {day,month,type:Object.hasOwn(types,p.get('type'))?p.get('type'):'',organization:(model.organizations||[]).some(o=>o.id===p.get('organization'))?p.get('organization'):''};
  }
  return { viewFromQuery, types, escape, jstToday, addDays, monthShift, occurrence, between, filtered, calendar, upcoming, horizon, todayEvents, eventHtml, subjectLinks, dayDetails };
});
