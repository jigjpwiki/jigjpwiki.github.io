'use strict';

const fs = require('fs').promises;
const fetch = require('node-fetch');

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

// Twitchトークン取得
async function getTwitchToken() {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token` +
    `?client_id=${TWITCH_CLIENT_ID}` +
    `&client_secret=${TWITCH_CLIENT_SECRET}` +
    `&grant_type=client_credentials`,
    { method: 'POST' }
  );
  return (await res.json()).access_token;
}

// ユーザーID取得
async function fetchTwitchUserId(login, token) {
  const res = await fetch(
    `https://api.twitch.tv/helix/users?login=${login}`,
    {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`
      }
    }
  );
  const json = await res.json();
  return json.data?.[0]?.id || null;
}

// ライブ配信取得
async function fetchTwitchLive(login, token) {
  const res = await fetch(
    `https://api.twitch.tv/helix/streams?user_login=${login}`,
    {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`
      }
    }
  );
  const { data = [] } = await res.json();
  return data[0] || null;
}

// アーカイブ動画取得
async function fetchTwitchVideos(userId, token) {
  const res = await fetch(
    `https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive`,
    {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`
      }
    }
  );
  const { data = [] } = await res.json();
  return data;
}

function toJstISOString(utcString) {
  const date = new Date(utcString);
  const jstOffset = 9 * 60;
  const jstDate = new Date(date.getTime() + jstOffset * 60 * 1000);
  const iso = jstDate.toISOString().replace('Z', '+09:00');
  return iso;
}

(async () => {
  try {
    const token = await getTwitchToken();
    const list = JSON.parse(await fs.readFile('data/streamers.json', 'utf8'));
    const output = [];
    const now = new Date();
    const jstThreshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const liveMap = new Map();

    // ライブ情報収集
    for (const s of list) {
      if (!s.twitchUserLogin) continue;
      const live = await fetchTwitchLive(s.twitchUserLogin, token);
      if (live) {
        const date = new Date(live.started_at);
        const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);

        const liveObj = {
          name: s.name,
          twitchid: s.twitchUserLogin,
          title: live.title,
          date: jstDate,
          status: "live"
        };

        output.push({ ...liveObj, date: toJstISOString(live.started_at) });
        liveMap.set(s.twitchUserLogin, liveObj);
      }
    }

    // アーカイブ取得
    for (const s of list) {
      if (!s.twitchUserLogin) continue;
      const userId = await fetchTwitchUserId(s.twitchUserLogin, token);
      if (!userId) continue;
      const videos = await fetchTwitchVideos(userId, token);

      for (const video of videos) {
        const created = new Date(video.created_at);
        if (created < jstThreshold) continue;

        const jstDate = new Date(created.getTime() + 9 * 60 * 60 * 1000);

        const live = liveMap.get(s.twitchUserLogin);
        const timeDiff = live ? Math.abs(live.date.getTime() - jstDate.getTime()) : Infinity;

        const isSameMinute =
          live && live.title === video.title &&
          live.date.getFullYear() === jstDate.getFullYear() &&
          live.date.getMonth() === jstDate.getMonth() &&
          live.date.getDate() === jstDate.getDate() &&
          live.date.getHours() === jstDate.getHours() &&
          live.date.getMinutes() === jstDate.getMinutes();

        const isDuplicate = isSameMinute || (live && live.title === video.title && timeDiff < 60 * 1000);

        if (!isDuplicate) {
          output.push({
            name: s.name,
            twitchid: s.twitchUserLogin,
            title: video.title,
            date: toJstISOString(video.created_at),
            status: "archive"
          });
        }
      }
    }

    // 日付順に並べ替え
    output.sort((a, b) => new Date(a.date) - new Date(b.date));

    await fs.writeFile('data/twitch.json', JSON.stringify(output, null, 2), 'utf8');
    console.log('✅ twitch.json saved.');
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();
