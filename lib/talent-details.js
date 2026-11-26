"use strict";
const { frame } = require("./info-pages");
const { escape } = require("./site-pages");
const { relatedStreams } = require("./related");
function avatar(talent) {
  return `<span class="talent-avatar" aria-hidden="true"><span>${escape([...talent.displayName][0])}</span>${talent.profileImage ? `<img src="${escape(talent.profileImage.url)}" alt="" width="128" height="128" referrerpolicy="no-referrer" decoding="async">` : ""}</span>`;
}
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

  const body = `<nav class="breadcrumbs" aria-label="パンくずリスト"><a href="/">配信</a> / <a href="/talents/">タレント一覧</a> / <span aria-current="page">${escape(talent.displayName)}</span></nav><a class="back-link" href="/talents/">← タレント一覧へ</a><div class="profile-hero">${avatar(talent)}<div><h1>${escape(talent.displayName)}</h1>${current.length ? `<p>所属：${current.map(escape).join("・")}</p>` : ""}${former.length ? `<p>旧所属：${former.map(escape).join("・")}</p>` : ""}${!current.length ? (talent.agencyStatus.value === "unaffiliated" ? (["ended","retired"].includes(talent.activityStatus.value) ? "" : "<p>無所属</p>") : !former.length ? "<p>所属不明</p>" : "") : ""}<ul class="talent-links">${talent.accounts.map((a) => `<li><a href="${escape(a.url)}" rel="noreferrer">${labels[a.service]}</a></li>`).join("")}${talent.officialProfileUrl ? `<li><a href="${escape(talent.officialProfileUrl)}" rel="noreferrer">公式プロフィール</a></li>` : ""}${talent.wiki ? `<li><a href="${escape(talent.wiki.url)}" rel="noreferrer">非公式Wiki</a></li>` : ""}</ul></div></div>

<section class="profile-section" id="talent-streams"><h2>配信・アーカイブ</h2><div class="stream-controls"><a href="/">配信スケジュールへ</a><button type="button" hidden>配信情報を更新</button></div><details class="stream-help"><summary>更新情報</summary><p>表示は取得時点の情報です。最新の状況は配信先でご確認ください。</p><p data-stream-meta></p></details><p class="stream-feedback" data-stream-status role="status" aria-live="polite"></p><div data-stream-output></div><details data-stream-fallback open><summary>保存された配信・動画</summary><section class="profile-section"><h3>配信・動画</h3><p>サイト公開時点の保存データです。</p>${rows.length ? `<ul class="related-list">${rows.map((r) => `<li><span class="category">${labels[r.service]}</span><br><a href="${escape(r.url)}" rel="noreferrer">${escape(r.title)}</a><br><time datetime="${escape(r.date)}">${new Date(r.date).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} JST</time></li>`).join("")}</ul>` : '<p class="empty-state">配信・動画はありません。</p>'}</section></details></section><script type="application/json" id="talent-stream-config">${JSON.stringify({ talent: { id: talent.id, displayName: talent.displayName, profileImageUrl: talent.profileImage?.url || null, accounts: talent.accounts.filter((a) => ["youtube", "twitch"].includes(a.service)).map((a) => ({ service: a.service, accountId: a.accountId })) } }).replace(/</g, "\\u003c")}</script>
${events.length ? `<section class="profile-section" id="profile-anniversaries"><h2>誕生日・記念日</h2><ul class="profile-anniversaries">${events.map((e) => `<li><a href="/anniversaries/?event=${encodeURIComponent(e.id)}"><time>${e.date.month}月${e.date.day}日</time><span>${escape(e.title)}${e.date.year !== null && e.type !== "birthday" ? `<small>起点 ${e.date.year}年</small>` : ""}</span><span class="anniversary-cta">記念日カレンダー</span></a></li>`).join("")}</ul></section>` : ""}
${renderFeatures ? renderFeatures(talent.id) : ""}
${renderGoods ? renderGoods(talent.id) : ""}
<section class="profile-section profile-biography"><h2>プロフィール</h2><details><summary>プロフィール・活動履歴を見る</summary>${talent.aliases.length ? `<p>別名・過去の活動名：${talent.aliases.map((a) => escape(a.name)).join("、")}</p>` : ""}${talent.affiliations.length ? `<ul>${talent.affiliations.map((a) => `<li>${a.status === "former" ? "旧所属：" : a.status === "current" ? "所属：" : "所属情報："}${escape(orgs.get(a.organizationId) || "不明")}${a.from || a.to ? `（${escape(a.from || "開始日不明")}〜${escape(a.to || "終了日不明")}）` : ""}</li>`).join("")}</ul>` : "<p>所属情報はありません。</p>"}${talent.activityStatus.value !== "unknown" ? `<p>${{ active: "活動中", hiatus: "活動休止", retired: "引退", ended: "活動終了" }[talent.activityStatus.value]}</p>` : ""}</details></section>`;
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
