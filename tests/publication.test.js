'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fingerprint, writeManifest, publicationNeeded } = require('../lib/publication');
const old = { version: 1, fingerprint: 'a'.repeat(64) };
const current = { version: 1, fingerprint: 'b'.repeat(64) };
const response = manifest => async () => ({ ok: true, text: async () => JSON.stringify(manifest) });
const options = { manifest: current, url: 'https://pages.example/deployment.json' };

test('committed but unpublished data is retried on a later unchanged run', async () => {
  // The failed first upload left the old manifest public; no git diff is needed.
  const args = { ...options, fetchImpl: response(old) };
  assert.equal((await publicationNeeded(args)).publish, true);
  assert.equal((await publicationNeeded(args)).publish, true);
  assert.deepEqual(await publicationNeeded({ ...args, fetchImpl: response(current) }), { publish: false, reason: 'already-published' });
});
test('missing/malformed public marker and network failures fail open for publication', async () => {
  for (const fetchImpl of [async () => ({ ok: false }), async () => { throw Error('network'); }, response({}), response({ version: 1, fingerprint: '../invalid' }), async () => ({ ok: true, text: async () => '<html>not JSON</html>' }), async () => ({ ok: true, text: async () => 'x'.repeat(1025) })]) {
    assert.equal((await publicationNeeded({ ...options, fetchImpl })).publish, true);
  }
});
test('code pushes retain forced publication and marker checks use cache bypass', async () => {
  assert.equal((await publicationNeeded({ ...options, force: true, fetchImpl: () => { throw Error('must not fetch'); } })).publish, true);
  await publicationNeeded({ ...options, fetchImpl: async (url, init) => {
    assert.equal(url.origin, 'https://pages.example');
    assert.ok(url.searchParams.has('check'));
    assert.equal(init.headers['Cache-Control'], 'no-cache');
    return { ok: true, text: async () => JSON.stringify(current) };
  } });
});
test('fingerprint covers content/path changes while metadata alone stays unchanged', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-publication-'));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  fs.mkdirSync(path.join(directory, 'data'));
  fs.writeFileSync(path.join(directory, 'index.html'), 'site');
  fs.writeFileSync(path.join(directory, 'data/youtube.json'), '["committed"]');
  fs.writeFileSync(path.join(directory, 'data/last_updated.json'), 'old');
  const before = writeManifest(directory);
  assert.equal(before.fingerprint, fingerprint(directory));
  fs.writeFileSync(path.join(directory, 'data/last_updated.json'), 'new');
  assert.equal(fingerprint(directory), before.fingerprint);
  fs.writeFileSync(path.join(directory, 'data/youtube.json'), '["new data"]');
  const next = fingerprint(directory); assert.notEqual(next, before.fingerprint);
  fs.renameSync(path.join(directory, 'index.html'), path.join(directory, 'renamed.html'));
  assert.notEqual(fingerprint(directory), next);
});
test('JST day/month/year changes cannot change the static calendar fingerprint; real inputs and retries remain effective', async t => {
  const { anniversaryPage } = require('../lib/info-pages');
  const { loadTalents } = require('../lib/talents');
  const { loadCatalog, publicCatalog } = require('../lib/catalog');
  const master = loadTalents(); const data = publicCatalog(loadCatalog(master));
  const RealDate = Date;
  const at = instant => {
    global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return RealDate.parse(instant); } };
    try { return anniversaryPage(master, data); } finally { global.Date = RealDate; }
  };
  const html = at('2026-12-31T14:59:59Z');
  assert.equal(at('2026-12-31T15:00:00Z'), html);
  assert.equal(at('2027-02-01T00:00:00Z'), html);
  assert.match(html, /現在の暦ではありません/);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-publication-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'data')); fs.writeFileSync(path.join(directory, 'index.html'), html);
  fs.writeFileSync(path.join(directory, 'data/youtube.json'), '[]'); fs.writeFileSync(path.join(directory, 'data/twitch.json'), '[]');
  const before = writeManifest(directory);
  fs.writeFileSync(path.join(directory, 'index.html'), at('2027-01-15T00:00:00Z'));
  assert.equal(fingerprint(directory), before.fingerprint);
  assert.equal((await publicationNeeded({ ...options, manifest: before, fetchImpl: response(before) })).publish, false);
  data.events[0].title += '（訂正）';
  fs.writeFileSync(path.join(directory, 'index.html'), at('2027-01-15T00:00:00Z'));
  const corrected = writeManifest(directory); assert.notEqual(corrected.fingerprint, before.fingerprint);
  for (let i = 0; i < 2; i++) assert.equal((await publicationNeeded({ ...options, manifest: corrected, fetchImpl: response(before) })).publish, true);
  for (const platform of ['youtube', 'twitch']) {
    const previous = fingerprint(directory);
    fs.writeFileSync(path.join(directory, `data/${platform}.json`), '[{"title":"updated"}]');
    assert.notEqual(fingerprint(directory), previous);
  }
});
