'use strict';

Promise.all([
  fetch("data/tiktok.json").then(res => res.json()),
  fetch("data/twitch.json").then(res => res.json()),
  fetch("data/youtube.json").then(res => res.json())
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
  const toDateKey = (d) => {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}/${day}`;
  };
  const todayStr = toDateKey(today);

  const groupedData = {};
  allData.forEach(item => {
    const d = new Date(item.date);
    const dateKey = toDateKey(d);
    if (!groupedData[dateKey]) groupedData[dateKey] = [];
    groupedData[dateKey].push(item);
  });

  for (let offset = -3; offset <= 5; offset++) {
    const targetDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const dateStr = toDateKey(targetDate);
    const entries = groupedData[dateStr] || [];

    const dayBlock = document.createElement("div");
    dayBlock.classList.add("day-block", "swiper-slide");
    if (dateStr === todayStr) {
      dayBlock.classList.add("today-block");
    }

    const dateHeadingWrapper = document.createElement("div");
    dateHeadingWrapper.classList.add("date-heading");
    const dateHeading = document.createElement("h2");
    const dow = targetDate.getDay();
    if (dow === 0) dateHeading.classList.add("date-heading--sun");
    else if (dow === 6) dateHeading.classList.add("date-heading--sat");
    dateHeading.textContent = dateStr;
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

        // YouTubeアイテムにはビデオIDを付与してAPI確認対象にする
        if (item.platform === 'youtube') {
          try {
            const videoId = new URL(item.url).searchParams.get('v');
            if (videoId) div.dataset.ytId = videoId;
          } catch (_) {}
        }

        // 12時間以上経過したliveはON AIR非表示（JSONキャッシュ中に終了した場合の補正）
        const streamAge = Date.now() - new Date(item.date).getTime();
        const isLive = item.status === 'live' && streamAge < 12 * 60 * 60 * 1000;
        div.innerHTML = `
          <a href="${item.url}" target="_blank" class="live-block${isLive ? ' is-live' : ''}">
            <div class="formatted-time"><p>${formattedTime}</p></div>
            ${isLive ? '<div class="on-air-badge"><p>ON AIR</p></div>' : ''}
            <div class="live-badge ${item.platform}">
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
  checkYouTubeLiveStatus();

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

/**
 * data/yt_browser_config.json のAPIキーを使い、
 * YouTube Data API v3 でライブ状態をリアルタイム確認してDOMを更新する
 */
async function checkYouTubeLiveStatus() {
  let apiKey = '';
  try {
    const config = await fetch('data/yt_browser_config.json').then(r => r.json());
    apiKey = (config.apiKey || '').trim();
  } catch {
    return; // 設定ファイルなし or パース失敗はサイレントに無視
  }
  if (!apiKey || apiKey === 'YOUR_KEY_HERE') return;

  const allDivs = [...document.querySelectorAll('[data-yt-id]')];
  if (!allDivs.length) return;

  const idMap = new Map(allDivs.map(div => [div.dataset.ytId, div]));
  const ids = [...idMap.keys()];

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50).join(',');
    try {
      const url = new URL('https://www.googleapis.com/youtube/v3/videos');
      url.searchParams.set('part', 'snippet,liveStreamingDetails');
      url.searchParams.set('id', batch);
      url.searchParams.set('key', apiKey);

      const res = await fetch(url.toString());
      if (!res.ok) {
        console.warn('YouTube API error:', res.status, await res.text());
        continue;
      }
      const json = await res.json();

      for (const video of (json.items || [])) {
        const div = idMap.get(video.id);
        if (!div) continue;

        const snippet = video.snippet || {};
        const details = video.liveStreamingDetails || {};
        const isLive = snippet.liveBroadcastContent === 'live' && !details.actualEndTime;

        const anchor = div.querySelector('a.live-block');
        if (!anchor) continue;

        if (isLive) {
          anchor.classList.add('is-live');
          if (!anchor.querySelector('.on-air-badge')) {
            const badge = document.createElement('div');
            badge.className = 'on-air-badge';
            badge.innerHTML = '<p>ON AIR</p>';
            const timeEl = anchor.querySelector('.formatted-time');
            if (timeEl) timeEl.insertAdjacentElement('afterend', badge);
          }
        } else {
          anchor.classList.remove('is-live');
          anchor.querySelector('.on-air-badge')?.remove();
        }
      }
    } catch (e) {
      console.warn('YouTube live status check failed:', e);
    }
  }
}
