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

    for (const s of list) {
      const stream = await fetchTwitchLive(s.twitchUserLogin, token);
      const isLive = !!stream;

      output.push({
        name: s.name,
        twitchid: s.twitchUserLogin,
        title: isLive ? stream.title : "",
        date: isLive ? toJstISOString(stream.started_at) : null,
        status: isLive ? "live" : "offline"
      });
    }

    await fs.writeFile('data/twitch.json', JSON.stringify(output, null, 2), 'utf8');
    console.log('✅ twitch.json saved.');
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();
