'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {externalLinkAttrs}=require('../lib/site-pages');
const {thumbnail}=require('../lib/content-components');
test('external web destinations open safely in a new tab; internal navigation stays in place',()=>{
 for(const href of ['https://youtube.com/watch?v=abcdefghijk','https://wikiwiki.jp/jigjp/','https://store.example/products/a','//example.org/','http://example.org/','https://jigdule.jp.example.org/']){
  assert.equal(externalLinkAttrs(href),' target="_blank" rel="noopener noreferrer"');
 }
 for(const href of ['/talents/tal-000001/','?category=products','#profile-music','https://www.jigdule.jp/music/','https://jigdule.jp/goods/','mailto:info@example.org','javascript:void(0)']){
  assert.equal(externalLinkAttrs(href),'');
 }
 const v={youtubeId:'abcdefghijk',availability:'public',title:'動画'};
 assert.match(thumbnail(v,'https://www.youtube.com/watch?v=abcdefghijk'),/target="_blank" rel="noopener noreferrer"/);
 assert.doesNotMatch(thumbnail(v,'/music/karaoke/karaoke-000001/'),/target=|noopener/);
});
