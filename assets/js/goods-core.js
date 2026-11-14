(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Goods=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const labels={scheduled:'販売予定',on_sale:'販売中',ended:'販売終了',sold_out:'売り切れ（確認時点）',unknown:'不明'};
 function status(offer,now=new Date()){
  if(offer.status==='ended')return 'ended';
  if(offer.endsAt&&now.getTime()>=Date.parse(offer.endsAt))return 'ended';
  if(offer.status==='sold_out')return 'sold_out';
  if(offer.startsAt&&now.getTime()<Date.parse(offer.startsAt))return 'scheduled';
  return offer.status; // dates alone never imply stock availability or on-sale status
 }
 function date(value){return value?new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})+' JST':null;}
 function price(value){return value.amount===null||value.currency===null?'価格未確認':new Intl.NumberFormat('ja-JP',{style:'currency',currency:value.currency}).format(value.amount);}
 return {labels,status,date,price};
});
