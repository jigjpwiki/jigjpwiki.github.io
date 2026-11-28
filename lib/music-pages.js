'use strict';
const {escape,externalLinkAttrs}=require('./site-pages');const {featureFrame,filters,rowData,filterScript,personLinks,timeLabel,videoLink}=require('./feature-pages');
const {thumbnail,peopleStack,musicFrame}=require('./content-components');
const musicTypes={song:'楽曲',karaoke:'歌枠',original:'オリジナル曲',cover:'歌ってみた',collaboration:'コラボ楽曲',other:'その他'};
function artistLabel(song){return song.originalArtists?escape(song.originalArtists.join('・')):'原曲アーティスト未確認';}
function duplicateSoloCredit(song,ids,master){
 return song?.originalArtists?.length===1&&ids.length===1&&song.originalArtists[0]===master.talents.find(t=>t.id===ids[0])?.displayName;
}
function musicDate(value,withTime=false){
 if(!value||!Number.isFinite(Date.parse(value)))return '日付未確認';
 const options={timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',...(withTime?{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}:{})};
 return '<time datetime="'+escape(value)+'">'+escape(new Intl.DateTimeFormat('ja-JP',options).format(new Date(value)))+'</time>';
}
function videoDate(video){return musicDate(video.publishedAt);}
function latestSongDates(data){
 const dates=new Map(),videoDates=new Map(data.videos.map(v=>[v.youtubeId,v.publishedAt])),archiveDates=new Map((data.karaokeVideos||[]).map(v=>[v.youtubeId,v.startedAt])),karaokes=new Map((data.karaokes||[]).map(k=>[k.id,k.youtubeId]));
 function add(id,value){const stamp=value?Date.parse(value):NaN;if(id&&Number.isFinite(stamp)&&(!dates.has(id)||stamp>dates.get(id)))dates.set(id,stamp);}
 for(const v of data.musicVideos)add(v.songId,videoDates.get(v.youtubeId));
 for(const row of data.performances||[])add(row.songId,archiveDates.get(karaokes.get(row.karaokeId)));
 return dates;
}
function recentSongs(data){
 const dates=latestSongDates(data);
 return [...data.songs].sort((a,b)=>(dates.get(b.id)??-Infinity)-(dates.get(a.id)??-Infinity)||a.title.localeCompare(b.title,'ja')||a.id.localeCompare(b.id));
}
function singerLine(ids,master,compact=false){
 const people=[...new Set(ids)].filter(id=>master.talents.some(t=>t.id===id&&t.visibility!=='draft'));
 const links=personLinks(people,master), stack=peopleStack(people,master,'歌唱者');
 if(compact&&people.length>2)return '<div class="music-singers music-singers-compact">'+stack+'<span class="music-singer-names">'+links+'</span><details class="music-singer-details"><summary>'+people.length+'名の歌唱者</summary><div class="music-singer-expanded">'+links+'</div></details></div>';
 return '<div class="music-singers">'+stack+'<span>'+links+'</span></div>';
}
function songFacts(song,data){
 const videos=data.musicVideos.filter(v=>v.songId===song.id), performances=(data.performances||[]).filter(p=>p.songId===song.id);
 return {videos,performances,people:[...new Set([...videos,...performances].flatMap(v=>v.talentIds))]};
}
function songArt(song,data){
 const video=data.musicVideos.filter(v=>v.songId===song.id&&v.type==='original').map(v=>data.videos.find(x=>x.youtubeId===v.youtubeId)).find(v=>v&&v.availability==='public'&&/^[\w-]{11}$/.test(v.youtubeId));
 return '<span class="music-song-art" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="16" rx="3" ry="2"/></svg>'+(video?'<img src="https://i.ytimg.com/vi/'+video.youtubeId+'/hqdefault.jpg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'')+'</span>';
}
function musicVideoCards(rows,master,data,compact=false){return `<ul class="feature-grid music-video-grid">${[...rows].sort((a,b)=>(data.videos.find(v=>v.youtubeId===b.youtubeId)?.publishedAt||'').localeCompare(data.videos.find(v=>v.youtubeId===a.youtubeId)?.publishedAt||'')||a.id.localeCompare(b.id)).map(row=>{const video=data.videos.find(v=>v.youtubeId===row.youtubeId),song=data.songs.find(s=>s.id===row.songId);const search=[video.title,row.rawSongTitle,song?.title,...(song?.aliases||[]),...(song?.readings||[]),...(song?.originalArtists||[]),...master.talents.filter(t=>row.talentIds.includes(t.id)).map(t=>t.displayName)].join(' ');return `<li class="feature-card music-video-card" data-filter-row="${rowData({...row,title:row.rawSongTitle},master,{search,date:video.publishedAt?new Date(Date.parse(video.publishedAt)+9*3600000).toISOString().slice(0,10):null})}">${thumbnail(video,`https://www.youtube.com/watch?v=${row.youtubeId}`)}<div class="music-card-body"><div class="music-card-meta"><span class="feature-label">${musicTypes[row.type]}</span><p class="music-date">${videoDate(video)}</p></div><h3>${song?`<a href="/music/songs/${song.id}/">${escape(song.title)}</a>`:escape(row.rawSongTitle)}</h3>${song?`<p class="music-artist${compact&&row.type==='original'&&duplicateSoloCredit(song,row.talentIds,master)?' music-credit-duplicate':''}" title="${artistLabel(song)}"><span class="music-artist-prefix">原曲：</span>${artistLabel(song)}</p>`:''}${singerLine(row.talentIds,master,compact)}<div class="music-video-footer"><div class="music-video-action${compact&&video.availability==='public'&&!data.karaokes?.some(k=>k.youtubeId===row.youtubeId)?' music-video-action-redundant':''}">${videoLink(row.youtubeId,data,null,'YouTubeで見る ↗')}</div></div></div></li>`;}).join('')}</ul>`;}
function musicTop(master,data,extra=''){
 const latest=latestSongDates(data);
 const songs=`<ul class="feature-grid music-song-grid">${recentSongs(data).map(song=>{const facts=songFacts(song,data),talentIds=facts.people;const search=[song.title,...song.aliases,...song.readings,...(song.originalArtists||[]),...master.talents.filter(t=>talentIds.includes(t.id)).map(t=>t.displayName)].join(' ');return `<li class="feature-card music-song-card" data-filter-row="${rowData({title:song.title,talentIds,type:'song'},master,{search})}">${songArt(song,data)}<div class="music-song-body"><div class="music-song-heading"><h2><a href="/music/songs/${song.id}/">${escape(song.title)}</a></h2>${latest.has(song.id)?`<span class="music-date" title="最新の歌唱・歌動画公開日">${musicDate(new Date(latest.get(song.id)).toISOString())}</span>`:''}</div><p class="music-artist${facts.videos.some(v=>v.type==='original')&&duplicateSoloCredit(song,talentIds,master)?' music-credit-duplicate':''}" title="${artistLabel(song)}"><span class="music-artist-prefix">原曲：</span>${artistLabel(song)}</p>${singerLine(talentIds,master,true)}<p class="music-counts">${[facts.videos.length?`歌動画 ${facts.videos.length}件`:'',facts.performances.length?`歌枠歌唱 ${facts.performances.length}件`:''].filter(Boolean).join(' · ')||'歌唱記録なし'}</p></div></li>`;}).join('')}</ul>`;
 return musicFrame('音楽','/music/',`<div class="music-list-view" data-music-library><nav class="content-tabs" aria-label="音楽カテゴリ"><a href="?category=videos" data-category="videos">歌動画</a><a href="?category=karaoke" data-category="karaoke">歌枠アーカイブ</a><a href="?category=songs" data-category="songs">楽曲</a></nav>${filters(master,{types:{original:musicTypes.original,cover:musicTypes.cover,collaboration:musicTypes.collaboration,other:musicTypes.other},dates:true,setlist:true})}<section data-category-panel="videos"><h2 class="music-category-heading">歌動画</h2>${musicVideoCards(data.musicVideos,master,data,true)}</section><section data-category-panel="karaoke">${extra}</section><section data-category-panel="songs"><h2 class="music-category-heading">楽曲</h2>${data.songs.length?songs:'<p>楽曲は登録されていません。</p>'}</section></div>`,filterScript);
}
function songPage(song,master,data,history=''){
 const {videos,performances,people}=songFacts(song,data);
 const counts=[videos.length?'歌動画 '+videos.length+'件':'',performances.length?'歌枠歌唱 '+performances.length+'件':''].filter(Boolean).join(' · ');
 return musicFrame(song.title,`/music/songs/${song.id}/`,`<div class="music-detail-view music-song-detail"><nav class="breadcrumbs" aria-label="パンくずリスト"><a href="/music/?category=songs">楽曲一覧</a> / ${escape(song.title)}</nav><div class="music-song-hero">${songArt(song,data)}<div class="music-detail-info"><h1>${escape(song.title)}</h1><p class="music-artist">原曲：${artistLabel(song)}</p>${people.length?`<div class="music-detail-singers"><span class="feature-label">歌唱者</span>${singerLine(people,master)}</div>`:''}${counts?`<p class="music-counts">${counts}</p>`:''}<a class="music-detail-action" href="${escape(song.identityUrl)}"${externalLinkAttrs(song.identityUrl)}>原曲・公式楽曲情報 ↗</a>${song.aliases.length||song.readings.length?`<details class="music-detail-extra"><summary>別表記・読み</summary>${song.aliases.length?`<p>別表記：${song.aliases.map(escape).join('・')}</p>`:''}${song.readings.length?`<p>読み：${song.readings.map(escape).join('・')}</p>`:''}</details>`:''}</div></div><div class="music-detail-sections">${videos.length?`<section class="music-detail-section"><h2>歌動画 <small>${videos.length}件</small></h2><div class="music-list-view">${musicVideoCards(videos,master,data,true)}</div></section>`:''}${performances.length?history||'<section class="music-detail-section"><h2>歌枠での歌唱履歴</h2><p>歌唱記録は登録されていません。</p></section>':!videos.length?'<p class="music-detail-empty">歌動画・歌唱記録は登録されていません。</p>':'<p class="music-detail-empty music-secondary-empty">歌唱記録は登録されていません。</p>'}</div><p class="music-back"><a href="/music/?category=songs">← 楽曲一覧へ</a></p></div>`,'',{hideHeading:true});
}
function talentMusic(id,master,data,extra=''){
 const rows=data.musicVideos.filter(v=>v.talentIds.includes(id));if(!rows.length&&!extra)return '';return `<section class="profile-section"><h2>音楽</h2>${['original','cover','collaboration','other'].map(type=>{const list=rows.filter(v=>v.type===type);if(!list.length)return '';return `<h3>${musicTypes[type]}</h3>${list.length?`<ul class="related-list">${list.map(v=>`<li>${v.songId?`<a href="/music/songs/${v.songId}/">${escape(data.songs.find(s=>s.id===v.songId).title)}</a><br>`:''}${videoLink(v.youtubeId,data)}</li>`).join('')}</ul>`:'<p>登録されていません。</p>'}`;}).join('')}${extra}<p><a href="/music/?talent=${id}">音楽ページで探す →</a></p></section>`;
}
module.exports={musicDate,latestSongDates,recentSongs,singerLine,musicTypes,artistLabel,videoDate,musicVideoCards,musicTop,songPage,talentMusic,songFacts};
