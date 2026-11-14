'use strict';
(() => {
 try {
  const offers=JSON.parse(document.getElementById('goods-data').textContent);
  const update=()=>{for(const element of document.querySelectorAll('[data-offer-id]')){const offer=offers.find(o=>o.id===element.dataset.offerId);if(offer)element.querySelector('.goods-status').textContent=window.Goods.labels[window.Goods.status(offer)];}};
  update();setInterval(update,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
  for(const img of document.querySelectorAll('.goods-image img')){const loaded=()=>{if(img.naturalWidth>0)img.classList.add('is-loaded');};img.addEventListener('load',loaded,{once:true});if(img.complete)loaded();}
 }catch{const target=document.getElementById('goods-notice');if(target)target.textContent='表示の自動更新に失敗しました。掲載の確認日時と販売サイトをご確認ください。';}
})();
