'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { requestJson, youtubeList, youtubeDiagnostics } = require('../lib/collection');
const youtube = require('../fetch_youtube');
const kinds = { channels: 'youtube#channelListResponse', playlistItems: 'youtube#playlistItemListResponse', search: 'youtube#searchListResponse', videos: 'youtube#videoListResponse' };
const empty = endpoint => ({ kind: kinds[endpoint], pageInfo: { totalResults: 0, resultsPerPage: 5 } });
const url = endpoint => `https://www.googleapis.com/youtube/v3/${endpoint}?key=PRIVATE_KEY&id=PRIVATE_ID&pageToken=PRIVATE_TOKEN`;
const request = (endpoint, body, status = 200) => requestJson(url(endpoint), {}, async () => ({ ok: status === 200, status, json: async () => body }));

for (const endpoint of Object.keys(kinds)) {
  test(`${endpoint}.list: accept explicit empty array and verified zero-result omission`, async () => {
    for (const body of [{ ...empty(endpoint), items: [] }, empty(endpoint)]) {
      const response = await request(endpoint, body);
      assert.deepEqual(youtubeList(response, endpoint).items, []);
      assert.equal(youtubeDiagnostics(response, endpoint).httpStatus, 200);
      assert.equal(Object.hasOwn(response, 'httpStatus'), false);
    }
  });
  test(`${endpoint}.list: reject ambiguous or malformed items with safe diagnostics`, async () => {
    const bodies = [
      {}, { kind: kinds[endpoint] }, { ...empty(endpoint), items: null },
      { ...empty(endpoint), items: {} }, { ...empty(endpoint), items: 'PRIVATE_BODY' },
      { ...empty(endpoint), pageInfo: { totalResults: 1, resultsPerPage: 5 } },
      { ...empty(endpoint), pageInfo: { totalResults: '0', resultsPerPage: 5 } },
      { ...empty(endpoint), pageInfo: { totalResults: 0 } },
      { ...empty(endpoint), pageInfo: { totalResults: 0, resultsPerPage: 'PRIVATE_PAGE' } },
      { ...empty(endpoint), nextPageToken: 'PRIVATE_TOKEN' },
      { ...empty(endpoint), kind: 'PRIVATE_KIND', items: [] },
      { ...empty(endpoint), kind: Object.values(kinds).find(kind => kind !== kinds[endpoint]), items: [] }
    ];
    for (const body of bodies) {
      const response = await request(endpoint, { ...body, secret: 'PRIVATE_BODY' });
      assert.throws(() => youtubeList(response, endpoint), error => {
        assert.equal(error.diagnostics.endpoint, `${endpoint}.list`);
        assert.equal(error.diagnostics.httpStatus, 200);
        assert.equal(/PRIVATE|https?:|key=/.test(JSON.stringify(error) + error.message), false);
        return true;
      });
    }
  });
  test(`${endpoint}.list: HTTP, invalid JSON, error envelopes and transport errors retain safe context`, async () => {
    for (const status of [401, 403, 429, 500]) {
      await assert.rejects(request(endpoint, { error: { message: 'PRIVATE_BODY' } }, status), error => {
        assert.equal(error.diagnostics.endpoint, `${endpoint}.list`);
        assert.equal(error.diagnostics.httpStatus, status);
        assert.equal(JSON.stringify(error).includes('PRIVATE'), false);
        return true;
      });
    }
    for (const body of [null, [], 'PRIVATE_BODY', { ...empty(endpoint), items: [], error: { message: 'PRIVATE_BODY' } }]) {
      await assert.rejects(request(endpoint, body), error => {
        assert.equal(error.diagnostics.endpoint, `${endpoint}.list`);
        assert.equal(error.diagnostics.httpStatus, 200);
        assert.equal(JSON.stringify(error).includes('PRIVATE'), false);
        return true;
      });
    }
    await assert.rejects(requestJson(url(endpoint), {}, async () => ({ ok: true, status: 200, json: async () => { throw Error('PRIVATE_BODY'); } })), error => {
      assert.equal(error.diagnostics.httpStatus, 200);
      assert.equal(error.diagnostics.endpoint, `${endpoint}.list`);
      assert.equal(error.message.includes('PRIVATE'), false);
      return true;
    });
    await assert.rejects(requestJson(url(endpoint), {}, async () => { throw Error(url(endpoint)); }), error => {
      assert.equal(error.diagnostics.httpStatus, null);
      assert.equal(error.diagnostics.endpoint, `${endpoint}.list`);
      assert.equal((JSON.stringify(error) + error.message).includes('PRIVATE'), false);
      return true;
    });
  });
}

const now = new Date('2026-11-09T17:08:35Z');
const streamer = { name: 'Fixture', youtubeChannelId: 'channel' };
const knownVideo = { id: 'known', snippet: { channelId: 'channel', title: 'Keep', publishedAt: now.toISOString(), liveBroadcastContent: 'live' }, liveStreamingDetails: { actualStartTime: now.toISOString() } };
const normal = {
  channels: { items: [{ id: 'channel', contentDetails: { relatedPlaylists: { uploads: 'uploads' } } }] },
  playlistItems: { items: [] }, search: { items: [] }, videos: { items: [knownVideo] }
};
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'youtube-response-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const files = {
    'youtube_streamers.json': [streamer],
    'youtube.json': [{ youtubeid: 'channel', videoId: 'known', status: 'live', date: now.toISOString() }],
    'youtube_cache.json': {}, 'last_updated.json': { youtube: 'keep timestamp', twitch: 'keep timestamp' }
  };
  for (const [name, body] of Object.entries(files)) await fs.writeFile(path.join(directory, name), JSON.stringify(body));
  return { directory, files };
}
for (const endpoint of Object.keys(kinds)) {
  test(`${endpoint}.list failure cannot overwrite published data, cache or timestamps`, async t => {
    const { directory, files } = await fixture(t);
    const calls = [];
    await assert.rejects(youtube.main({ directory, now, env: { YOUTUBE_API_KEY: 'PRIVATE_KEY' }, request: value => {
      const current = new URL(value).pathname.split('/').at(-1); calls.push(current);
      return request(current, current === endpoint ? { ...empty(current), pageInfo: { totalResults: 1, resultsPerPage: 5 } } : normal[current]);
    } }), error => error.diagnostics.endpoint === `${endpoint}.list`);
    assert.equal(calls.filter(name => name === endpoint).length, 1, 'no retries or diagnostic API calls');
    for (const [name, body] of Object.entries(files)) assert.equal(await fs.readFile(path.join(directory, name), 'utf8'), JSON.stringify(body));
  });
}

test('observed channels.list zero-result omission continues discovery and refreshes existing videos', async t => {
  const logs = []; t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
  const { directory } = await fixture(t);
  // A missing-only batch uses the exact kind/counters/items omission
  // observed when replaying the historical first request.
  const result = await youtube.collect({ streamers: [streamer], existing: [{ youtubeid: 'channel', videoId: 'known' }], cache: {}, apiKey: 'PRIVATE_KEY', now,
    request: value => {
      const endpoint = new URL(value).pathname.split('/').at(-1);
      return request(endpoint, endpoint === 'channels' ? { ...empty('channels'), secret: 'PRIVATE_BODY' } : normal[endpoint]);
    } });
  assert.equal(result.data[0].videoId, 'known');
  assert.equal(result.cache.__unavailable__.channel, now.toISOString());
  const calls = [];
  await youtube.main({ directory, now, env: { YOUTUBE_API_KEY: 'PRIVATE_KEY' }, request: value => {
    const endpoint = new URL(value).pathname.split('/').at(-1); calls.push(endpoint);
    return request(endpoint, endpoint === 'search' ? empty('search') : normal[endpoint]);
  } });
  assert.deepEqual(calls, ['channels', 'playlistItems', 'search', 'videos']);
  const data = JSON.parse(await fs.readFile(path.join(directory, 'youtube.json')));
  assert.equal(data[0].videoId, 'known');
  assert.equal(data[0].status, 'live');
  assert.equal(/PRIVATE|https?:|key=/.test(logs.join('\n')), false);
  assert.match(logs.join('\n'), /"endpoint":"channels.list"/);
  assert.match(logs.join('\n'), /"endpoint":"search.list"/);
  assert.match(logs.join('\n'), /"httpStatus":200/);
});

test('verified empty videos.list is distinct from a failure and retires unavailable IDs', async t => {
  t.mock.method(console, 'log', () => {});
  const { directory } = await fixture(t);
  await youtube.main({ directory, now, env: { YOUTUBE_API_KEY: 'PRIVATE_KEY', YOUTUBE_REFRESH_ONLY: 'true' },
    request: value => { assert.equal(new URL(value).pathname, '/youtube/v3/videos'); return request('videos', empty('videos')); }
  });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, 'youtube.json'))), []);
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'last_updated.json'))).youtube, now.toISOString());
});
