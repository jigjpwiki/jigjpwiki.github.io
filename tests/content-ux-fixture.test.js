"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validateCatalog } = require("../lib/catalog");
test("content UX uses a complete frozen snapshot while coherent new talent/anniversary data still validates", () => {
  const base = require("./fixtures/admin-vnext-baseline.json");
  const fixture = require("./fixtures/content-ux.cjs")();
  assert.notEqual(fixture.root, path.resolve("_site"));
  const published = JSON.parse(fs.readFileSync(path.join(fixture.root, "data/anniversaries.json")));
  assert.deepEqual(published.events, fixture.catalog.events);
  assert.deepEqual(fixture.master, base.talents);
  const next = structuredClone(base);
  const id = "tal-999999";
  next.talents.talents.push({ ...structuredClone(next.talents.talents[0]), id, displayName: "追加人物fixture" });
  for (const [i, original] of base.anniversaries.events.slice(0, 2).entries()) {
    const ann = { ...structuredClone(original), id: `ann-${999998+i}`, talentIds: [id], groupIds: [] };
    next.anniversaries.events.push(ann);
    next["catalog-id-registry"].issued.push(ann.id);
  }
  const validate = talents => validateCatalog(talents, next.catalog, next.anniversaries, next.goods, next["catalog-id-registry"]);
  assert.doesNotThrow(() => validate(next.talents));
  // Negative control: keep the real missing-talent safeguard that caught PR #50.
  assert.throws(() => validate(base.talents), /Invalid catalog: missing talent/);
  assert.deepEqual(require("./fixtures/content-ux.cjs")().catalog, fixture.catalog);
});
