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
