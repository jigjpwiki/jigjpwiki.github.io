'use strict';
(() => {
 for(const img of document.querySelectorAll('.content-thumbnail img,.goods-image img,.anniversary-person img,.music-page .avatar-stack img,.music-song-art img,.event-performer-line .avatar-stack img,.goods-people .avatar-stack img')){
  img.classList.add('is-managed');
  const loaded=()=>{if(img.naturalWidth>0)img.classList.add('is-loaded');};
  img.addEventListener('load',loaded);img.addEventListener('error',()=>img.classList.remove('is-loaded'));if(img.complete)loaded();
 }
})();
