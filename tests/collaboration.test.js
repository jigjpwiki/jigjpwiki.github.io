'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const c=require('../lib/collaboration');
const person=(n,name,accounts=[],extra={})=>({id:'tal-'+String(n).padStart(6,'0'),displayName:name,accounts,aliases:[],visibility:'public',...extra});
const a='UC'+'a'.repeat(22),b='UC'+'b'.repeat(22);
const people=[person(1,'配信太郎',[{service:'youtube',accountId:a,url:'https://www.youtube.com/channel/'+a}]),person(2,'花晴りら',[{service:'youtube',accountId:b,url:'https://www.youtube.com/channel/'+b},{service:'x',accountId:'Lira',url:'https://x.com/Lira'}],{profileImage:{url:'/assets/face/lira.png'}}),person(3,'花晴りら子'),person(4,'星空ユウ',[{service:'youtube',accountId:null,url:'https://www.youtube.com/@星空ユウ'}]),person(5,'非公開タレント',[],{visibility:'draft'}),person(6,'なる'),person(7,'同名さん'),person(8,'同名さん'),person(9,'Alice')];
const idx=c.index(people),host={name:'配信太郎',youtubeid:a,title:'雑談'};
test('title exact full names, owner exclusion, longest name and ambiguity',()=>{
  const row=c.project({...host,title:'配信太郎・花晴りら子・花晴りら・同名さん・なる・Malice・非公開タレント'},'youtube',idx);
  assert.deepEqual(row.collaborators.map(p=>p.id),['tal-000003','tal-000002']);
  assert(!c.project({...host,title:'なるだけ'},'youtube',idx).collaborators);
  assert(!c.project({...host,name:'不明',youtubeid:'unknown',title:'花晴りら'},'youtube',idx).collaborators);
});
test('known account links canonicalize without fuzzy or unsafe URL matching',()=>{
  assert.equal(c.accountKey('https://m.youtube.com/channel/'+b+'/streams?si=123'),'youtube:'+b);
  assert.equal(c.accountKey('https://youtube.com/@%E6%98%9F%E7%A9%BA%E3%83%A6%E3%82%A6'),'youtube:@星空ユウ');
  assert.equal(c.accountKey('https://twitter.com/LIRA?s=20'),'x:lira');
  assert.equal(c.accountKey('https://x.com/Lira/status/123'),null);
  assert.equal(c.accountKey('https://x.com.evil.example/Lira'),null);
  assert.equal(c.accountKey('https://user@x.com/Lira'),null);
});
test('participant description blocks accept verified URLs and names, not promo links',()=>{
  const desc='【コラボ相手】\n配信太郎\nhttps://twitter.com/LIRA\n星空ユウ https://youtube.com/@星空ユウ\n\n【おすすめ】\n花晴りら子\nhttps://x.com/Lira';
  assert.deepEqual(c.collected(host,'youtube',desc,idx),['tal-000002','tal-000004']);
  assert.deepEqual(c.collected(host,'youtube','登録お願いします https://x.com/Lira',idx),[]);
  assert.deepEqual(c.collected({...host,title:'コラボ'},'youtube','花晴りら https://x.com/Lira',idx),['tal-000002']);
});
test('public feed strips evidence, filters unknown and hidden IDs and excludes host',()=>{
  const row=c.project({...host,title:'花晴りら',descriptionPartnerIds:['tal-000001','tal-000002','tal-000004','tal-000005','tal-999999'],collaborators:[{id:'bogus'}]},'youtube',idx);
  assert.deepEqual(row.collaborators,[{id:'tal-000002',name:'花晴りら',image:'/assets/face/lira.png'},{id:'tal-000004',name:'星空ユウ',image:null}]);
  assert(!Object.hasOwn(row,'descriptionPartnerIds'));
});
