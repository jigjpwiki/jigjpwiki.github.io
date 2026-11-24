import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../../tests/fixtures/admin-vnext-baseline.json" with { type: "json" };
import { prepareDraft, draftInput } from "../src/cms-draft.mjs";

const member = { role: "editor", scope: { organizations: ["org-000003"], categories: ["events", "goods"] } };
const snapshot = { sha: "test-main", models: fixture };
const event = {
  sha: snapshot.sha, entity: "event", organization: "org-000003", title: "イベント試験",
  venue: "", summary: "説明", announcementUrl: "https://example.com/event",
};

test("event drafts use the existing validation and reject stale or foreign writes", async () => {
  const operations = await prepareDraft(snapshot, member, event);
  assert.equal(draftInput({ operations }).title, event.title);
  assert.equal(operations[0].value.visibility, "public");
  await assert.rejects(prepareDraft(snapshot, member, { ...event, sha: "stale" }), /main_changed_reload/);
  await assert.rejects(prepareDraft(snapshot, member, { ...event, organization: "org-000001" }), /cms_scope_denied/);
  await assert.rejects(prepareDraft(snapshot, { ...member, role: "viewer" }, event), /cms_scope_denied/);
});

test("standalone goods and sale information are prepared as one validated set", async () => {
  const operations = await prepareDraft(snapshot, member, {
    sha: snapshot.sha, entity: "product", talent: "tal-000010", title: "商品試験",
    image: "", identityUrl: "https://example.com/product", url: "https://example.com/sale", price: "1200",
  });
  assert.deepEqual(operations.map((op) => op.entity), ["product", "offer"]);
  assert.equal(draftInput({ operations }).price, "1200");
  assert.equal(operations[1].value.productId, "@cms-product");
});
