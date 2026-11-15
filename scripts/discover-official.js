'use strict';
const fs=require('node:fs'),path=require('node:path');const {discover,matchCatalog}=require('../lib/official-discovery');
const root=path.join(__dirname,'..');const dir=path.join(root,'ops/official-discovery');const file=path.join(dir,'runtime.json');const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};
discover(JSON.parse(fs.readFileSync(path.join(dir,'sources.json'))).sources,state).then(next=>{for(const c of next.candidates)c.existingMatches=matchCatalog(c,require('../data/events.json'),require('../data/goods.json'));fs.writeFileSync(file+'.tmp',JSON.stringify(next,null,2)+'\n');fs.renameSync(file+'.tmp',file);console.log(JSON.stringify(next.report));}).catch(()=>{console.error('Discovery failed; previous checkpoint retained');process.exitCode=1;});
