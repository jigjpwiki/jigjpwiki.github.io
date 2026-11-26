import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { chromium } from "../../node_modules/playwright/index.mjs";
import fixture from "../../tests/fixtures/admin-vnext-baseline.json" with { type: "json" };
import { draftGroups, draftInput, prepareDraft, writeDraft } from "../src/cms-draft.mjs";
import { publicationPlan } from "../src/cms-publish.mjs";
import { scopedCatalog } from "../src/cms-scope.mjs";

test("campaign batch survives reload and reaches publication planning through the simple CMS", async () => {
  const snapshot = { sha: "cms-browser-main", models: fixture };
  const member = { role: "editor", directPublish: true, scope: {
    organizations: ["org-000003"], categories: ["goods"],
  } };
  let operations = [], revision = 0, planned, editable = true, publication;
  const catalog = { categories: ["goods"], sections: scopedCatalog(fixture, member),
    people: [{ id: "tal-000010", name: "担当のタレント" }], sha: snapshot.sha, songs: [], organizations: [] };
  const getDrafts = () => ({
    revision, drafts: [...draftGroups(operations)].map(([draftId, group]) => ({
      draftId, input: draftInput({ operations: group }),
    })),
  });
  const assets = new Map(await Promise.all(["simple-cms.js", "cms-conflicts.js", "cms-history.js", "content-utils.js", "cms-transfer.js", "app.css", "workbench.css"].map(async (name) => [
    "/" + name, await readFile(new URL("../public/" + name, import.meta.url)),
  ])));
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === "/favicon.ico") return res.writeHead(204).end();
      if (assets.has(req.url)) {
        res.setHeader("content-type", req.url.endsWith(".js") ? "text/javascript" : "text/css");
        return res.end(assets.get(req.url));
      }
      if (req.url === "/") {
        res.setHeader("content-type", "text/html; charset=utf-8");
        return res.end(`<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width">
<link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/workbench.css">
<main><p id="status"></p><div id="cms"></div></main><script type="module">
import { mountSimpleCms } from "/simple-cms.js";
await mountSimpleCms(document.querySelector("#cms"), document.querySelector("#status"), async (path, method, body) => {
  const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
});
</script></html>`);
      }
      let result;
      if (req.url === "/api/cms/catalog") result = { ...catalog, editable, publishable: editable };
      else if (req.method === "GET" && req.url === "/api/cms/draft") result = getDrafts();
      else if (req.method === "GET" && req.url === "/api/cms/publication") result = { publication };
      else {
        assert.ok(editable);
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const input = JSON.parse(Buffer.concat(chunks));
        assert.equal(input.revision, revision);
        if (req.method === "PUT" && req.url === "/api/cms/draft") {
          const saved = writeDraft(operations, input.draftId, await prepareDraft(snapshot, member, input));
          operations = saved.operations;
          result = { draftId: saved.id, revision: ++revision };
        } else if (req.method === "POST" && req.url === "/api/cms/publication/preview") {
          assert.equal(input.revision, revision);
          assert.ok(input.draftIds.length);
          result = { sha: snapshot.sha, records: [{ name: "ブラウザー試験の企画", changes: [{ field: "title", before: null, after: "ブラウザー試験の企画" }] }], review: "browser-review" };
        } else if (req.method === "POST" && req.url === "/api/cms/publication") {
          assert.equal(input.review, "browser-review");
          const groups = draftGroups(operations);
          const selected = input.draftIds.flatMap((id) => groups.get(id));
          planned = await publicationPlan(snapshot, { id: "browser-goods", owner: "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026",
            operations: selected }, member);
          publication = { phase: "checking" };
          result = { publication };
        } else assert.fail("Unexpected API request " + req.url);
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
      console.error(error);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
  try {
    const url = "http://127.0.0.1:" + server.address().port;
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
    await page.goto(url);
    await page.getByRole("button", { name: "キャンペーンを新規登録" }).click();
    await page.getByLabel("名称", { exact: true }).fill("ブラウザー試験の企画");
    for (let i = 0; i < 2; i++) {
      if (i) await page.getByRole("button", { name: "商品を追加", exact: true }).click();
      const product = page.getByRole("group", { name: "新しい商品", exact: true }).nth(i);
      await product.getByLabel("商品名", { exact: true }).fill("商品 " + i);
      await product.getByLabel("公式商品情報URL").fill("https://example.com/product/" + i);
      await product.getByRole("combobox", { name: "関連する人物", exact: true }).selectOption("tal-000010");
      await product.getByRole("button", { name: "販売枠を追加", exact: true }).click();
      for (let j = 0; j < 2; j++) {
        const sale = product.getByRole("group", { name: "新しい販売枠", exact: true }).nth(j);
        await sale.getByLabel("販売ページURL").fill(`https://example.com/sale/${i}/${j}`);
        await sale.getByLabel("価格（JPY）").fill("1500");
        await sale.getByLabel("販売開始（日本時間）").fill("2027-03-06T09:30");
      }
    }
    await page.getByRole("button", { name: "下書きを保存", exact: true }).click();
    await page.getByText("下書きを保存しました。公開サイトには反映されていません。").waitFor();
    await page.reload();
    await page.getByRole("button", { name: "ブラウザー試験の企画", exact: true }).click();
    assert.equal(await page.getByLabel("販売ページURL").count(), 4);
    assert.equal(await page.getByLabel("商品名", { exact: true }).nth(1).inputValue(), "商品 1");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole("checkbox", { name: "ブラウザー試験の企画を公開する" }).check();
    await page.getByRole("button", { name: "選択した下書きを確認" }).click();
    await page.getByRole("checkbox", { name: "変更内容を確認しました" }).check();
    await page.getByRole("button", { name: "確認した変更を公開" }).click();
    await page.getByText("検証中", { exact: true }).waitFor();
    const campaign = planned.plan.files.goods.campaigns.find(({ title }) => title === "ブラウザー試験の企画");
    const offers = planned.plan.files.goods.offers.filter(({ campaignId }) => campaignId === campaign.id);
    assert.equal(offers.length, 4);
    assert.equal(new Set(offers.map(({ productId }) => productId)).size, 2);

    editable = false;
    const viewer = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
    await viewer.goto(url);
    await viewer.getByRole("heading", { name: "キャンペーン", exact: true }).waitFor();
    assert.ok(await viewer.getByText(catalog.sections.find(({ entity }) => entity === "campaign").items[0].title,
      { exact: true }).isVisible());
    assert.equal(await viewer.getByRole("button", { name: /新規登録|公開|下書き/ }).count(), 0);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
