'use strict';

// Shared by the browser and node:test. Calendar boundaries are always JST.
(function (root) {
  const shifted = value => new Date(new Date(value).getTime() + 9 * 3600000);
  function dateKey(value) { return shifted(value).toISOString().slice(0, 10); }
  function time(value) { return shifted(value).toISOString().slice(11, 16); }
  function dates(now = new Date()) {
    const today = shifted(now);
    return Array.from({ length: 9 }, (_, i) => {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i - 3));
      return { key: d.toISOString().slice(0, 10), label: d.toISOString().slice(5, 10).replace('-', '/'), day: d.getUTCDay() };
    });
  }
  function link(value, platform) {
    const hosts = { youtube: ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be'],
      twitch: ['www.twitch.tv', 'twitch.tv'], tiktok: ['www.tiktok.com', 'tiktok.com'] };
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && hosts[platform]?.includes(url.hostname) ? url.href : null;
    } catch { return null; }
  }
  const api = { dateKey, time, dates, link };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Schedule = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
