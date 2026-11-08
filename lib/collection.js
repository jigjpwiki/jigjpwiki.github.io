'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const fetch = require('node-fetch');

async function requestJson(url, options = {}, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`API HTTP ${response.status}`);
    const result = await response.json();
    if (!result || typeof result !== 'object' || result.error) throw new Error('Invalid API response');
    return result;
  } catch (error) {
    // Do not log request URLs, response bodies or credentials.
    if (/^API HTTP \d+$/.test(error.message)) throw error;
    throw new Error('API request failed (network, timeout or invalid JSON)');
  } finally {
    clearTimeout(timer);
  }
}

function arrayField(json, key) {
  if (!Array.isArray(json[key])) throw new Error(`Invalid API response: ${key} must be an array`);
  return json[key];
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`Cannot read valid JSON: ${path.basename(file)}`);
  }
}

async function writeJson(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}

function dateWindow(now) {
  const day = 86400000;
  const jstMidnight = Math.floor((now.getTime() + 9 * 3600000) / day) * day - 9 * 3600000;
  return { start: jstMidnight - 3 * day, end: jstMidnight + 6 * day };
}

async function saveResult(directory, platform, data, now, cache) {
  const metaFile = path.join(directory, 'last_updated.json');
  const meta = await readJson(metaFile, {});
  if (!meta || Array.isArray(meta) || typeof meta !== 'object') throw new Error('Invalid last_updated.json');
  await writeJson(path.join(directory, `${platform}.json`), data);
  if (cache) await writeJson(path.join(directory, `${platform}_cache.json`), cache);
  // Only advance the timestamp after every API request and output write succeeds.
  meta[platform] = now.toISOString();
  await writeJson(metaFile, meta);
}

module.exports = { requestJson, arrayField, readJson, writeJson, dateWindow, saveResult };
