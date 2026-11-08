'use strict';

const path = require('node:path');
const { requestJson, arrayField, readJson, dateWindow, saveResult } = require('./lib/collection');

function videoId(item) {
  if (item.videoId) return item.videoId;
  try { return new URL(item.url).searchParams.get('v'); } catch { return null; }
}

async function collect({ streamers, existing, cache, apiKey, now, request = requestJson, refreshOnly = false }) {
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is required');
  if (!Array.isArray(streamers) || !Array.isArray(existing) || !cache || Array.isArray(cache) || typeof cache !== 'object') {
    throw new Error('Invalid YouTube input data');
  }
  const nextCache = structuredClone(cache);
  nextCache.__channelIcons__ ||= {};
  const channels = new Map(streamers.filter(s => s.youtubeChannelId).map(s => [s.youtubeChannelId, s]));
  const ids = new Set(existing.filter(x => channels.has(x.youtubeid)).map(videoId).filter(Boolean));
  const api = async (endpoint, params) => {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    url.search = new URLSearchParams({ ...params, key: apiKey }).toString();
    return request(url.toString());
  };

  // Uploads playlists are cheap to poll; do not use search.list for every channel.
  nextCache.__uploads__ ||= {};
  nextCache.__upcoming__ ||= {};
  nextCache.__unavailable__ ||= {};
  if (!refreshOnly) {
  const missing = [...channels.keys()].filter(id => !nextCache.__uploads__[id] && (!nextCache.__unavailable__[id] || now - new Date(nextCache.__unavailable__[id]) >= 86400000));
  for (let offset = 0; offset < missing.length; offset += 50) {
    const items = arrayField(await api('channels', { part: 'snippet,contentDetails', id: missing.slice(offset, offset + 50).join(',') }), 'items');
    for (const item of items) {
      if (!item.id || !item.contentDetails?.relatedPlaylists?.uploads) throw new Error('Invalid YouTube channel');
      nextCache.__uploads__[item.id] = item.contentDetails.relatedPlaylists.uploads;
      delete nextCache.__unavailable__[item.id];
      nextCache.__channelIcons__[item.id] = item.snippet?.thumbnails?.medium?.url || '';
    }
    for (const id of missing.slice(offset, offset + 50)) {
      if (!nextCache.__uploads__[id]) nextCache.__unavailable__[id] = now.toISOString();
    }
  }
  for (const [id] of channels) {
    if (!nextCache.__uploads__[id]) continue;
    const age = now - new Date(cache[id] || 0);
    const recentlyActive = existing.some(x => x.youtubeid === id && (x.status === 'live' || x.status === 'upcoming' || now - new Date(x.date) < 2 * 86400000));
    if (age >= 0 && age < (recentlyActive ? 1 : 6) * 3600000) continue;
    let pageToken = '';
    const tokens = new Set();
    do {
      let result;
      try {
        result = await api('playlistItems', {
          part: 'contentDetails', playlistId: nextCache.__uploads__[id], maxResults: '50',
          ...(pageToken ? { pageToken } : {})
        });
      } catch (error) {
        // YouTube returns 404 for uploads playlists with no public uploads.
        // The channel may still have upcoming streams; search it below.
        if (error.message !== 'API HTTP 404') throw error;
        break;
      }
      const items = arrayField(result, 'items');
      for (const item of items) {
        if (!item.contentDetails?.videoId) throw new Error('Invalid YouTube playlist item');
        ids.add(item.contentDetails.videoId);
      }
      const lastDate = Date.parse(items.at(-1)?.contentDetails?.videoPublishedAt);
      pageToken = items.length && (!Number.isFinite(lastDate) || lastDate >= now - 8 * 86400000) ? result.nextPageToken || '' : '';
      if (pageToken && tokens.has(pageToken)) throw new Error('Repeated YouTube page token');
      tokens.add(pageToken);
    } while (pageToken);
    nextCache[id] = now.toISOString();
  }

  // Old reservation frames may be absent from uploads. Search upcoming streams
  // without a publication cutoff, in oldest-checked order, within a daily budget.
  // Pacific dates follow YouTube's daily quota reset, including daylight saving.
  const quotaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const budget = nextCache.__searchBudget__?.day === quotaDay ? nextCache.__searchBudget__ : { day: quotaDay, used: 0 };
  nextCache.__searchBudget__ = budget;
  const candidates = [...channels.keys()].filter(id => nextCache.__uploads__[id] && (!cache.__upcoming__?.[id] || now - new Date(cache.__upcoming__[id]) >= 48 * 3600000))
    .sort((a, b) => (Date.parse(cache.__upcoming__?.[a]) || 0) - (Date.parse(cache.__upcoming__?.[b]) || 0));
  for (const id of candidates.slice(0, 5)) {
    if (budget.used >= 50) break;
    let pageToken = nextCache.__upcomingCursor__?.[id] || '';
    const tokens = new Set();
    do {
      if (budget.used >= 50) break;
      const result = await api('search', { part: 'id', channelId: id, type: 'video', eventType: 'upcoming', maxResults: '50', ...(pageToken ? { pageToken } : {}) });
      budget.used++;
      for (const item of arrayField(result, 'items')) {
        if (!item.id?.videoId) throw new Error('Invalid YouTube search item');
        ids.add(item.id.videoId);
      }
      pageToken = result.nextPageToken || '';
      if (pageToken && tokens.has(pageToken)) throw new Error('Repeated YouTube page token');
      tokens.add(pageToken);
    } while (pageToken);
    nextCache.__upcomingCursor__ ||= {};
    if (pageToken) nextCache.__upcomingCursor__[id] = pageToken;
    else { delete nextCache.__upcomingCursor__[id]; nextCache.__upcoming__[id] = now.toISOString(); }
  }

  }

  const { start, end } = dateWindow(now);
  const output = [];
  const allIds = [...ids];
  for (let offset = 0; offset < allIds.length; offset += 50) {
    const items = arrayField(await api('videos', {
      part: 'snippet,liveStreamingDetails', id: allIds.slice(offset, offset + 50).join(',')
    }), 'items');
    for (const video of items) {
      const s = video.snippet;
      if (!video.id || !s?.channelId || typeof s.title !== 'string' || !s.publishedAt) throw new Error('Invalid YouTube video item');
      const channel = channels.get(s.channelId);
      if (!channel) continue;
      const details = video.liveStreamingDetails || {};
      const live = s.liveBroadcastContent === 'live' && !details.actualEndTime;
      const upcoming = !details.actualStartTime && !!details.scheduledStartTime && !details.actualEndTime;
      const date = details.actualStartTime || details.scheduledStartTime || s.publishedAt;
      const timestamp = Date.parse(date);
      if (!Number.isFinite(timestamp)) throw new Error('Invalid YouTube video date');
      if (!live && !upcoming && (timestamp < start || timestamp >= end)) continue;
      output.push({
        videoId: video.id, name: channel.name, youtubeid: s.channelId, title: s.title,
        date: new Date(timestamp).toISOString(), status: live ? 'live' : upcoming ? 'upcoming' : 'archive',
        type: details.actualStartTime || details.scheduledStartTime ? 'stream' : 'video',
        thumbnail: s.thumbnails?.medium?.url || '', channelIcon: nextCache.__channelIcons__[s.channelId] || '',
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`
      });
    }
    // IDs omitted by a successful videos.list response are no longer public.
    // Do not merge their stale entries back into the output.
  }
  output.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (!refreshOnly) nextCache.__lastDiscovery__ = now.toISOString();
  return { data: output, cache: nextCache };
}

async function main({ directory = path.join(__dirname, 'data'), env = process.env, now = new Date(), request = requestJson } = {}) {
  const previousCache = await readJson(path.join(directory, 'youtube_cache.json'), {});
  const refreshOnly = env.YOUTUBE_REFRESH_ONLY === 'true' || (env.YOUTUBE_REFRESH_ONLY === 'auto' && now - new Date(previousCache.__lastDiscovery__ || 0) < 3600000);
  const result = await collect({
    streamers: await readJson(path.join(directory, 'youtube_streamers.json'), null),
    existing: await readJson(path.join(directory, 'youtube.json'), []),
    cache: previousCache,
    apiKey: env.YOUTUBE_API_KEY, now, request, refreshOnly
  });
  await saveResult(directory, 'youtube', result.data, now, result.cache);
  console.log(`YouTube: saved ${result.data.length} items; ${Object.keys(result.cache.__unavailable__).length} unavailable channels (retry daily)`);
}

if (require.main === module) main().catch(error => { console.error(error.message, error.endpoint || ''); process.exitCode = 1; });
module.exports = { collect, main };
