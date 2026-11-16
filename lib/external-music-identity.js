"use strict";
const { identities } = require("./song-identity");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const types = ["work", "recording", "release-group", "artist"];
function externalKey(ref) {
  if (
    ref.provider !== "musicbrainz" ||
    !types.includes(ref.entityType) ||
    !UUID.test(ref.id) ||
    ref.status !== "verified" ||
    ref.sourceUrl !== `https://musicbrainz.org/${ref.entityType}/${ref.id}`
  )
    throw new Error("Invalid verified external reference");
  return ref.entityType + ":" + ref.id;
}
function validateExternal(songs) {
  const seen = new Map();
  for (const song of songs) {
    const local = new Set();
    for (const ref of song.externalIds || []) {
      const key = externalKey(ref);
      if (local.has(key)) throw new Error("Duplicate external reference");
      local.add(key);
      if (["work", "recording"].includes(ref.entityType)) {
        if (seen.has(key) && seen.get(key) !== song.id)
          throw new Error("Conflicting external Song identity");
        seen.set(key, song.id);
      }
    }
  }
}
function resolveExternal(song, songs) {
  const ids = (song.externalIds || [])
    .filter((r) => ["work", "recording"].includes(r.entityType))
    .map(externalKey);
  const matches = songs.filter((s) =>
    (s.externalIds || []).some((r) => ids.includes(externalKey(r))),
  );
  if (matches.length > 1) throw new Error("Ambiguous external identity");
  const match = matches[0];
  if (match && !identities(match).some((u) => identities(song).includes(u)))
    throw new Error("External match needs reviewed official canonical alias");
  return match || null;
}
module.exports = { externalKey, validateExternal, resolveExternal };
