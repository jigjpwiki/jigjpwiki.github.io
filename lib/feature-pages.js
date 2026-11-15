'use strict';
const { frame, inlineJson } = require('./info-pages');
const { escape } = require('./site-pages');
const { periodBounds } = require('./feature-data');
const eventTypes={concert:'ライブ・コンサート',relay:'歌枠リレー',reveal_3d:'3Dお披露目',debut:'デビュー関連',anniversary_stream:'記念配信',special:'特別企画',other:'その他'};
function timeLabel(time) {
  if(time.precision==='unknown')return '日時未定・未確認';
  if(time.precision==='month')return escape(time.value.replace('-','年')+'月（日付未定）');
  if(time.precision==='date')return `<time datetime="${time.value}">${time.value.replaceAll('-','/')}（時刻未定）</time>`;
  return `<time datetime="${escape(time.value)}">${new Date(time.value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})} JST</time>`;
}
const dateKey=time=>time.precision==='instant'?new Date(Date.parse(time.value)+9*3600000).toISOString().slice(0,10):time.precision==='date'?time.value:null;
function personLinks(ids, master) { return ids.map(id=>master.talents.find(t=>t.id===id)).filter(Boolean).map(t=>`<a href="/talents/${t.id}/">${escape(t.displayName)}</a>`).join('・')||'出演者未登録・未確認'; }
function sourceDetails(refs,sources) {
  return `<details class="feature-sources"><summary>出典・確認日</summary><ul>${[...new Set(refs)].map(id=>sources.find(s=>s.id===id)).filter(Boolean).map(s=>`<li><a href="${escape(s.url)}" rel="noreferrer">${s.kind==='official'?'公式':'非公式Wiki'}：${escape(new URL(s.url).hostname)}</a> <time datetime="${escape(s.checkedAt)}">${new Date(s.checkedAt).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})}確認</time></li>`).join('')}</ul></details>`;
}
function videoLink(id, media, seconds = null) {
  const v=media.videos.find(v=>v.youtubeId===id);if(!v)return '';
  const label=v.availability==='unavailable'?'（現在の視聴不可を確認）':v.availability==='unknown'?'（可用性未確認）':'';
  const timed=Number.isInteger(seconds)&&seconds>=0&&v.availability==='public';
  return `<a href="https://www.youtube.com/watch?v=${id}${timed?'&amp;t='+seconds+'s':''}" rel="noreferrer">${escape(v.title)}${label}${timed?'（この曲から再生）':''}</a>`;
}
function featureFrame(title,route,body,scripts='') {
  return frame(title,route,body,scripts).replace('</head>','<link rel="stylesheet" href="/assets/catalog.css"></head>');
}
function filters(master,{types={},dates=true,setlist=false}={}) {
  return `<form id="catalog-filters" class="feature-filters" hidden role="search" aria-label="掲載情報を検索"><label>検索<input name="q" type="search" placeholder="名前・タイトル・キーワード"></label>${Object.keys(types).length?`<label>種類<select name="type"><option value="">すべて</option>${Object.entries(types).map(([v,n])=>`<option value="${v}">${escape(n)}</option>`).join('')}</select></label>`:''}<label>タレント<select name="talent"><option value="">すべて</option>${master.talents.map(t=>`<option value="${t.id}">${escape(t.displayName)}</option>`).join('')}</select></label><label>所属（旧所属を含む）<select name="organization"><option value="">すべて</option>${master.organizations.map(o=>`<option value="${o.id}">${escape(o.name)}</option>`).join('')}</select></label>${dates?'<label>日付：開始<input name="from" type="date"></label><label>日付：終了<input name="to" type="date"></label>':''}${setlist?'<label>セットリスト<select name="setlist"><option value="">すべて</option><option value="complete">確認済み</option><option value="partial">一部確認</option><option value="unreviewed">未確認</option></select></label>':''}<button type="reset">条件を解除</button></form><p id="catalog-status" role="status" aria-live="polite"></p><p id="catalog-empty" class="empty-state" hidden>条件に一致する登録情報はありません。未収集の情報もあります。</p><noscript><p>すべての登録情報を表示しています。検索・絞り込みにはJavaScriptが必要です。</p></noscript>`;
}
function rowData(row, master,extra={}) {
  const people=master.talents.filter(t=>(row.talentIds||[]).includes(t.id));
  return escape(JSON.stringify({search:[row.title,...people.flatMap(t=>[t.displayName,...t.aliases.map(a=>a.name)])].join(' '),talent:people.map(t=>t.id),organization:[...new Set([...(row.organizerIds||[]),...(row.relatedOrganizationIds||[]),...people.flatMap(t=>t.affiliations.map(a=>a.organizationId))])],type:row.type,date:row.starts?dateKey(row.starts):null,...extra}));
}
const filterScript='<script src="/assets/js/catalog-filter.js" defer></script>';
function eventCards(events,master) {
  return `<ul class="feature-grid">${events.map(e=>`<li class="feature-card" data-filter-row="${rowData(e,master)}"><span class="feature-label">${eventTypes[e.type]}</span><h2><a href="/events/${e.id}/">${escape(e.title)}</a></h2><p>${timeLabel(e.starts)}</p><p>${personLinks(e.talentIds,master)}</p>${!e.lineupComplete?'<p class="feature-note">出演者情報は一部のみ登録しています。</p>':''}</li>`).join('')}</ul>`;
}
function eventList(master,data) {
  const sorted=[...data.events].sort((a,b)=>(periodBounds(b.starts)?.start||0)-(periodBounds(a.starts)?.start||0)||a.id.localeCompare(b.id));
  return featureFrame('イベント','/events/',`<p>公式情報で確認したライブ・特別企画などを掲載しています。日時は日本時間です。登録がないことは、開催がないことを意味しません。</p>${filters(master,{types:eventTypes})}<p class="feature-note">日付で絞ると、日付未確定の情報は表示されません。最新の開催条件は公式告知をご確認ください。</p>${eventCards(sorted,master)}`,filterScript);
}
function eventPage(e,master,data) {
  const orgLinks=ids=>ids.map(id=>master.organizations.find(o=>o.id===id)?.name).filter(Boolean).map(escape).join('・')||'未確認';
  const body=`<nav class="breadcrumbs" aria-label="パンくずリスト"><a href="/events/">イベント一覧</a> / ${escape(e.title)}</nav><p class="feature-label">${eventTypes[e.type]}・${{scheduled:'予定',actual:'実施時刻を確認',unknown:'時刻情報の確認待ち'}[e.timing]}</p><p>${escape(e.summary)}</p><dl class="feature-facts"><dt>開始</dt><dd>${timeLabel(e.starts)}</dd><dt>終了</dt><dd>${timeLabel(e.ends)}</dd><dt>出演者${e.lineupComplete?'':'（登録済みの一部）'}</dt><dd>${personLinks(e.talentIds,master)}</dd><dt>主催組織</dt><dd>${orgLinks(e.organizerIds)}</dd><dt>関連組織</dt><dd>${orgLinks(e.relatedOrganizationIds)}</dd><dt>関連グループ</dt><dd>${e.groupIds.map(id=>data.groups?.find(g=>g.id===id)?.name).filter(Boolean).map(escape).join('・')||'未登録'}</dd><dt>開催形態</dt><dd>${{online:'オンライン',onsite:'現地',hybrid:'オンライン・現地',unknown:'未確認'}[e.format]}${e.venue?'・'+escape(e.venue):''}</dd><dt>参加費</dt><dd>${e.fee.amount===null?'未確認':`${e.fee.amount.toLocaleString('ja-JP')} ${escape(e.fee.currency)}`}${e.fee.note?' / '+escape(e.fee.note):''}</dd></dl><p><a class="feature-action" href="${escape(e.announcementUrl)}" rel="noreferrer">公式告知で確認する ↗</a></p><h2>配信・アーカイブ</h2>${e.videoIds.length||e.streamUrls.length?`<ul class="related-list">${e.videoIds.map(id=>`<li>${videoLink(id,data)}</li>`).join('')}${e.streamUrls.map(url=>`<li><a href="${escape(url)}" rel="noreferrer">公式配信先 ↗</a></li>`).join('')}</ul>`:'<p>配信先はまだ登録されていません。配信がないという意味ではありません。</p>'}<h2>出演枠</h2>${e.slots.length?`<ol class="related-list">${e.slots.map(s=>`<li id="${s.id}"><h3>${escape(s.title)}</h3><p>${timeLabel(s.starts)} ～ ${timeLabel(s.ends)}</p><p>${personLinks(s.talentIds,master)}</p>${s.videoIds.map(id=>videoLink(id,data)).join('<br>')}${s.streamUrls.map(url=>`<p><a href="${escape(url)}" rel="noreferrer">出演枠の配信先 ↗</a></p>`).join('')}${sourceDetails(s.sourceRefs,data.sources)}</li>`).join('')}</ol>`:'<p>個別の出演枠は未登録です。</p>'}${sourceDetails(e.sourceRefs,data.sources)}<p><a href="/events/">← イベント一覧へ</a></p>`;
  return featureFrame(e.title,`/events/${e.id}/`,body);
}
function talentEvents(id,master,data) {
  const events=data.events.filter(e=>e.talentIds.includes(id)||e.slots.some(s=>s.talentIds.includes(id)));
  return `<section class="profile-section"><h2>関連イベント</h2>${events.length?`<ul class="related-list">${events.map(e=>`<li><a href="/events/${e.id}/">${escape(e.title)}</a><p>${timeLabel(e.starts)}</p></li>`).join('')}</ul>`:'<p>確認済みの関連イベントはまだ登録されていません。</p>'}<p><a href="/events/?talent=${id}">イベント一覧で探す →</a></p></section>`;
}
module.exports={eventTypes,timeLabel,dateKey,personLinks,sourceDetails,videoLink,featureFrame,filters,rowData,filterScript,eventCards,eventList,eventPage,talentEvents};
