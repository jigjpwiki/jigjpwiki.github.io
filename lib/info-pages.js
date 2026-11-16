'use strict';
const { applyNavigation, escape } = require('./site-pages');
const core = require('../assets/js/anniversary-core');
function inlineJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
function frame(title, route, body, scripts = '', options = {}) {
  return applyNavigation(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}｜じぐじゅーる</title><link rel="canonical" href="https://www.jigdule.jp${route}"><link rel="stylesheet" href="/assets/talents.css"><link rel="stylesheet" href="/assets/navigation.css"><link rel="stylesheet" href="/assets/info.css"><link rel="stylesheet" href="/assets/browse.css">${options.styles||''}</head><body><header><a class="brand" href="/"><img src="/assets/logo.png" alt="じぐじゅーる" width="160" height="58"></a><!-- jigdule:navigation --></header><main${options.mainClass?` class="${escape(options.mainClass)}"`:""}>${options.hideHeading ? '' : `<h1>${escape(title)}</h1>`}${body}</main><footer><a href="/">配信スケジュール</a><a href="/talents/">タレント一覧</a><a href="/privacy-policy/">プライバシーポリシー</a><a href="/terms/">利用規約</a></footer>${scripts}</body></html>`, route);
}
function calendarModel(talents, data, detailsReady = false) {
  return { events: data.events, groups: data.groups, fallbackDate: data.fallbackDate, organizations: talents.organizations, people: talents.talents.map(t => ({ id: t.id, displayName: t.displayName, affiliations: t.affiliations })), detailsReady };
}
function referenceDay(model) {
  return model.fallbackDate || '2000-01-01';
}
function anniversaryPage(talents, data, detailsReady = false) {
  const model = calendarModel(talents, data, detailsReady);
  // Stable display setting, independent of the build clock and provenance.
  const reference = referenceDay(model); const today = reference || '2000-01-01'; const month = today.slice(0, 7);
  const json = inlineJson(model);
  return frame('記念日', '/anniversaries/', `<p>誕生日やデビュー記念日を掲載しています。生年・年齢を推測せず、デビューの起点を確認した場合だけ周年数を表示します。表示は日本時間です。</p>
<div class="calendar-tools" id="calendar-tools" hidden><button type="button" id="previous-month">前月</button><strong id="month-label">${month}</strong><button type="button" id="next-month">翌月</button><button type="button" id="current-month">今月</button><label>種類 <select id="event-type"><option value="">すべて</option>${Object.entries(core.types).map(([v,n]) => `<option value="${v}">${n}</option>`).join('')}</select></label><label>所属（旧所属を含む） <select id="event-organization"><option value="">すべて</option>${talents.organizations.map(o => `<option value="${o.id}">${escape(o.name)}</option>`).join('')}</select></label></div>
<p id="calendar-reference">${reference ? `静的表示の基準日：${reference}。現在の暦ではありません。` : '静的表示の基準日は未設定です。確認済みの記念日はまだ登録されていません。'}</p><noscript><p>JavaScript無効時は基準日の月と、基準日から30日間の一覧を表示します。現在の暦・月移動・絞り込みにはJavaScriptが必要です。</p></noscript><p id="calendar-status" role="status" aria-live="polite"></p><p class="calendar-hint">日付を選ぶと、その日の記念日を確認できます。</p><div class="calendar-layout"><div id="calendar" class="calendar-scroll" tabindex="0" role="region" aria-label="月間記念日カレンダー">${reference ? core.calendar(model, month, today) : '<p class="empty-state">確認済みの記念日はまだ登録されていません。</p>'}</div><section id="day-details" class="day-details" hidden aria-label="選択した日の記念日"></section></div><p class="calendar-legend"><span class="dot birthday"></span> 誕生日　<span class="dot debut"></span> デビュー　<span class="dot group"></span> グループ　<span class="dot other"></span> その他</p><h2 id="upcoming-heading">基準日から30日間</h2><p id="upcoming-range">${reference ? `${today}から${core.addDays(today,29)}まで（基準日を含む30日間）` : '基準日未設定'}</p><div id="upcoming">${core.upcoming(model,today)}</div><script type="application/json" id="anniversary-data">${json}</script>`, '<script src="/assets/js/anniversary-core.js?v=' + encodeURIComponent(require('../data/release.json').version) + '" defer></script><script src="/assets/js/anniversaries.js" defer></script>');
}
module.exports = { inlineJson, frame, calendarModel, referenceDay, anniversaryPage };
