'use strict';
const { chromium }=require('playwright'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');const http=require('node:http');
const root=path.resolve(__dirname,'../_site');
(async()=>{
 const server=http.createServer((req,res)=>{
  const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=path.resolve(root,'.'+p);
  if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file))return res.writeHead(404).end();
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  for(const width of [1440,390,320]){
   const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Los_Angeles'});
   await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.clock.install({time:new Date('2026-12-25T00:00:00Z')});await page.goto(base+'/anniversaries/');
   await page.waitForFunction(()=>document.getElementById('month-label').textContent==='2026-12');
   assert.match(await page.locator('#upcoming').innerText(),/真昼ねる/);
   await page.getByRole('button',{name:'翌月',exact:true}).click();assert.equal(await page.locator('#month-label').innerText(),'2027-01');
   for(let i=0;i<2;i++)await page.getByRole('button',{name:'翌月',exact:true}).click();
   assert.equal(await page.locator('#calendar [data-event-id]').count(),4);assert.match(await page.locator('#calendar').innerText(),/2周年/);
   await page.locator('#event-type').selectOption('birthday');assert.equal(await page.locator('#calendar [data-event-id]').count(),0);
   await page.locator('#event-type').selectOption('');await page.getByRole('button',{name:'前月',exact:true}).focus();await page.keyboard.press('Enter');
   assert.equal(await page.locator('#month-label').innerText(),'2027-02');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(process.env.BROWSER_SCREENSHOT_DIR){fs.mkdirSync(process.env.BROWSER_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.BROWSER_SCREENSHOT_DIR,`calendar-${width}.png`),fullPage:true});}
   await page.goto(base+'/talents/');await page.getByRole('link',{name:'真昼ねる',exact:true}).click();await page.waitForURL(base+'/talents/tal-000001/');
   assert.equal(await page.getByRole('heading',{name:'真昼ねる',exact:true}).count(),1);
   assert.doesNotMatch(await page.locator('main').innerText(),/tal-000001|activityStatus|VTuber活動：/);
   await page.goto(base+'/talents/tal-000004/');assert.match(await page.locator('main').innerText(),/旧所属：ProForma Nova/);assert.doesNotMatch(await page.locator('main').innerText(),/引退|活動終了/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(process.env.BROWSER_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.BROWSER_SCREENSHOT_DIR,`profile-${width}.png`),fullPage:true});
   assert.deepEqual(errors,[]);await context.close();console.log(`Phase 2 browser passed: ${width}px, JST, month movement, filters, keyboard, no overflow`);
  }
  const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();await page.goto(base+'/anniversaries/');assert.equal(await page.locator('.anniversary-calendar').count(),1);assert.equal(await page.locator('#calendar-tools').isVisible(),false);await context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
