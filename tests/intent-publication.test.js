"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
test("explicit history-name projection retains content but never exposes profile, affiliation, account or broken profile links", async () => {
  const { planIntent, projectedModels } = await import(
    "../admin/public/talent-actions.js"
  );
  const source = structuredClone(
      require("./fixtures/admin-vnext-baseline.json"),
    ),
    t = source.talents.talents[0];
  t.profileImage = { url: "/assets/private-fixture.png" };
  const plan = planIntent(source, [], [t.id], "hideHistory", {}, "main");
  const models = projectedModels(source, plan.operations),
    out = require("./fixtures/browser-site.cjs")(models, {
      "assets/private-fixture.png": "private fixture bytes",
    });
  assert(!fs.existsSync(path.join(out, "assets/private-fixture.png")));
  const people = JSON.parse(
    fs.readFileSync(path.join(out, "data/talents.json")),
  ).talents;
  assert.deepEqual(
    people.find((p) => p.id === t.id),
    { id: t.id, displayName: t.displayName, profileHidden: true },
  );
  assert(!fs.existsSync(path.join(out, "talents", t.id)));
  assert(
    !fs
      .readFileSync(path.join(out, "talents/index.html"), "utf8")
      .includes(t.displayName),
  );
  const event = fs.readFileSync(
    path.join(out, "anniversaries/index.html"),
    "utf8",
  );
  assert(event.includes(t.displayName));
  assert(!event.includes('href="/talents/' + t.id + '/"'));
  assert(
    !fs
      .readFileSync(path.join(out, "sitemap.xml"), "utf8")
      .includes("/talents/" + t.id + "/"),
  );
  assert(
    !fs
      .readFileSync(path.join(out, "data/stream-talents.json"), "utf8")
      .includes(t.id),
  );
  for (const person of source.talents.talents) {
    person.visibility = "draft";
    person.historyNamePublic = true;
  }
  const all = require("./fixtures/browser-site.cjs")(source, {
    "assets/private-fixture.png": "private fixture bytes",
  });
  assert.equal(
    fs.readdirSync(path.join(all, "talents")).filter((f) => f !== "index.html")
      .length,
    0,
  );
  assert(
    JSON.parse(
      fs.readFileSync(path.join(all, "data/talents.json")),
    ).talents.every(
      (p) => Object.keys(p).sort().join(",") === "displayName,id,profileHidden",
    ),
  );
});
test("private dependency closure is retained internally and absent from every published HTML/JSON", async () => {
  const { planIntent, projectedModels } = await import(
    "../admin/public/talent-actions.js"
  );
  const source = structuredClone(
      require("./fixtures/admin-vnext-baseline.json"),
    ),
    t = source.talents.talents[0];
  const plan = planIntent(source, [], [t.id], "hidePrivate", {}, "main"),
    models = projectedModels(source, plan.operations);
  require("../admin/src/validate.cjs")(models, source);
  const out = require("./fixtures/browser-site.cjs")(models);
  function scan(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) scan(p);
      else if (/\.(?:json|html|xml)$/.test(p)) {
        const text = fs.readFileSync(p, "utf8");
        assert(!text.includes(t.id), p);
        assert(!text.includes(t.displayName), p);
      }
    }
  }
  scan(out);
  assert.equal(models.goods.products.length, source.goods.products.length);
  assert.deepEqual(models.talents.talents[0].affiliations, t.affiliations);
});
