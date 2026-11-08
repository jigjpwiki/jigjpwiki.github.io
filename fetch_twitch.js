'use strict';

const path = require('node:path');
const { requestJson, arrayField, readJson, dateWindow, saveResult } = require('./lib/collection');

async function collect({ streamers, clientId, clientSecret, now, request = requestJson }) {
  if (!clientId || !clientSecret) throw new Error('TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are required');
  if (!Array.isArray(streamers)) throw new Error('Invalid Twitch streamer list');
  const auth = await request('https://id.twitch.tv/oauth2/token', {
    method: 'POST', body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' })
  });
  if (typeof auth.access_token !== 'string' || !auth.access_token) throw new Error('Missing Twitch access token');
  const api = async (endpoint, params) => request(`https://api.twitch.tv/helix/${endpoint}?${new URLSearchParams(params)}`, {
    headers: { 'Client-ID': clientId, Authorization: `Bearer ${auth.access_token}` }
  });
  const { start } = dateWindow(now);
  const output = new Map();
  for (const s of streamers) {
    if (!s.twitchUserLogin) continue;
    const users = arrayField(await api('users', { login: s.twitchUserLogin }), 'data');
    const user = users[0];
    if (!user) { console.warn('Configured Twitch user is no longer public; skipping'); continue; }
    if (!user.id) throw new Error('Invalid Twitch user');
    const streams = arrayField(await api('streams', { user_login: s.twitchUserLogin }), 'data');
    const stream = streams[0];
    if (stream) {
      if (!stream.id || !Number.isFinite(Date.parse(stream.started_at)) || typeof stream.title !== 'string') throw new Error('Invalid Twitch stream');
      output.set(`live:${stream.id}`, {
        name: s.name, twitchid: s.twitchUserLogin, streamId: stream.id, title: stream.title,
        date: new Date(stream.started_at).toISOString(), status: 'live', type: 'stream',
        url: `https://www.twitch.tv/${encodeURIComponent(s.twitchUserLogin)}`,
        channelIcon: user.profile_image_url || '',
        thumbnail: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(s.twitchUserLogin)}-320x180.jpg`
      });
    }
    let cursor = '';
    const seen = new Set();
    do {
      const result = await api('videos', { user_id: user.id, type: 'archive', sort: 'time', first: '100', ...(cursor ? { after: cursor } : {}) });
      const videos = arrayField(result, 'data');
      for (const video of videos) {
        if (!video.id || !Number.isFinite(Date.parse(video.created_at)) || typeof video.title !== 'string') throw new Error('Invalid Twitch archive');
        if (Date.parse(video.created_at) < start || (stream && video.stream_id === stream.id)) continue;
        output.set(`video:${video.id}`, {
          name: s.name, twitchid: s.twitchUserLogin, videoId: video.id, streamId: video.stream_id,
          title: video.title, date: new Date(video.created_at).toISOString(), status: 'archive', type: 'stream',
          url: `https://www.twitch.tv/videos/${encodeURIComponent(video.id)}`,
          channelIcon: user.profile_image_url || '',
          thumbnail: (video.thumbnail_url || '').replace('%{width}', '320').replace('%{height}', '180')
        });
      }
      cursor = videos.length && Date.parse(videos[videos.length - 1].created_at) >= start ? result.pagination?.cursor || '' : '';
      if (cursor && seen.has(cursor)) throw new Error('Repeated Twitch page cursor');
      seen.add(cursor);
    } while (cursor);
  }
  return [...output.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

async function main({ directory = path.join(__dirname, 'data'), env = process.env, now = new Date(), request = requestJson } = {}) {
  const data = await collect({ streamers: await readJson(path.join(directory, 'twitch_streamers.json'), null),
    clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET, now, request });
  await saveResult(directory, 'twitch', data, now);
  console.log(`Twitch: saved ${data.length} items`);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { collect, main };
