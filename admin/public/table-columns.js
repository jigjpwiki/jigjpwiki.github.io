import { portrait } from "./controls.js";
import { enums } from "./content-fields.js";
export const states = {
  ...enums,
  active: "活動中",
  hiatus: "活動休止",
  retired: "引退",
  ended: "活動終了",
  affiliated: "所属中",
  unaffiliated: "未所属",
  unknown: "不明",
};
export const choices = (values) => values.map((v) => [v, states[v] || v]);
export const getPath = (r, path) => path.split(".").reduce((v, k) => v?.[k], r);
function setPath(r, path, value) {
  const keys = path.split("."),
    last = keys.pop();
  let o = r;
  for (const k of keys)
    o = o[k] ??= k === "price" ? { amount: null, currency: "JPY" } : {};
  o[last] = value;
}
export function column(key, label, { path = key, ...options } = {}) {
  return {
    key,
    label,
    get: (r) => getPath(r, path),
    set: (r, v) => setPath(r, path, v),
    ...options,
  };
}
const number = (raw) => {
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0)
    throw Error("0以上の数値を入力してください。");
  return n;
};
export function anniversaryDate(raw) {
  const m = /^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (!m)
    throw Error("月日をMM-DD、年が確認済みならYYYY-MM-DDで入力してください。");
  const year = m[1] ? +m[1] : null,
    month = +m[2],
    day = +m[3],
    d = new Date(0);
  d.setUTCFullYear(year ?? 2000, month - 1, day);
  if (
    (year !== null && year < 1) ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  )
    throw Error("存在する日付を入力してください。");
  return { year, month, day };
}
export function formatJst(value) {
  if (!value) return "未登録・不明";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        dateStyle: "short",
        timeStyle: "short",
      }).format(date)
    : "日時未入力・要確認";
}
export function columnsFor(entity, { models, forms, rowsFor = () => [] } = {}) {
  const talentNames = (ids) =>
    (ids || [])
      .map(
        (id) =>
          models.talents.talents.find((t) => t.id === id)?.displayName || id,
      )
      .join("・");
  const title = column(
    "title",
    entity === "talent"
      ? "表示名"
      : entity === "organization" || entity === "group"
        ? "名称"
        : "タイトル",
    {
      path:
        entity === "talent"
          ? "displayName"
          : entity === "organization" || entity === "group"
            ? "name"
            : entity === "performance"
              ? "rawLabel"
              : entity === "video"
                ? "title"
                : "title",
      width: 260,
    },
  );
  if (entity === "karaoke") {
    title.get = (r) =>
      rowsFor("video").find(
        (v) => v.youtubeId === r.youtubeId || v._reference === r.youtubeId,
      )?.title || r.youtubeId;
    delete title.set;
  }
  if (entity === "musicVideo") {
    title.get = (r) =>
      r.rawSongTitle ||
      rowsFor("video").find((v) => v.youtubeId === r.youtubeId)?.title ||
      r.youtubeId;
    title.set = (r, v) => (r.rawSongTitle = v);
  }
  if (entity === "offer") {
    title.get = (r) =>
      rowsFor("product").find((p) => (p._reference || p.id) === r.productId)
        ?.title || r.productId;
    delete title.set;
  }
  title.search = (r) =>
    [
      title.get(r),
      ...(r.aliases || []).map((a) => (typeof a === "string" ? a : a.name)),
      ...(r.readings || []),
    ].join(" ");
  const visibility = column("visibility", "公開状態", {
      options: choices(["public", "draft"]),
      filter: true,
      bulk: true,
      filterLabel: "公開状態",
    }),
    people = {
      key: "people",
      label: entity === "anniversary" ? "対象" : "関連VTuber",
      get: (r) => talentNames(r.talentIds),
      width: 180,
    };
  const columns = [title];
  const schema = forms?.schemas?.[entity],
    options = (key) => schema?.properties?.[key]?.enum;
  const enumColumn = (key, label, values) =>
    column(key, label, {
      options: choices(values || options(key) || []),
      filter: true,
      bulk: true,
    });
  if (entity === "talent") {
    columns.push(
      {
        key: "organization",
        label: "所属事務所",
        get: (r) =>
          (r.affiliations || [])
            .map(
              (a) =>
                (a.status === "former" ? "旧：" : "") +
                (models.talents.organizations.find(
                  (o) => o.id === a.organizationId,
                )?.name || "不明"),
            )
            .join("・"),
        width: 210,
      },
      enumColumn("activity", "活動状態", [
        "unknown",
        "active",
        "hiatus",
        "ended",
        "retired",
      ]),
      enumColumn("agency", "所属状態", [
        "unknown",
        "affiliated",
        "unaffiliated",
      ]),
    );
    columns.at(-2).get = (r) => r.activityStatus?.value;
    columns.at(-2).set = (r, v) => ((r.activityStatus ??= {}).value = v);
    columns.at(-1).get = (r) => r.agencyStatus?.value;
    columns.at(-1).set = (r, v) => ((r.agencyStatus ??= {}).value = v);
    columns.push(
      visibility,
      {
        key: "accounts",
        label: "公式アカウント",
        get: (r) =>
          (r.accounts || [])
            .map((a) => a.service + (a.accountId ? " ✓" : "（ID未登録）"))
            .join("・"),
      },
      {
        key: "image",
        label: "画像",
        get: (r) => (r.profileImage?.url ? "登録済み" : "未登録"),
        render: (r) => portrait(r.profileImage?.url, r.displayName),
        width: 80,
      },
    );
  } else if (entity === "organization")
    columns.push({
      key: "members",
      label: "現在所属人数",
      get: (r) =>
        models.talents.talents.filter((t) =>
          t.affiliations.some(
            (a) => a.organizationId === r.id && a.status === "current",
          ),
        ).length,
    });
  else if (entity === "group")
    columns.push(
      { key: "members", label: "メンバー数", get: (r) => r.talentIds.length },
      visibility,
    );
  else if (entity === "anniversary")
    columns.push(
      people,
      {
        ...column("date", "日付"),
        get: (r) =>
          (r.date.year ? r.date.year + "-" : "") +
          String(r.date.month).padStart(2, "0") +
          "-" +
          String(r.date.day).padStart(2, "0"),
        set: (r, v) => (r.date = v),
        parse: anniversaryDate,
        sort: (r) =>
          String(r.date.month).padStart(2, "0") +
          String(r.date.day).padStart(2, "0"),
        width: 160,
      },
      enumColumn("type", "種類"),
      visibility,
    );
  else if (entity === "event")
    columns.push(
      enumColumn("type", "種類"),
      {
        key: "starts",
        label: "開催日時（JST）",
        get: (r) =>
          r.starts?.precision === "instant"
            ? formatJst(r.starts.value)
            : r.starts?.value || "日時未定",
      },
      enumColumn("timing", "日時確認状態"),
      people,
      visibility,
      { key: "slots", label: "出演枠", get: (r) => r.slots?.length || 0 },
    );
  else if (entity === "campaign")
    columns.push(
      visibility,
      {
        key: "products",
        label: "商品数",
        get: (r) =>
          new Set(
            rowsFor("offer")
              .filter((o) => o.campaignId === (r._reference || r.id))
              .map((o) => o.productId),
          ).size,
      },
      {
        key: "sales",
        label: "販売状況",
        get: (r) =>
          window.Goods?.aggregate(
            rowsFor("offer").filter(
              (o) => o.campaignId === (r._reference || r.id),
            ),
          ).label || "未確認",
      },
    );
  else if (entity === "product")
    columns.push(people, visibility, {
      key: "offers",
      label: "販売情報",
      get: (r) =>
        rowsFor("offer").filter((o) => o.productId === (r._reference || r.id))
          .length,
    });
  else if (entity === "offer")
    columns.push(
      column("amount", "価格", {
        path: "price.amount",
        parse: number,
        type: "number",
        width: 120,
        bulk: true,
      }),
      column("url", "販売URL", { type: "url", width: 240 }),
      enumColumn("status", "販売状態"),
      visibility,
      {
        key: "period",
        label: "販売期間",
        get: (r) => [r.startsAt, r.endsAt].map(formatJst).join("〜"),
        hidden: true,
      },
    );
  else if (entity === "song")
    columns.push(
      {
        key: "artists",
        label: "原曲アーティスト",
        get: (r) => (r.originalArtists || []).join("・"),
      },
      enumColumn("identityStatus", "楽曲の同一性"),
      visibility,
    );
  else if (entity === "performance")
    columns.push(
      column("order", "曲順", { parse: number, type: "number" }),
      {
        key: "song",
        label: "対応楽曲",
        get: (r) =>
          rowsFor("song").find((s) => s.id === r.songId)?.title || "未確定",
      },
      column("startsAtSeconds", "開始（秒）", {
        parse: number,
        type: "number",
      }),
      enumColumn("verification", "確認状態"),
      visibility,
    );
  else {
    if (options("type")) columns.push(enumColumn("type", "種類"));
    if (entity === "karaoke")
      columns.push(enumColumn("setlistStatus", "セットリスト"));
    columns.push(people, visibility);
  }
  columns.push({
    key: "id",
    label: "固定ID",
    get: (r) => r.id || r.youtubeId || r._reference,
    width: 170,
    hidden: true,
  });
  return columns;
}

// Project the shared operations without conflating multiple unissued IDs.
export function overlayRows(records, operations, entity, field = "id") {
  const rows = structuredClone(records).map((r) => ({
    ...r,
    _reference: r[field],
  }));
  for (const op of operations.filter((o) => o.entity === entity)) {
    const reference = op.id || "@" + op.key,
      index = rows.findIndex((r) => r._reference === reference),
      value = { ...structuredClone(op.value), _reference: reference };
    if (index < 0) rows.push(value);
    else rows[index] = value;
  }
  return rows;
}
