'use strict';
const { frame, inlineJson } = require('./info-pages');
const {escape,externalLinkAttrs}=require('./site-pages');
const eventTypes={concert:'ライブ・コンサート',relay:'歌枠リレー',reveal_3d:'3Dお披露目',debut:'デビュー関連',anniversary_stream:'記念配信',special:'特別企画',other:'その他'};
function timeLabel(time) {
  if(time.precision==='unknown')return '日時不明';
  if(time.precision==='month')return escape(time.value.replace('-','年')+'月（日付未定）');
  if(time.precision==='date')return `<time datetime="${time.value}">${time.value.replaceAll('-','/')}（時刻未定）</time>`;
  return `<time datetime="${escape(time.value)}">${new Date(time.value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})} JST</time>`;
}
const dateKey=time=>time.precision==='instant'?new Date(Date.parse(time.value)+9*3600000).toISOString().slice(0,10):time.precision==='date'?time.value:null;
function personLinks(ids, master) { return require('../assets/js/member-order').sortIds(ids,master.talents).map(id=>master.talents.find(t=>t.id===id)).filter(Boolean).map(t=>t.profileHidden?`<span>${escape(t.displayName)}</span>`:`<a href="/talents/${t.id}/">${escape(t.displayName)}</a>`).join('・')||''; }

function videoLink(id, media, seconds = null, labelText = null) {
  const v=media.videos.find(v=>v.youtubeId===id);if(!v)return '';
  const label=v.availability==='unavailable'?'（現在の視聴不可を確認）':v.availability==='unknown'?'（可用性未確認）':'';
  const timed=Number.isInteger(seconds)&&seconds>=0&&v.availability==='public';
  const related=media.karaokes?.find(k=>k.youtubeId===id);
  return `<a href="https://www.youtube.com/watch?v=${id}${timed?'&amp;t='+seconds+'s':''}" target="_blank" rel="noopener noreferrer">${escape(labelText||v.title)}${label}${timed?'（この曲から再生）':''}</a>${related?` <a href="/music/karaoke/${related.id}/">歌枠・セットリスト →</a>`:''}`;
}
function featureFrame(title,route,body,scripts='',options={}) {
  return frame(title,route,body,scripts,options).replace('</head>','<link rel="stylesheet" href="/assets/catalog.css?v='+require("../data/release.json").version+'"></head>');
}
function talentOptions(master){
 const {membership}=require('../assets/js/member-order');
 const orgs=master.organizations||[],groups=new Map();
 for(const t of master.talents){const g=membership(t,orgs,null).group;const label=orgs.find(o=>o.id===g)?.name||({former:'旧所属',unaffiliated:'無所属',ended:'活動終了・引退',unknown:'所属不明'})[g];if(!groups.has(g))groups.set(g,{label,rows:[]});groups.get(g).rows.push(t);}
 return [...groups.values()].map(g=>`<optgroup label="${escape(g.label)}">${g.rows.map(t=>`<option value="${t.id}">${escape(t.displayName)}</option>`).join('')}</optgroup>`).join('');
}
function filters(master,{types={},dates=true,setlist=false}={}) {
  return `<form id="catalog-filters" class="feature-filters" hidden role="search" aria-label="掲載情報を検索"><label>検索<input name="q" type="search" placeholder="名前・タイトル・キーワード"></label>${Object.keys(types).length?`<label>種類<select name="type"><option value="">すべて</option>${Object.entries(types).map(([v,n])=>`<option value="${v}">${escape(n)}</option>`).join('')}</select></label>`:''}<label>タレント<select name="talent"><option value="">すべて</option>${talentOptions(master)}</select></label><label>所属（旧所属を含む）<select name="organization"><option value="">すべて</option>${master.organizations.map(o=>`<option value="${o.id}">${escape(o.name)}</option>`).join('')}</select></label>${dates?'<label>日付：開始<input name="from" type="date"></label><label>日付：終了<input name="to" type="date"></label>':''}${setlist?'<label>セットリスト<select name="setlist"><option value="">すべて</option><option value="complete">確認済み</option><option value="partial">一部確認</option><option value="unreviewed">未確認</option></select></label>':''}<button type="reset">条件を解除</button></form><p id="catalog-status" role="status" aria-live="polite"></p><p id="catalog-empty" class="empty-state" hidden>条件に一致する情報はありません。</p><noscript><p>すべての登録情報を表示しています。検索・絞り込みにはJavaScriptが必要です。</p></noscript>`;
}
function rowData(row, master,extra={}) {
  const people=master.talents.filter(t=>(row.talentIds||[]).includes(t.id));
  return escape(JSON.stringify({search:[row.title,...people.flatMap(t=>[t.displayName,...(t.aliases||[]).map(a=>a.name)])].join(' '),talent:people.map(t=>t.id),organization:[...new Set([...(row.organizerIds||[]),...(row.relatedOrganizationIds||[]),...people.flatMap(t=>(t.affiliations||[]).map(a=>a.organizationId))])],type:row.type,date:row.starts?dateKey(row.starts):null,...extra}));
}
const filterScript='<script src="/assets/js/catalog-filter.js" defer></script>';
const dates=require('../assets/js/events-core');
const {peopleStack}=require('./content-components');
const formats={online:'オンライン',onsite:'現地開催',hybrid:'オンライン・現地',unknown:''};
function eventCover(e,detail=false){
 const image=e.thumbnailUrl;
 if(!image)return '';
 return '<div class="content-thumbnail event-cover'+(detail?' event-cover-detail':'')+'"><span aria-hidden="true">画像を表示できません</span><img src="'+escape(image)+'" alt="" loading="'+(detail?'eager':'lazy')+'" decoding="async" referrerpolicy="no-referrer" width="640" height="360"></div>';
}
function eventFrame(title,route,body,scripts='',options={}){
 const v=require('../data/release.json').version;
 return featureFrame(title,route,body,scripts,options).replace('</head>','<link rel="stylesheet" href="/assets/avatar-stack.css?v='+v+'"><link rel="stylesheet" href="/assets/event-ux.css?v='+v+'"></head>');
}
function eventPeople(e){return [...new Set([...e.talentIds,...(e.slots||[]).flatMap(s=>s.talentIds)])];}
function eventDateTile(time){
 if(time.precision==='unknown')return '<div class="event-date-tile"><span>日程</span><strong>未定</strong></div>';
 const key=time.precision==='instant'?dateKey(time):time.value;
 const [y,m,d]=key.split('-');
 return '<div class="event-date-tile"><span>'+escape(y)+'年</span><strong>'+Number(m)+'<small>月</small>'+(d?Number(d)+'<small>日</small>':'')+'</strong>'+(d?'<span>'+['日','月','火','水','木','金','土'][new Date(key+'T00:00:00Z').getUTCDay()]+'曜日</span>':'<span>日付未定</span>')+'</div>';
}
function eventDateRange(starts,ends,compact=false){
 const instant=(time,clockOnly)=>'<time datetime="'+escape(time.value)+'">'+escape(new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',...(clockOnly?{}:{year:'numeric',month:'2-digit',day:'2-digit'}),hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(time.value)))+'</time>';
 const label=(time,clockOnly)=>time.precision==='instant'?instant(time,clockOnly):timeLabel(time);
 const first=compact&&starts.precision!=='instant'?(starts.precision==='date'?'時刻未定':''):label(starts,compact);
 if(ends.precision==='unknown')return first;
 const sameDay=starts.precision==='instant'&&ends.precision==='instant'&&dateKey(starts)===dateKey(ends);
 return first?first+' <span class="event-range-separator">〜</span> '+label(ends,sameDay):'終了：'+label(ends,false);
}
function eventKnownPeople(ids,master){
 return require('../assets/js/member-order').sortIds([...new Set(ids)],master.talents).filter(id=>master.talents.some(t=>t.id===id&&t.visibility!=='draft'));
}
function eventPerformers(ids,master,compact=false){
 const known=eventKnownPeople(ids,master);
 if(!known.length)return '';
 if(compact&&known.length>2)return '<div class="event-performer-line event-performer-compact"><details><summary>'+peopleStack(known,master,'出演タレント')+'<span>'+known.length+'名の出演者</span></summary><div class="event-performer-expanded">'+personLinks(known,master)+'</div></details></div>';
 return '<div class="event-performer-line">'+peopleStack(known,master,'出演タレント')+'<span>'+personLinks(known,master)+'</span></div>';
}
function eventCast(ids,master){
 const known=eventKnownPeople(ids,master);
 return known.length?'<ul class="event-cast-grid">'+known.map(id=>'<li>'+peopleStack([id],master,'出演タレント')+'<span>'+personLinks([id],master)+'</span></li>').join('')+'</ul>':'<p class="feature-note">出演者は未登録です。</p>';
}
function eventFee(fee){
 if(fee.amount===null)return '';
 return escape(fee.amount.toLocaleString('ja-JP')+(fee.currency==='JPY'?'円':' '+(fee.currency||'')));
}
function eventCards(events,master,now=new Date('2026-11-14T00:00:00+09:00')) {
 return '<ul class="feature-grid event-card-grid">'+events.map(e=>{
  const phase=dates.phase(e,now),ids=eventPeople(e),people=eventPerformers(ids,master,true);
  const when=eventDateRange(e.starts,e.ends,true);
  return '<li class="feature-card event-card" data-event-id="'+e.id+'" data-phase="'+phase+'" data-event-times="'+escape(JSON.stringify({starts:e.starts,ends:e.ends}))+'" data-filter-row="'+rowData({...e,talentIds:ids},master)+'">'+eventDateTile(e.starts)+eventCover(e)+'<div class="event-card-body"><div class="event-card-meta"><span class="event-kind">'+eventTypes[e.type]+'</span><span class="event-status" data-event-phase>'+dates.labels[phase]+'</span></div><h2><a class="event-card-link" href="/events/'+e.id+'/">'+escape(e.title)+'</a></h2><div class="event-card-context">'+(when?'<p class="event-date">'+when+'</p>':'')+((formats[e.format]||e.venue)?'<p class="event-location">'+[formats[e.format],e.venue?escape(e.venue):''].filter(Boolean).join(' · ')+'</p>':'')+'</div>'+people+(!e.lineupComplete?'<p class="feature-note">出演者は一部のみ掲載</p>':'')+'<span class="event-card-arrow" aria-hidden="true">→</span></div></li>';
 }).join('')+'</ul>';
}
function eventList(master,data,reference='2026-11-15') {
 const now=new Date(reference+'T00:00:00+09:00');
 const groups=[['upcoming','開催中・今後のイベント'],['past','過去のイベント'],['unknown','開催日時未定']];
 const sections=groups.map(([key,label])=>{
  const items=data.events.filter(e=>{const p=dates.phase(e,now);return (p==='ongoing'?'upcoming':p)===key;}).sort((a,b)=>dates.compare(a,b,key)||a.id.localeCompare(b.id));
  return '<section class="event-section" data-event-group="'+key+'" data-result-section'+(items.length?'':' hidden')+'><div class="event-section-heading"><h2>'+label+'</h2><span data-event-count>'+items.length+'件</span></div>'+eventCards(items,master,now)+'</section>';
 }).join('');
 return eventFrame('イベント','/events/','<div class="events-page" data-compact-catalog>'+filters(master,{types:eventTypes})+'<noscript><p>分類の基準：'+escape(reference)+' 00:00 JST。終了時刻が未登録の場合は開始日時を基準に分類しています。</p></noscript>'+sections+'</div>','<script src="/assets/js/events-core.js" defer></script><script src="/assets/js/events.js" defer></script>'+filterScript);
}
function eventTimeline(slots,master,data){
 if(!slots.length)return '';
 const sorted=slots.map((s,i)=>({s,i})).sort((a,b)=>dates.compare(a.s,b.s,'upcoming')||a.i-b.i).map(x=>x.s);
 return '<section class="event-timeline" aria-labelledby="event-timeline-title"><h2 id="event-timeline-title">タイムテーブル・出演枠</h2><ol class="event-timeline-list">'+sorted.map(slot=>'<li id="'+escape(slot.id)+'"><div class="event-slot-time">'+eventDateRange(slot.starts,slot.ends)+'</div><div class="event-slot-info"><h3>'+escape(slot.title)+'</h3>'+eventPerformers(slot.talentIds,master)+slot.videoIds.map(id=>'<p>'+videoLink(id,data)+'</p>').join('')+slot.streamUrls.map(url=>'<p><a href="'+escape(url)+'"'+externalLinkAttrs(url)+'>出演枠の配信先 ↗</a></p>').join('')+'</div></li>').join('')+'</ol></section>';
}
function eventPage(e,master,data) {
 const orgs=ids=>ids.map(id=>master.organizations.find(o=>o.id===id)?.name).filter(Boolean).map(escape).join('・');
 const fact=(label,value)=>value?'<dt>'+label+'</dt><dd>'+value+'</dd>':'';
 const groups=e.groupIds.map(id=>data.groups?.find(g=>g.id===id)).filter(Boolean).map(g=>'<a href="/talents/?group='+g.id+'">'+escape(g.name)+'</a>').join('・');
 const facts=fact('主催',orgs(e.organizerIds))+fact('関連組織',orgs(e.relatedOrganizationIds))+fact('グループ',groups)+fact('料金',eventFee(e.fee))+fact('料金の補足',e.fee.note?escape(e.fee.note):'');
 const location=[formats[e.format],e.venue?escape(e.venue):''].filter(Boolean).join(' · ');
 const cast=eventKnownPeople(eventPeople(e),master);
 const body='<div class="event-detail event-detail-redesign"><nav class="breadcrumbs" aria-label="パンくずリスト"><a href="/events/">イベント一覧</a> / '+escape(e.title)+'</nav><div class="event-detail-hero'+(e.thumbnailUrl?' has-cover':'')+'">'+eventCover(e,true)+'<div class="event-detail-overview" data-event-detail-times="'+escape(JSON.stringify({starts:e.starts,ends:e.ends}))+'"><div class="event-card-meta"><span class="event-kind">'+eventTypes[e.type]+'</span><span class="event-status" data-event-phase hidden></span></div><h1>'+escape(e.title)+'</h1><p class="event-date">'+eventDateRange(e.starts,e.ends)+'</p>'+(location?'<p class="event-location">'+location+'</p>':'')+'<p class="event-official"><a class="feature-action" href="'+escape(e.announcementUrl)+'"'+externalLinkAttrs(e.announcementUrl)+'>公式サイト・告知 ↗</a></p></div></div><div class="event-detail-columns'+(facts?' has-facts':'')+'"><div class="event-detail-main"><section class="event-detail-section"><h2>出演タレント'+(cast.length?'<small>'+cast.length+'名</small>':'')+'</h2>'+eventCast(cast,master)+(!e.lineupComplete?'<p class="feature-note">出演者は一部のみ掲載しています。</p>':'')+'</section>'+(e.summary?'<section class="event-detail-section"><h2>イベント概要</h2><p class="event-summary">'+escape(e.summary)+'</p></section>':'')+'</div>'+(facts?'<section class="event-detail-section event-detail-facts"><h2>開催情報</h2><dl class="feature-facts">'+facts+'</dl></section>':'')+'</div>'+eventTimeline(e.slots,master,data)+(e.videoIds.length||e.streamUrls.length?'<section class="event-detail-section event-streams"><h2>配信・アーカイブ</h2><ul class="related-list">'+e.videoIds.map(id=>'<li>'+videoLink(id,data)+'</li>').join('')+e.streamUrls.map(url=>'<li><a href="'+escape(url)+'"'+externalLinkAttrs(url)+'>公式配信先 ↗</a></li>').join('')+'</ul></section>':'')+'<p class="event-back"><a href="/events/">← イベント一覧へ</a></p></div>';
 return eventFrame(e.title,'/events/'+e.id+'/',body,'<script src="/assets/js/events-core.js" defer></script><script src="/assets/js/events.js" defer></script>',{hideHeading:true});
}
function talentEvents(id,master,data) {
  const events=data.events.filter(e=>e.talentIds.includes(id)||e.slots.some(s=>s.talentIds.includes(id)));
  if(!events.length)return '';
  return `<section class="profile-section"><h2>関連イベント</h2>${events.length?`<ul class="related-list">${events.map(e=>`<li><a href="/events/${e.id}/">${escape(e.title)}</a><p>${timeLabel(e.starts)}</p></li>`).join('')}</ul>`:'<p>確認済みの関連イベントはまだ登録されていません。</p>'}<p><a href="/events/?talent=${id}">イベント一覧で探す →</a></p></section>`;
}
module.exports={eventDateRange,eventFee,eventTypes,timeLabel,dateKey,personLinks,videoLink,featureFrame,filters,rowData,filterScript,eventCards,eventList,eventPage,talentEvents,eventTimeline,eventDateTile};
