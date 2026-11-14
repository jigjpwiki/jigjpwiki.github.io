'use strict';
const path=require('node:path');const {ajv}=require('./talents');
const {loadEvents,validateMedia,context,read,fail,unique,evidence,references,validateRegistry}=require('./feature-data');
const shape=ajv.compile(require('../schemas/music.schema.json'));
function validateMusic(talents,catalog,media,data,registry){
 validateMedia(media);
 if(!shape(data))fail(ajv.errorsText(shape.errors));const songs=unique(data.songs);unique(data.musicVideos);unique(data.musicVideos,'youtubeId');const ctx=context(talents,catalog,media);
 for(const video of media.videos)evidence(video,ctx,video.visibility==='public');
 const works=new Set();
 for(const song of data.songs){evidence(song,ctx,song.visibility==='public');if((song.originalArtists===null)!==(song.artistEvidence==='unknown'))fail('unknown artist must stay unknown');if(song.visibility==='public'&&!song.sourceRefs.some(id=>ctx.sources.get(id).kind==='official'&&ctx.sources.get(id).url===song.identityUrl))fail('song identity URL needs matching official evidence');const key=song.identityUrl;if(works.has(key))fail('duplicate song identity');works.add(key);}
 for(const video of data.musicVideos){evidence(video,ctx,video.visibility==='public');references(video.talentIds,ctx.talents,'singer');references([video.youtubeId],ctx.videos,'music video');if(video.songId!==null)references([video.songId],songs,'song');
  if(video.visibility==='public'&&(ctx.videos.get(video.youtubeId).visibility!=='public'||video.songId!==null&&songs.get(video.songId).visibility!=='public'))fail('public music references draft');
  const owners=talents.talents.filter(t=>t.accounts.some(a=>a.service==='youtube'&&a.accountId===ctx.videos.get(video.youtubeId).channelId));if(owners.length&&!owners.some(t=>video.talentIds.includes(t.id)))fail('music video channel owner missing from singers');
 }
 if(registry)validateRegistry(registry,[...data.songs,...data.musicVideos]);
 return {...data,media,ctx};
}
function loadMusic(talents,catalog,root=path.join(__dirname,'..')){const events=loadEvents(talents,catalog,root);return validateMusic(talents,catalog,events.media,read(root,'music'),read(root,'feature-id-registry'));}
function projectMusic(model){const songs=model.songs.filter(s=>s.visibility==='public'),musicVideos=model.musicVideos.filter(v=>v.visibility==='public');const used=new Set(musicVideos.map(v=>v.youtubeId));const videos=model.media.videos.filter(v=>used.has(v.youtubeId)&&v.visibility==='public');const refs=new Set([...songs,...musicVideos,...videos].flatMap(r=>r.sourceRefs));return {songs,musicVideos,videos,sources:[...model.ctx.sources.values()].filter(s=>refs.has(s.id))};}
module.exports={validateMusic,loadMusic,projectMusic};
