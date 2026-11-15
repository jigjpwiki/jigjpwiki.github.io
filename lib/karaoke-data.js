'use strict';
const path=require('node:path');const {ajv}=require('./talents');const {loadMusic}=require('./music-data');const {read,fail,unique,evidence,references,validateRegistry}=require('./feature-data');
const shape=ajv.compile(require('../schemas/karaoke.schema.json'));
function validateKaraoke(music,data,registry){
 if(!shape(data))fail(ajv.errorsText(shape.errors));const ctx=music.ctx,karaokes=unique(data.karaokes),songs=unique(music.songs);unique(data.karaokes,'youtubeId');unique(data.performances);
 const occupied=new Set(music.musicVideos.map(v=>v.youtubeId));
 for(const k of data.karaokes){if(Date.parse(k.registeredAt)>Date.now()+300000)fail('future karaoke registration');evidence(k,ctx,k.visibility==='public');references(k.talentIds,ctx.talents,'karaoke singer');references([k.youtubeId],ctx.videos,'karaoke video');if(occupied.has(k.youtubeId))fail('same video registered as both music video and karaoke');
  const video=ctx.videos.get(k.youtubeId);if(k.visibility==='public'&&video.visibility!=='public')fail('public karaoke references draft video');
  const owners=[...ctx.talents.values()].filter(t=>t.accounts.some(a=>a.service==='youtube'&&a.accountId===video.channelId));if(owners.length&&!owners.some(t=>k.talentIds.includes(t.id)))fail('karaoke owner missing from singers');
 }
 const positions=new Set();
 for(const p of data.performances){evidence(p,ctx,p.visibility==='public');references([p.karaokeId],karaokes,'karaoke');references(p.talentIds,ctx.talents,'performance singer');if(p.songId!==null)references([p.songId],songs,'performance song');const parent=karaokes.get(p.karaokeId),video=ctx.videos.get(parent.youtubeId);
  if(p.talentIds.some(id=>!parent.talentIds.includes(id)))fail('performance singer outside karaoke cast');
  if(p.visibility==='public'&&(p.verification!=='verified'||parent.visibility!=='public'||p.songId!==null&&songs.get(p.songId).visibility!=='public'))fail('unreviewed/draft performance cannot be public');
  if(p.order!==null){const key=p.karaokeId+':'+p.order;if(positions.has(key))fail('duplicate setlist position');positions.add(key);}
  if(p.startsAtSeconds!==null&&p.endsAtSeconds!==null&&p.endsAtSeconds<=p.startsAtSeconds)fail('reversed performance timestamps');
  if(video.durationSeconds!==null&&[p.startsAtSeconds,p.endsAtSeconds].some(x=>x!==null&&x>video.durationSeconds))fail('performance timestamp beyond duration');
 }
 for(const k of data.karaokes){const timed=data.performances.filter(p=>p.karaokeId===k.id&&p.order!==null&&p.startsAtSeconds!==null).sort((a,b)=>a.order-b.order);if(timed.some((p,i)=>i>0&&p.startsAtSeconds<timed[i-1].startsAtSeconds))fail('setlist time order mismatch');const rows=data.performances.filter(p=>p.karaokeId===k.id&&p.visibility==='public'&&p.verification==='verified');if(k.expectedCount!==null&&rows.length>k.expectedCount)fail('too many setlist entries');if(k.setlistStatus==='unreviewed'&&rows.length)fail('unreviewed setlist has verified public entries');if(k.setlistStatus==='complete'&&(k.expectedCount===null||rows.length!==k.expectedCount||rows.some(p=>p.order===null)||rows.map(p=>p.order).sort((a,b)=>a-b).some((n,i)=>n!==i+1)))fail('incomplete setlist cannot be marked complete');if(k.setlistStatus==='partial'&&!rows.length)fail('partial setlist needs an entry');}
 if(registry)validateRegistry(registry,[...data.karaokes,...data.performances]);return {...data,media:music.media,ctx};
}
function loadKaraoke(talents,catalog,root=path.join(__dirname,'..')){return validateKaraoke(loadMusic(talents,catalog,root),read(root,'karaoke'),read(root,'feature-id-registry'));}
function projectKaraoke(model){const karaokes=model.karaokes.filter(k=>k.visibility==='public'),ids=new Set(karaokes.map(k=>k.id));const performances=model.performances.filter(p=>p.visibility==='public'&&p.verification==='verified'&&ids.has(p.karaokeId));const used=new Set(karaokes.map(k=>k.youtubeId)),videos=model.media.videos.filter(v=>used.has(v.youtubeId)&&v.visibility==='public');const refs=new Set([...karaokes,...performances,...videos].flatMap(r=>r.sourceRefs));return {karaokes,performances,videos,sources:[...model.ctx.sources.values()].filter(s=>refs.has(s.id))};}
function karaokeLinks(data){return Object.fromEntries(data.karaokes.map(k=>[k.youtubeId,{karaokeId:k.id,channelId:data.videos.find(v=>v.youtubeId===k.youtubeId).channelId}]));}
module.exports={validateKaraoke,loadKaraoke,projectKaraoke,karaokeLinks};
