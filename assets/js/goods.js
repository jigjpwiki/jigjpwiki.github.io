'use strict';
(() => {
 try {
  const offers=JSON.parse(document.getElementById('goods-data').textContent),core=window.Goods;
  const update=()=>{
   const now=new Date();
   for(const element of document.querySelectorAll('[data-offer-id]')){const offer=offers.find(o=>o.id===element.dataset.offerId);if(offer){const label=element.querySelector('.goods-status');label.textContent=core.offerLabel(offer,now);label.dataset.goodsState=core.status(offer,now);}}
   for(const element of document.querySelectorAll('[data-offer-ids]')){
    const ids=JSON.parse(element.dataset.offerIds),selected=offers.filter(o=>ids.includes(o.id)),state=core.productAggregate(selected,now);element.textContent=core.aggregateLabel(selected,now);element.dataset.goodsState=state.code;
    const card=element.closest('[data-filter-row]');if(card){const row=JSON.parse(card.dataset.filterRow);row.status=state.bucket;card.dataset.filterRow=JSON.stringify(row);}
   }
   document.dispatchEvent(new Event('catalog:refresh'));
  };
  update();setInterval(update,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
 }catch{const target=document.getElementById('goods-notice');if(target)target.textContent='販売状況を更新できませんでした。基準時点の表示です。';}
})();
