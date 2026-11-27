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

test('reported QZB2DmdUlCc: blank-separated collaboration members, channel-ID registrations and handle links',()=>{
  const participants=[
    person(44,'愛乃宮ゆめ',[{service:'youtube',accountId:'UCttSjPiwPYpiPuCrgxK7c1g',url:'https://www.youtube.com/channel/UCttSjPiwPYpiPuCrgxK7c1g'}]),
    person(70,'藤森ちとせ',[{service:'youtube',accountId:'UCAhdxmsdngH4noySdpVAVWQ',url:'https://www.youtube.com/channel/UCAhdxmsdngH4noySdpVAVWQ'}]),
    person(28,'堂下さとり',[{service:'youtube',accountId:'UCBq6MSUL-Ermvnoj3PtX7Iw',url:'https://www.youtube.com/channel/UCBq6MSUL-Ermvnoj3PtX7Iw'}]),
    person(1,'別の配信者',[{service:'x',accountId:'other',url:'https://x.com/other'}])
  ];
  const index=c.index(participants);
  const row={videoId:'QZB2DmdUlCc',name:'愛乃宮ゆめ',youtubeid:'UCttSjPiwPYpiPuCrgxK7c1g',title:'【マイクラ/コラボ】海底神殿とやらに行きたいと思います！シーグラタン！！【愛乃宮ゆめ/パレデミア学園】'};
  // Reconstructed from the reported screenshot, not the full raw API description.
  const description='コラボメンバー\n\n藤森ちとせ\nhttps://www.youtube.com/@藤森ちとせ\n\n堂下さとり\nhttps://www.youtube.com/@堂下さとり\n\n来てくれてありがとう🫶\n別の配信者 https://x.com/other';
  const ids=c.collected(row,'youtube',description,index);
  assert.deepEqual(ids,['tal-000070','tal-000028']);
  assert.deepEqual(c.project({...row,descriptionPartnerIds:ids},'youtube',index).collaborators.map(p=>p.name),['藤森ちとせ','堂下さとり']);
});
test('blank-separated sections do not absorb promotions or unrelated prose',()=>{
  const cases=[
    'コラボメンバー\n花晴りら\n\n【おすすめ】\n花晴りら子',
    'コラボメンバー\n花晴りら\n\n今日は花晴りら子の動画も見てね\n花晴りら子',
    'コラボメンバー\n花晴りら\n\n来てくれてありがとう\n花晴りら子',
    'コラボメンバー\n花晴りら\n\n告知\n花晴りら子'
  ];
  for(const desc of cases)assert.deepEqual(c.collected(host,'youtube',desc,idx),['tal-000002'],desc);
});
test('blank-separated exact name and verified profile-only entries continue the section',()=>{
  assert.deepEqual(c.collected(host,'youtube','コラボメンバー\n花晴りら\n\n星空ユウさん\n\nhttps://x.com/Lira\n\n【告知】\n花晴りら子',idx),['tal-000002','tal-000004']);
});

test('reported WfbgMqueZsE: cohort subtitle, blank line and inline mentions',()=>{
  const p=[person(28,'堂下さとり'),person(44,'愛乃宮ゆめ'),person(70,'藤森ちとせ')],index=c.index(p);
  const d='マイクラ初心者！！お手柔らかにお願いします\n\nコラボメンバー\nパレデミア学園１期生\n\n愛乃宮ゆめちゃん→ @愛乃宮ゆめ\n藤森ちとせちゃん→ @藤森ちとせ\n\n°△ ─── △°\n\n新人VTuberの堂下さとりです';
  assert.deepEqual(c.collected({name:'堂下さとり',title:'【コラボ】海底神殿へ！マイクラ'},'youtube',d,index),['tal-000044','tal-000070']);
});
test('reported DrjT0Q_L0AE: star-decorated collaboration heading',()=>{
  const index=c.index([person(59,'牡丹雪'),person(57,'灯野ぺけ。')]);
  const d='オタクの意見100%でお届けします\n\n★コラボ相手★\n灯野ぺけ。 https://youtube.com/@灯野ぺけまる\nX(旧Twitter)：@hino_pekemaru\n\n応援団長！なグッズが発売中です！！';
  assert.deepEqual(c.collected({name:'牡丹雪',title:'【同時視聴】ぶいかふぇ'},'youtube',d,index),['tal-000057']);
});
test('reported keCDN4Lf0mw: isolated exact name + mention with a co-watch title',()=>{
  const index=c.index([person(59,'牡丹雪'),person(57,'灯野ぺけ。'),person(1,'別の配信者')]);
  const d='配信見に来てくれてありがちょ\nパレデミア学園ミュウ寮在籍中の灯野ぺけ。だよん\n\n目指せch登録者さん2000人！\nぜひ応援よろぴこまる〜\n\n牡丹雪\n@botan_setu\n\n｡･:*ﾟ\n\n【おすすめ】\n\n別の配信者\n@other';
  const row={name:'灯野ぺけ。',title:'【ぶいかふぇ♪Vol.325アーカイブ同時視聴】雪子と見ていく！'};
  assert.deepEqual(c.collected(row,'youtube',d,index),['tal-000059']);
  assert.deepEqual(c.collected({...row,title:'雑談'},'youtube',d,index),[]);
  assert.deepEqual(c.collected(row,'youtube','【おすすめ】\n\n牡丹雪\n@botan_setu',index),[]);
});
test('reported 88mMnaaYWmc: configured official organization and explicit member archive list',()=>{
  const names=['暁月クララ','七海ロナ','常磐カナメ','藤宮コトハ','江波キョウカ','鬼多見アユム','香鳴ハノン','夏渚まはろ'];
  const org='org-000003',channel='UC_cCW1xmXwRFp1tX-RD2X1Q';
  const people=names.map((n,i)=>person(i+1,n,[],{affiliations:[{organizationId:org,status:'current'}]}));
  people.push(person(20,'別の配信者',[],{affiliations:[{organizationId:'org-000002',status:'current'}]}));
  const index=c.index(people,{organizations:[{id:org,name:'Palette Project'}],youtubeStreamers:[{name:'Palette Project',youtubeChannelId:channel}]});
  const row={name:'Palette Project',youtubeid:channel,title:'【感謝の最終回】メンバーが選ぶパレプロEXの名シーンを見よう!!'};
  const list=names.map((n,i)=>n+'\nhttps://www.youtube.com/watch?v='+String(i).repeat(11)).join('\n');
  const d='公式番組 パレプロEX\n\nメンバーが選んだ配信のアーカイブはこちら！\n'+list+'\n別の配信者\nhttps://youtu.be/abcdefghijk\n\n----------------\nPalette Project OFFICIAL STORE';
  const ids=c.collected(row,'youtube',d,index);
  assert.equal(ids.length,8);
  assert.deepEqual(c.project({...row,descriptionPartnerIds:ids},'youtube',index).collaborators.map(p=>p.name),names);
  assert.deepEqual(c.collected({...row,youtubeid:'UC'+'z'.repeat(22)},'youtube',d,index),[]);
  assert.deepEqual(c.collected(row,'youtube','おすすめ動画\n'+list,index),[]);
});

test('reported 88mMnaaYWmc: mixed watch paths and short IDs, all eight entries',()=>{
  const names=['暁月クララ','七海ロナ','常磐カナメ','藤宮コトハ','江波キョウカ','鬼多見アユム','香鳴ハノン','夏渚まはろ'];
  const org='org-000003',channel='UC_cCW1xmXwRFp1tX-RD2X1Q';
  const people=names.map((n,i)=>person(i+1,n,[],{affiliations:[{organizationId:org,status:'current'}]}));
  people.push(person(20,'別の配信者',[],{affiliations:[{organizationId:org,status:'current'}]}));
  const index=c.index(people,{organizations:[{id:org,name:'Palette Project'}],youtubeStreamers:[{name:'Palette Project',youtubeChannelId:channel}]});
  const row={name:'Palette Project',youtubeid:channel,title:'メンバーが選ぶパレプロEXの名シーン'};
  const refs=['https://www.youtube.com/watch/xf28wSL','https://www.youtube.com/watch?v=imTt02pAGQo','https://www.youtube.com/watch/AnRoOIw','https://www.youtube.com/watch/NuEHEOeuxu','https://www.youtube.com/watch/WxV1K-M','https://www.youtube.com/watch/Rt0Rcg9','https://www.youtube.com/watch/Jh9lgLy','https://www.youtube.com/watch/rf7RWPc'];
  const intro='🎨歌って踊るバーチャルアイドル「Palette Project」公式番組「パレプロEX」✨\n\nメンバーが選んだ配信のアーカイブはこちら！\n';
  const suffix='\n-------------------------------\nPalette Project OFFICIAL STORE\nhttps://store.paletteproject.jp/\n\nチャンネル登録&Xフォローよろしくお願いします！\n別の配信者\nhttps://www.youtube.com/watch?v=abcdefghijk';
  const plain=names.map((n,i)=>n+'\n'+refs[i]).join('\n');
  const expected=people.slice(0,8).map(p=>p.id);
  assert.deepEqual(c.collected(row,'youtube',intro+plain+suffix,index),expected);
  const copied=names.map((n,i)=>n+' [動画'+i+']('+refs[i]+')'+(i===1?' ([image](https://www.gstatic.com/youtube/img/watch/yt_favicon_ringo2.png))':'')).join(' ');
  assert.deepEqual(c.collected(row,'youtube',(intro+copied+suffix).replace(/\n/g,' '),index),expected);
  const broken=names.map((n,i)=>n+'\n'+(i===3?'https://example.org/broken':refs[i])).join('\n');
  assert.deepEqual(c.collected(row,'youtube',intro+broken+suffix,index),expected.filter((_,i)=>i!==3));
  const absent=names.map((n,i)=>n+(i===3?'':'\n'+refs[i])).join('\n');
  assert.deepEqual(c.collected(row,'youtube',intro+absent+suffix,index),expected.filter((_,i)=>i!==3));
  assert.deepEqual(c.collected(row,'youtube','おすすめ動画\n'+plain,index),[]);
});
