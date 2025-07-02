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

// Twitch 過去配信（アーカイブ）取得
async function fetchTwitchArchive(userId, token) {
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

// JST形式で出力する（ISO 8601 +09:00）
function toJstISOString(utcString) {
  const date = new Date(utcString);
  const jstOffset = 9 * 60;
  const jstDate = new Date(date.getTime() + jstOffset * 60 * 1000);
  return jstDate.toISOString().replace('Z', '+09:00');
}

// サムネイルURL取得
function getThumbnailUrl(user_login, status, videoId) {
  if (status === 'live') {
    return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${user_login}-320x180.jpg`;
  } else if (status === 'archive' && videoId) {
    return `https://i3.ytimg.com/vi/${videoId}/hqdefault.jpg`; // 簡易YouTube互換型URL（実験用）
  }
  return '';
}

(async () => {
  try {
    const token = await getTwitchToken();
    const list = JSON.parse(await fs.readFile('data/streamers.json', 'utf8'));
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    let combined = [];

    for (const s of list) {
      if (!s.twitchUserLogin) continue;

      // ライブ配信取得
      const stream = await fetchTwitchLive(s.twitchUserLogin, token);
      if (stream) {
        combined.push({
          name: s.name,
          twitchid: s.twitchUserLogin,
          title: stream.title,
          date: toJstISOString(stream.started_at),
          status: 'live',
          thumbnail: getThumbnailUrl(s.twitchUserLogin, 'live')
        });
      }

      // ユーザーID取得
      const userRes = await fetch(
        `https://api.twitch.tv/helix/users?login=${s.twitchUserLogin}`,
        {
          headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            Authorization: `Bearer ${token}`
          }
        }
      );
      const userJson = await userRes.json();
      const user = userJson.data?.[0];
      if (!user) continue;

      // アーカイブ取得
      const archives = await fetchTwitchArchive(user.id, token);
      for (const video of archives) {
        const createdAt = new Date(video.created_at);
        if (createdAt >= threeDaysAgo) {
          combined.push({
            name: s.name,
            twitchid: s.twitchUserLogin,
            title: video.title,
            date: toJstISOString(video.created_at),
            status: 'archive',
            channelIcon: s.channelIcon || '',
            thumbnail: video.thumbnail_url
              .replace('%{width}', '320')
              .replace('%{height}', '180')
          });
        }
      }
    }

    // 重複除去（liveとarchiveが同一タイトル・同一配信者・1分以内ならarchiveを削除）
    combined = combined.filter((item, index, arr) => {
      if (item.status !== 'archive') return true;

      const duplicate = arr.find(other =>
        other.status === 'live' &&
        other.name === item.name &&
        other.title === item.title &&
        Math.abs(new Date(other.date) - new Date(item.date)) < 60 * 1000
      );
      return !duplicate;
    });

    // 日付で昇順ソート
    combined.sort((a, b) => new Date(a.date) - new Date(b.date));

    await fs.writeFile('data/twitch.json', JSON.stringify(combined, null, 2), 'utf8');
    console.log('✅ twitch.json saved.');
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();
