import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { chromium } from "../../node_modules/playwright/index.mjs";

const collection = [
  ["talent", "VTuber"], ["organization", "事務所"], ["group", "グループ"],
  ["anniversary", "記念日"], ["event", "イベント"], ["song", "楽曲"],
  ["musicVideo", "歌動画"], ["video", "動画情報"], ["karaoke", "歌枠"],
  ["performance", "歌唱記録"], ["product", "商品"], ["campaign", "キャンペーン"], ["offer", "販売情報"],
];

test("all roles share the shell and separate collections while viewers have read-only controls", async () => {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const role = req.headers.cookie?.match(/role=(owner|editor|viewer)/)?.[1] || "editor";
      let data;
      if (url.pathname === "/auth/options") data = { google: true };
      else if (url.pathname === "/api/me") data = role === "owner"
        ? { id: "123", login: "fixture", repository: "fixture/repo", simpleCms: true, csrf: "test" }
        : { id: "editor", role, provider: "google", csrf: "test" };
      else if (url.pathname === "/api/cms/catalog") data = {
        sha: "a".repeat(40), editable: role !== "viewer", owner: role === "owner",
        contentPolicy: "all-content-v1", publicationTracking: role !== "owner", publishable: role === "editor",
        categories: ["talents", "organizations", "anniversaries", "events", "music", "goods"], songs: [], organizations: [], people: [],
        sections: collection.map(([entity, label]) => ({ entity, label, items: [
          { id: entity + "-001", title: label + "の試験レコード", context: "確認用関連情報", state: "active", visibility: "public" },
          { id: entity + "-002", title: label + "の別レコード", context: "別の関連情報", state: "hiatus", visibility: "draft" },
        ] })),
      };
      else if (url.pathname === "/api/cms/detail") data = { sha: "a".repeat(40), fields: { displayName: "VTuberの試験レコード", activity: "active" } };
      else if (url.pathname === "/api/cms/draft") data = { revision: 0, drafts: [] };
      else if (url.pathname === "/api/cms/publication") data = { publication: null };
      else if (url.pathname === "/api/workspace") data = { workspace: { revision: 0, operations: [] } };
      else if (url.pathname === "/api/cms/history") data = { records: [], next: null };
      else if (url.pathname.startsWith("/api/")) throw new Error("Unexpected API " + req.url);
      if (data) {
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify(data));
      }
      if (url.pathname === "/favicon.ico") return res.writeHead(204).end();
      const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (!/^[\w.-]+$/.test(name)) return res.writeHead(404).end();
      res.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "text/html");
      res.end(await readFile(new URL("../public/" + name, import.meta.url)));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    for (const role of ["owner", "editor", "viewer"]) {
      const context = await browser.newContext({ viewport: { width: role === "editor" ? 390 : 1440, height: 900 } });
      await context.addCookies([{ name: "role", value: role, url: base }]);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(base);
      await page.locator("#view h2").getByText("ダッシュボード", { exact: true }).waitFor();
      assert.equal(await page.locator("nav[aria-label='管理ナビゲーション']").count(), 1);
      assert.ok(await page.locator(".cms-navigation a svg[aria-hidden=true]").count() >= 18);
      assert.equal(await page.locator("[data-owner-only]").isVisible(), role === "owner");
      for (const [entity, label] of collection) {
        await page.goto(base + "/#content/" + entity);
        await page.locator("#view table").waitFor();
        assert.equal(await page.locator("#view h2").textContent(), label);
        assert.equal(await page.locator("#view table").count(), 1);
        await page.getByText(label + "の試験レコード", { exact: true }).waitFor();
        if (entity === "talent") {
          const table = page.locator("#view table");
          const search = page.getByRole("searchbox", { name: "名称を検索" });
          await search.fill("talent-002");
          assert.equal(await table.locator("tbody tr").count(), 1);
          await table.getByText(label + "の別レコード", { exact: true }).waitFor();
          await search.fill("");
          await page.getByLabel("公開状態で絞り込む").selectOption("public");
          assert.equal(await table.locator("tbody tr").count(), 1);
          await page.getByLabel("公開状態で絞り込む").selectOption("");
          await page.locator(".cms-columns summary").click();
          await page.locator(".cms-columns").getByLabel("固定ID", { exact: true }).uncheck();
          assert.equal(await table.locator("th[data-column=id]").count(), 0);
          await page.locator(".cms-columns").getByLabel("固定ID", { exact: true }).check();
          await page.locator(".cms-columns summary").click();
          await table.getByRole("button", { name: label + "の試験レコード", exact: true }).click();
          await page.getByLabel("表示名", { exact: true }).waitFor();
          assert.equal(await page.getByLabel("表示名", { exact: true }).isEnabled(), role !== "viewer");
          await page.getByRole("button", { name: "閉じる", exact: true }).click();
          assert.equal(await page.locator(".cms-editor").isVisible(), false);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (process.env.ADMIN_V7_SCREENSHOTS && ["talent", "campaign"].includes(entity)) {
          await mkdir(process.env.ADMIN_V7_SCREENSHOTS, { recursive: true });
          await page.screenshot({ path: path.join(process.env.ADMIN_V7_SCREENSHOTS, `${role}-${entity}.png`), fullPage: true });
        }
        if (role === "viewer") assert.equal(await page.locator("#view").getByRole("button", { name: /新規登録|下書きを保存|公開/ }).count(), 0);
      }
      await page.locator("#page-title").click();
      await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
      await page.waitForURL("**/#search");
      await page.getByRole("searchbox", { name: "名称を検索" }).waitFor();
      await page.goto(base + "/#drafts");
      await page.locator("#view h2").getByText("下書き", { exact: true }).waitFor();
      await page.goto(base + "/#history");
      await page.locator("#view h2").getByText("更新履歴", { exact: true }).waitFor();
      await page.getByRole("button", { name: "履歴を読み込む", exact: true }).click();
      await page.getByText("このページに表示できる編集履歴はありません。", { exact: true }).waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
