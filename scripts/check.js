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
console.log('JavaScript syntax and JSON checks passed.');
