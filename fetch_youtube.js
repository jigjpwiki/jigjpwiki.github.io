'use strict';

const fs = require('fs').promises;
const fetch = require('node-fetch');

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const DATA_FILE  = 'data/youtube.json';          // ページが読む本体
const CACHE_FILE = 'data/youtube_cache.json';    // 取得間引き用キャッシュ（lastChecked）

function toJstISOString(utcString) {
  const date = new Date(utcString);
  const jstOffset = 9 * 60;
  const jstDate = new Date(date.getTime() + jstOffset * 60 * 1000);
  return jstDate.toISOString().replace('Z', '+09:00');
}

(async () => {
  try {
    // 入力（配信者リスト）
    const streamers = JSON.parse(await fs.readFile('data/youtube_streamers.json', 'utf8'));

    const now = new Date();
    const threeDaysAgo   = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const threeDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

    // キャッシュ読み込み
    let cache = {};
    try {
      cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
    } catch {
      console.log('📁 No cache found, starting fresh.');
    }

    // 既存の出力（上書き事故を避けるため先に読む）
    let existing = [];
    try {
      existing = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
      if (!Array.isArray(existing)) {
        console.warn('⚠️ Existing youtube.json is not an array. Resetting to [].');
        existing = [];
      }
    } catch {
      existing = [];
    }

    // 取得ループ
    let combined = [];
    console.log(`streamers: ${streamers.length}`);
    let processed = 0, skippedByCache = 0, hitChannels = 0;

    for (const s of streamers) {
      if (!s.youtubeChannelId) continue;
      processed++;

      const lastChecked = cache[s.youtubeChannelId];
      if (lastChecked && (now - new Date(lastChecked) < 1 * 60 * 60 * 1000)) {
        skippedByCache++;
        // 直近3時間はスキップ
        continue;
      }

      // 最新動画検索（最大5件）
      const searchUrl =
        `https://www.googleapis.com/youtube/v3/search?` +
        `part=id&channelId=${s.youtubeChannelId}&maxResults=5&order=date&type=video&key=${YOUTUBE_API_KEY}`;

      const searchRes = await fetch(searchUrl);
      const searchJson = await searchRes.json();
      const videoIds = (searchJson.items || [])
        .map(item => item && item.id && item.id.videoId)
        .filter(Boolean)
        .join(',');

      if (!videoIds) {
        cache[s.youtubeChannelId] = now.toISOString();
        continue;
      }

      // 動画詳細
      const videosUrl =
        `https://www.googleapis.com/youtube/v3/videos?` +
        `part=snippet,liveStreamingDetails&id=${videoIds}&key=${YOUTUBE_API_KEY}`;

      const videosRes = await fetch(videosUrl);
      const videosJson = await videosRes.json();
      const items = videosJson.items || [];
      if (items.length > 0) hitChannels++;

      for (const video of items) {
        const snippet = video.snippet || {};
        const details = video.liveStreamingDetails || {};
        const title = snippet.title || '';
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

    console.log(`processed: ${processed}, skippedByCache: ${skippedByCache}, hitChannels: ${hitChannels}, newItems: ${combined.length}`);

    // live と archive の重複（同一配信が二重）を除去
    combined = combined.filter((item, _idx, arr) => {
      if (item.status !== 'archive') return true;
      const dup = arr.find(other =>
        other.status === 'live' &&
        other.name === item.name &&
        other.title === item.title &&
        Math.abs(new Date(other.date) - new Date(item.date)) < 60 * 1000
      );
      return !dup;
    });

    // 既存とマージし、±3日ウィンドウに制限
    const windowStart = new Date(threeDaysAgo);
    const windowEnd   = new Date(threeDaysLater);

    const merged = [...existing, ...combined].filter(item => {
      const d = new Date(item.date);
      return d >= windowStart && d <= windowEnd;
    });

    // URL（なければ name|title|date）で重複除去
    const seen = new Set();
    const deduped = merged.filter(x => {
      const key = x.url ? `url:${x.url}` : `ntd:${x.name}|${x.title}|${x.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 昇順ソート
    deduped.sort((a, b) => new Date(a.date) - new Date(b.date));

    // 変更があるときだけ data を書き込む（空で上書きしない）
    const prevJson = JSON.stringify(existing, null, 2);
    const nextJson = JSON.stringify(deduped,  null, 2);
    if (prevJson !== nextJson) {
      await fs.writeFile(DATA_FILE, nextJson, 'utf8');
      console.log(`✅ ${DATA_FILE} updated (+${combined.length} new, total ${deduped.length}).`);
    } else {
      console.log('ℹ️ No changes for youtube.json; keeping current file.');
    }

    // キャッシュは毎回更新
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    console.log('✅ cache saved.');
  } catch (err) {
    console.error('❌ Error:', err?.message || err);
    process.exitCode = 1;
  }
})();
