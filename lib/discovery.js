'use strict';
const {createHash}=require('node:crypto');
const {youtubeList}=require('./collection');
const {discoveryRequest,reasons}=require('./discovery-request');
const {propose,chapters}=require('./proposals');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
function options(input={}){
 const o={mode:'daily',from:'1970-01-01T00:00:00Z',to:new Date().toISOString(),maxUnits:60,maxDailyUnits:60,maxVideos:200,maxPages:30,maxChannels:20,maxPagesPerChannel:5,maxSeconds:240,...input};
 for(const [k,max] of Object.entries({maxUnits:500,maxDailyUnits:500,maxVideos:5000,maxPages:500,maxChannels:200,maxPagesPerChannel:100,maxSeconds:900}))if(!Number.isInteger(o[k])||o[k]<1||o[k]>max)throw new Error('Invalid limit: '+k);
 if(!['daily','backfill'].includes(o.mode)||!iso(o.from)||!iso(o.to)||Date.parse(o.from)>=Date.parse(o.to))throw new Error('Invalid discovery period/mode');
 return o;
}
function selectChannels(talents,selectors={}){
 const all=talents.talents.flatMap(t=>t.accounts.filter(a=>a.service==='youtube'&&/^UC[\w-]{22}$/.test(a.accountId||'')).map(a=>({channelId:a.accountId,talentId:t.id})));
 const ids=selectors.talentIds||[],channels=selectors.channelIds||[];
 if(ids.some(id=>!talents.talents.some(t=>t.id===id))||channels.some(id=>!all.some(c=>c.channelId===id)))throw new Error('Selector is not a registered talent/channel');
 const chosen=all.filter(c=>(!ids.length||ids.includes(c.talentId))&&(!channels.length||channels.includes(c.channelId)));
 if(new Set(all.map(c=>c.channelId)).size!==all.length)throw new Error('Ambiguous official channel ownership');
 if(!chosen.length)throw new Error('No official talent channels selected');
 return chosen.sort((a,b)=>a.channelId.localeCompare(b.channelId));
}
function emptyState(){return {schemaVersion:1,uploads:{},metadata:{},jobs:{},rotation:0,queue:{candidates:[]},lastAttemptAt:null,lastSuccessAt:null};}
function validateState(s){
 if(!s||s.schemaVersion!==1||!s.uploads||!s.metadata||!s.jobs||!Array.isArray(s.queue?.candidates)||!Number.isInteger(s.rotation)||s.rotation<0)throw new Error('Invalid discovery checkpoint');
 for(const [id,m] of Object.entries(s.metadata)){if(!/^[\w-]{11}$/.test(id)||!iso(m.checkedAt)||!['available','not_returned'].includes(m.status))throw new Error('Invalid metadata checkpoint');}
 return s;
}
// Every attempted request (including retries) costs one unit on these three list endpoints.
// search.list (100 units) is intentionally never used. No raw response/error URL is logged.
async function discover({talents,approved={},feed=[],uploads={},state=emptyState(),config={},apiKey,request=discoveryRequest,save=async()=>{},onDiagnostic=()=>{},now=new Date(),clock=Date.now,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 const o=options(config),selected=selectChannels(talents,o),next=validateState(structuredClone(state));
 const start=clock(),report={mode:o.mode,startedAt:now.toISOString(),requests:0,estimatedUnits:0,pages:0,examinedVideos:0,metadataFetched:0,metadataReused:0,notReturned:0,retries:0,errors:0,stopReason:null,channels:0,failures:[],skippedChannels:0};
 next.lastAttemptAt=now.toISOString();
 const quotaDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 next.dailyBudget=next.dailyBudget?.day===quotaDay?next.dailyBudget:{day:quotaDay,used:0};
 if(!Number.isSafeInteger(next.dailyBudget.used)||next.dailyBudget.used<0)throw new Error('Invalid daily budget checkpoint');
 const deadline=()=>clock()-start>=o.maxSeconds*1000;
 const persist=async()=>{next.report={...report,dailyEstimatedUnits:next.dailyBudget.used};await save(next);};
 let context={stage:'schedule_metadata',channelId:null,talentId:null,videoId:null};
 const fail=(classification,{endpoint=null,status=null,reason=null,scope='global',...extra}={})=>{
  const diagnostic={stage:context.stage,classification,scope,endpoint:['channels','playlistItems','videos'].includes(endpoint)?endpoint+'.list':null,httpStatus:Number.isInteger(status)&&status>=100&&status<=599?status:null,reason:reasons.has(reason)?reason:null,
   channelId:/^UC[\w-]{22}$/.test(context.channelId||'')?context.channelId:null,talentId:/^tal-[0-9]{6}$/.test(context.talentId||'')?context.talentId:null,videoId:/^[\w-]{11}$/.test(extra.videoId||context.videoId||'')?(extra.videoId||context.videoId):null};
  report.errors++;if(report.failures.length<100)report.failures.push(diagnostic);onDiagnostic(diagnostic);
  const error=new Error('Discovery target failed');error.discoveryFailure=diagnostic;return error;
 };
 const api=async(endpoint,params)=>{
  for(let attempt=0;attempt<3;attempt++){
   if(report.estimatedUnits>=o.maxUnits||next.dailyBudget.used>=o.maxDailyUnits||deadline()){report.stopReason=deadline()?'time_limit':next.dailyBudget.used>=o.maxDailyUnits?'daily_unit_limit':'unit_limit';return null;}
   report.requests++;report.estimatedUnits++;next.dailyBudget.used++;await persist();
   try{
    if(!apiKey)throw Object.assign(new Error('Missing API credential'),{diagnostics:{httpStatus:401}});
    const url=new URL('https://www.googleapis.com/youtube/v3/'+endpoint);url.search=new URLSearchParams({...params,key:apiKey}).toString();
    return youtubeList(await request(url.toString()),endpoint);
   }catch(e){
    const status=e.diagnostics?.httpStatus,reason=reasons.has(e.safeReason)?e.safeReason:null;
    // Never retry quota/auth/validation errors. Network/429/5xx get bounded backoff.
    if((status==null||status===429||status>=500)&&attempt<2){report.retries++;await wait(250*2**attempt);continue;}
    const classification=['quotaExceeded','dailyLimitExceeded'].includes(reason)?'quota_exceeded':['rateLimitExceeded','userRateLimitExceeded'].includes(reason)?'rate_limited':status===401||status===403?'authentication_or_permission':status===404?'resource_not_found':status===429?'rate_limited':status>=500?'server_error':status==null?'network_or_timeout':status>=400?'api_rejected':'invalid_api_response';
    const local=(classification==='resource_not_found'&&['channels','playlistItems'].includes(endpoint))||(endpoint==='playlistItems'&&status===400&&reason==='invalidPageToken');
    throw fail(classification,{endpoint,status,reason,scope:local?'channel':'global'});
   }
  }
 };
 const inWindow=date=>iso(date)&&Date.parse(date)>=Date.parse(o.from)&&Date.parse(date)<Date.parse(o.to);
 const owned=new Set(selected.map(c=>c.channelId));
 const observed=new Map(),priorQueue=structuredClone(next.queue);
 const updateQueue=async rows=>{if(!rows.length)return;for(const row of rows)observed.set(row.id,row);next.queue=propose([...observed.values()],talents,approved,priorQueue,now,true);await persist();};
 const cachedRow=m=>m?.status==='available'?m.row:null;
 async function metadata(ids){
  let invalid=false;
  const unique=[...new Set(ids)].filter(id=>/^[\w-]{11}$/.test(id));const fresh=[];
  for(const id of unique){const m=next.metadata[id],ttl=m?.status==='not_returned'?86400000:7*86400000;
   if(m&&now-Date.parse(m.checkedAt)<ttl){report.metadataReused++;if(cachedRow(m))fresh.push(m.row);} }
  await updateQueue(fresh);
  const missing=unique.filter(id=>{const m=next.metadata[id];return !m||now-Date.parse(m.checkedAt)>=(m.status==='not_returned'?86400000:7*86400000);});
  for(let offset=0;offset<missing.length;offset+=50){
   if(report.examinedVideos>=o.maxVideos){report.stopReason='video_limit';return false;}
   const batch=missing.slice(offset,offset+Math.min(50,o.maxVideos-report.examinedVideos));
   const result=await api('videos',{part:'snippet,liveStreamingDetails,contentDetails',id:batch.join(',')});if(!result)return false;
   const rows=[];const returned=new Set();
   for(const v of result.items){if(!v||!batch.includes(v.id)||!v.snippet||!owned.has(v.snippet.channelId)){invalid=true;fail('invalid_video_identity',{endpoint:'videos',scope:'video',videoId:batch.includes(v?.id)?v.id:null});if(batch.includes(v?.id))returned.add(v.id);continue;}
    returned.add(v.id);const snippet=v.snippet,description=String(snippet.description||'');
    const row={id:v.id,snippet:{channelId:snippet.channelId,title:snippet.title,publishedAt:snippet.publishedAt,description},liveStreamingDetails:v.liveStreamingDetails||{},officialMetadata:true,retrievedAt:now.toISOString()};
    if(typeof snippet.title!=='string'||!iso(snippet.publishedAt)||(snippet.description!==undefined&&typeof snippet.description!=='string')){invalid=true;fail('invalid_video_fields',{endpoint:'videos',scope:'video',videoId:v.id});continue;}
    row.evidenceHash=hash([v.id,snippet.channelId,snippet.title,description,snippet.publishedAt,row.liveStreamingDetails]);
    // Parse before discarding full descriptions. Only bounded chapter excerpts enter private checkpoints.
    let single;try{single=propose([row],talents,approved,undefined,now).candidates[0];}catch{invalid=true;fail('invalid_candidate',{endpoint:'videos',scope:'video',videoId:v.id});continue;}
    row.detectionMethods=single?.detectionMethods||[];row.discoveryHints=single?.hints||[];
    row.snippet.description=chapters(description).map(c=>`${Math.floor(c.startsAtSeconds/3600)}:${String(Math.floor(c.startsAtSeconds/60)%60).padStart(2,'0')}:${String(c.startsAtSeconds%60).padStart(2,'0')} ${c.rawLabel}`).join('\n');
    // Preserve extracted candidate directly; reparsing bounded metadata must not change its evidence/methods.
    next.metadata[v.id]={status:'available',checkedAt:now.toISOString(),row};
    if(single)rows.push(row);report.metadataFetched++;
   }
   for(const id of batch)if(!returned.has(id)){next.metadata[id]={status:'not_returned',checkedAt:now.toISOString()};report.notReturned++;}
   report.examinedVideos+=batch.length;await updateQueue(rows);await persist();
   if(invalid)return false;
   if(batch.length<Math.min(50,missing.length-offset)){report.stopReason='video_limit';return false;}
  }return true;
 }
 try{
  // Reuse the existing schedule snapshot. It is not a historical archive; only official owner IDs qualify.
  const known=feed.filter(v=>owned.has(v.youtubeid||v.channelId)&&inWindow(v.date||v.publishedAt)).map(v=>v.videoId||v.youtubeId).filter(Boolean);
  if(!await metadata(known)&&report.stopReason){await persist();return {state:next,report};}
  const ordered=o.mode==='daily'?[...selected.slice(next.rotation%selected.length),...selected.slice(0,next.rotation%selected.length)]:selected;
  for(const c of ordered.slice(0,o.maxChannels)){
   context={stage:'channel_lookup',channelId:c.channelId,talentId:c.talentId,videoId:null};
   try{
   if(deadline()){report.stopReason='time_limit';break;}
   const jobKey=hash(o.mode==='daily'?[o.mode,c.channelId]:[o.mode,c.channelId,o.from,o.to]);
   if(o.mode==='backfill'&&next.jobs[jobKey]?.done)continue;
   next.uploads[c.channelId] ||= uploads[c.channelId];
   if(!next.uploads[c.channelId]){const response=await api('channels',{part:'contentDetails',id:c.channelId});if(!response)break;
    const playlist=response.items.find(x=>x?.id===c.channelId)?.contentDetails?.relatedPlaylists?.uploads;
    if(!/^UU[\w-]{22}$/.test(playlist||''))throw fail('uploads_playlist_missing',{endpoint:'channels',scope:'channel'});next.uploads[c.channelId]=playlist;await persist();}
   const job=next.jobs[jobKey] ||= {pageToken:null,done:false,pending:null};
   // Daily runs restart from newest uploads; backfills resume precisely at uncommitted pages.
   if(o.mode==='daily'&&!job.pending){job.pageToken=null;job.done=false;}
   let channelPages=0;
   while(!job.done&&channelPages<o.maxPagesPerChannel){
    if(!job.pending){
     if(report.pages>=o.maxPages){report.stopReason='page_limit';break;}
     context.stage='uploads_page';
     const response=await api('playlistItems',{part:'snippet,contentDetails',playlistId:next.uploads[c.channelId],maxResults:'50',...(job.pageToken?{pageToken:job.pageToken}:{})});if(!response)break;
     const ids=[];
     for(const v of response.items){const date=v?.contentDetails?.videoPublishedAt||v?.snippet?.publishedAt;const id=v?.contentDetails?.videoId||v?.snippet?.resourceId?.videoId;
      if(!iso(date)||!/^[\w-]{11}$/.test(id||''))throw fail('invalid_uploads_entry',{endpoint:'playlistItems',scope:'channel',videoId:/^[\w-]{11}$/.test(id||'')?id:null});
      if(inWindow(date))ids.push(id);
     }
     if(response.nextPageToken&&response.nextPageToken===job.pageToken)throw fail('repeated_uploads_cursor',{endpoint:'playlistItems',scope:'channel'});
     job.pending={ids,nextPageToken:response.nextPageToken||null,stop:!response.nextPageToken};report.pages++;await persist();
    }
    context.stage='video_metadata';
    if(!await metadata(job.pending.ids))break;
    job.pageToken=job.pending.nextPageToken;job.done=job.pending.stop;job.pending=null;channelPages++;await persist();
    if(o.mode==='daily'){job.done=true;break;}
   }
   if(channelPages>0||job.done)report.channels++;if(report.stopReason)break;
   if(o.mode==='daily')next.rotation=(selected.findIndex(x=>x.channelId===c.channelId)+1)%selected.length;
   }catch(error){
    if(error.discoveryFailure?.scope!=='channel')throw error;
    report.skippedChannels++;
    // Cursor/pending IDs remain untouched for future retry. Advance daily rotation so one
    // unavailable channel cannot starve others; the regular rotation returns to it later.
    if(o.mode==='daily')next.rotation=(selected.findIndex(x=>x.channelId===c.channelId)+1)%selected.length;
    await persist();
   }
  }
  report.incompleteJobs=Object.values(next.jobs).filter(j=>!j.done).length;
  report.observedVideos=observed.size;
  report.observedCandidates=next.queue.candidates.filter(c=>c.youtubeId&&observed.has(c.youtubeId)).length;
  if(!report.stopReason)report.stopReason=report.errors?'partial_failure':'complete';
  if(report.stopReason==='complete')next.lastSuccessAt=now.toISOString();
  await persist();return {state:next,report};
 }catch(e){if(!e.discoveryFailure)fail('internal_validation_or_storage_error');report.stopReason='fetch_failed';await persist();throw new Error('Discovery failed; checkpoint and approved masters retained.');}
}
module.exports={options,selectChannels,emptyState,validateState,discover};
