'use strict';
const started = performance.now();
const fs = require('node:fs');
const path = require('node:path');
const { writeManifest } = require('../lib/publication');
const { loadTalents } = require('../lib/talents');
const { applyNavigation, talentCards } = require('../lib/site-pages');
const root = path.join(__dirname, '..');
// Validate before touching the prior build output. Never publish unvalidated data.
const talents = loadTalents(root);
const { loadCatalog, publicCatalog } = require('../lib/catalog');
const { anniversaryPage } = require('../lib/info-pages');
const catalog = publicCatalog(loadCatalog(talents, root));
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
for (const [file, route] of [['index.html', '/'], ['privacy-policy/index.html', '/privacy-policy/'], ['terms/index.html', '/terms/']]) {
  const target = path.join(output, file);
  fs.writeFileSync(target, applyNavigation(fs.readFileSync(target, 'utf8'), route));
}
fs.mkdirSync(path.join(output, 'talents'));
const talentPage = fs.readFileSync(path.join(root, 'pages/talents/index.html'), 'utf8');
fs.writeFileSync(path.join(output, 'talents/index.html'), applyNavigation(talentPage, '/talents/').replace('<!-- jigdule:talents -->', talentCards(talents)));
// Publish only the schema-validated public master, never its registry or sources' raw responses.
fs.writeFileSync(path.join(output, 'data/talents.json'), JSON.stringify(talents, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'data/catalog.json'), JSON.stringify({ schemaVersion: 1, sources: catalog.sources, groups: catalog.groups }) + '\n');
fs.mkdirSync(path.join(output, 'anniversaries'));
fs.writeFileSync(path.join(output, 'anniversaries/index.html'), anniversaryPage(talents, catalog));
fs.writeFileSync(path.join(output, 'data/anniversaries.json'), JSON.stringify({ schemaVersion: 1, events: catalog.events }) + '\n');
fs.writeFileSync(path.join(output, '.nojekyll'), '');
writeManifest(output);
const elapsed = Math.round(performance.now() - started);
console.log(`Public site prepared in _site/; build_ms=${elapsed}`);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Local site build: ${elapsed} ms (copy + manifest; excludes Pages queue/sync).\n`);
