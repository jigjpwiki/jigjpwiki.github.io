'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
module.exports=function historicalRoot(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jigdule-history-'));
 fs.mkdirSync(path.join(dir,'data'));
 for(const [name,value]of Object.entries(require('./catalog-review-history.json')))fs.writeFileSync(path.join(dir,'data',name+'.json'),JSON.stringify(value));
 fs.symlinkSync(path.resolve(__dirname,'../../assets'),path.join(dir,'assets'),'dir');
 require('node:test').after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;
};
