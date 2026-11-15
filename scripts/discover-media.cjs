'use strict';
const fs=require('node:fs'),path=require('node:path');
const {discover,emptyState,options}=require('../lib/discovery');const {writeJson}=require('../lib/collection');
const {loadTalents}=require('../lib/talents');
const root=path.resolve(__dirname,'..');
async function main(){
 const args=process.argv.slice(2),config={};let stateFile='ops/proposals/runtime/discovery.json';
 const names={mode:'mode',from:'from',to:'to','max-units':'maxUnits','max-daily-units':'maxDailyUnits','max-videos':'maxVideos','max-pages':'maxPages','max-channels':'maxChannels','pages-per-channel':'maxPagesPerChannel','max-seconds':'maxSeconds'};
 for(let i=0;i<args.length;i+=2){const key=args[i]?.replace(/^--/,''),v=args[i+1];if(!v)throw new Error('Missing argument');
  if(key==='state')stateFile=v;else if(key==='talents')config.talentIds=v.split(',');else if(key==='channels')config.channelIds=v.split(',');else if(names[key])config[names[key]]=(key.startsWith('max-')||key==='pages-per-channel')?Number(v):v;else throw new Error('Unknown option');}
 if((config.mode||'daily')==='daily'){config.from ||= new Date(Date.now()-7*86400000).toISOString();config.to ||= new Date().toISOString();}
 else if(!config.from||!config.to)throw new Error('Backfill requires explicit --from and --to (exclusive)');
 options(config);
 const file=path.resolve(root,stateFile),allowed=path.join(root,'ops/proposals/runtime')+path.sep;
 if(!file.startsWith(allowed)||!file.endsWith('.json'))throw new Error('State must be private ops/proposals/runtime/*.json');
 fs.mkdirSync(path.dirname(file),{recursive:true});if(fs.realpathSync(path.dirname(file))!==path.dirname(file))throw new Error('Symlink state paths not allowed');
 const lock=file+'.lock';const fd=fs.openSync(lock,'wx');
 try{
 const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
 const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):emptyState();
 const reviewed=read('ops/proposals/review.json');
 if(!fs.existsSync(file))state.queue=reviewed;else state.queue=require('../lib/proposals').applyReviews(state.queue,reviewed);
 const media=read('data/media.json'),music=read('data/music.json'),karaoke=read('data/karaoke.json'),events=read('data/events.json');
 const {report}=await discover({talents:loadTalents(root),approved:{videos:media.videos,musicVideos:music.musicVideos,karaokes:karaoke.karaokes,events:events.events},feed:read('data/youtube.json'),uploads:read('data/youtube_cache.json').__uploads__||{},state,config,apiKey:process.env.YOUTUBE_API_KEY,save:s=>writeJson(file,s)});
 console.log(JSON.stringify(report,null,2));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'### Private music discovery\n```json\n'+JSON.stringify(report,null,2)+'\n```\nNo approved master or Pages artifact changed.\n');
 }finally{fs.closeSync(fd);fs.rmSync(lock,{force:true});}
}
main().catch(()=>{console.error('Discovery stopped. Inspect the private checkpoint report; credentials, URLs and response bodies are intentionally omitted.');process.exitCode=1;});
