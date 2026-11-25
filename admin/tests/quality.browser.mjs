import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const advancedRoutes = { "VTuber": "#masters", "事務所・グループ": "#organizations", "記念日": "#anniversaries", "音楽": "#music", "イベント": "#events", "グッズ": "#goods", "変更内容": "#workspace", "提出済みPR": "#submitted", "設定": "#settings", "ダッシュボード": "#dashboard" };
async function advancedNav(p, name) {
  const route = advancedRoutes[name];
  const details = p.locator("nav details[data-owner-only]");
  if (route !== "#dashboard" && await details.count())
    await details.evaluate((node) => { node.open = true; });
  await p.locator('nav a[href="' + route + '"]').first().click();
}
async function enterAdvanced(p) {
  await p.locator("#identity").waitFor();
  if (await p.locator("nav details[data-owner-only]").count()) await advancedNav(p, "変更内容");
  await p.locator("[data-save-state][data-state=saved]").waitFor();
}

export async function qualityBrowser({
  browser,
  base,
  models,
  reset,
  advance,
  writes,
  metrics,
  dir,
  before = false,
}) {
  const report = {
    environment: {
      node: process.version,
      chromium: browser.version(),
      viewport: "1440x1000",
      backend: "Node mock Worker + encrypted store; not production Cloudflare",
    },
    performance: [],
    scenarios: [],
    accessibility: [],
    limits: { initialMs: 1500, interactionMs: 1000, heapMiB: 128 },
    before,
  };
  async function session(width = 1440) {
    reset();
    const c = await browser.newContext({
      viewport: { width, height: 1000 },
      colorScheme: width === 1024 ? "dark" : "light",
    });
    c.on("dialog", (d) => d.accept());
    await c.route("**/*", (r) =>
      r.request().url().startsWith(base) ? r.continue() : r.abort(),
    );
    const p = await c.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base);
    await p
      .getByRole("link", { name: "GitHubでログイン", exact: true })
      .click();
    await enterAdvanced(p);
    return { c, p, errors };
  }
  async function shot(p, name, width) {
    if (!dir || process.env.ADMIN_REPORT_ONLY) return;
    fs.mkdirSync(path.join(dir, "screens"), { recursive: true });
    await p.screenshot({
      path: path.join(
        dir,
        "screens",
        `${before ? "before" : "after"}-${name}-${width}.png`,
      ),
    });
  }
  async function nav(p, name) {
    await advancedNav(p, name);
    const targetType={VTuber:'talent','事務所・グループ':'organization','記念日':'anniversary','音楽':'song','イベント':'event','グッズ':'campaign'}[name];
    const targetTitle={VTuber:'VTuber','事務所・グループ':'事務所','記念日':'記念日','音楽':'楽曲','イベント':'イベント','グッズ':'キャンペーン'}[name];
    await p.locator(`.record-browser[data-entity="${targetType}"],.list-region [data-data-table="${targetTitle}"]`).first().waitFor();
    if(await p.getByRole("button",{name:"一括編集",exact:true}).count())await p.getByRole("button",{name:"一括編集",exact:true}).click();
    await p.locator(".list-region .data-table").first().waitFor();
  }
  async function save(p) {
    await p.getByRole("button", { name: "下書きを保存", exact: true }).click();
    await p.locator("[data-save-state][data-state=saved]").waitFor();
  }
  async function workspace(p) {
    return p.evaluate(
      async () =>
        (await (await fetch("/api/workspace")).json()).workspace || {
          operations: [],
          revision: 0,
        },
    );
  }
  async function cell(p, index, col, value) {
    const t = p.locator(".list-region .data-table").first(),
      td = t.locator("tbody>tr").nth(index).locator(`td[data-column="${col}"]`);
    await td.locator(".cell-editor").click();
    const input = td.locator("input,select");
    if ((await input.evaluate((e) => e.tagName)) === "SELECT")
      await input.selectOption(value);
    else await input.fill(value);
    await input.press("Enter");
  }
  async function review(p, partial) {
    await advancedNav(p, "変更内容");
    await p
      .getByRole("heading", { name: "変更ワークスペース", exact: true })
      .waitFor();
    if (partial) {
      await p.getByRole("button", { name: "選択解除", exact: true }).click();
      for (let i = 0; i < partial; i++)
        await p
          .locator("[data-workspace-operations] input[type=checkbox]")
          .nth(i)
          .check();
    }
    await p
      .getByRole("button", { name: "選択した変更をプレビュー", exact: true })
      .click();
  }
  async function submit(p) {
    await p
      .getByRole("heading", { name: "変更プレビュー", exact: true })
      .waitFor();
    await p.getByLabel("差分と参照影響を確認しました", { exact: true }).check();
    await p
      .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
      .click();
    await p
      .getByRole("heading", { name: "PRを作成しました", exact: true })
      .waitFor();
  }
  async function measure(p, name, fn) {
    let clicks = 0;
    await p.exposeFunction("qualityClick", () => clicks++);
    await p.evaluate(() =>
      document.addEventListener("click", (e) => {
        if (
          !e.target.closest("input:not([type=checkbox]),select,textarea,option")
        )
          window.qualityClick();
      }),
    );
    const start = performance.now();
    await fn();
    const requests = metrics();
    report.scenarios.push({
      name,
      ms: Math.round(performance.now() - start),
      clicks,
      requests: requests.length,
      maxGithubCalls: Math.max(0, ...requests.map((r) => r.githubCalls)),
      largestBodyBytes: Math.max(0, ...requests.map((r) => r.bodyBytes)),
      unexpectedPageErrors: 0,
      expectedFailureModes:
        name === "D"
          ? ["save 429", "successful PR response lost"]
          : name === "C"
            ? ["same-field conflict"]
            : [],
    });
  }
  async function twenty(p) {
    await nav(p, "VTuber");
    for (let i = 0; i < 5; i++) {
      const r = models.talents.talents[i];
      await cell(
        p,
        i,
        "activity",
        r.activityStatus.value === "hiatus" ? "unknown" : "hiatus",
      );
    }
    for (const [route, key, collection] of [
      ["記念日", "anniversaries", "events"],
      ["イベント", "events", "events"],
      ["グッズ", "goods", "products"],
    ]) {
      await nav(p, route);
      if (route === "グッズ")
        await p.getByRole("button", { name: "商品", exact: true }).click();
      for (let i = 0; i < 5; i++)
        await cell(
          p,
          i,
          "title",
          models[key][collection][i].title + " 品質編集",
        );
    }
    await save(p);
    assert.equal((await workspace(p)).operations.length, 20);
  }
  // Actual renderer, enlarged isolated records; no synthetic records enter Worker masters.
  for (const [entity, count] of [
    ["talent", 1000],
    ["anniversary", 5000],
    ["event", 2000],
    ["product", 5000],
    ["performance", 10000],
    ["offer", before ? 250 : 5000],
  ]) {
    const { p, c } = await session();
    const timing = await p.evaluate(
      async ({ entity, count, before, seed }) => {
        const { mountDataTable } = await import("/data-table.js"),
          { columnsFor } = await import("/table-columns.js");
        const forms = (await (await fetch("/api/forms")).json()).content;
        const lists = {
          talent: seed.talents.talents,
          anniversary: seed.anniversaries.events,
          event: seed.events.events,
          product: seed.goods.products,
          offer: seed.goods.offers,
          performance: seed.karaoke.performances,
        };
        const data = {
          song: seed.music.songs,
          video: seed.media.videos,
          product: Array.from({ length: 5000 }, (_, i) => ({
            ...seed.goods.products[0],
            id: "product-" + String(i + 1).padStart(6, "0"),
            title: "性能商品 " + i,
          })),
          offer: seed.goods.offers,
        };
        let records = Array.from({ length: count }, (_, i) => ({
          ...structuredClone(lists[entity][0]),
          visibility: "public",
          ...(entity === "performance" ? { rawLabel: "性能歌唱 " + i } : {}),
          id:
            (entity === "talent"
              ? "tal"
              : entity === "anniversary"
                ? "ann"
                : entity === "event"
                  ? "evt"
                  : entity === "performance"
                    ? "perf"
                    : entity) +
            "-" +
            String(i + 1).padStart(6, "0"),
          displayName: entity === "talent" ? "性能人物 " + i : undefined,
          title: entity === "performance" ? undefined : "性能記録 " + i,
          ...(entity === "offer"
            ? { productId: "product-" + String(i + 1).padStart(6, "0") }
            : {}),
        }));
        // undefined display fields are UI-only fixture properties, never saved.
        const build = (t) => structuredClone(data[t] || []);
        let allRows;
        if (before) allRows = build;
        else {
          const { projectionCache } = await import("/row-projection.js");
          const cache = projectionCache(build);
          allRows = (t) => cache.get(t);
        }
        const cols = columnsFor(entity, {
            models: seed,
            forms,
            rowsFor: allRows,
          }),
          root = document.querySelector("#view");
        let started = performance.now();
        const table = mountDataTable({
          container: root,
          title: "性能試験",
          columns: cols,
          rows: () => records,
          key: (r) => r.id,
          onChange: (changes) => {
            const map = new Map(changes.map((r) => [r.record.id, r.value]));
            records = records.map((r) => map.get(r.id) || r);
          },
          onOpen: () => {},
        });
        const initial = performance.now() - started;
        const run = (fn) => {
          const start = performance.now();
          fn();
          return performance.now() - start;
        };
        const input = root.querySelector("input[type=search]");
        const search = run(() => {
          input.value = "性能";
          input.dispatchEvent(new Event("input"));
        });
        const filter = run(() => {
          const s = root.querySelector('select[aria-label="一覧の公開状態"]');
          if (s) {
            s.value = "public";
            s.dispatchEvent(new Event("change"));
          }
        });
        const sort = run(() =>
          root.querySelectorAll("thead button")[0].click(),
        );
        const paging = run(() =>
          [...root.querySelectorAll(".table-pager button")].at(-1).click(),
        );
        const edit = run(() => {
          const td = root.querySelector("td[data-column] .cell-editor");
          if (td) {
            td.click();
            const input = root.querySelector("td input,td select");
            input.value += " 変更";
            input.dispatchEvent(
              new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
            );
          }
        });
        return {
          entity,
          count,
          initialMs: initial,
          searchMs: search,
          filterMs: filter,
          sortMs: sort,
          pageMs: paging,
          editMs: edit,
          domRows: root.querySelectorAll("tbody>tr").length,
        };
      },
      { entity, count, before, seed: models },
    );
    const cd = await c.newCDPSession(p);
    await cd.send("Performance.enable");
    const perf = await cd.send("Performance.getMetrics");
    timing.heapMiB =
      (perf.metrics.find((m) => m.name === "JSHeapUsedSize")?.value || 0) /
      1048576;
    report.performance.push(timing);
    assert.equal(timing.domRows, Math.min(50, count));
    if (!before) {
      assert(
        timing.initialMs < report.limits.initialMs,
        JSON.stringify(timing),
      );
      assert(
        Math.max(
          timing.searchMs,
          timing.filterMs,
          timing.sortMs,
          timing.pageMs,
          timing.editMs,
        ) < 1000,
        JSON.stringify(timing),
      );
      assert(timing.heapMiB < 128, JSON.stringify(timing));
    }
    await c.close();
    console.log(
      "Quality performance",
      entity,
      count,
      Math.round(timing.initialMs),
    );
  }
  if (before) {
    for (const width of [390, 1440]) {
      const { p, c } = await session(width);
      await nav(p, "記念日");
      await shot(p, "anniversaries", width);
      await p
        .locator(".list-region tbody input[type=checkbox]")
        .first()
        .check();
      await shot(p, "selection", width);
      await c.close();
    }
    if (dir) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "before-performance.json"),
        JSON.stringify(report, null, 2),
      );
    }
    return;
  }
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    const { p, c, errors } = await session(width);
    for (const [route, name] of [
      ["#dashboard", "ダッシュボード"],
      ["#masters", "VTuber"],
      ["#organizations", "事務所・グループ"],
      ["#anniversaries", "記念日"],
      ["#music", "音楽"],
      ["#events", "イベント"],
      ["#goods", "グッズ"],
      ["#workspace", "変更内容"],
      ["#submitted", "提出済みPR"],
      ["#settings", "設定"],
    ]) {
      await advancedNav(p, name);
      if (
        [
          "#masters",
          "#organizations",
          "#anniversaries",
          "#music",
          "#events",
          "#goods",
        ].includes(route)
      ){
        await nav(p,name);
      }
      else await p.locator("#view h2").first().waitFor();
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${name} ${width}`,
      );
      await shot(p, name, width);
    }
    await nav(p, "記念日");
    const table = p.locator(".list-region .data-table").first();
    await table
      .locator("tbody>tr")
      .first()
      .locator("input[type=checkbox]")
      .check();
    await table.getByRole("button", { name: "次へ", exact: true }).click();
    await table
      .locator("tbody>tr")
      .first()
      .locator("input[type=checkbox]")
      .check();
    await table.getByRole("searchbox").fill("絶対に一致しない文字列");
    await table.getByRole("button", { name: "選択中の項目だけを表示" }).click();
    assert.equal(await table.locator("tbody>tr").count(), 2);
    await table.getByText("選択対象を確認（2件）", { exact: true }).click();
    assert.equal(await table.locator(".table-bulk ul>li").count(), 2);
    await table.getByLabel("一括変更する項目").selectOption("visibility");
    await table.getByLabel("一括変更後の値").selectOption("draft");
    await table.getByRole("button", { name: "選択行に一括適用" }).click();
    const d = p.getByRole("dialog");
    await d.getByText("全対象を確認", { exact: true }).click();
    assert.equal(await d.locator("li").count(), 2);
    await d.getByRole("button", { name: "キャンセル" }).click();
    assert.equal((await workspace(p)).operations.length, 0);
    await p.locator(".skip-link").focus();
    await p.keyboard.press("Enter");
    assert.equal(
      await p.evaluate(() => document.activeElement.id),
      "main-content",
    );
    const ax = await p.locator("main").ariaSnapshot();
    assert(ax.includes("table"));
    report.accessibility.push({
      width,
      mode: width === 1024 ? "dark" : "light",
      documentOverflow: false,
      ariaTree: "native table, names, statuses verified",
      keyboard:
        "skip, native controls, dialog; Phase3 arrow/Enter/Esc/Tab regressions retained",
    });
    assert.deepEqual(errors, []);
    await c.close();
  }
  {
    const { p, c, errors } = await session();
    await nav(p, "記念日");
    await cell(
      p,
      0,
      "title",
      models.anniversaries.events[0].title + " 認証期限",
    );
    await c.clearCookies();
    await p.getByRole("button", { name: "下書きを保存", exact: true }).click();
    await p
      .getByRole("heading", { name: "ログインの有効期限が切れました" })
      .waitFor();
    await shot(p, "expired-session", 1440);
    const login = await c.newPage();
    await login.goto(base + "/auth/login");
    await enterAdvanced(login);
    await login.close();
    let writeAttempts = 0;
    const listener = (req) => {
      if (req.method() === "PUT" && req.url().endsWith("/api/workspace"))
        writeAttempts++;
    };
    p.on("request", listener);
    await p.route("**/api/me", async (r) => {
      const response = await r.fetch(),
        value = await response.json();
      return r.fulfill({ json: { ...value, id: "456" } });
    });
    await p
      .getByRole("button", { name: "ログインを確認して保存を再試行" })
      .click();
    await p.getByText(/別の管理者では再開できません/).waitFor();
    assert.equal(writeAttempts, 0);
    await p.unroute("**/api/me");
    await p
      .getByRole("button", { name: "ログインを確認して保存を再試行" })
      .click();
    await p.locator("#auth-recovery").waitFor({ state: "detached" });
    assert((await workspace(p)).operations[0].value.title.endsWith("認証期限"));
    assert.deepEqual(errors, []);
    await shot(p, "recovered-session", 1440);
    await c.close();
    report.sessionRecovery =
      "expired cookie → same-owner login/new CSRF → save; different-owner rejected without PUT";
  }
  {
    const { p, c, errors } = await session(720);
    await nav(p, "記念日");
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    report.accessibility.push({
      width: 720,
      evaluation:
        "200% reflow-equivalent of 1440 CSS pixels; not actual browser zoom or screen-reader certification",
      documentOverflow: false,
    });
    await shot(p, "reflow-equivalent", 720);
    assert.deepEqual(errors, []);
    await c.close();
  }
  {
    const { p, c, errors } = await session();
    const edits = [
      [
        "VTuber",
        null,
        "title",
        models.talents.talents[0].displayName + " 全種",
      ],
      [
        "事務所・グループ",
        "事務所",
        "title",
        models.talents.organizations[0].name + " 全種",
      ],
      [
        "事務所・グループ",
        "グループ",
        "title",
        models.catalog.groups[0].name + " 全種",
      ],
      ["記念日", null, "title", models.anniversaries.events[0].title + " 全種"],
      ["音楽", "楽曲", "title", models.music.songs[0].title + " 全種"],
      ["音楽", "歌動画", "title", "歌動画fixture 全種"],
      ["音楽", "歌枠", "setlistStatus", "partial"],
      ["音楽", "歌唱記録", "title", "歌唱記録fixture 全種"],
      ["音楽", "動画情報", "title", models.media.videos[0].title + " 全種"],
      ["イベント", null, "title", models.events.events[0].title + " 全種"],
      [
        "グッズ",
        "キャンペーン",
        "title",
        models.goods.campaigns[0].title + " 全種",
      ],
      ["グッズ", "商品", "title", models.goods.products[0].title + " 全種"],
      [
        "グッズ",
        "販売情報",
        "amount",
        String((models.goods.offers[0].price?.amount || 0) + 1),
      ],
    ];
    for (const [route, kind, col, value] of edits) {
      await nav(p, route);
      if (kind)
        await p.getByRole("button", { name: kind, exact: true }).click();
      await cell(p, 0, col, value);
    }
    await save(p);
    assert.equal(
      new Set((await workspace(p)).operations.map((o) => o.entity)).size,
      13,
    );
    await review(p);
    await submit(p);
    assert.equal(writes(), 1);
    assert.deepEqual(errors, []);
    report.currentCategories =
      "13 entity types edited through UI in one current-master PR";
    await c.close();
  }
  {
    const { p, c, errors } = await session();
    await nav(p, "VTuber");
    await p.getByRole("button", { name: "新規登録", exact: true }).click();
    await p.getByLabel("表示名", { exact: true }).fill("品質fixture新規VTuber");
    await save(p);
    await nav(p, "記念日");
    await p
      .getByRole("button", { name: "新規記念日登録", exact: true })
      .click();
    await p
      .getByLabel("タイトル（必須）", { exact: true })
      .fill("品質fixture新規記念日");
    await p.getByLabel("公開状態", { exact: true }).selectOption("draft");
    await p.getByLabel("月（必須）", {exact:true}).fill("12");
    await p.getByLabel("日（必須）", {exact:true}).fill("31");
    await p.getByRole("button", { name: "関連・出演者", exact: true }).click();
    const select = p.getByLabel("タレント", { exact: true }),
      id = await select
        .locator("option")
        .filter({ hasText: "品質fixture新規VTuber" })
        .getAttribute("value");
    assert(id.startsWith("@"));
    await select.selectOption([id]);
    await save(p);
    await review(p);
    await submit(p);
    assert.equal(writes(), 1);
    assert.deepEqual(errors, []);
    report.newLinkedTalent =
      "unissued talent selected by name in new anniversary; one atomic PR";
    await c.close();
  }
  for (const scenario of ["A", "B", "C", "D", "E"]) {
    const { p, c, errors } = await session();
    await measure(p, scenario, async () => {
      if (["A", "B", "D"].includes(scenario)) {
        await twenty(p);
        await p.reload();
        await p.locator("[data-save-state][data-state=saved]").waitFor();
        assert.equal((await workspace(p)).operations.length, 20);
      }
      if (scenario === "A") {
        await review(p);
        await submit(p);
        assert.equal((await workspace(p)).operations.length, 0);
        assert.equal(writes(), 1);
      }
      if (scenario === "B") {
        await review(p, 5);
        await submit(p);
        assert.equal((await workspace(p)).operations.length, 15);
        await nav(p, "グッズ");
        await p.getByRole("button", { name: "商品", exact: true }).click();
        await cell(p, 5, "title", models.goods.products[5].title + " 追加");
        await save(p);
        await review(p);
        await submit(p);
        assert.equal((await workspace(p)).operations.length, 0);
        assert.equal(writes(), 2);
      }
      if (scenario === "C") {
        await nav(p, "VTuber");
        await cell(
          p,
          0,
          "title",
          models.talents.talents[0].displayName + " 自分",
        );
        await save(p);
        advance();
        await review(p);
        await p
          .getByRole("heading", { name: "競合を解決してください", exact: true })
          .waitFor();
        await p.locator(".conflict-field select").selectOption("ours");
        await shot(p, "conflict", 1440);
        await p.getByRole("button", { name: "選択内容を下書きへ保存" }).click();
        await p
          .getByRole("button", {
            name: "選択した変更をプレビュー",
            exact: true,
          })
          .click();
        await submit(p);
        assert.equal(writes(), 1);
      }
      if (scenario === "D") {
        await nav(p, "記念日");
        await cell(
          p,
          5,
          "title",
          models.anniversaries.events[5].title + " 障害",
        );
        let fail = true;
        await p.route("**/api/workspace", (r) => {
          if (fail && r.request().method() === "PUT") {
            fail = false;
            return r.fulfill({ status: 429, json: { error: "rate_limit" } });
          }
          return r.continue();
        });
        await p
          .getByRole("button", { name: "下書きを保存", exact: true })
          .click();
        await p.locator("[data-save-state][data-state=failed]").waitFor();
        await shot(p, "save-error", 1440);
        await save(p);
        await review(p);
        let lost = true;
        await p.route("**/api/submissions", async (r) => {
          if (lost && r.request().method() === "POST") {
            lost = false;
            await r.fetch();
            return r.abort("failed");
          }
          return r.continue();
        });
        await p
          .getByLabel("差分と参照影響を確認しました", { exact: true })
          .check();
        await p
          .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
          .click();
        await p.locator("[data-submission-error]").waitFor();
        await p
          .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
          .click();
        await p.getByRole("heading", { name: "PRを作成しました" }).waitFor();
        assert.equal(writes(), 1);
        assert.equal((await workspace(p)).operations.length, 0);
      }
      if (scenario === "E") {
        for (const [route, button, file, list, field] of [
          ["VTuber", null, "talents", "talents", "displayName"],
          ["記念日", null, "anniversaries", "events", "title"],
          ["音楽", "楽曲", "music", "songs", "title"],
          ["グッズ", "商品", "goods", "products", "title"],
          ["音楽", "歌唱記録", "karaoke", "performances", "rawLabel"],
        ]) {
          await nav(p, route);
          if (button)
            await p.getByRole("button", { name: button, exact: true }).click();
          for (let i = 0; i < 20; i++)
            await cell(
              p,
              i,
              "title",
              models[file][list][i][field] + " 大量更新",
            );
        }
        await save(p);
        assert.equal((await workspace(p)).operations.length, 100);
        await review(p, 60);
        await submit(p);
        assert.equal((await workspace(p)).operations.length, 40);
        await review(p);
        await submit(p);
        assert.equal((await workspace(p)).operations.length, 0);
        assert.equal(writes(), 2);
      }
    });
    assert.deepEqual(errors, []);
    await shot(p, "scenario-" + scenario, 1440);
    await c.close();
    console.log("Quality scenario", scenario, "passed");
  }
  assert(report.scenarios.every((r) => r.maxGithubCalls <= 45));
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "quality-report.json"),
      JSON.stringify(report, null, 2),
    );
  }
  return report;
}
