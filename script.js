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
}
