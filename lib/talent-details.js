"use strict";
const { frame } = require("./info-pages");
const {escape,externalLinkAttrs}=require('./site-pages');
const { relatedStreams } = require("./related");
function avatar(talent) {
  return `<span class="talent-avatar" aria-hidden="true"><span>${escape([...talent.displayName][0])}</span>${talent.profileImage ? `<img src="${escape(talent.profileImage.url)}" alt="" width="128" height="128" referrerpolicy="no-referrer" decoding="async">` : ""}</span>`;
}
// Font Awesome Free 6.7.2 Brands SVGs; original license comments retained.
// https://github.com/FortAwesome/Font-Awesome/tree/6.7.2/svgs/brands
const brandIcons = {
  "youtube": "<svg class=\"profile-link-icon profile-brand-icon\" aria-hidden=\"true\" focusable=\"false\" fill=\"currentColor\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 576 512\"><!--! Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License) Copyright 2024 Fonticons, Inc. --><path d=\"M549.655 124.083c-6.281-23.65-24.787-42.276-48.284-48.597C458.781 64 288 64 288 64S117.22 64 74.629 75.486c-23.497 6.322-42.003 24.947-48.284 48.597-11.412 42.867-11.412 132.305-11.412 132.305s0 89.438 11.412 132.305c6.281 23.65 24.787 41.5 48.284 47.821C117.22 448 288 448 288 448s170.78 0 213.371-11.486c23.497-6.321 42.003-24.171 48.284-47.821 11.412-42.867 11.412-132.305 11.412-132.305s0-89.438-11.412-132.305zm-317.51 213.508V175.185l142.739 81.205-142.739 81.201z\"/></svg>",
  "twitch": "<svg class=\"profile-link-icon profile-brand-icon\" aria-hidden=\"true\" focusable=\"false\" fill=\"currentColor\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\"><!--! Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License) Copyright 2024 Fonticons, Inc. --><path d=\"M391.17,103.47H352.54v109.7h38.63ZM285,103H246.37V212.75H285ZM120.83,0,24.31,91.42V420.58H140.14V512l96.53-91.42h77.25L487.69,256V0ZM449.07,237.75l-77.22,73.12H294.61l-67.6,64v-64H140.14V36.58H449.07Z\"/></svg>",
  "x": "<svg class=\"profile-link-icon profile-brand-icon\" aria-hidden=\"true\" focusable=\"false\" fill=\"currentColor\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\"><!--! Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License) Copyright 2024 Fonticons, Inc. --><path d=\"M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z\"/></svg>",
  "tiktok": "<svg class=\"profile-link-icon profile-brand-icon\" aria-hidden=\"true\" focusable=\"false\" fill=\"currentColor\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 448 512\"><!--! Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License) Copyright 2024 Fonticons, Inc. --><path d=\"M448,209.91a210.06,210.06,0,0,1-122.77-39.25V349.38A162.55,162.55,0,1,1,185,188.31V278.2a74.62,74.62,0,1,0,52.23,71.18V0l88,0a121.18,121.18,0,0,0,1.86,22.17h0A122.18,122.18,0,0,0,381,102.39a121.43,121.43,0,0,0,67,20.14Z\"/></svg>"
};
// Project-supplied jig.jp unofficial Wiki logo: exact 20px pixel grid, cropped to the artwork.
const wikiLogo = '<svg class="profile-link-icon profile-wiki-logo" aria-hidden="true" focusable="false" viewBox="0 0 39 19" fill="currentColor"><path d="M1 0h1v1h-1zM3 0h1v1h-1zM11 0h1v1h-1zM1 2h1v1h-1zM3 2h1v1h-1zM5 2h4v1h-4zM11 2h1v1h-1zM13 2h3v1h-3zM1 3h1v1h-1zM3 3h1v1h-1zM5 3h1v1h-1zM7 3h1v1h-1zM11 3h1v1h-1zM13 3h1v1h-1zM15 3h1v1h-1zM1 4h1v1h-1zM3 4h1v1h-1zM5 4h3v1h-3zM9 4h1v1h-1zM11 4h1v1h-1zM13 4h3v1h-3zM18 4h3v1h-3zM24 4h3v1h-3zM36 4h3v1h-3zM1 5h1v1h-1zM7 5h1v1h-1zM11 5h1v1h-1zM13 5h1v1h-1zM18 5h3v1h-3zM24 5h3v1h-3zM36 5h3v1h-3zM0 6h2v1h-2zM5 6h3v1h-3zM10 6h2v1h-2zM13 6h1v1h-1zM18 6h3v1h-3zM24 6h3v1h-3zM36 6h3v1h-3zM24 7h3v3h-3zM0 10h3v3h-3zM6 10h3v3h-3zM12 10h3v3h-3zM18 10h3v3h-3zM24 10h3v3h-3zM30 10h3v3h-3zM36 10h3v3h-3zM0 13h3v3h-3zM6 13h3v3h-3zM12 13h3v3h-3zM18 13h3v3h-3zM24 13h6v3h-6zM36 13h3v3h-3zM0 16h12v3h-12zM18 16h3v3h-3zM24 16h3v3h-3zM30 16h3v3h-3zM36 16h3v3h-3z"/></svg>';
const profileIcons = {
  official: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18"/>',
};
const linkIcon = type => Object.hasOwn(brandIcons, type) ? brandIcons[type] : `<svg class="profile-link-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${profileIcons[type] || profileIcons.official}</svg>`;
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
  const body = `<nav class="breadcrumbs" aria-label="パンくずリスト"><a href="/">配信</a> / <a href="/talents/">タレント一覧</a> / <span aria-current="page">${escape(talent.displayName)}</span></nav><div class="profile-hero">${avatar(talent)}<div class="profile-identity"><div class="profile-name-row"><h1>${escape(talent.displayName)}</h1>${activity?`<span class="profile-activity" data-activity="${talent.activityStatus.value}">${activity}</span>`:""}</div>${current.length ? `<p>所属：${affiliationLinks}</p>` : ""}${former.length ? `<p>旧所属：${former.map(escape).join("・")}</p>` : ""}${!current.length ? (talent.agencyStatus.value === "unaffiliated" ? (["ended","retired"].includes(talent.activityStatus.value) ? "" : "<p>無所属</p>") : !former.length ? "<p>所属不明</p>" : "") : ""}${groupLinks?`<div class="profile-groups" aria-label="所属グループ">${groupLinks}</div>`:""}</div><div class="profile-destinations">${talent.accounts.length ? `<ul class="talent-links profile-social-links" aria-label="配信・SNS">${talent.accounts.map((a) => `<li><a data-profile-service="${escape(a.service)}"${Object.hasOwn(brandIcons,a.service) ? ' class="profile-icon-only"' : ""} title="${escape(labels[a.service] || a.service)}" href="${escape(a.url)}"${externalLinkAttrs(a.url)}>${linkIcon(a.service)}<span class="profile-service-label">${escape(labels[a.service] || a.service)}</span></a></li>`).join("")}</ul>` : ""}${talent.officialProfileUrl || talent.wiki ? `<ul class="talent-links profile-reference-links" aria-label="プロフィール・参考情報">${talent.officialProfileUrl ? `<li><a href="${escape(talent.officialProfileUrl)}"${externalLinkAttrs(talent.officialProfileUrl)}>${linkIcon("official")}公式プロフィール <span class="profile-link-external" aria-hidden="true">↗</span></a></li>` : ""}${talent.wiki ? `<li><a class="profile-wiki-link profile-icon-only" title="非公式Wiki" href="${escape(talent.wiki.url)}"${externalLinkAttrs(talent.wiki.url)}>${wikiLogo}<span class="profile-service-label">非公式Wiki</span></a></li>` : ""}</ul>` : ""}</div></div>
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
