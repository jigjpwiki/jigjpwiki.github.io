'use strict';
const started = performance.now();
const fs = require('node:fs');
const path = require('node:path');
const { writeManifest } = require('../lib/publication');
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
writeManifest(output);
const elapsed = Math.round(performance.now() - started);
console.log(`Public site prepared in _site/; build_ms=${elapsed}`);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Local site build: ${elapsed} ms (copy + manifest; excludes Pages queue/sync).\n`);
