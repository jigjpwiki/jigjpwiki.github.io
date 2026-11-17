const ruleRoot=require('./fixtures/historical-root.cjs')();
"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  core = require("../assets/js/stream-core");
const person = {
  id: "tal-000001",
  accounts: [
    { service: "youtube", accountId: "UC" + "a".repeat(22) },
    { service: "twitch", accountId: "Login" },
  ],
};
const yt = {
  youtubeid: person.accounts[0].accountId,
  videoId: "abcDEFG1234",
  url: "https://www.youtube.com/watch?v=abcDEFG1234",
  date: "2026-11-16T00:00:00Z",
  status: "upcoming",
  title: "<img src=x>",
  thumbnail: "javascript:alert(1)",
};
const tw = {
  twitchid: "LOGIN",
  videoId: "123",
  url: "https://www.twitch.tv/videos/123",
  date: yt.date,
  status: "archive",
  title: "Twitch",
};
test("shared identity matches verified IDs only, normalizes Twitch case and refuses ambiguous ownership", () => {
  assert.equal(core.owner(yt, "youtube", [person]).id, person.id);
  assert.equal(core.owner(tw, "twitch", [person]).id, person.id);
  assert.equal(
    core.owner({ ...yt, youtubeid: null, name: "same" }, "youtube", [person]),
    null,
  );
  assert.equal(
    core.owner(yt, "youtube", [person, { ...person, id: "tal-000002" }]),
    null,
  );
  assert.equal(core.owner(yt, "youtube", [null, {}]), null);
  assert.equal(core.select({ ...person, accounts: [] }, [yt], [tw]).length, 0);
});
test("shared stream normalization validates URL/video identity, deduplicates and never infers live from the clock", () => {
  const rows = core.select(person, [yt, yt], [tw]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, "upcoming");
  assert.equal(rows[0].thumbnail, null);
  for (const row of [
    { ...yt, url: "https://evil.example/watch?v=abcDEFG1234" },
    { ...yt, url: "https://www.youtube.com/watch?v=wrong" },
    { ...yt, date: "bad" },
    { ...yt, status: "ended" },
    { ...yt, youtubeid: null },
  ])
    assert.equal(core.select(person, [row], []).length, 0);
  assert.equal(
    core.normalize(
      { ...tw, url: "https://www.twitch.tv/videos/999" },
      "twitch",
    ),
    null,
  );
  assert.equal(
    core.normalize(
      { ...tw, status: "live", url: "https://www.twitch.tv/login" },
      "twitch",
    ).status,
    "live",
  );
  assert.equal(core.select(person, null, {}).length, 0);
});
test("feed freshness depends on collection metadata, never the stream date or request time", () => {
  const now = Date.parse("2026-11-16T00:00:00Z");
  assert.equal(core.freshness("2026-11-15T22:00:00Z", now), "stale");
  assert.equal(core.freshness("2026-11-15T23:55:00Z", now), "recent");
  for (const value of [null, undefined, {}, "invalid", "2027-01-01T00:00:00Z"])
    assert.equal(core.freshness(value, now), "unknown");
});
test("public mapping is projected after private-master filtering without provenance or extra fields", () => {
  const { publicTalents } = require("../lib/talent-publication"),
    master = require("../lib/talents").loadTalents(ruleRoot);
  const hidden = structuredClone(master.talents[0]);
  hidden.visibility = "draft";
  const projected = publicTalents({
    ...master,
    talents: [hidden, ...master.talents.slice(1)],
  });
  const index = core.identityIndex(projected.talents);
  assert(!index.some((t) => t.id === hidden.id));
  assert.deepEqual(Object.keys(index[0]).sort(), [
    "accounts",
    "displayName",
    "id",
  ]);
  assert.deepEqual(Object.keys(index[0].accounts[0]).sort(), [
    "accountId",
    "service",
  ]);
  assert(!JSON.stringify(index).includes("sourceRefs"));
});
