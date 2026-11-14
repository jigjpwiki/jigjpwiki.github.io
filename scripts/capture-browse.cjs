// Deterministic offline UI comparison; never part of the public allowlist.
'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../_site');
const output = process.argv[2] || '/tmp/jigdule-ui';
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (file !== root && !file.startsWith(root + path.sep)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Tokyo' });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.clock.install({ time: new Date('2027-03-07T03:00:00Z') });
      for (const [name, route] of [['talents', '/talents/'], ['profile', '/talents/tal-000004/'], ['calendar', '/anniversaries/']]) {
        await page.goto(base + route);
        if (name === 'calendar') await page.waitForFunction(() => document.getElementById('month-label').textContent === '2027-03');
        await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true });
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
