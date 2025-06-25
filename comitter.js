'use strict';

// すべての JSON を並列で読み込み
Promise.all([
  fetch("data/tiktok.json").then(res => res.json()),
  fetch("data/twitch.json").then(res => res.json())
  // YouTube を追加する場合はここに追加
])
.then(([tiktokData, twitchData]) => {
  // 各データにプラットフォーム名と URL・サムネイルを追加
  const tiktok = tiktokData.map(item => ({
    ...item,
    platform: 'tiktok',
    url: `https://www.tiktok.com/@${item.tiktokid}/live`,
    thumbnail: 'assets/thumbnail/tiktok-thumbnail-template.svg'
  }));

  const twitch = twitchData.map(item => ({
    ...item,
    platform: 'twitch',
    url: `https://www.twitch.tv/${item.twitchid}`,
    // JSONに入っているthumbnailをそのまま使う
    thumbnail: item.thumbnail || 'assets/thumbnail/tiktok-thumbnail-template.svg'
  }));

  // 統合 + 日付昇順で並び替え
  const allData = [...tiktok, ...twitch].sort((a, b) => new Date(a.date) - new Date(b.date));

  // HTMLに出力
  const container = document.getElementById("videolist");
  allData.forEach(item => {
    const li = document.createElement("li");
    li.innerHTML = `
      <img src="${item.thumbnail}" alt="サムネイル" width="" height="120"><br>
      <a href="${item.url}" target="_blank">
        ${item.name} (${item.platform})
      </a>
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
