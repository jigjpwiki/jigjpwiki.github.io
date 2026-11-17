'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {loadTalents,validateTalents}=require('../lib/talents');
const {loadCatalog,validateCatalog}=require('../lib/catalog');
// Historical expansion snapshot from main immediately before PR #36 (parent of e0e73c1df).
// Admin may update today's states; this fixture records the original migration expectations.
const historical=require('./fixtures/expansion-states.json');
const frozen=require('./fixtures/catalog-review-history.json');const historicalMaster=validateTalents(structuredClone(frozen.talents),{registry:frozen['talent-id-registry']});const historicalCatalog=validateCatalog(historicalMaster,frozen.catalog,frozen.anniversaries,frozen.goods,frozen['catalog-id-registry']);
const master=loadTalents();const catalog=loadCatalog(master);const accepted=require('../docs/data-expansion/accepted.json');const candidates=require('../docs/data-expansion/candidates.json');
test('verified expansion retains the four original identities and independently records candidate outcomes',()=>{
 assert.equal(historical.length,97);
 for(const row of historical)assert(master.talents.some(t=>t.id===row.id));
 // Identity anchors are immutable; names, images and other verified profile fields may evolve.
 const registry=require('../data/talent-id-registry.json');
 const identities=require('./fixtures/foundation-identities.json');
 for(const identity of identities){
  assert(master.talents.some(t=>t.id===identity.id));
  assert.deepEqual(registry.issued.find(row=>row.id===identity.id),identity);
 }
 assert.doesNotThrow(()=>validateTalents(master,{registry,previous:{...master,talents:require('./fixtures/foundation-talents.json')}}));
 assert.equal(accepted.length,93);assert.equal(candidates.length,127);assert.equal(candidates.filter(r=>r.result==='held').length,30);
 assert.equal(new Set(candidates.map(r=>r.name)).size,candidates.length);
 for(const r of accepted){const t=master.talents.find(t=>t.id===r.id);assert.equal(historical.find(t=>t.id===r.id).displayName,r.name);assert.equal(candidates.find(c=>c.id===r.id)?.result,'registered');assert.equal(registry.issued.find(a=>a.id===t.id)?.officialProfileUrl,r.identityUrl);}
 for(const r of candidates.filter(r=>r.result==='held'))assert(!historical.some(t=>t.displayName===r.name));
});
test('historical expansion keeps former affiliations and separately confirmed activity endings',()=>{
 const added=historical.slice(4);assert.equal(added.filter(t=>t.affiliations.some(a=>a.status==='former')).length,13);
 const knownEnded=new Set(['日本晴ここ','六連星なる','月宮あお','鎖乙女がぶ','彩音るか','愛染アネラ']);
 for(const t of added){assert.equal(t.activityStatus.value,knownEnded.has(t.displayName)?'ended':'unknown');if(t.affiliations.some(a=>a.status==='former'))assert.equal(t.agencyStatus.value,'unknown');}
 const naru=historicalMaster.talents.find(t=>t.displayName==='なる'),old=historicalMaster.talents.find(t=>t.displayName==='六連星なる');assert.notEqual(naru.id,old.id);assert.equal(historical.find(t=>t.id===naru.id).activityStatus.value,'unknown');assert.equal(naru.accounts[0].accountId,'UCMX0Mn5PTjojdQL8MN1B5Vg');
 assert(!historicalCatalog.anniversaries.events.some(e=>e.talentIds.includes(naru.id)));
});
test('official organization channels and duplicate monitor rows cannot become individual talents',()=>{
 const blocked=new Set(['UClUMpS4UZ_2VrKk3HdNtIBA','UC6dbYB8hZyZe15ofN-KI6sg','UC4BwtvtE6flwK-EnmB5c9uQ','UCW6HkTVWnOUgLd-N1lThXWA','UC_cCW1xmXwRFp1tX-RD2X1Q']);
 const channels=master.talents.flatMap(t=>t.accounts.filter(a=>a.service==='youtube'&&a.accountId).map(a=>a.accountId));assert.equal(new Set(channels).size,channels.length);assert(!channels.some(id=>blocked.has(id)));
 const uto=historicalMaster.talents.find(t=>t.displayName==='猫乃間うと');assert.equal(uto.accounts.find(a=>a.service==='youtube').accountId,'UCOH9jshsynMeCSRlPhiCSvw');
 const kuromaru=historicalMaster.talents.find(t=>t.displayName==='小澄くろまる');assert.equal(kuromaru.accounts.find(a=>a.service==='youtube').accountId,'UC1Eq7ExEH0XO380it8cZYZg');
});
test('TikTok dot handles are supported without weakening other account URL or credential validation',()=>{
 const t=historicalMaster.talents.find(t=>t.displayName==='ローズ・ダマスクハート');assert.equal(t.accounts.find(a=>a.service==='tiktok').accountId,'rose.damaskht');
 for(const mutation of [a=>a.accountId='wrong',a=>a.url='https://www.tiktok.com/@rose.damaskht?token=secret',a=>{a.service='x';a.url='https://x.com/rose.damaskht';}]){const copy=structuredClone(historicalMaster);const a=copy.talents.find(row=>row.displayName==='ローズ・ダマスクハート').accounts.find(a=>a.service==='tiktok');mutation(a);assert.throws(()=>validateTalents(copy));}
});
test('anniversary semantics reject duplicate facts with different IDs; join announcements are not debut dates',()=>{
 const catalog=historicalCatalog;
 assert.equal(catalog.anniversaries.events.length,91);
 const copy=structuredClone(catalog);copy.anniversaries.events.push({...copy.anniversaries.events[0],id:'ann-999999',title:'different title'});assert.throws(()=>validateCatalog(copy.talents,copy.catalog,copy.anniversaries,copy.goods),/duplicate anniversary/);
 const names=new Map(historicalMaster.talents.map(t=>[t.id,t.displayName]));const debuts=catalog.anniversaries.events.filter(e=>e.type==='debut');
 assert(!debuts.some(e=>e.talentIds.some(id=>names.get(id)==='なかもとおまち')));
 const siyham=debuts.find(e=>e.talentIds.some(id=>names.get(id)==='しーはむ'));assert.deepEqual(siyham.date,{year:null,month:2,day:10});assert.equal(siyham.countYears,false);
 assert(catalog.anniversaries.events.filter(e=>e.type==='birthday').every(e=>e.date.year===null&&!e.countYears));
});
