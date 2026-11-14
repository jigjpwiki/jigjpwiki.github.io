'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { validateCatalog, loadCatalog, publicCatalog } = require('../lib/catalog');
const { loadTalents } = require('../lib/talents'); const core = require('../assets/js/anniversary-core');
const talents = loadTalents();
const model = () => structuredClone(loadCatalog(talents));
function check(m) { return validateCatalog(m.talents,m.catalog,m.anniversaries,m.goods); }
const bad = mutate => { const m = model(); mutate(m); assert.throws(() => check(m)); };
test('verified seed has eight events, no birth years, and independent talent state', () => {
  const m = model(); assert.equal(m.anniversaries.events.length,8);
  assert(m.anniversaries.events.filter(e=>e.type==='birthday').every(e=>e.date.year===null&&!e.countYears));
  assert.equal(m.talents.talents[3].activityStatus.value,'unknown'); assert.equal(m.talents.talents[3].affiliations[0].status,'former');
});
test('catalog schemas and cross references reject invalid IDs, subjects, sources and dates', () => {
  bad(m=>m.anniversaries.events.push(structuredClone(m.anniversaries.events[0])));
  bad(m=>m.catalog.groups[0].talentIds.push('tal-999999'));
  bad(m=>m.anniversaries.events[0].groupIds.push('group-999999'));
  bad(m=>m.anniversaries.events[0].sourceRefs=['src-missing']);
  bad(m=>m.anniversaries.events[0].date={year:2026,month:2,day:29});
  bad(m=>m.anniversaries.events[0].countYears=true);
  bad(m=>m.anniversaries.events[0].recursYearly=false);
  bad(m=>m.anniversaries.events[0].privateNotes='secret');
  bad(m=>m.catalog.sources[0].url='https://user:password@example.com/');
});
test('public projections exclude drafts and their sources; public/draft references are rejected', () => {
  const m=model(); m.anniversaries.events[0].visibility='draft';
  assert.equal(publicCatalog(check(m)).events.length,7);
  m.catalog.groups[0].visibility='draft';assert.throws(()=>check(m),/draft group/);
});
test('JST day, 30-day end-exclusive range and year rollover are timezone independent', () => {
  assert.equal(core.jstToday(new Date('2026-12-31T15:00:00Z')),'2027-01-01');
  assert.equal(core.addDays('2026-12-25',30),'2027-01-24');
  const events=model().anniversaries.events;
  assert(core.between(events,'2026-12-25','2027-01-24').some(e=>e.event.talentIds.includes('tal-000001')));
  assert.equal(core.monthShift('2026-12',1),'2027-01');assert.equal(core.monthShift('2027-01',-1),'2026-12');
});
test('leap birthdays stay on Feb 29, no inferred age, first year and multiple same-day anniversaries', () => {
  const e=structuredClone(model().anniversaries.events[0]);e.date={year:null,month:2,day:29};
  assert.equal(core.occurrence(e,2027),null);assert.equal(core.occurrence(e,2028).day,'2028-02-29');assert.equal(core.occurrence(e,2028).years,null);
  const debut=model().anniversaries.events.find(e=>e.type==='debut');
  assert.equal(core.occurrence(debut,2024),null);assert.equal(core.occurrence(debut,2025).years,0);assert.equal(core.occurrence(debut,2027).years,2);
  assert.equal(core.between(model().anniversaries.events,'2027-03-07','2027-03-08').length,4);
});
test('calendar filters, empty states, HTML escaping and unsafe external URL suppression', () => {
  const pub=publicCatalog(model());const m={...pub,people:talents.talents,organizations:talents.organizations,detailsReady:false};
  assert.equal(core.filtered(m,{type:'debut'}).length,3);assert.equal(core.filtered(m,{organization:'org-000001'}).length,8);
  assert.match(core.calendar({...m,events:[]},'2026-11','2026-11-15'),/確認済み記念日はありません/);
  m.events[0].title='<img onerror=alert(1)>';
  assert.doesNotMatch(core.calendar(m,'2027-01','2026-11-15'),/<img onerror/);
  m.sources=[{id:'src-x',url:'javascript:alert(1)',checkedAt:'2026-01-01T00:00:00Z'}];
  assert.equal(core.sourceLinks({sourceRefs:['src-x']},m),'');
});
test('published catalog files contain no ID registry, schemas, drafts or unimplemented goods', () => {
 const fs=require('node:fs');const path=require('node:path');const root=path.join(__dirname,'../_site');
 assert(fs.existsSync(path.join(root,'anniversaries/index.html')));
 const data=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json')));
 assert(data.groups.every(g=>g.visibility==='public'));
 for(const file of ['data/catalog-id-registry.json','data/goods.json','schemas/catalog.schema.json','data/talent-id-registry.json']) assert(!fs.existsSync(path.join(root,file)));
});
