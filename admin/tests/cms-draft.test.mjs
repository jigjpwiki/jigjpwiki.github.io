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

test("saving separate drafts retains both batches and discarding one retains the other", async () => {
  const { draftGroups, writeDraft } = await import("../src/cms-draft.mjs");
  const first = writeDraft([], undefined, await prepareDraft(snapshot, member, event));
  const second = writeDraft(first.operations, undefined, await prepareDraft(snapshot, member, {
    ...event, title: "別のイベント試験",
  }));
  const groups = draftGroups(second.operations);
  assert.equal(groups.size, 2);
  assert.equal(groups.get(first.id)[0].value.title, event.title);
  const kept = writeDraft(second.operations, first.id);
  assert.deepEqual([...draftGroups(kept.operations).keys()], [second.id]);
  const changed = first.operations.map((op) => ({ ...op, before: { title: "別の編集者による変更" } }));
  assert.throws(() => writeDraft(first.operations, first.id, changed), /main_changed_reload/);
});

test("editing the amount of a standalone listing preserves its existing currency", async () => {
  const models = structuredClone(fixture);
  const { products, offers } = models.goods;
  const product = products[0];
  const offer = offers.find((row) => row.productId === product.id);
  offer.campaignId = null;
  offer.price = { amount: 10, currency: "USD" };
  const operations = await prepareDraft({ ...snapshot, models }, member, {
    sha: snapshot.sha, entity: "product", id: product.id, title: product.title,
    image: product.image || "", identityUrl: product.identityUrl,
    url: offer.url, price: "12.50",
  });
  assert.deepEqual(operations[1].value.price, { amount: 12.5, currency: "USD" });
});

test("anniversary drafts restore date fields and reject people outside the assigned scope", async () => {
  const editor = { ...member, scope: { ...member.scope, categories: ["anniversaries"] } };
  const input = { sha: snapshot.sha, entity: "anniversary", talent: "tal-000010",
    title: "試験記念日", kind: "other", month: "5", day: "12", year: "" };
  const operations = await prepareDraft(snapshot, editor, input);
  assert.equal(draftInput({ operations }).month, "5");
  await assert.rejects(prepareDraft(snapshot, editor, { ...input, talent: "tal-000001" }), /cms_scope_denied/);
});

test("event performer changes reject out of scope references", async () => {
  const operations = await prepareDraft(snapshot, member, { ...event, performers: ["tal-000010"] });
  assert.deepEqual(operations[0].value.talentIds, ["tal-000010"]);
  await assert.rejects(prepareDraft(snapshot, member, { ...event, performers: ["tal-000001"] }), /cms_scope_denied/);
});

test("campaign and sale references survive saving and restore", async () => {
  const { writeDraft, draftGroups } = await import("../src/cms-draft.mjs");
  const input = { sha: snapshot.sha, entity: "product", talent: "tal-000010",
    title: "キャンペーン商品試験", image: "", identityUrl: "https://example.com/product",
    url: "https://example.com/sale", price: "1200", campaignTitle: "キャンペーン試験" };
  const saved = writeDraft([], undefined, await prepareDraft(snapshot, member, input));
  const group = draftGroups(saved.operations).get(saved.id);
  assert.equal(group[1].value.productId, "@" + group[0].key);
  assert.equal(group[1].value.campaignId, "@" + group[2].key);
  assert.equal(draftInput({ operations: group }).campaignTitle, input.campaignTitle);
  await prepareDraft(snapshot, member, { ...input, campaignTitle: "", campaignId: "campaign-000001" });
});

test("campaign publication checks the original campaign before adding a product", async () => {
  const { publicationPlan } = await import("../src/cms-publish.mjs");
  const { writeDraft } = await import("../src/cms-draft.mjs");
  const editor = { ...member, directPublish: true };
  const input = { sha: snapshot.sha, entity: "product", talent: "tal-000010",
    title: "公開計画試験", image: "", identityUrl: "https://example.com/product",
    url: "https://example.com/sale", price: "1200", startsAt: "2027-01-01T10:00" };
  for (const target of [{ campaignTitle: "新規試験" }, { campaignId: "campaign-000001" }]) {
    const operations = writeDraft([], undefined, await prepareDraft(snapshot, editor, { ...input, ...target })).operations;
    const job = { id: "test", owner: "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026", operations };
    const { plan } = await publicationPlan(snapshot, job, editor);
    assert.equal(plan.files.goods.offers.at(-1).startsAt, "2027-01-01T01:00:00.000Z");
    if (target.campaignId) {
      const models = structuredClone(snapshot.models);
      models.goods.offers = models.goods.offers.filter((offer) => offer.campaignId !== target.campaignId);
      await assert.rejects(prepareDraft({ ...snapshot, models }, editor, { ...input, ...target }), /cms_scope_denied/);
      await assert.rejects(publicationPlan({ ...snapshot, models }, job, editor), /cms_scope_denied/);
    }
  }
});
