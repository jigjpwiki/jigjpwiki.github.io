'use strict';
const fetch=require('node-fetch');
const {requestJson}=require('./collection');
// Only fixed API reason codes cross the transport boundary; never messages/body/URLs.
const reasons=new Set(['playlistNotFound','channelNotFound','videoNotFound','quotaExceeded','dailyLimitExceeded','rateLimitExceeded','userRateLimitExceeded','keyInvalid','accessNotConfigured','forbidden','invalidPageToken','authError']);
async function discoveryRequest(url,fetchImpl=fetch){
 let reason=null;
 try{return await requestJson(url,{size:1024*1024},async(u,opts)=>{
  const response=await fetchImpl(u,opts);
  if(!response.ok){try{const body=await response.json();reason=body?.error?.errors?.map(x=>x.reason).find(x=>reasons.has(x))||null;}catch{}}
  return response;
 });}catch(error){error.safeReason=reason;throw error;}
}
module.exports={discoveryRequest,reasons};
