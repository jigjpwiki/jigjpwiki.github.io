'use strict';

fetch("https://script.google.com/macros/s/AKfycbx21xLkgVYXkhYf7awzkp6blzSF5QA9PkFKEQaMVTkcMSIaX48tsy_KASRems2BO5UjSw/exec")
  .then(response => response.json())
  .then(data => {
  const container = document.getElementById("videolist");

  data.forEach(item => {
    const li = document.createElement("li");
    li.innerHTML = `
    <img src="asset/thumbnail/tiktok-thumbnail-template.svg" alt="サムネイル" width="120" height="120"><br>
    <a href="https://www.tiktok.com/@${item.tiktokid}/live" target="_blank">
    ${item.name} (${item.tiktokid})
    <em>${item.title}</em><br>
    ${item.date}
    `;
    container.appendChild(li);
  });
})
  .catch(error => {
    console.error("データ取得エラー:", error);
  });
