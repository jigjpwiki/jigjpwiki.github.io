'use strict';
const {createHash}=require('node:crypto');
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function seconds(value){if(typeof value!=='string'||!/^\d+:\d{2}(?::\d{2})?$/.test(value))return null;const parts=value.split(':').map(Number);if(parts.length<2||parts.length>3||parts.some(n=>!Number.isSafeInteger(n)||n<0)||parts.at(-1)>=60||parts.length===3&&parts[1]>=60)return null;return parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:parts[0]*60+parts[1];}
function normalize(value){return String(value||'').normalize('NFKC').toLocaleLowerCase('ja').replace(/\([^)]*\)|（[^）]*）|【[^】]*】/g,'').replace(/[\p{P}\p{S}\s]/gu,'');}
function parseSetlist(text,{youtubeId=null,sourceType='official_description',sourceUrl=null,talentIds=[]}={}){
 if(typeof text!=='string'||text.length>100000)throw new Error('Invalid bounded setlist text');
 const rows=[];let lyrics=false;
 for(const raw of text.split(/\r?\n/)){
  if(rows.length>=200)break;
  let line=raw.normalize('NFKC').trim(),order=null,time=null,marked=false;const warnings=[];
  if(/歌詞|lyrics/i.test(line)){lyrics=true;continue;}if(/^(?:set\s*list|セットリスト|セトリ|曲一覧)/i.test(line)){lyrics=false;continue;}
  if(!line||lyrics||/https?:\/\//i.test(line))continue;
  const takeOrder=()=>{const m=line.match(/^(?:M\s*(\d{1,3})\b|(\d{1,3})\s*曲目|(\d{1,3})[.、)．]\s*)\s*/i);if(m){order=Number(m[1]||m[2]||m[3])||null;line=line.slice(m[0].length);marked=true;}};
  line=line.replace(/^[♪♫]\s*/,()=>{marked=true;return '';});takeOrder();
  const m=line.match(/^(?:[[(]\s*)?((?:\d{1,3}:)?\d{1,3}:\d{2})(?:\s*[\])])?\s*/);
  const jp=line.match(/^(?:(\d{1,2})時)?(\d{1,3})分(\d{1,2})秒\s*/);
  if(m){time=seconds(m[1]);if(time===null)continue;line=line.slice(m[0].length);marked=true;}
  else if(jp){time=seconds((jp[1]?jp[1]+':':'')+jp[2]+':'+jp[3].padStart(2,'0'));if(time===null)continue;line=line.slice(jp[0].length);marked=true;}
  takeOrder();line=line.replace(/^[♪♫★☆]\s*/,'');
  const extraTime=line.match(/^[;；、\s]+((?:\d{1,3}:)?\d{1,3}:\d{2})\s*/);if(extraTime){line=line.slice(extraTime[0].length);warnings.push('multiple_timestamps_requires_review');}
  if(!marked||!line.trim())continue;
  line=line.trim();if(line.length>240){warnings.push('truncated_label');line=line.slice(0,240);}
  const nonSong=/^(?:OP|ED|MC|BGM|opening|ending|待機(?:画面)?|雑談|休憩|告知|曲紹介|次回予告|エンディング|オープニング|アンコール|メドレー|開始|START|まっはろー|はのは|おはぴよ|コール&レスポンス)(?:$|[\s:(])/i.test(line);
  const contextual=/^(?:まっはろ|はのは|おはぴよ)|荒らし|スパム|鳩行為|リスナー|配信者|コメント|ルール|ネタバレ|くしゃみ|控えて|やめて|下げる|話題|^[~〜:：]/.test(line);
  if(contextual)warnings.push('context_not_setlist');
  if(nonSong)warnings.push('non_song_segment');if(/メドレー|medley/i.test(line))warnings.push('medley_requires_review');
  if(/(?:ver\.?|version|remix|acoustic|アレンジ|弾き語り|ライブ版|live版|アカペラ)/i.test(line))warnings.push('version_requires_review');
  let parts=line.split(/\s+\/\s*|\s*\/\s+|\s+[-–—]\s+|\s+by\s+/i);if(parts.length===1&&line.split('/').length===2)parts=line.split('/');const quoted=line.match(/^[「『](.+)[」』]\s*(.+)$/);if(parts.length===1&&quoted)parts=[quoted[1],quoted[2]];const title=parts[0].trim(),artist=parts.length===2?parts[1].trim():null;if(!title)continue;if(parts.length>2)warnings.push('ambiguous_credits');
  if(!artist)warnings.push('artist_unknown');if(time===null)warnings.push('timestamp_unknown');if(order===null)warnings.push('order_unknown');
  const item={key:digest([youtubeId,sourceType,sourceUrl,raw.trim()]).slice(0,24),youtubeId,order,startsAtSeconds:time,endsAtSeconds:null,title,artist,talentIds:[...talentIds],rawLabel:raw.trim().slice(0,400),sourceType,sourceUrl,method:'setlist-line-v1',verification:'pending',category:nonSong||contextual?'non_song':'song_candidate',warnings};
  item.evidenceHash=digest([item.youtubeId,item.rawLabel,item.sourceType,item.sourceUrl]);rows.push(item);
 }
 return rows;
}
function matchSong(row,songs,artistAliases={}){
 if(row.category!=='song_candidate'||!normalize(row.title))return {classification:'insufficient',matches:[]};
 const artist=value=>normalize(artistAliases[value]||value);
 const matches=songs.flatMap(song=>{const fields=['title','aliases','readings'].filter(k=>[...(Array.isArray(song[k])?song[k]:[song[k]])].some(t=>normalize(t)===normalize(row.title)));if(!fields.length)return [];
 const artistMatch=!!row.artist&&song.originalArtists?.some(a=>artist(a)===artist(row.artist));return [{songId:song.id,fields,reasons:[...fields.map(f=>'normalized_'+f),...(artistMatch?['artist_agrees']:['artist_not_established'])],artistMatch}];});
 const high=matches.filter(m=>m.artistMatch);return {classification:matches.length>1?'ambiguous':high.length===1&&!row.warnings.some(w=>/version|medley|ambiguous/.test(w))?'high_confidence_candidate':matches.length?'insufficient':row.artist?'new_song':'insufficient',matches};
}
// Suggestions agree only when title, artist, and timestamp agree. Agreement is never approval.
function reconcile(rows){const groups=[];
 for(const row of rows.filter(r=>r.category==='song_candidate')){let group=groups.find(g=>g[0].youtubeId===row.youtubeId&&normalize(g[0].title)===normalize(row.title)&&normalize(g[0].artist)===normalize(row.artist)&&(g[0].order===null||row.order===null||g[0].order===row.order));if(!group){group=[];groups.push(group);}group.push(row);}
 return groups.map(evidence=>({title:evidence[0].title,artist:evidence[0].artist,order:evidence[0].order,duplicates:Math.max(0,evidence.length-new Set(evidence.map(e=>e.startsAtSeconds)).size),conflict:new Set(evidence.map(e=>e.startsAtSeconds).filter(x=>x!==null)).size>1,evidence,verification:'pending'}));
}
module.exports={seconds,normalize,parseSetlist,matchSong,reconcile,digest};
