'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateTalents, loadTalents } = require('../lib/talents');
const { navigation, talentCards } = require('../lib/site-pages');
const master = require('../data/talents.json');
const registry = require('../data/talent-id-registry.json');
const copy = () => structuredClone(master);
const invalid = mutate => { const m = copy(); mutate(m); assert.throws(() => validateTalents(m)); };
test('curated master and reserved identity anchors validate; official channels are excluded', () => {
  assert.equal(loadTalents().talents.length, 4);
  assert.equal(master.talents.some(t => t.displayName === 'ProForma Production'), false);
  assert.equal(master.talents.some(t => t.accounts.some(a => a.accountId === 'UClUMpS4UZ_2VrKk3HdNtIBA')), false);
  assert.equal(master.talents[3].agencyStatus.value, 'unknown');
  assert.equal(master.talents[3].activityStatus.value, 'unknown');
});
test('unique IDs, accounts, source references and organization references are enforced', () => {
  invalid(m => m.talents.push(structuredClone(m.talents[0])));
  invalid(m => m.sources.push(structuredClone(m.sources[0])));
  invalid(m => m.organizations.push(structuredClone(m.organizations[0])));
  invalid(m => m.talents[0].accounts.push(structuredClone(m.talents[1].accounts[0])));
  invalid(m => m.talents[0].displayNameSourceRefs = ['src-missing']);
  invalid(m => m.talents[0].affiliations[0].organizationId = 'org-999999');
  invalid(m => m.talents[0].wiki.url = 'https://example.com/');
  invalid(m => m.talents[0].accounts[0].accountId = m.talents[1].accounts[0].accountId);
  invalid(m => m.talents[0].accounts[1].accountId = 'somebody_else');
});
test('rename, multiple agencies, departure, independent activity and retirement retain internal identity', () => {
  const m = copy(); const t = m.talents[0]; const before = structuredClone(master);
  t.aliases.push({ name: t.displayName, type: 'former_name', from: null, to: null, sourceRefs: t.displayNameSourceRefs });
  t.displayName = '検証用の改名';
  m.organizations.push({ id: 'org-000002', name: '検証用別事務所', sourceRefs: m.organizations[0].sourceRefs });
  t.affiliations.push({ ...t.affiliations[0], organizationId: 'org-000002' });
  assert.equal(validateTalents(m, { previous: before }).talents[0].id, master.talents[0].id);
  t.affiliations.forEach(a => { a.status = 'former'; });
  t.agencyStatus.value = 'unaffiliated'; // verified state is independent from activity
  assert.equal(validateTalents(m).talents[0].activityStatus.value, 'active');
  t.activityStatus.value = 'retired';
  assert.equal(validateTalents(m).talents[0].agencyStatus.value, 'unaffiliated');
  t.activityStatus.value = 'ended';
  assert.equal(validateTalents(m).talents[0].id, master.talents[0].id);
  t.id = 'tal-999999';
  assert.throws(() => validateTalents(m, { previous: before }), /internal ID/);
  assert.throws(() => validateTalents(m, { registry }), /unissued/);
});
test('unknown values, chronology, current affiliation contradictions and evidence are checked', () => {
  invalid(m => m.talents[0].activityStatus.value = 'graduated');
  invalid(m => m.talents[0].agencyStatus.value = 'retired');
  invalid(m => m.talents[0].activityStatus.sourceRefs = []);
  invalid(m => m.talents[0].affiliations[0].to = '2026-11-01');
  invalid(m => m.talents[0].affiliations[0].from = '2026-02-30');
  invalid(m => m.talents[0].affiliations[0] = { ...m.talents[0].affiliations[0], status: 'former', from: '2026-11-01', to: '2026-10-01' });
  invalid(m => m.talents[0].agencyStatus.value = 'unaffiliated');
  invalid(m => m.talents[0].affiliations.push(structuredClone(m.talents[0].affiliations[0])));
  invalid(m => m.sources[0].checkedAt = '2999-01-01T00:00:00Z');
  const m = copy(); m.talents[0].activityStatus = { value: 'unknown', sourceRefs: [] };
  assert.equal(validateTalents(m).talents[0].affiliations[0].from, null);
});
test('private fields, unsafe URLs and broken local images cannot enter the public master', () => {
  invalid(m => m.privateNotes = 'do not publish');
  invalid(m => m.talents[0].reviewerEmail = 'private@example.com');
  invalid(m => m.sources[0].token = 'private');
  invalid(m => m.sources[0].url = 'https://user:password@example.com/');
  invalid(m => m.sources[0].url = 'https://example.com/?api_key=private');
  invalid(m => m.talents[0].accounts[0].url = 'javascript:alert(1)');
  invalid(m => m.talents[0].profileImage.url = '/assets/../data/youtube_client.json');
  invalid(m => m.talents[0].profileImage.url = '/assets/missing.png');
});
test('ready navigation routes only and escaping prevent dead links and HTML injection', () => {
  const nav = navigation('/talents/');
  assert.match(nav, /href="\/talents\/" aria-current="page"/);
  assert.doesNotMatch(nav, /goods|tal-000001/);
  const m = copy(); m.talents[0].displayName = '<img src=x onerror=alert(1)>';
  const html = talentCards(m); assert.doesNotMatch(html, /<img src=x/); assert.match(html, /&lt;img/);
});
test('build publishes only ready pages/public data and keeps schedule implementation intact', () => {
  const root = path.join(__dirname, '../_site');
  // build is also exercised before browser tests; unit suite works from a clean checkout.
  const { execFileSync } = require('node:child_process');
  execFileSync(process.execPath, [path.join(__dirname, '../scripts/build-site.js')]);
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  assert.deepEqual(JSON.parse(read('data/talents.json')), master);
  assert(fs.existsSync(path.join(root, 'anniversaries/index.html')));
  assert(JSON.parse(read('data/catalog.json')).groups.every(g => g.visibility === 'public'));
  for (const file of ['data/talent-id-registry.json', 'data/youtube_cache.json', 'data/youtube_streamers.json', 'schemas', 'pages', 'docs', 'lib', 'node_modules', '.env', '.github', 'data/catalog-id-registry.json', 'data/goods.json', 'goods', 'talents/detail']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file);
  }
  for (const file of ['index.html', 'talents/index.html', 'privacy-policy/index.html', 'terms/index.html']) {
    assert.match(read(file), /aria-label="メインナビゲーション"/);
    assert.doesNotMatch(read(file), /<!-- jigdule:/);
  }
  assert.match(read('index.html'), /id="videolist" class="swiper-wrapper"/);
  assert.match(read('index.html'), /id="show-videos-toggle"/);
  for (const file of ['assets/js/app.js', 'assets/js/schedule.js', 'assets/js/ui.js', 'assets/js/youtube-status.js']) {
    assert.equal(read(file), fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
  }
  assert.equal((read('talents/index.html').match(/class="talent-card"/g) || []).length, 4);
});
