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
  const savedByRole = new Map();
  let latestSong = false;
  let freshReads = 0;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const role = req.headers.cookie?.match(/role=(owner|editor|viewer)/)?.[1] || "editor";
      let data;
      if (url.pathname === "/auth/options") data = { google: true };
      else if (url.pathname === "/api/me") data = role === "owner"
        ? { id: "123", login: "fixture", repository: "fixture/repo", simpleCms: true, csrf: "test" }
        : { id: "editor", role, provider: "google", csrf: "test" };
      else if (url.pathname === "/api/cms/catalog") {
        if (url.searchParams.get("fresh") === "1") freshReads++;
        data = {
        sha: "a".repeat(40), editable: role !== "viewer", owner: role === "owner",
        contentPolicy: "all-content-v1", publicationTracking: role !== "owner", publishable: role === "editor",
        categories: ["talents", "organizations", "anniversaries", "events", "music", "goods"], songs: [
          ...(latestSong ? [{ id: "song-000066", name: "新規登録した曲", search: "新曲別名", visibility: "public" }] : []),
          ...Array.from({ length: 65 }, (_, i) => ({ id: "song-" + String(65 - i).padStart(6, "0"), name: "試験楽曲" + (65 - i), visibility: "public" })),
        ], people: Array.from({ length: 85 }, (_, i) => ({ id: "tal-" + String(i + 1).padStart(6, "0"), name: "試験ライバー" + (i + 1) })),
        organizations: Array.from({ length: 65 }, (_, i) => ({ id: "org-" + String(i + 1).padStart(6, "0"), name: "試験事務所" + (i + 1) })),
        sections: collection.map(([entity, label]) => ({ entity, label, items: [
          { id: entity + "-001", title: label + "の試験レコード", context: "確認用関連情報", state: "active", visibility: "public" },
          { id: entity + "-002", title: label + "の別レコード", context: "別の関連情報", state: "hiatus", visibility: "draft" },
        ] })),
      };
      }
      else if (url.pathname === "/api/cms/detail") data = { sha: "a".repeat(40), fields: {
        displayName: "VTuberの試験レコード", activity: "active", agencyState: "affiliated",
        affiliations: [{ organizationId: "org-000001", status: "current", from: null, to: null }],
        accounts: [], visibility: "public",
      } };
      else if (url.pathname === "/api/cms/draft/bulk") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const input = JSON.parse(Buffer.concat(chunks).toString());
        assert.equal(role, "editor");
        assert.equal(req.method, "PUT");
        assert.equal(input.revision, 0);
        assert.deepEqual(input.ids, ["talent-001"]);
        assert.equal(input.field, "activity");
        assert.equal(input.value, "hiatus");
        savedByRole.set(role, { revision: 1, drafts: [{ draftId: "bulk-one", input: { entity: "talent", id: "talent-001", displayName: "VTuberの試験レコード", activity: "hiatus" } }] });
        data = { revision: 1, draftIds: ["bulk-one"] };
      }
      else if (url.pathname === "/api/cms/draft") data = savedByRole.get(role) || { revision: 0, drafts: [] };
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
      if (role === "editor") {
        const menu = page.getByRole("button", { name: "メニュー", exact: true });
        assert.equal(await menu.getAttribute("aria-expanded"), "false");
        await menu.click();
        await page.locator("#admin-nav").getByRole("link", { name: "VTuber", exact: true }).click();
        assert.equal(await menu.getAttribute("aria-expanded"), "false");
      }
      if (process.env.ADMIN_V7_SCREENSHOTS) {
        await mkdir(process.env.ADMIN_V7_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: path.join(process.env.ADMIN_V7_SCREENSHOTS, role + "-initial.png"), fullPage: true });
      }
      for (const [entity, label] of collection) {
        await page.goto(base + "/#content/" + entity);
        await page.locator("#view h2").getByText(label, { exact: true }).waitFor();
        await page.getByRole("button", { name: label + "の試験レコード", exact: true }).waitFor();
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
          if (process.env.ADMIN_V7_SCREENSHOTS) {
            await page.screenshot({ path: path.join(process.env.ADMIN_V7_SCREENSHOTS, role + "-editor-before-check.png"), fullPage: true });
          }
          assert.equal(await page.getByLabel("表示名", { exact: true }).isEnabled(), role !== "viewer");
          assert.equal(await page.getByLabel("公開サイトへの掲載状態", { exact: true }).isEnabled(), role !== "viewer");
          assert.ok(await page.locator(".cms-collection-workspace.has-editor").count());
          assert.equal(await page.getByLabel("事務所所属状態", { exact: true }).isEnabled(), role !== "viewer");
          assert.equal(await page.getByLabel("TwitchチャンネルURL", { exact: true }).isEnabled(), role !== "viewer");
          if (role === "editor") {
            await page.getByRole("button", { name: "所属を追加", exact: true }).click();
            const added = page.locator(".cms-affiliation-editor fieldset").last();
            const org = added.getByRole("combobox", { name: "事務所", exact: true });
            await org.fill("試験事務所65");
            await added.getByRole("option", { name: /試験事務所65/ }).click();
            assert.equal(await added.locator("select[data-relation-value]").inputValue(), "org-000065");
            await added.getByRole("button", { name: "追加した所属を削除", exact: true }).click();
          }
          if (process.env.ADMIN_V7_SCREENSHOTS) {
            await mkdir(process.env.ADMIN_V7_SCREENSHOTS, { recursive: true });
            await page.screenshot({ path: path.join(process.env.ADMIN_V7_SCREENSHOTS, role + "-editor.png"), fullPage: true });
          }
          if (role === "editor") page.once("dialog", (dialog) => dialog.accept());
          await page.getByRole("button", { name: "閉じる", exact: true }).click();
          assert.equal(await page.locator(".cms-editor").isVisible(), false);
          await page.goto(base + "/#content/talent?record=talent-001");
          await page.getByLabel("表示名", { exact: true }).waitFor();
          assert.equal(await page.locator(".cms-editor").isVisible(), true);
          await page.getByRole("button", { name: "閉じる", exact: true }).click();
          if (role === "editor") {
            await page.getByRole("checkbox", { name: "VTuberの試験レコードを一括編集の対象にする", exact: true }).check();
            await page.getByLabel("一括編集する項目").selectOption("activity");
            await page.getByLabel("一括編集の変更後の値").selectOption("hiatus");
            page.once("dialog", (dialog) => dialog.accept());
            await page.getByRole("button", { name: "一括で下書きを保存", exact: true }).click();
            await page.getByText("1件の下書きを保存しました。", { exact: true }).waitFor();
            assert.equal(savedByRole.get(role).revision, 1);
          }
          if (role === "owner") {
            const height = await page.locator(".cms-collection-toolbar").evaluate((node) => node.getBoundingClientRect().height);
            assert.ok(height < 140, "desktop filters must not stack into a tall form");
          }
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
      if (role === "editor") {
        await page.goto(base + "/#content/musicVideo");
        await page.getByRole("button", { name: "歌動画を新規登録", exact: true }).click();
        const song = page.getByRole("combobox", { name: "既存の楽曲", exact: true });
        await song.waitFor();
        await song.click();
        assert.equal(await page.getByRole("listbox", { name: "曲名・原曲アーティストの候補" }).getByRole("option").count(), 40);
        await song.fill("song-000001");
        await page.getByRole("option", { name: /song-000001/ }).click();
        await song.fill("試験楽曲65");
        assert.equal(await page.locator("select[data-relation-value]").filter({ has: page.locator('option[value="song-000001"]') }).inputValue(), "song-000001");
        assert.equal(await page.getByRole("button", { name: "試験楽曲1の選択を解除" }).count(), 1);
        await song.press("Escape");
        assert.equal(await song.getAttribute("aria-expanded"), "false");
        const rawTitle = page.getByLabel("動画に記載された曲名", { exact: true });
        await rawTitle.fill("入力保持テスト");
        latestSong = true;
        await page.getByRole("button", { name: "最新の楽曲候補を取得", exact: true }).click();
        await page.getByText("最新の楽曲候補に更新しました。", { exact: true }).waitFor();
        assert.equal(await rawTitle.inputValue(), "入力保持テスト");
        await song.fill("新曲別名");
        await song.press("ArrowDown");
        await song.press("Enter");
        assert.equal(await page.getByRole("button", { name: "新規登録した曲の選択を解除" }).count(), 1);
        const person = page.getByRole("combobox", { name: "関連する人物", exact: true });
        await person.fill("試験ライバー85");
        await page.getByRole("option", { name: /試験ライバー85/ }).click();
        assert.equal(await page.getByRole("button", { name: "試験ライバー85の選択を解除" }).count(), 1);
        assert.ok(freshReads > 0);
        page.once("dialog", (dialog) => dialog.accept());
        await page.getByRole("button", { name: "閉じる", exact: true }).click();
        await page.goto(base + "/#content/talent?record=talent-002");
        const name = page.getByLabel("表示名", { exact: true });
        await name.fill("セッション復旧テスト");
        let attempts = 0;
        let reauthenticated = false;
        await page.route("**/api/cms/draft", async (route) => {
          if (route.request().method() !== "PUT") return route.continue();
          attempts++;
          if (!reauthenticated) return route.fulfill({ status: 401, json: { error: "login_required" } });
          assert.equal(route.request().headers()["x-csrf-token"], "renewed");
          assert.equal(route.request().postDataJSON().displayName, "セッション復旧テスト");
          return route.fulfill({ json: { revision: 2, draftId: "recovered" } });
        });
        const save = page.getByRole("button", { name: "下書きを保存", exact: true });
        await save.click();
        const recovery = page.locator("#auth-recovery");
        await recovery.waitFor();
        assert.equal(await recovery.getByRole("link").getAttribute("href"), "/auth/google/login");
        assert.equal(await name.inputValue(), "セッション復旧テスト");
        const retry = recovery.getByRole("button", { name: "ログインを確認して保存を再試行" });
        await page.route("**/api/me", (route) => route.fulfill({ json: { id: "other", role: "editor", provider: "google", csrf: "wrong" } }));
        await retry.click();
        await recovery.getByText(/別の管理者では再開できません/).waitFor();
        assert.equal(attempts, 1);
        await page.unroute("**/api/me");
        await page.route("**/api/me", (route) => route.fulfill({ json: { id: "editor", role: "editor", provider: "google", csrf: "renewed" } }));
        reauthenticated = true;
        await retry.click();
        await recovery.waitFor({ state: "detached" });
        assert.equal(attempts, 1);
        assert.equal(await name.inputValue(), "セッション復旧テスト");
        await save.click();
        await page.getByText("下書きを保存しました。公開サイトには反映されていません。", { exact: true }).waitFor();
        assert.equal(attempts, 2);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
