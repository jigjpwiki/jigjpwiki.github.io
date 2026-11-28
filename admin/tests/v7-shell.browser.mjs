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
        ], people: Array.from({ length: 85 }, (_, i) => ({ id: "tal-" + String(i + 1).padStart(6, "0"), name: "試験ライバー" + (i + 1), orderGroup: i < 83 ? "試験事務所1" : "試験事務所2" })),
        organizations: Array.from({ length: 65 }, (_, i) => ({ id: "org-" + String(i + 1).padStart(6, "0"), name: "試験事務所" + (i + 1) })),
        goodsEntries:[{entity:"campaign",id:"campaign-001",title:"販売企画の試験",context:"2商品 · 試験ライバー1",description:"試験商品A 試験商品B",state:"scheduled",saleMode:"受注販売",visibility:"public",productCount:2},{entity:"product",id:"product-002",title:"単独商品の試験",context:"1商品",state:"on_sale",saleMode:"先着販売",visibility:"public",productCount:1}],
        sections: collection.map(([entity, label]) => ({ entity, label, items: [
          { id: entity + "-001", title: label + "の試験レコード", context: "確認用関連情報", state: "active", visibility: "public" },
          { id: entity + "-002", title: label + "の別レコード", context: "別の関連情報", state: "hiatus", visibility: "draft" },
        ] })),
      };
      }
      else if(url.pathname==="/api/cms/video-preview") {assert.equal(role,"editor");assert.equal(url.searchParams.get("id"),"abcdefghijk");data={title:"確認用の動画タイトル",publishedAt:null,source:"collected"};}
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
      // The owner-only compatibility shortcut (#cms) is not a primary navigation item.
      const primaryLinks = page.locator(".cms-navigation > a:not(#simple-cms-link)");
      assert.equal(await primaryLinks.count(), 16, "5 workspace + 5 people/events + 5 music + 1 goods");
      assert.equal(await primaryLinks.locator("svg[aria-hidden=true]").count(), 16, "each primary navigation link has its icon");
      assert.equal(await primaryLinks.filter({hasText:"グッズ"}).count(),1);
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
          if (role === "owner") {
            assert.equal(await table.locator("th[data-column=id]").count(), 0);
            await page.locator("#page-title").click();
            await page.keyboard.press("c");
            const createChooser=page.getByRole("dialog",{name:"何を作成しますか？"});
            await createChooser.waitFor();
            await createChooser.getByRole("searchbox").fill("楽曲");
            assert.equal(await createChooser.getByRole("button",{name:"楽曲を新規作成",exact:true}).count(),1);
            await createChooser.getByRole("searchbox").press("Escape");
            await createChooser.waitFor({state:"hidden"});
            await page.locator("#page-title").click();
            await page.keyboard.press("/");
            const commands=page.getByRole("dialog",{name:"操作を検索"});
            await commands.getByRole("searchbox").fill("talent-001");
            assert.equal(await commands.getByRole("button",{name:"VTuberの試験レコード",exact:true}).count(),1);
            await commands.getByRole("searchbox").fill("楽曲");
            assert.equal(await commands.getByRole("button",{name:"楽曲を開く",exact:true}).count(),1);
            await commands.getByRole("searchbox").press("Escape");
            await commands.waitFor({state:"hidden"});
            assert.equal(await commands.isVisible(),false);
            await page.getByRole("button",{name:"操作を検索",exact:true}).click();
            await commands.waitFor();
            await commands.getByRole("button",{name:"閉じる",exact:true}).click();
            await commands.waitFor({state:"hidden"});
          }
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
          if (role === "owner") {
            await page.getByRole("button", {name:"拡大",exact:true}).click();
            assert.ok(await page.locator(".cms-editor-expanded").count());
            await page.getByRole("button", {name:"一覧と並べる",exact:true}).click();
            assert.equal(await page.locator(".cms-editor-expanded").count(),0);
            const width=page.getByLabel("編集パネルの幅",{exact:true});
            await width.fill("55");
            assert.equal(await page.locator(".cms-collection-workspace").evaluate(node=>node.style.getPropertyValue("--cms-editor-width")),"55%");
            await width.fill("46");
          }
          assert.equal(await page.getByLabel("現在の所属状況", { exact: true }).isEnabled(), role !== "viewer");
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
          if (role === "owner") {
            await page.setViewportSize({ width: 1440, height: 540 });
            const layout = await page.locator(".cms-form-scroll").evaluate(node => {
              const footer = document.querySelector(".cms-editor-footer");
              const before = footer.getBoundingClientRect();
              const outer = document.scrollingElement.scrollTop;
              node.scrollTop = node.scrollHeight;
              const after = footer.getBoundingClientRect();
              return { scroll: node.scrollTop, remaining: node.scrollHeight - node.clientHeight - node.scrollTop,
                bottom: after.bottom, height: innerHeight, fixed: Math.abs(before.top - after.top) < 1,
                outerUnchanged: outer === document.scrollingElement.scrollTop,
                docHeight: document.scrollingElement.scrollHeight };
            });
            assert.ok(layout.scroll > 0, JSON.stringify(layout));
            assert.ok(layout.remaining < 2 && layout.bottom <= layout.height && layout.fixed && layout.outerUnchanged && layout.docHeight <= layout.height + 1, JSON.stringify(layout));
            await page.setViewportSize({ width: 1440, height: 900 });
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
            let inlineInput;
            await page.route("**/api/cms/draft/bulk", route => {
              inlineInput = route.request().postDataJSON();
              savedByRole.set(role,{revision:2,drafts:[...savedByRole.get(role).drafts,{draftId:"inline-one",input:{entity:"talent",id:"talent-002",activity:"active"}}]});
              return route.fulfill({json:{revision:2,draftIds:["inline-one"]}});
            });
            await page.getByLabel("VTuberの別レコードの活動状態",{exact:true}).selectOption("active");
            await page.getByText("下書きを保存しました。公開サイトには反映されていません。",{exact:true}).waitFor();
            assert.deepEqual(inlineInput.ids,["talent-002"]);
            assert.equal(inlineInput.field,"activity");
            assert.equal(inlineInput.revision,1);
            assert.equal(await table.locator("tbody tr").last().locator("[data-column=state]").innerText(),"活動中");
            await page.unroute("**/api/cms/draft/bulk");
            savedByRole.set(role,{revision:1,drafts:savedByRole.get(role).drafts.slice(0,1)});
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
      await page.goto(base+"/#content/goods");
      await page.getByRole("button",{name:"販売企画の試験",exact:true}).waitFor();
      assert.equal(await page.locator("#view table tbody tr").count(),2);
      assert.equal(await page.locator('#admin-nav a[href="#content/goods"]').count(),1);
      assert.equal(await page.locator('#admin-nav a[href="#content/product"],#admin-nav a[href="#content/campaign"],#admin-nav a[href="#content/offer"]').count(),0);
      await page.getByRole("searchbox",{name:"名称を検索"}).fill("試験商品B");
      assert.equal(await page.locator("#view table tbody tr").count(),1);
      await page.getByRole("searchbox",{name:"名称を検索"}).fill("");
      if(role==="editor"){
        await page.getByRole("button",{name:"販売企画を新規登録",exact:true}).click();
        const common=page.locator(".cms-goods-common");
        await common.getByLabel("販売方式",{exact:true}).selectOption("preorder");
        assert.equal(await common.getByLabel("販売終了日時（JST）",{exact:true}).evaluate(e=>e.required),true);
        await common.getByLabel("販売開始日時（JST）",{exact:true}).fill("2027-01-01T10:00");
        await common.getByLabel("販売終了日時（JST）",{exact:true}).fill("2027-01-15T23:59");
        await common.getByLabel("公式販売URL",{exact:true}).fill("https://example.com/sale");
        await common.getByRole("combobox",{name:"関連VTuber",exact:true}).fill("試験ライバー85");
        await common.getByRole("option",{name:/試験ライバー85/}).click();
        await page.getByLabel("名称",{exact:true}).fill("新しい販売企画");
        const items=page.locator(".cms-goods-product");
        await items.first().getByLabel("商品名",{exact:true}).fill("試験商品A");
        await items.first().getByLabel("価格（JPY・任意）",{exact:true}).fill("1000");
        await page.getByRole("button",{name:"商品を追加",exact:true}).click();
        await items.last().getByLabel("商品名",{exact:true}).fill("試験商品B");
        await items.last().getByLabel("価格（JPY・任意）",{exact:true}).fill("2000");
        await items.last().getByRole("checkbox",{name:"共通と異なる販売条件"}).check();
        await items.last().getByLabel("販売方式",{exact:true}).selectOption("first_come");
        await items.last().getByLabel("販売終了日時（JST）",{exact:true}).fill("");
        let submitted;
        await page.route("**/api/cms/draft",route=>{
          if(route.request().method()!=="PUT")return route.continue();
          submitted=route.request().postDataJSON();return route.fulfill({json:{revision:2,draftId:"goods-new"}});
        });
        await page.getByRole("button",{name:"下書きを保存",exact:true}).click();
        await page.getByText("下書きを保存しました。公開サイトには反映されていません。",{exact:true}).waitFor();
        assert.equal(submitted.entity,"campaign");
        assert.equal(submitted.products.length,2);
        assert.equal(submitted.products[0].sales[0].saleMode,"preorder");
        assert.equal(submitted.products[0].sales[0].endsAt,"2027-01-15T23:59");
        assert.equal(submitted.products[1].sales[0].saleMode,"first_come");
        assert.equal(submitted.products[1].sales[0].url,"https://example.com/sale");
        assert.equal(submitted.products[1].sales[0].endsAt,"");
        assert.deepEqual(submitted.products.map(p=>p.talentIds),[["tal-000085"],["tal-000085"]]);
        await page.unroute("**/api/cms/draft");
        await page.getByRole("button",{name:"閉じる",exact:true}).click();
        await page.getByRole("button",{name:"単独商品を新規登録",exact:true}).click();
        assert.equal(await page.locator(".cms-goods-product").count(),1);
        assert.equal(await page.getByRole("button",{name:"商品を追加",exact:true}).count(),0);
        assert.equal(await page.getByRole("button",{name:"保存して次を作成",exact:true}).count(),1);
        await page.getByRole("button",{name:"閉じる",exact:true}).click();
      }
      await page.locator("#page-title").click();
      await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
      await page.waitForURL("**/#search");
      await page.getByRole("searchbox", { name: "名称を検索" }).waitFor();
      await page.goto(base + "/#drafts");
      await page.locator("#view h2").getByText("下書き", { exact: true }).waitFor();
      if (role === "editor") {
        const drafts = Array.from({length:15}, (_,i) => ({
          draftId:"draft-"+i, input:{entity:"event",title:"公開候補"+i},
          ...(i===13 ? {conflict:true} : i===14 ? {reapplyJobId:"old-job"} : {}),
        }));
        await page.route("**/api/cms/draft", route => route.fulfill({json:{revision:1,drafts}}));
        await page.reload();
        const selectAll = page.getByRole("checkbox", {name:"公開可能な下書きを全選択"});
        await selectAll.check();
        const draftChecks = page.locator(".cms-draft-row input[type=checkbox]");
        assert.equal(await draftChecks.count(), 13);
        assert.equal(await page.locator(".cms-draft-row input:checked").count(), 13);
        const preview = page.getByRole("button", {name:"選択した下書きを確認",exact:true});
        assert.equal(await preview.isEnabled(), false);
        await page.getByRole("button", {name:"先頭12件を選択",exact:true}).click();
        assert.equal(await page.locator(".cms-draft-row input:checked").count(), 12);
        assert.equal(await selectAll.evaluate(node=>node.indeterminate), true);
        let reviewed;
        await page.route("**/api/cms/publication/preview", route => {
          reviewed = route.request().postDataJSON();
          return route.fulfill({json:{records:[{name:"試験",changes:[]}],review:"test-review"}});
        });
        await preview.click();
        await page.getByRole("checkbox", {name:"変更内容を確認しました"}).waitFor();
        assert.deepEqual(reviewed.draftIds, drafts.slice(0,12).map(row=>row.draftId));
        await draftChecks.first().uncheck();
        assert.equal(await page.getByRole("button", {name:"確認した変更を公開"}).count(),0);
        await selectAll.click();
        assert.equal(await page.locator(".cms-draft-row input:checked").count(),13);
        await selectAll.uncheck();
        assert.equal(await page.locator(".cms-draft-row input:checked").count(),0);
        await page.unroute("**/api/cms/draft");
        await page.unroute("**/api/cms/publication/preview");
      }
      await page.goto(base + "/#history");
      await page.locator("#view h2").getByText("更新履歴", { exact: true }).waitFor();
      await page.getByRole("button", { name: "履歴を読み込む", exact: true }).click();
      await page.getByText("このページに表示できる編集履歴はありません。", { exact: true }).waitFor();
      if (role === "editor") {
        await page.goto(base + "/#content/event");
        await page.getByRole("button", {name:"イベントを新規登録",exact:true}).click();
        const performers = page.getByRole("combobox", {name:"出演者",exact:true});
        await performers.fill("試験ライバー85");
        await page.locator(".cms-picker-group").filter({hasText:"試験事務所2"}).waitFor();
        await performers.press("ArrowDown");
        await performers.press("Enter");
        await performers.fill("試験ライバー84");
        await page.getByRole("option", {name:/試験ライバー84/}).click();
        assert.deepEqual(await page.locator(".cms-picker-chip").filter({hasText:/試験ライバー8[45]/}).evaluateAll(nodes=>nodes.map(n=>n.textContent.replace(/×$/,""))),["試験ライバー84","試験ライバー85"]);
        assert.equal(await page.getByRole("button", {name:"試験ライバー85の選択を解除"}).count(),1);
        await page.getByRole("button", {name:"試験ライバー84の選択を解除"}).click();
        assert.equal(await page.getByRole("button", {name:"試験ライバー84の選択を解除"}).count(),0);
        page.once("dialog", dialog=>dialog.accept());
        await page.getByRole("button", {name:"閉じる",exact:true}).click();
        await page.goto(base + "/#content/musicVideo");
        await page.getByRole("button", { name: "歌動画を新規登録", exact: true }).click();
        const videoUrl=page.getByLabel("YouTube動画URL",{exact:true});await videoUrl.fill("https://youtu.be/abcdefghijk");
        await page.getByRole("button",{name:"YouTubeの情報を確認",exact:true}).click();
        await page.getByText("確認用の動画タイトル",{exact:true}).waitFor();
        await page.getByRole("button",{name:"正式な動画URLを使用",exact:true}).click();
        assert.equal(await videoUrl.inputValue(),"https://www.youtube.com/watch?v=abcdefghijk");
        const song = page.getByRole("combobox", { name: "既存の楽曲", exact: true });
        await song.waitFor();
        await song.click();
        assert.equal(await page.getByRole("listbox", { name: "既存の楽曲の候補" }).getByRole("option").count(), 40);
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
        await page.unroute("**/api/cms/draft");
        await page.goto(base + "/#content/talent");
        await page.getByRole("button",{name:"VTuberを新規登録",exact:true}).click();
        await page.getByLabel("表示名",{exact:true}).fill("自動更新と並行した新規登録");
        await page.getByRole("region",{name:"レコード詳細"}).getByLabel("活動状態",{exact:true}).selectOption("ended");
        await page.getByRole("button",{name:"所属を追加",exact:true}).click();
        const former=page.locator(".cms-affiliation-editor fieldset").last();
        await former.getByRole("combobox",{name:"事務所",exact:true}).fill("試験事務所65");
        await former.getByRole("option",{name:/試験事務所65/}).click();
        assert.equal(await former.getByLabel("所属状態",{exact:true}).inputValue(),"former");
        await page.getByLabel("現在の所属状況",{exact:true}).selectOption("unaffiliated");
        const payloads=[];
        await page.route("**/api/cms/catalog?fresh=1",async route=>{
          const response=await route.fetch();
          const body=await response.json();
          return route.fulfill({json:{...body,sha:"b".repeat(40)}});
        });
        await page.route("**/api/cms/draft",async route=>{
          if(route.request().method()!=="PUT")return route.continue();
          payloads.push(route.request().postDataJSON());
          if(payloads.length===1)return route.fulfill({status:409,json:{error:"main_changed_reload"}});
          return route.fulfill({json:{revision:3,draftId:"new-talent-retried"}});
        });
        await page.getByRole("button",{name:"下書きを保存",exact:true}).click();
        await page.getByText("下書きを保存しました。公開サイトには反映されていません。",{exact:true}).waitFor();
        assert.equal(payloads.length,2);
        assert.equal(payloads[0].sha,"a".repeat(40));
        assert.equal(payloads[1].sha,"b".repeat(40));
        assert.equal(payloads[1].agencyState,"unaffiliated");
        assert.equal(payloads[1].affiliations[0].status,"former");
        assert.deepEqual({...payloads[1],sha:payloads[0].sha},payloads[0]);
        assert.equal(await page.getByLabel("表示名",{exact:true}).inputValue(),"自動更新と並行した新規登録");
        await page.unroute("**/api/cms/draft");
        await page.unroute("**/api/cms/catalog?fresh=1");
        // An existing record must still stop on a stale snapshot.
        await page.goto(base+"/#content/talent?record=talent-002");
        await page.getByLabel("表示名",{exact:true}).fill("競合を自動上書きしない");
        let staleAttempts=0;
        await page.route("**/api/cms/draft",async route=>{
          if(route.request().method()!=="PUT")return route.continue();
          staleAttempts++;
          return route.fulfill({status:409,json:{error:"main_changed_reload"}});
        });
        await page.getByRole("button",{name:"下書きを保存",exact:true}).click();
        await page.getByText("保存できませんでした（入力は保持されています）",{exact:true}).waitFor();
        assert.equal(staleAttempts,1);
        assert.equal(await page.getByLabel("表示名",{exact:true}).inputValue(),"競合を自動上書きしない");
      }
      if(role==="owner"){
        await page.route("**/api/cms/catalog?fresh=1",async route=>{
          const response=await route.fetch();const data=await response.json();
          data.sections.find(s=>s.entity==="video").items=Array.from({length:125},(_,i)=>({id:"video-scroll-"+i,title:"スクロール試験 "+i,state:"active",visibility:"public"}));
          await route.fulfill({json:data});
        });
        await page.goto(base+"/#content/video");
        await page.getByText("50 / 125件を表示",{exact:true}).waitFor();
        const list=page.locator(".cms-collection-list");
        const original=await list.locator(".cms-record-link").first().elementHandle();
        await list.evaluate(node=>node.scrollTop=node.scrollHeight);
        await page.getByText("100 / 125件を表示",{exact:true}).waitFor();
        assert.equal(await original.evaluate(node=>node.isConnected),true);
        await list.evaluate(node=>node.scrollTop=node.scrollHeight);
        await page.getByText("125 / 125件を表示",{exact:true}).waitFor();
        const ids=await list.locator(".cms-record-link").evaluateAll(nodes=>nodes.map(n=>n.dataset.recordId));
        assert.equal(ids.length,125);assert.equal(new Set(ids).size,125);
        await list.getByRole("searchbox").first().fill("スクロール試験 124");
        await page.getByText("1 / 1件を表示",{exact:true}).waitFor();
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
