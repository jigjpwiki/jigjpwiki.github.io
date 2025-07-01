'use strict';

// すべての JSON を並列で読み込み
Promise.all([
  fetch("data/tiktok.json").then(res => res.json()),
  fetch("data/twitch.json").then(res => res.json()),
  fetch("data/youtube.json").then(res => res.json())
])
.then(([tiktokData, twitchData, youtubeData]) => {
  // TikTok：学籍番号でサムネイルとアイコンを指定
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

  // Twitch：JSONに入っているthumbnailを使用、顔アイコンはなし
  const twitch = twitchData.map(item => ({
    ...item,
    platform: 'twitch',
    url: `https://www.twitch.tv/${item.twitchid}`,
    thumbnail: item.thumbnail || 'assets/thumbnail/twitch-thumbnail-template.svg',
    faceIcon: null
  }));

  // YouTube：JSONに入っているthumbnailとchannelIconを使用
  const youtube = youtubeData.map(item => ({
    ...item,
    platform: 'youtube',
    url: `https://www.youtube.com/channel/${item.youtubeid}`,
    thumbnail: item.thumbnail || 'assets/thumbnail/youtube-thumbnail-template.svg',
    faceIcon: item.channelIcon || null
  }));


  // 統合 + 日付昇順で並び替え
  const allData = [...tiktok, ...twitch, ...youtube].sort((a, b) => new Date(a.date) - new Date(b.date));

  // HTMLに出力
  const container = document.getElementById("videolist");
  allData.forEach(item => {
    const li = document.createElement("li");
    li.innerHTML = `
      <img src="${item.thumbnail}" alt="サムネイル" height="120"><br>
      <a href="${item.url}" target="_blank">
        ${item.faceIcon ? `<img src="${item.faceIcon}" alt="アイコン" width="25" height="25" style="vertical-align: middle;"> ` : ""}
        ${item.name} (${item.platform})
      </a><br>
      <em>${item.title}</em><br>
      ${item.date}
    `;
    container.appendChild(li);
  });

  console.log(allData);
})
.catch(error => {
  console.error("データ取得エラー:", error);
});
