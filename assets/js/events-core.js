(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EventDates=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function bounds(time){
  if(!time||time.precision==='unknown')return null;
  if(time.precision==='instant'){const t=Date.parse(time.value);return {start:t,end:t};}
  if(time.precision==='date'){const t=Date.parse(time.value+'T00:00:00+09:00');return {start:t,end:t+86400000};}
  if(time.precision==='month'){const start=Date.parse(time.value+'-01T00:00:00+09:00'),[y,m]=time.value.split('-').map(Number),next=new Date(Date.UTC(y,m,1)-9*3600000).getTime();return {start,end:next};}
  return null;
 }
 function phase(event,now=new Date()){
  const starts=bounds(event.starts),ends=bounds(event.ends),t=now.getTime();
  if(ends&&ends.end<=t)return 'past';
  if(starts&&starts.start>t)return 'upcoming';
  if(starts&&starts.start<=t&&ends&&ends.end>t)return 'ongoing';
  return 'unknown'; // A past start alone does not prove that the event ended.
 }
 return {bounds,phase};
});
