function startDebugClock() {
  const el = document.getElementById('debug-jst');
  if (!el) return;
  const update = () => {
    const now = new Date().toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
    el.textContent = '' + now + ' JST';
  };
  update();
  setInterval(update, 1000);
}

startDebugClock();

function formatLastUpdated(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }) + ' JST';
}

async function loadLastUpdated() {
  try {
    const res = await fetch('data/last_updated.json');
    if (!res.ok) return;
    const meta = await res.json();
    const ytEl = document.getElementById('debug-yt-updated');
    const twEl = document.getElementById('debug-tw-updated');
    if (ytEl) ytEl.textContent = 'YouTube更新: ' + (meta.youtube ? formatLastUpdated(meta.youtube) : '--');
    if (twEl) twEl.textContent = 'Twitch更新: ' + (meta.twitch ? formatLastUpdated(meta.twitch) : '--');
  } catch {
    // データ未生成時はデフォルト表示のまま
  }
}

loadLastUpdated();

function initializeCarousel() {
  const today = new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  const slides = document.querySelectorAll('.day-block');
  let initialIndex = 3;

  slides.forEach((slide, index) => {
    if (slide.classList.contains('today-block')) {
      initialIndex = index;
    }
  });

  const swiper = new Swiper('.videolist-container', {
    slidesPerView: 'auto',
    spaceBetween: 0,
    loop: false,
    initialSlide: initialIndex,
    navigation: {
      nextEl: '.swipe-button.next',
      prevEl: '.swipe-button.prev'
    },
    // pagination: {
    //   el: '.swiper-pagination',
    //   clickable: true
    // }
  });
  window._swiperInstance = swiper;
}

// ———————アップデート情報バナー制御———————— 
async function loadUpdateInfo() {
  try {
    const res = await fetch('data/update_info.json');
    if (!res.ok) return;
    const data = await res.json();

    // message_all が書かれていればデバイス問わず表示（単体は無視）
    const all = (data.message_all || '').trim();
    const mobile = (data.message_mobile || '').trim();
    const pc = (data.message_pc || '').trim();

    let message = '';
    if (all) {
      message = all;
    } else {
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      message = isMobile ? mobile : pc;
    }

    if (!message) return;

    const banner = document.getElementById('update-banner');
    const messageEl = document.getElementById('update-message');

    if (banner && messageEl) {
      messageEl.textContent = message;
      banner.style.display = 'flex';
    }
  } catch {
    // JSONが読み込めない場合は何もしない
  }
}

// バナー閉じるボタンの処理
function initUpdateBannerClose() {
  const closeBtn = document.getElementById('update-close-btn');
  const banner = document.getElementById('update-banner');
  
  if (closeBtn && banner) {
    closeBtn.addEventListener('click', () => {
      banner.style.display = 'none';
    });
  }
}

loadUpdateInfo();
initUpdateBannerClose();
