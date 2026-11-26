"use strict";
const pages = Object.freeze([
  { path: "/", label: "配信スケジュール", ready: true },
  { path: "/talents/", label: "タレント一覧", ready: true },
  { path: "/anniversaries/", label: "記念日", ready: true },
  { path: "/music/", label: "音楽", ready: true },
  { path: "/events/", label: "イベント", ready: true },
  { path: "/goods/", label: "グッズ", ready: true },
]);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
// Small, local SVG icons; labels remain visible and provide the accessible names.
const navIcons = {
  "/": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-11 4h4m-4 3h2"/>',
  "/talents/": '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',
  "/anniversaries/": '<path d="M12 3v3m-5 3h10a2 2 0 0 1 2 2v3H5v-3a2 2 0 0 1 2-2ZM5 14h14v6H5zM3 20h18M5 16c2 2 4 2 7 0 3 2 5 2 7 0"/><path d="M12 3c-2 1-2 3 0 3"/>',
  "/music/": '<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="16" rx="3" ry="2"/>',
  "/events/": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-12 6 2 2 4-4"/>',
  "/goods/": '<path d="M4 8h16l1 13H3L4 8Zm4 2V7a4 4 0 0 1 8 0v3"/>',
};
function navigation(current) {
  return `<nav class="site-nav" aria-label="メインナビゲーション">${pages
    .filter((p) => p.ready)
    .map(
      (p) =>
        `<a href="${p.path}"${p.path === current ? ' aria-current="page"' : p.path !== "/" && current.startsWith(p.path) ? ' aria-current="location"' : ""}><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${navIcons[p.path]}</svg><span>${p.label}</span></a>`,
    )
    .join("")}</nav>`;
}
function applyNavigation(html, current) {
  if (!html.includes("<!-- jigdule:navigation -->"))
    throw new Error("Missing navigation slot");
  const mode = current === "/" ? "schedule" : ["/terms/", "/privacy-policy/"].includes(current) ? "legal" : "browse";
  const version = require("../data/release.json").version;
  let result = html
    .replace("<body>", '<body class="site-shell site-shell--' + mode + '"><a class="site-skip" href="#main-content">本文へ移動</a>')
    .replace("<header>", '<header class="site-header site-header--' + mode + '">')
    .replace(/<main(?=[\s>])([^>]*)>/, (_, attributes) => '<main' + attributes + (/\bid=/.test(attributes) ? '' : ' id="main-content"') + ' tabindex="-1">')
    .replace('/assets/navigation.css"', '/assets/navigation.css?v=' + version + '"')
    .replace("<!-- jigdule:navigation -->", navigation(current));
  if (mode !== "schedule") {
    const footer = '<footer class="site-footer"><span class="site-footer-name">じぐじゅーる<span>非公式ファンサイト</span></span><div class="site-footer-links"><a href="/privacy-policy/">プライバシーポリシー</a><a href="/terms/">利用規約</a><a href="https://wikiwiki.jp/jigjp/" rel="noreferrer">jig.jp非公式Wiki</a></div></footer>';
    result = /<footer>[\s\S]*?<\/footer>/.test(result)
      ? result.replace(/<footer>[\s\S]*?<\/footer>/, footer)
      : result.replace("</body>", footer + "</body>");
  }
  return result;
}
function talentCards(master, groups = []) {
  groups = groups.filter((g) => g.visibility !== "draft");
  const orgs = new Map(master.organizations.map((o) => [o.id, o.name]));
  const rows = master.talents
    .filter((t) => t.visibility !== "draft" && !t.profileHidden)
    .map((t, order) => {
      const current = [
        ...new Set(
          t.affiliations
            .filter((a) => a.status === "current")
            .map((a) => a.organizationId),
        ),
      ].filter((id) => orgs.has(id));
      const former = [
        ...new Set(
          t.affiliations
            .filter(
              (a) =>
                a.status === "former" && !current.includes(a.organizationId),
            )
            .map((a) => a.organizationId),
        ),
      ].filter((id) => orgs.has(id));
      const groupsFor = groups.filter((g) => g.talentIds.includes(t.id));
      const image = `<span class="talent-avatar" aria-hidden="true"><span>${escape([...t.displayName][0])}</span>${t.profileImage ? `<img src="${escape(t.profileImage.url)}" alt="" width="96" height="96" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}</span>`;
      const row = {
        id: t.id,
        order,
        name: t.displayName,
        aliases: t.aliases.map((a) => a.name),
        current,
        former,
        groups: groupsFor.map((g) => g.id),
        unaffiliated: t.agencyStatus.value === "unaffiliated",
        activity: t.activityStatus.value,
      };
      const html = `<li id="${t.id}" data-person="${escape(JSON.stringify(row))}"><a class="talent-card" href="/talents/${t.id}/" aria-labelledby="name-${t.id}">${image}<h3 id="name-${t.id}">${escape(t.displayName)}</h3><div class="affiliation">${current.map((id) => `<p>所属：${escape(orgs.get(id) || "所属不明")}</p>`).join("")}${former.map((id) => `<p>旧所属：${escape(orgs.get(id) || "所属不明")}</p>`).join("")}${!current.length ? (t.agencyStatus.value === "unaffiliated" ? (["ended","retired"].includes(t.activityStatus.value) ? "" : "<p>無所属</p>") : !former.length ? "<p>所属不明</p>" : "") : ""}</div>${["hiatus", "retired", "ended"].includes(t.activityStatus.value) ? `<p class="activity-label">${{ hiatus: "活動休止", retired: "引退", ended: "活動終了" }[t.activityStatus.value]}</p>` : ""}${groupsFor.map((g) => `<p class="group-label">${escape(g.name)}</p>`).join("")}</a></li>`;
      return { row, html };
    });
  const groupsSorted = require("../assets/js/talent-directory").arrange(
    rows.map((r) => r.row),
    master.organizations,
  );
  return (
    groupsSorted
      .map(
        (g) =>
          `<section class="agency-section" data-directory-section="${g.id}"><h2>${escape(g.name)}<span>${g.people.length}名</span></h2><ul class="talent-grid">${g.people.map((p) => rows.find((r) => r.row.id === p.id).html).join("")}</ul></section>`,
      )
      .join("") +
    `<script type="application/json" id="directory-data">${JSON.stringify({ organizations: master.organizations.map((o) => ({ id: o.id, name: o.name })), groups: groups.map((g) => ({ id: g.id, name: g.name })) }).replace(/</g, "\\u003c")}</script>`
  );
}
module.exports = { pages, escape, navigation, applyNavigation, talentCards };
