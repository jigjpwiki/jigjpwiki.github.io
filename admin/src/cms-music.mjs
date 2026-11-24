import { fail } from "./security.mjs";

export function collectedVideo(models, id) {
  const rows = (models.youtube || []).filter((row) => row.videoId === id);
  if (rows.length !== 1) return null;
  const { youtubeid: channelId, title } = rows[0];
  if (!/^UC[\w-]{22}$/.test(channelId || "") || typeof title !== "string" || !title.trim())
    return null;
  return {
    youtubeId: id, channelId, title, publishedAt: null, startedAt: null,
    endedAt: null, durationSeconds: null, availability: "public", visibility: "public",
  };
}

export function youtubeVideoLookup(apiKey, transport = fetch) {
  if (!apiKey) return undefined;
  return async (id) => {
    if (!/^[\w-]{11}$/.test(id)) fail(400, "cms_invalid_video_url");
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.search = new URLSearchParams({
      part: "snippet,status", id, fields: "items(id,snippet(channelId,title,publishedAt),status(privacyStatus))",
    });
    let items;
    try {
      const response = await transport(url, {
        headers: { "X-Goog-Api-Key": apiKey },
        signal: AbortSignal.timeout(8000), redirect: "error", cache: "no-store",
      });
      if (!response.ok) fail(503, "cms_video_lookup_unavailable");
      ({ items } = await response.json());
      if (!Array.isArray(items)) fail(503, "cms_video_lookup_unavailable");
    } catch {
      fail(503, "cms_video_lookup_unavailable");
    }
    const row = items.length === 1 ? items[0] : null;
    if (row?.id !== id || row.status?.privacyStatus !== "public") return null;
    const { channelId, title, publishedAt } = row.snippet || {};
    if (!/^UC[\w-]{22}$/.test(channelId || "") || typeof title !== "string" || !title.trim()) return null;
    return {
      youtubeId: id, channelId, title,
      publishedAt: typeof publishedAt === "string" && Number.isFinite(Date.parse(publishedAt))
        ? new Date(publishedAt).toISOString() : null,
      startedAt: null, endedAt: null, durationSeconds: null, availability: "public", visibility: "public",
    };
  };
}

export async function videoForCms(models, id, lookup, { verify = false } = {}) {
  const collected = collectedVideo(models, id);
  const video = lookup && (verify || !collected) ? await lookup(id) : collected;
  if (!video) fail(400, lookup ? "cms_video_not_public" : "cms_video_not_collected");
  return video;
}

export function assertVideoEdit(models, permissions, before, after) {
  if (before.youtubeId !== after.youtubeId || before.channelId !== after.channelId)
    fail(403, "cms_scope_denied");
  const id = before.youtubeId;
  const related = [
    ...models.music.musicVideos.filter((row) => row.youtubeId === id).map((row) => ["musicVideo", row]),
    ...models.karaoke.karaokes.filter((row) => row.youtubeId === id).map((row) => ["karaoke", row]),
    ...models.events.events.filter((row) => row.videoIds.includes(id) ||
      row.slots.some((slot) => slot.videoIds.includes(id))).map((row) => ["event", row]),
  ];
  if (related.some(([entity, row]) => !permissions.canRead(entity, row)))
    fail(403, "cms_scope_denied");
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
