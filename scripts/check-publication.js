'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { publicationNeeded } = require('../lib/publication');
async function main() {
  const root = path.join(__dirname, '..');
  const domain = fs.readFileSync(path.join(root, 'CNAME'), 'utf8').trim();
  if (!/^[a-z0-9.-]+$/i.test(domain)) throw new Error('Invalid Pages CNAME');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '_site/deployment.json'), 'utf8'));
  const result = await publicationNeeded({ manifest, url: `https://${domain}/deployment.json`, force: process.env.GITHUB_EVENT_NAME === 'push' });
  console.log(`Pages publication: ${result.reason}; publish=${result.publish}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `publish=${result.publish}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Pages publication: **${result.reason}**; publish=${result.publish}\n`);
}
if (require.main === module) main().catch(() => { console.error('Cannot determine Pages publication state'); process.exitCode = 1; });
