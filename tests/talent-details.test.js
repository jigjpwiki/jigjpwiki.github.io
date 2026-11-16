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
 const data=publicCatalog(loadCatalog(master));const former=structuredClone(master.talents.find(t=>t.id==='tal-000004'));former.profileImage=null;const html=talentPage(former,master,data,{});
 assert.match(html,/旧所属：ProForma Nova/);assert.doesNotMatch(html,/>引退<|>活動終了<|agencyStatus|activityStatus|<small>tal-/);
 assert.match(html,/配信・動画はありません/);assert.match(html,/class="talent-avatar"/);
 const t=structuredClone(person);t.profileImage=null;t.accounts=[];t.wiki=null;t.affiliations=[];
 assert.doesNotMatch(talentPage(t,master,{...data,events:[]},{}),/id="profile-anniversaries"/);
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
  assert.match(html,/サイト公開時点の保存データ/);assert.match(html,/サイト公開時点の保存データです/);
  assert.doesNotMatch(html.match(/<details data-stream-fallback[\s\S]*?<\/details>/)[0],/配信中|配信予定（収集時点）/);assert.match(html,/<time datetime=/);
  assert.doesNotMatch(html,/情報源・確認日|sourceRefs/);
 }
});

test('profile image presence is independent of live master values and requires safe URLs',()=>{
 const fixture=structuredClone(master);const talent=fixture.talents.find(t=>t.id==='tal-000004');
 const image={url:'https://images.example/fixture-avatar.png'};
 const data=publicCatalog(loadCatalog(fixture));
 for(const profileImage of [null,image]){
  talent.profileImage=structuredClone(profileImage);const before=structuredClone(fixture);
  assert.doesNotThrow(()=>require('../lib/talents').validateTalents(fixture,{registry:require('../data/talent-id-registry.json')}));
  const html=talentPage(talent,fixture,data,{});
  if(profileImage){assert.match(html,/src="https:\/\/images\.example\/fixture-avatar\.png"/);assert.doesNotMatch(html,/画像未確認/);}
  else{assert.match(html,/class="talent-avatar"/);assert.doesNotMatch(require('../lib/talent-details').avatar(talent),/<img /);}
  assert.deepEqual(fixture,before);
 }
 for(const invalid of [{...image,url:'http://images.example/avatar.png'},{...image,url:'javascript:alert(1)'},{...image,url:'https://images.example/avatar.png?token=secret'}]){
  talent.profileImage=invalid;assert.throws(()=>require('../lib/talents').validateTalents(fixture));
 }
});
