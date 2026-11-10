'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function files(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => {
    const name = prefix + entry.name;
    return entry.isDirectory() ? files(path.join(directory, entry.name), `${name}/`) : [{ name, bytes: fs.readFileSync(path.join(directory, entry.name)) }];
  });
}
function fingerprint(directory) {
  const hash = createHash('sha256');
  for (const { name, bytes } of files(directory)) {
    // Metadata-only changes intentionally do not cause full Pages deployments.
    if (name === 'deployment.json' || name === 'data/last_updated.json') continue;
    hash.update(name).update('\0').update(String(bytes.length)).update('\0').update(bytes);
  }
  return hash.digest('hex');
}
function writeManifest(directory) {
  const manifest = { version: 1, fingerprint: fingerprint(directory) };
  fs.writeFileSync(path.join(directory, 'deployment.json'), JSON.stringify(manifest) + '\n');
  return manifest;
}
async function publicationNeeded({ manifest, url, force = false, fetchImpl = fetch }) {
  if (force) return { publish: true, reason: 'code-push' };
  try {
    const requestUrl = new URL(url);
    requestUrl.searchParams.set('check', `${Date.now()}`);
    const response = await fetchImpl(requestUrl, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return { publish: true, reason: 'published-manifest-unavailable' };
    // The public marker is tiny; reject an unexpected response without logging it.
    const text = await response.text();
    if (text.length > 1024) return { publish: true, reason: 'published-manifest-invalid' };
    const published = JSON.parse(text);
    if (published?.version !== 1 || !/^[a-f0-9]{64}$/.test(published.fingerprint)) {
      return { publish: true, reason: 'published-manifest-invalid' };
    }
    const publish = published.fingerprint !== manifest.fingerprint;
    return { publish, reason: publish ? 'content-not-yet-published' : 'already-published' };
  } catch {
    // Network/JSON errors must never silently suppress a needed retry.
    return { publish: true, reason: 'published-manifest-check-failed' };
  }
}
module.exports = { files, fingerprint, writeManifest, publicationNeeded };
