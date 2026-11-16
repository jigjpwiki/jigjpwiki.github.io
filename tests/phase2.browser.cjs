'use strict';
const { chromium }=require('playwright'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');const http=require('node:http');
const root=path.resolve(__dirname,'../_site');
const master=require('../data/talents.json');const catalog=require('../data/catalog.json');const events=require('../data/anniversaries.json').events;
const core=require('../assets/js/anniversary-core');
const formerCount=master.talents.filter(t=>t.affiliations.some(a=>a.status==='former')).length;
const orgCurrent=master.talents.filter(t=>t.affiliations.some(a=>a.organizationId==='org-000001'&&a.status==='current')).length;
const firstGroupCurrent=catalog.groups[0].talentIds.filter(id=>master.talents.find(t=>t.id===id).affiliations.some(a=>a.status==='current'&&a.organizationId==='org-000001')).length;
(async()=>{
 const server=http.createServer((req,res)=>{
  // Optional-image behavior is a deterministic fixture, not an assumption about live talents.
  if(['/fixture-profile-image/','/fixture-profile-no-image/'].includes(req.url)){
   const fixture=structuredClone(master),talent=fixture.talents.find(t=>t.id==='tal-000004');
   const source=talent.displayNameSourceRefs.find(id=>fixture.sources.some(s=>s.id===id&&s.kind==='official'));
   talent.profileImage=req.url==='/fixture-profile-image/'?{url:'https://images.example/fixture-avatar.png',sourceRefs:[source]}:null;
   require('../lib/talents').validateTalents(fixture,{registry:require('../data/talent-id-registry.json')});
   const data=require('../lib/catalog').publicCatalog(require('../lib/catalog').loadCatalog(fixture));
   res.setHeader('Content-Type','text/html');return res.end(require('../lib/talent-details').talentPage(talent,fixture,data,{}));
  }
  if(req.url==='/fixture-goods/'||req.url==='/fixture-profile/') {
   const m=require('./fixtures/goods.cjs')();
   m.goods.products[0].image='https://images.example/unavailable.png';
   m.goods.offers.push({...m.goods.offers[0],id:'offer-000002',startsAt:'2027-01-01T00:00:00Z',endsAt:'2027-02-01T00:00:00Z'});
   m.goods.offers.push({...m.goods.offers[0],id:'offer-000003',status:'sold_out'});
   const data=require('../lib/catalog').publicCatalog(m);
   res.setHeader('Content-Type','text/html');
   if(req.url==='/fixture-profile/')return res.end(require('../lib/talent-details').talentPage(m.talents.talents[0],m.talents,data,{},id=>require('../lib/goods-pages').relatedGoods(id,m.talents,data)));
   return res.end(require('../lib/goods-pages').goodsPage(m.talents,data,new Date('2026-12-25T00:00:00Z')));
  }
  const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=path.resolve(root,'.'+p);
  if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file))return res.writeHead(404).end();
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  for(const width of [1440,768,390,320]){
   const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Los_Angeles'});
   await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
   await context.route('https://images.example/fixture-avatar.png',r=>r.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(root,'assets/favicon-32x32.png'))}));
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.clock.install({time:new Date('2026-12-25T00:00:00Z')});await page.goto(base+'/anniversaries/');
   await page.waitForFunction(()=>document.getElementById('month-label').textContent==='2026-12');
   assert.match(await page.locator('#upcoming').innerText(),/真昼ねる/);
   assert.equal(await page.locator('#calendar-reference').isVisible(),false);
   await page.clock.setFixedTime(new Date('2026-12-31T15:00:00Z'));
   await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
   assert.equal(await page.locator('#month-label').innerText(),'2027-01');
   assert.match(await page.locator('#upcoming-range').innerText(),/2027-01-01から2027-01-30/);
   await page.clock.setFixedTime(new Date('2026-12-25T00:00:00Z'));
   await page.getByRole('button',{name:'今月',exact:true}).click();
   await page.getByRole('button',{name:'翌月',exact:true}).click();assert.equal(await page.locator('#month-label').innerText(),'2027-01');
   for(let i=0;i<2;i++)await page.getByRole('button',{name:'翌月',exact:true}).click();
   await page.locator('[data-day="2027-03-07"]').click();
   await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[data-day="2027-03-08"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#day-details [data-event-id]').count(),core.between(events,'2027-03-08','2027-03-09').length);
   await page.keyboard.press('ArrowLeft');
   assert.equal(await page.locator('#day-details [data-event-id]').count(),core.between(events,'2027-03-07','2027-03-08').length);assert.match(await page.locator('#day-details').innerText(),/2周年/);
   await page.locator('#day-details details summary').first().click();assert.equal(await page.locator('#day-details details[open] a').first().getAttribute('href'),'https://www.proforma-production.jp/news/n/q1rm0p3exwy3');
   if(process.env.BROWSER_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.BROWSER_SCREENSHOT_DIR,`calendar-filled-${width}.png`),fullPage:true});
   await page.locator('#event-type').selectOption('birthday');assert.equal(await page.locator('#day-details [data-event-id]').count(),0);
   await page.locator('#event-type').selectOption('');await page.getByRole('button',{name:'前月',exact:true}).focus();await page.keyboard.press('Enter');
   assert.equal(await page.locator('#month-label').innerText(),'2027-02');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(process.env.BROWSER_SCREENSHOT_DIR){fs.mkdirSync(process.env.BROWSER_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.BROWSER_SCREENSHOT_DIR,`calendar-${width}.png`),fullPage:true});}
   await page.goto(base+'/talents/');
   assert.equal(await page.locator('#talent-relation option[value="former"]').innerText(),`旧所属 (${formerCount})`);
   await page.locator('#talent-search').fill('真昼');assert.equal(await page.locator('.talent-card:visible').count(),1);
   await page.locator('#talent-relation').selectOption('former');assert.equal(await page.locator('.talent-card:visible').count(),0);assert.equal(await page.locator('#talent-empty').isVisible(),true);
   await page.getByRole('button',{name:'条件を解除'}).click();await page.waitForFunction(()=>!document.querySelector('#tal-000004').hidden);
   await page.locator('#talent-organization').selectOption('org-000001');await page.locator('#talent-relation').selectOption('current');assert.equal(await page.locator('.talent-card:visible').count(),orgCurrent);
   await page.locator('#talent-group').selectOption('group-000001');assert.equal(await page.locator('.talent-card:visible').count(),firstGroupCurrent);
   await page.locator('#talent-relation').selectOption('former');assert.equal(await page.locator('.talent-card:visible').count(),1);assert.match(await page.locator('.talent-card:visible').innerText(),/旧所属/);
   await page.getByRole('button',{name:'条件を解除'}).click();await page.waitForFunction(()=>!document.querySelector('#tal-000001').hidden);
   // Exercise every expanded agency and group against independently curated ID sets.
   const visibleIds=async()=>page.locator('[data-person]:visible').evaluateAll(nodes=>nodes.map(n=>n.id).sort());
   for(const org of master.organizations){
    await page.locator('#talent-organization').selectOption(org.id);
    assert.deepEqual(await visibleIds(),master.talents.filter(t=>t.affiliations.some(a=>a.organizationId===org.id&&['current','former'].includes(a.status))).map(t=>t.id).sort());
   }
   await page.locator('#talent-organization').selectOption('');
   for(const group of catalog.groups){await page.locator('#talent-group').selectOption(group.id);assert.deepEqual(await visibleIds(),[...group.talentIds].sort());}
   await page.locator('#talent-group').selectOption('');
   await page.getByRole('link',{name:'真昼ねる',exact:true}).click();await page.waitForURL(base+'/talents/tal-000001/');
   assert.equal(await page.getByRole('heading',{name:'真昼ねる',exact:true}).count(),1);
   assert.match(await page.locator('main').innerText(),/サイト公開時点の保存データ/);
   assert.doesNotMatch(await page.locator('main').innerText(),/tal-000001|activityStatus|VTuber活動：/);
   for(const withImage of [true,false]){
    await page.goto(base+(withImage?'/fixture-profile-image/':'/fixture-profile-no-image/'));
    const hero=page.locator('.profile-hero');
    assert.equal(await hero.locator('img').count(),withImage?1:0);
    if(withImage){assert.equal(await hero.locator('img').getAttribute('src'),'https://images.example/fixture-avatar.png');await hero.locator('img.is-loaded').waitFor();assert.doesNotMatch(await hero.innerText(),/画像未確認/);}
    else assert.match(await hero.innerText(),/画像未確認/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   }
   await page.goto(base+'/talents/tal-000004/');assert.match(await page.locator('main').innerText(),/旧所属：ProForma Nova/);assert.doesNotMatch(await page.locator('main').innerText(),/引退|活動終了/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.getByRole('link',{name:'記念日カレンダー'}).first().click();
   await page.waitForFunction(()=>!document.getElementById('day-details').hidden);
   assert.match(await page.locator('#day-details').innerText(),/李じゅぴ汰/);
   await page.locator('#day-details').getByRole('link',{name:'李じゅぴ汰',exact:true}).click();await page.waitForURL(base+'/talents/tal-000004/');
   await page.getByRole('link',{name:'← タレント一覧へ'}).click();await page.waitForURL(base+'/talents/');
   if(process.env.BROWSER_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.BROWSER_SCREENSHOT_DIR,`profile-${width}.png`),fullPage:true});
   await page.goto(base+'/goods/');assert.equal(await page.locator('.goods-card').count(),41);await page.locator('.goods-card h2 a').first().click();await page.waitForURL('**/goods/product-000001/');assert.equal(await page.locator('.goods-card').count(),1);
   await page.goto(base+'/fixture-goods/');
   assert.equal(await page.locator('.goods-card').count(),1);assert.match(await page.locator('.goods-card').innerText(),/販売中/);assert.match(await page.locator('.goods-card').innerText(),/販売予定/);assert.match(await page.locator('.goods-card').innerText(),/売り切れ/);
   assert.match(await page.locator('.goods-card').innerText(),/終了：日時不明/);assert.equal(await page.locator('.goods-image img.is-loaded').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(process.env.BROWSER_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.BROWSER_SCREENSHOT_DIR,`goods-fixture-${width}.png`),fullPage:true});
   await page.goto(base+'/fixture-profile/');assert.equal(await page.getByRole('heading',{name:'関連グッズ',exact:true}).count(),1);assert.match(await page.locator('.goods-offer').first().innerText(),/販売中/);
   assert.deepEqual(errors,[]);await context.close();console.log(`Phase 2 browser passed: ${width}px, JST, month movement, filters, keyboard, no overflow`);
  }
  const context=await browser.newContext({javaScriptEnabled:false});await context.route('https://images.example/fixture-avatar.png',r=>r.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(root,'assets/favicon-32x32.png'))}));
   const page=await context.newPage();await page.goto(base+'/anniversaries/');assert.equal(await page.locator('.anniversary-calendar').count(),1);assert.equal(await page.locator('#calendar-tools').isVisible(),false);assert.match(await page.locator('#calendar-reference').innerText(),/現在の暦ではありません/);assert.equal(await page.locator('#upcoming-heading').innerText(),'基準日から30日間');await context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
