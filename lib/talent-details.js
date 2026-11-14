'use strict';
const { frame } = require('./info-pages'); const { escape } = require('./site-pages'); const { relatedStreams } = require('./related');
function sourcesHtml(refs, sources) {
  const rows = [...new Set(refs)].map(id => sources.find(s => s.id === id)).filter(Boolean);
  return `<details><summary>情報源・確認日</summary><ul>${rows.map(s => `<li><a href="${escape(s.url)}" rel="noreferrer">${s.kind === 'official' ? '公式情報' : '非公式Wiki'}：${escape(new URL(s.url).hostname)}</a> <time datetime="${s.checkedAt}">${new Date(s.checkedAt).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})}確認</time></li>`).join('')}</ul></details>`;
}
function avatar(talent) {
  return talent.profileImage ? `<span class="talent-avatar" aria-hidden="true"><span>${escape([...talent.displayName][0])}</span><img src="${escape(talent.profileImage.url)}" alt="" width="96" height="96" referrerpolicy="no-referrer" decoding="async"></span>` : '<span class="talent-image-placeholder">画像未確認</span>';
}
function talentPage(talent, master, catalog, feeds = {}, renderGoods = null) {
  const orgs = new Map(master.organizations.map(o=>[o.id,o.name]));
  const current = [...new Set(talent.affiliations.filter(a=>a.status==='current').map(a=>orgs.get(a.organizationId)))];
  const former = [...new Set(talent.affiliations.filter(a=>a.status==='former').map(a=>orgs.get(a.organizationId)))];
  const groupIds = catalog.groups.filter(g=>g.talentIds.includes(talent.id)).map(g=>g.id);
  const events = catalog.events.filter(e=>e.talentIds.includes(talent.id)||e.groupIds.some(id=>groupIds.includes(id)));
  const rows = relatedStreams(talent,feeds.youtube,feeds.twitch);
  const sourceRows = [...master.sources,...catalog.sources].filter((s,i,a)=>a.findIndex(x=>x.id===s.id)===i);
  const refs = [...talent.displayNameSourceRefs,...talent.affiliations.flatMap(a=>a.sourceRefs),...talent.accounts.flatMap(a=>a.sourceRefs),...(talent.wiki?.sourceRefs||[]),...(talent.profileImage?.sourceRefs||[]),...events.flatMap(e=>e.sourceRefs)];
  const verified = refs.map(id=>sourceRows.find(s=>s.id===id)?.checkedAt).filter(Boolean).sort().at(-1);
  const labels = { youtube:'YouTube',x:'X',twitch:'Twitch',tiktok:'TikTok' };
  const streamState = { live:'配信中（収集時点）',upcoming:'配信予定（収集時点）',archive:'動画・アーカイブ' };
  const body = `<div class="profile-hero">${avatar(talent)}<div>${current.length?`<p>所属：${current.map(escape).join('・')}</p>`:''}${former.length?`<p>旧所属：${former.map(escape).join('・')}</p>`:''}${!current.length&&!former.length?'<p>所属情報は未確認です。</p>':''}<ul class="talent-links">${talent.accounts.map(a=>`<li><a href="${escape(a.url)}" rel="noreferrer">${labels[a.service]}</a></li>`).join('')}${talent.wiki?`<li><a href="${escape(talent.wiki.url)}" rel="noreferrer">非公式Wiki</a></li>`:''}</ul></div></div>
${talent.aliases.length?`<p>別名・過去の活動名：${talent.aliases.map(a=>escape(a.name)).join('、')}</p>`:''}
<section class="profile-section"><h2>誕生日・記念日</h2>${events.length?`<ul class="related-list">${events.map(e=>`<li><strong>${escape(e.title)}</strong><br>${e.date.month}月${e.date.day}日${e.date.year!==null&&e.type!=='birthday'?`（起点：${e.date.year}年）`:''} <a href="/anniversaries/">記念日カレンダー</a></li>`).join('')}</ul>`:'<p class="empty-state">確認済みの記念日はまだ登録されていません。</p>'}</section>
<section class="profile-section"><h2>関連する配信・動画</h2><p>既存の収集データをアカウントIDで照合した情報です。人物の活動状態を推定するものではありません。<a href="/">最新の配信スケジュールへ</a></p>${rows.length?`<ul class="related-list">${rows.map(r=>`<li><span class="category">${labels[r.service]}・${streamState[r.status]}</span><br><a href="${escape(r.url)}" rel="noreferrer">${escape(r.title)}</a><br><time datetime="${escape(r.date)}">${new Date(r.date).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})} JST</time></li>`).join('')}</ul>`:'<p class="empty-state">アカウントIDで関連付けできる配信・動画情報はありません。</p>'}</section>
${renderGoods ? renderGoods(talent.id) : ''}
<section class="profile-section"><h2>情報の出典</h2>${verified?`<p>掲載出典の最終確認日：<time datetime="${verified}">${new Date(verified).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})}</time></p>`:''}${sourcesHtml(refs,sourceRows)}</section>`;
  return frame(talent.displayName,`/talents/${talent.id}/`,body,'<script src="/assets/js/talents.js" defer></script>');
}
module.exports = { talentPage, sourcesHtml, avatar };
