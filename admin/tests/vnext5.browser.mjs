import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
export async function vnext5Browser({
  browser,
  base,
  models,
  reset,
  writes,
  advance,
  addAmbiguous,
  before = false,
  dir,
}) {
  const report = {
    screens: [],
    scenarios: [],
    layout: [],
    environment: { browser: browser.version(), mock: true },
  };
  const shot = async (p, name, w, theme) => {
    if (!dir) return;
    fs.mkdirSync(path.join(dir, "screens"), { recursive: true });
    await p.screenshot({
      path: path.join(
        dir,
        "screens",
        `${before ? "before-" : ""}${name}-${w}-${theme}.png`,
      ),
    });
    report.screens.push({ name, w, theme });
  };
  async function session(w = 1440, theme = "light", prepare) {
    reset();
    prepare?.();
    const c = await browser.newContext({
      viewport: { width: w, height: 1000 },
      colorScheme: theme,
    });
    await c.route("**/*", (r) =>
      r.request().url().startsWith(base) ? r.continue() : r.abort(),
    );
    const p = await c.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.setDefaultTimeout(10000);
    await p.goto(base);
    await p
      .getByRole("link", { name: "GitHubでログイン", exact: true })
      .click();
    await p.locator("[data-save-state][data-state=saved]").waitFor();
    return { p, c, errors };
  }
  const nav = async (p, n) => {
    await p.getByRole("link", { name: n, exact: true }).first().click();
    const type = {
      VTuber: "talent",
      "事務所・グループ": "organization",
      記念日: "anniversary",
      音楽: "song",
      イベント: "event",
      グッズ: "campaign",
    }[n];
    if (type)
      await p.locator(".record-browser[data-entity=" + type + "]").waitFor();
    else
      await p.waitForFunction(
        (name) => document.querySelector("#page-title")?.textContent === name,
        n,
      );
  };
  async function layout(p, name, w, theme) {
    const data = await p.evaluate(() => {
      const root = document.documentElement;
      const overlaps = [],
        tight = [];
      for (const group of document.querySelectorAll(
        ".toolbar,.button-group,.content-toolbar,.panel-heading,#workspace-bar",
      )) {
        const rows = [...group.children]
          .filter((e) => getComputedStyle(e).display !== "none" && !e.hidden)
          .map((e) => ({
            ...e.getBoundingClientRect().toJSON(),
            control: e.matches("button,a,input,select"),
          }))
          .filter((r) => r.width && r.height);
        for (let i = 0; i < rows.length; i++)
          for (let j = i + 1; j < rows.length; j++) {
            const a = rows[i],
              b = rows[j],
              x = Math.min(a.right, b.right) - Math.max(a.left, b.left),
              y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (x > 1 && y > 1) overlaps.push({ x, y });
            if (a.control && b.control) {
              const gap =
                y > 1
                  ? Math.max(b.left - a.right, a.left - b.right)
                  : x > 1
                    ? Math.max(b.top - a.bottom, a.top - b.bottom)
                    : Infinity;
              if (gap >= 0 && gap < 4) tight.push(gap);
            }
          }
      }
      return {
        overflow: root.scrollWidth > innerWidth,
        overlaps,
        tight,
        spacing: getComputedStyle(document.documentElement)
          .getPropertyValue("--space-2")
          .trim(),
      };
    });
    assert.equal(data.overflow, false, name);
    assert.deepEqual(data.overlaps, [], name);
    assert.deepEqual(data.tight, [], name);
    assert.equal(data.spacing, "8px");
    report.layout.push({ name, w, theme, ...data });
  }
  if (before) {
    for (const w of [390, 1440]) {
      const { p, c } = await session(w);
      for (const name of ["VTuber", "記念日", "グッズ"]) {
        await p.getByRole("link", { name, exact: true }).first().click();
        await p.locator(".list-region .data-table").first().waitFor();
        await shot(p, name, w, "light");
      }
      await c.close();
    }
    const { p, c } = await session();
    let clicks = 0;
    await p.exposeFunction("baselineClick", () => clicks++);
    await p.evaluate(() =>
      document.addEventListener("click", () => window.baselineClick()),
    );
    const started = performance.now();
    await p.getByRole("link", { name: "VTuber", exact: true }).first().click();
    const table = p.locator(".list-region .data-table");
    await table.waitFor();
    for (let i = 0; i < 10; i++)
      await table.locator("tbody tr input[type=checkbox]").nth(i).check();
    await table.getByLabel("一括変更する項目").selectOption("activity");
    await table.getByLabel("一括変更後の値").selectOption("retired");
    await table.getByRole("button", { name: "選択行に一括適用" }).click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "下書きに適用" })
      .click();
    await p.getByRole("button", { name: "下書きを保存", exact: true }).click();
    await p.locator("[data-save-state][data-state=saved]").waitFor();
    await p.getByRole("button", { name: "元に戻す", exact: true }).click();
    await p.getByRole("button", { name: "下書きを保存", exact: true }).click();
    await p.locator("[data-save-state][data-state=saved]").waitFor();
    report.scenarios.push({
      name: "A 10人の引退・Undo（旧直接テーブル）",
      clicks,
      ms: Math.round(performance.now() - started),
    });
    await c.close();
    for (const purpose of ["hide", "transfer"]) {
      const { p, c } = await session();
      let clicks = 0;
      await p.exposeFunction("oldFlowClick", () => clicks++);
      await p.addInitScript(() =>
        document.addEventListener("click", () => window.oldFlowClick()),
      );
      await p.evaluate(() =>
        document.addEventListener("click", () => window.oldFlowClick()),
      );
      const start = performance.now();
      await p
        .getByRole("link", { name: "VTuber", exact: true })
        .first()
        .click();
      const table = p.locator(".list-region .data-table");
      await table.waitFor();
      if (purpose === "hide") {
        await table.locator("tbody tr input[type=checkbox]").first().check();
        await table.getByLabel("一括変更する項目").selectOption("visibility");
        await table.getByLabel("一括変更後の値").selectOption("draft");
        await table.getByRole("button", { name: "選択行に一括適用" }).click();
        await p
          .getByRole("dialog")
          .getByRole("button", { name: "下書きに適用" })
          .click();
      } else {
        const t = models.talents.talents.find((t) =>
            t.affiliations.some((a) => a.status === "current"),
          ),
          org = t.affiliations.find(
            (a) => a.status === "current",
          ).organizationId,
          target = models.talents.organizations.find((o) => o.id !== org).id;
        await p.getByRole("searchbox", { name: "名前・IDで検索" }).fill(t.id);
        await p
          .getByRole("button", { name: t.displayName, exact: true })
          .click();
        await p.getByRole("button", { name: "編集", exact: true }).click();
        await p.getByRole("tab", { name: "所属・活動", exact: true }).click();
        await p
          .getByLabel("所属区分", { exact: true })
          .first()
          .selectOption("former");
        await p
          .getByRole("button", { name: "所属履歴を追加", exact: true })
          .click();
        await p
          .getByLabel("事務所", { exact: true })
          .last()
          .selectOption(target);
        await p
          .getByLabel("所属区分", { exact: true })
          .last()
          .selectOption("current");
      }
      await p
        .getByRole("button", { name: "下書きを保存", exact: true })
        .click();
      await p.locator("[data-save-state][data-state=saved]").waitFor();
      await p.reload();
      await p.locator("[data-save-state][data-state=saved]").waitFor();
      await p
        .getByRole("link", { name: "変更内容", exact: true })
        .first()
        .click();
      const response = p.waitForResponse((r) =>
        r.url().endsWith("/api/submissions/preview"),
      );
      await p
        .getByRole("button", { name: "選択した変更をプレビュー", exact: true })
        .click();
      const result = await response;
      if (purpose === "hide") {
        assert.equal(result.status(), 400);
        await shot(p, "非公開エラー", 1440, "light");
      } else {
        assert.equal(result.status(), 200);
        await p
          .getByLabel("差分と参照影響を確認しました", { exact: true })
          .check();
        await p
          .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
          .click();
        await p
          .getByRole("heading", { name: "PRを作成しました", exact: true })
          .waitFor();
      }
      report.scenarios.push({
        name: purpose,
        clicks,
        ms: Math.round(performance.now() - start),
        outcome:
          purpose === "hide" ? "blocked public references" : "PR created",
      });
      await c.close();
    }
    if (dir)
      fs.writeFileSync(
        path.join(dir, "before-ui-report.json"),
        JSON.stringify(report, null, 2),
      );
    return;
  }
  {
    const { p, c } = await session();
    const metrics = await p.evaluate(async (seed) => {
      const { mountRecordBrowser } = await import("/record-browser.js");
      const data = Array.from({ length: 1000 }, (_, i) => ({
        ...seed.talents.talents[0],
        id: "tal-" + String(i + 1).padStart(6, "0"),
        displayName: "負荷人物" + i,
        profileImage: null,
      }));
      let start = performance.now();
      mountRecordBrowser({
        container: document.querySelector("#view"),
        rows: () => data,
        models: seed,
        title: "性能試験",
        entity: "talent",
        onOpen: () => {},
        onBulk: () => {},
      });
      const initialMs = performance.now() - start,
        initialRows = document.querySelectorAll(".record-row").length;
      start = performance.now();
      const q = document.querySelector(".record-browser input[type=search]");
      q.value = "負荷人物999";
      q.dispatchEvent(new Event("input"));
      return {
        count: data.length,
        initialMs,
        initialRows,
        searchMs: performance.now() - start,
        resultRows: document.querySelectorAll(".record-row").length,
      };
    }, models);
    assert.equal(metrics.initialRows, 200);
    assert.equal(metrics.resultRows, 1);
    assert(metrics.initialMs < 1500 && metrics.searchMs < 1000);
    report.normalListPerformance = metrics;
    await c.close();
  }
  for (const w of [320, 390, 768, 1440, 1920])
    for (const theme of ["light", "dark"]) {
      const { p, c, errors } = await session(w, theme);
      for (const name of [
        "ダッシュボード",
        "VTuber",
        "事務所・グループ",
        "記念日",
        "音楽",
        "イベント",
        "グッズ",
        "変更内容",
        "提出済みPR",
        "設定",
      ]) {
        await nav(p, name);
        await layout(p, name, w, theme);
        await shot(p, name, w, theme);
      }
      await nav(p, "VTuber");
      let release;
      const held = new Promise((r) => (release = r));
      await p.route("**/api/masters", async (r) => {
        await held;
        await r.continue();
      });
      await p
        .getByRole("button", { name: "最新mainを再読み込み", exact: true })
        .click();
      await p.getByText("最新mainを読み込み中…", { exact: true }).waitFor();
      await layout(p, "ローディング", w, theme);
      await shot(p, "ローディング", w, theme);
      const response = p.waitForResponse("**/api/masters");
      release();
      await response;
      await p.unroute("**/api/masters");
      await p.getByText(/^最新main: /).waitFor();
      assert.equal(
        await p.locator(".record-row").count(),
        models.talents.talents.length,
      );
      assert.equal(await p.locator(".table-pager").count(), 0);
      assert.equal(
        await p.locator(".record-row .portrait").count(),
        models.talents.talents.length,
      );
      await p.getByText("絞り込み・並び順", { exact: true }).click();
      await p.getByRole("combobox", { name: "並び順", exact: true }).selectOption("registration");
      const titles = await p.locator(".record-row").allTextContents();
      for (const [i, t] of models.talents.talents.entries()) assert(titles[i].includes(t.displayName));
      await p.getByRole("combobox", { name: "並び順", exact: true }).selectOption("name");
      const byName = [...models.talents.talents].sort((a, b) => new Intl.Collator("ja").compare(a.displayName, b.displayName));
      const nameTitles = await p.locator(".record-row").allTextContents();
      for (const [i, t] of byName.entries()) assert(nameTitles[i].includes(t.displayName));
      await p.getByRole("combobox", { name: "並び順", exact: true }).selectOption("standard");
      const search = p.getByRole("searchbox", { name: "名前・タイトルで検索" });
      await search.fill(models.talents.talents[0].displayName);
      await p.locator(".record-row").first().click();
      await layout(p, "詳細", w, theme);
      await shot(p, "詳細", w, theme);
      await p
        .getByRole("button", { name: "状態・掲載を変更", exact: true })
        .click();
      await p.getByLabel("やりたい作業").selectOption("hideHistory");
      await p
        .getByRole("button", { name: "変更案を確認", exact: true })
        .click();
      assert.equal(await p.locator("#view button.primary").count(), 1);
      await layout(p, "公開影響", w, theme);
      await p
        .getByRole("button", { name: "確認した変更を下書きへ", exact: true })
        .click();
      await p
        .getByText("影響を確認してチェックしてください。", { exact: true })
        .waitFor();
      await layout(p, "入力エラー", w, theme);
      await shot(p, "入力エラー", w, theme);

      await shot(p, "公開影響", w, theme);
      await p.getByRole("button", { name: "一覧へ戻る", exact: true }).click();
      assert.equal(
        await search.inputValue(),
        models.talents.talents[0].displayName,
      );
      await search.fill("存在しない検索結果fixture");
      await p.getByText("該当する情報はありません。").waitFor();
      await layout(p, "空データ", w, theme);
      await shot(p, "空データ", w, theme);
      assert.deepEqual(errors, []);
      await search.fill("");
      await p.getByRole("button", { name: "一括編集", exact: true }).click();
      const bulk = p.locator(".list-region .data-table");
      await bulk.waitFor();
      await bulk.locator("tbody tr input[type=checkbox]").first().check();
      await bulk.getByLabel("一括変更する項目").selectOption("visibility");
      await bulk.getByLabel("一括変更後の値").selectOption("draft");
      await layout(p, "一括編集", w, theme);
      await shot(p, "一括編集", w, theme);
      await bulk.getByRole("button", { name: "選択行に一括適用" }).click();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "下書きに適用" })
        .click();
      await p
        .getByRole("dialog")
        .getByText(/公開履歴が残っています/)
        .waitFor();
      await layout(p, "参照エラー", w, theme);
      await shot(p, "参照エラー", w, theme);
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "キャンセル" })
        .click();
      await p
        .getByRole("button", { name: "通常一覧へ戻る", exact: true })
        .click();
      await search.fill(models.talents.talents[0].displayName);
      await p.locator(".record-row").first().click();
      await p.getByRole("button", { name: "編集", exact: true }).click();
      await p
        .getByLabel("表示名", { exact: true })
        .fill(models.talents.talents[0].displayName + " 自分");
      await p.route("**/api/workspace", (r) =>
        r.request().method() === "PUT"
          ? r.fulfill({ status: 503, json: { error: "unavailable" } })
          : r.continue(),
      );
      await p
        .getByRole("button", { name: "下書きを保存", exact: true })
        .click();
      await p.locator("[data-save-state][data-state=failed]").waitFor();
      await layout(p, "保存エラー", w, theme);
      await shot(p, "保存エラー", w, theme);
      await p.unroute("**/api/workspace");
      await p
        .getByRole("button", { name: "下書きを保存", exact: true })
        .click();
      await p.locator("[data-save-state][data-state=saved]").waitFor();
      advance();
      await nav(p, "変更内容");
      await p
        .getByRole("button", { name: "選択した変更をプレビュー", exact: true })
        .click();
      await p
        .getByRole("heading", { name: "競合を解決してください", exact: true })
        .waitFor();
      await layout(p, "競合", w, theme);
      await shot(p, "競合", w, theme);
      await p.locator(".conflict-field select").selectOption("ours");
      await p.getByRole("button", { name: "選択内容を下書きへ保存" }).click();
      await p
        .getByRole("button", { name: "選択した変更をプレビュー", exact: true })
        .click();
      await p
        .getByRole("heading", { name: "変更プレビュー", exact: true })
        .waitFor();
      await layout(p, "PRプレビュー", w, theme);
      await shot(p, "PRプレビュー", w, theme);
      await p
        .getByLabel("差分と参照影響を確認しました", { exact: true })
        .check();
      await p
        .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
        .click();
      await p
        .getByRole("heading", { name: "PRを作成しました", exact: true })
        .waitFor();
      await layout(p, "PR完了", w, theme);
      await shot(p, "PR完了", w, theme);
      assert.deepEqual(errors, []);
      await c.close();
    }
  async function operation(p, id, intent, { org, target } = {}) {
    await nav(p, "VTuber");
    const search = p.getByRole("searchbox", { name: "名前・タイトルで検索" });
    await search.fill(id);
    await p.locator(".record-row").first().click();
    await p
      .getByRole("button", { name: "状態・掲載を変更", exact: true })
      .click();
    await p.getByLabel("やりたい作業").selectOption(intent);
    if (org && intent === "transfer")
      await p.getByLabel("対象の事務所", { exact: true }).selectOption(org);
    if (target && intent === "transfer")
      await p.getByLabel("移籍先", { exact: true }).selectOption(target);
    await p.getByRole("button", { name: "変更案を確認", exact: true }).click();
    await p
      .getByLabel("対象・履歴・公開への影響を確認しました", { exact: true })
      .check();
    await p
      .getByRole("button", { name: "確認した変更を下書きへ", exact: true })
      .click();
  }
  const workspace = async (p) =>
    p.evaluate(
      async () =>
        (await (await fetch("/api/workspace")).json()).workspace || {},
    );
  const save = async (p) => {
    await p.getByRole("button", { name: "下書きを保存", exact: true }).click();
    await p.locator("[data-save-state][data-state=saved]").waitFor();
  };
  {
    const { p, c, errors } = await session();
    let clicks = 0;
    await p.exposeFunction("v5Click", () => clicks++);
    await p.evaluate(() =>
      document.addEventListener("click", () => window.v5Click()),
    );
    const start = performance.now();
    await nav(p, "VTuber");
    await p.getByRole("button", { name: "一括編集", exact: true }).click();
    const table = p.locator(".list-region .data-table");
    for (let i = 0; i < 10; i++)
      await table.locator("tbody tr input[type=checkbox]").nth(i).check();
    await p
      .getByRole("button", { name: "選択した人物の状態・掲載を変更" })
      .click();
    await p.getByLabel("やりたい作業").selectOption("retire");
    await p.getByRole("button", { name: "変更案を確認", exact: true }).click();
    await p.getByLabel("対象・履歴・公開への影響を確認しました").check();
    await p.getByRole("button", { name: "確認した変更を下書きへ" }).click();
    await save(p);
    assert.equal((await workspace(p)).operations.length, 10);
    await p.getByRole("button", { name: "元に戻す", exact: true }).click();
    await save(p);
    assert.equal((await workspace(p)).operations.length, 0);
    report.scenarios.push({
      name: "A 10人の引退・Undo",
      clicks,
      ms: Math.round(performance.now() - start),
    });
    assert.deepEqual(errors, []);
    await c.close();
  }
  for (const intent of ["hideHistory", "hidePrivate", "transfer"]) {
    const { p, c, errors } = await session();
    let flowClicks = 0;
    await p.exposeFunction("newFlowClick", () => flowClicks++);
    await p.addInitScript(() =>
      document.addEventListener("click", () => window.newFlowClick()),
    );
    await p.evaluate(() =>
      document.addEventListener("click", () => window.newFlowClick()),
    );
    const flowStart = performance.now();
    const t =
        intent === "hidePrivate"
          ? models.talents.talents.find(
              (t) => t.id === models.karaoke.karaokes[0].talentIds[0],
            )
          : models.talents.talents.find((t) =>
              t.affiliations.some((a) => a.status === "current"),
            ),
      org = t.affiliations.find((a) => a.status === "current").organizationId,
      target = models.talents.organizations.find((o) => o.id !== org).id;
    await operation(p, t.id, intent, { org, target });
    await save(p);
    await p.reload();
    await p.locator("[data-save-state][data-state=saved]").waitFor();
    assert((await workspace(p)).operations.length);
    await nav(p, "変更内容");
    await p
      .getByRole("button", { name: "選択した変更をプレビュー", exact: true })
      .click();
    await p
      .getByRole("heading", { name: "変更プレビュー", exact: true })
      .waitFor();
    await shot(p, intent + "-preview", 1440, "light");
    await p.getByLabel("差分と参照影響を確認しました", { exact: true }).check();
    await p
      .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
      .click();
    await p
      .getByRole("heading", { name: "PRを作成しました", exact: true })
      .waitFor();
    assert.equal(writes(), 1);
    assert.equal(
      await p
        .getByRole("link", { name: "GitHubでPRを開く", exact: true })
        .count(),
      1,
    );
    await layout(p, "PR完了", 1440, "light");
    await shot(p, "PR完了-" + intent, 1440, "light");
    assert.deepEqual(errors, []);
    report.scenarios.push({
      name: intent,
      passed: true,
      clicks: flowClicks,
      ms: Math.round(performance.now() - flowStart),
    });
    await c.close();
  }
  {
    const { p, c, errors } = await session(1440, "light", addAmbiguous);
    const t = models.talents.talents.find(
      (t) => t.id === models.karaoke.karaokes[0].talentIds[0],
    );
    await nav(p, "VTuber");
    await p.getByRole("searchbox", { name: "名前・タイトルで検索" }).fill(t.id);
    await p.locator(".record-row").click();
    await p
      .getByRole("button", { name: "状態・掲載を変更", exact: true })
      .click();
    await p.getByLabel("やりたい作業").selectOption("hidePrivate");
    await p.getByRole("button", { name: "変更案を確認", exact: true }).click();
    await p
      .locator(".validation-message")
      .filter({ hasText: "公開履歴が残っています" })
      .waitFor();
    assert.equal(
      await p.getByRole("button", { name: "確認した変更を下書きへ" }).count(),
      0,
    );
    assert.equal((await workspace(p)).operations?.length || 0, 0);
    await shot(p, "公開文章の要確認", 1440, "light");
    assert.deepEqual(errors, []);
    report.scenarios.push({
      name: "unlinked public text requires manual review; zero operations committed",
      passed: true,
    });
    await c.close();
  }
  if (dir)
    fs.writeFileSync(
      path.join(dir, "ui-report.json"),
      JSON.stringify(report, null, 2),
    );
  console.log(
    "vNext5 normal browsing, purposes, private closure, transfer, Undo, saved restore and PR passed",
  );
}
