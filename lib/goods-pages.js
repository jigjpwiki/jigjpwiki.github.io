'use strict';
const { inlineJson }=require('./info-pages');const { escape }=require('./site-pages');const { publicUrl }=require('./talents');const {featureFrame,filters,rowData,personLinks,filterScript}=require('./feature-pages');const core=require('../assets/js/goods-core');
const visible=rows=>(rows||[]).filter(r=>r.visibility==='public');
function relatedProducts(id, master, data){const groups=data.groups.filter(g=>g.talentIds.includes(id)).map(g=>g.id);return data.products.filter(p=>p.talentIds.includes(id)||p.groupIds.some(g=>groups.includes(g)));}
function entries(data,products=data.products){
 const items=visible(products),ids=new Set(items.map(p=>p.id)),offers=visible(data.offers).filter(o=>ids.has(o.productId));
 const campaigns=visible(data.campaigns).map(c=>{const sales=offers.filter(o=>o.campaignId===c.id),ps=items.filter(p=>sales.some(o=>o.productId===p.id));return {...c,kind:'campaign',products:ps,offers:sales};});
 const singles=items.filter(p=>!offers.some(o=>o.productId===p.id)||offers.some(o=>o.productId===p.id&&o.campaignId===null)).map(p=>({...p,kind:'product',products:[p],offers:offers.filter(o=>o.productId===p.id&&o.campaignId===null)}));
 return [...campaigns,...singles];
}
const route=e=>e.kind==='campaign'?`/goods/campaigns/${e.id}/`:`/goods/${e.id}/`;
function picture(url,label='商品画像なし') {const safe=url&&(publicUrl(url)||(/^\/assets\/[\w./-]+$/.test(url)&&!url.split('/').includes('..')));return `<div class="goods-image"><span>${label}</span>${safe?`<img src="${escape(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:''}</div>`;}
function subjects(products){return {talentIds:[...new Set(products.flatMap(p=>p.talentIds))],groupIds:[...new Set(products.flatMap(p=>p.groupIds))]};}
function people(subject,master,data,limit=Infinity){const shown={...subject,talentIds:subject.talentIds.slice(0,limit)};return `${shown.talentIds.length?personLinks(shown.talentIds,master):''}${subject.talentIds.length>limit?` <span class="content-meta">ほか${subject.talentIds.length-limit}名</span>`:''}${subject.groupIds.map(id=>data.groups.find(g=>g.id===id)).filter(Boolean).map(g=>` <a href="/talents/?group=${g.id}">${escape(g.name)}</a>`).join('')}`;}
const basis=data=>new Date((data.fallbackDate||'2026-11-14')+'T00:00:00+09:00');
function statusMarkup(offers,now){const state=core.productAggregate(offers,now);return '<p class="goods-status" data-goods-state="'+state.code+'" data-offer-ids="'+escape(JSON.stringify(offers.map(o=>o.id)))+'">'+core.aggregateLabel(offers,now)+'</p>';}
const saleKey=o=>JSON.stringify([o.saleMode||'',o.startsAt,o.endsAt,o.url]);
function saleGroups(offers){
 const map=new Map();
 for(const offer of offers){
  const key=saleKey(offer);if(!map.has(key))map.set(key,{key,offer,products:new Set()});
  map.get(key).products.add(offer.productId);
 }
 return [...map.values()].sort((a,b)=>b.products.size-a.products.size);
}
function periodText(o){return (core.date(o.startsAt)||'開始日時不明')+' ～ '+(core.date(o.endsAt)||(o.saleMode==='first_come'?'終了日時未定':'終了日時不明'));}
function archiveCards(rows,master,data,now=basis(data)){
 return '<ul class="goods-grid goods-archive-grid">'+rows.map(e=>{
  const subject=subjects(e.products),state=core.productAggregate(e.offers,now),search=[e.title,...e.products.map(p=>p.title)].join(' ');
  const image=e.image||(e.kind==='product'?e.products[0].image:null);
  const current=saleGroups(e.offers).find(g=>core.status(g.offer,now)==='on_sale')||saleGroups(e.offers)[0];
  return '<li class="goods-card goods-archive-card" data-entry-id="'+e.id+'" data-filter-row="'+rowData({...subject,title:search},master,{status:state.bucket,type:core.modeCode(e.offers)})+'"><a class="goods-cover '+(e.kind==='campaign'?'goods-cover-campaign':'goods-cover-single')+(image?'':' goods-cover-empty')+'" href="'+route(e)+'">'+picture(image,e.kind==='campaign'?'販売企画':'商品画像なし')+'</a><div class="goods-archive-body"><div class="goods-card-kinds"><span class="goods-kind">'+(e.kind==='campaign'?'販売企画 · '+e.products.length+'商品':'単独商品')+'</span><span class="goods-mode">'+escape(core.modeLabel(e.offers))+'</span></div>'+statusMarkup(e.offers,now)+'<h2><a href="'+route(e)+'">'+escape(e.title)+'</a></h2><p class="content-people">'+people(subject,master,data,2)+'</p>'+(current?'<p class="goods-period">'+escape(periodText(current.offer))+'</p>':'')+(e.kind==='product'?'<p class="goods-price">'+([...new Set(e.offers.map(o=>core.price(o.price)))].map(escape).join(' ／ ')||'価格未確認')+'</p>':'')+'<a class="goods-more" href="'+route(e)+'">詳細を見る <span aria-hidden="true">→</span></a></div></li>';
 }).join('')+'</ul>';
}
function goodsCards(products,master,data,now=basis(data),options={}){
 return '<ul class="goods-grid product-grid">'+products.map(p=>{
  const offers=visible(data.offers).filter(o=>o.productId===p.id);
  const title=options.campaignTitle&&p.title.startsWith(options.campaignTitle)?p.title.slice(options.campaignTitle.length).trim():p.title;
  return '<li class="goods-card goods-product-card" data-product-id="'+p.id+'">'+picture(p.image)+'<div class="goods-product-body"><h2><a href="/goods/'+p.id+'/" title="'+escape(p.title)+'">'+escape(title||p.title)+'</a></h2>'+(!options.compact?'<p>'+people(p,master,data)+'</p>':'')+(offers.length?offers.map((o,i)=>{
   const c=visible(data.campaigns).find(c=>c.id===o.campaignId),exception=options.compact&&options.commonSaleKey&&saleKey(o)!==options.commonSaleKey;
   const link=publicUrl(o.url)?'<p><a href="'+escape(o.url)+'" rel="noreferrer">販売サイトで確認</a></p>':'';
   const conditions='<p>'+escape(core.modeLabel([o]))+'<br>開始：'+(core.date(o.startsAt)||'日時不明')+'<br>終了：'+(core.date(o.endsAt)||'日時不明')+'</p>'+link+(o.periodNote?'<p class="content-meta">'+escape(o.periodNote)+'</p>':'');
   return '<section class="goods-offer" data-offer-id="'+o.id+'" aria-label="販売情報">'+(!options.compact&&c?'<h3><a href="/goods/campaigns/'+c.id+'/">'+escape(c.title)+'</a></h3>':'')+(exception?'<span class="goods-kind">個別・追加販売条件</span>':'')+'<p class="goods-status" data-goods-state="'+core.status(o,now)+'">'+core.offerLabel(o,now)+'</p><p class="goods-price">'+escape(core.price(o.price))+'</p>'+(options.compact?'<details'+(exception?' open':'')+'><summary>販売期間・条件</summary>'+conditions+'</details>':conditions)+'</section>';
  }).join(''):'<p>価格・販売情報は未登録です。</p>')+'</div></li>';
 }).join('')+'</ul>';
}
function enhancement(offers,filter=false){return `<script type="application/json" id="goods-data">${inlineJson(visible(offers))}</script><script src="/assets/js/goods-core.js" defer></script><script src="/assets/js/goods.js" defer></script>${filter?filterScript:''}`;}
function notice(now){return `<p id="goods-notice" class="content-meta" role="status"></p><noscript><p>販売状態の基準：${core.date(now.toISOString())}。最新情報は販売サイトでご確認ください。</p></noscript><details class="content-help"><summary>販売状況について</summary><p>在庫を常時確認していません。期間内でも販売中とは限りません。終了した商品も記録を残しています。販売リンクは現在の購入可否を保証しません。</p></details>`;}
function goodsPage(master,data,now=basis(data)){
 const rows=entries(data);
 const form=filters(master,{dates:false,types:{preorder:'受注販売',first_come:'先着販売',mixed:'複数の販売方式',unknown:'販売方式未確認'}}).replace('<label>種類<select','<label>販売方式<select').replace('<button type="reset">','<label>販売状況<select name="status"><option value="">すべて</option><option value="active">販売中・販売予定</option><option value="ended">販売終了</option><option value="unknown">販売状況未確認</option></select></label><button type="reset">');
 return featureFrame('グッズ','/goods/','<div class="goods-page"><p class="goods-intro">販売企画や単独商品ごとに、関連グッズと販売情報を確認できます。</p>'+form+notice(now)+(rows.length?archiveCards(rows,master,data,now):'<p class="empty-state">グッズは登録されていません。</p>')+'</div>',enhancement(data.offers,true));
}
function campaignPage(c,master,data,now=basis(data)){
 const e=entries(data).find(e=>e.kind==='campaign'&&e.id===c.id)||{products:[],offers:[]};
 const subject=subjects(e.products),groups=saleGroups(e.offers);
 const periods=groups.map((g,i)=>'<div class="goods-period-row"><span class="goods-kind">'+(i?'個別・追加販売':'共通販売条件')+'</span><span class="goods-mode">'+escape(core.modeLabel([g.offer]))+'</span><p>'+escape(periodText(g.offer))+'</p><p class="content-meta">'+g.products.size+'商品</p>'+(publicUrl(g.offer.url)?'<a class="feature-action" href="'+escape(g.offer.url)+'" rel="noreferrer">公式販売サイトで確認 ↗</a>':'')+'</div>').join('');
 return featureFrame(c.title,'/goods/campaigns/'+c.id+'/','<div class="goods-page goods-detail"><nav class="breadcrumbs" aria-label="パンくずリスト"><a href="/goods/">グッズ</a> / '+escape(c.title)+'</nav>'+(c.image?'<div class="goods-hero">'+picture(c.image)+'</div>':'')+'<section class="goods-detail-overview"><div class="goods-card-kinds"><span class="goods-kind">販売企画 · '+e.products.length+'商品</span><span class="goods-mode">'+escape(core.modeLabel(e.offers))+'</span></div><p>'+people(subject,master,data,4)+'</p>'+statusMarkup(e.offers,now)+'<h2>受注・販売期間</h2><div class="goods-period-list">'+periods+'</div>'+notice(now)+'</section><h2>商品一覧 · 全'+e.products.length+'商品</h2>'+goodsCards(e.products,master,{...data,offers:e.offers},now,{compact:true,campaignTitle:c.title,commonSaleKey:groups[0]?.key})+'<p><a href="/goods/">← グッズ一覧へ</a></p></div>',enhancement(e.offers));
}
function productPage(p,master,data,now=basis(data)){return featureFrame(p.title,`/goods/${p.id}/`,`<div class="goods-page goods-detail"><nav class="breadcrumbs" aria-label="パンくずリスト"><a href="/goods/">グッズ</a> / ${escape(p.title)}</nav>${notice(now)}${goodsCards([p],master,data,now)}${p.identityUrl?`<p><a href="${escape(p.identityUrl)}" rel="noreferrer">公式の商品情報</a></p>`:''}</div>`,enhancement(data.offers.filter(o=>o.productId===p.id)));}
function relatedGoods(id,master,data){const ps=relatedProducts(id,master,data),ids=new Set(ps.map(p=>p.id));const rows=entries(data).filter(e=>e.products.some(p=>ids.has(p.id)));return rows.length?`<section class="profile-section"><h2>関連グッズ</h2>${archiveCards(rows,master,data)}<p><a href="/goods/?talent=${id}">グッズ一覧へ</a></p></section>${enhancement(data.offers)}`:'';}
module.exports={entries,archiveCards,campaignPage,productPage,goodsCards,goodsPage,relatedProducts,relatedGoods};
