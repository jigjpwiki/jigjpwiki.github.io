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

  const container = document.getElementById("videolist");
  container.classList.add("videolist-container");

  let lastDate = '';
  let lastHourRange = -1;
  let currentUl = null;
  let dayBlock = null;

  const today = new Date();
  const todayStr = today.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });

  // 日付キーでグループ化
  const groupedData = {};
  allData.forEach(item => {
    const dateKey = new Date(item.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
    if (!groupedData[dateKey]) groupedData[dateKey] = [];
    groupedData[dateKey].push(item);
  });

  // 表示対象の日付（過去3日〜未来3日）を全て出力（中身がなくても）
  for (let offset = -3; offset <= 5; offset++) {
    const targetDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const dateStr = targetDate.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
    const entries = groupedData[dateStr] || [];

    dayBlock = document.createElement("div");
    dayBlock.classList.add("day-block");
    if (dateStr === todayStr) {
      dayBlock.classList.add("today-block");
    }

    const dateHeadingWrapper = document.createElement("div");
    dateHeadingWrapper.classList.add("date-heading");
    const dateHeading = document.createElement("h2");
    dateHeading.textContent = `${dateStr}`;
    dateHeadingWrapper.appendChild(dateHeading);
    dayBlock.appendChild(dateHeadingWrapper);
    container.appendChild(dayBlock);

    lastHourRange = -1;
    currentUl = null;

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
        div.classList.add("live-wrapper"); // IDを追加

        div.innerHTML = `
          <a href="${item.url}" target="_blank" class="live-block">
            <div class="formatted-time"><p>${formattedTime}</p></div>
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
          </a>
        `;
        currentUl.appendChild(div);
      });
  }
})
.catch(error => {
  console.error("データ取得エラー:", error);
});
buildDayBlocks().then(() => {
  // buildDayBlocks() 内で .day-block をすべて挿入し終わったら
  initializeCarousel();  // script.js で定義しておいた関数
});
