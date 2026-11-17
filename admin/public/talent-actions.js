// Pure intent planning shared by UI tests. Never fetch/write or mutate input.
export const intentLabels = {
  start: "活動開始",
  pause: "活動休止",
  resume: "活動再開",
  retire: "引退",
  end: "活動終了",
  join: "事務所へ所属",
  leave: "事務所を退所",
  transfer: "事務所を移籍",
  groupJoin: "グループへ加入",
  groupLeave: "グループから脱退",
  publish: "プロフィールを掲載",
  hideHistory: "名前を公開履歴に残して非表示",
  hidePrivate: "関連情報も非公開",
};
export const types = {
  talent: ["talents", "talents"],
  group: ["catalog", "groups"],
  anniversary: ["anniversaries", "events"],
  event: ["events", "events"],
  song: ["music", "songs"],
  musicVideo: ["music", "musicVideos"],
  video: ["media", "videos"],
  karaoke: ["karaoke", "karaokes"],
  performance: ["karaoke", "performances"],
  campaign: ["goods", "campaigns"],
  product: ["goods", "products"],
  offer: ["goods", "offers"],
};
const clone = (v) => structuredClone(v);
export function projectedModels(models, ops) {
  const m = clone(models);
  for (const o of ops) {
    const def =
      types[o.entity] ||
      (o.entity === "organization" ? ["talents", "organizations"] : null);
    if (!def) continue;
    const rows = m[def[0]][def[1]],
      id =
        o.id ||
        (o.entity === "video" ? o.value.youtubeId : null) ||
        "@" + o.key,
      field = o.entity === "video" ? "youtubeId" : "id";
    const index = rows.findIndex((r) => r[field] === id),
      v = { ...clone(o.value), [field]: id };
    if (index < 0) rows.push(v);
    else rows[index] = v;
  }
  return m;
}
export function referencesTo(models, id) {
  const result = [];
  const contains = (v) =>
    v === id ||
    (!!v && typeof v === "object" && Object.values(v).some(contains));
  for (const [entity, [file, list]] of Object.entries(types)) {
    if (entity === "talent") continue;
    for (const r of models[file][list])
      if (contains(r))
        result.push({
          entity,
          id: r.id || r.youtubeId,
          title:
            r.title || r.name || r.rawLabel || r.rawSongTitle || r.youtubeId,
          public: r.visibility === "public",
          record: r,
        });
  }
  return result;
}
export function localIssues(models) {
  const errors = [];
  for (const t of models.talents.talents) {
    const current = (t.affiliations || []).filter(
      (a) => a.status === "current",
    );
    if (current.length && t.agencyStatus?.value !== "affiliated")
      errors.push({
        id: t.id,
        name: t.displayName,
        field: "所属状態",
        message:
          "所属中の事務所があります。「事務所を退所」か「事務所を移籍」で履歴と一緒に変更してください。",
      });
    if (!current.length && t.agencyStatus?.value === "affiliated")
      errors.push({
        id: t.id,
        name: t.displayName,
        field: "所属状態",
        message: "所属中の事務所を選択してください。",
      });
    if (t.visibility === "draft" && !t.historyNamePublic) {
      const sensitive = [
        t.displayName,
        ...(t.aliases || []).map((a) => a.name),
        ...(t.accounts || []).flatMap((a) => [a.accountId, a.url]),
      ].filter(Boolean);
      const strings = (v) =>
        typeof v === "string"
          ? [v]
          : v && typeof v === "object"
            ? Object.values(v).flatMap(strings)
            : [];
      const refs = referencesTo(models, t.id).filter((r) => r.public);
      for (const [entity, [file, list]] of Object.entries(types)) {
        if (entity === "talent") continue;
        for (const record of models[file][list])
          if (
            record.visibility === "public" &&
            strings(record).some((v) => sensitive.some((n) => v.includes(n))) &&
            !refs.some(
              (r) =>
                r.id === (record.id || record.youtubeId) && r.entity === entity,
            )
          )
            refs.push({
              entity,
              id: record.id || record.youtubeId,
              title:
                record.title ||
                record.name ||
                record.rawLabel ||
                record.youtubeId,
              public: true,
            });
      }

      if (refs.length)
        errors.push({
          id: t.id,
          name: t.displayName,
          field: "公開状態",
          message:
            "公開履歴が残っています。「状態・掲載を変更」で掲載方針を選んでください。自由文やアカウントの記載も確認してください。",
          references: refs,
        });
    }
  }
  return errors;
}
export function planIntent(
  models,
  operations,
  ids,
  intent,
  { organizationId, toOrganizationId, groupId, date = null } = {},
  baseCommit,
) {
  if (!ids.length) throw Error("タレントを選択してください。");
  if (!intentLabels[intent]) throw Error("操作を選択してください。");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw Error("日付は年月日で入力してください。");
  if (date) {
    const d = new Date(date + "T00:00:00Z");
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== date)
      throw Error("存在する日付を入力してください。");
  }
  const m = projectedModels(models, operations),
    before = clone(m),
    impact = [];
  const org = (id) => m.talents.organizations.some((o) => o.id === id);
  const end = (t, id) => {
    if (!id || !org(id))
      throw Error(
        "退所元の事務所を選択してください。複数所属は一括で終了しません。",
      );
    const rows = (t.affiliations || []).filter(
      (a) => a.status === "current" && (!id || a.organizationId === id),
    );
    if (!rows.length)
      throw Error(t.displayName + "：選択した事務所に現在所属していません。");
    for (const a of rows) {
      if (date && a.from && date < a.from)
        throw Error(t.displayName + "：退所日が所属開始日より前です。");
      a.status = "former";
      a.to = date;
    }
    (t.agencyStatus ??= {}).value = (t.affiliations || []).some(
      (a) => a.status === "current",
    )
      ? "affiliated"
      : "unknown";
  };
  for (const id of new Set(ids)) {
    const t = m.talents.talents.find((t) => t.id === id);
    if (!t) throw Error("選択したタレントが見つかりません：" + id);
    const activity = {
      start: "active",
      pause: "hiatus",
      resume: "active",
      retire: "retired",
      end: "ended",
    }[intent];
    if (activity) t.activityStatus = { ...t.activityStatus, value: activity };
    if (["join", "transfer"].includes(intent)) {
      const target = intent === "transfer" ? toOrganizationId : organizationId;
      if (!org(target)) throw Error("所属先の事務所を選択してください。");
      if (
        (t.affiliations || []).some(
          (a) => a.status === "current" && a.organizationId === target,
        )
      )
        throw Error(t.displayName + "：既にその事務所に所属しています。");
      if (intent === "transfer") end(t, organizationId);
      (t.affiliations ??= []).push({
        organizationId: target,
        status: "current",
        from: date,
        to: null,
      });
      (t.agencyStatus ??= {}).value = "affiliated";
    }
    if (intent === "leave") end(t, organizationId);
    if (["groupJoin", "groupLeave"].includes(intent)) {
      const g = m.catalog.groups.find((g) => g.id === groupId);
      if (!g) throw Error("グループを選択してください。");
      if (intent === "groupLeave" && (g.talentIds || []).includes(t.id))
        g.formerTalentIds = [...new Set([...(g.formerTalentIds || []), t.id])];
      g.talentIds =
        intent === "groupJoin"
          ? [...new Set([...(g.talentIds || []), t.id])]
          : (g.talentIds || []).filter((x) => x !== t.id);
    }
    if (intent === "publish") {
      t.visibility = "public";
      delete t.historyNamePublic;
    }
    if (["hideHistory", "hidePrivate"].includes(intent)) {
      t.visibility = "draft";
      if (intent === "hideHistory") t.historyNamePublic = true;
      else delete t.historyNamePublic;
      impact.push(...referencesTo(m, id));
    }
  }
  if (intent === "hidePrivate") {
    // Hide a dependency closure, retaining every original record and issued ID.
    const hidden = new Set(ids);
    let progress = true;
    while (progress) {
      progress = false;
      for (const [entity, [file, list]] of Object.entries(types)) {
        if (entity === "talent") continue;
        for (const r of m[file][list]) {
          if (r.visibility !== "public") continue;
          const values = JSON.stringify(r);
          const account =
            entity === "video" &&
            m.talents.talents
              .filter((t) => ids.includes(t.id))
              .some((t) =>
                (t.accounts || []).some(
                  (a) => a.service === "youtube" && a.accountId === r.channelId,
                ),
              );
          if (
            account ||
            (entity === "campaign" &&
              m.goods.offers.some(
                (o) => o.campaignId === r.id && hidden.has(o.id),
              ) &&
              m.goods.offers
                .filter((o) => o.campaignId === r.id)
                .every((o) => o.visibility === "draft")) ||
            [...hidden].some((id) => values.includes('"' + id + '"'))
          ) {
            r.visibility = "draft";
            hidden.add(r.id || r.youtubeId);
            impact.push({
              entity,
              id: r.id || r.youtubeId,
              title: r.title || r.name || r.rawLabel || r.youtubeId,
              public: true,
            });
            progress = true;
          }
        }
      }
    }
  }
  const signature = (e) =>
    JSON.stringify([
      e.id,
      e.field,
      e.message,
      (e.references || []).map((r) => [r.entity, r.id]),
    ]);
  const previousIssues = new Set(localIssues(before).map(signature));
  const problems = localIssues(m).filter(
    (e) => ids.includes(e.id) || !previousIssues.has(signature(e)),
  );
  if (problems.length)
    throw Error(
      problems
        .map(
          (e) =>
            `${e.name} / ${e.field}：${e.message} ${(e.references || []).map((r) => r.title + "（" + r.id + "）").join("・")}`,
        )
        .join("\n"),
    );
  const next = clone(operations),
    changes = [];
  for (const [entity, [file, list]] of Object.entries(types))
    for (const r of m[file][list]) {
      const field = entity === "video" ? "youtubeId" : "id",
        id = r[field],
        old = before[file][list].find((x) => x[field] === id);
      if (JSON.stringify(old) === JSON.stringify(r)) continue;
      const prior = next.find(
          (o) =>
            o.entity === entity &&
            (o.id ||
              (entity === "video" ? o.value.youtubeId : null) ||
              "@" + o.key) === id,
        ),
        raw = models[file][list].find((x) => x[field] === id);
      const value = clone(r);
      if (!raw && entity !== "video") delete value[field];
      if (!raw && entity === "video" && prior)
        value.youtubeId = prior.value.youtubeId;
      const op = {
        key: prior?.key || "intent-" + crypto.randomUUID(),
        entity,
        ...(raw ? { id } : {}),
        before: prior?.before ?? raw ?? null,
        baseCommit: prior?.baseCommit || baseCommit,
        value,
      };
      const index = next.findIndex((o) => o.key === op.key);
      if (index < 0) next.push(op);
      else next[index] = op;
      changes.push({
        entity,
        id,
        name: r.displayName || r.title || r.name || r.rawLabel || id,
        before: old,
        after: r,
      });
    }
  if (
    next.length > 120 ||
    new TextEncoder().encode(JSON.stringify(next)).length > 500000
  )
    throw Error(
      "下書きの上限を超えます。対象を分けてください。既存の下書きは保持しています。",
    );
  return {
    operations: next,
    changes,
    impact: [
      ...new Map(impact.map((r) => [r.entity + ":" + r.id, r])).values(),
    ],
  };
}
