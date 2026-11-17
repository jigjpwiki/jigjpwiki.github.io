import test from "node:test";
import assert from "node:assert/strict";
import {
  snapshot,
  draft,
  op,
  input,
  plan,
  video,
  campaign,
} from "./content-fixtures.mjs";
import { preview } from "../src/model.mjs";
import {
  youtubeId,
  fromJst,
  jstInput,
  seconds,
  reorder,
} from "../public/content-utils.js";
const clone = structuredClone;
const untouched = (s, before) => assert.deepEqual(s.models, before);
test("anniversary create/edit validates dates, retains null birth year and unrelated masters", async () => {
  const s = snapshot(),
    before = clone(s.models),
    p = await plan(s, [
      op("anniversary", "ann", {
        title: "検証用誕生日",
        type: "birthday",
        talentIds: ["tal-000001"],
        date: { year: null, month: 8, day: 13 },
        visibility: "public",
      }),
    ]);
  assert.equal(
    p.files.anniversaries.events.length,
    before.anniversaries.events.length + 1,
  );
  assert.equal(p.files.anniversaries.events.at(-1).date.year, null);
  assert(!p.files.talents);
  untouched(s, before);
  const existing = clone(s.models.anniversaries.events[0]);
  existing.title += "（更新）";
  const edit = await plan(s, [
    { entity: "anniversary", key: "ann", id: existing.id, value: existing },
  ]);
  assert.deepEqual(
    edit.files.anniversaries.events.slice(1),
    before.anniversaries.events.slice(1),
  );
  for (const mutate of [
    (v) => (v.date.day = 32),
    (v) => (v.countYears = true),
    (v) => (v.talentIds = ["tal-999999"]),
    (v) => (v.title = "<img onerror=x>"),
  ]) {
    const v = clone(existing);
    mutate(v);
    if (v.title.startsWith("<img")) {
      const safe = await plan(s, [
        { entity: "anniversary", key: "ann", id: v.id, value: v },
      ]);
      assert(safe.files.anniversaries.events[0].title.startsWith("<img"));
    } else
      await assert.rejects(
        plan(s, [{ entity: "anniversary", key: "ann", id: v.id, value: v }]),
        /validation/,
      );
  }
});
test("Song identities are never matched by title and unresolved works remain draft", async () => {
  const s = snapshot();
  const unresolved = await plan(s, [op("song", "song", { title: "同名の曲" })]);
  assert.equal(unresolved.files.music.songs.at(-1).visibility, "draft");
  await assert.rejects(
    plan(s, [op("song", "song", { title: "同名の曲", visibility: "public" })]),
    /validation/,
  );
  const rows = [
    op("song", "song", {
      title: s.models.music.songs[0].title,
      identityUrl: "https://official.example/song-a",
      identityStatus: "verified",
      visibility: "public",
    }),
    op("song", "other", {
      title: s.models.music.songs[0].title,
      identityUrl: "https://official.example/song-b",
      identityStatus: "verified",
      visibility: "public",
    }),
  ];
  const p = await plan(s, rows);
  assert.equal(p.files.music.songs.length, s.models.music.songs.length + 2);
  assert.notEqual(p.files.music.songs.at(-1).id, p.files.music.songs.at(-2).id);
  rows[1].value.identityUrl = rows[0].value.identityUrl;
  await assert.rejects(plan(s, rows), /duplicate song identity/);
});
test("video/song references resolve atomically, reuse existing media and reject duplicate video registrations", async () => {
  const s = snapshot(),
    before = clone(s.models),
    v = video();
  const singer = "tal-000036";
  const mv = op("musicVideo", "mv", {
    youtubeId: "@video",
    songId: "song-000001",
    rawSongTitle: "検証曲",
    talentIds: [singer],
    visibility: "public",
  });
  const p = await plan(s, [v, mv]);
  assert.equal(p.files.media.videos.at(-1).youtubeId, "NEWVIDEO001");
  assert.equal(p.files.music.musicVideos.at(-1).youtubeId, "NEWVIDEO001");
  assert.equal(p.files.music.musicVideos.at(-1).songId, "song-000001");
  assert.deepEqual(p.files.media.videos.slice(0, -1), before.media.videos);
  untouched(s, before);
  const reuse = clone(
    s.models.media.videos.find(
      (v) =>
        !s.models.karaoke.karaokes.some((k) => k.youtubeId === v.youtubeId) &&
        !s.models.music.musicVideos.some((k) => k.youtubeId === v.youtubeId),
    ),
  );
  const reusePlan = await plan(s, [
    op("musicVideo", "reuse", {
      youtubeId: reuse.youtubeId,
      songId: null,
      rawSongTitle: "既存動画を選択",
      talentIds: [singer],
      visibility: "draft",
    }),
  ]);
  assert(!reusePlan.files.media);
  await assert.rejects(
    plan(s, [
      {
        ...v,
        value: { ...v.value, youtubeId: s.models.media.videos[0].youtubeId },
      },
    ]),
    /record_exists/,
  );
  await assert.rejects(
    plan(s, [v, mv, { ...mv, key: "duplicate" }]),
    /duplicate youtubeId/,
  );
});
test("karaoke plus setlist preserves unknown timestamps and uses the same Song across singers/archives", async () => {
  const s = snapshot(),
    v = video(),
    k = op("karaoke", "karaoke", {
      youtubeId: "@video",
      talentIds: ["tal-000036"],
      setlistStatus: "complete",
      expectedCount: 1,
      visibility: "public",
    }),
    p = op(
      "performance",
      "performance",
      {
        karaokeId: "@karaoke",
        songId: "song-000001",
        rawLabel: "同じ楽曲の別歌唱",
        order: 1,
        talentIds: ["tal-000036"],
        verification: "verified",
        visibility: "public",
      },
      { parent: { entity: "karaoke", reference: "@karaoke" } },
    );
  const result = await plan(s, [v, k, p]);
  assert.equal(result.files.karaoke.performances.at(-1).songId, "song-000001");
  assert.equal(result.files.karaoke.performances.at(-1).startsAtSeconds, null);
  assert(!result.files.music);
  for (const update of [
    (row) => (row.startsAtSeconds = 90),
    (row) => (row.endsAtSeconds = 10),
  ]) {
    const bad = clone(p);
    bad.value.startsAtSeconds = 30;
    bad.value.endsAtSeconds = 60;
    update(bad.value);
    await assert.rejects(plan(s, [v, k, bad]), /validation/);
  }
});
test("events and new slots get reserved IDs and retain unknown time precision", async () => {
  const s = snapshot(),
    e = op("event", "event", {
      title: "検証用リレー",
      type: "relay",
      summary: "検証用",
      announcementUrl: "https://official.example/relay",
      slots: [
        {
          title: "出演枠",
          starts: { precision: "unknown", value: null },
          ends: { precision: "unknown", value: null },
          talentIds: ["tal-000001"],
          videoIds: [],
          streamUrls: [],
        },
      ],
      visibility: "public",
    });
  const p = await plan(s, [e]),
    row = p.files.events.events.at(-1);
  assert.match(row.id, /^evt-/);
  assert.match(row.slots[0].id, /^slot-/);
  assert(p.files["feature-id-registry"].issued.includes(row.slots[0].id));
  assert.equal(row.starts.precision, "unknown");
  const staged = { ...s, models: { ...s.models, ...p.files } },
    edit = clone(row);
  edit.slots = [];
  await assert.rejects(
    plan(staged, [{ entity: "event", key: "edit", id: edit.id, value: edit }]),
    /slot_history/,
  );
});
test("Campaign plus multiple Products/Offers is atomic; existing campaigns, past records and IDs survive", async () => {
  const s = snapshot(),
    before = clone(s.models),
    rows = campaign();
  rows.push(
    op(
      "product",
      "second",
      { title: "2つ目の商品", talentIds: ["tal-000010"], visibility: "public" },
      { parent: { entity: "campaign", reference: "@campaign" } },
    ),
    op("offer", "second-offer", {
      productId: "@second",
      campaignId: "@campaign",
      url: "https://store.example/second",
      visibility: "public",
    }),
  );
  const p = await plan(s, rows);
  assert.equal(p.files.goods.products.length, before.goods.products.length + 2);
  assert.equal(
    p.files.goods.campaigns.length,
    before.goods.campaigns.length + 1,
  );
  assert.equal(p.files.goods.offers.length, before.goods.offers.length + 2);
  assert.deepEqual(
    p.files.goods.products.slice(0, before.goods.products.length),
    before.goods.products,
  );
  assert.deepEqual(
    p.files.goods.offers.slice(0, before.goods.offers.length),
    before.goods.offers,
  );
  untouched(s, before);
  const append = await plan(s, campaign("campaign-000001"));
  assert.deepEqual(append.files.goods.campaigns, before.goods.campaigns);
  const old = clone(
    s.models.goods.offers.find(
      (o) => o.endsAt && Date.parse(o.endsAt) < Date.now(),
    ),
  );
  old.periodNote = "履歴を保持して補足を更新";
  const history = await plan(s, [
    { entity: "offer", id: old.id, key: "history", value: old },
  ]);
  assert.equal(history.files.goods.offers.length, before.goods.offers.length);
  const bad = clone(rows);
  bad[2].value.url = "javascript:alert(1)";
  await assert.rejects(plan(s, bad), /validation/);
  untouched(s, before);
});
test("duplicate offers, wrong parent, forbidden ID assignment and unknown keys fail closed", async () => {
  const s = snapshot(),
    rows = campaign();
  await assert.rejects(
    plan(s, [...rows, { ...clone(rows[2]), key: "duplicate" }]),
    /duplicate_offer/,
  );
  const mismatch = clone(rows);
  mismatch[2].value.campaignId = "campaign-000002";
  await assert.rejects(plan(s, mismatch), /parent_relationship/);
  const injected = op("campaign", "injected", {
    id: "campaign-000001",
    title: "不正な再割当",
  });
  await assert.rejects(plan(s, [injected]), /stable_id/);
  await assert.rejects(
    plan(s, [{ ...rows[0], file: "data/talents.json" }]),
    /invalid_content/,
  );
  await assert.rejects(
    plan(s, [
      op("offer", "bad", {
        productId: "@missing",
        url: "https://store.example/",
      }),
    ]),
    /missing_batch/,
  );
  const confirm = await input(s, rows);
  confirm.value.operations[0].value.title += "変更";
  await assert.rejects(preview(s, confirm), /confirmation/);
});
test("reserved IDs and draft/public references remain protected", async () => {
  const s = snapshot();
  s.models["catalog-id-registry"].issued.push("ann-999998");
  const p = await plan(s, [
    op("anniversary", "ann", {
      title: "検証",
      talentIds: ["tal-000001"],
      date: { year: null, month: 8, day: 13 },
    }),
  ]);
  assert.equal(p.files.anniversaries.events.at(-1).id, "ann-999999");
  const rows = campaign();
  rows[0].value.visibility = "draft";
  await assert.rejects(plan(snapshot(), rows), /draft/);
  const hidden = snapshot();
  hidden.models.talents.talents.push({
    ...clone(hidden.models.talents.talents[0]),
    id: "tal-999999",
    accounts: [],
    visibility: "draft",
  });
  hidden.models["talent-id-registry"].issued.push({
    id: "tal-999999",
    youtubeChannelId: null,
    officialProfileUrl: hidden.models.talents.talents.at(-1).officialProfileUrl,
  });
  await assert.rejects(
    plan(hidden, [
      op("anniversary", "private", {
        title: "非公開参照",
        talentIds: ["tal-999999"],
        date: { year: null, month: 1, day: 1 },
        visibility: "public",
      }),
    ]),
    /validation/,
  );
});
test("URL extraction, JST round trips and timestamp editing never guess missing values", () => {
  for (const u of [
    "https://youtu.be/NEWVIDEO001?t=30",
    "https://www.youtube.com/watch?v=NEWVIDEO001",
    "https://www.youtube.com/live/NEWVIDEO001",
  ])
    assert.equal(youtubeId(u), "NEWVIDEO001");
  for (const u of [
    "https://youtube.com.evil.test/watch?v=NEWVIDEO001",
    "http://youtu.be/NEWVIDEO001",
    "https://youtube.com/watch?v=NEWVIDEO001&v=OTHERID0001",
    "https://youtube.com/@handle",
  ])
    assert.throws(() => youtubeId(u));
  for (const value of [
    "2026-12-31T23:59:59",
    "2027-01-01T00:00:00",
    "2028-02-29T10:00:00",
  ])
    assert.equal(jstInput(fromJst(value)), value);
  assert.throws(() => fromJst("2027-02-29T10:00:00"));
  assert.equal(fromJst(""), null);
  assert.equal(seconds("1:23:45"), 5025);
  assert.equal(seconds(""), null);
  assert.throws(() => seconds("10:99"));
  assert.deepEqual(reorder([1, 2, 3], 1, -1), [2, 1, 3]);
});

test("editing any content type changes only that record, never siblings, other masters or issued IDs", async () => {
  const cases = [
    ["anniversary", "anniversaries", "events", "title"],
    ["song", "music", "songs", "title"],
    ["musicVideo", "music", "musicVideos", "rawSongTitle"],
    ["karaoke", "karaoke", "karaokes", null],
    ["performance", "karaoke", "performances", "note"],
    ["event", "events", "events", "summary"],
    ["campaign", "goods", "campaigns", "title"],
    ["product", "goods", "products", "title"],
    ["offer", "goods", "offers", "periodNote"],
    ["video", "media", "videos", "title"],
  ];
  for (const [entity, file, list, field] of cases) {
    const s = snapshot(),
      before = clone(s.models),
      value = clone(before[file][list][0]),
      key = entity === "video" ? "youtubeId" : "id";
    if (field) value[field] = (value[field] || "") + "（編集fixture）";
    else {
      value.setlistStatus = "partial";
      value.expectedCount = null;
    }
    const result = await plan(s, [
      { entity, key: "edit", id: value[key], value },
    ]);
    assert.deepEqual(
      result.files[file][list].find((r) => r[key] === value[key]),
      value,
    );
    assert.deepEqual(
      result.files[file][list].filter((r) => r[key] !== value[key]),
      before[file][list].filter((r) => r[key] !== value[key]),
    );
    for (const [name, rows] of Object.entries(before[file]))
      if (name !== list) assert.deepEqual(result.files[file][name], rows);
    assert.deepEqual(
      Object.keys(result.files).sort(),
      [file, "admin-ledger"].sort(),
    );
    untouched(s, before);
  }
});
