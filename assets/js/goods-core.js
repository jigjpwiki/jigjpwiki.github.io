(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Goods=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const labels={scheduled:'販売予定',on_sale:'販売中',ended:'販売終了',sold_out:'売り切れ（確認時点）',unknown:'販売状況未確認',partial_sale:'一部販売中',partial_scheduled:'一部販売予定',closed:'販売終了・売り切れ'};
 function status(offer,now=new Date()){
  if(offer.status==='ended')return 'ended';
  if(offer.endsAt&&now.getTime()>=Date.parse(offer.endsAt))return 'ended';
  if(offer.status==='sold_out')return 'sold_out';
  if(offer.startsAt&&now.getTime()<Date.parse(offer.startsAt))return 'scheduled';
  return ['on_sale','scheduled','unknown'].includes(offer.status)?offer.status:'unknown';
 }
 // All offers, including repeat sales, contribute. Unknown never means ended or sold out.
 function aggregate(offers,now=new Date()){
  const states=offers.map(o=>status(o,now)),counts={};for(const s of states)counts[s]=(counts[s]||0)+1;
  let code='unknown';
  if(states.length&&states.every(s=>s===states[0]))code=states[0];
  else if(counts.on_sale)code='partial_sale';
  else if(counts.scheduled)code='partial_scheduled';
  else if(counts.unknown)code='unknown';
  else if(states.length)code='closed';
  return {code,label:labels[code],counts,bucket:counts.on_sale||counts.scheduled?'active':code==='ended'||code==='sold_out'||code==='closed'?'ended':'unknown'};
 }
 function date(value){return value?new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})+' JST':null;}
 function price(value){return !value||value.amount===null||value.currency===null?'価格未確認':new Intl.NumberFormat('ja-JP',{style:'currency',currency:value.currency}).format(value.amount);}
 return {labels,status,aggregate,date,price};
});
