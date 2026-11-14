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
    return [...new Set([...event.talentIds, ...groupPeople])].map(id => {
      const talent = model.people.find(p => p.id === id);
      return talent ? `<a href="${model.detailsReady ? `/talents/${id}/` : `/talents/#${id}`}">${escape(talent.displayName)}</a>` : '';
    }).join('・');
  }
  function sourceLinks(event, model) {
    return event.sourceRefs.map(id => model.sources.find(s => s.id === id)).filter(Boolean).map(source => {
      let url; try { url = new URL(source.url); if (url.protocol !== 'https:' || url.username || url.password) return ''; } catch { return ''; }
      return `<a href="${escape(url.href)}" rel="noreferrer">${source.kind === 'official' ? '公式' : 'Wiki'}</a> <time datetime="${escape(source.checkedAt)}">${escape(jstToday(new Date(source.checkedAt)))}確認</time>`;
    }).join(' / ');
  }
  function eventHtml(item, model, compact = false) {
    const years = item.years > 0 ? ` <span>${item.years}周年</span>` : '';
    return `<li data-event-id="${escape(item.event.id)}"><span class="category">${types[item.event.type]}</span> <strong>${escape(item.event.title)}</strong>${years}<div>${subjectLinks(item.event, model)}</div>${compact ? '' : `<small>${sourceLinks(item.event, model)}</small>`}</li>`;
  }
  function calendar(model, month, today, filters = {}) {
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
        html += `<td${date === today ? ' class="calendar-today"' : ''}><time datetime="${date}"${date === today ? ' aria-current="date"' : ''}>${day}</time><ul>${items.filter(e => e.day === date).map(e => eventHtml(e, model, true)).join('')}</ul></td>`;
      }
      if (i % 7 === 6) html += '</tr>';
    }
    return html + '</tbody></table>' + (items.length ? '' : '<p class="empty-state">この月の確認済み記念日はありません。</p>');
  }
  function upcoming(model, today, filters = {}) {
    const items = between(filtered(model, filters), today, addDays(today, 30)); // today + 29 days, inclusive
    return items.length ? `<ul class="event-list">${items.map(item => `<li><time datetime="${item.day}">${item.day.replaceAll('-', '/')}</time><ul>${eventHtml(item, model)}</ul></li>`).join('')}</ul>` : '<p class="empty-state">直近30日間の確認済み記念日はありません。</p>';
  }
  return { types, escape, jstToday, addDays, monthShift, occurrence, between, filtered, calendar, upcoming, eventHtml, sourceLinks, subjectLinks };
});
