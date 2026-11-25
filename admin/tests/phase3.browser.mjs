const advancedRoutes = {"VTuber": "#masters", "事務所・グループ": "#organizations", "記念日": "#anniversaries", "イベント": "#events", "音楽": "#music", "グッズ": "#goods", "変更内容": "#workspace", "提出済みPR": "#submitted", "設定": "#settings"};
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
export async function phase3Browser({
  browser,
  base,
  models,
  reset,
  shotDir,
  before = false,
}) {
  const measurements = [];
  const counts = new Map();
  for (const t of models.talents.talents) {
    const v = t.activityStatus.value;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const sourceState = [...counts].sort((a, b) => b[1] - a[1])[0][0],
    targetState = sourceState === "hiatus" ? "unknown" : "hiatus",
    people = models.talents.talents
      .filter((t) => t.activityStatus.value === sourceState)
      .slice(0, 10);

  async function session(width = 1440) {
    reset();
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      colorScheme: width === 768 ? "dark" : "light",
    });
    context.on("dialog", (d) => d.accept());
    await context.route("**/*", (r) =>
      r.request().url().startsWith(base) ? r.continue() : r.abort(),
    );
    const p = await context.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base);
    await p
      .getByRole("link", { name: "GitHubでログイン", exact: true })
      .click();
    await p.locator("#identity").filter({ hasText: "管理者" }).waitFor();
    await p.locator("nav details[data-owner-only]").evaluate((node) => { node.open = true; });
    await p.locator('nav a[href="#workspace"]').click();
    await p.locator("[data-save-state][data-state=saved]").waitFor();
    return { context, p, errors };
  }
  async function nav(p, name) {
    await p.locator("nav details[data-owner-only]").evaluate((node) => { node.open = true; });
    await p.locator('nav a[href="' + advancedRoutes[name] + '"]').click();
    const targetType={VTuber:'talent','事務所・グループ':'organization','記念日':'anniversary','音楽':'song','イベント':'event','グッズ':'campaign'}[name];
    const targetTitle={VTuber:'VTuber','事務所・グループ':'事務所','記念日':'記念日','音楽':'楽曲','イベント':'イベント','グッズ':'キャンペーン'}[name];
    await p.locator(`.record-browser[data-entity="${targetType}"],.list-region [data-data-table="${targetTitle}"]`).first().waitFor();
    if(await p.getByRole("button",{name:"一括編集",exact:true}).count())await p.getByRole("button",{name:"一括編集",exact:true}).click();
    await p.locator(".data-table table").first().waitFor();
    const route = await p.evaluate(() => location.hash);
    await p.locator(".skip-link").focus();
    await p.keyboard.press("Enter");
    assert.equal(await p.evaluate(() => location.hash), route);
    assert.equal(
      await p.evaluate(() => document.activeElement.id),
      "main-content",
    );
  }
  async function start(p) {
    await p.evaluate(() => {
      window.measure = { clicks: 0, transitions: 0, screenChanges: 0 };
      if (!window.measuring) {
        document.addEventListener("click", (e) => {
          if (
            !e.target.closest(
              "input:not([type=checkbox]),textarea,select,option",
            )
          )
            window.measure.clicks++;
        });
        window.addEventListener(
          "hashchange",
          () => window.measure.transitions++,
        );
        new MutationObserver((changes) => {
          if (changes.some((c) => c.target === document.querySelector("#view")))
            window.measure.screenChanges++;
        }).observe(document.querySelector("#view"), { childList: true });
        window.measuring = true;
      }
    });
  }
  async function measure(p, scenario, switches) {
    await p.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelector(".table-scroll")?.scrollTo(0, 0);
    });
    const m = await p.evaluate(() => window.measure),
      size = await p.evaluate(() => {
        const scroll =
          document.querySelector(".table-scroll") ||
          document.querySelector("#view");
        const rect = scroll.getBoundingClientRect();
        return {
          mainWidth: document.querySelector("main").clientWidth,
          viewport: innerWidth,
          visibleRows: [
            ...scroll.querySelectorAll("tbody>tr,.content-list-row"),
          ].filter((r) => {
            const x = r.getBoundingClientRect();
            return (
              x.top >= rect.top &&
              x.bottom <= Math.min(rect.bottom, innerHeight)
            );
          }).length,
        };
      });
    measurements.push({
      scenario,
      before,
      ...m,
      targetSwitches: switches,
      ...size,
    });
  }
  async function save(p) {
    await p.getByRole("button", { name: "下書きを保存", exact: true }).click();
    await p.locator("#identity").filter({ hasText: "管理者" }).waitFor();
    await p.locator("nav details[data-owner-only]").evaluate((node) => { node.open = true; });
    await p.locator('nav a[href="#workspace"]').click();
    await p.locator("[data-save-state][data-state=saved]").waitFor();
  }
  async function shot(p, name, width) {
    await p.evaluate(() => window.scrollTo(0, 0));
    if (!shotDir) return;
    fs.mkdirSync(shotDir, { recursive: true });
    await p.screenshot({
      path: path.join(
        shotDir,
        `${before ? "before" : "after"}-${name}-${width}.png`,
      ),
      fullPage: false,
    });
  }
  async function editCell(p, table, index, col, value) {
    const cell = table
      .locator(`tbody>tr`)
      .nth(index)
      .locator(`td[data-column="${col}"]`);
    await cell.locator("button.cell-editor").click();
    await cell.locator("input").fill(value);
    await cell.locator("input").press("Enter");
  }

  async function submitMeasured(p, scenario, switches) {
    await p
      .locator('nav a[href="#workspace"]')
      .first()
      .click();
    await p
      .getByRole("heading", { name: "変更ワークスペース", exact: true })
      .waitFor();
    await p
      .getByRole("button", { name: "選択した変更をプレビュー", exact: true })
      .click();
    await p.getByLabel("差分と参照影響を確認しました", { exact: true }).check();
    await p
      .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
      .click();
    await p.getByRole("heading", { name: "PRを作成しました" }).waitFor();
    await measure(p, scenario + "_PR", switches);
  }
  async function mixedScenario(old) {
    const { p, context } = await session();
    await p.locator("nav details[data-owner-only]").evaluate((node) => { node.open = true; });
    await p.locator('nav a[href="#anniversaries"]').click();
    await p
      .getByRole("button", { name: "新規記念日登録", exact: true })
      .waitFor();
    if(!old)await p.getByRole("button",{name:"一括編集",exact:true}).click();
    await start(p);
    for (let i = 0; i < 10; i++) {
      if (old) {
        await p
          .getByRole("button", {
            name: models.anniversaries.events[i].title,
            exact: true,
          })
          .click();
        await p
          .getByLabel("タイトル（必須）", { exact: true })
          .fill(models.anniversaries.events[i].title + " P3");
        await p
          .getByRole("button", { name: "編集内容を保留", exact: true })
          .click();
      } else
        await editCell(
          p,
          p.locator(".list-region .data-table").first(),
          i,
          "title",
          models.anniversaries.events[i].title + " P3",
        );
    }
    await save(p);
    await p.locator("nav details[data-owner-only]").evaluate((node) => { node.open = true; });
    await p.locator('nav a[href="#masters"]').click();
    if(!old)await p.getByRole("button",{name:"一括編集",exact:true}).click();
    await p.getByRole("button", { name: "新規登録", exact: true }).waitFor();
    if (old) {
      for (let i = 0; i < 10; i++) {
        await p
          .getByRole("searchbox", { name: "名前・IDで検索" })
          .fill(people[i].id);
        await p
          .getByRole("button", {
            name: people[i].displayName,
            exact: true,
          })
          .click();
        await p.getByRole("button", { name: "編集", exact: true }).click();
        await p.getByRole("tab", { name: "所属・活動", exact: true }).click();
        await p
          .getByLabel("VTuberとしての活動状態", { exact: true })
          .selectOption(targetState);
        await p
          .getByRole("button", { name: "一覧へ戻る", exact: true })
          .click();
      }
    } else {
      const t = p.locator(".list-region .data-table").first();
      await t
        .getByLabel("一覧の活動状態", { exact: true })
        .selectOption(sourceState);
      for (let i = 0; i < 10; i++)
        await t
          .locator("tbody>tr")
          .nth(i)
          .locator("input[type=checkbox]")
          .check();
      await t.getByLabel("一括変更する項目").selectOption("activity");
      await t.getByLabel("一括変更後の値").selectOption(targetState);
      await t.getByRole("button", { name: "選択行に一括適用" }).click();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "下書きに適用" })
        .click();
    }
    await save(p);
    await p
      .locator('nav a[href="#workspace"]')
      .first()
      .click();
    await p
      .getByRole("heading", { name: "変更ワークスペース", exact: true })
      .waitFor();
    assert.equal(
      await p.locator("[data-workspace-operations]>tbody>tr").count(),
      20,
    );
    await p
      .getByRole("button", { name: "選択した変更をプレビュー", exact: true })
      .click();
    await p.getByLabel("差分と参照影響を確認しました", { exact: true }).check();
    await p
      .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
      .click();
    await p.getByRole("heading", { name: "PRを作成しました" }).waitFor();
    await measure(p, "E", 19);
    await shot(p, "E", 1440);
    await context.close();
  }
  // Same data, scenarios and viewport on the merged Phase 2 UI for the comparison.
  if (before) {
    for (const scenario of ["A", "B", "C"]) {
      const { p, context } = await session();
      await p
        .getByRole("link", {
          name:
            scenario === "A"
              ? "記念日"
              : scenario === "B"
                ? "VTuber"
                : "イベント",
          exact: true,
        })
        .click();
      await p
        .getByRole("button", {
          name:
            scenario === "B"
              ? "新規登録"
              : scenario === "A"
                ? "新規記念日登録"
                : "新規イベント登録",
          exact: true,
        })
        .waitFor();
      await start(p);
      const n = scenario === "C" ? 5 : 10;
      for (let i = 0; i < n; i++) {
        if (scenario === "B") {
          await p
            .getByRole("searchbox", { name: "名前・IDで検索" })
            .fill(people[i].id);
          await p
            .getByRole("button", {
              name: people[i].displayName,
              exact: true,
            })
            .click();
          await p.getByRole("button", { name: "編集", exact: true }).click();
          await p.getByRole("tab", { name: "所属・活動", exact: true }).click();
          await p
            .getByLabel("VTuberとしての活動状態", { exact: true })
            .selectOption(targetState);
          await p
            .getByRole("button", { name: "一覧へ戻る", exact: true })
            .click();
        } else {
          const rows =
            models[scenario === "A" ? "anniversaries" : "events"].events;
          await p
            .getByRole("button", { name: rows[i].title, exact: true })
            .click();
          await p
            .getByLabel("タイトル（必須）", { exact: true })
            .fill(rows[i].title + " P3");
          await p
            .getByRole("button", { name: "編集内容を保留", exact: true })
            .click();
        }
      }
      await save(p);
      if (scenario === "B")
        await p.getByRole("searchbox", { name: "名前・IDで検索" }).fill("");
      await measure(p, scenario, n - 1);
      await shot(p, scenario, 1440);
      await submitMeasured(p, scenario, n - 1);
      await context.close();
    }
    {
      const { p, context } = await session();
      await p.locator("nav details[data-owner-only]").evaluate((node) => { node.open = true; });
    await p.locator('nav a[href="#goods"]').click();
      await p
        .getByRole("button", { name: "新規キャンペーン登録", exact: true })
        .waitFor();
      await start(p);
      const campaign = models.goods.campaigns[0],
        offers = models.goods.offers
          .filter((o) => o.campaignId === campaign.id)
          .slice(0, 5);
      await p
        .getByRole("button", { name: campaign.title, exact: true })
        .click();
      await p
        .getByLabel("タイトル（必須）", { exact: true })
        .fill(campaign.title + " P3");
      for (const offer of offers) {
        const product = models.goods.products.find(
          (r) => r.id === offer.productId,
        );
        await p
          .getByRole("button", { name: product.title + "を編集", exact: true })
          .click();
        await p
          .getByLabel("タイトル（必須）", { exact: true })
          .fill(product.title + " P3");
        await p
          .getByRole("button", {
            name:
              product.title +
              " P3 / " +
              offer.price.amount.toLocaleString("ja-JP") +
              "円を編集",
            exact: true,
          })
          .count();
        const related = p
          .locator(".content-related .content-list-row button")
          .first();
        await related.click();
        await p
          .getByLabel("金額（不明なら空欄）", { exact: true })
          .fill(String(offer.price.amount + 1));
        await p
          .getByRole("button", { name: "編集内容を保留", exact: true })
          .click();
        await p
          .getByRole("button", { name: "編集内容を保留", exact: true })
          .click();
      }
      await shot(p, "campaign-detail", 1440);
      await p
        .getByRole("button", { name: "編集内容を保留", exact: true })
        .click();
      await save(p);
      await measure(p, "D", 10);
      await shot(p, "D", 1440);
      await submitMeasured(p, "D", 10);
      await context.close();
    }
    for (const width of [390, 1920]) {
      const { context, p } = await session(width);
      await p.locator("nav details[data-owner-only]").evaluate((node) => { node.open = true; });
    await p.locator('nav a[href="#anniversaries"]').click();
      await p
        .getByRole("button", { name: "新規記念日登録", exact: true })
        .waitFor();
      await shot(p, "anniversaries", width);
      await p
        .getByRole("button", {
          name: models.anniversaries.events[0].title,
          exact: true,
        })
        .click();
      await shot(p, "detail", width);
      await context.close();
    }
    await mixedScenario(true);
    if (shotDir)
      fs.writeFileSync(
        path.join(shotDir, "before-metrics.json"),
        JSON.stringify(measurements, null, 2),
      );
    return;
  }
  for (const width of [320, 390, 768, 1440, 1920]) {
    const { context, p, errors } = await session(width);
    await nav(p, "記念日");
    const table = p.locator(".list-region .data-table").first();
    assert((await table.locator("tbody>tr").count()) <= 50);
    await start(p);
    // Ten name edits require no detail-form round trips; Enter commits and restores cell focus.
    for (let i = 0; i < 10; i++)
      await editCell(
        p,
        table,
        i,
        "title",
        models.anniversaries.events[i].title + " P3",
      );
    await save(p);
    if (width === 1440) await measure(p, "A", 9);
    await shot(p, "anniversaries", width);
    let ws = await p.evaluate(
      async () => (await (await fetch("/api/workspace")).json()).workspace,
    );
    assert.equal(ws.operations.length, 10);
    assert(ws.operations.every((o) => o.entity === "anniversary"));
    // Undo/redo is the shared Workspace, not a table-only cache.
    await p.getByRole("button", { name: "元に戻す", exact: true }).click();
    assert.equal(await table.locator(".changed-cell").count(), 9);
    await p.getByRole("button", { name: "やり直す", exact: true }).click();
    assert.equal(await table.locator(".changed-cell").count(), 10);
    await save(p);
    await p.reload();
    await p.locator("#identity").filter({ hasText: "管理者" }).waitFor();
    await p.locator("nav details[data-owner-only]").evaluate((node) => { node.open = true; });
    await p.locator('nav a[href="#workspace"]').click();
    await p.locator("[data-save-state][data-state=saved]").waitFor();
    await p.getByRole("button",{name:"一括編集",exact:true}).click();
    await p.locator(".changed-cell").first().waitFor();
    // Search + type + visibility, sort, column preferences and keyboard cell navigation.
    const t = p.locator(".list-region .data-table").first();
    await t.getByRole("searchbox").fill("P3");
    assert.equal(await t.locator("tbody>tr").count(), 10);
    if (width < 768) await t.locator(".table-filter-details summary").click();
    await t
      .getByLabel("一覧の公開状態", { exact: true })
      .selectOption("public");
    await t.getByRole("button", { name: "日付", exact: true }).click();
    assert.equal(await t.locator("th[aria-sort=ascending]").count(), 1);
    await t.getByRole("button", { name: "条件を解除", exact: true }).click();
    await t.getByText("列表示・列幅", { exact: true }).click();
    await t.getByLabel("固定ID列を表示", { exact: true }).check();
    await t.getByLabel("固定IDの列幅", { exact: true }).fill("220");
    await t.getByText("列表示・列幅", { exact: true }).click();
    const cell = t.locator("tbody>tr").first().locator("td[data-column=title]");
    await cell.focus();
    await cell.press("ArrowRight");
    assert.equal(
      await p.evaluate(() => document.activeElement.dataset.column),
      "people",
    );
    await p.keyboard.press("ArrowLeft");
    await p.keyboard.press("Enter");
    await p.keyboard.press("Escape");
    await p.keyboard.press("Enter");
    await p.keyboard.press("Tab");
    assert.equal(
      await p.evaluate(() => document.activeElement.dataset.column),
      "people",
    );
    // VTuber ten-row bulk edit: no assumption that graduation implies retirement.
    await nav(p, "VTuber");
    await start(p);
    const talentTable = p.locator(".list-region .data-table").first();
    if (width < 768)
      await talentTable.locator(".table-filter-details summary").click();
    await talentTable
      .getByLabel("一覧の活動状態", { exact: true })
      .selectOption(sourceState);
    for (let i = 0; i < 10; i++)
      await talentTable
        .locator("tbody>tr")
        .nth(i)
        .locator("input[type=checkbox]")
        .check();
    await talentTable.getByLabel("一括変更する項目").selectOption("activity");
    await talentTable.getByLabel("一括変更後の値").selectOption(targetState);
    await talentTable.getByRole("button", { name: "選択行に一括適用" }).click();
    const modal = p.getByRole("dialog");
    assert.match(await modal.innerText(), /10件/);
    await modal.getByRole("button", { name: "キャンセル" }).focus();
    await p.keyboard.press("Shift+Tab");
    assert(
      await p.evaluate(() => document.activeElement.closest("dialog") !== null),
    );
    await modal.getByRole("button", { name: "下書きに適用" }).click();
    await save(p);
    if (width === 1440) await measure(p, "B", 9);
    await shot(p, "talents", width);
    ws = await p.evaluate(
      async () => (await (await fetch("/api/workspace")).json()).workspace,
    );
    assert.equal(ws.operations.length, 20);
    for (const op of ws.operations.filter((o) => o.entity === "talent")) {
      assert.equal(op.value.activityStatus.value, targetState);
      assert.deepEqual(op.value.agencyStatus, op.before.agencyStatus);
      assert.deepEqual(op.value.affiliations, op.before.affiliations);
    }
    // A bulk edit may remove rows from the active-state filter; reveal all before opening detail.
    await talentTable
      .getByRole("button", { name: "条件を解除", exact: true })
      .click();
    await talentTable
      .locator("tbody>tr")
      .first()
      .locator(".record-open")
      .click();
    await p.getByRole("button", { name: "編集", exact: true }).click();
    await shot(p, "detail", width);
    await p.locator(".panel-heading h2").focus();
    await p.keyboard.press("Escape");
    assert.equal(await p.locator(".detail-panel").count(), 0);
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    // Partial submission uses unchanged Phase 2 confirmation, leaving fifteen.
    await p
      .locator('nav a[href="#workspace"]')
      .first()
      .click();
    await p
      .getByRole("heading", { name: "変更ワークスペース", exact: true })
      .waitFor();
    await p.getByRole("button", { name: "選択解除", exact: true }).click();
    for (let i = 0; i < 5; i++)
      await p
        .locator("[data-workspace-operations] input[type=checkbox]")
        .nth(i)
        .check();
    await p
      .getByRole("button", { name: "選択した変更をプレビュー", exact: true })
      .click();
    await p.getByLabel("差分と参照影響を確認しました", { exact: true }).check();
    await p
      .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
      .click();
    await p.getByRole("heading", { name: "PRを作成しました" }).waitFor();
    ws = await p.evaluate(
      async () => (await (await fetch("/api/workspace")).json()).workspace,
    );
    assert.equal(ws.operations.length, 15);
    await shot(p, "submitted", width);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "Phase 3 inline/bulk/undo/reload/panel/partial-submit passed",
      width,
    );
  }
  if (shotDir)
    fs.writeFileSync(
      path.join(shotDir, "after-metrics.json"),
      JSON.stringify(measurements, null, 2),
    );
  // Inline save failure/CAS keep local values; invalid dates stay editable until cancelled.
  {
    const { context, p, errors } = await session();
    await nav(p, "記念日");
    const table = p.locator(".list-region .data-table").first();
    const date = table
      .locator("tbody>tr")
      .first()
      .locator("td[data-column=date]");
    await date.locator("button").click();
    await date.locator("input").fill("02-30");
    await date.locator("input").press("Enter");
    await date.locator("[aria-invalid=true]").waitFor();
    assert.match(await date.innerText(), /存在する日付/);
    await p.locator("nav details[data-owner-only]").evaluate((node) => { node.open = true; });
    await p.locator('nav a[href="#music"]').click();
    assert.equal(await p.evaluate(() => location.hash), "#anniversaries");
    assert.equal(await date.locator("input").inputValue(), "02-30");
    await date.locator("input").press("Escape");
    let fail = true;
    await p.route("**/api/workspace", (route) => {
      if (route.request().method() === "PUT" && fail) {
        fail = false;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "temporary_failure" }),
        });
      }
      return route.continue();
    });
    await editCell(
      p,
      table,
      0,
      "title",
      models.anniversaries.events[0].title + " 保存失敗",
    );
    await p.getByRole("button", { name: "下書きを保存", exact: true }).click();
    await p.locator("[data-save-state][data-state=failed]").waitFor();
    assert.equal(await table.locator(".changed-cell").count(), 1);
    await save(p);
    const foreign = await p.evaluate(async () => {
      const me = await (await fetch("/api/me")).json(),
        w = (await (await fetch("/api/workspace")).json()).workspace;
      w.operations[0].value.title += " 別タブ";
      return (
        await fetch("/api/workspace", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": me.csrf,
          },
          body: JSON.stringify({
            protocol: 1,
            revision: w.revision,
            operations: w.operations.map(({ validationState, ...op }) => op),
          }),
        })
      ).status;
    });
    assert.equal(foreign, 200);
    await editCell(
      p,
      table,
      0,
      "title",
      models.anniversaries.events[0].title + " 手元の入力",
    );
    await p.getByRole("button", { name: "下書きを保存", exact: true }).click();
    await p.locator("[data-save-state][data-state=conflict]").waitFor();
    assert.match(await table.innerText(), /手元の入力/);
    assert.deepEqual(errors, []);
    await shot(p, "save-conflict", 1440);
    await context.close();
    console.log(
      "Phase 3 invalid cell/save failure/foreign revision preserves inline drafts",
    );
  }

  // Event and Campaign hierarchies: use the same real records, mock GitHub.
  for (const scenario of ["C", "D"]) {
    const { context, p, errors } = await session();
    await nav(p, scenario === "C" ? "イベント" : "グッズ");
    await start(p);
    const table = p.locator(".list-region .data-table").first();
    if (scenario === "C") {
      for (let i = 0; i < 5; i++)
        await editCell(
          p,
          table,
          i,
          "title",
          models.events.events[i].title + " P3",
        );
      await save(p);
      await measure(p, "C", 4);
    } else {
      const campaign = models.goods.campaigns[0];
      await editCell(p, table, 0, "title", campaign.title + " P3");
      await table
        .locator("tbody>tr")
        .first()
        .locator("button.record-open")
        .click();
      const panel = p.locator(".detail-panel"),
        products = panel.locator('[data-data-table="商品"]'),
        offers = panel.locator('[data-data-table="キャンペーンの販売情報"]');
      assert((await products.locator("tbody>tr").count()) >= 5);
      for (let i = 0; i < 5; i++) {
        const old = models.goods.products.find(
          (v) =>
            v.id ===
            models.goods.offers.filter((o) => o.campaignId === campaign.id)[i]
              .productId,
        );
        await editCell(p, products, i, "title", old.title + " P3");
        await editCell(
          p,
          offers,
          i,
          "amount",
          String(
            models.goods.offers.filter((o) => o.campaignId === campaign.id)[i]
              .price.amount + 1,
          ),
        );
      }
      await shot(p, "campaign-detail", 1440);
      await p.locator(".panel-heading h2").focus();
      await p.keyboard.press("Escape");
      await save(p);
      await measure(p, "D", 10);
      const ws = await p.evaluate(
        async () => (await (await fetch("/api/workspace")).json()).workspace,
      );
      assert.equal(ws.operations.length, 11);
      await shot(p, "campaign", 1440);
    }
    assert.deepEqual(errors, []);
    await submitMeasured(p, scenario, scenario === "C" ? 4 : 10);
    await context.close();
  }
  {
    const { context, p, errors } = await session();
    await nav(p, "グッズ");
    const table = p.locator(".list-region .data-table").first(),
      campaign = models.goods.campaigns[0];
    await table.locator("tbody>tr").first().locator(".record-open").click();
    const external = models.goods.products.find(
      (r) =>
        !models.goods.offers.some(
          (o) => o.campaignId === campaign.id && o.productId === r.id,
        ),
    );
    await p
      .getByLabel("既存商品を再利用", { exact: true })
      .selectOption(external.id);
    await p
      .getByRole("button", { name: "選んだ商品の販売情報を追加", exact: true })
      .click();
    await p.getByLabel("金額（不明なら空欄）", { exact: true }).fill("100");
    await p
      .getByLabel("販売・コンテンツURL（必須）", { exact: true })
      .fill("https://example.com/fixture-reuse");
    await save(p);
    let ws = await p.evaluate(
      async () => (await (await fetch("/api/workspace")).json()).workspace,
    );
    const offer = ws.operations.find((o) => o.entity === "offer");
    assert.equal(offer.value.productId, external.id);
    assert.equal(offer.value.campaignId, campaign.id);
    assert.equal(
      ws.operations.some((o) => o.entity === "product"),
      false,
    );
    // Return to campaign, open one product, copy as a new unpublished draft without an ID/identity URL.
    await p
      .getByRole("button", { name: "編集内容を保留", exact: true })
      .click();
    const productTable = p.locator('[data-data-table="商品"]');
    await productTable
      .locator("tbody>tr")
      .first()
      .locator(".record-open")
      .click();
    await p
      .getByRole("button", { name: "商品を複製して新規下書き", exact: true })
      .click();
    await p
      .getByLabel("タイトル（必須）", { exact: true })
      .fill("複製した商品 fixture");
    await save(p);
    ws = await p.evaluate(
      async () => (await (await fetch("/api/workspace")).json()).workspace,
    );
    const copy = ws.operations.find((o) => o.entity === "product" && !o.id);
    assert(copy);
    assert.equal(copy.value.visibility, "draft");
    assert.equal(copy.value.identityUrl, "");
    assert.equal(copy.value.id, undefined);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "Phase 3 existing product reuse/copy keeps IDs and draft identity constraints",
    );
  }

  for (const scenario of ["A", "B"]) {
    const { context, p, errors } = await session();
    await nav(p, scenario === "A" ? "記念日" : "VTuber");
    await start(p);
    const table = p.locator(".list-region .data-table").first();
    if (scenario === "A") {
      for (let i = 0; i < 10; i++)
        await editCell(
          p,
          table,
          i,
          "title",
          models.anniversaries.events[i].title + " P3",
        );
    } else {
      await table
        .getByLabel("一覧の活動状態", { exact: true })
        .selectOption(sourceState);
      for (let i = 0; i < 10; i++)
        await table
          .locator("tbody>tr")
          .nth(i)
          .locator("input[type=checkbox]")
          .check();
      await table.getByLabel("一括変更する項目").selectOption("activity");
      await table.getByLabel("一括変更後の値").selectOption(targetState);
      await table.getByRole("button", { name: "選択行に一括適用" }).click();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "下書きに適用" })
        .click();
    }
    await save(p);
    await submitMeasured(p, scenario, 9);
    assert.deepEqual(errors, []);
    await context.close();
  }
  await mixedScenario(false);
  if (shotDir)
    fs.writeFileSync(
      path.join(shotDir, "after-metrics.json"),
      JSON.stringify(measurements, null, 2),
    );
}
