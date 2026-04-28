'use strict';

// ===== YouTube ブラウザ直接取得 =====
const YT_CACHE_ENABLED  = true;               // true: キャッシュ有効 / false: 毎回APIを叩く
const YT_CACHE_TTL_MS   = 5 * 60 * 1000;     // 5分
const YT_CACHE_PREFIX   = 'yt_cache_';        // localStorageキープレフィックス
const YT_WINDOW_PAST_MS = 3 * 24 * 60 * 60 * 1000; // -3日
const YT_WINDOW_FUT_MS  = 5 * 24 * 60 * 60 * 1000; // +5日

function toJstISOString(utcString) {
  const date = new Date(utcString);
  const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jstDate.toISOString().replace('Z', '+09:00');
}

// 単一チャンネルの動画を取得（キャッシュ込み）
async function fetchChannelVideos(streamer, apiKey, now) {
  const cacheKey = YT_CACHE_PREFIX + streamer.youtubeChannelId;

  // localStorage キャッシュ確認
  if (YT_CACHE_ENABLED) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached && (now.getTime() - cached.lastChecked) < YT_CACHE_TTL_MS) {
        return cached.items || [];
      }
    } catch { /* ignore */ }
  }

  const threeDaysAgo   = new Date(now.getTime() - YT_WINDOW_PAST_MS);
  const threeDaysLater = new Date(now.getTime() + YT_WINDOW_FUT_MS);

  // 検索 → ID 取得
  const searchUrl =
    `https://www.googleapis.com/youtube/v3/search?` +
    `part=id&channelId=${encodeURIComponent(streamer.youtubeChannelId)}` +
    `&maxResults=5&order=date&type=video&key=${apiKey}`;

  let videoIds = '';
  try {
    const searchRes  = await fetch(searchUrl);
    const searchJson = await searchRes.json();
    videoIds = (searchJson.items || [])
      .map(it => it && it.id && it.id.videoId)
      .filter(Boolean)
      .join(',');
  } catch (e) {
    console.warn(`[YT] search failed for ${streamer.name}:`, e);
    return [];
  }

  if (!videoIds) {
    if (YT_CACHE_ENABLED) {
      try { localStorage.setItem(cacheKey, JSON.stringify({ lastChecked: now.getTime(), items: [] })); } catch {}
    }
    return [];
  }

  // 動画詳細取得
  const videosUrl =
    `https://www.googleapis.com/youtube/v3/videos?` +
    `part=snippet,liveStreamingDetails&id=${videoIds}&key=${apiKey}`;

  let items = [];
  try {
    const videosRes  = await fetch(videosUrl);
    const videosJson = await videosRes.json();
    items = videosJson.items || [];
  } catch (e) {
    console.warn(`[YT] videos failed for ${streamer.name}:`, e);
    return [];
  }

  const out = [];
  for (const video of items) {
    const snippet = video.snippet || {};
    const details = video.liveStreamingDetails || {};
    const title     = snippet.title || '';
    const thumbnail = (snippet.thumbnails && snippet.thumbnails.medium && snippet.thumbnails.medium.url) || '';
    const videoUrl  = `https://www.youtube.com/watch?v=${video.id}`;

    if (details.actualStartTime && !details.actualEndTime) {
      // actualEndTime なし → 現在も配信中
      const actual = new Date(details.actualStartTime);
      if (actual >= threeDaysAgo && actual <= now) {
        out.push({
          name: streamer.name,
          youtubeid: streamer.youtubeChannelId,
          title,
          date: toJstISOString(details.actualStartTime),
          status: 'live',
          thumbnail,
          channelIcon: streamer.channelIcon || '',
          url: videoUrl
        });
      }
    } else if (details.actualStartTime && details.actualEndTime) {
      // actualEndTime あり → 終了済みのアーカイブ
      const actual = new Date(details.actualStartTime);
      if (actual >= threeDaysAgo && actual <= now) {
        out.push({
          name: streamer.name,
          youtubeid: streamer.youtubeChannelId,
          title,
          date: toJstISOString(details.actualStartTime),
          status: 'archive',
          thumbnail,
          channelIcon: streamer.channelIcon || '',
          url: videoUrl
        });
      }
    } else if (details.scheduledStartTime) {
      const scheduled = new Date(details.scheduledStartTime);
      if (scheduled >= now && scheduled <= threeDaysLater) {
        out.push({
          name: streamer.name,
          youtubeid: streamer.youtubeChannelId,
          title,
          date: toJstISOString(details.scheduledStartTime),
          status: 'upcoming',
          thumbnail,
          channelIcon: streamer.channelIcon || '',
          url: videoUrl
        });
      }
    } else {
      const publishedAt = new Date(snippet.publishedAt);
      if (publishedAt >= threeDaysAgo && publishedAt <= now) {
        out.push({
          name: streamer.name,
          youtubeid: streamer.youtubeChannelId,
          title,
          date: toJstISOString(snippet.publishedAt),
          status: 'archive',
          thumbnail,
          channelIcon: streamer.channelIcon || '',
          url: videoUrl
        });
      }
    }
  }

  if (YT_CACHE_ENABLED) {
    try { localStorage.setItem(cacheKey, JSON.stringify({ lastChecked: now.getTime(), items: out })); } catch {}
  }
  return out;
}

// 全チャンネル分を取得して live/archive 重複を除去
async function fetchYoutubeData() {
  let config, streamers;
  try {
    [config, streamers] = await Promise.all([
      fetch('data/config.json').then(r => r.json()),
      fetch('data/youtube_streamers.json').then(r => r.json())
    ]);
  } catch (e) {
    console.error('[YT] failed to load config/streamers:', e);
    return [];
  }

  const apiKey = config && config.youtubeApiKey;
  if (!apiKey || apiKey === 'REPLACE_WITH_YOUR_YOUTUBE_API_KEY') {
    console.warn('[YT] youtubeApiKey is not configured in data/config.json');
    return [];
  }

  const now = new Date();
  const results = await Promise.all(
    (streamers || [])
      .filter(s => s && s.youtubeChannelId)
      .map(s => fetchChannelVideos(s, apiKey, now))
  );

  // フラット化
  let combined = results.flat();

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

  // URL で重複除去
  const seen = new Set();
  combined = combined.filter(x => {
    const key = x.url ? `url:${x.url}` : `ntd:${x.name}|${x.title}|${x.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return combined;
}

Promise.all([
  fetch("data/tiktok.json").then(res => res.json()),
  fetch("data/twitch.json").then(res => res.json()),
  fetchYoutubeData()
])
.then(([tiktokData, twitchData, youtubeData]) => {
  const tiktok = tiktokData.map(item => ({
    ...item,
    platform: 'tiktok',
    url: `https://www.tiktok.com/@${item.tiktokid}/live`,
    thumbnail: item.schoolid
      ? `assets/thumbnail/${item.schoolid}.png`
      : 'assets/thumbnail/tiktok-thumbnail-template.svg',
    faceIcon: item.schoolid
      ? `assets/face/${item.schoolid}.png`
      : null
  }));

  const twitch = twitchData.map(item => ({
    ...item,
    platform: 'twitch',
    url: `https://www.twitch.tv/${item.twitchid}`,
    thumbnail: item.thumbnail || 'assets/thumbnail/twitch-thumbnail-template.svg',
    faceIcon: item.channelIcon || null
  }));

  const youtube = youtubeData.map(item => ({
    ...item,
    platform: 'youtube',
    url: item.url,
    thumbnail: item.thumbnail || 'assets/thumbnail/youtube-thumbnail-template.svg',
    faceIcon: item.channelIcon || null
  }));

  const allData = [...tiktok, ...twitch, ...youtube]
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Swiper構造を用意
  const outer = document.createElement('div');
  outer.classList.add('swiper', 'videolist-container');

  const container = document.createElement('div');
  container.id = 'videolist';
  container.classList.add('swiper-wrapper');

  outer.appendChild(container);
  document.querySelector('.videoswipe-inner').appendChild(outer); // 適切な親に追加

  const today = new Date();
  const todayStr = today.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });

  const groupedData = {};
  allData.forEach(item => {
    const dateKey = new Date(item.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
    if (!groupedData[dateKey]) groupedData[dateKey] = [];
    groupedData[dateKey].push(item);
  });

  for (let offset = -3; offset <= 5; offset++) {
    const targetDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const dateStr = targetDate.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
    const entries = groupedData[dateStr] || [];

    const dayBlock = document.createElement("div");
    dayBlock.classList.add("day-block", "swiper-slide");
    if (dateStr === todayStr) {
      dayBlock.classList.add("today-block");
    }

    const dateHeadingWrapper = document.createElement("div");
    dateHeadingWrapper.classList.add("date-heading");
    const dateHeading = document.createElement("h2");
    dateHeading.textContent = `${dateStr}`;
    dateHeadingWrapper.appendChild(dateHeading);
    dayBlock.appendChild(dateHeadingWrapper);

    let lastHourRange = -1;
    let currentUl = null;

    entries
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach(item => {
        const dateObj = new Date(item.date);

        const hour   = dateObj.getHours().toString().padStart(2, '0');
        const minute = dateObj.getMinutes().toString().padStart(2, '0');
        const formattedTime = `${hour}:${minute}`;

        const hourRange = [0, 6, 12, 18].reduce((prev, curr) => dateObj.getHours() >= curr ? curr : prev, 0);
        const hourLabel = `${hourRange.toString().padStart(2, '0')}:00`;

        if (hourRange !== lastHourRange) {
          const timeHeadingWrapper = document.createElement("div");
          timeHeadingWrapper.classList.add("time-heading");
          const timeHeading = document.createElement("h3");
          timeHeading.textContent = `${hourLabel} - ${(hourRange + 5).toString().padStart(2, '0')}:59`;
          timeHeadingWrapper.appendChild(timeHeading);
          dayBlock.appendChild(timeHeadingWrapper);

          currentUl = document.createElement("div");
          currentUl.classList.add("video-list", `time-${hourRange.toString().padStart(2, '0')}`);
          dayBlock.appendChild(currentUl);

          lastHourRange = hourRange;
        }

        const div = document.createElement("div");
        div.classList.add("live-wrapper");

        const isLive = item.platform === 'youtube' && item.status === 'live';

        div.innerHTML = `
          <a href="${item.url}" target="_blank" class="live-block">
            <div class="card-pills">
              <div class="formatted-time"><p>${formattedTime}</p></div>
              ${isLive ? `<div class="onair-badge"><p>ON AIR</p></div>` : ""}
            </div>
            <div class="live-badge ${item.platform}${isLive ? " is-live" : ""}">
              <div class="${item.platform}-badge platform-border"></div>
              <div class="live-info">
                <div class="live-info-inner">
                  <div class="face-icon">
                    ${item.faceIcon ? `<img src="${item.faceIcon}" alt="アイコン" width="68" height="68">` : ""}
                  </div>
                  <div class="description">
                    <div class="liver-name"><p>${item.name}</p></div>
                    <p class="live-title">${item.title}</p>
                  </div>
                </div>
                <div class="thumbnail-wrapper">
                  <img class="thumbnail" src="${item.thumbnail}" alt="サムネイル" height="120">
                </div>
              </div>
            </div>
          </a>
        `;
        currentUl.appendChild(div);
      });

    container.appendChild(dayBlock);
  }

  initializeCarousel();

  // 現在のJST時刻に対応する time-heading へスクロール
  function scrollToCurrentTime() {
    const todayBlock = document.querySelector('.today-block');
    if (!todayBlock) return;

    // UTC+9 でJSTの時刻を取得
    const jstHour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours();

    // 時間帯の区切り (0, 6, 12, 18)
    const ranges = [0, 6, 12, 18];
    const currentRange = ranges.reduce((prev, curr) => jstHour >= curr ? curr : prev, 0);

    // 現在の時間帯から遡り、データが存在する最も近い time-heading を探す
    let targetEl = null;
    for (let i = ranges.indexOf(currentRange); i >= 0; i--) {
      const rangeStr = ranges[i].toString().padStart(2, '0');
      const videoList = todayBlock.querySelector(`.video-list.time-${rangeStr}`);
      if (videoList && videoList.previousElementSibling) {
        targetEl = videoList.previousElementSibling; // .time-heading div
        break;
      }
    }

    // 見つからなければ最初の time-heading にフォールバック
    if (!targetEl) {
      targetEl = todayBlock.querySelector('.time-heading');
    }

    if (targetEl) {
      const offset = targetEl.getBoundingClientRect().top - todayBlock.getBoundingClientRect().top;
      todayBlock.scrollTo({ top: todayBlock.scrollTop + offset - 100, behavior: 'smooth' });
    }
  }

  // Swiper描画完了後に実行
  requestAnimationFrame(() => requestAnimationFrame(scrollToCurrentTime));
})
.catch(error => {
  console.error("データ取得エラー:", error);
});
