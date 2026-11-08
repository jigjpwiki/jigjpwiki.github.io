'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const youtube = require('../fetch_youtube');
const twitch = require('../fetch_twitch');
const { requestJson } = require('../lib/collection');
const now = new Date('2026-11-07T16:00:00Z');
const channel = { name: 'Fixture', youtubeChannelId: 'channel', twitchUserLogin: 'fixture' };
const video = (id, details = {}) => ({ id, snippet: { channelId: 'channel', title: 'Test', publishedAt: '2026-11-01T00:00:00Z', liveBroadcastContent: 'none' }, liveStreamingDetails: details });

for (const status of [401, 403, 429, 500]) {
  test(`HTTP ${status} rejects without leaking request/response secrets`, async () => {
    await assert.rejects(requestJson('https://example.test/?key=private', {}, async () => ({ ok: false, status })), { message: `API HTTP ${status}` });
  });
}
test('malformed response and network error are sanitized', async () => {
  await assert.rejects(requestJson('https://example.test', {}, async () => { throw Error('key=private'); }), error => !error.message.includes('private'));
  await assert.rejects(requestJson('https://example.test', {}, async () => ({ ok: true, json: async () => { throw Error('bad JSON'); } })));
});

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jigdule-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const files = {
    'youtube_streamers.json': [channel], 'twitch_streamers.json': [channel],
    'youtube.json': [{ youtubeid: 'channel', url: 'https://www.youtube.com/watch?v=old', date: now.toISOString(), status: 'live' }],
    'youtube_cache.json': {}, 'twitch.json': [{ title: 'keep me' }],
    'last_updated.json': { youtube: 'old', twitch: 'old' }
  };
  for (const [name, data] of Object.entries(files)) await fs.writeFile(path.join(directory, name), JSON.stringify(data));
  return { directory, files };
}
for (const platform of ['youtube', 'twitch']) {
  for (const failure of ['http', 'shape']) {
    test(`${platform}: ${failure} failure preserves data, cache and timestamps`, async t => {
      const { directory, files } = await fixture(t);
      const request = failure === 'http' ? async () => { throw Error('API HTTP 401'); } : async () => ({});
      await assert.rejects(({ youtube, twitch })[platform].main({ directory, now, env: { YOUTUBE_API_KEY: 'fixture', TWITCH_CLIENT_ID: 'fixture', TWITCH_CLIENT_SECRET: 'fixture' }, request }));
      for (const name of Object.keys(files)) assert.equal(await fs.readFile(path.join(directory, name), 'utf8'), JSON.stringify(files[name]));
    });
  }
}
test('YouTube refreshes known IDs despite search cache, removes unavailable and updates ended/long streams', async () => {
  const cache = { channel: now.toISOString(), __uploads__: { channel: 'uploads' }, __upcoming__: { channel: now.toISOString() } };
  const existing = ['ended', 'long', 'gone'].map(id => ({ youtubeid: 'channel', videoId: id, status: 'live', date: now.toISOString() }));
  const calls = [];
  const result = await youtube.collect({ streamers: [channel], existing, cache, apiKey: 'fixture', now, request: async value => {
    const url = new URL(value); calls.push(url.pathname);
    assert.equal(url.searchParams.get('id'), 'ended,long,gone');
    const long = video('long', { actualStartTime: '2026-11-06T00:00:00Z' }); long.snippet.liveBroadcastContent = 'live';
    return { items: [video('ended', { actualStartTime: '2026-11-07T10:00:00Z', actualEndTime: '2026-11-07T12:00:00Z' }), long] };
  } });
  assert.deepEqual(calls, ['/youtube/v3/videos']);
  assert.equal(result.data.find(x => x.videoId === 'ended').status, 'archive');
  assert.equal(result.data.find(x => x.videoId === 'long').status, 'live');
  assert.equal(result.data.some(x => x.videoId === 'gone'), false);
  assert.equal(cache.channel, now.toISOString());
  assert.equal(cache.__searchBudget__, undefined);
});
test('YouTube consumes search pagination and uses details to replace scheduled times', async () => {
  const requests = [];
  const result = await youtube.collect({ streamers: [channel], existing: [], cache: {}, apiKey: 'fixture', now, request: async value => {
    const url = new URL(value); requests.push(url);
    if (url.pathname.endsWith('/channels')) return { items: [{ id: 'channel', contentDetails: { relatedPlaylists: { uploads: 'uploads' } } }] };
    if (url.pathname.endsWith('/playlistItems')) return { items: [] };
    if (url.pathname.endsWith('/search')) return url.searchParams.has('pageToken') ? { items: [{ id: { videoId: 'b' } }] } : { items: [{ id: { videoId: 'a' } }], nextPageToken: 'second' };
    return { items: [video('a', { scheduledStartTime: '2026-11-10T12:00:00Z' }), video('b', { scheduledStartTime: '2026-11-11T12:00:00Z' })] };
  } });
  assert.equal(result.data.length, 2);
  assert.equal(result.data[0].status, 'upcoming');
  assert.equal(requests.filter(x => x.pathname.endsWith('/search')).length, 2);
});
test('Twitch saves archive permalink and deduplicates live recording by stream ID', async () => {
  const result = await twitch.collect({ streamers: [channel], clientId: 'fixture', clientSecret: 'fixture', now, request: async (value, options) => {
    const url = new URL(value);
    if (url.pathname.endsWith('/token')) { assert.equal(url.search, ''); assert.ok(options.body instanceof URLSearchParams); return { access_token: 'fixture' }; }
    if (url.pathname.endsWith('/users')) return { data: [{ id: 'user', login: 'fixture' }] };
    if (url.pathname.endsWith('/streams')) return { data: [{ id: 'stream', user_login: 'fixture', started_at: now.toISOString(), title: 'live' }] };
    return { data: [{ id: 'archive', stream_id: 'previous', created_at: now.toISOString(), title: 'recording' }, { id: 'in-progress', stream_id: 'stream', created_at: now.toISOString(), title: 'changed title' }] };
  } });
  assert.equal(result.length, 2);
  assert.equal(result.find(x => x.status === 'archive').url, 'https://www.twitch.tv/videos/archive');
});
test('successful zero-result Twitch update clears old data and advances only Twitch timestamp', async t => {
  const { directory } = await fixture(t);
  await twitch.main({ directory, now, env: { TWITCH_CLIENT_ID: 'fixture', TWITCH_CLIENT_SECRET: 'fixture' }, request: async value => {
    if (value.includes('/token')) return { access_token: 'fixture' };
    if (value.includes('/users')) return { data: [{ id: 'user', login: 'fixture' }] };
    return { data: [] };
  } });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, 'twitch.json'))), []);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, 'last_updated.json'))), { youtube: 'old', twitch: now.toISOString() });
});

test('late API failure cannot publish a partially collected snapshot', async t => {
  const { directory, files } = await fixture(t);
  await assert.rejects(youtube.main({ directory, now, env: { YOUTUBE_API_KEY: 'fixture' }, request: async value => {
    const url = new URL(value);
    if (url.pathname.endsWith('/channels')) return { items: [{ id: 'channel', contentDetails: { relatedPlaylists: { uploads: 'uploads' } } }] };
    if (url.pathname.endsWith('/playlistItems')) return { items: [] };
    if (url.pathname.endsWith('/search')) return { items: [{ id: { videoId: 'new' } }] };
    throw Error('API HTTP 429');
  } }));
  for (const name of Object.keys(files)) assert.equal(await fs.readFile(path.join(directory, name), 'utf8'), JSON.stringify(files[name]));
});

test('rescheduled upcoming video stays known outside the visible window', async () => {
  const result = await youtube.collect({ streamers: [channel], existing: [{ youtubeid: 'channel', videoId: 'future', status: 'upcoming' }],
    cache: { channel: now.toISOString(), __uploads__: { channel: 'uploads' }, __upcoming__: { channel: now.toISOString() } }, apiKey: 'fixture', now,
    request: async () => ({ items: [video('future', { scheduledStartTime: '2027-01-01T00:00:00Z' })] }) });
  assert.equal(result.data[0].date, '2027-01-01T00:00:00.000Z');
  assert.equal(result.data[0].status, 'upcoming');
});

for (const platform of ['youtube', 'twitch']) {
  test(`${platform} CLI reports missing credentials with nonzero exit`, () => {
    const { spawnSync } = require('node:child_process');
    const result = spawnSync(process.execPath, [path.join(__dirname, `../fetch_${platform}.js`)], {
      encoding: 'utf8', env: { ...process.env, YOUTUBE_API_KEY: '', TWITCH_CLIENT_ID: '', TWITCH_CLIENT_SECRET: '' }
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /required/);
  });
}

test('discovers old unpublished reservations without a publication cutoff', async () => {
  const result = await youtube.collect({ streamers: [channel], existing: [], cache: {}, apiKey: 'fixture', now,
    request: async value => {
      const url = new URL(value);
      if (url.pathname.endsWith('/channels')) return { items: [{ id: 'channel', contentDetails: { relatedPlaylists: { uploads: 'uploads' } } }] };
      if (url.pathname.endsWith('/playlistItems')) return { items: [] };
      if (url.pathname.endsWith('/search')) {
        assert.equal(url.searchParams.get('eventType'), 'upcoming');
        assert.equal(url.searchParams.has('publishedAfter'), false);
        return { items: [{ id: { videoId: 'old-reservation' } }] };
      }
      const item = video('old-reservation', { scheduledStartTime: '2026-12-01T00:00:00Z' });
      item.snippet.publishedAt = '2025-01-01T00:00:00Z';
      return { items: [item] };
    }
  });
  assert.equal(result.data[0].videoId, 'old-reservation');
  assert.equal(result.data[0].status, 'upcoming');
});

test('exhausted discovery budget still refreshes known live streams', async () => {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const result = await youtube.collect({ streamers: [channel], existing: [{ youtubeid: 'channel', videoId: 'known' }],
    cache: { channel: now.toISOString(), __uploads__: { channel: 'uploads' }, __searchBudget__: { day, used: 50 } }, apiKey: 'fixture', now,
    request: async value => { assert.ok(new URL(value).pathname.endsWith('/videos')); return { items: [video('known', { actualStartTime: now.toISOString() })] }; }
  });
  assert.equal(result.data.length, 1);
});

test('uploads discovery pages beyond 50 recent videos', async () => {
  let pages = 0;
  const result = await youtube.collect({ streamers: [channel], existing: [], cache: { __uploads__: { channel: 'uploads' }, __upcoming__: { channel: now.toISOString() } }, apiKey: 'fixture', now,
    request: async value => {
      const url = new URL(value);
      if (url.pathname.endsWith('/playlistItems')) {
        pages++;
        return { items: [{ contentDetails: { videoId: pages === 1 ? 'a' : 'b', videoPublishedAt: now.toISOString() } }], ...(pages === 1 ? { nextPageToken: 'second' } : {}) };
      }
      assert.equal(url.pathname.endsWith('/search'), false);
      return { items: [video('a', { actualStartTime: now.toISOString() }), video('b', { actualStartTime: now.toISOString() })] };
    }
  });
  assert.equal(pages, 2); assert.equal(result.data.length, 2);
});

test('successfully missing/deleted channel does not block other YouTube channels', async () => {
  const result = await youtube.collect({ streamers: [channel], existing: [], cache: {}, apiKey: 'fixture', now,
    request: async value => { assert.ok(new URL(value).pathname.endsWith('/channels')); return { items: [] }; }
  });
  assert.deepEqual(result.data, []);
  assert.equal(result.cache.__unavailable__.channel, now.toISOString());
});

test('missing uploads playlist still allows upcoming discovery; auth errors remain fatal', async () => {
  const input = { streamers: [channel], existing: [], cache: { __uploads__: { channel: 'uploads' } }, apiKey: 'fixture', now };
  const calls = [];
  const request = async value => {
    const endpoint = new URL(value).pathname; calls.push(endpoint);
    if (endpoint.endsWith('/playlistItems')) throw Error('API HTTP 404');
    return { items: [] };
  };
  await youtube.collect({ ...input, request });
  assert.ok(calls.some(x => x.endsWith('/search')));
  await assert.rejects(youtube.collect({ ...input, request: async () => { throw Error('API HTTP 403'); } }), /403/);
});

test('HTTP diagnostics contain endpoint but never credentials or query parameters', async () => {
  await assert.rejects(requestJson('https://example.test/oauth2/token?client_secret=private', {}, async () => ({ ok: false, status: 403 })), error => {
    assert.equal(error.message, 'API HTTP 403');
    assert.equal(error.endpoint, 'https://example.test/oauth2/token');
    assert.equal(JSON.stringify(error).includes('private'), false);
    return true;
  });
});

test('status-only refresh bypasses discovery and updates live/ended states even without channel cache', async () => {
  const result = await youtube.collect({ streamers: [channel], existing: [{ youtubeid: 'channel', videoId: 'ended' }], cache: {}, apiKey: 'fixture', now, refreshOnly: true,
    request: async value => { assert.ok(new URL(value).pathname.endsWith('/videos')); return { items: [video('ended', { actualStartTime: now.toISOString(), actualEndTime: now.toISOString() })] }; }
  });
  assert.equal(result.data[0].status, 'archive');
});

test('Twitch batches multiple logins and matches users regardless of response order and login case', async () => {
  const calls = [];
  const result = await twitch.collect({streamers:[{name:'A',twitchUserLogin:'Alpha'},{name:'B',twitchUserLogin:'beta'}],clientId:'fixture',clientSecret:'fixture',now,
    request:async value=>{
      const url=new URL(value); calls.push(url);
      if(url.pathname.endsWith('/token')) return {access_token:'fixture'};
      if(url.pathname.endsWith('/users')) {assert.deepEqual(url.searchParams.getAll('login'),['Alpha','beta']);return {data:[{id:'b',login:'beta'},{id:'a',login:'alpha'}]};}
      if(url.pathname.endsWith('/streams')) {assert.equal(url.searchParams.getAll('user_login').length,2);return {data:[{id:'live',user_login:'alpha',title:'live',started_at:now.toISOString()}]};}
      return {data:[]};
    }});
  assert.equal(calls.length,5);
  assert.equal(result[0].name,'A');
});
