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
function navigation(current) {
  return `<nav class="site-nav" aria-label="メインナビゲーション">${pages
    .filter((p) => p.ready)
    .map(
      (p) =>
        `<a href="${p.path}"${p.path === current ? ' aria-current="page"' : p.path !== "/" && current.startsWith(p.path) ? ' aria-current="location"' : ""}>${p.label}</a>`,
    )
    .join("")}</nav>`;
}
function applyNavigation(html, current) {
  if (!html.includes("<!-- jigdule:navigation -->"))
    throw new Error("Missing navigation slot");
  return html.replace("<!-- jigdule:navigation -->", navigation(current));
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
      };
      const html = `<li id="${t.id}" data-person="${escape(JSON.stringify(row))}"><a class="talent-card" href="/talents/${t.id}/" aria-labelledby="name-${t.id}">${image}<h3 id="name-${t.id}">${escape(t.displayName)}</h3><div class="affiliation">${current.map((id) => `<p>所属：${escape(orgs.get(id) || "所属不明")}</p>`).join("")}${former.map((id) => `<p>旧所属：${escape(orgs.get(id) || "所属不明")}</p>`).join("")}${!current.length ? (t.agencyStatus.value === "unaffiliated" ? "<p>無所属</p>" : !former.length ? "<p>所属不明</p>" : "") : ""}</div>${["hiatus", "retired", "ended"].includes(t.activityStatus.value) ? `<p class="activity-label">${{ hiatus: "活動休止", retired: "引退", ended: "活動終了" }[t.activityStatus.value]}</p>` : ""}${groupsFor.map((g) => `<p class="group-label">${escape(g.name)}</p>`).join("")}</a></li>`;
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
