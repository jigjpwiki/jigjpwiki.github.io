'use strict';
const {discoveryRequest}=require('./discovery-request');
const {ajv}=require('./talents');const stateShape=ajv.compile(require('../schemas/comment-state.schema.json'));
const {parseSetlist,digest}=require('./setlist');
const validId=id=>/^[\w-]{11}$/.test(id||'');
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function validCommentState(s){return stateShape(s)&&Object.entries(s.comments).every(([id,c])=>id===c.commentId&&c.sourceUrl==='https://www.youtube.com/watch?v='+c.youtubeId+'&lc='+id&&c.entries.every(e=>e.youtubeId===c.youtubeId&&e.sourceUrl===c.sourceUrl));}
const emptyComments=()=>({schemaVersion:1,videos:{},comments:{},budget:{day:null,used:0},lastAttemptAt:null,lastSuccessAt:null});
async function collectComments({videos,state=emptyComments(),apiKey,request=discoveryRequest,save=async()=>{},now=new Date(),maxUnits=20,maxDailyUnits=20,maxVideos=10,maxPages=2,order='relevance',searchTerms=null,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 for(const n of [maxUnits,maxDailyUnits])if(!Number.isInteger(n)||n<1||n>100)throw new Error('Invalid comment budget');
 if(!Number.isInteger(maxVideos)||maxVideos<1||maxVideos>100||!Number.isInteger(maxPages)||maxPages<1||maxPages>5||!['time','relevance'].includes(order)||searchTerms!==null&&!['セトリ','セットリスト','曲一覧'].includes(searchTerms))throw new Error('Invalid comment limits');
 if(!validCommentState(state))throw new Error('Invalid comment state');
 const next=structuredClone(state),report={requests:0,estimatedUnits:0,videos:0,comments:0,parsed:0,reused:0,candidateComments:0,songs:0,timestamps:0,errors:[],unavailable:[],stopReason:null};
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);next.budget=next.budget?.day===day?next.budget:{day,used:0};if(!Number.isInteger(next.budget.used)||next.budget.used<0)throw new Error('Invalid comment daily budget');
 next.lastAttemptAt=now.toISOString();
 // API-derived cached comment excerpts expire after 30 days. Curated verified records are separate.
 for(const [id,c]of Object.entries(next.comments))if(!stamp(c.retrievedAt)||now-Date.parse(c.retrievedAt)>=30*86400000)delete next.comments[id];
 const persist=async()=>{if(!validCommentState(next))throw new Error('Invalid comment checkpoint');next.report={...report,dailyUnits:next.budget.used};await save(next);};
 for(const v of videos.slice(0,maxVideos)){
  if(!validId(v.youtubeId)||v.kindConfirmed!==true||!Array.isArray(v.talentIds)||!v.talentIds.length)throw new Error('Comments require a reviewed karaoke video');
  const key=digest([v.youtubeId,order,searchTerms]),job=next.videos[key]||{pageToken:null,checkedAt:null};
  if(job.checkedAt&&now-Date.parse(job.checkedAt)<86400000&&(!job.pageToken||job.unavailable))continue;
  let failed=false;
  for(let page=0;page<maxPages;page++){
   let result=null;
   for(let attempt=0;attempt<3;attempt++){
    if(report.requests>=maxUnits||next.budget.used>=maxDailyUnits){report.stopReason='unit_limit';await persist();return {state:next,report};}
    report.requests++;report.estimatedUnits++;next.budget.used++;await persist();
    try{
     if(!apiKey)throw Object.assign(new Error('Missing credential'),{diagnostics:{httpStatus:401}});
     const url=new URL('https://www.googleapis.com/youtube/v3/commentThreads');url.search=new URLSearchParams({part:'snippet',videoId:v.youtubeId,maxResults:'100',textFormat:'plainText',order,...(searchTerms?{searchTerms}:{}),...(job.pageToken?{pageToken:job.pageToken}:{}),key:apiKey}).toString();
     result=await request(url.toString());if(!result||!Array.isArray(result.items)||result.error||result.kind&&result.kind!=='youtube#commentThreadListResponse')throw new Error('Invalid comments response');break;
    }catch(e){const status=Number.isInteger(e.diagnostics?.httpStatus)?e.diagnostics.httpStatus:null;const reason=['commentsDisabled','videoNotFound','quotaExceeded','dailyLimitExceeded','forbidden','keyInvalid'].includes(e.safeReason)?e.safeReason:null;
     if((status===null||status===429||status>=500)&&attempt<2){await wait(250*2**attempt);continue;}
     const local=!['quotaExceeded','dailyLimitExceeded','keyInvalid'].includes(reason)&&(status===404||reason==='commentsDisabled');const diagnostic={endpoint:'commentThreads.list',httpStatus:status,reason,scope:local?'video':'global',youtubeId:v.youtubeId};if(local){report.unavailable.push(diagnostic);job.checkedAt=now.toISOString();job.unavailable=true;next.videos[key]=job;}else report.errors.push(diagnostic);failed=true;
     if(!local){report.stopReason='fetch_failed';await persist();return {state:next,report};}break;
    }
   }
   if(failed)break;
   for(const thread of result.items){const top=thread?.snippet?.topLevelComment,c=top?.snippet,id=top?.id;
    if(!c||c.videoId!==v.youtubeId||!/^U[A-Za-z0-9_.-]{2,199}$/.test(id||'')||!stamp(c.publishedAt)||!stamp(c.updatedAt)||typeof(c.textOriginal||c.textDisplay)!=='string'){report.errors.push({endpoint:'commentThreads.list',httpStatus:null,reason:null,scope:'video',youtubeId:v.youtubeId});continue;}
    report.comments++;const text=c.textOriginal||c.textDisplay,sourceUrl='https://www.youtube.com/watch?v='+v.youtubeId+'&lc='+id,hash=digest(text),old=next.comments[id];let entries;
    if(old&&old.updatedAt===c.updatedAt&&old.contentHash===hash&&old.parserVersion===1){entries=old.entries;report.reused++;}else{entries=parseSetlist(text,{youtubeId:v.youtubeId,sourceType:'viewer_comment',sourceUrl,talentIds:v.talentIds});report.parsed++;}
    const songs=entries.filter(e=>e.category==='song_candidate'),timestamps=entries.filter(e=>e.startsAtSeconds!==null).length;
    const detected=songs.length>=2&&(timestamps>=2||/セトリ|セットリスト|曲一覧/.test(text));
    next.comments[id]={commentId:id,youtubeId:v.youtubeId,publishedAt:c.publishedAt,updatedAt:c.updatedAt,retrievedAt:now.toISOString(),sourceUrl,contentHash:hash,parserVersion:1,history:old&&old.contentHash!==hash?[...(old.history||[]),{contentHash:old.contentHash,updatedAt:old.updatedAt}].slice(-100):(old?.history||[]),hasSetlist:detected,songCount:songs.length,timestampCount:timestamps,entries:detected?songs:[],verification:old&&old.contentHash!==hash?'needs_review':old?.verification||'pending'};
    if(detected){report.candidateComments++;report.songs+=songs.length;report.timestamps+=timestamps;}
   }
   const token=typeof result.nextPageToken==='string'?result.nextPageToken:null;
   if(token&&token===job.pageToken){report.errors.push({endpoint:'commentThreads.list',httpStatus:null,reason:null,scope:'video',youtubeId:v.youtubeId});break;}
   job.pageToken=token;job.unavailable=false;job.checkedAt=now.toISOString();next.videos[key]=job;await persist();if(!token)break;
  }
  report.videos++;
 }
 report.stopReason=report.errors.length?'partial_failure':'complete';if(!report.errors.length)next.lastSuccessAt=now.toISOString();await persist();return {state:next,report};
}
module.exports={validCommentState,emptyComments,collectComments};
