import { el, action, portrait } from "./controls.js";
const normalize = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja");
const collator = new Intl.Collator("ja");
export function personSections(rows, organizations) {
  const names = new Map(organizations.map((o) => [o.id, o.name])),
    sections = new Map(
      organizations.map((o) => [o.id, { id: o.id, name: o.name, rows: [] }]),
    );
  for (const [id, name] of [
    ["former", "旧所属のみ"],
    ["unaffiliated", "無所属"],
    ["unknown", "所属不明"],
  ])
    sections.set(id, { id, name, rows: [] });
  for (const r of rows) {
    const current =
        r.affiliations?.filter(
          (a) => a.status === "current" && names.has(a.organizationId),
        ) || [],
      former = r.affiliations?.some((a) => a.status === "former");
    const key =
      organizations.find((o) => current.some((a) => a.organizationId === o.id))
        ?.id ||
      (r.agencyStatus?.value === "unaffiliated"
        ? "unaffiliated"
        : former
          ? "former"
          : "unknown");
    sections.get(key).rows.push(r);
  }
  return [...sections.values()].filter((s) => s.rows.length);
}
export function mountRecordBrowser({
  container,
  rows,
  models,
  title,
  entity,
  columns = [],
  onOpen,
  onBulk,
  state = {},
}) {
  container.replaceChildren();
  const root = el("section", undefined, "record-browser stack"),
    bar = el("div", undefined, "inline toolbar"),
    search = el("input"),
    sort = el("select"),
    org = el("select"),
    kind = el("select"),
    person = el("select"),
    extra = el("select"),
    result = el("div", undefined, "stack"),
    count = el("p");
  search.type = "search";
  search.placeholder = "名前・タイトルで検索";
  search.setAttribute("aria-label", "名前・タイトルで検索");
  search.value = state.query || "";
  sort.setAttribute("aria-label", "並び順");
  sort.append(
    new Option(entity === "talent" ? "事務所別" : "登録順", "standard"),
    new Option("名前順", "name"),
  );
  if (entity === "talent") sort.append(new Option("登録順", "registration"));
  sort.value = state.sort || "standard";
  org.setAttribute("aria-label", "事務所（旧所属を含む）");
  org.append(new Option("すべての事務所", ""));
  models.talents.organizations.forEach((o) =>
    org.append(new Option(o.name, o.id)),
  );
  org.value = state.org || "";
  kind.setAttribute("aria-label", "公開状態で絞り込み");
  kind.append(
    new Option("すべての掲載状態", ""),
    new Option("公開", "public"),
    new Option("非公開", "draft"),
  );
  kind.value = state.visibility || "";
  person.setAttribute(
    "aria-label",
    entity === "talent" ? "所属グループ" : "人物で絞り込み",
  );
  person.append(
    new Option(entity === "talent" ? "すべてのグループ" : "すべての人物", ""),
  );
  (entity === "talent"
    ? models.catalog.groups
    : models.talents.talents
  ).forEach((r) => person.append(new Option(r.displayName || r.name, r.id)));
  person.value = state.person || "";
  const choices = columns.filter(
    (c) => c.filter && c.options && c.key !== "visibility",
  );
  extra.setAttribute("aria-label", "種類・状態");
  extra.append(new Option("すべての種類・状態", ""));
  for (const c of choices)
    for (const [v, n] of c.options)
      extra.append(new Option(c.label + "：" + n, c.key + ":" + v));
  extra.value = state.extra || "";
  const subjectIds = (r) => {
    const id = r.id || r._reference;
    if (entity === "organization")
      return models.talents.talents
        .filter((t) => t.affiliations.some((a) => a.organizationId === id))
        .map((t) => t.id);
    if (entity === "group")
      return [...(r.talentIds || []), ...(r.formerTalentIds || [])];
    if (entity === "song")
      return [...models.music.musicVideos, ...models.karaoke.performances]
        .filter((v) => v.songId === id)
        .flatMap((v) => v.talentIds);
    if (entity === "video")
      return [...models.music.musicVideos, ...models.karaoke.karaokes]
        .filter((v) => v.youtubeId === r.youtubeId)
        .flatMap((v) => v.talentIds);
    if (r.talentIds) return r.talentIds;
    if (entity === "campaign" || entity === "offer")
      return models.goods.products
        .filter((p) =>
          entity === "offer"
            ? p.id === r.productId
            : models.goods.offers.some(
                (o) => o.campaignId === id && o.productId === p.id,
              ),
        )
        .flatMap((p) => p.talentIds);
    return [];
  };
  const label = (r) =>
    r.displayName ||
    r.name ||
    r.title ||
    r.rawLabel ||
    r.rawSongTitle ||
    columns[0]?.get(r) ||
    r.youtubeId ||
    "未入力";
  let limit = 200;
  const draw = () => {
    Object.assign(state, {
      query: search.value,
      sort: sort.value,
      org: org.value,
      visibility: kind.value,
      person: person.value,
      extra: extra.value,
    });
    let data = rows().filter(
      (r) =>
        (!search.value ||
          normalize(
            [
              label(r),
              r.id || "",
              ...(r.aliases || []).map((a) =>
                typeof a === "string" ? a : a.name,
              ),
            ].join(" "),
          ).includes(normalize(search.value))) &&
        (!kind.value || (r.visibility || "public") === kind.value) &&
        (!person.value ||
          (entity === "talent"
            ? models.catalog.groups
                .find((g) => g.id === person.value)
                ?.talentIds.includes(r.id)
            : subjectIds(r).includes(person.value))) &&
        (!extra.value ||
          (() => {
            const [k, v] = extra.value.split(":");
            return String(choices.find((c) => c.key === k)?.get(r)) === v;
          })()) &&
        (!org.value ||
          r.affiliations?.some((a) => a.organizationId === org.value)),
    );
    if (sort.value === "name")
      data.sort((a, b) => collator.compare(label(a), label(b)));
    count.textContent = `${data.length}件 / 登録${rows().length}件`;
    const sections =
      entity === "talent" && sort.value === "standard"
        ? personSections(data, models.talents.organizations)
        : [{ name: search.value ? "検索結果" : title, rows: data }];
    result.replaceChildren();
    let shown = 0;
    for (const section of sections) {
      const part = el("section", undefined, "page-section stack"),
        list = el("ul", undefined, "record-list");
      part.append(el("h3", `${section.name}（${section.rows.length}）`), list);
      for (const r of section.rows) {
        if (shown++ >= limit) continue;
        const li = el("li"),
          button = action(
            "",
            () => {
              state.scroll = window.scrollY;
              onOpen(r);
            },
            "record-row",
          );
        button.setAttribute("aria-label", label(r));
        if (entity === "talent") {
          const face = portrait(r.profileImage?.url, label(r));
          face.querySelector("img")?.addEventListener("error", () => {
            face.querySelector("span").textContent = [...label(r)][0];
            face.setAttribute("aria-label", label(r) + "の画像はありません");
          });
          button.append(face);
        }
        const text = el("span", undefined, "record-copy");
        text.append(el("strong", label(r)));
        if (entity === "talent") {
          const names = (r.affiliations || []).map(
            (a) =>
              (a.status === "former" ? "旧：" : "") +
              (models.talents.organizations.find(
                (o) => o.id === a.organizationId,
              )?.name || "所属不明"),
          );
          const groups = models.catalog.groups
            .filter((g) => (g.talentIds || []).includes(r.id))
            .map((g) => g.name);
          text.append(
            el(
              "span",
              names.join("・") ||
                (r.agencyStatus?.value === "unaffiliated"
                  ? "無所属"
                  : "所属不明"),
            ),
          );
          if (groups.length) text.append(el("span", groups.join("・")));
          const states = {
            active: "活動中",
            hiatus: "休止",
            retired: "引退",
            ended: "活動終了",
            unknown: "活動状況不明",
          };
          text.append(
            el("span", states[r.activityStatus?.value] || "活動状況不明"),
          );
        } else {
          const summary = columns
            .filter(
              (c) =>
                !c.hidden && !["title", "id", "visibility"].includes(c.key),
            )
            .slice(0, 2)
            .map((c) => {
              try {
                const value = c.get(r);
                return (
                  c.label +
                  "：" +
                  (c.options?.find(([v]) => v === value)?.[1] ?? value)
                );
              } catch {
                return "未入力";
              }
            })
            .filter(Boolean)
            .join(" / ");
          if (summary) text.append(el("span", summary));
        }
        if (r.visibility === "draft")
          text.append(
            el(
              "small",
              r.historyNamePublic
                ? "プロフィール非表示・公開履歴あり"
                : "非公開",
            ),
          );
        button.append(text);
        li.append(button);
        list.append(li);
      }
      if (list.children.length) result.append(part);
    }
    if (!data.length) result.append(el("p", "該当する情報はありません。"));
    if (data.length > limit)
      result.append(
        action("続きを表示", () => {
          limit += 200;
          draw();
        }),
      );
  };
  bar.append(search);
  bar.append(
    action("条件を解除", () => {
      search.value = "";
      sort.value = "standard";
      org.value = "";
      kind.value = "";
      person.value = "";
      extra.value = "";
      draw();
    }),
    action("一括編集", onBulk),
  );
  const more = el("details"),
    summary = el("summary", "絞り込み・並び順"),
    fields = el("div", undefined, "inline");
  const field = (name, input) => {
    const label = el("label", undefined, "field-stack");
    label.append(el("span", name), input);
    return label;
  };
  fields.append(field("並び順", sort));
  if (entity === "talent") fields.append(field("事務所（旧所属を含む）", org));
  fields.append(
    field("公開状態", kind),
    field(entity === "talent" ? "所属グループ" : "人物", person),
  );
  if (choices.length) fields.append(field("種類・状態", extra));
  more.append(summary, fields);
  if (
    state.org ||
    state.visibility ||
    state.person ||
    state.extra ||
    (state.sort && state.sort !== "standard")
  )
    more.open = true;
  bar.insertBefore(more, bar.lastChild);
  root.append(bar, count, result);
  root.dataset.entity = entity;
  container.append(root);
  [search, sort, org, kind, person, extra].forEach((input) =>
    input.addEventListener(input === search ? "input" : "change", () => {
      limit = 200;
      draw();
    }),
  );
  draw();
  if (state.scroll)
    requestAnimationFrame(() => window.scrollTo(0, state.scroll));
  return { refresh: draw };
}
