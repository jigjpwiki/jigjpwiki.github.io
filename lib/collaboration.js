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
function index(people) {
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
  return {byId,names,urls,owners};
}
const unique = (map,key) => {const ids=map.get(key);return ids?.size===1?[...ids][0]:null;};
function owner(row, service, idx) {
  const raw = row?.[{youtube:'youtubeid',twitch:'twitchid',tiktok:'tiktokid'}[service]];
  if(raw){
    const key=service+':'+(service==='youtube'?raw:norm(raw));
    if(idx.owners.has(key))return unique(idx.owners,key);
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
const participant = /^(?:[【［\[＜<■◆●▶▼▽◇・#\s\-─━]*)(?:コラボ(?:相手|メンバー|参加者|出演者|ゲスト|者)?|参加(?:者|メンバー)|共演(?:者|メンバー)?|出演(?:者|メンバー)|ゲスト|一緒に遊ぶ(?:人|メンバー)?|対戦相手|with\b|collab(?:oration)?(?:\s+(?:with|members|participants))?\b|participants?\b|guests?\b)(?:[】］\]＞>：:／/\s]|$)/iu;
const promo = /(?:チャンネル登録|高評価|おすすめ|告知|宣伝|所属|公式(?:サイト|アカウント|チャンネル)|メンバーシップ|ファンネーム|グッズ|販売|イラスト|素材|ママ|パパ|クレジット|使用(?:音源|素材)|協力|スポンサー|配信タグ|sns|twitter|tiktok|follow|subscribe|credits?)/iu;
function descriptionIds(description,title,idx){
  if(typeof description!=='string')return [];
  const out=[];let remaining=0,seen=false,promotional=false;
  const collabTitle=/(?:コラボ|collab\b|共演|対談|with\b)/iu.test(title||'');
  for(const raw of description.slice(0,20000).split(/\r?\n/)){
    const line=raw.trim();if(!line){if(seen)remaining=0;continue;}
    if(participant.test(line)){
      remaining=24;seen=false;promotional=false;
      out.push(...named(line,idx),...linked(line,idx));continue;
    }
    const plain=line.replace(urlPattern,' ');
    // Platform label lines are valid inside an explicitly marked participant section.
    const platformLabel=/^(?:YouTube|X|Twitter|Twitch|TikTok)\s*[:：]?\s*$/i.test(plain.trim());
    if((promo.test(plain)&&!(remaining>0&&platformLabel))||/^[【［\[■◆●▶▼▽◇]/u.test(line)){
      remaining=0;promotional=true;continue;
    }
    if(remaining>0){remaining--;seen=true;out.push(...named(line,idx),...linked(line,idx));}
    else if(collabTitle&&!promotional){
      const links=new Set(linked(line,idx));out.push(...named(line,idx).filter(id=>links.has(id)));
    }
  }
  return [...new Set(out)];
}
function publicIds(ids,host,idx) {
  if(!host)return [];
  return [...new Set(ids)].filter(id=>id!==host&&idx.byId.has(id)&&idx.byId.get(id).visibility!=='draft'&&!idx.byId.get(id).profileHidden);
}
function collected(row,service,description,idx){
  return publicIds(descriptionIds(description,row.title,idx),owner(row,service,idx),idx);
}
function project(row,service,idx){
  const {descriptionPartnerIds,collaborators:ignored,...base}=row;
  const ids=publicIds([...named(base.title,idx),...(Array.isArray(descriptionPartnerIds)?descriptionPartnerIds:[])],owner(base,service,idx),idx);
  if(!ids.length)return base;
  return {...base,collaborators:ids.map(id=>{const p=idx.byId.get(id);return {id,name:p.displayName,image:p.profileImage?.url||null};})};
}
module.exports={accountKey,index,owner,named,descriptionIds,collected,project};
