'use strict';
try {
const {publicUrl,ajv}=require('../lib/talents');
const fs=require('node:fs'),path=require('node:path');const {readQueue,mergeQueues}=require('../lib/registration');const {parseSetlist,matchSong,reconcile}=require('../lib/setlist');
const root=path.resolve(__dirname,'..'),[input,output,metadataFile,commentsFile]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node scripts/analyze-setlists.cjs artifact-or-queue.json ops/registration/analysis.json [metadata.json] [comments.json]');
const out=path.resolve(output);if(!out.startsWith(path.join(root,'ops/registration')+path.sep)||!out.endsWith('.json'))throw new Error('Output must be private ops/registration/*.json');
const q=mergeQueues(readQueue(path.join(root,'ops/proposals/review.json')),readQueue(input));
const bounded=file=>{if(fs.statSync(file).size>10*1024*1024)throw new Error('Input too large');return JSON.parse(fs.readFileSync(file,'utf8'));};
const metadata=metadataFile?bounded(metadataFile):[],comments=commentsFile?bounded(commentsFile):{comments:{}};
if(commentsFile&&!require('../lib/comment-discovery').validCommentState(comments))throw new Error('Invalid comment cache');
if(!Array.isArray(metadata)||metadata.length>1000||!comments.comments||Object.keys(comments.comments).length>10000)throw new Error('Invalid metadata/comment input');
const master=require('../data/talents.json'),music=require('../data/music.json');const rows=[];
for(const c of q.candidates.filter(c=>c.youtubeId)){
 const video=metadata.find(v=>v.id===c.youtubeId);const channel=video?.snippet?.channelId||c.channelId;
 const talentIds=master.talents.filter(t=>t.accounts.some(a=>a.service==='youtube'&&a.accountId===channel)).map(t=>t.id);if(!talentIds.length||channel!==c.channelId)continue;
 const text=video?.snippet?.description||c.proposedSetlist.map(r=>`${r.startsAtSeconds===null?'':Math.floor(r.startsAtSeconds/3600)+':'+String(Math.floor(r.startsAtSeconds/60)%60).padStart(2,'0')+':'+String(r.startsAtSeconds%60).padStart(2,'0')+' '}${r.rawLabel}`).join('\n');
 rows.push(...parseSetlist(text,{youtubeId:c.youtubeId,sourceType:'official_description',sourceUrl:c.sourceUrl,talentIds}));
}
for(const c of Object.values(comments.comments)){if(!c.hasSetlist||!Array.isArray(c.entries)||Date.now()-Date.parse(c.retrievedAt)>=30*86400000)continue;if(!publicUrl(c.sourceUrl)||!c.sourceUrl.startsWith('https://www.youtube.com/watch?'))throw new Error('Unsafe comment provenance');const candidate=q.candidates.find(v=>v.youtubeId===c.youtubeId);if(!candidate)continue;rows.push(...parseSetlist(c.entries.map(r=>r.rawLabel).join('\n'),{youtubeId:c.youtubeId,sourceType:'viewer_comment',sourceUrl:c.sourceUrl,talentIds:candidate.talentIds}));}
const analysis={schemaVersion:1,inputCandidates:q.candidates.length,generatedAt:new Date().toISOString(),rows:rows.filter(r=>r.category==='song_candidate').map(r=>({...r,match:matchSong(r,music.songs)})),groups:reconcile(rows),notice:'Unapproved analysis only; comments are reference material, not official evidence.'};
if(!ajv.compile(require('../schemas/setlist-analysis.schema.json'))(analysis))throw new Error('Invalid analysis output');
fs.mkdirSync(path.dirname(out),{recursive:true});if(fs.realpathSync(path.dirname(out))!==path.dirname(out))throw new Error('Symlink output rejected');fs.writeFileSync(out+'.tmp',JSON.stringify(analysis,null,2)+'\n');fs.renameSync(out+'.tmp',out);console.log(JSON.stringify({inputCandidates:q.candidates.length,parsed:rows.length,groups:analysis.groups.length,conflicts:analysis.groups.filter(g=>g.conflict).length}));
} catch { console.error('Analysis rejected: invalid bounded input or private output path. No master changed.');process.exitCode=1; }
