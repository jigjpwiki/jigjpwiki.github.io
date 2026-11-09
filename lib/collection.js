'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const fetch = require('node-fetch');

const youtubeKinds = Object.freeze({
  channels: 'youtube#channelListResponse',
  playlistItems: 'youtube#playlistItemListResponse',
  search: 'youtube#searchListResponse',
  videos: 'youtube#videoListResponse'
});
// Keep HTTP metadata out of API payloads and persisted JSON/cache files.
const httpMetadata = new WeakMap();
const requestErrors = new WeakSet();
const valueType = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const counter = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

function youtubeDiagnostics(json, endpoint, status = httpMetadata.get(json)?.status) {
  const object = json !== null && typeof json === 'object' && !Array.isArray(json);
  const knownKind = Object.values(youtubeKinds).includes(json?.kind);
  return {
    endpoint: Object.hasOwn(youtubeKinds, endpoint) ? `${endpoint}.list` : 'unknown',
    httpStatus: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    responseType: valueType(json),
    // Never copy arbitrary strings, property names, IDs, tokens or error messages.
    kind: knownKind ? json.kind : json?.kind === undefined ? 'missing' : 'unrecognized',
    pageInfo: {
      type: valueType(json?.pageInfo),
      totalResults: counter(json?.pageInfo?.totalResults),
      resultsPerPage: counter(json?.pageInfo?.resultsPerPage)
    },
    itemsType: object && Object.hasOwn(json, 'items') ? valueType(json.items) : 'missing',
    itemCount: Array.isArray(json?.items) ? json.items.length : null,
    hasNextPage: !!json?.nextPageToken,
    hasError: object && Object.hasOwn(json, 'error')
  };
}

function responseError(message, diagnostics) {
  const error = new Error(message);
  error.diagnostics = diagnostics;
  return error;
}

function youtubeList(json, endpoint) {
  const diagnostics = youtubeDiagnostics(json, endpoint);
  if (!json || typeof json !== 'object' || Array.isArray(json) || Object.hasOwn(json, 'error')) {
    throw responseError('Invalid YouTube list response', diagnostics);
  }
  if (json.kind !== undefined && json.kind !== youtubeKinds[endpoint]) {
    throw responseError('Invalid YouTube list response kind', diagnostics);
  }
  if (Array.isArray(json.items)) return json;
  // YouTube may omit items on a successful zero-result list. Do not treat
  // null, malformed payloads, absent/nonzero totals or another kind as empty.
  if (!Object.hasOwn(json, 'items') && json.kind === youtubeKinds[endpoint] &&
      json.pageInfo?.totalResults === 0 && counter(json.pageInfo?.resultsPerPage) !== null &&
      json.pageInfo.resultsPerPage <= 50 &&
      !json.nextPageToken) {
    return { ...json, items: [] };
  }
  throw responseError('Invalid API response: items must be an array', diagnostics);
}

async function requestJson(url, options = {}, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let status;
  let result;
  const parsed = new URL(url);
  const youtubeEndpoint = parsed.origin === 'https://www.googleapis.com' &&
    /^\/youtube\/v3\/(channels|playlistItems|search|videos)$/.test(parsed.pathname)
    ? parsed.pathname.split('/').at(-1) : null;
  const failure = message => {
    const error = new Error(message);
    if (youtubeEndpoint) error.diagnostics = youtubeDiagnostics(result, youtubeEndpoint, status);
    else error.endpoint = parsed.origin + parsed.pathname;
    requestErrors.add(error);
    return error;
  };
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    status = response.status;
    if (!response.ok) throw failure(`API HTTP ${counter(status) ?? 'unknown'}`);
    result = await response.json();
    if (!result || typeof result !== 'object' || Array.isArray(result) || Object.hasOwn(result, 'error')) {
      throw failure('Invalid API response');
    }
    httpMetadata.set(result, { status });
    return result;
  } catch (error) {
    // Preserve only errors constructed here; never expose transport/JSON text.
    if (requestErrors.has(error)) throw error;
    throw failure('API request failed (network, timeout or invalid JSON)');
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

module.exports = { youtubeList, youtubeDiagnostics, requestJson, arrayField, readJson, writeJson, dateWindow, saveResult };
