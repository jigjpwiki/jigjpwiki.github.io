import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Admin } from "../src/worker.mjs";
import { random } from "../src/security.mjs";
import { readFiles as files, filePath } from "../src/github.mjs";
const require = createRequire(import.meta.url),
  { chromium } = require("../../node_modules/playwright");
const root = path.resolve(import.meta.dirname, "../.."),
  models = Object.fromEntries(
    files.map((n) => [
      n,
      JSON.parse(fs.readFileSync(path.join(root, filePath(n)))),
    ]),
  );
const data = new Map();
let lastPreview;
const originalModels = JSON.stringify(models);
let writes = 0,
  created = false,
  rejectPR = false;
const transport = async (url, opts = {}) => {
  const u = new URL(url),
    p = u.pathname;
  let result;
  if (p === "/login/oauth/access_token")
    result = { access_token: "fixture-not-secret" };
  else if (p === "/user") result = { id: 123, login: "管理者fixture" };
  else if (p.endsWith("/pulls") && opts.method === "POST") {
    if (rejectPR) {
      rejectPR = false;
      return new Response("UNSAFE REMOTE BODY", { status: 403 });
    }
    writes++;
    created = true;
    result = {
      number: 999,
      html_url: "https://github.com/jigjpwiki/jigjpwiki.github.io/pull/999",
    };
  } else if (p.endsWith("/pulls"))
    result = created
      ? [
          {
            number: 999,
            html_url:
              "https://github.com/jigjpwiki/jigjpwiki.github.io/pull/999",
          },
        ]
      : [];
  else if (p.endsWith("/git/ref/heads/main"))
    result = { object: { sha: "main-sha" } };
  else if (p.includes("/git/ref/heads/admin/"))
    return new Response("{}", { status: 404 });
  else if (p.includes("/git/commits/") || p.endsWith("/git/commits"))
    result =
      opts.method === "POST"
        ? { sha: "new-commit" }
        : { tree: { sha: "main-tree" } };
  else if (p.endsWith("/git/trees/main-tree"))
    result = {
      tree: files.map((n) => ({ path: filePath(n), type: "blob", sha: n })),
      truncated: false,
    };
  else if (p.includes("/git/blobs/")) {
    const n = p.split("/").pop(),
      content = JSON.stringify(models[n]);
    result = {
      size: Buffer.byteLength(content),
      encoding: "base64",
      content: Buffer.from(content).toString("base64"),
    };
  } else if (p.endsWith("/git/trees")) result = { sha: "new-tree" };
  else result = { default_branch: "main", permissions: { push: true } };
  return Response.json(result);
};
const env = {
  GITHUB_CLIENT_ID: "fixture",
  GITHUB_CLIENT_SECRET: "fixture",
  SESSION_KEY: random(),
  ADMIN_USER_IDS: "123",
  __testFetch: transport,
  __testStore: {
    get: async (k) => {
      const v = data.get(k);
      return v?.expires > Date.now() ? v.value : null;
    },
    put: async (k, value, expires) => data.set(k, { value, expires }),
    delete: async (k) => data.delete(k),
  },
};
const worker = new Admin({ blockConcurrencyWhile: (f) => f() }, env);
let base;
const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/fixture-authorize")) {
      const state = new URL(base + req.url).searchParams.get("state");
      res.writeHead(302, {
        Location: base + "/auth/callback?code=fixture&state=" + state,
      });
      return res.end();
    }
    if (req.url.startsWith("/api/") || req.url.startsWith("/auth/")) {
      const body = await new Promise((resolve) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => resolve(Buffer.concat(chunks)));
      });
      if (req.url === "/api/change-requests/preview")
        lastPreview = JSON.parse(body.toString());
      const response = await worker.fetch(
        new Request(base + req.url, {
          method: req.method,
          headers: req.headers,
          ...(body.length ? { body } : {}),
        }),
      );
      res.statusCode = response.status;
      response.headers.forEach((v, k) => {
        if (k !== "set-cookie") res.setHeader(k, v);
      });
      if (
        response.headers
          .get("Location")
          ?.startsWith("https://github.com/login/oauth/authorize")
      ) {
        const auth = new URL(response.headers.get("Location"));
        assert(auth.searchParams.get("code_challenge"));
        res.setHeader(
          "Location",
          base + "/fixture-authorize?state=" + auth.searchParams.get("state"),
        );
      }
      if (response.headers.getSetCookie().length)
        res.setHeader("Set-Cookie", response.headers.getSetCookie());
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    const file = path.join(
      root,
      process.env.ADMIN_PUBLIC_ROOT || "admin/public",
      req.url === "/" ? "index.html" : req.url,
    );
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; connect-src 'self'; img-src 'self' https:; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    res.end(fs.readFileSync(file));
  } catch (error) {
    console.error(error.message);
    res.writeHead(500).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
try {
  for (const width of [320, 390, 768, 1440]) {
    data.clear();
    created = false;
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    await context.route(
      /^https:\/\/github\.com\/login\/oauth\/authorize/,
      async (route) => {
        const url = new URL(route.request().url());
        await route.fulfill({
          status: 302,
          headers: {
            Location:
              base +
              "/auth/callback?code=fixture&state=" +
              url.searchParams.get("state"),
          },
        });
      },
    );
    await context.route("**/*", (r) =>
      r.request().url().startsWith(base) ? r.continue() : r.abort(),
    );
    const p = await context.newPage(),
      errors = [];
    p.on("pageerror", (e) => {
      errors.push(e.message);
      console.error("pageerror", e.message);
    });
    await p.goto(base);
    await p.getByRole("link", { name: "GitHubでログイン" }).click();
    try {
      await p.getByText("管理者fixture / 管理者", { exact: false }).waitFor();
    } catch (e) {
      console.error("UI", await p.locator("body").innerText());
      throw e;
    }
    await p
      .getByRole("link", { name: "VTuber", exact: true })
      .focus();
    await p.keyboard.press("Enter");
    // Edit Lee through the actual form: optional URL round-trip must preserve Wiki refs.
    await p
      .getByRole("searchbox", { name: "名前・IDで検索" })
      .fill("李じゅぴ汰");
    await p.getByRole("button", { name: "李じゅぴ汰", exact: true }).click();
    await p.getByRole("button", { name: "編集", exact: true }).click();
    const lee = models.talents.talents.find((t) => t.id === "tal-000004");
    const image = p.getByRole("textbox", {
      name: "プロフィール画像URL",
      exact: true,
    });
    await image.fill("https://example.com/unavailable.png");
    await p.getByRole("tab", { name: "SNS・リンク", exact: true }).click();
    const wiki = p.getByRole("textbox", { name: "非公式WikiURL", exact: true });
    await wiki.fill("");
    await wiki.fill(lee.wiki.url);
    assert.equal(await p.locator(".source-picker").count(), 0);
    await p.getByRole("tab", { name: "所属・活動", exact: true }).click();
    await p
      .getByRole("button", { name: "所属履歴を追加", exact: true })
      .click();
    const affiliation = p.locator(".array-card").last();
    await affiliation
      .getByRole("searchbox", { name: "事務所を検索" })
      .fill(models.talents.organizations[0].name);
    await affiliation
      .getByRole("combobox", { name: "事務所", exact: true })
      .selectOption(models.talents.organizations[0].id);
    p.once("dialog", (d) => d.accept());
    await affiliation.getByRole("button", { name: /を削除$/ }).click();
    await p.getByRole("tab", { name: "SNS・リンク", exact: true }).click();
    await p
      .getByRole("button", { name: "SNS・公式アカウントを追加", exact: true })
      .click();
    const account = p.locator(".array-card").last();
    await account
      .getByRole("combobox", { name: "サービス", exact: true })
      .selectOption("twitch");
    p.once("dialog", (d) => d.accept());
    await account.getByRole("button", { name: /を削除$/ }).click();
    await p.getByRole("button", { name: "変更を確認", exact: true }).click();
    // Missing reason/confirmation errors link to the offending field, including keyboard activation.
    await p
      .getByRole("button", { name: "変更プレビュー", exact: true })
      .click();
    await p.locator(".error-summary button").first().focus();
    await p.keyboard.press("Enter");
    assert.equal(
      await p
        .getByRole("textbox", { name: "変更理由", exact: true })
        .getAttribute("aria-invalid"),
      "true",
    );
    await p
      .getByRole("textbox", { name: "変更理由", exact: true })
      .fill("画像のみの変更・他の項目保持の回帰検証");
    await p.locator("#change-confirmed").check();
    await p
      .getByRole("button", { name: "変更プレビュー", exact: true })
      .click();
    await p
      .getByRole("heading", { name: "変更プレビュー", exact: true })
      .waitFor();
    if (process.env.ADMIN_SCREENSHOTS)
      await p.screenshot({
        path: path.join(
          process.env.ADMIN_SCREENSHOTS,
          `admin-image-preview-${width}.png`,
        ),
        fullPage: true,
      });
    const expected = structuredClone(lee);
    expected.profileImage.url = "https://example.com/unavailable.png";
    assert.deepEqual(lastPreview.value, expected);
    assert.deepEqual(lastPreview.value.wiki, lee.wiki);
    assert(!JSON.stringify(lastPreview).includes("sourceRefs"));
    assert.equal(JSON.stringify(models), originalModels);
    await p
      .getByRole("button", {
        name: "編集に戻る（再プレビューが必要）",
        exact: true,
      })
      .click();
    p.once("dialog", (d) => d.dismiss());
    await p.getByRole("button", { name: "一覧へ戻る", exact: true }).click();
    await p.getByRole("tab", { name: "基本情報", exact: true }).waitFor();
    p.once("dialog", (d) => d.accept());
    await p.getByRole("button", { name: "一覧へ戻る", exact: true }).click();
    await p.getByRole("searchbox", { name: "名前・IDで検索" }).fill("真昼ねる");
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.getByRole("button", { name: "真昼ねる", exact: true }).click();
    if (process.env.ADMIN_SCREENSHOTS) {
      fs.mkdirSync(process.env.ADMIN_SCREENSHOTS, { recursive: true });
      await p.screenshot({
        path: path.join(
          process.env.ADMIN_SCREENSHOTS,
          "admin-detail-" + width + ".png",
        ),
        fullPage: true,
      });
    }
    await p.getByRole("button", { name: "編集", exact: true }).click();
    if (process.env.ADMIN_SCREENSHOTS)
      await p.screenshot({
        path: path.join(
          process.env.ADMIN_SCREENSHOTS,
          `admin-editor-${width}.png`,
        ),
        fullPage: true,
      });
    await p.emulateMedia({ colorScheme: "dark" });
    if (process.env.ADMIN_SCREENSHOTS)
      await p.screenshot({
        path: path.join(
          process.env.ADMIN_SCREENSHOTS,
          `admin-editor-dark-${width}.png`,
        ),
        fullPage: true,
      });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.emulateMedia({ colorScheme: "light" });
    const name = p.getByRole("textbox", { name: "表示名", exact: true });
    await name.fill("真昼ねる（確認）");
    await name.press("Tab");
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.getByRole("button", { name: "変更を確認", exact: true }).click();
    await p
      .getByRole("textbox", { name: "変更理由", exact: true })
      .fill("ブラウザーE2Eの検証");
    await p.locator("#change-confirmed").check();
    await p
      .getByRole("button", { name: "変更プレビュー", exact: true })
      .click();
    await p
      .getByRole("heading", { name: "変更プレビュー", exact: true })
      .waitFor();
    assert.match(await p.locator("#status").innerText(), /プレビュー済み/);
    assert.equal(
      await p
        .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
        .isEnabled(),
      false,
    );
    if (process.env.ADMIN_SCREENSHOTS)
      await p.screenshot({
        path: path.join(
          process.env.ADMIN_SCREENSHOTS,
          `admin-preview-${width}.png`,
        ),
        fullPage: true,
      });
    await p.locator("#preview-confirmed").check();
    if (width === 320) rejectPR = true;
    await p
      .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
      .click();
    if (width === 320) {
      await p.waitForFunction(() =>
        document.querySelector("#status").textContent.includes("github_403"),
      );
      assert(
        !(await p.locator("body").innerText()).includes("UNSAFE REMOTE BODY"),
      );
      await p
        .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
        .click();
    }
    await p.getByRole("heading", { name: "PRを作成しました" }).waitFor();
    assert.equal(
      await p
        .getByRole("link", { name: "GitHubでPR #999を確認" })
        .getAttribute("href"),
      "https://github.com/jigjpwiki/jigjpwiki.github.io/pull/999",
    );
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    if (process.env.ADMIN_SCREENSHOTS) {
      fs.mkdirSync(process.env.ADMIN_SCREENSHOTS, { recursive: true });
      await p.screenshot({
        path: path.join(
          process.env.ADMIN_SCREENSHOTS,
          "admin-result-" + width + ".png",
        ),
        fullPage: true,
      });
    }
    created = false;
    await p.getByRole("button", { name: "一覧へ戻る", exact: true }).click();
    await p.getByRole("button", { name: "新規登録", exact: true }).click();
    await p
      .getByRole("textbox", { name: "表示名", exact: true })
      .fill("テスト専用VTuber");
    await p.getByRole("textbox", { name: "表示名", exact: true }).press("Tab");
    assert.equal(await p.locator(".source-picker").count(), 0);
    await p.getByRole("button", { name: "変更を確認", exact: true }).click();
    await p
      .getByRole("textbox", { name: "変更理由", exact: true })
      .fill("新規登録E2E fixture");
    await p.locator("#change-confirmed").check();
    await p
      .getByRole("button", { name: "変更プレビュー", exact: true })
      .click();
    await p
      .getByRole("heading", { name: "変更プレビュー", exact: true })
      .waitFor();
    await p.locator("#preview-confirmed").check();
    if (width === 320) rejectPR = true;
    await p
      .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
      .click();
    if (width === 320) {
      await p.waitForFunction(() =>
        document.querySelector("#status").textContent.includes("github_403"),
      );
      assert(
        !(await p.locator("body").innerText()).includes("UNSAFE REMOTE BODY"),
      );
      await p
        .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
        .click();
    }
    await p.getByRole("heading", { name: "PRを作成しました" }).waitFor();
    await p.getByRole("button", { name: "一覧へ戻る", exact: true }).click();
    await p.getByRole("button", { name: "事務所", exact: true }).click();
    const organization = models.talents.organizations[0];
    await p
      .getByRole("searchbox", { name: "名前・IDで検索" })
      .fill(organization.name);
    await p
      .getByRole("button", { name: organization.name, exact: true })
      .click();
    await p.getByRole("button", { name: "編集", exact: true }).click();
    assert.equal(
      await p.getByRole("textbox", { name: "名前", exact: true }).inputValue(),
      organization.name,
    );
    await p.getByRole("button", { name: "一覧へ戻る", exact: true }).click();
    await p.getByRole("button", { name: "グループ", exact: true }).click();
    const group = models.catalog.groups[0];
    await p.getByRole("searchbox", { name: "名前・IDで検索" }).fill(group.name);
    await p.getByRole("button", { name: group.name, exact: true }).click();
    await p.getByRole("button", { name: "編集", exact: true }).click();
    assert.deepEqual(
      await p
        .getByRole("listbox", { name: "メンバー", exact: true })
        .evaluate((e) => [...e.selectedOptions].map((o) => o.value)),
      group.talentIds,
    );
    await p.getByRole("tab", { name: "基本情報", exact: true }).focus();
    await p.keyboard.press("ArrowRight");
    assert.equal(
      await p
        .getByRole("tab", { name: "変更履歴", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    await p.emulateMedia({ colorScheme: "dark" });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.getByRole("button", { name: "一覧へ戻る", exact: true }).click();
    await p.getByRole("button", { name: "VTuber", exact: true }).click();
    await p.getByRole("button", { name: "ログアウト", exact: true }).click();
    await p.getByRole("link", { name: "GitHubでログイン" }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "Admin browser E2E passed",
      width,
      "login → search → edit → preview → mocked PR → logout",
    );
    await context.close();
  }
  assert.equal(writes, 8);
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
