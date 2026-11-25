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
  // With no recorded end, move to past at the known start instant, or
  // after the last possible start when only a JST day/month is known.
  if(starts&&!ends)return t>=starts.end?'past':'upcoming';
  return 'unknown';
 }
 function compare(a,b,group){
  const x=bounds(a.starts)?.start,y=bounds(b.starts)?.start;
  if(x==null&&y==null)return 0;
  if(x==null)return 1;if(y==null)return -1;
  return group==='past'?y-x:x-y;
 }
 const labels={past:'開催終了',upcoming:'開催予定',ongoing:'開催中',unknown:'開催日時未定'};
 return {bounds,phase,compare,labels};
});
