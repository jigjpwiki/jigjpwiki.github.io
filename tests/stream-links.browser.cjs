"use strict";
const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict");
const root = path.resolve(process.env.STREAM_SITE || "_site"),
  master = JSON.parse(fs.readFileSync(path.join(root, "data/talents.json"))),
  person = master.talents.find((t) => t.id === "tal-000001"),
  yt = person.accounts.find((a) => a.service === "youtube").accountId,
  tw = person.accounts.find((a) => a.service === "twitch").accountId;
const now = new Date("2026-11-16T06:00:00Z"),
  stamp = now.toISOString();
const video = {
  videoId: "abcDEFG1234",
  youtubeid: yt,
  title: "YouTube <img src=x> 予定",
  name: "名前は照合しない",
  date: "2026-11-16T05:00:00Z",
  status: "upcoming",
  url: "https://www.youtube.com/watch?v=abcDEFG1234",
  thumbnail: "https://i.ytimg.com/vi/abcDEFG1234/mqdefault.jpg",
};
const twitch = {
  twitchid: tw.toUpperCase(),
  title: "Twitch配信中",
  name: "別の表示名",
  date: stamp,
  status: "live",
  url: "https://www.twitch.tv/" + tw,
  thumbnail: "https://example.com/image.png",
};
(async () => {
  const server = http.createServer((req, res) => {
    let file = path.join(root, new URL(req.url, "http://local").pathname);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory())
      file = path.join(file, "index.html");
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader(
      "Content-Type",
      {
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".html": "text/html",
        ".png": "image/png",
        ".svg": "image/svg+xml",
      }[path.extname(file)] || "application/octet-stream",
    );
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
    });
  try {
    for (const width of [320, 390, 768, 1440]) {
      let empty = false;
      let failed = false,
        stale = false,
        badIndex = false;
      const context = await browser.newContext({
          viewport: { width, height: 900 },
        }),
        p = await context.newPage(),
        errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.clock.install({ time: now });
      await context.route("**/*", (r) => {
        const url = new URL(r.request().url());
        if (url.origin !== base) return r.abort();
        if (
          url.pathname === "/data/youtube.json" ||
          url.pathname === "/data/twitch.json"
        ) {
          if (empty) return r.fulfill({ json: [] });
          if (failed) return r.fulfill({ status: 503, body: "{}" });
          return r.fulfill({
            json: url.pathname.includes("youtube")
              ? [
                  video,
                  { ...video, youtubeid: "UC" + "z".repeat(22), title: "別人" },
                ]
              : [twitch],
          });
        }
        if (url.pathname === "/data/last_updated.json")
          return r.fulfill({
            json: {
              youtube: stale ? "2026-11-15T00:00:00Z" : stamp,
              twitch: stamp,
            },
          });
        if (badIndex && url.pathname === "/data/stream-talents.json")
          return r.fulfill({ status: 503, body: "{}" });
        return r.continue();
      });
      await p.goto(base + "/talents/" + person.id + "/");
      if (!process.env.STREAM_BEFORE) {
        const region = p.locator("#talent-streams");
        await region.getByRole("link", { name: /Twitch・配信中/ }).waitFor();
        assert.equal(
          await region.getByRole("link", { name: /YouTube・配信予定/ }).count(),
          1,
        );
        assert.equal(
          await region.getByRole("link", { name: /別人/ }).count(),
          0,
        );
        assert.equal(await region.locator("h4 img").count(), 0);
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        if (process.env.STREAM_SCREENSHOTS) {
          fs.mkdirSync(process.env.STREAM_SCREENSHOTS, { recursive: true });
          await p.screenshot({
            path: path.join(
              process.env.STREAM_SCREENSHOTS,
              `profile-${width}.png`,
            ),
            fullPage: true,
          });
        }
        if (width >= 768)
          assert(
            (await region.locator(".talent-stream-card").first().boundingBox())
              .width <= 400,
            "Single stream cards stay compact on desktop",
          );
        stale = true;
        await region.getByRole("button", { name: "配信情報を更新" }).click();
        await p.waitForFunction(() =>
          document
            .querySelector("[data-stream-status]")
            .textContent.includes("1時間以上"),
        );
        failed = true;
        await region.getByRole("button", { name: "配信情報を更新" }).click();
        await p.waitForFunction(() =>
          document
            .querySelector("[data-stream-status]")
            .textContent.includes("前回取得した情報"),
        );
        assert.equal(
          await region.getByRole("link", { name: /Twitch・配信中/ }).count(),
          1,
        );
        failed = false;
        badIndex = true;
        await p.reload();
        await region.getByText(/アカウント照合情報を取得できません/).waitFor();
        assert.equal(
          await region.locator("[data-stream-fallback]").getAttribute("open"),
          "",
        );
        badIndex = false;
        failed = true;
        await p.reload();
        await region.getByText(/YouTubeの取得に失敗しました/).waitFor();
        assert.equal(
          await region.locator("[data-stream-fallback]").getAttribute("open"),
          "",
        );
        failed = false;
        empty = true;
        await p.reload();
        await region
          .getByText(/公開フィードに紐づく配信情報はありません/)
          .waitFor();
        empty = false;

        await p.goto(base + "/");
        await p.locator(".stream-talent-link").first().waitFor();
        assert.equal(
          await p.locator(".stream-talent-link").first().getAttribute("href"),
          "/talents/" + person.id + "/",
        );
        if (process.env.STREAM_SCREENSHOTS)
          await p.screenshot({
            path: path.join(
              process.env.STREAM_SCREENSHOTS,
              `schedule-${width}.png`,
            ),
            fullPage: true,
          });
        await p.locator(".stream-talent-link").first().focus();
        await p.keyboard.press("Enter");
        await p.waitForURL("**/talents/" + person.id + "/");
        assert.deepEqual(errors, []);
      } else if (process.env.STREAM_SCREENSHOTS) {
        fs.mkdirSync(process.env.STREAM_SCREENSHOTS, { recursive: true });
        await p.screenshot({
          path: path.join(
            process.env.STREAM_SCREENSHOTS,
            `profile-${width}.png`,
          ),
          fullPage: true,
        });
      }
      if (process.env.STREAM_BEFORE && process.env.STREAM_SCREENSHOTS) {
        await p.goto(base + "/");
        await p.locator(".live-wrapper").first().waitFor();
        await p.screenshot({
          path: path.join(
            process.env.STREAM_SCREENSHOTS,
            `schedule-${width}.png`,
          ),
          fullPage: true,
        });
      }
      await context.close();
      console.log("Stream links browser passed", width);
    }
    const context = await browser.newContext({
        javaScriptEnabled: false,
        viewport: { width: 390, height: 900 },
      }),
      p = await context.newPage();
    await p.goto(base + "/talents/" + person.id + "/");
    assert.match(
      await p.locator("main").innerText(),
      /サイト公開時点の保存データ/,
    );
    assert.equal(
      await p.getByRole("button", { name: "配信情報を更新" }).count(),
      0,
    );
    await context.close();
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
