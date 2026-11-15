(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else api.mount();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function validLinks(value){const map=new Map();if(!value||typeof value!=='object'||Array.isArray(value))return map;for(const[id,row]of Object.entries(value))if(/^[\w-]{11}$/.test(id)&&row&&/^karaoke-\d{6}$/.test(row.karaokeId)&&/^UC[\w-]{22}$/.test(row.channelId))map.set(id,row);return map;}
 function targetFor(row,map){const k=map.get(row.videoId);return k&&row.channelId===k.channelId?'/music/karaoke/'+k.karaokeId+'/':null;}
 async function mount(){
  const list=document.getElementById('videolist');if(!list)return;
  try{const r=await fetch('/data/karaoke-links.json',{cache:'no-cache',signal:AbortSignal.timeout(15000)});if(!r.ok)return;const map=validLinks(await r.json());
   const draw=()=>{for(const card of list.querySelectorAll('.live-wrapper')){const href=targetFor({videoId:card.dataset.videoId,channelId:card.dataset.youtubeid},map);if(!href||card.querySelector('.karaoke-link'))continue;const link=document.createElement('a');link.className='karaoke-link';link.href=href;link.textContent='歌枠・セットリスト →';link.setAttribute('aria-label','歌枠の詳細とセットリストを開く');card.append(link);}};
   draw();new MutationObserver(draw).observe(list,{childList:true,subtree:true});
  }catch{/* Optional local index failure must never block schedule rendering or refresh. */}
 }
 return{validLinks,targetFor,mount};
});
