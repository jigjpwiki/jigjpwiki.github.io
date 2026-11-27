'use strict';
const norm = v => String(v || '').normalize('NFKC').toLowerCase().trim();
const validId = v => typeof v === 'string' && /^tal-\d{6}$/.test(v);
const urlPattern = /https?:\/\/[^\s<>"'「」『』【】（）]+/giu;
const urlTokens = text => (String(text||'').match(urlPattern)||[]).map(v=>v.replace(/[),.!?;:、。！？）]+$/u,''));
function accountKey(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    const host = u.hostname.toLowerCase(), p = decodeURIComponent(u.pathname).replace(/\/+$/,'');
    if (['youtube.com','www.youtube.com','m.youtube.com'].includes(host)) {
      const channel = p.match(/^\/channel\/(UC[\w-]{22})(?:\/(?:featured|videos|streams|shorts|about))?$/);
      if (channel) return 'youtube:'+channel[1];
      const handle = p.match(/^\/@([^/]+)(?:\/(?:featured|videos|streams|shorts|about))?$/);
      return handle?'youtube:@'+norm(handle[1]):null;
    }
    const service = ['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com'].includes(host) ? 'x' : ['twitch.tv','www.twitch.tv'].includes(host) ? 'twitch' : ['tiktok.com','www.tiktok.com'].includes(host) ? 'tiktok' : null;
    if (!service) return null;
    const m = service==='tiktok' ? p.match(/^\/@([\w.]+)(?:\/live)?$/u) : p.match(/^\/([a-z0-9_]+)$/i);
    if (!m) return null;
    if(service==='x' && ['home','intent','share','search','explore','i','settings'].includes(m[1].toLowerCase()))return null;
    return service+':'+norm(m[1]);
  } catch { return null; }
}
function index(people,{organizations=[],youtubeStreamers=[]}={}) {
  const byId=new Map(), names=new Map(), urls=new Map(), owners=new Map();
  const add=(map,key,id)=>{if(!key)return;if(!map.has(key))map.set(key,new Set());map.get(key).add(id);};
  for(const p of Array.isArray(people)?people:[]){
    if(!validId(p?.id)||typeof p.displayName!=='string')continue;
    byId.set(p.id,p);
    for(const n of [p.displayName,...(p.aliases||[]).map(a=>a.name)]){
      const key=norm(n);if(!key)continue;
      add(owners,'name:'+key,p.id);
      if([...key].length>=3 && (!/^[a-z0-9_ ]+$/i.test(key)||key.length>=4))add(names,key,p.id);
    }
    for(const a of p.accounts||[]){
      if(a.accountId)add(owners,a.service+':'+(a.service==='youtube'?a.accountId:norm(a.accountId)),p.id);
      add(urls,accountKey(a.url),p.id);
    }
  }
  const official=new Map();
  for(const channel of Array.isArray(youtubeStreamers)?youtubeStreamers:[]){
    if(!/^UC[\w-]{22}$/.test(channel.youtubeChannelId||''))continue;
    const key='youtube:'+channel.youtubeChannelId;
    if(owners.has(key))continue;
    const matches=organizations.filter(o=>/^org-\d{6}$/.test(o.id)&&norm(o.name)===norm(channel.name));
    if(matches.length===1&&!owners.has('name:'+norm(channel.name)))add(official,key,matches[0].id);
  }
  return {byId,names,urls,owners,official};
}
const unique = (map,key) => {const ids=map.get(key);return ids?.size===1?[...ids][0]:null;};
function owner(row, service, idx) {
  const raw = row?.[{youtube:'youtubeid',twitch:'twitchid',tiktok:'tiktokid'}[service]];
  if(raw){
    const key=service+':'+(service==='youtube'?raw:norm(raw));
    if(idx.owners.has(key))return unique(idx.owners,key);
    if(idx.official?.has(key))return unique(idx.official,key);
  }
  return unique(idx.owners,'name:'+norm(row?.name));
}
function named(text,idx) {
  const value=norm(String(text||'').replace(urlPattern,' ')), hits=[];
  for(const [name,ids] of idx.names) {
    let from=0;
    while(from<value.length){
      const at=value.indexOf(name,from);if(at<0)break;from=at+name.length;
      if(/^[a-z0-9_]/i.test(name)&&/[a-z0-9_]/i.test(value[at-1]||''))continue;
      if(/[a-z0-9_]$/i.test(name)&&/[a-z0-9_]/i.test(value[from]||''))continue;
      hits.push({at,end:from,id:ids.size===1?[...ids][0]:null});
    }
  }
  return hits.filter(h=>h.id&&!hits.some(o=>o!==h&&o.at<=h.at&&o.end>=h.end&&(o.end-o.at>h.end-h.at))).sort((a,b)=>a.at-b.at).map(h=>h.id);
}
function linked(text,idx){return urlTokens(text).map(u=>unique(idx.urls,accountKey(u))).filter(Boolean);}
// Decorations are not semantic headings. Strip only punctuation/symbols
// at the edges; keep the actual heading and names intact.
const headingText=line=>norm(line).replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu,'');
const participant = /^(?:コラボ(?:相手|メンバー|参加者|出演者|ゲスト|者)?|参加(?:者|メンバー)|共演(?:者|メンバー)?|出演(?:者|メンバー)|ゲスト|一緒に遊ぶ(?:人|メンバー)?|対戦相手|with\b|collab(?:oration)?(?:\s+(?:with|members|participants))?\b|participants?\b|guests?\b)(?:[】］\]＞>：:／/★☆\s]|$)/iu;
const promo = /(?:チャンネル登録|高評価|おすすめ|告知|宣伝|所属|公式(?:サイト|アカウント|チャンネル)|メンバーシップ|ファンネーム|グッズ|販売|イラスト|素材|ママ|パパ|クレジット|使用(?:音源|素材)|協力|スポンサー|配信タグ|sns|twitter|tiktok|follow|subscribe|credits?|official store)/iu;
const closing = /^(?:来てくれて|見てくれて|ご視聴|ご参加|最後まで|ありがとう|thanks\b|thank you\b)/iu;
const separator=line=>! /[\p{L}\p{N}]/u.test(line) && [...line].length>=3;
const collabTitle=title=>/(?:コラボ|collab\b|共演|対談|with\b|同時視聴|一緒に)/iu.test(title||'');
const mentionPattern=/(?:^|[\s→⇒:：/])@[\p{L}\p{N}_.\-。]+/gu;
function exactNames(line,idx){
  const plain=norm(line.replace(urlPattern,' ').replace(mentionPattern,' ')).replace(/^[\s・●○◯◆◇■□▶▷▼▽*+\-–—]+/u,'').replace(/[\s→⇒:：]+$/u,'').trim();
  const names=plain.split(/\s*[、,／/＆&・]\s*/u).filter(Boolean);
  if(!names.length)return [];
  const ids=names.map(n=>unique(idx.names,n)||unique(idx.names,n.replace(/(?:さん|ちゃん|くん|様|さま)$/u,'')));
  return ids.every(Boolean)?ids:[];
}
function referenceLine(line){
  const plain=norm(line.replace(urlPattern,' ').replace(mentionPattern,' ')).replace(/^[\s・●○◯◆◇■□▶▷▼▽*+\-–—]+/u,'').trim();
  const tokens=urlTokens(line);
  const mentions=[...line.matchAll(mentionPattern)];
  if(!tokens.length&&!mentions.length)return false;
  if(tokens.some(u=>!accountKey(u)))return false;
  return /^(?:(?:youtube|x(?:\(旧twitter\))?|twitter|twitch|tiktok)\s*[:：]?\s*)?$/i.test(plain);
}
function videoReference(line){
  const tokens=urlTokens(line);
  if(!tokens.length||line.replace(urlPattern,' ').trim())return false;
  return tokens.every(raw=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)&&((u.pathname==='/watch'&&/^[\w-]{11}$/.test(u.searchParams.get('v')||''))||/^\/watch\/[\w-]{11}$/.test(u.pathname))||u.hostname==='youtu.be'&&/^\/[\w-]{11}$/.test(u.pathname));}catch{return false;}});
}
function officialArchiveIds(description,host,idx){
  if(!/^org-\d{6}$/.test(host||''))return [];
  const lines=description.split(/\r?\n/).map(s=>s.trim());
  const heading=lines.findIndex(s=>/^メンバーが選んだ(?:配信|動画)のアーカイブ(?:は)?(?:こちら)?[！!：:\s]*$/u.test(s));
  if(heading<0)return [];
  const out=[];
  for(let i=heading+1;i<Math.min(lines.length,heading+65);i++){
    if(!lines[i])continue;
    const ids=exactNames(lines[i],idx);
    if(ids.length!==1||!videoReference(lines[i+1]||''))break;
    const p=idx.byId.get(ids[0]);
    if(p?.affiliations?.some(a=>a.organizationId===host&&a.status==='current'))out.push(ids[0]);
    i++;
  }
  return out.length>=2?out:[];
}
function unlabelledIds(description,title,idx){
  // With an explicit collaboration/co-watch title, an isolated name +
  // channel reference paragraph is a candidate, not verified participation.
  if(!collabTitle(title))return [];
  const out=[];let blocked=false;
  for(const block of description.split(/\r?\n[ \t　]*\r?\n+/)){
    const lines=block.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if(!lines.length)continue;
    if(separator(lines[0])){blocked=false;continue;}
    if(/^(?:[【［\[★☆■◆●▶▼▽◇#\s]*)(?:おすすめ|告知|宣伝|クレジット|素材|使用音源|スポンサー|公式|グッズ|sns|follow|credits?)/iu.test(lines[0])){blocked=true;continue;}
    if(blocked||lines.length!==2)continue;
    const ids=exactNames(lines[0],idx);
    if(ids.length!==1||!referenceLine(lines[1]))continue;
    const linkedIds=linked(lines[1],idx);
    if(linkedIds.length&&linkedIds.some(id=>id!==ids[0]))continue;
    out.push(ids[0]);
  }
  return out;
}
function descriptionIds(description,title,idx,host=null){
  if(typeof description!=='string')return [];
  const source=description.slice(0,20000);
  const out=[];let remaining=0,seen=false,gap=false,promotional=false;
  for(const raw of source.split(/\r?\n/)){
    const line=raw.trim();if(!line){if(seen&&remaining>0)gap=true;continue;}
    if(participant.test(headingText(line))){
      remaining=32;seen=false;gap=false;promotional=false;
      out.push(...named(line,idx),...linked(line,idx));continue;
    }
    const plain=line.replace(urlPattern,' ');
    const ids=exactNames(line,idx),ref=referenceLine(line),entry=ids.length>0||ref;
    if(remaining>0&&!seen&&/^[\p{L}\p{N}・ー\s]+(?:学園|学校|期生|世代|メンバー|チーム|ユニット)(?:\s*\d+\s*期生)?$/u.test(norm(line))&&!ids.length){
      remaining--;continue;
    }
    if(separator(line)||closing.test(plain)||(promo.test(plain)&&!(remaining>0&&ref))||(/^[【［\[■◆●▶▼▽◇★☆]/u.test(line)&&!entry)){
      remaining=0;gap=false;promotional=true;continue;
    }
    if(remaining>0&&gap&&!entry){
      remaining=0;gap=false;promotional=true;continue;
    }
    if(remaining>0){
      remaining--;seen=true;gap=false;
      out.push(...ids,...named(line,idx),...linked(line,idx));
    }else if(collabTitle(title)&&!promotional){
      const links=new Set(linked(line,idx));out.push(...named(line,idx).filter(id=>links.has(id)));
    }
  }
  return [...new Set([...out,...unlabelledIds(source,title,idx),...officialArchiveIds(source,host,idx)])];
}
function publicIds(ids,host,idx) {
  if(!host)return [];
  return [...new Set(ids)].filter(id=>id!==host&&idx.byId.has(id)&&idx.byId.get(id).visibility!=='draft'&&!idx.byId.get(id).profileHidden);
}
function collected(row,service,description,idx){
  const host=owner(row,service,idx);
  return publicIds(descriptionIds(description,row.title,idx,host),host,idx);
}
function project(row,service,idx){
  const {descriptionPartnerIds,collaborators:ignored,...base}=row;
  const ids=publicIds([...named(base.title,idx),...(Array.isArray(descriptionPartnerIds)?descriptionPartnerIds:[])],owner(base,service,idx),idx);
  if(!ids.length)return base;
  return {...base,collaborators:ids.map(id=>{const p=idx.byId.get(id);return {id,name:p.displayName,image:p.profileImage?.url||null};})};
}
module.exports={accountKey,index,owner,named,descriptionIds,collected,project};
