'use strict';
const { loadCatalog }=require('../../lib/catalog'); const { loadTalents }=require('../../lib/talents');
function fixture(){
 const m=structuredClone(loadCatalog(loadTalents()));
 m.goods={schemaVersion:2,products:[],campaigns:[],offers:[]};
 m.goods.products.push({id:'product-000001',title:'検証専用 <img onerror=x>',talentIds:['tal-000001'],groupIds:[],image:null,visibility:'public'});
 m.goods.campaigns.push({id:'campaign-000001',title:'検証用販売企画',visibility:'public'});
 m.goods.offers.push({id:'offer-000001',productId:'product-000001',campaignId:'campaign-000001',price:{amount:1000,currency:'JPY'},startsAt:'2026-11-01T00:00:00Z',endsAt:null,periodNote:null,url:'https://store.example/items/1',status:'on_sale',visibility:'public'});return m;
}
module.exports=fixture;
