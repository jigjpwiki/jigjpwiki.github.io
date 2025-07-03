/*

document.addEventListener('DOMContentLoaded', () => {
  const viewport = document.querySelector('.videolist-container');
  const slides  = viewport.querySelectorAll('.day-block');
  const prevBtn = document.querySelector('.swipe-button.prev');
  const nextBtn = document.querySelector('.swipe-button.next');

  const slideWidth = viewport.clientWidth;
  const INITIAL_INDEX = 4;   // 例：2枚目からスタートしたいときは 1

  // ─── 初期表示をセット ─────────────────────────────────
  viewport.scrollTo({
    left: slideWidth * INITIAL_INDEX,
    behavior: 'auto'         // 読み込み時はアニメーションなし
  });

  // ─── ボタン操作 ───────────────────────────────────────
  prevBtn.addEventListener('click', () => {
    viewport.scrollBy({ left: -slideWidth, behavior: 'smooth' });
  });
  nextBtn.addEventListener('click', () => {
    viewport.scrollBy({ left:  slideWidth, behavior: 'smooth' });
  });

  // ─── リサイズ対応（任意）───────────────────────────────
  window.addEventListener('resize', () => {
    // 要素幅が変わったら再度初期位置を再計算
    viewport.scrollTo({
      left: viewport.clientWidth * INITIAL_INDEX,
      behavior: 'auto'
    });
  });
});

*/


// script.js

// script.js

/**
 * day-block ごとに横スクロールするカルーセルを初期化します。
 * committer.js で .day-block をすべて挿入し終わったあとに 呼び出してください。
 */
function initializeCarousel(initialIndex = 0) {
  const viewport = document.querySelector('.videolist-container');
  const blocks   = Array.from(viewport.querySelectorAll('.day-block'));
  const prevBtn  = document.querySelector('.swipe-button.prev');
  const nextBtn  = document.querySelector('.swipe-button.next');

  if (!viewport || blocks.length === 0 || !prevBtn || !nextBtn) {
    console.warn('initializeCarousel: 必要な要素が見つかりませんでした');
    return;
  }

  let currentIndex = initialIndex;

  // 指定したインデックスの .day-block を表示
  function scrollToIndex(idx, smooth = true) {
    idx = Math.max(0, Math.min(blocks.length - 1, idx));
    blocks[idx].scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
      inline: 'start',
      block:   'nearest'
    });
    currentIndex = idx;
  }

  // 初期表示
  scrollToIndex(currentIndex, /*smooth=*/false);

  // 前へ
  prevBtn.addEventListener('click', () => {
    scrollToIndex(currentIndex - 1);
  });

  // 次へ
  nextBtn.addEventListener('click', () => {
    scrollToIndex(currentIndex + 1);
  });

  // リサイズ対応：現在のインデックスを再表示
  window.addEventListener('resize', () => {
    scrollToIndex(currentIndex, /*smooth=*/false);
  });
}

// グローバルに公開
window.initializeCarousel = initializeCarousel;

// committer.js で DOM 生成後に呼ぶか、必要なら以下を有効に
// document.addEventListener('DOMContentLoaded', () => initializeCarousel(4));

