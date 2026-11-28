'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {orderedPeople,sortIds,debutDates}=require('../assets/js/member-order');
const orgs=[{id:'b'},{id:'a'}], person=(id,org,from=null,former=[])=>({id,affiliations:[...former,{organizationId:org,status:'current',from,to:null}],agencyStatus:{value:'affiliated'},activityStatus:{value:'active'}}),event=(id,year,month,day,extra={})=>({visibility:'public',type:'debut',talentIds:[id],groupIds:[],date:{year,month,day},...extra});
test('agency grouping and chronological debut/join order, unknowns retain registration order',()=>{
 const people=[person('unknown2','b'),person('a-old','a','2010-01-01'),person('transfer','b','2025-04-01',[{organizationId:'a',status:'former',from:'2020-01-01',to:'2025-04-01'}]),person('debut','b','2024-01-01'),person('independent-before','b','2025-02-01'),person('unknown1','b')];
 const events=[event('transfer',2020,1,1),event('debut',2025,1,1),event('independent-before',2021,1,1),event('unknown1',null,1,1),event('unknown2',2020,1,1,{visibility:'draft'})];
 const master={organizations:orgs,talents:people},before=structuredClone(master),sorted=orderedPeople(master,events);
 assert.deepEqual(sorted.map(p=>p.id),['debut','independent-before','transfer','unknown2','unknown1','a-old']);
 assert.deepEqual(sortIds(['a-old','transfer','debut'],sorted),['debut','transfer','a-old']);
 assert.deepEqual(master,before);assert(!debutDates(events).has('unknown1'));assert(!debutDates(events).has('unknown2'));
});
test('a transfer with unknown current membership date is not ordered by an old debut date',()=>{
 const p=person('transfer','b',null,[{organizationId:'a',status:'former',from:'2018-01-01',to:'2025-01-01'}]);
 assert.deepEqual(orderedPeople({organizations:orgs,talents:[p,person('new','b','2026-01-01')]},[event('transfer',2018,1,1)]).map(p=>p.id),['new','transfer']);
});
