'use strict';
const { applyNavigation, escape } = require('./site-pages');
const core = require('../assets/js/anniversary-core');
function frame(title, route, body, scripts = '') {
  return applyNavigation(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}｜じぐじゅーる</title><link rel="canonical" href="https://www.jigdule.jp${route}"><link rel="stylesheet" href="/assets/talents.css"><link rel="stylesheet" href="/assets/navigation.css"><link rel="stylesheet" href="/assets/info.css"></head><body><header><a class="brand" href="/"><img src="/assets/logo.png" alt="じぐじゅーる" width="160" height="58"></a><!-- jigdule:navigation --></header><main><h1>${escape(title)}</h1>${body}</main><footer><a href="/">配信スケジュール</a><a href="/talents/">タレント一覧</a><a href="/privacy-policy/">プライバシーポリシー</a><a href="/terms/">利用規約</a></footer>${scripts}</body></html>`, route);
}
function calendarModel(talents, data, detailsReady = false) {
  return { events: data.events, groups: data.groups, sources: data.sources, organizations: talents.organizations, people: talents.talents.map(t => ({ id: t.id, displayName: t.displayName, affiliations: t.affiliations })), detailsReady };
}
function anniversaryPage(talents, data, detailsReady = false, now = new Date()) {
  const model = calendarModel(talents, data, detailsReady); const today = core.jstToday(now); const month = today.slice(0, 7);
  const json = JSON.stringify(model).replace(/</g, '\\u003c');
  return frame('記念日', '/anniversaries/', `<p>公式情報とWikiで確認した記念日を掲載しています。生年・年齢を推測せず、デビューの起点を確認した場合だけ周年数を表示します。表示は日本時間です。</p>
<div class="calendar-tools" id="calendar-tools" hidden><button type="button" id="previous-month">前月</button><strong id="month-label">${month}</strong><button type="button" id="next-month">翌月</button><button type="button" id="current-month">今月</button><label>種類 <select id="event-type"><option value="">すべて</option>${Object.entries(core.types).map(([v,n]) => `<option value="${v}">${n}</option>`).join('')}</select></label><label>所属（旧所属を含む） <select id="event-organization"><option value="">すべて</option>${talents.organizations.map(o => `<option value="${o.id}">${escape(o.name)}</option>`).join('')}</select></label></div>
<noscript><p>JavaScript無効時はビルド時点の月と30日一覧を表示します。月の移動・絞り込みにはJavaScriptが必要です。</p></noscript><p id="calendar-status" role="status" aria-live="polite"></p><p class="calendar-hint">小さい画面ではカレンダーを横にスクロールできます。</p><div id="calendar" class="calendar-scroll" tabindex="0" role="region" aria-label="月間記念日カレンダー">${core.calendar(model, month, today)}</div><h2>直近30日間</h2><p id="upcoming-range">${today}から${core.addDays(today,29)}まで（当日を含む30日間）</p><div id="upcoming">${core.upcoming(model,today)}</div><script type="application/json" id="anniversary-data">${json}</script>`, '<script src="/assets/js/anniversary-core.js" defer></script><script src="/assets/js/anniversaries.js" defer></script>');
}
module.exports = { frame, calendarModel, anniversaryPage };
