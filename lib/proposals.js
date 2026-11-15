'use strict';
const {createHash}=require('node:crypto');const {publicUrl,ajv}=require('./talents');
const shape=ajv.compile(require('../schemas/proposals.schema.json'));
function seconds(value){if(!/^\d+:\d{2}(?::\d{2})?$/.test(value))return null;const parts=value.split(':').map(Number);if(parts.at(-1)>=60||parts.length===3&&parts[1]>=60)return null;return parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:parts[0]*60+parts[1];}
function chapters(description){const result=[];for(const line of String(description||'').split(/\r?\n/)){const m=line.match(/^\s*(\d+:\d{2}(?::\d{2})?)\s+(.+)$/);if(!m||/歌詞|lyrics/i.test(m[2]))continue;const start=seconds(m[1]);if(start===null)continue;const label=m[2].trim().slice(0,240);const order=label.match(/^(\d+)[.．、]\s*/);result.push({rawLabel:label,order:order?Number(order[1]):null,startsAtSeconds:start,endsAtSeconds:null,songId:null,method:'description-timestamp',verification:'pending'});if(result.length===200)break;}return result;}
function propose(input,talents,approved,previous={candidates:[]},now=new Date(),partialInput=false){
 if(previous.candidates?.length&&!shape(previous))throw new Error('Invalid prior proposal queue');
 const rows=Array.isArray(input)?input:input.items||input.videos||[];const proposals=new Map(),owners=new Map(talents.talents.flatMap(t=>t.accounts.filter(a=>a.service==='youtube'&&a.accountId).map(a=>[a.accountId,t.id])));
 const registered=approved.videos||[],existingIds=id=>[...(approved.musicVideos||[]).filter(v=>v.youtubeId===id).map(v=>v.id),...(approved.karaokes||[]).filter(k=>k.youtubeId===id).map(k=>k.id),...(approved.events||[]).filter(e=>e.videoIds.includes(id)||e.slots.some(s=>s.videoIds.includes(id))).map(e=>e.id)];
 for(const row of rows){const id=typeof row.id==='string'?row.id:row.videoId||row.youtubeId,s=row.snippet||row,title=s.title||row.title,channel=s.channelId||row.channelId||row.youtubeid;
  if(!/^[\w-]{11}$/.test(id||'')||typeof title!=='string'||!/^UC[\w-]{22}$/.test(channel||''))continue;
  const hints=[],methods=[];const add=h=>{if(!hints.includes(h))hints.push(h);};
  if(/歌枠|karaoke|歌コラボ|歌唱配信/i.test(title))add('karaoke');
  if(/歌ってみた|\bcover\b|オリジナル曲|original song/i.test(title))add('music-video');
  if(/リレー|ワンマン|ライブ|お披露目|生誕祭/i.test(title))add('event');
  if(hints.length)methods.push('title-keyword');
  const description=String(s.description||row.description||'');
  // Profile/footer boilerplate is not evidence that this particular upload is a music stream.
  const lead=description.slice(0,512).split(/\r?\n/).filter(line=>!/毎日|毎週|普段|中心に|配信して|自己紹介/.test(line)).join('\n');
  if(/歌枠|karaoke|歌ってみた|original song|オリジナル曲|歌コラボ/i.test(lead)){
   methods.push('description-keyword');if(/歌ってみた|original song|オリジナル曲/i.test(lead))add('music-video');else add('karaoke');if(/歌枠リレー/.test(lead))add('event');
  }
  if(chapters(description).length>=2){methods.push('description-timestamp');if(!hints.length)add('karaoke');}
  if(existingIds(id).length){methods.push('registered-video');if(!hints.length)add('karaoke');}
  if(row.discoveryHints)for(const hint of row.discoveryHints)add(hint);if(!hints.length)continue;
  const item={key:'youtube:'+id,youtubeId:id,channelId:channel,title:title.slice(0,500),talentIds:owners.has(channel)?[owners.get(channel)]:[],hints,sourceUrl:'https://www.youtube.com/watch?v='+id,sourceExcerpt:title.slice(0,240),method:'title-keyword-and-channel-id',proposedSetlist:chapters(s.description||row.description),existingIds:existingIds(id),reviewStatus:'pending'};
  if(row.officialMetadata){item.method='official-metadata-and-channel-id';item.publishedAt=s.publishedAt||null;item.startedAt=row.liveStreamingDetails?.actualStartTime||row.liveStreamingDetails?.scheduledStartTime||null;item.retrievedAt=row.retrievedAt||now.toISOString();item.evidenceHash=row.evidenceHash||createHash('sha256').update(JSON.stringify([id,channel,title,description,item.publishedAt,item.startedAt])).digest('hex');item.detectionMethods=row.detectionMethods||methods;item.history=[];}
  const oldVideo=registered.find(v=>v.youtubeId===id);item.change=oldVideo?(oldVideo.title===title?'registered':'changed'):'new';proposals.set(item.key,item);
 }
 for(const row of Array.isArray(input.announcements)?input.announcements:[]){if(typeof row.title!=='string'||typeof row.url!=='string'||!publicUrl(row.url))continue;const existing=(approved.events||[]).filter(e=>e.announcementUrl===row.url).map(e=>e.id);const key='announcement:'+createHash('sha256').update(row.url).digest('hex').slice(0,16);proposals.set(key,{key,youtubeId:null,channelId:null,title:row.title.slice(0,500),talentIds:[],hints:['event'],sourceUrl:row.url,sourceExcerpt:row.title.slice(0,240),method:'provided-announcement-link',proposedSetlist:[],existingIds:existing,reviewStatus:'pending',change:existing.length?'registered':'new'});}
 const fingerprint=row=>JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k])=>!['change','reviewStatus','existingIds','retrievedAt','history'].includes(k))));
 for(const old of previous.candidates||[]){const item=proposals.get(old.key);if(!item){proposals.set(old.key,partialInput?{...old}:{...old,change:'missing_from_input'});continue;}if(fingerprint(old)===fingerprint(item)){item.change='unchanged';item.reviewStatus=['pending','confirmed','rejected','needs_review'].includes(old.reviewStatus)?old.reviewStatus:'pending';if(old.history)item.history=old.history;}else{item.change='changed';item.reviewStatus='needs_review';if(old.evidenceHash)item.history=[...(old.history||[]),{evidenceHash:old.evidenceHash,reviewStatus:old.reviewStatus,observedAt:old.retrievedAt||previous.generatedAt}];}}
 const result={schemaVersion:1,generatedAt:now.toISOString(),notice:'候補のみ。タイトルやチャプターだけでは楽曲/歌唱/開催内容を確定しない。入力からの欠落は削除や非公開の確定ではない。',candidates:[...proposals.values()].sort((a,b)=>a.key.localeCompare(b.key))};
 if(!shape(result))throw new Error('Invalid proposal output');return result;
}
function applyReviews(queue,reviewed){
 for(const value of [queue,reviewed])if(value.candidates?.length&&!shape(value))throw new Error('Invalid review queue');
 const decisions=new Map(reviewed.candidates.filter(c=>c.evidenceHash&&['confirmed','rejected'].includes(c.reviewStatus)).map(c=>[c.key,c]));
 const result=structuredClone(queue);for(const c of result.candidates){const decision=decisions.get(c.key);if(decision&&decision.evidenceHash===c.evidenceHash)c.reviewStatus=decision.reviewStatus;}return result;
}
module.exports={seconds,chapters,propose,applyReviews};
