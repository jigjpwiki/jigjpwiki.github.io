"use strict";
const historyName = (t) =>
  t.visibility === "draft" && t.historyNamePublic === true;
// A history identity is explicitly approved public content, never a private profile.
function publicTalents(master) {
  return {
    ...master,
    talents: master.talents.flatMap((t) =>
      t.visibility !== "draft"
        ? [t]
        : historyName(t)
          ? [{ id: t.id, displayName: t.displayName, profileHidden: true }]
          : [],
    ),
  };
}
function publicReferences(value, id, path = "") {
  if (value === id) return [path];
  if (!value || typeof value !== "object" || value.visibility === "draft")
    return [];
  return Object.entries(value).flatMap(([k, v]) =>
    publicReferences(v, id, path + "/" + k),
  );
}
function strings(v) {
  return typeof v === "string"
    ? [v]
    : v && typeof v === "object"
      ? Object.values(v).flatMap(strings)
      : [];
}
function publicStrings(v, path = "") {
  if (!v || typeof v !== "object" || v.visibility === "draft") return [];
  return Object.entries(v).flatMap(([k, x]) =>
    typeof x === "string"
      ? [[path + "/" + k, x]]
      : publicStrings(x, path + "/" + k),
  );
}
function assertPrivateUnreferenced(master, models) {
  for (const t of master.talents.filter(
    (t) => t.visibility === "draft" && !historyName(t),
  )) {
    const names = [
      t.displayName,
      ...(t.aliases?.map((a) => a.name) || []),
      ...(t.accounts?.flatMap((a) => [a.accountId, a.url]) || []),
      t.profileImage?.url,
      t.wiki?.url,
      t.officialProfileUrl,
    ].filter(Boolean);
    const paths = [
      ...models.flatMap((m) => publicReferences(m, t.id)),
      ...models
        .flatMap((m) => publicStrings(m))
        .filter(([p, value]) => names.some((n) => value.includes(n)))
        .map(([p]) => p),
    ];
    if (paths.length)
      throw Error(
        `${t.displayName}（${t.id}）: 公開停止の影響が未解決です。公開参照 ${paths[0]}。状態・掲載を変更から、公開履歴に名前を残すか関連情報を非公開にする方針を確認してください。`,
      );
  }
}
function publicFeed(rows, master) {
  if (!Array.isArray(rows)) throw Error("Public feed must be an array");
  const hidden = master.talents.filter((t) => t.visibility === "draft");
  return rows.filter(
    (row) =>
      !hidden.some((t) => {
        const account = t.accounts.some(
          (a) =>
            a.accountId &&
            (a.service === "youtube"
              ? [row.youtubeid, row.channelId].some((id) => id === a.accountId)
              : a.service === "twitch"
                ? typeof row.twitchid === "string" &&
                  row.twitchid.toLowerCase() === a.accountId.toLowerCase()
                : a.service === "tiktok"
                  ? row.tiktokid === a.accountId
                  : false),
        );
        // Remove an entire row; never rewrite a person's identity or infer a match.
        const names = [
          t.displayName,
          ...t.aliases.map((a) => a.name),
          t.profileImage?.url,
          t.wiki?.url,
          t.officialProfileUrl,
          ...t.accounts.map((a) => a.url),
        ].filter(Boolean);
        const text = strings(row);
        return (
          account ||
          (!t.historyNamePublic &&
            names.some((n) => n && text.some((value) => value.includes(n))))
        );
      }),
  );
}
function privateAssetPaths(master, approved, staticTexts = []) {
  const visible = strings(approved);
  return [
    ...new Set(
      master.talents
        .filter(
          (t) =>
            t.visibility === "draft" &&
            t.profileImage?.url.startsWith("/assets/"),
        )
        .map((t) => t.profileImage.url),
    ),
  ].filter(
    (url) =>
      !visible.includes(url) &&
      !staticTexts.some(
        (text) => text.includes(url) || text.includes(url.slice(1)),
      ),
  );
}
module.exports = {
  publicTalents,
  assertPrivateUnreferenced,
  publicReferences,
  publicFeed,
  privateAssetPaths,
  historyName,
};
