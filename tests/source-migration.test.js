"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const {
  names,
  withoutSources,
  migrateModels,
} = require("../lib/source-migration");
const {
  validate,
  compare,
} = require("../scripts/migrate-source-management.cjs");
const current = Object.fromEntries(
  [
    ...names,
    "talent-id-registry",
    "catalog-id-registry",
    "feature-id-registry",
  ].map((name) => [name, require("./fixtures/admin-vnext-baseline.json")[name]]),
);
current["admin-ledger"] = require("./fixtures/admin-vnext-baseline.json")["admin-ledger"];
function legacy() {
  const models = structuredClone(current);
  for (const name of names) models[name].schemaVersion = 1;
  models.talents.sources = [
    {
      id: "src-fixture",
      kind: "official",
      url: "https://example.com/profile",
      checkedAt: "2026-11-15T00:00:00Z",
    },
  ];
  models.catalog.sources = [];
  models.media.sources = [];
  models.talents.talents[0].displayNameSourceRefs = ["src-fixture"];
  models.talents.talents[3].wiki.sourceRefs = ["src-fixture"];
  models.anniversaries.events[0].sourceRefs = ["src-fixture"];
  models["admin-ledger"].entries = [
    {
      id: "audit",
      actor: "123",
      reason: "変更理由",
      action: "save",
      at: "2026-11-15T00:00:00Z",
      evidence: {
        url: "https://example.com/",
        checkedAt: "2026-11-15T00:00:00Z",
      },
    },
  ];
  return models;
}
test("legacy source graphs migrate idempotently without losing any non-source values, IDs or registry reservations", () => {
  const before = legacy(),
    unchanged = structuredClone(before),
    after = migrateModels(before);
  assert.deepEqual(before, unchanged);
  assert.deepEqual(migrateModels(after), after);
  assert.doesNotThrow(() => validate(after));
  const report = compare(before, after);
  assert(report.contentUnchanged);
  for (const name of names) {
    const expected = withoutSources(before[name]);
    expected.schemaVersion = 2;
    if (name === "talents")
      for (const talent of expected.talents) {
        const anchor = before["talent-id-registry"].issued.find(
          (row) => row.id === talent.id,
        );
        if (anchor.officialProfileUrl)
          talent.officialProfileUrl = anchor.officialProfileUrl;
      }
    if (name === "anniversaries") expected.fallbackDate = "2026-11-15";
    assert.deepEqual(after[name], expected);
  }
  assert.equal(after["admin-ledger"].entries[0].actor, "123");
  assert(!("evidence" in after["admin-ledger"].entries[0]));
  const changed = structuredClone(after);
  changed.talents.talents[0].displayName += "意図しない変更";
  assert.throws(() => compare(before, changed));
});
test("source-free masters still reject invalid URLs/IDs/references/dates, private references and XSS URLs", () => {
  for (const mutate of [
    (m) => m.talents.talents.push(structuredClone(m.talents.talents[0])),
    (m) => (m.talents.talents[0].accounts[0].url = "javascript:alert(1)"),
    (m) => (m.talents.talents[0].accounts[0].accountId = "UCbad"),
    (m) => (m.talents.talents[0].affiliations[0].to = "2020-01-01"),
    (m) => (m.events.events[0].talentIds = ["tal-999999"]),
    (m) => (m.music.songs[0].identityUrl += "&t=1s"),
    (m) => (m.talents.talents[0].secret = "not-public"),
    (m) => (m.talents.talents[0].visibility = "draft"),
  ]) {
    const invalid = structuredClone(current);
    mutate(invalid);
    assert.throws(() => validate(invalid));
  }
  const wrongVersion = legacy();
  wrongVersion.talents.schemaVersion = 3;
  assert.throws(() => migrateModels(wrongVersion), /Unsupported/);
  // New-format data is not silently sanitized to conceal unexpected fields.
  const invalid = structuredClone(current);
  invalid.talents.talents[0].sourceRefs = [];
  assert.throws(
    () => validate(migrateModels(invalid)),
    /additional properties/,
  );
});
test("every active master and published catalog is free of dedicated source-management fields", () => {
  const forbidden = new Set([
    "sources",
    "sourceRefs",
    "displayNameSourceRefs",
    "artistEvidence",
    "verificationMethod",
    "identityEvidence",
  ]);
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      assert(!forbidden.has(key), key);
      assert(!/^src-/.test(typeof item === "string" ? item : ""));
      visit(item);
    }
  }
  names.forEach((name) => visit(current[name]));
  visit(current["admin-ledger"]);
  const schemaNames = [
    ...names,
    "feature-common",
    "registration",
    "catalog-registration",
  ];
  for (const name of schemaNames) {
    const schema = fs.readFileSync(
      path.join(__dirname, "../schemas/" + name + ".schema.json"),
      "utf8",
    );
    assert.doesNotMatch(
      schema,
      /sourceRefs|displayNameSourceRefs|"sources"|"checkedAt"/,
    );
  }
});
