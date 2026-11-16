"use strict";
// Read-only by default. --out writes a new review directory, never the checkout.
const fs = require("node:fs"),
  path = require("node:path"),
  cp = require("node:child_process"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { names, migrateModels } = require("../lib/source-migration");
const hash = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function readRef(ref) {
  if (!/^[a-zA-Z0-9][\w/.-]*$/.test(ref)) throw new Error("Invalid Git ref");
  const commit = cp
    .execFileSync("git", ["rev-parse", "--verify", ref + "^{commit}"], {
      encoding: "utf8",
    })
    .trim();
  const models = Object.fromEntries(
    [
      ...names,
      "talent-id-registry",
      "catalog-id-registry",
      "feature-id-registry",
    ].map((name) => [
      name,
      JSON.parse(
        cp.execFileSync("git", ["show", commit + ":data/" + name + ".json"], {
          maxBuffer: 8 * 1024 * 1024,
        }),
      ),
    ]),
  );
  models["admin-ledger"] = JSON.parse(
    cp.execFileSync("git", ["show", commit + ":ops/admin/ledger.json"]),
  );
  return { commit, models };
}
function validate(models) {
  const { validateTalents } = require("../lib/talents"),
    { validateCatalog, publicCatalog } = require("../lib/catalog"),
    { validateEvents } = require("../lib/feature-data"),
    { validateMusic } = require("../lib/music-data"),
    { validateKaraoke } = require("../lib/karaoke-data");
  const t = validateTalents(models.talents, {
    registry: models["talent-id-registry"],
  });
  const c = publicCatalog(
    validateCatalog(
      t,
      models.catalog,
      models.anniversaries,
      models.goods,
      models["catalog-id-registry"],
    ),
  );
  validateEvents(
    t,
    c,
    models.media,
    models.events,
    models["feature-id-registry"],
  );
  const music = validateMusic(
    t,
    c,
    models.media,
    models.music,
    models["feature-id-registry"],
  );
  const karaoke = validateKaraoke(
    music,
    models.karaoke,
    models["feature-id-registry"],
  );
  require("../lib/talent-publication").assertPrivateUnreferenced(t, [
    c,
    require("../lib/feature-data").projectEvents(
      validateEvents(t, c, models.media, models.events),
    ),
    require("../lib/music-data").projectMusic(music),
    require("../lib/karaoke-data").projectKaraoke(karaoke),
  ]);
  return true;
}
function compare(before, after) {
  assert.deepEqual(
    after,
    migrateModels(before),
    "Unexpected content/identity change during source migration",
  );
  const report = {
    masters: {},
    removedFields: {},
    sourceRecords: 0,
    contentUnchanged: true,
  };
  function scan(value) {
    if (Array.isArray(value)) value.forEach(scan);
    else if (value && typeof value === "object")
      for (const [key, item] of Object.entries(value)) {
        if (
          [
            "sources",
            "sourceRefs",
            "displayNameSourceRefs",
            "artistEvidence",
            "verificationMethod",
            "identityEvidence",
            "checkedAt",
            "evidence",
          ].includes(key)
        )
          report.removedFields[key] = (report.removedFields[key] || 0) + 1;
        scan(item);
      }
  }
  for (const name of names) {
    report.sourceRecords += (before[name].sources || []).length;
    scan(before[name]);
    const collections = {};
    for (const [key, rows] of Object.entries(before[name]))
      if (Array.isArray(rows) && key !== "sources") {
        assert.equal(rows.length, after[name][key].length);
        collections[key] = {
          before: rows.length,
          after: after[name][key].length,
          identityHash: hash(rows.map((row) => row.id || row.youtubeId)),
        };
      }
    report.masters[name] = {
      collections,
      beforeHash: hash(before[name]),
      afterHash: hash(after[name]),
    };
  }
  assert.deepEqual(before["talent-id-registry"], after["talent-id-registry"]);
  assert.deepEqual(before["catalog-id-registry"], after["catalog-id-registry"]);
  assert.deepEqual(before["feature-id-registry"], after["feature-id-registry"]);
  return report;
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2),
      refIndex = args.indexOf("--from-ref"),
      outIndex = args.indexOf("--out");
    if (
      refIndex < 0 ||
      !args[refIndex + 1] ||
      args.some(
        (a) =>
          a.startsWith("--") &&
          !["--from-ref", "--out", "--check-current"].includes(a),
      )
    )
      throw new Error(
        "Usage: node scripts/migrate-source-management.cjs --from-ref COMMIT [--check-current] [--out NEW_DIRECTORY]",
      );
    const { commit, models: before } = readRef(args[refIndex + 1]),
      after = migrateModels(before);
    validate(after);
    if (args.includes("--check-current"))
      for (const name of names)
        assert.deepEqual(
          JSON.parse(
            fs.readFileSync(path.join(__dirname, "../data", name + ".json")),
          ),
          after[name],
          name + " differs from migration",
        );
    const report = { base: commit, ...compare(before, after) };
    if (outIndex >= 0) {
      const out = path.resolve(args[outIndex + 1] || "");
      if (fs.existsSync(out)) throw new Error("Output must be a new directory");
      const temporary = fs.mkdtempSync(
        path.join(path.dirname(out), ".source-migration-"),
      );
      try {
        fs.mkdirSync(path.join(temporary, "data"));
        fs.mkdirSync(path.join(temporary, "ops/admin"), { recursive: true });
        for (const [name, value] of Object.entries(after))
          fs.writeFileSync(
            path.join(
              temporary,
              name === "admin-ledger"
                ? "ops/admin/ledger.json"
                : "data/" + name + ".json",
            ),
            JSON.stringify(value, null, 2) + "\n",
          );
        fs.writeFileSync(
          path.join(temporary, "report.json"),
          JSON.stringify(report, null, 2) + "\n",
        );
        fs.renameSync(temporary, out);
      } catch (error) {
        fs.rmSync(temporary, { recursive: true, force: true });
        throw error;
      }
    }
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error("Migration rejected: " + error.message);
    process.exitCode = 1;
  }
}
module.exports = { readRef, validate, compare };
