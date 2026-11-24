import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "../../node_modules/playwright/index.mjs";

test("editor compares draft conflicts and restores audited changes as a new draft", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let revision = 1, conflictResolved = false, reversal;
    await page.route("http://cms.test/**", async (route) => {
      const request = route.request();
      const { pathname, searchParams } = new URL(request.url());
      const json = (value) => route.fulfill({ json: value });
      if (pathname === "/") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ja">
<meta name="viewport" content="width=device-width"><div id="cms"></div><p id="status"></p><script type="module">
import { mountSimpleCms } from "/simple-cms.js";
const root = document.querySelector("#cms");
await mountSimpleCms(root, document.querySelector("#status"), async (path, method, data) => {
  const result = await fetch(path, { method, body: data && JSON.stringify(data) });
  if (!result.ok) throw new Error((await result.json()).error);
  return result.json();
});
</script></html>` });
      if (["/simple-cms.js", "/cms-history.js", "/cms-conflicts.js"].includes(pathname)) {
        const body = await readFile(new URL("../public" + pathname, import.meta.url));
        return route.fulfill({ contentType: "text/javascript", body });
      }
      if (pathname === "/api/cms/catalog") return json({
        editable: true, publicationTracking: false, publishable: false, categories: ["events"], sections: [],
      });
      if (pathname === "/api/cms/draft") return json({
        revision, drafts: [{
          draftId: "conflict", conflict: !conflictResolved, input: { title: "テスト企画", entity: "event" },
        }, ...(reversal ? [{ draftId: "reversal", conflict: false, input: { title: "取り消し案", entity: "event" } }] : [])],
      });
      if (pathname === "/api/cms/draft/conflicts" && request.method() === "GET") return json({
        sha: "main", revision, conflicts: [{ id: "event-000001", field: "/title",
          base: "基準名", ours: "自分の企画名", theirs: "後から変更した企画名" }],
      });
      if (pathname === "/api/cms/draft/conflicts" && request.method() === "PUT") {
        assert.deepEqual(request.postDataJSON(), { draftId: "conflict", sha: "main", revision, choices: ["theirs"] });
        conflictResolved = true;
        return json({ revision: ++revision });
      }
      if (pathname === "/api/cms/history" && request.method() === "POST") {
        reversal = request.postDataJSON();
        return json({ revision: ++revision });
      }
      if (pathname === "/api/cms/history" && searchParams.has("batchId")) return json({
        sha: "main", operations: [
          { operationId: "rename", recordId: "event-000001", changedFields: ["title"],
            before: { title: "基準名" }, after: { title: "後から変更した企画名" }, reversible: true },
          { operationId: "create", recordId: "product-000001", changedFields: ["title"],
            before: null, after: { title: "新規商品" }, reversible: false },
        ],
      });
      if (pathname === "/api/cms/history") return json({
        records: [{ batchId: "published", count: 2, createdAt: "2026-11-24T00:00:00Z" }], next: null,
      });
      return route.fulfill({ status: 404, body: "" });
    });
    await page.goto("http://cms.test/");
    await page.getByRole("button", { name: "最新の情報と比較", exact: true }).click();
    await page.getByText('"基準名"', { exact: true }).waitFor();
    await page.getByText('"自分の企画名"', { exact: true }).waitFor();
    await page.getByText('"後から変更した企画名"', { exact: true }).waitFor();
    const select = page.getByRole("combobox", { name: /event-000001.*に適用する値/ });
    assert.equal(await select.evaluate((element) => document.activeElement === element), true);
    await select.selectOption("theirs");
    await page.getByRole("button", { name: "選択を反映して下書きを保存", exact: true }).click();
    await page.getByRole("button", { name: "テスト企画", exact: true }).waitFor();
    assert.ok(conflictResolved);

    await page.getByText("編集履歴", { exact: true }).click();
    await page.getByRole("button", { name: "履歴を読み込む", exact: true }).click();
    await page.getByRole("button", { name: /2件/ }).click();
    await page.getByRole("heading", { name: "変更内容" }).waitFor();
    const reverse = page.getByRole("button", { name: "取り消しを下書きに追加" });
    assert.equal(await reverse.count(), 1);
    await reverse.click();
    await page.getByRole("button", { name: "取り消し案", exact: true }).waitFor();
    assert.deepEqual(reversal, {
      batchId: "published", operationId: "rename", recordId: "event-000001", sha: "main", revision: 2,
    });
  } finally {
    await browser.close();
  }
});
