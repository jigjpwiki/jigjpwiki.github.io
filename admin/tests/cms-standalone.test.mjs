import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../../tests/fixtures/admin-vnext-baseline.json" with { type: "json" };
import { prepareDraft, draftDetails, draftInput } from "../src/cms-draft.mjs";

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
    assert.equal(JSON.stringify(fixture), JSON.stringify(snapshot.models));
    await assert.rejects(prepareDraft(snapshot, { ...member, role: "viewer" }, input), /cms_scope_denied/);
  });
}
