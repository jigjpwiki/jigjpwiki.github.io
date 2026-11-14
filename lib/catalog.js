'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ajv } = require('./talents');
const shapes = Object.fromEntries(['catalog', 'anniversaries', 'goods'].map(name => [name, ajv.compile(require(`../schemas/${name}.schema.json`))]));
function validateCatalog(talents, catalog, anniversaries, goods, registry) {
  const fail = text => { throw new Error('Invalid catalog: ' + text); };
  for (const [name, data] of Object.entries({ catalog, anniversaries, goods })) if (!shapes[name](data)) fail(name + ': ' + ajv.errorsText(shapes[name].errors));
  const unique = (rows, label) => { const map = new Map(); for (const row of rows) { if (map.has(row.id)) fail('duplicate ' + label); map.set(row.id, row); } return map; };
  const people = unique(talents.talents, 'talent'); const orgs = unique(talents.organizations, 'organization');
  const sources = unique([...talents.sources, ...catalog.sources], 'source');
  const groups = unique(catalog.groups, 'group'); const products = unique(goods.products, 'product'); const campaigns = unique(goods.campaigns, 'campaign');
  unique(anniversaries.events, 'anniversary'); unique(goods.offers, 'offer');
  const evidence = row => { for (const id of row.sourceRefs) if (!sources.has(id)) fail('missing source'); };
  const official = row => row.sourceRefs.some(id => sources.get(id)?.kind === 'official');
  const subjects = row => {
    if (!row.talentIds.length && !row.groupIds.length) fail('missing subject');
    for (const id of row.talentIds) if (!people.has(id)) fail('missing talent');
    for (const id of row.groupIds) {
      if (!groups.has(id)) fail('missing group');
      if (row.visibility === 'public' && groups.get(id).visibility !== 'public') fail('public reference to draft group');
    }
  };
  for (const source of catalog.sources) if (Date.parse(source.checkedAt) > Date.now() + 300000) fail('future verification date');
  for (const group of groups.values()) {
    evidence(group); if (!official(group)) fail('group needs official source');
    if (group.organizationId !== null && !orgs.has(group.organizationId)) fail('missing organization');
    for (const id of group.talentIds) if (!people.has(id)) fail('missing group talent');
  }
  for (const event of anniversaries.events) {
    evidence(event); subjects(event);
    const { year, month, day } = event.date; const d = new Date(Date.UTC(year ?? 2000, month - 1, day));
    if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) fail('invalid anniversary date');
    if (!event.recursYearly && year === null) fail('one-off needs year');
    if (event.countYears && (year === null || !event.recursYearly || event.type === 'birthday')) fail('invalid anniversary count / inferred age');
    if (event.visibility === 'public' && !official(event)) fail('public event needs official source');
  }
  for (const product of products.values()) { evidence(product); subjects(product); if (product.visibility === 'public' && !official(product)) fail('public product needs official source'); }
  for (const campaign of campaigns.values()) evidence(campaign);
  for (const offer of goods.offers) {
    evidence(offer);
    if (!products.has(offer.productId) || (offer.campaignId !== null && !campaigns.has(offer.campaignId))) fail('missing product/campaign');
    if (offer.visibility === 'public' && (products.get(offer.productId).visibility !== 'public' || (offer.campaignId !== null && campaigns.get(offer.campaignId).visibility !== 'public'))) fail('public offer references draft');
    if (offer.visibility === 'public' && !official(offer)) fail('public offer needs official source');
    if (offer.startsAt && offer.endsAt && Date.parse(offer.startsAt) >= Date.parse(offer.endsAt)) fail('reversed offer period');
    if (offer.price.amount !== null && offer.price.currency === null) fail('price needs currency');
    if (offer.price.currency === 'JPY' && offer.price.amount !== null && !Number.isInteger(offer.price.amount)) fail('JPY must be integer');
  }
  const all = [...catalog.groups, ...anniversaries.events, ...goods.products, ...goods.campaigns, ...goods.offers];
  if (registry) {
    if (registry.version !== 1 || !Array.isArray(registry.issued) || new Set(registry.issued).size !== registry.issued.length) fail('invalid ID registry');
    for (const row of all) if (!registry.issued.includes(row.id)) fail('unissued ID');
  }
  return { talents, catalog, anniversaries, goods };
}
function loadCatalog(talents, root = path.join(__dirname, '..')) {
  const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name + '.json'), 'utf8'));
  return validateCatalog(talents, read('catalog'), read('anniversaries'), read('goods'), read('catalog-id-registry'));
}
function publicCatalog(model) {
  const visible = rows => rows.filter(r => r.visibility === 'public');
  const groups = visible(model.catalog.groups); const events = visible(model.anniversaries.events);
  const products = visible(model.goods.products); const campaigns = visible(model.goods.campaigns); const offers = visible(model.goods.offers);
  const used = new Set([...groups, ...events, ...products, ...campaigns, ...offers].flatMap(r => r.sourceRefs));
  return { groups, events, products, campaigns, offers, sources: [...model.talents.sources, ...model.catalog.sources].filter(s => used.has(s.id)) };
}
module.exports = { validateCatalog, loadCatalog, publicCatalog };
