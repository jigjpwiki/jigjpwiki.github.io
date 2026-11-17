// Pure conversions shared by the form and its regression tests. No network requests.
export function youtubeId(value) {
  const s = String(value || "").trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error("YouTubeの動画URLを入力してください。");
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port)
    throw new Error("安全なHTTPSのYouTube URLが必要です。");
  const host = u.hostname.toLowerCase();
  let id;
  if (host === "youtu.be") id = u.pathname.slice(1);
  else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    if (u.pathname === "/watch" && u.searchParams.getAll("v").length === 1)
      id = u.searchParams.get("v");
    else id = /^\/(?:shorts|live|embed)\/([\w-]{11})$/.exec(u.pathname)?.[1];
  }
  if (!/^[\w-]{11}$/.test(id || ""))
    throw new Error(
      "11文字の動画IDを確認できません。チャンネルURLは使えません。",
    );
  return id;
}
export function jstInput(value) {
  return value
    ? new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 19)
    : "";
}
export function fromJst(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value))
    throw new Error("日本時間の日時を入力してください。");
  const full = value.length === 16 ? value + ":00" : value,
    d = new Date(full + "+09:00");
  if (!Number.isFinite(d.getTime()) || jstInput(d.toISOString()) !== full)
    throw new Error("存在する日時を入力してください。");
  return d.toISOString();
}
export function seconds(value) {
  if (String(value).trim() === "") return null;
  const s = String(value).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isSafeInteger(n)) throw new Error("秒数が大きすぎます。");
    return n;
  }
  const a = s.split(":");
  if (
    a.length < 2 ||
    a.length > 3 ||
    a.some((x) => !/^\d+$/.test(x)) ||
    a.slice(1).some((x) => Number(x) > 59)
  )
    throw new Error("秒数、mm:ss、hh:mm:ssで入力してください。");
  const n = a.reduce((n, x) => n * 60 + Number(x), 0);
  if (!Number.isSafeInteger(n)) throw new Error("秒数が大きすぎます。");
  return n;
}
export function initialContent(entity, schema) {
  function value(s, key) {
    if (key === "id" || key === "registeredAt") return undefined;
    if (s.anyOf?.some((x) => x.type === "null")) return null;
    if (s.enum)
      return s.enum.includes("draft")
        ? "draft"
        : s.enum.includes("unknown")
          ? "unknown"
          : s.enum[0];
    if (s.const !== undefined) return s.const;
    if (s.$ref) return { precision: "unknown", value: null };
    if (s.type === "object")
      return Object.fromEntries(
        (s.required || [])
          .map((k) => [k, value(s.properties[k], k)])
          .filter(([, v]) => v !== undefined),
      );
    if (s.type === "array") return [];
    if (s.type === "boolean") return false;
    if (["integer", "number"].includes(s.type)) return null;
    return "";
  }
  const record = value(schema);
  if (entity === "song") record.identityStatus = "unresolved";
  if (entity === "anniversary") record.recursYearly = true;
  return record;
}
export function reorder(records, index, delta) {
  const result = [...records],
    target = index + delta;
  if (target >= 0 && target < result.length)
    [result[index], result[target]] = [result[target], result[index]];
  return result;
}
