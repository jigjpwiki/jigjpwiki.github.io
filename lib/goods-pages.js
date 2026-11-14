'use strict';
const { frame, inlineJson }=require('./info-pages');const { escape }=require('./site-pages');const { sourcesHtml }=require('./talent-details');const { publicUrl }=require('./talents');const core=require('../assets/js/goods-core');
function relatedProducts(id, master, data){
 const groups=data.groups.filter(g=>g.talentIds.includes(id)).map(g=>g.id);
 return data.products.filter(p=>p.talentIds.includes(id)||p.groupIds.some(g=>groups.includes(g)));
}
function goodsCards(products,master,data,now=new Date()){
 const sources=[...master.sources,...data.sources];
 return `<ul class="goods-grid">${products.map(product=>{
  const people=product.talentIds.map(id=>master.talents.find(t=>t.id===id)).filter(Boolean);
  const groups=product.groupIds.map(id=>data.groups.find(g=>g.id===id)).filter(Boolean);
  const offers=data.offers.filter(o=>o.productId===product.id);
  const image=product.image&&(publicUrl(product.image)||(/^\/assets\/[\w./-]+$/.test(product.image)&&!product.image.split('/').includes('..')))?product.image:null;
  return `<li class="goods-card"><div class="goods-image"><span>${image?'画像を表示できません':'商品画像未確認'}</span>${image?`<img src="${escape(image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:''}</div><h2>${escape(product.title)}</h2><p>${people.map(t=>`<a href="/talents/${t.id}/">${escape(t.displayName)}</a>`).join('・')}${groups.map(g=>`<span>${escape(g.name)}</span>`).join('・')}</p>
${offers.length?offers.map(offer=>{const campaign=data.campaigns.find(c=>c.id===offer.campaignId);return `<section class="goods-offer" data-offer-id="${offer.id}" aria-label="販売情報">${campaign?`<h3>${escape(campaign.title)}</h3>`:''}<p class="goods-status">${core.labels[core.status(offer,now)]}</p><p>${escape(core.price(offer.price))}</p><p>開始：${core.date(offer.startsAt)||'日時不明'}<br>終了：${core.date(offer.endsAt)||'日時不明'}</p>${offer.periodNote?`<p>${escape(offer.periodNote)}</p>`:''}${publicUrl(offer.url)?`<p><a href="${escape(offer.url)}" rel="noreferrer">販売サイトで確認</a></p>`:''}${sourcesHtml(offer.sourceRefs,sources)}</section>`;}).join(''):'<p>価格・販売期間・販売状態は未確認です。</p>'}
${sourcesHtml(product.sourceRefs,sources)}</li>`;
 }).join('')}</ul>`;
}
function enhancement(offers) { return `<script type="application/json" id="goods-data">${inlineJson(offers)}</script><script src="/assets/js/goods-core.js" defer></script><script src="/assets/js/goods.js" defer></script>`; }
function goodsPage(master,data,now=new Date()){
 return frame('グッズ情報','/goods/',`<p>公式情報で確認したグッズと販売情報を掲載します。在庫を常時監視していないため、確認日時と販売サイトをご確認ください。送料・税の扱いは購入先の表記をご確認ください。</p><p>販売期間の経過と売り切れは別に扱います。終了日時が分からない場合は補完しません。</p><p id="goods-notice" role="status"></p>${data.products.length?goodsCards(data.products,master,data,now):'<p class="empty-state">公開できる根拠を確認したグッズはまだ登録されていません。販売中の商品がないことを意味しません。</p>'}<noscript><p>販売状態はビルド時点の確認情報です。最新情報は販売サイトでご確認ください。</p></noscript>`,enhancement(data.offers));
}
function relatedGoods(id,master,data){const products=relatedProducts(id,master,data);return products.length?`<section class="profile-section"><h2>関連グッズ</h2>${goodsCards(products,master,data)}<p><a href="/goods/">グッズ一覧へ</a></p></section>${enhancement(data.offers.filter(o=>products.some(p=>p.id===o.productId)))}`:'';}
module.exports={goodsCards,goodsPage,relatedProducts,relatedGoods};
