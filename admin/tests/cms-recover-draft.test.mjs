import test from "node:test";
import assert from "node:assert/strict";
import { recoverAppliedGroup } from "../src/cms-recover-draft.mjs";
import { threeWay } from "../src/submission-plan.mjs";

const product = {
  entity: "product", key: "cms-product", baseCommit: "main",
  before: null, value: { title: "マグ" },
};
const sale = {
  entity: "offer", key: "cms-sale", baseCommit: "main", before: null,
  value: { productId: "@cms-product", url: "https://example.com/original" },
  parent: { entity: "product", reference: "@cms-product" },
};
const published = { sha: "a".repeat(40), models: { goods: {
  products: [{ ...product.value, id: "product-000001" }],
  offers: [{ ...sale.value, productId: "product-000001", id: "offer-000001" }],
} } };
const job = { commit: published.sha, mainConfirmed: true, createdRecords: [
  { key: product.key, entity: product.entity, id: "product-000001" },
  { key: sale.key, entity: sale.entity, id: "offer-000001" },
] };
const edited = [product, { ...sale, value: { ...sale.value, url: "https://example.com/changed" } }];

test("recover a related edit against the confirmed fixed IDs and keep later conflicts visible", () => {
  const [item, offer] = recoverAppliedGroup(edited, [product, sale], job, published);
  assert.equal(item.id, "product-000001");
  assert.equal(offer.value.id, "offer-000001");
  assert.equal(offer.value.productId, item.id);
  assert.equal(offer.parent.reference, item.id);
  assert.equal(offer.before.url, "https://example.com/original");
  assert.equal(offer.value.url, "https://example.com/changed");
  const latest = { ...offer.before, url: "https://example.com/later" };
  assert.equal(threeWay(offer.before, offer.value, latest).conflicts[0].field, "/url");
});

test("keep drafts protected if publication or operation identity cannot be proven", () => {
  assert.equal(recoverAppliedGroup(edited, [product, sale], { ...job, mainConfirmed: false }, published), null);
  assert.equal(recoverAppliedGroup(edited, [product, sale], job, { ...published, sha: "b".repeat(40) }), null);
  assert.equal(recoverAppliedGroup([product], [product, sale], job, published), null);
  assert.equal(recoverAppliedGroup(edited, [product, sale], { ...job, createdRecords: [job.createdRecords[0]] }, published), null);
});
