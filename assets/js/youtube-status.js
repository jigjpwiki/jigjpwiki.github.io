'use strict';
(function (root) {
  function create({ fetch: request = root.fetch.bind(root), storage = null, now = Date.now } = {}) {
    const key = 'youtube-status-v1';
    let memory = { items: {}, retryAfter: 0 }, running = null, config;
    function read() { try { const value = JSON.parse(storage?.getItem(key)); if (value?.items) memory = value; } catch {} return memory; }
    function save() { try { storage?.setItem(key, JSON.stringify(memory)); } catch {} }
    function id(row) { try { return row.videoId || new URL(row.url).searchParams.get('v'); } catch { return null; } }
    async function check(rows) {
      const state = read(), time = now();
      const selected = rows.filter(row => row.type !== 'video' && (row.status === 'live' || (row.status === 'upcoming' && Date.parse(row.date) <= time + 15 * 60000) || (Date.parse(row.date) >= time - 6 * 3600000 && Date.parse(row.date) <= time)));
      const ids = [...new Set(selected.map(id).filter(Boolean))];
      const due = ids.filter(v => !state.items[v] || state.items[v].expires <= time);
      if (due.length && state.retryAfter <= time) {
        try {
          if (!config) {
            const response = await request('data/youtube_client.json', { signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw Error('configuration unavailable');
            config = await response.json();
          }
          if (!config.apiKey) throw Error('configuration unavailable');
          for (let offset = 0; offset < due.length; offset += 50) {
            const batch = due.slice(offset, offset + 50);
            const url = new URL('https://www.googleapis.com/youtube/v3/videos');
            url.search = new URLSearchParams({ key: config.apiKey, part: 'snippet,liveStreamingDetails', id: batch.join(','), fields: 'items(id,snippet/liveBroadcastContent,liveStreamingDetails(actualStartTime,actualEndTime,scheduledStartTime))' });
            const response = await request(url.href, { signal: AbortSignal.timeout(10000), referrerPolicy: 'strict-origin-when-cross-origin' });
            if (!response.ok) throw Error('status unavailable');
            const json = await response.json();
            if (!Array.isArray(json.items)) throw Error('invalid status');
            for (const video of json.items) {
              if (!batch.includes(video.id) || !video.snippet) throw Error('invalid status item');
              const d = video.liveStreamingDetails || {};
              const status = d.actualEndTime ? 'archive' : video.snippet.liveBroadcastContent === 'live' ? 'live' : d.scheduledStartTime && !d.actualStartTime ? 'upcoming' : 'archive';
              const date = d.actualStartTime || d.scheduledStartTime;
              state.items[video.id] = { status, ...(Number.isFinite(Date.parse(date)) ? { date } : {}), expires: time + (status === 'archive' ? 24 * 3600000 : 2 * 60000) };
            }
            // Missing/private videos are not retried on every timer tick.
            for (const v of batch) if (!json.items.some(item => item.id === v)) state.items[v] = { expires: time + 10 * 60000 };
          }
          state.retryAfter = 0;
        } catch { state.retryAfter = time + 10 * 60000; }
        for (const [v, result] of Object.entries(state.items)) if (result.expires < time - 86400000) delete state.items[v];
        memory = state; save();
      }
      return rows.map(row => {
        const result = state.items[id(row)];
        if (!result?.status || result.expires <= time) return row;
        return { ...row, status: result.status, date: result.date || row.date };
      });
    }
    return rows => {
      if (running) return running.then(() => check(rows));
      const execute = () => check(rows);
      running = (root.navigator?.locks ? root.navigator.locks.request(key, execute) : execute()).finally(() => { running = null; });
      return running;
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { create };
  else root.YouTubeStatus = { create };
})(globalThis);
