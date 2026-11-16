// Editing state is detached from both the loaded master and saved nullable values.
export function createDraft(record) {
  const original = structuredClone(record),
    value = structuredClone(record),
    retained = new Map();
  for (const key of ["wiki", "profileImage"])
    if (value[key]) retained.set(key, structuredClone(value[key]));
  return {
    original,
    value,
    sources: [],
    get dirty() {
      return (
        JSON.stringify(original) !== JSON.stringify(value) ||
        this.sources.length > 0
      );
    },
    optionalUrl(key, url) {
      if (!url.trim()) {
        if (value[key]) retained.set(key, structuredClone(value[key]));
        value[key] = null;
        return;
      }
      value[key] = {
        ...(value[key] ||
          structuredClone(retained.get(key) || { sourceRefs: [] })),
        url,
      };
      retained.set(key, structuredClone(value[key]));
    },
    optionalValue(key) {
      return structuredClone(
        value[key] || retained.get(key) || { url: "", sourceRefs: [] },
      );
    },
    setOptionalRefs(key, refs) {
      const saved = value[key] ||
        retained.get(key) || { url: "", sourceRefs: [] };
      saved.sourceRefs = [...refs];
      retained.set(key, structuredClone(saved));
    },
    payload() {
      return structuredClone(value);
    },
  };
}
export function fieldChanges(before, after, path = "") {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (path === "/profileImage")
    return [
      {
        path,
        before,
        after,
        kind:
          before === undefined || before === null
            ? "追加"
            : after === undefined || after === null
              ? "削除"
              : "変更",
      },
    ];
  if (
    (before == null ||
      (typeof before === "object" && !Array.isArray(before))) &&
    after &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  )
    return [
      ...new Set([...Object.keys(before || {}), ...Object.keys(after)]),
    ].flatMap((k) => fieldChanges(before?.[k], after[k], path + "/" + k));
  return [
    {
      path,
      before,
      after,
      kind:
        before === undefined || before === null
          ? "追加"
          : after === undefined || after === null
            ? "削除"
            : "変更",
    },
  ];
}
const fieldNames = {
  service: "サービス",
  accountId: "アカウントID",
  type: "種類",
  reason: "変更理由",
  evidence: "確認した公式出典",
  displayName: "表示名",
  profileImage: "プロフィール画像",
  url: "URL",
  sourceRefs: "出典",
  displayNameSourceRefs: "名前の出典",
  wiki: "非公式Wiki",
  aliases: "別名",
  affiliations: "所属履歴",
  agencyStatus: "事務所所属状態",
  activityStatus: "VTuber活動状態",
  accounts: "SNS・公式アカウント",
  name: "名前",
  status: "状態",
  from: "開始日",
  to: "終了日",
  value: "状態",
  organizationId: "事務所",
  talentIds: "メンバー",
  membersComplete: "名簿の確認",
  visibility: "掲載状態",
  id: "内部ID",
};
export const fieldLabel = (path) =>
  path
    .split("/")
    .filter(Boolean)
    .map((k) => (/^\d+$/.test(k) ? `${Number(k) + 1}件目` : fieldNames[k] || k))
    .join(" / ");
export const tabFor = (path) =>
  /^\/(affiliations|agencyStatus|activityStatus)/.test(path)
    ? "affiliation"
    : /^\/(accounts|wiki)/.test(path)
      ? "links"
      : "basic";
export function validationIssues(message, models, selectedId) {
  const matches = [
    ...String(message).matchAll(
      /(?:data)?\/(talents|organizations|groups)\/(\d+)(\/[\w/~0-9-]+)?\s+([^;]+)/g,
    ),
  ];
  const issues = matches.map((m) => {
    const rows =
        m[1] === "groups" ? models.catalog.groups : models.talents[m[1]],
      row = rows[Number(m[2])],
      path =
        (m[3] || "") +
        (m[4].match(/required property '([^']+)'/)
          ? "/" + m[4].match(/required property '([^']+)'/)[1]
          : "");
    return {
      path,
      recordId: row?.id,
      recordName: row?.displayName || row?.name || "新規登録",
      external: !!row && row.id !== selectedId,
      tab: tabFor(path),
      message: m[4].includes("fewer than")
        ? /sourceRefs|displayNameSourceRefs/.test(path)
          ? "出典を1件以上選択してください。"
          : "1件以上登録してください。"
        : m[4].includes("required property")
          ? "必須項目を入力してください。"
          : m[4].includes("format")
            ? "URLまたは日付の形式を確認してください。"
            : "入力内容を確認してください。",
    };
  });
  return issues.length
    ? issues.filter(
        (issue, i) =>
          !issues.some(
            (other, j) =>
              i !== j &&
              other.recordId === issue.recordId &&
              other.path.startsWith(issue.path + "/"),
          ),
      )
    : [{ path: "", message: String(message), external: false }];
}
