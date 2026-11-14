'use strict';
const pages = Object.freeze([
  { path: '/', label: '配信スケジュール', ready: true },
  { path: '/talents/', label: 'タレント一覧', ready: true },
  { path: '/anniversaries/', label: '記念日', ready: true },
  { path: '/goods/', label: 'グッズ', ready: true }
]);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function navigation(current) {
  return `<nav class="site-nav" aria-label="メインナビゲーション">${pages.filter(p => p.ready).map(p => `<a href="${p.path}"${p.path === current ? ' aria-current="page"' : p.path==='/talents/'&&current.startsWith('/talents/') ? ' aria-current="location"' : ''}>${p.label}</a>`).join('')}</nav>`;
}
function applyNavigation(html, current) {
  if (!html.includes('<!-- jigdule:navigation -->')) throw new Error('Missing navigation slot');
  return html.replace('<!-- jigdule:navigation -->', navigation(current));
}
function talentCards(master, groups = []) {
  const orgs = new Map(master.organizations.map(o => [o.id,o.name]));
  return master.talents.map(t => {
    const current = [...new Set(t.affiliations.filter(a=>a.status==='current').map(a=>a.organizationId))];
    const former = [...new Set(t.affiliations.filter(a=>a.status==='former'&&!current.includes(a.organizationId)).map(a=>a.organizationId))];
    const groupsFor = groups.filter(g=>g.talentIds.includes(t.id));
    const image = `<span class="talent-avatar" aria-hidden="true"><span>${escape([...t.displayName][0])}</span>${t.profileImage ? `<img src="${escape(t.profileImage.url)}" alt="" width="96" height="96" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</span>`;
    const row = {name:t.displayName,aliases:t.aliases.map(a=>a.name),current,former,groups:groupsFor.map(g=>g.id),unaffiliated:t.agencyStatus.value==='unaffiliated'};
    return `<li id="${t.id}" data-person="${escape(JSON.stringify(row))}"><a class="talent-card" href="/talents/${t.id}/" aria-labelledby="name-${t.id}">${image}<h2 id="name-${t.id}">${escape(t.displayName)}</h2><div class="affiliation">${current.map(id=>`<p>所属：${escape(orgs.get(id))}</p>`).join('')}${former.map(id=>`<p>旧所属：${escape(orgs.get(id))}</p>`).join('')}${!current.length&&!former.length?(t.agencyStatus.value==='unaffiliated'?'<p>無所属（確認済み）</p>':'<p>所属情報は未確認です</p>'):''}</div>${groupsFor.map(g=>`<p class="group-label">関連グループ：${escape(g.name)}</p>`).join('')}<span class="card-cta">プロフィールを見る →</span></a></li>`;
  }).join('\n') + `<script type="application/json" id="directory-data">${JSON.stringify({organizations:master.organizations.map(o=>({id:o.id,name:o.name})),groups:groups.map(g=>({id:g.id,name:g.name}))}).replace(/</g,'\\u003c')}</script>`;
}
module.exports = { pages, escape, navigation, applyNavigation, talentCards };
