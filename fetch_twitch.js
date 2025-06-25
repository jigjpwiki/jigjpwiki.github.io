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

// Twitch ライブ配信取得
async function fetchTwitchLive(login, token) {
  const res = await fetch(
    `https://api.twitch.tv/helix/streams?user_login=${login}`,
    {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const { data = [] } = await res.json();
  return data[0] || null;
}

// Twitch アーカイブ取得（動画一覧）
async function fetchTwitchArchives(userId, token) {
  const res = await fetch(
    `https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive&first=10`,
    {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const { data = [] } = await res.json();
  return data;
}

// ユーザーID取得（video API用）
async function fetchTwitchUserId(login, token) {
  const res = await fetch(
    `https://api.twitch.tv/helix/users?login=${login}`,
    {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const { data = [] } = await res.json();
  return data[0]?.id || null;
}

// JST形式で出力する（ISO 8601 +09:00）
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
    const jstNow = new Date(now.getTime() + 9 * 60 * 60000);
    const jst3DaysAgo = new Date(jstNow.getTime() - 3 * 24 * 60 * 60000);

    for (const s of list) {
      if (!s.twitchUserLogin) continue;
      const userId = await fetchTwitchUserId(s.twitchUserLogin, token);
      if (!userId) continue;

      const live = await fetchTwitchLive(s.twitchUserLogin, token);
      if (live) {
        output.push({
          name: s.name,
          twitchid: s.twitchUserLogin,
          title: live.title,
          date: toJstISOString(live.started_at),
          status: 'live',
          thumbnail: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${s.twitchUserLogin}-320x180.jpg`,
        });
      }

      const archives = await fetchTwitchArchives(userId, token);
      for (const archive of archives) {
        const published = new Date(archive.published_at);
        const diff = Math.abs(published.getTime() - now.getTime());
        const isNearLive = live && diff < 60 * 1000;
        if (isNearLive) continue; // liveと重複するアーカイブは除外
        if (published < jst3DaysAgo) continue; // 3日より前は除外

        output.push({
          name: s.name,
          twitchid: s.twitchUserLogin,
          title: archive.title,
          date: toJstISOString(archive.published_at),
          status: 'archive',
        });
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
