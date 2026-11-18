'use strict';
const Ajv = require('ajv');
const fs = require('node:fs');
const path = require('node:path');
const ajv = new Ajv({ allErrors: true, strict: true });
const {date,publicUrl,dateTime,imageRef}=require('./talent-formats');
ajv.addFormat('date',date);ajv.addFormat('date-time',dateTime);ajv.addFormat('public-url',publicUrl);ajv.addFormat('image-ref',imageRef);
const accountKey = account => `${account.service}:${account.accountId === null ? account.url.toLowerCase() : account.service === 'youtube' ? account.accountId : account.accountId.toLowerCase()}`;
const shape = ajv.compile(require('../schemas/talents.schema.json'));
function validateTalents(master, { root = path.join(__dirname, '..'), registry, previous } = {}) {
  if (!shape(master)) throw new Error('Invalid talent schema: ' + ajv.errorsText(shape.errors, { separator: '; ' }));
  const fail = message => { throw new Error('Invalid talent master: ' + message); };
  const unique = (rows, label) => {
    const ids = new Set(); for (const row of rows) { if (ids.has(row.id)) fail(`duplicate ${label} ID`); ids.add(row.id); }
    return ids;
  };
  const organizations = unique(master.organizations, 'organization'); unique(master.talents, 'talent');
  const period = row => { if (row.from && row.to && row.from > row.to) fail('reversed period'); };
  const accounts = new Map();
  for (const talent of master.talents) {
    if(talent.historyNamePublic === true && talent.visibility !== "draft") fail("history name approval requires draft visibility");
    for (const alias of talent.aliases) { period(alias); }
    for (const affiliation of talent.affiliations) {
      if (!organizations.has(affiliation.organizationId)) fail('unknown organization reference');
      period(affiliation);
      if (affiliation.status === 'current' && affiliation.to !== null) fail('current affiliation cannot have an end date');
    }
    for (let i = 0; i < talent.affiliations.length; i++) for (const b of talent.affiliations.slice(i + 1)) {
      const a = talent.affiliations[i];
      if (a.organizationId !== b.organizationId) continue;
      if (a.status === 'current' && b.status === 'current') fail('duplicate current affiliation');
      if (a.from && a.to && b.from && b.to && a.from < b.to && b.from < a.to) fail('overlapping known affiliation periods');
    }
    const current = talent.affiliations.some(a => a.status === 'current');
    if ((talent.agencyStatus.value === 'affiliated') !== current && talent.agencyStatus.value !== 'unknown') fail('agency state contradicts current affiliations');
    if (current && talent.agencyStatus.value !== 'affiliated') fail('current affiliation requires affiliated agency state');
    for (const account of talent.accounts) {
      const url = new URL(account.url); const host = url.hostname;
      const hosts = { youtube: ['www.youtube.com', 'youtube.com'], x: ['x.com'], twitch: ['www.twitch.tv', 'twitch.tv'], tiktok: ['www.tiktok.com'] };
      if (!hosts[account.service].includes(host)) fail('account service/URL mismatch');
      if (account.service === 'youtube' && account.accountId !== null && (!/^UC[\w-]{22}$/.test(account.accountId) || url.pathname !== `/channel/${account.accountId}`)) fail('YouTube channel ID/URL mismatch');
      if (account.service === 'youtube' && account.accountId === null && !/^\/@[^/]+$/.test(url.pathname)) fail('unknown YouTube ID requires verified handle URL');
      if (account.service !== 'youtube' && account.accountId !== null) {
        const slug = decodeURIComponent(url.pathname).replace(/^\/@?/, '');
        const validSlug = account.service === 'tiktok' ? /^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$/.test(slug) : /^[a-zA-Z0-9_]+$/.test(slug);
        if (!validSlug || slug.toLowerCase() !== account.accountId.toLowerCase()) fail('account ID/URL mismatch');
      }
      const key = accountKey(account);
      if (accounts.has(key)) fail('duplicate account identity'); accounts.set(key, talent.id);
    }
    if (talent.wiki) {
      if (!talent.wiki.url.startsWith('https://wikiwiki.jp/jigjp/')) fail('Wiki page outside jigjp');
    }
    if (talent.profileImage) {
      if (talent.profileImage.url.startsWith('/') && !fs.existsSync(path.join(root, talent.profileImage.url))) fail('missing local profile image');
    }
  }
  if (registry) {
    if (registry.version !== 1 || !Array.isArray(registry.issued)) fail('invalid ID registry');
    const issued = unique(registry.issued, 'registry');
    for (const talent of master.talents) {
    if(talent.historyNamePublic === true && talent.visibility !== "draft") fail("history name approval requires draft visibility");
      if (!issued.has(talent.id)) fail('unissued internal ID');
      const anchor = registry.issued.find(r => r.id === talent.id);
      const matches = anchor.youtubeChannelId ? talent.accounts.some(a => a.service === 'youtube' && a.accountId === anchor.youtubeChannelId) : (anchor.officialProfileUrl === null ? !talent.officialProfileUrl : talent.officialProfileUrl === anchor.officialProfileUrl);
      if (!matches) fail('internal ID identity anchor changed');
    }
    // Retained reserved IDs can outlive public entries; IDs are never recycled.
  }
  if (previous) {
    for (const before of previous.talents) for (const account of before.accounts.filter(a => a.service === 'youtube' && a.accountId)) {
      const now = accounts.get(accountKey(account));
      if (now && now !== before.id) fail('existing identity changed internal ID');
    }
  }
  return master;
}
function loadTalents(root = path.join(__dirname, '..')) {
  return validateTalents(JSON.parse(fs.readFileSync(path.join(root, 'data/talents.json'), 'utf8')), { root, registry: JSON.parse(fs.readFileSync(path.join(root, 'data/talent-id-registry.json'), 'utf8')) });
}
module.exports = { validateTalents, loadTalents, ajv, publicUrl };
