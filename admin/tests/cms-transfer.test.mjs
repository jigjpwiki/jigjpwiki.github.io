import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../../tests/fixtures/admin-vnext-baseline.json" with {type:"json"};
import {parseTransfer} from "../public/cms-transfer.js";
import {prepareTransfer} from "../src/cms-transfer.mjs";
const snapshot={sha:"a".repeat(40),models:fixture},member={role:"editor",contentPolicy:"all-content-v1",directPublish:true};
test("CSV and JSON transfer reject malformed data and preserve quoted multiline cells",()=>{
  assert.deepEqual(parseTransfer('title,artists,songIdentityUrl\r\n"曲,名","作者\n作曲者",https://example.com/song',"csv","song","create"),[{title:"曲,名",artists:"作者\n作曲者",songIdentityUrl:"https://example.com/song"}]);
  assert.throws(()=>parseTransfer("id,id\none,two","csv","talent","update"));
  assert.throws(()=>parseTransfer('[{"id":"x","accounts":[]}]',"json","talent","update"));
  assert.throws(()=>parseTransfer('title,artists\n"x,y',"csv","song","create"));
});
test("atomic transfer creates multiple draft groups without mutating the snapshot",async()=>{
  const before=JSON.stringify(fixture);
  const input={sha:snapshot.sha,entity:"organization",mode:"create",rows:[{name:"一括試験事務所A"},{name:"一括試験事務所B"}]};
  const out=await prepareTransfer(snapshot,member,input);
  assert.equal(out.draftIds.length,2);assert.equal(out.operations.length,2);
  assert.equal(JSON.stringify(fixture),before);
  await assert.rejects(prepareTransfer(snapshot,{...member,role:"viewer"},input),/cms_scope_denied/);
  await assert.rejects(prepareTransfer(snapshot,member,{...input,sha:"stale"}),/main_changed_reload/);
  await assert.rejects(prepareTransfer(snapshot,member,{...input,rows:[{name:"試験"},{id:"org-000001",name:"上書き"}]}),/cms_invalid_batch/);
});
test("multiple fields are changed in the same lossless draft",async()=>{
  const id=fixture.music.songs[0].id;
  const input={sha:snapshot.sha,entity:"song",mode:"update",rows:[{id,title:"一括変更楽曲",aliases:"一括試験の別名"}]};
  const out=await prepareTransfer(snapshot,member,input);
  assert.equal(out.operations.length,1);assert.equal(out.operations[0].value.title,"一括変更楽曲");assert.deepEqual(out.operations[0].value.aliases,["一括試験の別名"]);
  await assert.rejects(prepareTransfer(snapshot,member,input,out.operations),/cms_bulk_existing_draft/);
  await assert.rejects(prepareTransfer(snapshot,member,{sha:snapshot.sha,entity:"group",mode:"update",rows:[{id:fixture.catalog.groups[0].id,name:"一括変更グループ",visibility:"draft"}]}),/public reference to draft group/);
});

import { pageMetadata } from "../public/cms-transfer.js";
import { fetchOfficialMetadata } from "../src/cms-official.mjs";
test("metadata is inert and only trusted HTTPS origins are fetched",async()=>{
  const html='<html><head><title>Fallback</title><meta property="og:title" content="A &amp; B"><meta name="description" content="概要"><meta property="og:image" content="/image.png"><script>throw Error("never run")</script></head></html>';
  assert.deepEqual(pageMetadata(html,"https://paletteproject.jp/event"),{title:"A & B",description:"概要",image:"https://paletteproject.jp/image.png",url:"https://paletteproject.jp/event"});
  let calls=0;
  const transport=async(url,options)=>{calls++;assert.equal(url.hostname,"paletteproject.jp");assert.equal(options.redirect,"manual");return new Response(html,{headers:{"content-type":"text/html; charset=UTF-8"}})};
  const result=await fetchOfficialMetadata("https://paletteproject.jp/event","",transport);assert.equal(result.title,"A & B");
  for(const url of ["http://paletteproject.jp/","https://127.0.0.1/","https://paletteproject.jp.evil.test/","https://user@paletteproject.jp/"])await assert.rejects(fetchOfficialMetadata(url,"",transport),/cms_(invalid_source_url|source_host_not_allowed)/);
  assert.equal(calls,1);
  await assert.rejects(fetchOfficialMetadata("https://paletteproject.jp/event","",async()=>new Response(null,{status:302,headers:{Location:"https://evil.test/"}})),/cms_source_unavailable/);
});
