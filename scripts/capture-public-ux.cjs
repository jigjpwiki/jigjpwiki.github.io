'use strict';
// Reproducible review images; no external downloads or production writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{chromium}=require('playwright');
const baseline=process.env.UX_BASELINE_DIR;if(!baseline)throw new Error('Set UX_BASELINE_DIR to a built main snapshot');
const dirs={before:path.resolve(baseline),after:path.resolve('_site')},out='docs/public-ux-c/screens';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),parts=u.pathname.split('/'),kind=parts[1];if(!dirs[kind])return res.writeHead(404).end();const relative='/'+parts.slice(2).join('/'),root=dirs[kind],f=path.resolve(root,'.'+relative+(relative.endsWith('/')?'index.html':''));if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'})[path.extname(f)]||'application/octet-stream');let body=fs.readFileSync(f);if(path.extname(f)==='.html')body=Buffer.from(body.toString().replace(/(href|src)="\/(?!\/)/g,`$1="/${kind}/`));res.end(body);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{for(const variant of ['before','after'])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Tokyo'});await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());const p=await context.newPage();await p.clock.install({time:new Date('2026-11-20T00:00:00Z')});
  const routes={anniversaries:'/anniversaries/',music:'/music/','music-videos':'/music/?category=videos',karaoke:'/music/karaoke/','karaoke-detail':'/music/karaoke/karaoke-000001/',events:'/events/','event-detail':'/events/evt-000001/',goods:'/goods/','goods-kotoha':'/goods/?q='+encodeURIComponent('藤宮コトハ誕生日2026'),'campaign-detail':variant==='after'?'/goods/campaigns/campaign-000001/':'/goods/product-000001/'};
  for(const [name,route]of Object.entries(routes)){await p.goto(base+'/'+variant+route);await p.evaluate(()=>document.fonts.ready);if(name==='music-videos'&&variant==='before')await p.getByRole('heading',{name:'オリジナル曲・歌ってみた',exact:true}).scrollIntoViewIfNeeded();await p.screenshot({path:`${out}/${variant}-${name}-${width}.png`,fullPage:name==='campaign-detail'});}
  await context.close();console.log(`Captured ${variant} ${width}`);
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
