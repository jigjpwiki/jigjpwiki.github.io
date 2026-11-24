import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../../tests/fixtures/admin-vnext-baseline.json" with { type: "json" };
import { draftDetails, draftGroups, draftInput, prepareDraft, writeDraft } from "../src/cms-draft.mjs";
import { publicationPlan } from "../src/cms-publish.mjs";

const snapshot = { sha: "test-main", models: fixture };
const editor = { role: "editor", directPublish: true, scope: { organizations: ["org-000003"], categories: ["goods"] } };
const job = (operations) => ({ id: "goods-test", owner: "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026", operations });
const resale = {
  key: "cms-sale-new-resale", campaignId: "campaign-000001",
  url: "https://example.com/resale", price: "4100", startsAt: "2027-01-01T10:00", endsAt: "",
};

test("a resale preserves the original published offer and restores both sale rows", async () => {
  const id = "product-000001";
  const original = fixture.goods.offers.find((offer) => offer.productId === id);
  const input = { ...draftDetails(snapshot, editor, "product", id), sha: snapshot.sha, entity: "product", id };
  input.sales.push(resale);
  const saved = writeDraft([], undefined, await prepareDraft(snapshot, editor, input));
  const restored = draftInput({ operations: draftGroups(saved.operations).get(saved.id) });
  assert.deepEqual(restored.sales.map((row) => row.url), [original.url, resale.url]);
  assert.equal(restored.sales[1].key, resale.key);

  const { plan } = await publicationPlan(snapshot, job(saved.operations), editor);
  const offers = plan.files.goods.offers.filter((row) => row.productId === id);
  assert.equal(offers.length, 2);
  assert.deepEqual(offers.find((row) => row.id === original.id), original);
  assert.equal(offers.find((row) => row.url === resale.url).startsAt, "2027-01-01T01:00:00.000Z");
});

test("a new campaign can be drafted with multiple sales and resolved against one campaign", async () => {
  const sales = [resale, { ...resale, key: "cms-sale-new-later", url: "https://example.com/later" }];
  const input = { entity: "product", sha: snapshot.sha, title: "複数販売枠の試験",
    talent: "tal-000010", image: "", identityUrl: "https://example.com/product", campaignTitle: "試験企画", sales };
  const saved = writeDraft([], undefined, await prepareDraft(snapshot, editor, input));
  const { plan } = await publicationPlan(snapshot, job(saved.operations), editor);
  const campaign = plan.files.goods.campaigns.at(-1);
  const product = plan.files.goods.products.at(-1);
  const offers = plan.files.goods.offers.filter((row) => row.campaignId === campaign.id);
  assert.equal(campaign.title, input.campaignTitle);
  assert.deepEqual(offers.map((row) => row.url), sales.map((row) => row.url));
  assert.ok(offers.every((row) => row.productId === product.id));
});

test("sales cannot edit an offer belonging to a different product", async () => {
  const id = "product-000001";
  const input = { ...draftDetails(snapshot, editor, "product", id), entity: "product", sha: snapshot.sha, id };
  const otherSale = fixture.goods.offers.find((row) => row.productId !== id);
  input.sales = [{ ...resale, id: otherSale.id }];
  await assert.rejects(prepareDraft(snapshot, editor, input), /cms_scope_denied/);
});
