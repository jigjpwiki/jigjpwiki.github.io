'use strict';
const {escape}=require('./site-pages');
function thumbnail(video,href){
 const id=video?.youtubeId,safe=/^[\w-]{11}$/.test(id||'')&&video.availability!=='unavailable';
 return `<a class="content-thumbnail" href="${escape(href)}" aria-label="${escape(video?.title||'動画を開く')}"><span aria-hidden="true">${safe?'動画サムネイル':'画像なし'}</span>${safe?`<img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:''}</a>`;
}
module.exports={thumbnail};
