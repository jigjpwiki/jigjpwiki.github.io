'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { files } = require('../lib/publication');
const entries = files(path.join(__dirname, '..', '_site'));
const groups = new Map();
for (const { name, bytes } of entries) {
  const group = name.startsWith('assets/') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0];
  const item = groups.get(group) || { count: 0, bytes: 0 };
  item.count++; item.bytes += bytes.length; groups.set(group, item);
}
const total = entries.reduce((n, item) => n + item.bytes.length, 0);
const report = [
  '### Pages artifact (uncompressed payload)', '',
  `Files: ${entries.length}; bytes: ${total}; MiB: ${(total / 1048576).toFixed(2)}`, '',
  '| Group | Files | Bytes |', '| --- | ---: | ---: |',
  ...[...groups].map(([name, item]) => `| ${name} | ${item.count} | ${item.bytes} |`),
  '', 'Largest files:', ...entries.sort((a, b) => b.bytes.length - a.bytes.length).slice(0, 10).map(item => `- ${item.name}: ${item.bytes.length} bytes`), ''
].join('\n');
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
