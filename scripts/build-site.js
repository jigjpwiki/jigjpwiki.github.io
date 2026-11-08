'use strict';
const fs = require('node:fs');
const path = require('node:path');
const output = path.join(__dirname, '..', '_site');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output);
// Explicit public allowlist: do not publish collectors, caches or credentials.
for (const entry of ['index.html', 'style.css', 'assets', 'privacy-policy', 'terms', 'robots.txt', 'sitemap.xml', 'CNAME']) {
  fs.cpSync(path.join(__dirname, '..', entry), path.join(output, entry), { recursive: true });
}
fs.mkdirSync(path.join(output, 'data'));
for (const name of ['youtube', 'twitch', 'tiktok', 'last_updated', 'update_info', 'youtube_client']) {
  fs.copyFileSync(path.join(__dirname, '..', 'data', `${name}.json`), path.join(output, 'data', `${name}.json`));
}
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log('Public site prepared in _site/');
