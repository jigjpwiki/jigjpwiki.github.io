'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ajv } = require('./talents');
ajv.addSchema(require('../schemas/feature-common.schema.json'));
const mediaShape = ajv.compile(require('../schemas/media.schema.json'));
const eventShape = ajv.compile(require('../schemas/events.schema.json'));
const read = (root, name) => JSON.parse(fs.readFileSync(path.join(root, 'data', name + '.json'), 'utf8'));
const fail = message => { throw new Error('Invalid feature catalog: ' + message); };
function unique(rows, field = 'id') {
  const map = new Map();
  for (const row of rows) { if (map.has(row[field])) fail('duplicate ' + field); map.set(row[field], row); }
  return map;
}
function context(talents, catalog, media) {
  return { talents: unique(talents.talents), organizations: unique(talents.organizations), groups: unique(catalog.groups), videos: unique(media.videos, 'youtubeId') };
}
function references(ids, map, label) { if (ids.some(id => !map.has(id))) fail('missing ' + label); }
function periodBounds(time) {
  if (time.precision === 'unknown') return null;
  const start = Date.parse(time.precision === 'instant' ? time.value : time.value + (time.precision === 'month' ? '-01' : '') + 'T00:00:00+09:00');
  if (!Number.isFinite(start)) fail('invalid date');
  let end = start;
  if (time.precision === 'date') end += 86400000 - 1;
  if (time.precision === 'month') { const [y,m] = time.value.split('-').map(Number); end = Date.UTC(y, m, 1) - 9*3600000 - 1; }
  return { start, end };
}
function period(row) {
  const start = periodBounds(row.starts), end = periodBounds(row.ends);
  if (start && end && end.end < start.start) fail('reversed event/slot period');
}
function validateMedia(media) {
  if (!mediaShape(media)) fail(ajv.errorsText(mediaShape.errors));
  unique(media.videos, 'youtubeId');
  for (const v of media.videos) {
    if (v.startedAt && v.endedAt && v.endedAt < v.startedAt) fail('reversed video period');
  }
  return media;
}
function videoRefs(row, ctx, visible) {
  references(row.videoIds, ctx.videos, 'video');
  if (visible && row.videoIds.some(id => ctx.videos.get(id).visibility !== 'public')) fail('public reference to draft video');
}
function validateRegistry(registry, rows) {
  if (registry.version !== 1 || !Array.isArray(registry.issued) || new Set(registry.issued).size !== registry.issued.length) fail('invalid feature registry');
  if (rows.some(row => !registry.issued.includes(row.id))) fail('unissued feature ID');
}
function validateEvents(talents, catalog, media, data, registry) {
  validateMedia(media);
  if (!eventShape(data)) fail(ajv.errorsText(eventShape.errors));
  unique(data.events); unique(data.events.flatMap(e => e.slots));
  const ctx = context(talents, catalog, media);
  for (const e of data.events) {
    const visible = e.visibility === 'public'; period(e);
    references(e.talentIds, ctx.talents, 'talent'); references([...e.organizerIds,...e.relatedOrganizationIds], ctx.organizations, 'organization'); references(e.groupIds, ctx.groups, 'group');
    if (visible && e.groupIds.some(id => ctx.groups.get(id).visibility !== 'public')) fail('public reference to draft group');
    videoRefs(e, ctx, visible);
    if (e.fee.amount !== null && e.fee.currency === null) fail('fee needs currency');
    for (const slot of e.slots) {
      period(slot); references(slot.talentIds, ctx.talents, 'slot talent'); videoRefs(slot, ctx, visible);
      const outerStart=periodBounds(e.starts), outerEnd=periodBounds(e.ends), start=periodBounds(slot.starts), end=periodBounds(slot.ends);
      if (outerStart && start && start.end < outerStart.start || outerEnd && start && start.start > outerEnd.end || outerStart && end && end.end < outerStart.start || outerEnd && end && end.start > outerEnd.end) fail('slot outside event period');
    }
  }
  if (registry) validateRegistry(registry, [...data.events,...data.events.flatMap(e=>e.slots)]);
  return { ...data, media, ctx };
}
function loadEvents(talents, catalog, root = path.join(__dirname, '..')) {
  return validateEvents(talents, catalog, read(root,'media'), read(root,'events'), read(root,'feature-id-registry'));
}
function projectEvents(model) {
  const events=model.events.filter(e=>e.visibility==='public');
  const used=new Set(events.flatMap(e=>[...e.videoIds,...e.slots.flatMap(s=>s.videoIds)]));
  return { events, videos:model.media.videos.filter(v=>used.has(v.youtubeId)&&v.visibility==='public') };
}
module.exports = { read, fail, unique, context, references, periodBounds, period, validateMedia, validateRegistry, validateEvents, loadEvents, projectEvents };
