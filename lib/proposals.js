'use strict';
const {createHash}=require('node:crypto');const {publicUrl,ajv}=require('./talents');
const shape=ajv.compile(require('../schemas/proposals.schema.json'));
function seconds(value){if(!/^\d+:\d{2}(?::\d{2})?$/.test(value))return null;const parts=value.split(':').map(Number);if(parts.at(-1)>=60||parts.length===3&&parts[1]>=60)return null;return parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:parts[0]*60+parts[1];}
function chapters(description){const result=[];for(const line of String(description||'').split(/\r?\n/)){const m=line.match(/^\s*(\d+:\d{2}(?::\d{2})?)\s+(.+)$/);if(!m||/歌詞|lyrics/i.test(m[2]))continue;const start=seconds(m[1]);if(start===null)continue;const label=m[2].trim().slice(0,240);const order=label.match(/^(\d+)[.．、]\s*/);result.push({rawLabel:label,order:order?Number(order[1]):null,startsAtSeconds:start,endsAtSeconds:null,songId:null,method:'description-timestamp',verification:'pending'});if(result.length===200)break;}return result;}
function propose(input,talents,approved,previous={candidates:[]},now=new Date()){
 if(previous.candidates?.length&&!shape(previous))throw new Error('Invalid prior proposal queue');
 const rows=Array.isArray(input)?input:input.items||input.videos||[];const proposals=new Map(),owners=new Map(talents.talents.flatMap(t=>t.accounts.filter(a=>a.service==='youtube'&&a.accountId).map(a=>[a.accountId,t.id])));
 const registered=approved.videos||[],existingIds=id=>[...(approved.musicVideos||[]).filter(v=>v.youtubeId===id).map(v=>v.id),...(approved.karaokes||[]).filter(k=>k.youtubeId===id).map(k=>k.id),...(approved.events||[]).filter(e=>e.videoIds.includes(id)||e.slots.some(s=>s.videoIds.includes(id))).map(e=>e.id)];
 for(const row of rows){const id=typeof row.id==='string'?row.id:row.videoId||row.youtubeId,s=row.snippet||row,title=s.title||row.title,channel=s.channelId||row.channelId||row.youtubeid;
  if(!/^[\w-]{11}$/.test(id||'')||typeof title!=='string'||!/^UC[\w-]{22}$/.test(channel||''))continue;
  const hints=[];if(/歌枠|karaoke/i.test(title))hints.push('karaoke');if(/歌ってみた|\bcover\b|オリジナル曲/i.test(title))hints.push('music-video');if(/リレー|ワンマン|ライブ|お披露目|生誕祭/i.test(title))hints.push('event');if(!hints.length)continue;
  const item={key:'youtube:'+id,youtubeId:id,channelId:channel,title:title.slice(0,500),talentIds:owners.has(channel)?[owners.get(channel)]:[],hints,sourceUrl:'https://www.youtube.com/watch?v='+id,sourceExcerpt:title.slice(0,240),method:'title-keyword-and-channel-id',proposedSetlist:chapters(s.description||row.description),existingIds:existingIds(id),reviewStatus:'pending'};
  const oldVideo=registered.find(v=>v.youtubeId===id);item.change=oldVideo?(oldVideo.title===title?'registered':'changed'):'new';proposals.set(item.key,item);
 }
 for(const row of Array.isArray(input.announcements)?input.announcements:[]){if(typeof row.title!=='string'||typeof row.url!=='string'||!publicUrl(row.url))continue;const existing=(approved.events||[]).filter(e=>e.announcementUrl===row.url).map(e=>e.id);const key='announcement:'+createHash('sha256').update(row.url).digest('hex').slice(0,16);proposals.set(key,{key,youtubeId:null,channelId:null,title:row.title.slice(0,500),talentIds:[],hints:['event'],sourceUrl:row.url,sourceExcerpt:row.title.slice(0,240),method:'provided-announcement-link',proposedSetlist:[],existingIds:existing,reviewStatus:'pending',change:existing.length?'registered':'new'});}
 const fingerprint=row=>JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k])=>!['change','reviewStatus','existingIds'].includes(k))));
 for(const old of previous.candidates||[]){const item=proposals.get(old.key);if(!item){proposals.set(old.key,{...old,change:'missing_from_input',reviewStatus:'pending'});continue;}if(fingerprint(old)===fingerprint(item)){item.change='unchanged';item.reviewStatus=['pending','confirmed','rejected'].includes(old.reviewStatus)?old.reviewStatus:'pending';}else{item.change='changed';item.reviewStatus='pending';}}
 const result={schemaVersion:1,generatedAt:now.toISOString(),notice:'候補のみ。タイトルやチャプターだけでは楽曲/歌唱/開催内容を確定しない。入力からの欠落は削除や非公開の確定ではない。',candidates:[...proposals.values()].sort((a,b)=>a.key.localeCompare(b.key))};
 if(!shape(result))throw new Error('Invalid proposal output');return result;
}
module.exports={seconds,chapters,propose};
