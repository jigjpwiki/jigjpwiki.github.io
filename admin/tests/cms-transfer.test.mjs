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
  const id=fixture.catalog.groups[0].id;
  const input={sha:snapshot.sha,entity:"group",mode:"update",rows:[{id,name:"一括変更グループ",visibility:"draft"}]};
  const out=await prepareTransfer(snapshot,member,input);
  assert.equal(out.operations.length,1);assert.equal(out.operations[0].value.name,"一括変更グループ");assert.equal(out.operations[0].value.visibility,"draft");
  await assert.rejects(prepareTransfer(snapshot,member,input,out.operations),/cms_bulk_existing_draft/);
});
