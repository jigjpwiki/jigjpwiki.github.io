'use strict';
function relatedStreams(talent, youtube, twitch) {
  const yt = new Set(talent.accounts.filter(a => a.service === 'youtube' && a.accountId).map(a => a.accountId));
  const tw = new Set(talent.accounts.filter(a => a.service === 'twitch' && a.accountId).map(a => a.accountId.toLowerCase()));
  const rows = []; const seen = new Set();
  for (const [service, input] of [['youtube', youtube], ['twitch', twitch]]) for (const row of Array.isArray(input) ? input : []) {
    if (!row || typeof row.title !== 'string' || typeof row.date !== 'string' || !Number.isFinite(Date.parse(row.date)) || !['live','upcoming','archive'].includes(row.status)) continue;
    if (service === 'youtube' ? !yt.has(row.youtubeid) : typeof row.twitchid !== 'string' || !tw.has(row.twitchid.toLowerCase())) continue;
    let u; try { u = new URL(row.url); } catch { continue; }
    if (u.protocol !== 'https:' || u.username || u.password || u.port) continue;
    let url;
    if (service === 'youtube') {
      if (!['youtube.com','www.youtube.com'].includes(u.hostname) || u.pathname !== '/watch' || typeof row.videoId !== 'string' || !/^[\w-]{11}$/.test(row.videoId) || u.searchParams.get('v') !== row.videoId) continue;
      url = `https://www.youtube.com/watch?v=${row.videoId}`;
    } else {
      if (!['twitch.tv','www.twitch.tv'].includes(u.hostname)) continue;
      const login = row.twitchid.toLowerCase();
      if (row.status === 'archive') {
        if (typeof row.videoId !== 'string' || !/^\d+$/.test(row.videoId) || u.pathname !== `/videos/${row.videoId}`) continue;
        url = `https://www.twitch.tv/videos/${row.videoId}`;
      } else {
        if (u.pathname.toLowerCase().replace(/\/$/,'') !== '/' + login) continue;
        url = `https://www.twitch.tv/${login}`;
      }
    }
    if (seen.has(url)) continue; seen.add(url);
    rows.push({ service, title: row.title, date: row.date, status: row.status, url });
  }
  const priority = { live: 0, upcoming: 1, archive: 2 };
  return rows.sort((a,b) => priority[a.status] - priority[b.status] || (a.status === 'upcoming' ? Date.parse(a.date) - Date.parse(b.date) : Date.parse(b.date) - Date.parse(a.date))).slice(0,12);
}
module.exports = { relatedStreams };
