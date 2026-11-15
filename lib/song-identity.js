'use strict';
const {publicUrl}=require('./talents');
const workTitleKey=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ja').replace(/[\p{P}\p{S}\s]/gu,'');
function identityKey(value){
 if(!publicUrl(value))throw new Error('Invalid work identity URL');
 const u=new URL(value);const youtube=['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(u.hostname);
 if(youtube){if([...u.searchParams.keys()].some(k=>k!=='v')||u.hash)throw new Error('Playback/comment/playlist URLs cannot identify a work');const id=u.hostname==='youtu.be'?u.pathname.slice(1):u.pathname==='/watch'?u.searchParams.get('v'):null;if(!/^[\w-]{11}$/.test(id||''))throw new Error('Invalid original video identity');return 'https://www.youtube.com/watch?v='+id;}
 for(const key of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/.test(key))u.searchParams.delete(key);
 u.searchParams.sort();u.pathname=u.pathname.replace(/\/$/,'')||'/';return u.toString();
}
function youtubeId(value){try{const u=new URL(identityKey(value));return u.hostname==='www.youtube.com'?u.searchParams.get('v'):null;}catch{return null;}}
function identities(song){return song.identityUrl===null?[]:[song.identityUrl,...(song.identityAliases||[])].map(identityKey);}
function assertWorkEvidence(song,performanceIds=new Set()){
 if(!song.identityUrl)throw new Error('Unresolved work cannot be registered as a public Song');
 const proof=song.identityEvidence;if(!proof||proof.status!=='verified'||!['official_mv','official_release','official_song_page'].includes(proof.kind)||identityKey(proof.sourceUrl)!==identityKey(song.identityUrl)||!proof.publisher||!Number.isFinite(Date.parse(proof.checkedAt))||Date.parse(proof.checkedAt)>Date.now()+300000)throw new Error('Verified work-level evidence required');
 if(performanceIds.has(youtubeId(song.identityUrl)))throw new Error('Karaoke archive cannot identify a work');return identityKey(song.identityUrl);
}
module.exports={workTitleKey,identityKey,youtubeId,identities,assertWorkEvidence};
