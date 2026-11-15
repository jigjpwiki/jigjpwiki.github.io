'use strict';
const fs=require('node:fs');const {execFileSync}=require('node:child_process');const {loadRelease,validateChange}=require('../lib/release');
const current=loadRelease();let base=process.argv[2];
if(!base&&process.env.GITHUB_EVENT_PATH){const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));base=event.pull_request?.base?.sha||event.before;}
if(base&&/^[0-9a-f]{40}$/.test(base)&&!/^0+$/.test(base)){
  try{execFileSync('git',['cat-file','-e',base+'^{commit}'],{stdio:'ignore'});}catch{execFileSync('git',['fetch','--no-tags','--depth=1','origin',base],{stdio:'ignore'});}
  let before;
  try{before=JSON.parse(execFileSync('git',['show',base+':data/release.json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));}
  catch{const html=execFileSync('git',['show',base+':index.html'],{encoding:'utf8'});const version=html.match(/Version (\d+\.\d+\.\d+(?:-beta(?:\.\d+)?)?)/)?.[1];before=version?{version,changes:[]}:null;}
  const files=execFileSync('git',['diff','--name-only',base,'HEAD'],{encoding:'utf8'}).trim().split('\n');validateChange(before,current,files);
}
console.log('Release metadata and available base comparison passed.');
