'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../_site');
const now = new Date('2026-11-08T11:00:00Z');
const stamp = '2026-11-08T11:00:00Z';
const title = '<img src=x onerror="window.__injected=1"> Fixture';
const fixture = [
  { name: '配信者', title, date: stamp, status: 'live', type: 'stream', url: 'https://www.youtube.com/watch?v=live', thumbnail: '/assets/thumbnail/placeholder.svg' },
  { name: '動画', title: '通常動画', date: stamp, status: 'archive', type: 'video', url: 'https://www.youtube.com/watch?v=video', thumbnail: '/assets/thumbnail/placeholder.svg' }
];
(async () => {
  const server = http.createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end('Not found'); return; }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    for (const [width, timezoneId] of [[1920, 'Asia/Tokyo'], [1440, 'Asia/Tokyo'], [1177, 'Asia/Tokyo'], [390, 'UTC'], [320, 'America/Los_Angeles']]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId });
      let failTiktok = true, failYoutube = false, dataRequests = 0, revision = 0;
      const apiCalls = [], errors = [];
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'www.googleapis.com') { apiCalls.push(url.pathname); return route.fulfill({json:{items:[{id:'live',snippet:{liveBroadcastContent:'none'},liveStreamingDetails:{actualEndTime:stamp}}]}}); }
        if (url.pathname === '/data/youtube_client.json') return route.fulfill({json:{apiKey:'fixture'}});
        if (url.origin !== base) return route.abort();
        if (url.pathname === '/data/tiktok.json') return route.fulfill({ status: failTiktok ? 503 : 200, json: [] });
        if (url.pathname === '/data/youtube.json') {
          dataRequests++;
          return route.fulfill({ status: failYoutube ? 503 : 200, json: fixture.map(x => ({ ...x, title: revision ? x.title + ' updated' : x.title })) });
        }
        if (url.pathname === '/data/twitch.json') return route.fulfill({ json: [{ name: 'Twitch', title: '録画', date: stamp, status: 'archive', url: 'https://www.twitch.tv/videos/123', thumbnail: '/assets/thumbnail/placeholder.svg' }] });
        if (url.pathname === '/data/last_updated.json') return route.fulfill({ json: { youtube: stamp, twitch: stamp } });
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.clock.install({ time: now });
      await page.goto(base);
      await page.waitForSelector('.live-wrapper');
      assert.equal(await page.locator('#videolist').count(), 1);
      assert.equal(await page.locator('.day-block').count(), 9);
      assert.equal(await page.locator('.today-block .live-wrapper').count(), 3);
      assert.equal(await page.locator('.today-block .formatted-time').first().innerText(), '20:00');
      assert.equal(await page.locator('a[href="https://www.youtube.com/watch?v=live"] .live-title').innerText(), title);
      assert.equal(await page.evaluate(() => window.__injected), undefined);
      assert.equal(await page.locator('a[href="https://www.twitch.tv/videos/123"]').count(), 1);
      assert.equal(await page.locator('#data-message, #retry-data, .data-status').count(), 0);
      if (width >= 1177) await page.addStyleTag({ content: '.today-block { overflow-y: scroll; scrollbar-gutter: stable; }' });
      assert.equal(await page.locator('.live-wrapper:visible').count(), 2);
      // The same keyboard control works at every width.
      await page.locator('#show-videos-toggle').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#show-videos-toggle').isChecked(), true);
      assert.equal(await page.locator('.live-wrapper:visible').count(), 3);
      const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth,
        widths: [...document.querySelectorAll('.today-block .thumbnail-wrapper')].map(n => [n.getBoundingClientRect().width, n.closest('.live-wrapper').getBoundingClientRect().width]),
        bottom: document.querySelector('.today-block').getBoundingClientRect().bottom,
        footer: document.querySelector('footer').getBoundingClientRect().top }));
      assert.equal(layout.overflow, false);
      assert.ok(layout.widths.every(([thumbnail, card]) => thumbnail <= card));
      assert.ok(layout.bottom <= layout.footer + 1);
      if (width >= 1177) {
        const positions = await page.locator('.today-block .live-wrapper:not([hidden])').evaluateAll(nodes => nodes.map(n => {
          const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width };
        }));
        const gutter = await page.locator('.today-block').evaluate(n => n.offsetWidth - n.clientWidth);
        assert.ok(gutter > 1, 'test must reserve classic scrollbar width');
        assert.ok(Math.abs(positions[0].y - positions[1].y) < 1, 'today has two cards in the same row with a scrollbar');
        assert.ok(positions[1].x >= positions[0].x + positions[0].width, 'columns do not overlap');
        assert.ok(positions[2].y > positions[0].y, 'third card starts the next row');
      }
      await page.evaluate(() => {
        window.__renderCount = 0;
        new MutationObserver(() => window.__renderCount++).observe(document.getElementById('videolist'), { childList: true });
      });
      failTiktok = false;
      failYoutube = true;
      const before = dataRequests;
      await page.clock.fastForward(300001);
      await page.waitForFunction(() => window.__renderCount > 0);
      assert.ok(dataRequests > before);
      assert.equal(await page.locator('.live-wrapper').count(), 3);
      assert.equal(await page.locator('#data-message, #retry-data, .data-status').count(), 0);
      // Tab restoration retries silently and recovers the failed medium.
      failYoutube = false; revision++;
      await page.clock.fastForward(300001);
      await page.waitForFunction(() => [...document.querySelectorAll('.live-title')].some(n => n.textContent.endsWith('updated')));
      const beforeResume = dataRequests;
      const beforeRender = await page.evaluate(() => window.__renderCount);
      revision++;
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.waitForFunction(count => window.__renderCount > count, beforeRender);
      assert.ok(dataRequests > beforeResume);
      await page.waitForFunction(() => !document.querySelector('a[href="https://www.youtube.com/watch?v=live"]').classList.contains('is-live'));
      assert.deepEqual(errors, []); assert.equal(apiCalls.length, 1);
      if (process.env.BROWSER_SCREENSHOT_DIR) {
        fs.mkdirSync(process.env.BROWSER_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.BROWSER_SCREENSHOT_DIR, `site-${width}.png`) });
      }
      for (const url of ['/privacy-policy/', '/terms/']) {
        const response = await page.goto(base + url);
        assert.equal(response.status(), 200);
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
      await context.close();
      console.log(`Browser passed: ${width}px, ${timezoneId}, silent partial failure/recovery, refresh, two-column scrollbar layout, keyboard, safe text, legal pages`);
    }
    for (const file of ['data/cfg_a.json', 'data/cfg_b.json', 'fetch_youtube.js', 'data/youtube_cache.json', 'node_modules']) assert.equal(fs.existsSync(path.join(root, file)), false);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
