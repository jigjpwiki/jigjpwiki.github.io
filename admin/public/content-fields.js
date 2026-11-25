import {
  el,
  action,
  textField,
  choice,
  namePicker,
  portrait,
  safeLink,
} from "./controls.js";
import {
  youtubeId,
  jstInput,
  fromJst,
  seconds,
  initialContent,
  reorder,
} from "./content-utils.js";
export const labels = {
  title: "タイトル",
  type: "種類",
  talentIds: "タレント",
  groupIds: "グループ",
  date: "記念日",
  month: "月",
  day: "日",
  year: "年（不明なら空欄）",
  recursYearly: "毎年繰り返す",
  countYears: "周年数を表示する",
  visibility: "公開状態",
  originalArtists: "原曲アーティスト",
  aliases: "別名",
  readings: "読み",
  identityUrl: "作品・商品の公式URL",
  identityStatus: "楽曲の同一性",
  identityAliases: "確認済みの同一作品URL",
  externalIds: "外部データベースID",
  rawSongTitle: "曲名（動画の表記）",
  songId: "対応する楽曲",
  youtubeId: "YouTube動画",
  registeredAt: "登録日時",
  channelId: "YouTubeチャンネル",
  publishedAt: "公開日時（JST）",
  startedAt: "配信開始日時（JST）",
  endedAt: "配信終了日時（JST）",
  durationSeconds: "動画の長さ（秒）",
  availability: "動画の視聴可否",
  setlistStatus: "セットリストの確認状態",
  expectedCount: "確認した全曲数（不明なら空欄）",
  karaokeId: "歌枠",
  order: "曲順（不明なら空欄）",
  startsAtSeconds: "歌唱開始（秒・mm:ss・hh:mm:ss）",
  endsAtSeconds: "歌唱終了（秒・mm:ss・hh:mm:ss）",
  rawLabel: "曲名・原文表記",
  note: "補足",
  verification: "歌唱内容の確認状態",
  starts: "開始日時",
  ends: "終了日時",
  precision: "日時の精度",
  timing: "日時の確認状態",
  lineupComplete: "出演者名簿が揃っている",
  organizerIds: "主催事務所",
  relatedOrganizationIds: "関連事務所",
  announcementUrl: "公式告知URL",
  thumbnailUrl: "イベントサムネイルURL（16:9・任意）",
  videoIds: "動画・アーカイブ",
  streamUrls: "配信URL",
  format: "開催形式",
  venue: "会場",
  fee: "料金",
  amount: "金額（不明なら空欄）",
  currency: "通貨",
  summary: "概要",
  slots: "出演枠",
  image: "商品画像URL",
  productId: "商品",
  campaignId: "キャンペーン",
  price: "価格",
  startsAt: "販売開始日時（JST）",
  endsAt: "販売終了日時（JST）",
  periodNote: "販売条件・補足",
  url: "販売・コンテンツURL",
  status: "販売状態",
  provider: "データベース",
  entityType: "レコードの種類",
  sourceUrl: "外部レコードURL",
  id: "固定ID",
};
export const enums = {
  public: "公開",
  draft: "非公開",
  birthday: "誕生日",
  debut: "デビュー",
  group: "グループ記念日",
  other: "その他",
  original: "オリジナル曲",
  cover: "歌ってみた",
  unresolved: "未確定",
  verified: "確認済み",
  unknown: "不明",
  unreviewed: "未確認",
  partial: "一部確認",
  complete: "全曲確認",
  rejected: "不採用",
  scheduled: "予定",
  actual: "実施日時",
  on_sale: "販売中（確認済み）",
  ended: "販売終了",
  sold_out: "売り切れ（確認時点）",
  concert: "ライブ・コンサート",
  relay: "歌枠リレー",
  reveal_3d: "3Dお披露目",
  anniversary_stream: "記念配信",
  special: "特別企画",
  online: "オンライン",
  onsite: "現地",
  hybrid: "オンライン・現地",
  unavailable: "視聴不可",
  instant: "時刻まで判明",
  date: "日付まで判明",
  month: "月まで判明",
};
const refTypes = {
  talentIds: "talent",
  groupIds: "group",
  organizerIds: "organization",
  relatedOrganizationIds: "organization",
  songId: "song",
  karaokeId: "karaoke",
  productId: "product",
  campaignId: "campaign",
  videoIds: "video",
};
export function fields({
  entity,
  record,
  schema,
  models,
  types,
  allRows,
  registry,
  changed,
  rerender,
}) {
  const render = (raw, key, object, path, required = false) => {
    const label =
      key === "id" && path.includes("/externalIds/")
        ? "外部レコードID"
        : labels[key] || key;
    let s = raw;
    if (s.$ref)
      s = {
        type: "object",
        properties: {
          precision: { enum: ["unknown", "month", "date", "instant"] },
          value: {},
        },
        time: true,
      };
    const nullable = Boolean(s.anyOf?.some((x) => x.type === "null"));
    if (s.anyOf) s = s.anyOf.find((x) => x.type !== "null") || s;
    const set = (value) => {
      if (value === "" && !required && !nullable) delete object[key];
      else object[key] = value;
      changed();
    };
    if (
      (key === "id" && !path.includes("/externalIds/")) ||
      key === "registeredAt"
    )
      return el(
        "p",
        object[key]
          ? `${label}：${object[key]}`
          : "保存時に安全なIDを発行します。",
        "field-hint",
      );
    const refs =
      refTypes[key] ||
      (key === "youtubeId" && entity !== "video"
        ? "video"
        : key === "channelId"
          ? "channel"
          : null);
    if (refs) {
      let rows;
      if (refs === "talent") rows = models.talents.talents;
      else if (refs === "group") rows = models.catalog.groups;
      else if (refs === "organization") rows = models.talents.organizations;
      else if (refs === "channel")
        rows = models.talents.talents.flatMap((t) =>
          t.accounts
            .filter((a) => a.service === "youtube" && a.accountId)
            .map((a) => ({ id: a.accountId, name: t.displayName })),
        );
      else
        rows = allRows(refs).map((r) => ({
          id: r._reference,
          name:
            refs === "song"
              ? `${r.title} / ${(r.originalArtists || []).join("・") || "原曲アーティスト不明"} / ${r.identityUrl || "同一性未確定"}`
              : refs === "video"
                ? `${r.title || "動画"} / ${r.youtubeId}`
                : r.title ||
                  r.rawSongTitle ||
                  r.rawLabel ||
                  r.youtubeId ||
                  r.id,
        }));
      const picker = namePicker(
        label,
        s.type === "array" ? object[key] || [] : object[key],
        rows,
        refs === "channel"
          ? (v) => {
              set(v);
              rerender();
            }
          : set,
        { multiple: s.type === "array", path, registry },
      );
      if (refs === "channel")
        picker.append(
          textField(
            "固定チャンネルID（確認済みの値）",
            object[key],
            set,
            path,
            registry,
          ),
        );
      return picker;
    }
    if (s.time) {
      const box = el("fieldset"),
        legend = el("legend", label);
      box.append(legend);
      const time = object[key] || { precision: "unknown", value: null };
      box.append(
        choice(
          label + "の精度",
          time.precision,
          ["unknown", "month", "date", "instant"].map((x) => [x, enums[x]]),
          (precision) => {
            object[key] = {
              precision,
              value: precision === "unknown" ? null : "",
            };
            changed();
            rerender();
          },
          path + "/precision",
          registry,
        ),
      );
      if (time.precision !== "unknown") {
        const type =
          time.precision === "instant" ? "datetime-local" : time.precision;
        const field = textField(
            label + (type === "datetime-local" ? "（JST）" : ""),
            type === "datetime-local" ? jstInput(time.value) : time.value,
            (value) => {
              try {
                time.value = type === "datetime-local" ? fromJst(value) : value;
                input.setCustomValidity("");
                changed();
              } catch (e) {
                input.setCustomValidity(e.message);
              }
            },
            path + "/value",
            registry,
            type,
          ),
          input = field.querySelector("input");
        input.required = true;
        if (type === "datetime-local") input.step = "1";
        box.append(field);
      }
      return box;
    }
    if (s.type === "object") {
      const box = el("fieldset");
      box.append(el("legend", label));
      const value = object[key] || {};
      for (const [k, v] of Object.entries(s.properties || {}))
        box.append(
          render(v, k, value, path + "/" + k, (s.required || []).includes(k)),
        );
      return box;
    }
    if (s.type === "array") {
      const box = el("fieldset");
      box.append(el("legend", label));
      const rows = object[key] || [];
      rows.forEach((row, i) => {
        const card = el("article", undefined, "array-card");
        card.append(el("h4", row?.title || row?.name || `${label} ${i + 1}`));
        if (s.items.type === "object")
          for (const [k, v] of Object.entries(s.items.properties))
            card.append(
              render(
                v,
                k,
                row,
                path + "/" + i + "/" + k,
                (s.items.required || []).includes(k),
              ),
            );
        else
          card.append(
            textField(
              label + " " + (i + 1),
              row,
              (value) => {
                rows[i] = value;
                set(rows);
              },
              path + "/" + i,
              registry,
            ),
          );
        const protectedSlot = key === "slots" && Boolean(row.id);
        if (!protectedSlot)
          card.append(
            action(`${row?.title || label + " " + (i + 1)}を削除`, () => {
              const next = rows.filter((_, n) => n !== i);
              set(nullable && !next.length ? null : next);
              rerender();
            }),
          );
        if (i > 0)
          card.append(
            action(`${label} ${i + 1}を上へ`, () => {
              set(reorder(rows, i, -1));
              rerender();
            }),
          );
        if (i + 1 < rows.length)
          card.append(
            action(`${label} ${i + 1}を下へ`, () => {
              set(reorder(rows, i, 1));
              rerender();
            }),
          );
        box.append(card);
      });
      box.append(
        action(label + "を追加", () => {
          const v =
            s.items.type === "object" ? initialContent("", s.items) : "";
          set([...rows, v]);
          rerender();
        }),
      );
      return box;
    }
    if (s.enum || s.const !== undefined) {
      const list = s.enum || [s.const];
      return choice(
        label,
        object[key],
        nullable
          ? [["", "不明"], ...list.map((v) => [v, enums[v] || v])]
          : list.map((v) => [v, enums[v] || v]),
        (v) => set(v === "" && nullable ? null : v),
        path,
        registry,
      );
    }
    if (s.type === "boolean")
      return choice(
        label,
        object[key] ? "yes" : "no",
        [
          ["yes", "はい"],
          ["no", "いいえ"],
        ],
        (v) => set(v === "yes"),
        path,
        registry,
      );
    let type = ["number", "integer"].includes(s.type)
      ? "number"
      : /^(publishedAt|startedAt|endedAt|startsAt|endsAt)$/.test(key)
        ? "datetime-local"
        : /Url$|^(url|image)$/.test(key)
          ? "url"
          : "text";
    const value =
      type === "datetime-local" ? jstInput(object[key]) : object[key];
    const field = textField(
        label + (required && !nullable ? "（必須）" : ""),
        value,
        (v) => {
          try {
            let result = v;
            if (type === "datetime-local") result = fromJst(v);
            else if (["startsAtSeconds", "endsAtSeconds"].includes(key))
              result = seconds(v);
            else if (key === "youtubeId") result = v ? youtubeId(v) : "";
            else if (type === "number") result = v === "" ? null : Number(v);
            else if (v === "" && nullable) result = null;
            set(result);
            if (entity === "song" && key === "identityUrl") {
              record.identityStatus = result ? "verified" : "unresolved";
              if (!result) record.visibility = "draft";
            }
            input.setCustomValidity("");
            if (key === "image")
              preview.replaceChildren(portrait(result, "商品画像"));
          } catch (e) {
            set(v);
            input.setCustomValidity(e.message);
          }
        },
        path,
        registry,
        type,
      ),
      input = field.querySelector("input");
    input.required = required && !nullable;
    input.placeholder = nullable ? "不明・未登録なら空欄" : "";
    if (["startsAtSeconds", "endsAtSeconds"].includes(key)) {
      input.type = "text";
      input.placeholder = "例：01:23:45／不明なら空欄";
    }
    if (type === "number") {
      input.step = s.type === "integer" ? "1" : "any";
      if (s.minimum !== undefined) input.min = s.minimum;
      if (s.maximum !== undefined) input.max = s.maximum;
    }
    if (type === "datetime-local") input.step = "1";
    const preview = el("div");
    if (key === "image") {
      preview.append(portrait(object[key], "商品画像"));
      field.append(preview);
    } else if (type === "url" && object[key])
      field.append(safeLink("リンクを確認", object[key]));
    if (key === "image") {
      input.type = "text";
      input.placeholder = "https://… または /assets/…";
    }
    if (key === "youtubeId")
      input.placeholder = "https://www.youtube.com/watch?v=…";
    return field;
  };
  const groups = { basic: [], people: [], details: [] };
  for (const [key, s] of Object.entries(schema.properties)) {
    if (key === "id" || key === "registeredAt") continue;
    const tab = [
      "talentIds",
      "groupIds",
      "organizerIds",
      "relatedOrganizationIds",
    ].includes(key)
      ? "people"
      : [
            "aliases",
            "readings",
            "identityAliases",
            "externalIds",
            "publishedAt",
            "startedAt",
            "endedAt",
            "durationSeconds",
            "availability",
            "slots",
            "streamUrls",
            "videoIds",
            "fee",
            "summary",
            "venue",
            "note",
            "periodNote",
            "channelId",
          ].includes(key)
        ? "details"
        : "basic";
    groups[tab].push(() =>
      render(s, key, record, "/" + key, (schema.required || []).includes(key)),
    );
  }
  return groups;
}
