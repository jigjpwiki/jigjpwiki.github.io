'use strict';

const fs = require('fs').promises;
const fetch = require('node-fetch');

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// JST形式で出力する（ISO 8601 +09:00）
function toJstISOString(utcString) {
  const date = new Date(utcString);
  const jstOffset = 9 * 60;
  const jstDate = new Date(date.getTime() + jstOffset * 60 * 1000);
  return jstDate.toISOString().replace('Z', '+09:00');
}

(async () => {
  try {
    const list = JSON.parse(await fs.readFile('data/streamers.json', 'utf8'));
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    let combined = [];

    for (const s of list) {
      if (!s.youtubeChannelId) continue;

      // 現在ライブ中の動画取得
      const liveRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${s.youtubeChannelId}&eventType=live&type=video&key=${YOUTUBE_API_KEY}`);
      const liveJson = await liveRes.json();
      const liveVideo = liveJson.items?.[0];

      if (liveVideo) {
        combined.push({
          name: s.name,
          youtubeid: s.youtubeChannelId,
          title: liveVideo.snippet.title,
          date: toJstISOString(liveVideo.snippet.publishedAt),
          status: 'live',
          thumbnail: liveVideo.snippet.thumbnails?.medium?.url || ''
        });
      }

      // アーカイブ動画の取得（過去3日間）
      const archiveRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${s.youtubeChannelId}&publishedAfter=${threeDaysAgo.toISOString()}&type=video&order=date&maxResults=10&key=${YOUTUBE_API_KEY}`);
      const archiveJson = await archiveRes.json();

      for (const item of archiveJson.items || []) {
        const publishedAt = new Date(item.snippet.publishedAt);
        combined.push({
          name: s.name,
          youtubeid: s.youtubeChannelId,
          title: item.snippet.title,
          date: toJstISOString(publishedAt.toISOString()),
          status: 'archive',
          thumbnail: item.snippet.thumbnails?.medium?.url || ''
        });
      }
    }

    // liveとarchiveの重複削除
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

    // 昇順ソート
    combined.sort((a, b) => new Date(a.date) - new Date(b.date));

    await fs.writeFile('data/youtube.json', JSON.stringify(combined, null, 2), 'utf8');
    console.log('✅ youtube.json saved.');
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();
