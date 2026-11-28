'use strict';
// Business-rule examples use an immutable baseline; current masters are checked separately.
const historicalRoot=require('./fixtures/historical-root.cjs')();
const test=require('node:test'),assert=require('node:assert/strict');
const goods=require('../assets/js/goods-core'),events=require('../assets/js/events-core'),ann=require('../assets/js/anniversary-core'),filters=require('../assets/js/catalog-filter');
const {loadTalents}=require('../lib/talents'),{loadCatalog,publicCatalog}=require('../lib/catalog');
const pages=require('../lib/goods-pages'),master=loadTalents(historicalRoot),data=publicCatalog(loadCatalog(master,historicalRoot));
const now=new Date('2026-11-20T00:00:00Z');
const offer=(status,extra={})=>({status,startsAt:null,endsAt:null,...extra});
test('campaign view groups all seven Kotoha products without changing IDs, prices or offers',()=>{
 const before=structuredClone(data),rows=pages.entries(data),c=rows.find(e=>e.id==='campaign-000001');
 assert.equal(c.products.length,7);assert.equal(c.offers.length,7);assert.equal(rows.filter(e=>e.id==='campaign-000001').length,1);
 const html=pages.campaignPage(data.campaigns[0],master,data,now);
 for(const p of c.products)assert(html.includes(`/goods/${p.id}/`));
 for(const o of c.offers){assert(html.includes(o.id));assert(html.includes(o.url));assert(html.includes(goods.price(o.price)));}
 assert.equal((html.match(/data-product-id=/g)||[]).length,7);
 const product=pages.productPage(c.products[0],master,data);assert(product.includes('/goods/campaigns/campaign-000001/'));
 assert(pages.relatedGoods('tal-000010',master,data).includes('/goods/campaigns/campaign-000001/'));
 assert.deepEqual(data,before);
});
test('null-campaign, offerless products, repeat campaigns and draft records remain distinct',()=>{
 const d=structuredClone(data),p=d.products[0];d.offers.push({...d.offers[0],id:'offer-999999',campaignId:null});
 assert(pages.entries(d).some(e=>e.id===p.id&&e.kind==='product'));
 d.offers=d.offers.filter(o=>o.productId!==d.products[1].id);assert(pages.entries(d).some(e=>e.id===d.products[1].id));
 d.products[0].visibility='draft';assert(!pages.entries(d).some(e=>e.products.some(p=>p.id===d.products[0].id)));
 d.campaigns[1].visibility='draft';assert(!pages.entries(d).some(e=>e.id===d.campaigns[1].id));
});
test('aggregate is order independent; partial sales, unknown stock, sold out and repeat periods stay separate',()=>{
 const cases=[ [[], 'unknown'], [[offer('unknown')],'unknown'],[[offer('on_sale')],'on_sale'],[[offer('scheduled')],'scheduled'],[[offer('sold_out')],'sold_out'],[[offer('ended')],'ended'],[[offer('on_sale'),offer('unknown')],'partial_sale'],[[offer('on_sale'),offer('sold_out')],'partial_sale'],[[offer('ended'),offer('unknown')],'unknown'],[[offer('ended'),offer('sold_out')],'closed'],[[offer('ended'),offer('unknown',{startsAt:'2027-01-01T00:00:00Z'})],'partial_scheduled'] ];
 for(const [rows,expected]of cases){const before=structuredClone(rows);assert.equal(goods.aggregate(rows,now).code,expected);assert.deepEqual(goods.aggregate(rows,now),goods.aggregate([...rows].reverse(),now));assert.deepEqual(rows,before);}
 assert.equal(goods.aggregate([offer('unknown',{startsAt:'2026-01-01T00:00:00Z'})],now).code,'unknown');
 const expired=offer('sold_out',{endsAt:'2026-11-19T15:00:00Z'});assert.equal(goods.status(expired,now),'ended');
 assert.equal(goods.aggregate([expired,offer('unknown')],now).bucket,'unknown');
 assert.equal(goods.aggregate([expired,offer('on_sale')],now).bucket,'active');
});
test('expired campaigns remain rendered, stable static baseline does not depend on build date',t=>{
 const before=structuredClone(data),past=pages.goodsPage(master,data,new Date('2035-01-01T00:00:00Z'));
 for(const c of data.campaigns)assert(past.includes(`/goods/campaigns/${c.id}/`));
 assert(past.includes('販売終了'));assert(past.includes('販売状態の基準'));assert.deepEqual(data,before);
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-20T00:00:00Z')});
 const first=pages.goodsPage(master,data);t.mock.timers.setTime(Date.parse('2035-01-01T00:00:00Z'));assert.equal(pages.goodsPage(master,data),first);
});
test('events use known ends first and otherwise move to past at the latest known start in JST',()=>{
 const instant=value=>({precision:'instant',value}),unknown={precision:'unknown',value:null};
 assert.equal(events.phase({starts:instant('2026-11-19T00:00:00Z'),ends:unknown},now),'past');
  assert.equal(events.phase({starts:instant(now.toISOString()),ends:unknown},now),'past');
  assert.equal(events.phase({starts:{precision:'date',value:'2026-11-20'},ends:unknown},now),'upcoming');
  assert.equal(events.phase({starts:{precision:'date',value:'2026-11-20'},ends:unknown},new Date('2026-11-21T00:00:00+09:00')),'past');
  assert.equal(events.phase({starts:{precision:'month',value:'2026-11'},ends:unknown},now),'upcoming');
  assert.equal(events.phase({starts:{precision:'month',value:'2026-11'},ends:unknown},new Date('2026-12-01T00:00:00+09:00')),'past');
 assert.equal(events.phase({starts:unknown,ends:unknown},now),'unknown');
 assert.equal(events.phase({starts:instant('2026-11-21T00:00:00Z'),ends:unknown},now),'upcoming');
 assert.equal(events.phase({starts:instant('2026-11-19T00:00:00Z'),ends:instant('2026-11-21T00:00:00Z')},now),'ongoing');
 assert.equal(events.phase({starts:unknown,ends:{precision:'date',value:'2026-11-19'}},now),'past');
 assert.equal(events.bounds({precision:'month',value:'2026-12'}).end,Date.parse('2027-01-01T00:00:00+09:00'));
});
test('anniversary query validation preserves linked events, leap days and safe defaults',()=>{
 const model={events:data.events,organizations:master.organizations};
 const view=ann.viewFromQuery('?date=2028-02-29&type=birthday&organization=org-000001',model,'2027-12-31');assert.equal(view.day,'2028-02-29');assert.equal(view.type,'birthday');
 const bad=ann.viewFromQuery('?date=2027-02-29&month=9999-99&type=__proto__&organization=org-999999',model,'2027-12-31');assert.deepEqual(bad,{day:'2027-12-31',month:'2027-12',type:'',organization:''});
 assert.equal(ann.viewFromQuery('?event=ann-000007',model,'2027-01-01').day,'2027-03-07');
});
test('category/status/search filters compose and malformed dates are refused',()=>{
 const row={search:'テスト 曲',category:'videos',type:'cover',talent:['tal-000010'],organization:['org-000003'],status:'unknown'};
 assert(filters.matches(row,{q:'テスト',category:'videos',type:'cover',talent:'tal-000010',status:'unknown'}));assert(!filters.matches(row,{category:'songs'}));assert(!filters.validDay('2027-02-29'));assert(filters.validDay('2028-02-29'));
});

test('anniversary dashboard groups dates, separates today, respects JST and filters',()=>{
 const mk=(id,day,type='birthday')=>({id,type,title:'試験'+id,talentIds:[],groupIds:[],date:{year:null,month:12,day},recursYearly:true,countYears:false});
 const m={events:[mk('a',1),mk('b',2),mk('c',2,'debut'),mk('d',30),mk('e',31)],groups:[],people:[],organizations:[]};
 assert.equal(ann.jstToday(new Date('2026-11-30T15:00:00Z')),'2026-12-01');
 assert.deepEqual(ann.horizon(m,'2026-12-01').map(x=>x.event.id),['a','b','c','d']);
 assert.deepEqual(ann.horizon(m,'2026-12-01',{},true).map(x=>x.event.id),['b','c','d']);
 const html=ann.upcoming(m,'2026-12-01',{},true,true);
 assert.equal((html.match(/class="agenda-day"/g)||[]).length,2);
 assert.match(html,/あと1日/);assert.match(html,/あと29日/);assert.match(html,/data-anniversary-day="2026-12-02"/);
 assert.doesNotMatch(html,/data-event-id="a"/);assert.match(ann.todayEvents(m,'2026-12-01'),/data-event-id="a"/);
 assert.doesNotMatch(ann.todayEvents(m,'2026-12-01',{type:'debut'}),/data-event-id=/);
});
