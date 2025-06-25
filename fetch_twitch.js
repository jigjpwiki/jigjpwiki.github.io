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
        Authorization: `Bearer ${token}`
      }
    }
  );
  const { data = [] } = await res.json();
  return data[0] || null;
}

// Twitch アーカイブ取得
async function fetchTwitchArchive(login, token) {
  const res = await fetch(
    `https://api.twitch.tv/helix/videos?user_id=${login}&type=archive`,
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

// JST形式に変換
function toJstISOString(utcString) {
  const date = new Date(utcString);
  const jstOffset = 9 * 60;
  const jstDate = new Date(date.getTime() + jstOffset * 60 * 1000);
  return jstDate.toISOString().replace('Z', '+09:00');
}

(async () => {
  try {
    const token = await getTwitchToken();
    const list = JSON.parse(await fs.readFile('data/streamers.json', 'utf8'));
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const allEntries = [];
    const archiveEntries = [];
    const liveTitles = new Set();

    for (const s of list) {
      if (!s.twitchUserLogin) continue;

      const live = await fetchTwitchLive(s.twitchUserLogin, token);

      if (live) {
        allEntries.push({
          name: s.name,
          twitchid: s.twitchUserLogin,
          title: live.title,
          date: toJstISOString(live.started_at),
          status: 'live',
          thumbnail: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${s.twitchUserLogin}-320x180.jpg`
        });
        liveTitles.add(`${s.twitchUserLogin}__${live.title}`);
      }

      // Get user ID for archives
      const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${s.twitchUserLogin}`, {
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          Authorization: `Bearer ${token}`
        }
      });
      const userData = (await userRes.json()).data[0];
      if (!userData || !userData.id) continue;

      const archives = await fetchTwitchArchive(userData.id, token);

      for (const v of archives) {
        const startedAt = new Date(v.created_at);
        if (startedAt >= threeDaysAgo) {
          const titleKey = `${s.twitchUserLogin}__${v.title}`;
          if (!liveTitles.has(titleKey)) {
            archiveEntries.push({
              name: s.name,
              twitchid: s.twitchUserLogin,
              title: v.title,
              date: toJstISOString(v.created_at),
              status: 'archive',
              thumbnail: v.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180')
            });
          }
        }
      }
    }

    const merged = [...allEntries, ...archiveEntries].sort((a, b) => new Date(b.date) - new Date(a.date));

    await fs.writeFile('data/twitch.json', JSON.stringify(merged, null, 2), 'utf8');
    console.log('✅ twitch.json saved.');
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();
