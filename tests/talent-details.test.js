'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const { relatedStreams }=require('../lib/related');const { talentPage }=require('../lib/talent-details');const { loadTalents }=require('../lib/talents');const { loadCatalog,publicCatalog }=require('../lib/catalog');
const master=loadTalents();const person=master.talents[0];const channel=person.accounts.find(a=>a.service==='youtube').accountId;
const video={youtubeid:channel,name:'different name',videoId:'abcDEFG1234',title:'verified',date:'2026-11-15T00:00:00Z',status:'archive',url:'https://www.youtube.com/watch?v=abcDEFG1234'};
test('related streams use exact YouTube IDs and normalized Twitch account IDs, never display names',()=>{
 const wrong={...video,youtubeid:'UC_somebody_else',name:person.displayName};
 const twitch={twitchid:'MAHIRUNERU',videoId:'1234',title:'Twitch',date:video.date,status:'archive',url:'https://www.twitch.tv/videos/1234'};
 assert.equal(relatedStreams(person,[video,wrong],[twitch,{...twitch,twitchid:'other',name:person.displayName}]).length,2);
 assert.equal(relatedStreams(person,[{...video,youtubeid:undefined,name:person.displayName}],[]).length,0);
 assert.equal(relatedStreams(person,null,{}).length,0);
});
test('mismatched URL, unsafe host/protocol, missing fields and duplicates cannot create related links',()=>{
 for(const row of [{...video,url:'javascript:alert(1)'},{...video,url:'https://evil.example/watch?v=abcDEFG1234'},{...video,url:'https://www.youtube.com/watch?v=xxxxxxxxxxx'},{...video,title:null},{...video,date:'invalid'}])assert.equal(relatedStreams(person,[row],[]).length,0);
 assert.equal(relatedStreams(person,[video,video],[]).length,1);
});
test('public profile works with missing optional data and keeps graduation separate from retirement',()=>{
 const data=publicCatalog(loadCatalog(master));const former=master.talents[3];const html=talentPage(former,master,data,{});
 assert.match(html,/旧所属：ProForma Nova/);assert.doesNotMatch(html,/>引退<|>活動終了<|agencyStatus|activityStatus|<small>tal-/);
 assert.match(html,/関連する配信・動画情報はありません/);assert.match(html,/画像未確認/);
 const t=structuredClone(person);t.profileImage=null;t.accounts=[];t.wiki=null;t.affiliations=[];
 assert.match(talentPage(t,master,{...data,events:[]},{}),/記念日はまだ登録/);
});
test('profile escapes names and titles, links verified anniversaries, and never displays inferred age',()=>{
 const t=structuredClone(person);t.displayName='<img onerror=alert(1)>';
 const html=talentPage(t,master,publicCatalog(loadCatalog(master)),{youtube:[{...video,title:'<script>alert(1)</script>'}]});
 assert.doesNotMatch(html,/<img onerror|<script>alert/);assert.match(html,/&lt;script/);assert.doesNotMatch(html,/\d+歳/);
});

test('saved stream rows cannot be mistaken for current live status',()=>{
 const data=publicCatalog(loadCatalog(master));
 for(const status of ['live','upcoming','archive']){
  const html=talentPage(person,master,data,{youtube:[{...video,status}]});
  assert.match(html,/サイト公開時点の保存データ/);assert.match(html,/リアルタイムの配信状態ではありません/);
  assert.doesNotMatch(html,/配信中|配信予定（収集時点）/);assert.match(html,/配信・公開日時（予定を含む）/);
  assert.match(html,/プロフィール等の出典確認日/);
 }
});
