import anniversary from "../../schemas/anniversaries.schema.json" with { type: "json" };
import goods from "../../schemas/goods.schema.json" with { type: "json" };
import music from "../../schemas/music.schema.json" with { type: "json" };
import karaoke from "../../schemas/karaoke.schema.json" with { type: "json" };
import events from "../../schemas/events.schema.json" with { type: "json" };
import media from "../../schemas/media.schema.json" with { type: "json" };
import common from "../../schemas/feature-common.schema.json" with { type: "json" };
export const contentTypes = {
  anniversary: {
    file: "anniversaries",
    list: "events",
    prefix: "ann",
    registry: "catalog-id-registry",
    label: "記念日",
    category: "anniversaries",
  },
  song: {
    file: "music",
    list: "songs",
    prefix: "song",
    registry: "feature-id-registry",
    label: "楽曲",
    category: "music",
  },
  musicVideo: {
    file: "music",
    list: "musicVideos",
    prefix: "mv",
    registry: "feature-id-registry",
    label: "歌動画",
    category: "music",
  },
  video: {
    file: "media",
    list: "videos",
    field: "youtubeId",
    label: "動画情報",
    category: "music",
  },
  karaoke: {
    file: "karaoke",
    list: "karaokes",
    prefix: "karaoke",
    registry: "feature-id-registry",
    label: "歌枠",
    category: "music",
  },
  performance: {
    file: "karaoke",
    list: "performances",
    prefix: "perf",
    registry: "feature-id-registry",
    label: "歌唱記録",
    category: "music",
  },
  event: {
    file: "events",
    list: "events",
    prefix: "evt",
    registry: "feature-id-registry",
    label: "イベント",
    category: "events",
  },
  campaign: {
    file: "goods",
    list: "campaigns",
    prefix: "campaign",
    registry: "catalog-id-registry",
    label: "キャンペーン",
    category: "goods",
  },
  product: {
    file: "goods",
    list: "products",
    prefix: "product",
    registry: "catalog-id-registry",
    label: "商品",
    category: "goods",
  },
  offer: {
    file: "goods",
    list: "offers",
    prefix: "offer",
    registry: "catalog-id-registry",
    label: "販売情報",
    category: "goods",
  },
};
const schemas = {
  anniversaries: anniversary,
  goods,
  music,
  karaoke,
  events,
  media,
};
export const contentForms = {
  types: contentTypes,
  schemas: Object.fromEntries(
    Object.entries(contentTypes).map(([k, v]) => [
      k,
      schemas[v.file].properties[v.list].items,
    ]),
  ),
  time: common.definitions.time,
};
