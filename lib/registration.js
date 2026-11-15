'use strict';
const {workTitleKey,identityKey,identities,assertWorkEvidence}=require('./song-identity');
const fs=require('node:fs'),path=require('node:path');
const {ajv,loadTalents,publicUrl}=require('./talents');
const {loadCatalog,publicCatalog}=require('./catalog');
const {validateMedia,validateEvents}=require('./feature-data');
const {validateMusic}=require('./music-data');const {validateKaraoke}=require('./karaoke-data');
const {digest,normalize}=require('./setlist');
const proposalShape=ajv.compile(require('../schemas/proposals.schema.json'));
function readQueue(file){if(fs.statSync(file).size>10*1024*1024)throw new Error('Input exceeds 10 MiB');const input=JSON.parse(fs.readFileSync(file,'utf8')),q=input.queue||input;if(!proposalShape(q)||q.candidates.length>10000||new Set(q.candidates.map(c=>c.key)).size!==q.candidates.length)throw new Error('Invalid bounded candidate input');return q;}
function mergeQueues(git,artifact){const byKey=new Map(git.candidates.map(c=>[c.key,structuredClone(c)]));for(const c of artifact.candidates){const old=byKey.get(c.key);if(!old)byKey.set(c.key,c);else if(c.evidenceHash===old.evidenceHash&&old.evidenceHash)byKey.set(c.key,{...c,reviewStatus:old.reviewStatus,history:old.history||c.history||[]});else byKey.set(c.key,{...c,reviewStatus:'needs_review',history:[...(old.history||[]),...(c.history||[])]});}return {...artifact,candidates:[...byKey.values()]};}
const files=['media','music','karaoke','feature-id-registry'];
function snapshot(root){return Object.fromEntries(files.map(n=>[n,JSON.parse(fs.readFileSync(path.join(root,'data',n+'.json'),'utf8'))]));}
const modelHash=masters=>digest(masters);
function fieldHash(item,field){return digest({field,value:item[field]});}
function verify(item,field){const check=item.approvals?.[field];if(!check||!([item.evidenceHash,...(item.evidenceHistory||[])].includes(check.evidenceHash))||check.status!=='verified'||check.valueHash!==fieldHash(item,field)||!publicUrl(check.sourceUrl)||!Number.isFinite(Date.parse(check.checkedAt))||Date.parse(check.checkedAt)>Date.now()+300000)throw new Error('Missing or stale approval: '+field);return check;}
function assertSafeEvidence(check){const u=new URL(check.sourceUrl);if(!['www.youtube.com','youtube.com','youtu.be'].includes(u.hostname)||u.searchParams.has('lc'))throw new Error('Publication needs official video evidence, not comment-only confirmation');}
function assertVideoEvidence(check,id){assertSafeEvidence(check);const u=new URL(check.sourceUrl);if((u.hostname==='youtu.be'?u.pathname.slice(1):u.searchParams.get('v'))!==id)throw new Error('Evidence belongs to another video');}
function generatePlan(root,review){
 // Review is data, never a module. Validate its bounded closed schema before using it.
 const schema=ajv.compile(require('../schemas/registration.schema.json'));if(!schema(review))throw new Error('Invalid registration review');
 const before=snapshot(root),next=structuredClone(before);const beforeHash=modelHash(before);
 const manifest=review.baseHash;if(manifest!==beforeHash&&review.resultHash!==beforeHash)throw new Error('Master changed: regenerate and re-review concurrent ID/data conflicts');
 const report={new:[],changed:[],duplicates:[],conflicts:[],notice:'Proposal only. Publish through a reviewed PR; no master was written.'};
 const allocated=new Map(Object.entries(review.allocated||{}));
 const issue=(kind,key)=>{const existing=allocated.get(kind+':'+key);if(existing){if(!next['feature-id-registry'].issued.includes(existing))next['feature-id-registry'].issued.push(existing);return existing;}
  let n=Math.max(0,...next['feature-id-registry'].issued.filter(id=>id.startsWith(kind+'-')).map(id=>Number(id.split('-')[1])));const id=kind+'-'+String(n+1).padStart(6,'0');next['feature-id-registry'].issued.push(id);allocated.set(kind+':'+key,id);return id;};
 const add=(list,value,key='id')=>{const old=list.find(v=>v[key]===value[key]);if(old){if(JSON.stringify(old)===JSON.stringify(value)){report.duplicates.push(value[key]);return old;}report.conflicts.push(value[key]);throw new Error('Existing record differs; explicit reviewed patch with expected hash required');}list.push(value);report.new.push(value[key]);return value;};
 const source=(url,checkedAt,official=true)=>{if(!publicUrl(url))throw new Error('Unsafe evidence URL');const id='src-v6b-'+digest(url).slice(0,16);const old=next.media.sources.find(s=>s.id===id);if(!old)next.media.sources.push({id,kind:official?'official':'wiki',url,checkedAt});return id;};
 for(const supplied of review.sources||[]){if(supplied.kind!=='official'||!publicUrl(supplied.url)||Date.parse(supplied.checkedAt)>Date.now()+300000)throw new Error('Invalid supplied original source');const old=next.media.sources.find(s=>s.id===supplied.id);if(old&&JSON.stringify(old)!==JSON.stringify(supplied))throw new Error('Conflicting evidence ID');if(!old)next.media.sources.push(supplied);}
 for(const patch of review.patches||[]){const list=next[patch.master][patch.collection],old=list?.find(x=>x.id===patch.id);verify(patch,'value');if(patch.collection!=='songs')assertSafeEvidence(patch.approvals.value);if(!old||patch.value.id!==old.id)throw new Error('Cannot replace stable ID');if(digest(old)===digest(patch.value)){report.duplicates.push(old.id);continue;}if(digest(old)!==patch.expectedHash)throw new Error('Stale patch / concurrent change');report.changed.push({id:old.id,before:structuredClone(old),after:patch.value});list[list.indexOf(old)]=structuredClone(patch.value);}
 const performanceIds=new Set([...next.karaoke.karaokes.map(k=>k.youtubeId),...review.videos.filter(v=>v.kind==='karaoke').map(v=>v.youtubeId)]);

 for(const v of review.videos){verify(v,'kind');verify(v,'talentIds');verify(v,'media');for(const f of ['kind','talentIds','media'])assertVideoEvidence(v.approvals[f],v.youtubeId);
  const src=source('https://www.youtube.com/watch?v='+v.youtubeId,v.approvals.kind.checkedAt);
  const existingMedia=next.media.videos.find(m=>m.youtubeId===v.youtubeId);if(!existingMedia)add(next.media.videos,{...v.media,youtubeId:v.youtubeId,sourceRefs:[src],visibility:'public'},'youtubeId');else if(existingMedia.channelId!==v.media.channelId)throw new Error('Video channel conflict');
  if(v.kind==='music-video'){
   verify(v,'song');verify(v,'videoType');assertSafeEvidence(v.approvals.song);assertSafeEvidence(v.approvals.videoType);
   const songId=resolveSong(v.song,v.approvals.song);const id=next.music.musicVideos.find(x=>x.youtubeId===v.youtubeId)?.id||issue('mv',v.youtubeId);
   add(next.music.musicVideos,{id,type:v.videoType,songId,rawSongTitle:v.song.title,talentIds:v.talentIds,youtubeId:v.youtubeId,registeredAt:v.registeredAt,sourceRefs:[src],visibility:'public'});continue;
  }
  const existing=next.karaoke.karaokes.find(k=>k.youtubeId===v.youtubeId),kid=existing?.id||issue('karaoke',v.youtubeId);
  for(const row of v.entries){if(row.youtubeId!==v.youtubeId)throw new Error('Performance source video mismatch');for(const f of ['song','order','startsAtSeconds','talentIds']){verify(row,f);if(f==='song')assertSafeEvidence(row.approvals[f]);else assertVideoEvidence(row.approvals[f],v.youtubeId);}
   if(row.sourceType==='viewer_comment'||row.sourceType==='manual_review'){if(!row.manualReview||row.manualReview.status!=='verified'||row.manualReview.evidenceHash!==row.evidenceHash)throw new Error('Viewer evidence requires separate video/manual verification');assertVideoEvidence(row.manualReview,v.youtubeId);}
   const songId=resolveSong(row.song,row.approvals.song),rsource=source(row.approvals.song.sourceUrl,row.approvals.song.checkedAt);
   const old=next.karaoke.performances.find(p=>p.karaokeId===kid&&p.order===row.order&&p.startsAtSeconds===row.startsAtSeconds&&p.songId===songId);
   if(old){if(JSON.stringify(old.talentIds)!==JSON.stringify(row.talentIds))throw new Error('Existing performance cast conflict');report.duplicates.push(old.id);continue;}
   const id=issue('perf',v.youtubeId+':'+row.key);add(next.karaoke.performances,{id,karaokeId:kid,songId,order:row.order,startsAtSeconds:row.startsAtSeconds,endsAtSeconds:null,talentIds:row.talentIds,rawLabel:row.rawLabel,note:row.sourceType==='official_description'?'本人の公式動画説明欄の曲目・時刻表記を確認。アーティストは配信者の表記。':'公開コメントを参考に、別途公式動画で確認。',verification:'verified',verificationMethod:row.sourceType==='official_description'?'official_description':'manual_review',sourceRefs:[...new Set([src,rsource])],visibility:'public'});
  }
  const verified=next.karaoke.performances.filter(p=>p.karaokeId===kid&&p.visibility==='public');let status=verified.length?'partial':'unreviewed',count=null;
  if(v.completeness!==null){verify(v,'completeness');assertVideoEvidence(v.approvals.completeness,v.youtubeId);if(v.completeness.complete){status='complete';count=v.completeness.expectedCount;}else count=v.completeness.expectedCount;}
  if(existing){if(existing.setlistStatus==='complete'&&status!=='complete')throw new Error('Cannot downgrade complete setlist implicitly');if(existing.setlistStatus!==status||existing.expectedCount!==count){report.changed.push({id:kid,before:structuredClone(existing),after:{...existing,setlistStatus:status,expectedCount:count}});existing.setlistStatus=status;existing.expectedCount=count;}}
  else add(next.karaoke.karaokes,{id:kid,youtubeId:v.youtubeId,talentIds:v.talentIds,setlistStatus:status,expectedCount:count,registeredAt:v.registeredAt,sourceRefs:[src],visibility:'public'});
 }
 function resolveSong(song,check){
  if(song===null)return null;
  const key=assertWorkEvidence(song,performanceIds);
  const byIdentity=next.music.songs.find(s=>identities(s).includes(key));
  if(song.existingId){const old=next.music.songs.find(s=>s.id===song.existingId);if(!old||old.visibility!=='public'||!identities(old).includes(key)||byIdentity?.id!==old.id||![old.title,...(old.aliases||[])].some(title=>workTitleKey(title)===workTitleKey(song.title))||JSON.stringify(old.originalArtists?.map(normalize)||null)!==JSON.stringify(song.originalArtists?.map(normalize)||null))throw new Error('Song identity conflict');return old.id;}
  if(byIdentity){if(![byIdentity.title,...(byIdentity.aliases||[])].some(title=>workTitleKey(title)===workTitleKey(song.title))||JSON.stringify(byIdentity.originalArtists)!==JSON.stringify(song.originalArtists))throw new Error('Conflicting song identity');return byIdentity.id;}
  if(next.music.songs.some(s=>[s.title,...(s.aliases||[]),...(s.readings||[])].some(name=>normalize(name)===normalize(song.title))&&JSON.stringify(s.originalArtists?.map(normalize))===JSON.stringify(song.originalArtists?.map(normalize))))throw new Error('Possible existing work: explicitly review canonical identity/aliases; never auto-merge by title');
  const id=issue('song',key),src=source(song.identityUrl,song.identityEvidence.checkedAt);add(next.music.songs,{id,title:song.title,originalArtists:song.originalArtists,aliases:[],readings:[],identityUrl:song.identityUrl,artistEvidence:song.artistEvidence,sourceRefs:[src],visibility:'public'});return id;
 }

 const t=loadTalents(root),c=publicCatalog(loadCatalog(t,root));validateMedia(next.media);validateEvents(t,c,next.media,JSON.parse(fs.readFileSync(path.join(root,'data/events.json'))),next['feature-id-registry']);const music=validateMusic(t,c,next.media,next.music,next['feature-id-registry']);validateKaraoke(music,next.karaoke,next['feature-id-registry']);
 return {schemaVersion:1,nextReview:{...review,resultHash:modelHash(next),allocated:Object.fromEntries(allocated)},baseHash:beforeHash,resultHash:modelHash(next),allocated:Object.fromEntries(allocated),report,masters:next,rollback:before};
}
function reconcileApprovals(previous,current){
 const next={...structuredClone(current),approvals:{},evidenceHistory:[...(current.evidenceHistory||[])]},recheck=[];
 for(const [field,approval]of Object.entries(previous.approvals||{})){
  if(previous.youtubeId===current.youtubeId&&previous.sourceType===current.sourceType&&approval.valueHash===fieldHash(previous,field)&&approval.valueHash===fieldHash(current,field)){next.approvals[field]=approval;if(!next.evidenceHistory.includes(approval.evidenceHash))next.evidenceHistory.push(approval.evidenceHash);}else recheck.push(field);
 }
 return {item:next,recheck,history:structuredClone(previous)};
}
module.exports={verify,reconcileApprovals,readQueue,mergeQueues,snapshot,modelHash,fieldHash,generatePlan};
