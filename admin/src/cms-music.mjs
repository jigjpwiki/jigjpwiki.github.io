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
