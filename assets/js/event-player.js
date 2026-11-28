'use strict';
(() => {
 for(const host of document.querySelectorAll('[data-event-player]')){
  const id=host.dataset.eventPlayer,button=host.querySelector('.event-player-trigger');
  if(!button||!(/^[\w-]{11}$/.test(id)))continue;
  button.hidden=false;
  button.addEventListener('click',()=>{
   const frame=document.createElement('iframe');
   frame.title=host.dataset.playerTitle||'YouTubeプレーヤー';
   frame.referrerPolicy='strict-origin-when-cross-origin';
   frame.allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share';
   frame.allowFullscreen=true;
   frame.src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&playsinline=1';
   host.classList.add('is-playing');
   host.replaceChildren(frame);
   frame.focus();
  },{once:true});
 }
})();
