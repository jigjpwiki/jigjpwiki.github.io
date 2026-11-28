"use strict";
const { frame } = require("./info-pages");
const {escape,externalLinkAttrs}=require('./site-pages');
const { relatedStreams } = require("./related");
function avatar(talent) {
  return `<span class="talent-avatar" aria-hidden="true"><span>${escape([...talent.displayName][0])}</span>${talent.profileImage ? `<img src="${escape(talent.profileImage.url)}" alt="" width="128" height="128" referrerpolicy="no-referrer" decoding="async">` : ""}</span>`;
}
const profileIcons = {
  youtube: '<rect x="3" y="5" width="18" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/>',
  twitch: '<path d="M4 3h17v12l-5 5h-4l-3 3v-3H4zM10 8v5m5-5v5"/>',
  x: '<path d="M4 4h4l12 16h-4zM20 4 4 20"/>',
  tiktok: '<path d="M14 3v12a4 4 0 1 1-4-4m4-8c0 4 3 6 6 6"/>',
  official: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18"/>',
  wiki: '<path d="M3 4h7a2 2 0 0 1 2 2v15a4 4 0 0 0-4-3H3zm18 0h-7a2 2 0 0 0-2 2v15a4 4 0 0 1 4-3h5z"/>',
};
const linkIcon = type => `<svg class="profile-link-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${profileIcons[type] || profileIcons.official}</svg>`;
function talentPage(
  talent,
  master,
  catalog,
  feeds = {},
  renderGoods = null,
  renderFeatures = null,
) {
  const orgs = new Map(master.organizations.map((o) => [o.id, o.name]));
  const current = [
    ...new Set(
      talent.affiliations
        .filter((a) => a.status === "current")
        .map((a) => orgs.get(a.organizationId))
        .filter(Boolean),
    ),
  ];
  const former = [
    ...new Set(
      talent.affiliations
        .filter((a) => a.status === "former")
        .map((a) => orgs.get(a.organizationId))
        .filter(Boolean),
    ),
  ].filter((name) => !current.includes(name));
  const groupIds = catalog.groups
    .filter((g) => g.talentIds.includes(talent.id))
    .map((g) => g.id);
  const events = catalog.events.filter(
    (e) =>
      e.talentIds.includes(talent.id) ||
      e.groupIds.some((id) => groupIds.includes(id)),
  );
  const rows = relatedStreams(
    talent,
    feeds.youtube,
    feeds.twitch,
    master.talents,
  );
  const labels = {
    youtube: "YouTube",
    x: "X",
    twitch: "Twitch",
    tiktok: "TikTok",
  };

  const groupLinks=catalog.groups.filter(g=>groupIds.includes(g.id)).map(g=>`<a href="/talents/?group=${encodeURIComponent(g.id)}">${escape(g.name)}</a>`).join("");
  const affiliationLinks = current.map(name => {
    const org = master.organizations.find(o=>o.name===name);
    return org ? `<a href="/talents/?organization=${encodeURIComponent(org.id)}&amp;relation=current">${escape(name)}</a>` : escape(name);
  }).join("・");
  const activity=({active:"活動中",hiatus:"活動休止",retired:"引退",ended:"活動終了"})[talent.activityStatus.value];
  const features=renderFeatures ? renderFeatures(talent.id) : "";
  const goods=renderGoods ? renderGoods(talent.id) : "";
  const sections=[["talent-streams","配信"],...(events.length?[["profile-anniversaries","記念日"]]:[]),
    ...(features.includes('<h2>音楽</h2>')?[["profile-music","音楽"]]:[]),
    ...(features.includes('<h2>関連イベント</h2>')?[["profile-events","イベント"]]:[]),
    ...(goods.includes('<h2>関連グッズ</h2>')?[["profile-goods","グッズ"]]:[]),
    ["profile-biography","活動履歴"]];
  const sectionNav=`<nav class="profile-jumps" aria-label="プロフィール内の移動">${sections.map(([id,label])=>`<a href="#${id}">${label}</a>`).join("")}</nav>`;
  const body = `<nav class="breadcrumbs" aria-label="パンくずリスト"><a href="/">配信</a> / <a href="/talents/">タレント一覧</a> / <span aria-current="page">${escape(talent.displayName)}</span></nav><div class="profile-hero">${avatar(talent)}<div class="profile-identity"><div class="profile-name-row"><h1>${escape(talent.displayName)}</h1>${activity?`<span class="profile-activity" data-activity="${talent.activityStatus.value}">${activity}</span>`:""}</div>${current.length ? `<p>所属：${affiliationLinks}</p>` : ""}${former.length ? `<p>旧所属：${former.map(escape).join("・")}</p>` : ""}${!current.length ? (talent.agencyStatus.value === "unaffiliated" ? (["ended","retired"].includes(talent.activityStatus.value) ? "" : "<p>無所属</p>") : !former.length ? "<p>所属不明</p>" : "") : ""}${groupLinks?`<div class="profile-groups" aria-label="所属グループ">${groupLinks}</div>`:""}</div><div class="profile-destinations"><ul class="talent-links">${talent.accounts.map((a) => `<li><a data-profile-service="${escape(a.service)}" href="${escape(a.url)}"${externalLinkAttrs(a.url)}>${linkIcon(a.service)}${escape(labels[a.service] || a.service)}</a></li>`).join("")}${talent.officialProfileUrl ? `<li><a href="${escape(talent.officialProfileUrl)}"${externalLinkAttrs(talent.officialProfileUrl)}>${linkIcon("official")}公式プロフィール</a></li>` : ""}${talent.wiki ? `<li><a href="${escape(talent.wiki.url)}"${externalLinkAttrs(talent.wiki.url)}>${linkIcon("wiki")}非公式Wiki</a></li>` : ""}</ul></div></div>
${sectionNav}
<div class="profile-layout"><div class="profile-primary">
<section class="profile-section" id="talent-streams"><div class="profile-stream-header"><h2>配信・アーカイブ</h2><div class="stream-controls"><a href="/">配信スケジュールへ <span aria-hidden="true">→</span></a><button type="button" hidden>配信情報を更新</button></div></div><details class="stream-help"><summary>更新情報</summary><p>表示は取得時点の情報です。最新の状況は配信先でご確認ください。</p><p data-stream-meta></p></details><p class="stream-feedback" data-stream-status role="status" aria-live="polite"></p><div data-stream-output></div><details data-stream-fallback open><summary>保存された配信・動画</summary><section class="profile-section"><h3>配信・動画</h3><p>サイト公開時点の保存データです。</p>${rows.length ? `<ul class="related-list">${rows.map((r) => `<li><span class="category">${labels[r.service]}</span><br><a href="${escape(r.url)}"${externalLinkAttrs(r.url)}>${escape(r.title)}</a><br><time datetime="${escape(r.date)}">${new Date(r.date).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} JST</time></li>`).join("")}</ul>` : '<p class="empty-state">配信・動画はありません。</p>'}</section></details></section><script type="application/json" id="talent-stream-config">${JSON.stringify({ talent: { id: talent.id, displayName: talent.displayName, profileImageUrl: talent.profileImage?.url || null, accounts: talent.accounts.filter((a) => ["youtube", "twitch"].includes(a.service)).map((a) => ({ service: a.service, accountId: a.accountId })) } }).replace(/</g, "\\u003c")}</script>

${features.replace('<section class="profile-section"><h2>音楽</h2>','<section class="profile-section" id="profile-music"><h2>音楽</h2>').replace('<section class="profile-section"><h2>関連イベント</h2>','<section class="profile-section" id="profile-events"><h2>関連イベント</h2>')}
${goods.replace('<section class="profile-section"><h2>関連グッズ</h2>','<section class="profile-section" id="profile-goods"><h2>関連グッズ</h2>')}
</div><aside class="profile-secondary" aria-label="基本情報・記念日">
${events.length ? `<section class="profile-section" id="profile-anniversaries"><h2>誕生日・記念日</h2><ul class="profile-anniversaries">${events.map((e) => `<li><a href="/anniversaries/?event=${encodeURIComponent(e.id)}"><time>${e.date.month}月${e.date.day}日</time><span>${escape(e.title)}${e.date.year !== null && e.type !== "birthday" ? `<small>起点 ${e.date.year}年</small>` : ""}</span><span class="anniversary-cta">記念日カレンダー <span aria-hidden="true">→</span></span></a></li>`).join("")}</ul></section>` : ""}
<section class="profile-section profile-biography" id="profile-biography"><h2>プロフィール</h2><details open><summary>所属・活動履歴</summary>${talent.aliases.length ? `<p>別名・過去の活動名：${talent.aliases.map((a) => escape(a.name)).join("、")}</p>` : ""}${talent.affiliations.length ? `<ul>${talent.affiliations.map((a) => `<li>${a.status === "former" ? "旧所属：" : a.status === "current" ? "所属：" : "所属情報："}${escape(orgs.get(a.organizationId) || "不明")}${a.from || a.to ? `（${escape(a.from || "開始日不明")}〜${escape(a.to || "終了日不明")}）` : ""}</li>`).join("")}</ul>` : "<p>所属情報はありません。</p>"}${talent.activityStatus.value !== "unknown" ? `<p>${{ active: "活動中", hiatus: "活動休止", retired: "引退", ended: "活動終了" }[talent.activityStatus.value]}</p>` : ""}</details></section></aside></div>`;
  return frame(
    talent.displayName,
    `/talents/${talent.id}/`,
    body,
    '<script src="/assets/js/talents.js" defer></script><script src="/assets/js/stream-core.js" defer></script><script src="/assets/js/talent-streams.js" defer></script>',
    {
      hideHeading: true,
      mainClass: "talent-profile",
      styles:
        '<link rel="stylesheet" href="/assets/streams.css"><link rel="stylesheet" href="/assets/talent-ux.css">',
    },
  );
}
module.exports = { talentPage, avatar };
