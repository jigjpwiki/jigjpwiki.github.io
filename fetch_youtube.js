'use strict';

const fs = require('fs').promises;
const fetch = require('node-fetch');

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CACHE_FILE = 'data/youtube_cache.json';

function toJstISOString(utcString) {
  const date = new Date(utcString);
  const jstOffset = 9 * 60;
  const jstDate = new Date(date.getTime() + jstOffset * 60 * 1000);
  return jstDate.toISOString().replace('Z', '+09:00');
}

(async () => {
  try {
    const list = JSON.parse(await fs.readFile('data/youtube_streamers.json', 'utf8'));
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    let cache = {};
    try {
      cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
    } catch (e) {
      console.log('📁 No cache found, starting fresh.');
    }

    let combined = [];

    for (const s of list) {
      if (!s.youtubeChannelId) continue;

      const lastChecked = cache[s.youtubeChannelId];
      if (lastChecked && (new Date(now) - new Date(lastChecked) < 6 * 60 * 60 * 1000)) {
        // 最終チェックから6時間未満ならスキップ
        continue;
      }

      // 最新動画検索（最大5件）
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${s.youtubeChannelId}&maxResults=5&order=date&type=video&key=${YOUTUBE_API_KEY}`
      );
      const searchJson = await searchRes.json();
      const videoIds = searchJson.items?.map(item => item.id.videoId).filter(Boolean).join(',');
      if (!videoIds) continue;

      // 詳細情報を取得
      const videosRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${videoIds}&key=${YOUTUBE_API_KEY}`
      );
      const videosJson = await videosRes.json();

      for (const video of videosJson.items || []) {
        const snippet = video.snippet;
        const details = video.liveStreamingDetails || {};
        const title = snippet.title;
        const thumbnail = snippet.thumbnails?.medium?.url || '';
        const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;

        if (details.actualStartTime) {
          const actual = new Date(details.actualStartTime);
          if (actual >= threeDaysAgo && actual <= now) {
            combined.push({
              name: s.name,
              youtubeid: s.youtubeChannelId,
              title,
              date: toJstISOString(details.actualStartTime),
              status: 'live',
              thumbnail,
              channelIcon: s.channelIcon || '',
              url: videoUrl
            });
          }
        } else if (details.scheduledStartTime) {
          const scheduled = new Date(details.scheduledStartTime);
          if (scheduled >= now && scheduled <= threeDaysLater) {
            combined.push({
              name: s.name,
              youtubeid: s.youtubeChannelId,
              title,
              date: toJstISOString(details.scheduledStartTime),
              status: 'upcoming',
              thumbnail,
              channelIcon: s.channelIcon || '',
              url: videoUrl
            });
          }
        } else {
          const publishedAt = new Date(snippet.publishedAt);
          if (publishedAt >= threeDaysAgo && publishedAt <= now) {
            combined.push({
              name: s.name,
              youtubeid: s.youtubeChannelId,
              title,
              date: toJstISOString(snippet.publishedAt),
              status: 'archive',
              thumbnail,
              channelIcon: s.channelIcon || '',
              url: videoUrl
            });
          }
        }
      }

      // チェック済みとして記録
      cache[s.youtubeChannelId] = now.toISOString();
    }

    // live と archive の重複削除
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

    // 出力
    await fs.writeFile('data/youtube.json', JSON.stringify(combined, null, 2), 'utf8');
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    console.log('✅ youtube.json and cache saved.');
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();
