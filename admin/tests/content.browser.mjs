const advancedRoutes = {"VTuber": "#masters", "事務所・グループ": "#organizations", "記念日": "#anniversaries", "イベント": "#events", "音楽": "#music", "グッズ": "#goods", "変更内容": "#workspace", "提出済みPR": "#submitted", "設定": "#settings"};
import { cmsOwnerBrowser } from "./cms-owner.browser.mjs";
import {vnext5Browser} from "./vnext5.browser.mjs";
import {AsyncLocalStorage} from 'node:async_hooks';
import {qualityBrowser} from './quality.browser.mjs';
import {baselineModels,currentModels} from './baseline.mjs';
import { phase3Browser } from './phase3.browser.mjs';
import { submissionBrowser } from "./submission.browser.mjs";
import { workspaceBrowser } from "./workspace.browser.mjs";
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
  models = (process.env.ADMIN_QUALITY_ONLY||process.env.ADMIN_VNEXT5_ONLY)?currentModels():baselineModels();
const data = new Map(),requestScope=new AsyncLocalStorage(),requestMetrics=[];
let lastPreview, lastSubmissionPlan;
const cmsMainSha = "a".repeat(40);
let mainSha = "main-sha";
let mainModels = structuredClone(models),
  headSha = "new-commit",
  commitSerial = 0;
const createdBranches = new Set();
const originalModels = JSON.stringify(models);
let writes = 0,
  created = false,
  rejectPR = false;
const transport = async (url, opts = {}) => {
  const active=requestScope.getStore();if(active)active.githubCalls++;
  const u = new URL(url),
    p = u.pathname;
  let result;
  if (u.hostname === "raw.githubusercontent.com") {
    const file = p.split("/").at(-1).replace(/\.json$/, "");
    assert.ok(Object.hasOwn(mainModels, file), "Unexpected master read " + file);
    result = mainModels[file];
  } else if (p === "/login/oauth/access_token")
    result = { access_token: "fixture-not-secret" };
  else if (p === "/user") result = { id: 123, login: "管理者fixture" };
  else if (p.endsWith("/pulls") && opts.method === "POST") {
    if (rejectPR) {
      rejectPR = false;
      return new Response("UNSAFE REMOTE BODY", { status: 403 });
    }
    writes++;
    created = true;
    createdBranches.add(JSON.parse(opts.body).head);
    result = {
      number: 999,
      html_url: "https://github.com/jigjpwiki/jigjpwiki.github.io/pull/999",
    };
  } else if (/\/pulls\/\d+$/.test(p))
    result = {
      number: 999,
      title: "Admin fixture",
      html_url: "https://github.com/jigjpwiki/jigjpwiki.github.io/pull/999",
      state: "open",
      merged: false,
      base: { ref: "main" },
      head: {
        repo: { full_name: "jigjpwiki/jigjpwiki.github.io" },
        ref: [...createdBranches].at(-1),
        sha: headSha,
      },
      mergeable: true,
      mergeable_state: "clean",
    };
  else if (p.includes("/check-runs"))
    result = {
      check_runs: [
        {
          name: "test",
          status: "completed",
          conclusion: "success",
          html_url:
            "https://github.com/jigjpwiki/jigjpwiki.github.io/actions/runs/1",
        },
      ],
    };
  else if (p.includes("/status")) result = { statuses: [] };
  else if (p.includes("/protection/")) result = { contexts: ["test"] };
  else if (p.includes("/rules/branches/")) result = [];
  else if (p.includes("/git/refs/heads/") && opts.method === "PATCH") {
    const v = JSON.parse(opts.body);
    assert.equal(v.force, false);
    headSha = v.sha;
    result = { object: { sha: headSha } };
  } else if (p.endsWith("/git/refs") && opts.method === "POST") {
    headSha = JSON.parse(opts.body).sha;
    result = {};
  } else if (p.endsWith("/pulls"))
    result = createdBranches.has(u.searchParams.get("head")?.split(":")[1])
      ? [
          {
            number: 999,
            html_url:
              "https://github.com/jigjpwiki/jigjpwiki.github.io/pull/999",
          },
        ]
      : [];
  else if (p.endsWith("/git/ref/heads/main"))
    result = { object: { sha: mainSha } };
  else if (p.includes("/git/ref/heads/admin/"))
    return new Response("{}", { status: 404 });
  else if (p.includes("/git/commits/") || p.endsWith("/git/commits"))
    result =
      opts.method === "POST"
        ? { sha: "new-commit-" + ++commitSerial }
        : { tree: { sha: "tree--" + p.split("/").pop() } };
  else if (p.includes("/git/trees/tree--")) {
    const revision = p.split("tree--")[1];
    result = {
      tree: files.map((n) => ({
        path: filePath(n),
        type: "blob",
        sha: "blob--" + revision + "--" + n,
      })),
      truncated: false,
    };
  } else if (p.includes("/git/blobs/")) {
    const [_, revision, n] = p.split("/").pop().split("--");
    const content = JSON.stringify(
      (revision === "main-sha" ? models : mainModels)[n],
    );
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
      if (
        ["/api/change-requests/preview", "/api/submissions/preview"].includes(
          req.url,
        )
      )
        lastPreview = JSON.parse(body.toString());
      const metric={path:req.url,method:req.method,bodyBytes:body.length,githubCalls:0},start=performance.now();
      const response = await requestScope.run(metric,()=>worker.fetch(
        new Request(base + req.url, {
          method: req.method,
          headers: req.headers,
          ...(body.length ? { body } : {}),
        }),
      ));metric.ms=performance.now()-start;requestMetrics.push(metric);
      if (req.url === "/api/submissions/preview" && response.ok)
        lastSubmissionPlan = await response.clone().json();
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
    if (!fs.existsSync(file)) return res.writeHead(404).end();
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
const shotDir = process.env.ADMIN_CONTENT_SCREENSHOTS;
const existingVideo = models.media.videos.find(
  (v) =>
    !models.karaoke.karaokes.some((k) => k.youtubeId === v.youtubeId) &&
    !models.music.musicVideos.some((k) => k.youtubeId === v.youtubeId),
);
const singer = models.talents.talents.find((t) =>
  t.accounts.some(
    (a) => a.service === "youtube" && a.accountId === existingVideo.channelId,
  ),
).id;
const tab = async (p, name) =>
  p.getByRole("button", { name, exact: true }).click();
const set = async (p, label, value) =>
  p.getByLabel(label, { exact: true }).fill(value);
const select = async (p, label, value) =>
  p.getByLabel(label, { exact: true }).selectOption(value);
async function newRecord(p, type) {
  await p.getByRole("button", { name: type, exact: true }).click();
  await p
    .getByRole("button", { name: "新規" + type + "登録", exact: true })
    .click();
}
async function title(p, text) {
  await set(p, "タイトル（必須）", text);
}
async function cast(p, ids) {
  await tab(p, "関連・出演者");
  await select(p, "タレント", ids);
  await tab(p, "基本情報");
}
async function publicState(p) {
  await select(p, "公開状態", "public");
}
let captureCase, captureWidth;
async function stage(p) {
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    "Editor must fit the viewport",
  );
  if (shotDir && [390, 768, 1440].includes(captureWidth)) {
    fs.mkdirSync(shotDir, { recursive: true });
    await p.screenshot({
      path: path.join(shotDir, `${captureCase}-form-${captureWidth}.png`),
      fullPage: true,
    });
  }
  await tab(p, "編集内容を保留");
}
async function review(p, name, width) {
  await p.getByRole("button", { name: /一括プレビュー/ }).click();
  await p
    .getByRole("heading", { name: "一括登録の確認", exact: true })
    .waitFor();
  await set(p, "変更理由", "モック環境で登録内容を確認");
  await p
    .getByLabel("変更内容と関連付けを確認しました", { exact: true })
    .check();
  await tab(p, "変更プレビュー");
  try {
    await p
      .getByRole("heading", { name: "変更プレビュー", exact: true })
      .waitFor({ timeout: 10000 });
  } catch (e) {
    console.error("Review failure", name, await p.locator("body").innerText());
    throw e;
  }
  assert.equal(lastPreview.protocol, 2);
  assert(lastSubmissionPlan.confirmationHash);
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  if (shotDir && [390, 1440].includes(width)) {
    fs.mkdirSync(shotDir, { recursive: true });
    await p.screenshot({
      path: path.join(shotDir, `${name}-preview-${width}.png`),
      fullPage: false,
    });
  }
}
async function publish(p) {
  await p.getByLabel("差分と参照影響を確認しました", { exact: true }).check();
  await tab(p, "確認した変更でPRを作成");
  await p
    .getByRole("heading", { name: "PRを作成しました", exact: true })
    .waitFor();
}
async function productAndOffer(p, name) {
  await tab(p, "商品を追加");
  await title(p, name);
  await cast(p, ["tal-000010"]);
  await publicState(p);
  await tab(p, "販売情報を追加");
  await set(p, "金額（不明なら空欄）", "1000");
  await select(p, "通貨", "JPY");
  await set(
    p,
    "販売・コンテンツURL（必須）",
    "https://store.example/" + encodeURIComponent(name),
  );
  await publicState(p);
  await stage(p);
  await stage(p);
}
const cases = [
  [
    "anniversary",
    "記念日",
    async (p) => {
      await newRecord(p, "記念日");
      await title(p, "fixture 誕生日");
      await set(p, "月（必須）", "8");
      await set(p, "日（必須）", "13");
      await cast(p, ["tal-000001"]);
      await publicState(p);
      await stage(p);
    },
  ],
  [
    "anniversary-edit",
    "記念日",
    async (p) => {
      const row = models.anniversaries.events[0];
      await p.getByRole("button", { name: row.title, exact: true }).click();
      await title(p, row.title + "（編集fixture）");
      await stage(p);
    },
  ],
  [
    "song",
    "音楽",
    async (p) => {
      await newRecord(p, "楽曲");
      await title(p, "fixture song");
      await set(
        p,
        "作品・商品の公式URL",
        "https://official.example/work/fixture",
      );
      await publicState(p);
      await stage(p);
    },
  ],
  [
    "music-video",
    "音楽",
    async (p) => {
      await newRecord(p, "歌動画");
      await set(p, "曲名（動画の表記）（必須）", "fixture cover");
      await select(p, "YouTube動画", existingVideo.youtubeId);
      // Cancel a nested new video without replacing the parent's existing link with a missing temporary ID.
      await tab(p, "動画情報を追加");
      await tab(p, "編集を取り消す");
      assert.equal(
        await p.getByLabel("YouTube動画", { exact: true }).inputValue(),
        existingVideo.youtubeId,
      );
      await select(p, "対応する楽曲", "song-000001");
      await cast(p, [singer]);
      await publicState(p);
      await stage(p);
    },
  ],
  [
    "new-media-video",
    "音楽",
    async (p) => {
      await newRecord(p, "歌動画");
      await set(p, "曲名（動画の表記）（必須）", "fixture 新規動画");
      await select(p, "対応する楽曲", "song-000001");
      await cast(p, ["tal-000036"]);
      await publicState(p);
      await tab(p, "動画情報を追加");
      await title(p, "fixture 新規動画のタイトル");
      await set(p, "YouTube動画（必須）", "https://youtu.be/NEWVIDEO002");
      await publicState(p);
      await tab(p, "日時・詳細");
      await set(
        p,
        "固定チャンネルID（確認済みの値）",
        "UCXI0W_Os-BCIngpCb1YnOow",
      );
      await stage(p);
      await stage(p);
    },
  ],
  [
    "karaoke-setlist",
    "音楽",
    async (p) => {
      await newRecord(p, "歌枠");
      await select(p, "YouTube動画", existingVideo.youtubeId);
      await cast(p, [singer]);
      await select(p, "セットリストの確認状態", "complete");
      await set(p, "確認した全曲数（不明なら空欄）", "1");
      await publicState(p);
      await tab(p, "歌唱記録を追加");
      await set(p, "曲名・原文表記（必須）", "fixture setlist entry");
      await select(p, "対応する楽曲", "song-000001");
      await set(p, "曲順（不明なら空欄）", "1");
      await select(p, "歌唱内容の確認状態", "verified");
      await publicState(p);
      await stage(p);
    },
  ],
  [
    "event-slots",
    "イベント",
    async (p) => {
      await newRecord(p, "イベント");
      await title(p, "fixture relay");
      await set(p, "公式告知URL（必須）", "https://official.example/event");
      await publicState(p);
      await tab(p, "日時・詳細");
      await set(p, "概要（必須）", "fixture event summary");
      await tab(p, "出演枠を追加");
      const card = p.locator("[data-content-tab=details] .array-card").last();
      await card
        .getByLabel("タイトル（必須）", { exact: true })
        .fill("fixture slot");
      await stage(p);
    },
  ],
  [
    "campaign-bundle",
    "グッズ",
    async (p) => {
      await newRecord(p, "キャンペーン");
      await title(p, "fixture 誕生日グッズ");
      await publicState(p);
      await productAndOffer(p, "fixture 商品A");
      await productAndOffer(p, "fixture 商品B");
      await stage(p);
    },
  ],
  [
    "campaign-append",
    "グッズ",
    async (p) => {
      await p
        .getByRole("button", {
          name: models.goods.campaigns[0].title,
          exact: true,
        })
        .click();
      await productAndOffer(p, "fixture 追加商品");
      await stage(p);
    },
  ],
  [
    "past-offer",
    "グッズ",
    async (p) => {
      await p.getByRole("button", { name: "販売情報", exact: true }).click();
      const offer = models.goods.offers.find(
          (o) => o.endsAt && Date.parse(o.endsAt) < Date.now(),
        ),
        product = models.goods.products.find((r) => r.id === offer.productId);
      if(await p.getByRole("button",{name:"一括編集",exact:true}).count())await p.getByRole("button",{name:"一括編集",exact:true}).click();
      await p
        .getByRole("searchbox", { name: "タイトルで検索" })
        .fill(product.title);
      await p.locator(".list-region .data-table tbody .record-open").first().click();
      await tab(p, "日時・詳細");
      await set(p, "販売条件・補足", "fixture 過去の履歴を保持した補足");
      await stage(p);
    },
  ],
];
try {
  if(process.env.ADMIN_CMS_OWNER_ONLY){
    mainSha = cmsMainSha;
    await cmsOwnerBrowser({ browser, base, mainSha });
  }else if(process.env.ADMIN_VNEXT5_ONLY){
    await vnext5Browser({browser,base,models,reset:()=>{data.clear();mainSha="main-sha";mainModels=structuredClone(models);createdBranches.clear();commitSerial=0;created=false;writes=0;},writes:()=>writes,addAmbiguous:()=>{mainSha="new-main-sha";mainModels.goods.campaigns[0].title=models.talents.talents.find(t=>t.id===models.karaoke.karaokes[0].talentIds[0]).displayName+" 未リンク文章の品質fixture";},advance:()=>{mainSha="new-main-sha";mainModels.talents.talents[0].displayName+=" main";},before:!!process.env.ADMIN_PUBLIC_ROOT,dir:process.env.ADMIN_VNEXT5_DIR});
  }else if(process.env.ADMIN_QUALITY_ONLY){
    await qualityBrowser({browser,base,models,reset:()=>{data.clear();mainSha='main-sha';mainModels=structuredClone(models);createdBranches.clear();commitSerial=0;created=false;writes=0;requestMetrics.splice(0);},advance:()=>{mainSha='new-main-sha';mainModels.talents.talents[0].displayName+=' main';},writes:()=>writes,metrics:()=>structuredClone(requestMetrics),dir:process.env.ADMIN_QUALITY_DIR,before:!!process.env.ADMIN_PUBLIC_ROOT&&!process.env.ADMIN_COMPARE_BULK});
  }else if(process.env.ADMIN_PHASE3_ONLY){
    await phase3Browser({browser,base,models,reset:()=>{data.clear();mainSha='main-sha';mainModels=structuredClone(models);createdBranches.clear();commitSerial=0;created=false;},shotDir:process.env.ADMIN_PHASE3_SCREENSHOTS,before:!!process.env.ADMIN_PUBLIC_ROOT});
  } else {
  if (!process.env.ADMIN_PUBLIC_ROOT) {
    mainSha = cmsMainSha;
    await cmsOwnerBrowser({ browser, base, mainSha });
    mainSha = "main-sha";
    data.clear();
  }
  for (const width of (process.env.ADMIN_CONTENT_WIDTHS || "320,390,768,1440")
    .split(",")
    .map(Number))
    for (const [name, category, prepare] of cases.filter(
      (c) =>
        !process.env.ADMIN_CONTENT_CASES ||
        process.env.ADMIN_CONTENT_CASES.split(",").includes(c[0]),
    )) {
      data.clear();
      mainSha = "main-sha";
      mainModels = structuredClone(models);
      commitSerial = 0;
      createdBranches.clear();
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        colorScheme: width === 768 ? "dark" : "light",
      });
      context.on("dialog", (d) => d.accept());
      await context.route(
        /^https:\/\/github\.com\/login\/oauth\/authorize/,
        async (r) => {
          const u = new URL(r.request().url());
          await r.fulfill({
            status: 302,
            headers: {
              location:
                base +
                "/auth/callback?code=fixture&state=" +
                u.searchParams.get("state"),
            },
          });
        },
      );
      const p = await context.newPage(),
        errors = [];
      p.on("pageerror", (e) => {
        errors.push(e.message);
        console.error("pageerror", e.message);
      });
      await p.goto(base);
      await p
        .getByRole("link", { name: "GitHubでログイン", exact: true })
        .click();
      await p.getByText("管理者fixture / 管理者", { exact: false }).waitFor();
      await p.locator("nav details[data-owner-only]").evaluate((node) => { node.open = true; });
      if (
        shotDir &&
        name === "campaign-bundle" &&
        [390, 1440].includes(width)
      ) {
        fs.mkdirSync(shotDir, { recursive: true });
        await p.screenshot({
          path: path.join(shotDir, `dashboard-${width}.png`),
        });
      }
      await p.locator("nav details[data-owner-only]").evaluate((node) => { node.open = true; });
    await p.locator('nav a[href="' + advancedRoutes[category] + '"]').focus();
      await p.keyboard.press("Enter");
      await p.getByRole("button", { name: /^新規.*登録$/ }).waitFor();
      if (
        shotDir &&
        [390, 1440].includes(width) &&
        name === "campaign-bundle"
      ) {
        fs.mkdirSync(shotDir, { recursive: true });
        await p.screenshot({
          path: path.join(shotDir, `goods-list-${width}.png`),
        });
      }
      captureCase = name;
      captureWidth = width;
      try {
        await prepare(p);
        await review(p, name, width);
        await publish(p);
      } catch (e) {
        console.error(
          "Flow failed",
          name,
          width,
          await p.locator("body").innerText(),
        );
        throw e;
      }
      if (name === "campaign-bundle") {
        assert.equal(lastSubmissionPlan.records.length, 5);
        assert.equal(
          lastSubmissionPlan.records.filter((o) => o.entity === "product")
            .length,
          2,
        );
      }
      if (name === "karaoke-setlist")
        assert.equal(
          lastSubmissionPlan.records.find((o) => o.entity === "performance")
            .value.startsAtSeconds,
          null,
        );
      assert.deepEqual(errors, []);
      assert.equal(JSON.stringify(models), originalModels);
      await context.close();
      console.log(`Content Admin E2E passed ${width} ${name}`);
    }
  if (!process.env.ADMIN_PUBLIC_ROOT)
    await workspaceBrowser({
      browser,
      base,
      models,
      reset: () => {
        data.clear();
        mainSha = "main-sha";
        mainModels = structuredClone(models);
        commitSerial = 0;
      },
      shotDir: process.env.ADMIN_WORKSPACE_SCREENSHOTS,
    });
  if (!process.env.ADMIN_PUBLIC_ROOT)
    await submissionBrowser({
      browser,
      base,
      models,
      reset: () => {
        data.clear();
        mainSha = "main-sha";
        mainModels = structuredClone(models);
        createdBranches.clear();
        commitSerial = 0;
      },
      advance: (conflict) => {
        mainSha = "new-main-sha";
        mainModels.talents.talents[conflict ? 0 : 6].displayName += " main";
      },
      reject: () => {
        rejectPR = true;
      },
      shotDir: process.env.ADMIN_SUBMISSION_SCREENSHOTS,
    });
  // The same authenticated write endpoint must reject CSRF and a newer main SHA.
  data.clear();
  mainSha = "main-sha";
  const context = await browser.newContext();
  context.on("dialog", (d) => d.accept());
  const p = await context.newPage();
  await p.goto(base);
  await p.getByRole("link", { name: "GitHubでログイン" }).click();
  await p.getByText("管理者fixture / 管理者", { exact: false }).waitFor();
  await p.locator("nav details[data-owner-only]").evaluate((node) => { node.open = true; });
    await p.locator('nav a[href="#anniversaries"]').click();
  await p.getByRole("button", { name: "新規記念日登録" }).waitFor();
  await cases[0][2](p);
  await review(p, "conflict", 320);
  const badCsrf = await p.evaluate(async () => {
    const r = await fetch("/api/change-requests/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": "wrong" },
      body: "{}",
    });
    return r.status;
  });
  assert.equal(badCsrf, 403);
  mainSha = "new-main-sha";
  await p.getByLabel("差分と参照影響を確認しました").check();
  await tab(p, "確認した変更でPRを作成");
  await p
    .getByText(/mainが更新されました/)
    .first()
    .waitFor();
  assert.equal(
    await p.getByRole("heading", { name: "PRを作成しました" }).count(),
    0,
  );
  await context.close();
  console.log(
    "Content Admin CSRF/main change protection passed; GitHub and production were mocked.",
  );
  if(!process.env.ADMIN_PUBLIC_ROOT)await phase3Browser({browser,base,models,reset:()=>{data.clear();mainSha='main-sha';mainModels=structuredClone(models);createdBranches.clear();commitSerial=0;created=false;},shotDir:process.env.ADMIN_PHASE3_SCREENSHOTS});
  }
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
