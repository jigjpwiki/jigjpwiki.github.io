import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../../tests/fixtures/admin-vnext-baseline.json" with { type: "json" };
import { publicationPlan } from "../src/cms-publish.mjs";
import { prepareDraft, draftDetails, draftInput, prepareBulkDrafts } from "../src/cms-draft.mjs";

const snapshot = { sha: "a".repeat(40), models: fixture };
const member = { role: "editor", contentPolicy: "all-content-v1", directPublish: true };

for (const [entity, id, changes] of [
  ["organization", fixture.talents.organizations[0].id, { name: "事務所名の更新" }],
  ["group", fixture.catalog.groups[0].id, { name: "グループ名の更新" }],
  ["offer", fixture.goods.offers[0].id, { periodNote: "再確認した販売条件" }],
  ["performance", fixture.karaoke.performances[0].id, { rawLabel: "確認済みの曲名表記" }],
]) {
  test(entity + " standalone editing retains unrelated data and roundtrips the draft", async () => {
    const input = { entity, id, sha: snapshot.sha, ...draftDetails(snapshot, member, entity, id), ...changes };
    const operations = await prepareDraft(snapshot, member, input);
    assert.equal(operations.length, 1);
    assert.equal(operations[0].id, id);
    for (const [key, value] of Object.entries(changes)) assert.equal(operations[0].value[key], value);
    const restored = draftInput({ operations });
    assert.equal(restored.entity, entity);
    assert.equal(restored.id, id);
    const job = { id: "standalone-" + entity, owner: "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026",
      createdAt: "2026-11-25T00:00:00Z", operations };
    const { plan } = await publicationPlan(snapshot, job, member);
    assert.equal(plan.impact.records.length, 1);
    assert.equal(plan.impact.records[0].id, id);
    assert.equal(JSON.stringify(fixture), JSON.stringify(snapshot.models));
    await assert.rejects(prepareDraft(snapshot, { ...member, role: "viewer" }, input), /cms_scope_denied/);
  });
}

test("new standalone organization and group use reservations without changing source records", async () => {
  const before = JSON.stringify(fixture);
  for (const input of [
    { entity: "organization", name: "新規事務所" },
    { entity: "group", name: "新規グループ", organizationId: fixture.talents.organizations[0].id, talentIds: [] },
  ]) {
    const operations = await prepareDraft(snapshot, member, { sha: snapshot.sha, ...input });
    assert.equal(operations[0].id, undefined);
    assert.equal(operations[0].value.name, input.name);
  }
  assert.equal(JSON.stringify(fixture), before);
});

test("standalone sales and performances cannot point at unknown parents", async () => {
  await assert.rejects(prepareDraft(snapshot, member, {
    entity: "offer", sha: snapshot.sha, productId: "product-999999",
    url: "https://example.com/shop", price: "100", currency: "JPY",
  }), /cms_scope_denied/);
  await assert.rejects(prepareDraft(snapshot, member, {
    entity: "performance", sha: snapshot.sha, karaokeId: "karaoke-999999", rawLabel: "歌唱",
  }), /cms_scope_denied/);
});

test("shared editor can change record visibility using the existing validated draft and publication path", async () => {
  const entity = "anniversary", id = fixture.anniversaries.events[0].id;
  const input = { entity, id, sha: snapshot.sha, ...draftDetails(snapshot, member, entity, id), visibility: "draft" };
  const operations = await prepareDraft(snapshot, member, input);
  assert.equal(operations[0].value.visibility, "draft");
  assert.equal(draftInput({ operations }).visibility, "draft");
  const { plan } = await publicationPlan(snapshot, { id: "visibility", owner: "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026", createdAt: "2026-11-25T00:00:00Z", operations }, member);
  assert.equal(plan.files.anniversaries.events.find((row) => row.id === id).visibility, "draft");
  const scoped = { role: "editor", scope: { organizations: ["org-000001"], categories: ["anniversaries"] } };
  await assert.rejects(prepareDraft(snapshot, scoped, input), /cms_scope_denied/);
  await assert.rejects(prepareDraft(snapshot, member, { ...input, visibility: "private" }), /cms_invalid_input/);
});
test("existing related talent selections roundtrip without changing other fields", async () => {
  const entity = "anniversary", id = fixture.anniversaries.events[0].id;
  const original = fixture.anniversaries.events[0];
  const input = { entity, id, sha: snapshot.sha, ...draftDetails(snapshot, member, entity, id), talentIds: [fixture.talents.talents[1].id] };
  const operations = await prepareDraft(snapshot, member, input);
  assert.deepEqual(operations[0].value.talentIds, input.talentIds);
  assert.deepEqual(operations[0].value.date, original.date);
  assert.deepEqual(draftInput({ operations }).talentIds, input.talentIds);
  await assert.rejects(prepareDraft(snapshot, member, { ...input, talentIds: ["invalid"] }), /cms_invalid_input/);
});

test("bulk editing stages independent drafts atomically and protects existing operations", async () => {
  const ids = fixture.talents.talents.slice(0, 2).map((row) => row.id);
  const input = { sha: snapshot.sha, entity: "talent", ids, field: "activity", value: "hiatus" };
  const result = await prepareBulkDrafts(snapshot, member, input);
  assert.ok(result.draftIds.length > 0);
  assert.equal(result.draftIds.length, result.operations.length);
  for (const op of result.operations) {
    assert.deepEqual(op.value, { ...op.before, activityStatus: { value: "hiatus" } });
    assert.equal(draftInput({ operations: [op] }).activity, "hiatus");
  }
  await assert.rejects(prepareBulkDrafts(snapshot, member, input, result.operations), /cms_bulk_existing_draft/);
  await assert.rejects(prepareBulkDrafts(snapshot, { ...member, role: "viewer" }, input), /cms_scope_denied/);
  await assert.rejects(prepareBulkDrafts(snapshot, member, { ...input, field: "accounts" }), /cms_invalid_bulk/);
  await assert.rejects(prepareBulkDrafts(snapshot, member, { ...input, ids: [ids[0], "tal-999999"] }), /cms_scope_denied/);
});

test("all-content editors retain affiliations and fixed collection identities while editing history", async () => {
  const record = fixture.talents.talents[0], entity = "talent", id = record.id;
  const fields = draftDetails(snapshot, member, entity, id);
  const input = { entity, id, sha: snapshot.sha, ...fields, affiliations: [
    { ...record.affiliations[0], status: "former", to: "2026-11-01" },
    { organizationId: fixture.talents.organizations[1].id, status: "current", from: "2026-11-02", to: null },
  ], agencyState: "affiliated", tiktokUrl: "https://www.tiktok.com/@test.jigdule" };
  const [operation] = await prepareDraft(snapshot, member, input);
  assert.deepEqual(operation.value.affiliations, input.affiliations);
  assert.deepEqual(operation.value.accounts.filter((row) => row.service !== "tiktok"), record.accounts);
  assert.ok(operation.value.accounts.some((row) => row.service === "tiktok" && row.accountId === "test.jigdule"));
  assert.deepEqual(draftInput({ operations: [operation] }).affiliations, input.affiliations);
  await assert.rejects(prepareDraft(snapshot, member, { ...input, affiliations: input.affiliations.slice(1) }), /affiliation_history_must_be_retained/);
  await assert.rejects(prepareDraft(snapshot, member, { ...input, twitchUrl: "https://www.twitch.tv/another" }), /cms_identity_anchor/);
});

test("event thumbnail survives editing, draft reopen and publication, while omission preserves old data", async () => {
 const entity="event", record=fixture.events.events[0], id=record.id;
 const input={entity,id,sha:snapshot.sha,...draftDetails(snapshot,member,entity,id),thumbnailUrl:"https://images.example/event.jpg"};
 const ops=await prepareDraft(snapshot,member,input);
 assert.equal(ops[0].value.thumbnailUrl,input.thumbnailUrl);
 assert.equal(draftInput({operations:ops}).thumbnailUrl,input.thumbnailUrl);
 const {plan}=await publicationPlan(snapshot,{id:"event-thumb",owner:"8ebf4fde-85a4-4d34-9feb-d1ba5c4de026",createdAt:"2026-11-25T00:00:00Z",operations:ops},member);
 assert.equal(plan.files.events.events.find(row=>row.id===id).thumbnailUrl,input.thumbnailUrl);
 const next={...snapshot,models:{...snapshot.models,events:plan.files.events}};
 const details=draftDetails(next,member,entity,id);assert.equal(details.thumbnailUrl,input.thumbnailUrl);
 const {thumbnailUrl,...legacy}=details;
 const preserved=await prepareDraft(next,member,{...legacy,entity,id,sha:next.sha,title:record.title+" 更新"});
 assert.equal(preserved[0].value.thumbnailUrl,input.thumbnailUrl);
 const removed=await prepareDraft(next,member,{...input,thumbnailUrl:""});assert(!Object.hasOwn(removed[0].value,"thumbnailUrl"));
 await assert.rejects(prepareDraft(snapshot,member,{...input,thumbnailUrl:"javascript:alert(1)"}));
 await assert.rejects(prepareDraft(snapshot,{...member,role:"viewer"},input),/cms_scope_denied/);
});
