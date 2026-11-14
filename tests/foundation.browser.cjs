'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../_site');
(async () => {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    for (const width of [1440, 390, 320]) for (const javaScriptEnabled of [true, false]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'yt3.ggpht.com' && javaScriptEnabled && width === 390) return route.fulfill({ body: fs.readFileSync(path.join(root, 'assets/favicon-32x32.png')), contentType: 'image/png' });
        if (url.origin !== base) return route.abort();
        if (url.pathname === '/data/youtube_client.json') return route.fulfill({ json: { apiKey: 'fixture' } });
        if (/^\/data\/(youtube|twitch|tiktok)\.json$/.test(url.pathname)) return route.fulfill({ json: [] });
        if (url.pathname === '/data/last_updated.json') return route.fulfill({ json: {} });
        return route.continue();
      });
      const page = await context.newPage();
      await page.goto(base);
      const nav = page.getByRole('navigation', { name: 'メインナビゲーション' });
      assert.equal(await nav.getByRole('link').count(), 2);
      assert.equal(await nav.locator('[aria-current="page"]').getAttribute('href'), '/');
      await nav.getByRole('link', { name: 'タレント一覧' }).focus();
      await Promise.all([page.waitForURL(base + '/talents/'), page.keyboard.press('Enter')]);
      assert.equal(await page.locator('.talent-card').count(), 4);
      assert.equal(await page.locator('nav [aria-current="page"]').getAttribute('href'), '/talents/');
      assert.equal(await page.locator('a[href^="/talents/tal-"],a[href="/goods/"],a[href="/anniversaries/"]').count(), 0);
      assert.equal(await page.locator('input[type="password"],form').count(), 0);
      if (javaScriptEnabled && width === 390) await page.locator('.talent-avatar img.is-loaded').first().waitFor();
      else assert.equal(await page.locator('.talent-avatar img.is-loaded').count(), 0);
      const graduated = page.locator('#tal-000004');
      assert.match(await graduated.innerText(), /卒業・退所済み/);
      assert.doesNotMatch(await graduated.innerText(), /VTuber活動\s*引退/);
      await page.locator('details summary').first().click();
      assert.equal(await page.locator('details').first().getAttribute('open'), '');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (process.env.BROWSER_SCREENSHOT_DIR && javaScriptEnabled) {
        fs.mkdirSync(process.env.BROWSER_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.BROWSER_SCREENSHOT_DIR, `talents-${width}.png`), fullPage: true });
      }
      await nav.getByRole('link', { name: '配信スケジュール' }).click();
      await page.waitForURL(base + '/');
      assert.equal(await page.locator('#show-videos-toggle').count(), 1);
      assert.equal(await page.locator('#videolist.swiper-wrapper').count(), 1);
      for (const route of ['/terms/', '/privacy-policy/']) {
        await page.goto(base + route);
        assert.equal(await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link').count(), 2);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
      await context.close();
      console.log(`Foundation browser passed: ${width}px, JavaScript=${javaScriptEnabled}, keyboard navigation, static list, unknown state, future links hidden, legal pages`);
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
