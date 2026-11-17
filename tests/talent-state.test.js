'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTalents, loadTalents } = require('../lib/talents');
const { talentPage } = require('../lib/talent-details');
const { loadCatalog, publicCatalog } = require('../lib/catalog');
const seed = require('./fixtures/foundation-talents.json');
const fixture = () => ({ schemaVersion: 2, organizations: [{ id: 'org-000001', name: 'ProForma Nova' }], talents: [structuredClone(seed[3])] });

test('v2 affiliation and activity states are independent, never inferred from former membership', () => {
  const labels = { unknown: null, active: '活動中', hiatus: '活動休止', retired: '引退', ended: '活動終了' };
  for (const agency of ['unknown', 'unaffiliated', 'affiliated']) {
    for (const [activity, label] of Object.entries(labels)) {
      const m = fixture(), t = m.talents[0];
      t.agencyStatus.value = agency;
      t.activityStatus.value = activity;
      if (agency === 'affiliated') t.affiliations[0].status = 'current';
      const before = structuredClone(m);
      validateTalents(m);
      const html = talentPage(t, m, { events: [], groups: [] }, {});
      assert.deepEqual(m, before);
      assert.equal(t.id, seed[3].id);
      const hero = html.split('class="profile-hero"')[1].split('id="talent-streams"')[0];
      assert.doesNotMatch(hero, />引退<|>活動終了</);
      if (label) assert(html.includes(`<p>${label}</p>`));
      else assert.doesNotMatch(html, />活動中<|>活動休止<|>引退<|>活動終了</);
      assert.equal(html.includes('<p>無所属</p>'), agency === 'unaffiliated');
      assert.equal(html.includes('旧所属：ProForma Nova'), agency !== 'affiliated');
      assert.doesNotMatch(html, /sourceRefs|displayNameSourceRefs|agencyStatus|activityStatus/);
    }
  }
});

test('current affiliations still reject unknown/unaffiliated agency state and invalid activity codes', () => {
  for (const agency of ['unknown', 'unaffiliated']) {
    const m = fixture(); m.talents[0].affiliations[0].status = 'current';
    m.talents[0].agencyStatus.value = agency;
    assert.throws(() => validateTalents(m), /agency state/);
  }
  const m = fixture(); m.talents[0].activityStatus.value = 'graduated';
  assert.throws(() => validateTalents(m), /schema/);
});

test('current public master validates and rendering/catalog projection preserve every recorded state', () => {
  const m = loadTalents(), before = structuredClone(m);
  const data = publicCatalog(loadCatalog(m));
  for (const t of m.talents.filter(t => t.visibility === 'public')) talentPage(t, m, data, {});
  assert.deepEqual(m, before);
});
