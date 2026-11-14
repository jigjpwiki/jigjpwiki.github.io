'use strict';
const fs=require('node:fs');const path=require('node:path');
function validateRelease(value){
  if(!value||Object.keys(value).sort().join(',')!=='changes,featurePaths,version'||!/^\d+\.\d+\.\d+(?:-beta(?:\.\d+)?)?$/.test(value.version)||!Array.isArray(value.changes)||!value.changes.length||value.changes.some(s=>typeof s!=='string'||!s.trim()||s.length>160)||!Array.isArray(value.featurePaths)||value.featurePaths.some(s=>typeof s!=='string'||!/^\/(?:[a-z0-9-]+\/)*$/.test(s)))throw new Error('Invalid release metadata');
  return value;
}
const loadRelease=(root=path.join(__dirname,'..'))=>validateRelease(JSON.parse(fs.readFileSync(path.join(root,'data/release.json'),'utf8')));
function newer(a,b){const number=v=>v.split('-')[0].split('.').map(Number);const x=number(a),y=number(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];const pre=v=>v.includes('-')?Number(v.split('-')[1].split('.')[1]||0):Infinity;return pre(a)>pre(b);}
function validateChange(before,after,files){
  validateRelease(after);
  const ui=files.some(f=>/^(index\.html|style\.css|assets\/.*\.(?:js|css)|pages\/|lib\/(?:.*pages|talent-details)\.js|scripts\/build-site\.js)/.test(f));
  if(before&&ui&&(before.version===after.version||JSON.stringify(before.changes)===JSON.stringify(after.changes)))throw new Error('UI changes require a version and release-note update in data/release.json');
  if(before&&before.version!==after.version&&!newer(after.version,before.version))throw new Error('Release version must increase');
}
function publishRelease(output,release){
  const file=path.join(output,'index.html');const html=fs.readFileSync(file,'utf8');
  if(!html.includes('{{releaseVersion}}'))throw new Error('Missing centralized version slot');
  fs.writeFileSync(file,html.replaceAll('{{releaseVersion}}',release.version));
  for(const route of release.featurePaths)if(!fs.existsSync(path.join(output,route,'index.html')))throw new Error('Release claims a missing feature page');
  fs.writeFileSync(path.join(output,'data/update_info.json'),JSON.stringify({version:release.version,message_all:release.changes.join(' '),message_mobile:'',message_pc:''},null,2)+'\n');
}
module.exports={validateRelease,loadRelease,newer,validateChange,publishRelease};
