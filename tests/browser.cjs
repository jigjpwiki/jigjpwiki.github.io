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
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    for (const [width, timezoneId] of [[1440, 'Asia/Tokyo'], [390, 'UTC'], [320, 'America/Los_Angeles']]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId });
      let failTiktok = true, failYoutube = false, dataRequests = 0, revision = 0;
      const apiCalls = [], errors = [];
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'www.googleapis.com') apiCalls.push(url.pathname);
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
      assert.match(await page.locator('#data-message').innerText(), /TikTok.*取得できません/);
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
      failTiktok = false;
      await page.locator('#retry-data').click();
      await page.waitForFunction(() => document.getElementById('retry-data').hidden);
      assert.match(await page.locator('#data-message').innerText(), /JST/);
      // Periodic refresh keeps last good data when one source becomes unavailable.
      failYoutube = true;
      const before = dataRequests;
      await page.clock.fastForward(300001);
      await page.waitForFunction(() => document.getElementById('data-message').textContent.includes('YouTubeを取得できません'));
      assert.ok(dataRequests > before);
      assert.equal(await page.locator('.live-wrapper').count(), 3);
      failYoutube = false; revision++;
      await page.locator('#retry-data').click();
      await page.waitForFunction(() => [...document.querySelectorAll('.live-title')].some(n => n.textContent.endsWith('updated')));
      // Hide/show the tab triggers a new snapshot without reloading the document.
      const beforeResume = dataRequests;
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.waitForFunction(() => !document.getElementById('retry-data').disabled);
      assert.ok(dataRequests > beforeResume);
      assert.deepEqual(errors, []); assert.deepEqual(apiCalls, []);
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
      console.log(`Browser passed: ${width}px, ${timezoneId}, partial failure/retry, refresh, keyboard, safe text, legal pages`);
    }
    for (const file of ['data/cfg_a.json', 'data/cfg_b.json', 'fetch_youtube.js', 'data/youtube_cache.json', 'node_modules']) assert.equal(fs.existsSync(path.join(root, file)), false);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
