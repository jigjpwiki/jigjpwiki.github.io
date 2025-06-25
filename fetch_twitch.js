'use strict';

const fs = require('fs').promises;
const fetch = require('node-fetch');

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

// JSTで3日前の0:00を取得
function getJstThresholdISOString(daysAgo = 3) {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000); // JST補正
  jst.setDate(jst.getDate() - daysAgo);
  jst.setHours(0, 0, 0, 0); // 0:00に設定
  return jst.toISOString();
}

// JST形式で出力（ISO 8601 +09:00）
function toJstISOString(utcString) {
  const date = new Date(utcString);
  const jstOffset = 9 * 60;
  const jstDate = new Date(date.getTime() + jstOffset * 60 * 1000);
  return jstDate.toISOString().replace('Z', '+09:00');
}

// Twitchトークン取得
async function getTwitchToken() {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  return (await res.json()).access_token;
}

// 配信中取得
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

// アーカイブ取得
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

// ユーザー情報取得
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

    for (const s of list) {
      const userInfo = await fetchUserInfo(s.twitchUserLogin, token);
      if (!userInfo) continue;

      const userId = userInfo.id;

      // ライブ中の配信
      const stream = await fetchTwitchLive(s.twitchUserLogin, token);
      if (stream) {
        output.push({
          name: s.name,
          twitchid: s.twitchUserLogin,
          title: stream.title,
          date: toJstISOString(stream.started_at),
          status: "live"
        });
      }

      // アーカイブ取得（3日前以降）
      const videos = await fetchTwitchVideos(userId, token);
      for (const video of videos) {
        const created = new Date(video.created_at);
        if (created >= jstThreshold) {
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

    // 日付昇順にソート
    output.sort((a, b) => new Date(a.date) - new Date(b.date));

    // 書き出し
    await fs.writeFile('data/twitch.json', JSON.stringify(output, null, 2), 'utf8');
    console.log('✅ twitch.json saved (sorted by date).');
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();

