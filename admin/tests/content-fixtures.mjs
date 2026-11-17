import fs from "node:fs";
import { readFiles, filePath } from "../src/github.mjs";
import { hash } from "../src/security.mjs";
import { forms, preview } from "../src/model.mjs";
import { initialContent } from "../public/content-utils.js";
export const snapshot = () => ({
  sha: "main-sha",
  tree: "main-tree",
  models: Object.fromEntries(
    readFiles.map((n) => [
      n,
      JSON.parse(
        fs.readFileSync(new URL("../../" + filePath(n), import.meta.url)),
      ),
    ]),
  ),
});
// Resolve relative to repository rather than tests/ for copied runners.
export const draft = (entity, values = {}) => ({
  ...initialContent(entity, forms.content.schemas[entity]),
  ...values,
});
export const op = (entity, key, values = {}, extra = {}) => ({
  entity,
  key,
  value: draft(entity, values),
  ...extra,
});
export async function input(s, operations) {
  const value = { operations };
  return {
    sha: s.sha,
    entity: "content",
    action: "batch",
    value,
    reason: "モック環境で確認した内容",
    confirmation: { status: "confirmed", valueHash: await hash(value) },
  };
}
export const plan = async (s, operations) =>
  preview(s, await input(s, operations), { actor: "123" });
export const video = () =>
  op("video", "video", {
    youtubeId: "NEWVIDEO001",
    channelId: "UCXI0W_Os-BCIngpCb1YnOow",
    title: "検証用の動画",
    visibility: "public",
  });
export const campaign = (id = null) => [
  ...(id
    ? []
    : [
        op("campaign", "campaign", {
          title: "検証用キャンペーン",
          visibility: "public",
        }),
      ]),
  op(
    "product",
    "product",
    { title: "検証用商品", talentIds: ["tal-000010"], visibility: "public" },
    { parent: { entity: "campaign", reference: id || "@campaign" } },
  ),
  op(
    "offer",
    "offer",
    {
      productId: "@product",
      campaignId: id || "@campaign",
      price: { amount: 1000, currency: "JPY" },
      url: "https://store.example/item",
      status: "unknown",
      visibility: "public",
    },
    { parent: { entity: "product", reference: "@product" } },
  ),
];
