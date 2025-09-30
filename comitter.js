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

        div.innerHTML = `
          <a href="${item.url}" target="_blank" class="live-block">
            <div class="formatted-time"><p>${formattedTime}</p></div>
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
})
.catch(error => {
  console.error("データ取得エラー:", error);
});
