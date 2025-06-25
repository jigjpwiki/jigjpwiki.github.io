'use strict';

const fs = require('fs').promises;
const fetch = require('node-fetch');

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

// JSTで3日前の0:00を取得
function getJstThresholdISOString(daysAgo = 3) {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  jst.setDate(jst.getDate() - daysAgo);
  jst.setHours(0, 0, 0, 0);
  return jst.toISOString();
}

// JST形式で出力（ISO 8601 +09:00）
function toJstISOString(utcString) {
  const date = new Date(utcString);
  const jstOffset = 9 * 60;
  const jstDate = new Date(date.getTime() + jstOffset * 60 * 1000);
  return jstDate.toISOString().replace('Z', '+09:00');
}

async function getTwitchToken() {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  return (await res.json()).access_token;
}

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

async function fetchUserInfo(login, token) {
  const res = await fetch(
    `https://api.twitch.tv/helix/users?login=${login}`,
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

(async () => {
  try {
    const token = await getTwitchToken();
    const list = JSON.parse(await fs.readFile('data/streamers.json', 'utf8'));
    const output = [];

    const jstThreshold = new Date(getJstThresholdISOString());
    const liveMap = new Map(); // key: twitchid, value: { title, date }

    for (const s of list) {
      const userInfo = await fetchUserInfo(s.twitchUserLogin, token);
      if (!userInfo) continue;

      const userId = userInfo.id;

      // LIVE取得
      const stream = await fetchTwitchLive(s.twitchUserLogin, token);
      if (stream) {
        const date = toJstISOString(stream.started_at);
        const item = {
          name: s.name,
          twitchid: s.twitchUserLogin,
          title: stream.title,
          date,
          status: "live"
        };
        output.push(item);
        liveMap.set(s.twitchUserLogin, { title: stream.title, date: new Date(date) });
      }

      // アーカイブ取得
      const videos = await fetchTwitchVideos(userId, token);
      for (const video of videos) {
        const created = new Date(video.created_at);
        if (created < jstThreshold) continue;

        const jstDate = new Date(created.getTime() + 9 * 60 * 60 * 1000);

        // liveと重複していないか確認
        const live = liveMap.get(s.twitchUserLogin);
        const timeDiff = live ? Math.abs(live.date.getTime() - jstDate.getTime()) : Infinity;
        const isDuplicate = live && live.title === video.title && timeDiff < 60 * 1000;

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

    // date昇順にソート
    output.sort((a, b) => new Date(a.date) - new Date(b.date));

    await fs.writeFile('data/twitch.json', JSON.stringify(output, null, 2), 'utf8');
    console.log('✅ twitch.json saved (duplicates filtered & sorted).');
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();
