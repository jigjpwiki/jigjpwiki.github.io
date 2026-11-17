'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '_site'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if ((file.endsWith('.js') || file.endsWith('.cjs'))) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    else if (file.endsWith('.json') || file.endsWith('.webmanifest')) JSON.parse(fs.readFileSync(file, 'utf8'));
  }
}
walk('.');
const talents = require('../lib/talents').loadTalents();
require('../lib/catalog').loadCatalog(talents);
require('../lib/feature-data').loadEvents(talents, require('../lib/catalog').publicCatalog(require('../lib/catalog').loadCatalog(talents)));
require('../lib/music-data').loadMusic(talents, require('../lib/catalog').publicCatalog(require('../lib/catalog').loadCatalog(talents)));
require('../lib/karaoke-data').loadKaraoke(talents, require('../lib/catalog').publicCatalog(require('../lib/catalog').loadCatalog(talents)));
require('./check-release');
console.log('JavaScript syntax and JSON checks passed.');

const auditDir = 'ops/admin/audit';
if (fs.existsSync(auditDir)) for (const name of fs.readdirSync(auditDir)) {
  if (!/^[\w-]{43}\.json$/.test(name)) throw new Error('Invalid audit filename');
  require('../admin/src/audit.cjs')(JSON.parse(fs.readFileSync(path.join(auditDir,name),'utf8')),name.slice(0,-5));
}
if (process.env.GITHUB_EVENT_PATH) {
  const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  const base=event.pull_request?.base?.sha || event.before;
  if (/^[0-9a-f]{40}$/.test(base || '') && !/^0+$/.test(base)) {
    // check-release above has already obtained the base commit when checkout was shallow.
    const rows=execFileSync('git',['diff','--name-status',base,'HEAD','--',auditDir],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
    if(rows.some(row=>!row.startsWith('A\t')))throw new Error('Admin audit history is append-only');
  }
}
