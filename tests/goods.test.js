'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const core=require('../assets/js/goods-core');const { validateCatalog,loadCatalog,publicCatalog }=require('../lib/catalog');const { loadTalents }=require('../lib/talents');const { goodsPage,goodsCards,relatedProducts,relatedGoods }=require('../lib/goods-pages');
const fixture=require('./fixtures/goods.cjs');
const check=m=>validateCatalog(m.talents,m.catalog,m.anniversaries,m.goods);
test('product/campaign/offer references, unsafe URLs, duplicate IDs and periods are validated',()=>{
 for(const change of [m=>m.goods.offers[0].productId='product-999999',m=>m.goods.offers[0].campaignId='campaign-999999',m=>m.goods.products[0].talentIds=['tal-999999'],m=>m.goods.products[0].groupIds=['group-999999'],m=>m.goods.offers[0].url='javascript:alert(1)',m=>m.goods.offers[0].url='https://wrong.example/?token=secret',m=>m.goods.offers[0].endsAt='2026-10-01T00:00:00Z',m=>m.goods.offers.push(structuredClone(m.goods.offers[0])),m=>m.goods.products[0].privateNote='secret',m=>m.goods.offers[0].price.amount=-1]){
  const m=fixture();change(m);assert.throws(()=>check(m));
 }
 assert.equal(check(fixture()).goods.products.length,1);
});
test('resales retain product identity but get a separate offer ID and sales window',()=>{
 const m=fixture();m.goods.offers.push({...m.goods.offers[0],id:'offer-000002',startsAt:'2027-01-01T00:00:00Z',endsAt:'2027-02-01T00:00:00Z'});
 assert.equal(check(m).goods.products.length,1);assert.equal(m.goods.offers.length,2);
 assert.equal(core.status(m.goods.offers[1],new Date('2026-12-01')),'scheduled');
});
test('time determines planned/end only, never invents sold-out or availability',()=>{
 const o=fixture().goods.offers[0];
 assert.equal(core.status({...o,status:'unknown'},new Date('2026-11-15')),'unknown');
 assert.equal(core.status({...o,endsAt:'2026-11-10T00:00:00Z'},new Date('2026-11-15')),'ended');
 assert.equal(core.status({...o,status:'sold_out'},new Date('2026-11-15')),'sold_out');
 assert.equal(core.status({...o,status:'sold_out',endsAt:'2026-11-10T00:00:00Z'},new Date('2026-11-15')),'ended');
 assert.equal(core.status(o,new Date('2026-11-15')),'on_sale');assert.equal(core.date(null),null);
 assert.match(core.date('2026-12-31T15:00:00Z'),/2027\/01\/01 00:00/);
 assert.equal(core.price({amount:null,currency:null}),'価格未確認');
});
test('empty/missing optional product fields and hostile titles are safe, draft data stays private',()=>{
 const m=check(fixture());const data=publicCatalog(m);const html=goodsCards(data.products,m.talents,data);
 assert.match(html,/日時不明/);assert.match(html,/商品画像なし/);assert.doesNotMatch(html,/<img onerror/);assert.match(html,/&lt;img/);
 assert.match(goodsPage(m.talents,{...data,products:[],offers:[],campaigns:[]}),/グッズは登録されていません/);
 const draft=fixture();draft.goods.products[0].visibility='draft';assert.throws(()=>check(draft),/draft/);
 draft.goods.offers[0].visibility='draft';assert.equal(publicCatalog(check(draft)).products.length,0);
});
test('related goods use talent/group IDs without modifying talent activity',()=>{
 const m=check(fixture());const before=structuredClone(m.talents);const data=publicCatalog(m);
 assert.equal(relatedProducts('tal-000001',m.talents,data).length,1);assert.equal(relatedProducts('tal-000004',m.talents,data).length,0);
 assert.match(relatedGoods('tal-000001',m.talents,data),/関連グッズ/);
 assert.equal(relatedGoods('tal-000004',m.talents,data),'');
 data.products[0].talentIds=[];data.products[0].groupIds=['group-000001'];
 assert.equal(relatedProducts('tal-000004',m.talents,data).length,1);assert.deepEqual(m.talents,before);
});
test('inline public JSON escapes script terminators and round trips without changing content',()=>{
 const { inlineJson }=require('../lib/info-pages');const value={note:'</script><img src=x onerror=alert(1)>'};const encoded=inlineJson(value);
 assert.doesNotMatch(encoded,/<\/script/);assert.deepEqual(JSON.parse(encoded),value);
});

test('explicit sale modes follow exact boundaries without inventing inventory, and resales retain product identity',()=>{
 const o={...fixture().goods.offers[0],saleMode:'preorder',status:'unknown',startsAt:'2026-11-25T12:00:00Z',endsAt:'2026-11-26T12:00:00Z'};
 assert.equal(core.status(o,new Date('2026-11-25T11:59:59.999Z')),'scheduled');
 assert.equal(core.status(o,new Date(o.startsAt)),'on_sale');
 assert.equal(core.offerLabel(o,new Date(o.startsAt)),'受注受付期間中');
 assert.equal(core.status(o,new Date(o.endsAt)),'ended');
 const stock={...o,saleMode:'first_come',endsAt:null};
 assert.equal(core.offerLabel(stock,new Date('2030-01-01')),'販売期間中');
 assert.equal(core.status({...stock,status:'sold_out'},new Date('2030-01-01')),'sold_out');
 assert.equal(core.productAggregate([{...o,status:'ended'},stock],new Date('2030-01-01')).code,'on_sale');
 const m=fixture();m.goods.offers[0]={...m.goods.offers[0],saleMode:'preorder',endsAt:null};assert.throws(()=>check(m),/sale mode/);
});
