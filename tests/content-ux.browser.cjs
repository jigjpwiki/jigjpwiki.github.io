'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {root,goods,master,catalog}=require('./fixtures/content-ux.cjs')();
const pages=require('../lib/goods-pages');
const eventPages=require('../lib/feature-pages');
const baseline=require('./fixtures/admin-vnext-baseline.json');
const fixtureEvents={events:structuredClone(baseline.events.events).filter(e=>e.visibility==='public'),videos:baseline.media.videos,groups:baseline.catalog.groups};
fixtureEvents.events[0].thumbnailUrl='https://images.example/event.svg';
const now=new Date('2026-11-20T00:00:00Z'),tiny='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="240"><rect width="120" height="240" fill="#6699bb"/></svg>';
const publishedGoods=JSON.parse(fs.readFileSync(path.join(root,'data/goods.json')));
const campaignProducts=id=>publishedGoods.products.filter(p=>publishedGoods.offers.some(o=>o.campaignId===id&&o.productId===p.id)).length;
const goodsListingCount=publishedGoods.campaigns.length+publishedGoods.products.filter(p=>!publishedGoods.offers.some(o=>o.productId===p.id)||publishedGoods.offers.some(o=>o.productId===p.id&&o.campaignId===null)).length;
(async()=>{
 const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/fixture-events/')return res.setHeader('Content-Type','text/html').end(eventPages.eventList(master,fixtureEvents,'2026-11-20'));
  if(u.pathname==='/fixture-event/')return res.setHeader('Content-Type','text/html').end(eventPages.eventPage(fixtureEvents.events[0],master,fixtureEvents));
  if(u.pathname==='/fixture-campaign/'){
   const data=structuredClone(catalog);data.products[0].image='https://images.example/product.svg';
   return res.setHeader('Content-Type','text/html').end(pages.campaignPage(data.campaigns[0],master,data,now));
  }
  const f=path.resolve(root,'.'+u.pathname+(u.pathname.endsWith('/')?'index.html':''));if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'})[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});let measurements=[];
 try{for(const width of [320,390,768,1440])for(const javaScriptEnabled of [true,false]){
  const context=await browser.newContext({viewport:{width,height:900},javaScriptEnabled,timezoneId:'America/Los_Angeles'});
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.host==='images.example')return r.fulfill({contentType:'image/svg+xml',body:tiny});if(u.origin!==base)return r.abort();return r.continue();});
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.clock.install({time:now});
  const size=async(name)=>{const m=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(m.scroll<=m.width,`${name} overflow ${width}`);measurements.push({width,javaScriptEnabled,page:name,...m});};
  await p.goto(base+'/goods/');assert.equal(await p.locator('[data-entry-id]').count(),goods.campaigns.length);assert.equal(await p.locator('[data-entry-id="campaign-000001"]').count(),1);assert.equal(await p.locator('[data-category-panel="campaigns"] .goods-card').count(),goods.campaigns.length);assert.equal(await p.locator('[data-goods-product-id]').count(),publishedGoods.products.length);await size('goods');
  if(javaScriptEnabled){await p.locator('[name=q]').fill('藤宮コトハ誕生日2026');assert.equal(await p.locator('[data-entry-id]:visible').count(),1);assert(new URL(p.url()).searchParams.get('q')==='藤宮コトハ誕生日2026');await p.locator('[name=status]').selectOption('unknown');assert.equal(await p.locator('[data-entry-id]:visible').count(),1);const shared=p.url();await p.reload();assert.equal(await p.locator('[name=q]').inputValue(),'藤宮コトハ誕生日2026');await p.getByRole('button',{name:'条件を解除'}).click();await p.waitForFunction(()=>!new URL(location.href).searchParams.has('q'));await p.goBack();assert.equal(p.url(),shared);assert.equal(await p.locator('[name=status]').inputValue(),'unknown');await p.goForward();await p.getByRole('button',{name:'条件を解除'}).click();}
  if(javaScriptEnabled){await p.clock.setFixedTime(new Date('2035-01-01T00:00:00Z'));await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await p.locator('[name=status]').selectOption('ended');const ended=goods.campaigns.filter(c=>require('../assets/js/goods-core').aggregate(goods.offers.filter(o=>o.campaignId===c.id),new Date('2035-01-01T00:00:00Z')).bucket==='ended').length;assert.equal(await p.locator('[data-entry-id]:visible').count(),ended);assert.equal(await p.locator('[data-entry-id]').count(),goods.campaigns.length);await p.clock.setFixedTime(now);await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await p.locator('[name=status]').selectOption('');}
  if(javaScriptEnabled){await p.locator('[data-category="products"]').click();assert.equal(await p.locator('[data-goods-product-id]:visible').count(),publishedGoods.products.length);assert.equal(await p.locator('[name=type]').isEnabled(),true);assert.equal(new URL(p.url()).searchParams.get('category'),'products');await p.reload();assert.equal(await p.locator('[data-category="products"]').getAttribute('aria-current'),'page');await p.locator('[data-category="campaigns"]').click();}
  await p.locator('[data-category-panel="campaigns"] a[href="/goods/campaigns/campaign-000001/"]').first().click();assert.equal(await p.locator('[data-product-id]').count(),campaignProducts('campaign-000001'));for(const o of goods.offers.filter(o=>o.campaignId==='campaign-000001')){assert.equal(await p.locator(`[data-offer-id="${o.id}"]`).count(),1);assert.equal(await p.locator(`[data-offer-id="${o.id}"] a[href="${o.url}"]`).count(),1);}assert.ok(await p.locator('.goods-detail-overview .goods-period-row').count()>=1);await size('campaign');
  await p.locator('a[href="/goods/product-000001/"]').click();assert.equal(await p.locator('a[href="/goods/campaigns/campaign-000001/"]').count(),1);await size('product');
  await p.goto(base+'/fixture-campaign/');const img=p.locator('[data-product-id="product-000001"] .goods-image img');await img.scrollIntoViewIfNeeded();await img.evaluate(e=>e.decode());assert.equal(await img.evaluate(e=>getComputedStyle(e).objectFit),'contain');const box=await img.boundingBox();assert(Math.abs(box.width-box.height)<1,JSON.stringify({width,javaScriptEnabled,box}));const imageFrame=await img.locator('..').boundingBox();assert(Math.abs(imageFrame.width-imageFrame.height)<1,JSON.stringify({width,javaScriptEnabled,imageFrame}));await size('product-image');
  await p.goto(base+'/talents/tal-000010/');assert(await p.locator('a[href="/goods/campaigns/campaign-000001/"]').count()>0);await size('talent');
  await p.goto(base+'/music/');if(javaScriptEnabled){assert.equal(await p.locator('[data-category="videos"]').getAttribute('aria-current'),'page');await p.locator('[data-category="karaoke"]').click();assert.equal(await p.locator('[data-category-panel="karaoke"]').isVisible(),true);await p.locator('[data-category="songs"]').click();assert.equal(await p.locator('[data-category-panel="songs"]').isVisible(),true);await p.reload();assert.equal(await p.locator('[data-category="songs"]').getAttribute('aria-current'),'page');}
  await p.goto(base+'/music/?category=videos&q=常磐');if(javaScriptEnabled){await p.locator('[data-category-panel="videos"]').waitFor({state:'visible'});assert.equal(await p.locator('[data-filter-row]:visible').count(),1);await p.locator('[data-category="songs"]').click();assert.equal(await p.locator('[data-category-panel="videos"]').isVisible(),false);await p.goBack();assert.equal(await p.locator('[data-category-panel="videos"]').isVisible(),true);}
  const thumb=p.locator('[data-category-panel="videos"] .content-thumbnail').first();if(!javaScriptEnabled||await thumb.isVisible()){const b=await thumb.boundingBox();assert(Math.abs(b.width/b.height-16/9)<0.03);measurements.push({width,page:'video-thumbnail',ratio:b.width/b.height});}
  await size('music');
  if(width===1440&&javaScriptEnabled){
   for(const category of ['videos','karaoke','songs']){
    await p.goto(base+'/music/?category='+category);
    const panel=p.locator('[data-category-panel="'+category+'"]');await panel.waitFor({state:'visible'});
    const card=panel.locator('.feature-card').first();await card.waitFor({state:'visible'});
    assert.equal(await card.evaluate(e=>getComputedStyle(e).borderRadius),'12px');
    const compact=panel.locator('.music-singer-details').first();
    if(await compact.count()){
     assert.equal(await compact.isVisible(),true);
     assert.equal(await compact.locator('..').locator('.music-singer-names').isVisible(),false);
     await compact.locator('summary').click();assert.equal(await compact.locator('.music-singer-expanded').isVisible(),true);
     await compact.locator('summary').click();
    }
    if(category==='songs'){const b=await card.locator('.music-song-art').boundingBox();assert(Math.abs(b.width/b.height-16/9)<0.04);}
    if(category==='karaoke')assert.equal(await card.locator('h2 a').evaluate(e=>getComputedStyle(e).webkitLineClamp),'2');
    if(category==='videos')assert.equal(await card.locator('.music-video-footer').evaluate(e=>getComputedStyle(e).display),'flex');
    await size('music-'+category);
    if(process.env.EVENT_SCREENSHOTS){const out=path.join(process.env.EVENT_SCREENSHOTS,'music');fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,category+'-1440.png')});}
   }
  }
  await p.goto(base+'/music/karaoke/');const kbox=await p.locator('.content-thumbnail').first().boundingBox();assert(Math.abs(kbox.width/kbox.height-16/9)<0.03);await size('karaoke-list');
  await p.goto(base+'/music/karaoke/karaoke-000001/');assert.equal(await p.locator('.feature-setlist>li').count(),31);await size('setlist');
  await p.goto(base+'/events/');await size('events');if(javaScriptEnabled){assert.equal(await p.locator('[data-event-group="past"] [data-filter-row]').count(),4);assert.equal(await p.locator('[data-event-group="unknown"] [data-filter-row]').count(),0);assert.equal(await p.locator('[data-event-group="unknown"]').isVisible(),false);assert.equal(await p.locator('[data-event-group="upcoming"] [data-filter-row]').count(),1);await p.clock.setFixedTime(new Date('2026-12-26T10:00:00Z'));await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));assert.equal(await p.locator('[data-event-id="evt-000001"]').getAttribute('data-phase'),'ongoing');await p.clock.setFixedTime(new Date('2026-12-26T11:00:00Z'));await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));assert.equal(await p.locator('[data-event-group="past"] [data-filter-row]').count(),5);assert.equal(await p.locator('[data-event-group="upcoming"]').isVisible(),false);assert.equal(await p.locator('[data-event-group="past"] [data-filter-row]').first().getAttribute('data-event-id'),'evt-000001');await p.clock.setFixedTime(now);}
  await p.goto(base+'/fixture-events/');await size('events-thumbnail');
  assert.equal(await p.locator('.event-date-tile').count(),fixtureEvents.events.length);
  assert.equal(await p.locator('[data-event-id="evt-000001"] .avatar-stack-more').innerText(),'+4');
  const eventImg=p.locator('.event-cover img').first();await eventImg.scrollIntoViewIfNeeded();await eventImg.evaluate(e=>e.decode());
  const eventBox=await eventImg.boundingBox();assert(Math.abs(eventBox.width/eventBox.height-16/9)<0.03);
  assert.equal(await eventImg.evaluate(e=>getComputedStyle(e).objectFit),'cover');
  if(javaScriptEnabled){
   await p.locator('[name=q]').fill(fixtureEvents.events[0].title);
   assert.equal(await p.locator('[data-event-group="upcoming"] [data-event-count]').innerText(),'1件');
   assert.equal(await p.locator('[data-event-group="past"]').isVisible(),false);
   await p.getByRole('button',{name:'条件を解除'}).click();await p.waitForFunction(()=>document.querySelector('[data-event-group="past"]').hidden===false);
  }
  if(process.env.EVENT_SCREENSHOTS&&javaScriptEnabled&&[390,1440].includes(width)){
   fs.mkdirSync(process.env.EVENT_SCREENSHOTS,{recursive:true});
   await p.screenshot({path:path.join(process.env.EVENT_SCREENSHOTS,'events-'+width+'.png'),fullPage:true});
  }
  await p.goto(base+'/fixture-event/');await size('event-detail');
  assert.equal(await p.locator('.event-detail-hero .event-official a').getAttribute('href'),fixtureEvents.events[0].announcementUrl);
  assert.equal(await p.locator('.event-timeline').count(),fixtureEvents.events[0].slots.length?1:0);
  const detailImage=p.locator('.event-cover-detail img');await detailImage.evaluate(e=>e.decode());
  const detailBox=await detailImage.boundingBox();assert(Math.abs(detailBox.width/detailBox.height-16/9)<0.03);
  if(javaScriptEnabled)assert.equal(await p.locator('[data-event-detail-times] [data-event-phase]').innerText(),'開催予定');
  if(process.env.EVENT_SCREENSHOTS&&javaScriptEnabled&&[390,1440].includes(width))await p.screenshot({path:path.join(process.env.EVENT_SCREENSHOTS,'event-detail-'+width+'.png'),fullPage:true});
  await p.goto(base+'/anniversaries/?date=2027-03-07&type=debut&organization=org-000001');await size('anniversaries');if(javaScriptEnabled){assert.equal(await p.locator('#month-label').innerText(),'2027-03');assert.equal(await p.locator('[data-day="2027-03-07"]').getAttribute('aria-pressed'),'true');await p.locator('#next-month').click();await p.goBack();assert.equal(await p.locator('#month-label').innerText(),'2027-03');await p.locator('[data-day="2027-03-07"]').focus();await p.keyboard.press('ArrowRight');assert.equal(await p.locator('[data-day="2027-03-08"]').getAttribute('aria-pressed'),'true');}
  if(!javaScriptEnabled){await p.goto(base+'/goods/campaigns/campaign-000001/');assert.match(await p.locator('main').innerText(),/販売状態の基準/);}
  assert.deepEqual(errors,[]);await context.close();console.log(`Content UX browser passed ${width}, JS=${javaScriptEnabled}`);
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
 fs.mkdirSync('docs/public-ux-c',{recursive:true});fs.writeFileSync('docs/public-ux-c/measurements.json',JSON.stringify(measurements,null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
