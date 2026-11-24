import { fail } from "./security.mjs";

export function collectedVideo(models, id) {
  const rows = (models.youtube || []).filter((row) => row.videoId === id);
  if (rows.length !== 1) fail(400, "cms_video_not_collected");
  const { youtubeid: channelId, title } = rows[0];
  if (!/^UC[\w-]{22}$/.test(channelId || "") || typeof title !== "string" || !title.trim())
    fail(400, "cms_video_not_collected");
  return {
    youtubeId: id, channelId, title, publishedAt: null, startedAt: null,
    endedAt: null, durationSeconds: null, availability: "public", visibility: "public",
  };
}

export function canEditSong(models, permissions, songId) {
  const related = [
    ...models.music.musicVideos.filter((row) => row.songId === songId).map((row) => ["musicVideo", row]),
    ...models.karaoke.performances.filter((row) => row.songId === songId).map((row) => ["performance", row]),
  ];
  return related.length > 0 && related.every(([entity, row]) => permissions.canRead(entity, row));
}

export function assertSongEdit(models, permissions, songId) {
  if (!canEditSong(models, permissions, songId)) fail(403, "cms_scope_denied");
}


// A new work is attached to a scoped song video or performance in the same batch.
export function newSongOperation(input, key) {
  const { newSongTitle: title, newSongArtist: artist, newSongUrl: url } = input;
  if (!title && !artist && !url) return null;
  if (input.songId || ![title, artist, url].every((part) => typeof part === "string" && part.trim()))
    fail(400, "cms_invalid_input");
  return { key, entity: "song", value: {
    title: title.trim(), originalArtists: [artist.trim()], identityUrl: url.trim(),
    aliases: [], readings: [], visibility: "public",
  } };
}

export function newSongFields(operation) {
  if (!operation) return {};
  return { songId: "", newSongTitle: operation.value.title, newSongUrl: operation.value.identityUrl,
    newSongArtist: operation.value.originalArtists[0] };
}
