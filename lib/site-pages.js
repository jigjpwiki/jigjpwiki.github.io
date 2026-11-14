'use strict';
const pages = Object.freeze([
  { path: '/', label: '配信スケジュール', ready: true },
  { path: '/talents/', label: 'タレント一覧', ready: true },
  { path: '/anniversaries/', label: '記念日', ready: true },
  { path: '/goods/', label: 'グッズ・イベント', ready: true }
]);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function navigation(current) {
  return `<nav class="site-nav" aria-label="メインナビゲーション">${pages.filter(p => p.ready).map(p => `<a href="${p.path}"${p.path === current ? ' aria-current="page"' : ''}>${p.label}</a>`).join('')}</nav>`;
}
function applyNavigation(html, current) {
  if (!html.includes('<!-- jigdule:navigation -->')) throw new Error('Missing navigation slot');
  return html.replace('<!-- jigdule:navigation -->', navigation(current));
}
function talentCards(master) {
  const sources = new Map(master.sources.map(s => [s.id, s]));
  const orgs = new Map(master.organizations.map(o => [o.id, o.name]));
  const agency = { affiliated: '所属中', unaffiliated: '無所属（確認済み）', unknown: '不明' };
  const activity = { active: '活動中', hiatus: '休止中', retired: '引退', ended: '活動終了', unknown: '不明' };
  const affiliation = { current: '現在所属', former: '卒業・退所済み', unknown: '所属状態不明' };
  const service = { youtube: 'YouTube', x: 'X', twitch: 'Twitch', tiktok: 'TikTok' };
  return master.talents.map(t => {
    const used = new Set([...t.displayNameSourceRefs, ...t.agencyStatus.sourceRefs, ...t.activityStatus.sourceRefs, ...t.affiliations.flatMap(a => a.sourceRefs), ...t.accounts.flatMap(a => a.sourceRefs), ...t.aliases.flatMap(a => a.sourceRefs), ...(t.wiki?.sourceRefs || []), ...(t.profileImage?.sourceRefs || [])]);
    const image = t.profileImage ? `<span class="talent-avatar" aria-hidden="true"><span>${escape([...t.displayName][0])}</span><img src="${escape(t.profileImage.url)}" alt="" width="64" height="64" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>` : '<span class="talent-image-placeholder" aria-label="プロフィール画像未確認">画像未確認</span>';
    return `<li class="talent-card" id="${t.id}"><div class="talent-title">${image}<div><h2><a href="/talents/${t.id}/">${escape(t.displayName)}</a></h2><small>${t.id}</small></div></div>
<dl><dt>事務所所属</dt><dd>${agency[t.agencyStatus.value]}</dd><dt>VTuber活動</dt><dd>${activity[t.activityStatus.value]}</dd><dt>所属履歴</dt><dd><ul>${t.affiliations.map(a => `<li>${escape(orgs.get(a.organizationId))}：${affiliation[a.status]}<br><small>${a.from || '開始日不明'} 〜 ${a.status === 'current' ? '現在' : a.to || '終了日不明'}</small></li>`).join('') || '<li>未確認</li>'}</ul></dd><dt>過去の活動名・別名</dt><dd>${t.aliases.length ? t.aliases.map(a => escape(a.name)).join('、') : '確認済みの登録なし'}</dd></dl>
<ul class="talent-links">${t.accounts.map(a => `<li><a href="${escape(a.url)}" rel="noreferrer">${service[a.service]}</a></li>`).join('')}${t.wiki ? `<li><a href="${escape(t.wiki.url)}" rel="noreferrer">非公式Wiki</a></li>` : ''}</ul>
<details><summary>出典・確認日</summary><ul>${[...used].map(id => { const s = sources.get(id); const checked = new Date(s.checkedAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }); return `<li><a href="${escape(s.url)}" rel="noreferrer">${s.kind === 'official' ? '公式' : '非公式Wiki'}：${escape(new URL(s.url).hostname)}</a> <time datetime="${s.checkedAt}">${checked}確認</time></li>`; }).join('')}</ul></details></li>`;
  }).join('\n');
}
module.exports = { pages, escape, navigation, applyNavigation, talentCards };
