'use strict';
try {
const fs=require('node:fs'),path=require('node:path');const {generatePlan}=require('../lib/registration');
const root=path.resolve(__dirname,'..'),[input,output]=process.argv.slice(2);
if(!input)throw new Error('Usage: node scripts/register-music.cjs reviewed.json [ops/registration/plan.json]; default dry-run');
if(fs.statSync(input).size>5*1024*1024)throw new Error('Review too large');
const plan=generatePlan(root,JSON.parse(fs.readFileSync(input,'utf8')));
if(output){const out=path.resolve(output),allowed=path.join(root,'ops/registration')+path.sep;if(!out.startsWith(allowed)||!out.endsWith('.json'))throw new Error('Plan output must be ops/registration/*.json');fs.mkdirSync(path.dirname(out),{recursive:true});if(fs.realpathSync(path.dirname(out))!==path.dirname(out))throw new Error('Symlink output rejected');const temp=out+'.tmp';fs.writeFileSync(temp,JSON.stringify(plan,null,2)+'\n');fs.renameSync(temp,out);}
console.log(JSON.stringify({new:plan.report.new.length,changed:plan.report.changed.length,duplicates:plan.report.duplicates.length,baseHash:plan.baseHash,resultHash:plan.resultHash,masterWritten:false},null,2));
} catch { console.error('Registration rejected; verify approvals, schema and current master hashes. No master changed.');process.exitCode=1; }
