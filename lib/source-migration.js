"use strict";
// Explicit one-way legacy boundary. The active model has no source graph.
const names = [
  "talents",
  "catalog",
  "anniversaries",
  "goods",
  "events",
  "media",
  "music",
  "karaoke",
];
const provenanceNotes = new Set([
  "本人の公式動画説明欄のセットリスト表記を確認。原曲アーティストは配信者の表記。",
  "本人の公式動画説明欄の曲目・時刻表記を確認。アーティストは配信者の表記。",
]);
const removed = new Set([
  "sources",
  "sourceRefs",
  "displayNameSourceRefs",
  "artistEvidence",
  "verificationMethod",
  "identityEvidence",
]);
function withoutSources(value) {
  if (Array.isArray(value)) return value.map(withoutSources);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !removed.has(key) &&
            !(key === "checkedAt" && value.provider === "musicbrainz"),
        )
        .map(([key, item]) => [
          key,
          key === "note" && provenanceNotes.has(item)
            ? null
            : withoutSources(item),
        ]),
    );
  return value;
}
function migrateModels(input) {
  const models = structuredClone(input);
  for (const name of names)
    if (models[name]) {
      if (![1, 2].includes(models[name].schemaVersion))
        throw new Error("Unsupported master schema: " + name);
      const legacy = models[name].schemaVersion === 1;
      if (!legacy) continue;
      models[name] = withoutSources(models[name]);
      models[name].schemaVersion = 2;
      if (name === "talents" && legacy) {
        for (const talent of models.talents.talents) {
          const anchor = models["talent-id-registry"]?.issued.find(
            (row) => row.id === talent.id,
          );
          if (anchor?.officialProfileUrl)
            talent.officialProfileUrl = anchor.officialProfileUrl;
        }
      }
      if (name === "anniversaries" && legacy) {
        // Preserve the existing no-JS calendar, without the build clock or source metadata.
        const used = new Set(
          input.anniversaries.events.flatMap((row) => row.sourceRefs || []),
        );
        const dates = [
          ...(input.talents?.sources || []),
          ...(input.catalog?.sources || []),
        ]
          .filter((row) => used.has(row.id))
          .map((row) => Date.parse(row.checkedAt))
          .filter(Number.isFinite);
        models.anniversaries.fallbackDate = dates.length
          ? new Date(Math.max(...dates) + 9 * 3600000)
              .toISOString()
              .slice(0, 10)
          : "2000-01-01";
      }
    }
  if (models["admin-ledger"])
    models["admin-ledger"].entries = models["admin-ledger"].entries.map(
      ({ evidence, ...entry }) => entry,
    );
  return models;
}
module.exports = { names, withoutSources, migrateModels };
