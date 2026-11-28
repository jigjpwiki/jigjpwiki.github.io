'use strict';
const {escape,externalLinkAttrs}=require('./site-pages');
function thumbnail(video,href){
 const id=video?.youtubeId,safe=/^[\w-]{11}$/.test(id||'')&&video.availability!=='unavailable';
 return `<a class="content-thumbnail" href="${escape(href)}"${externalLinkAttrs(href)} aria-label="${escape(video?.title||'動画を開く')}"><span aria-hidden="true">${safe?'動画サムネイル':'画像なし'}</span>${safe?`<img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:''}</a>`;
}
// Server-rendered counterpart to the schedule's shared AvatarStack CSS.
function peopleStack(ids,master,label='関連タレント'){
 const byId=new Map(master.talents.filter(t=>t.visibility!=='draft').map(t=>[t.id,t]));
 const people=[...new Set(ids||[])].map(id=>byId.get(id)).filter(Boolean);
 if(!people.length)return '';
 const shown=people.length>5?people.slice(0,4):people;
 return '<span class="avatar-stack" role="img" aria-label="'+escape(label+'：'+people.map(t=>t.displayName).join('、'))+'">'+shown.map(t=>'<span class="avatar-stack-item" aria-hidden="true">'+escape([...t.displayName][0]||'？')+(t.profileImage?.url&&!t.profileHidden?'<img src="'+escape(t.profileImage.url)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'')+'</span>').join('')+(people.length>5?'<span class="avatar-stack-item avatar-stack-more" aria-hidden="true">+'+(people.length-4)+'</span>':'')+'</span>';
}
function musicFrame(title,route,body,scripts=''){
 const {featureFrame}=require('./feature-pages');
 const v=require('../data/release.json').version;
 return featureFrame(title,route,'<div class="music-page">'+body+'</div>',scripts).replace('</head>','<link rel="stylesheet" href="/assets/avatar-stack.css?v='+v+'"><link rel="stylesheet" href="/assets/music-ux.css?v='+v+'"></head>');
}
module.exports={thumbnail,peopleStack,musicFrame};
