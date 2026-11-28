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
  channelIcon: "https://example.com/avatar.png",
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
  channelIcon: "https://example.com/avatar.png",
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
      let empty = false,
        failedService = null,
        revision = "";
      let failed = false,
        stale = false,
        badIndex = false;
      const context = await browser.newContext({
          viewport: { width, height: 900 },
          hasTouch: width <= 600,
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
          if (failedService && url.pathname === `/data/${failedService}.json`)
            return r.fulfill({ status: 503, body: "{}" });
          if (empty) return r.fulfill({ json: [] });
          if (failed) return r.fulfill({ status: 503, body: "{}" });
          return r.fulfill({
            json: url.pathname.includes("youtube")
              ? [
                  { ...video, title: video.title + revision },
                  { ...video, youtubeid: "UC" + "z".repeat(22), title: "別人" },
                ]
              : [{ ...twitch, title: twitch.title + revision }],
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
        await region
          .getByRole("link", { name: /ON AIR.*Twitch|Twitch.*ON AIR/ })
          .waitFor();
        assert.equal(
          await region
            .getByRole("link", { name: /配信予定.*YouTube|YouTube.*配信予定/ })
            .count(),
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
          assert.equal(await region.locator(".talent-stream-card").first().getAttribute("target"),"_blank");
          assert.equal(await region.locator(".talent-stream-card").first().getAttribute("rel"),"noopener noreferrer");
          assert(
            (await region.locator(".talent-stream-card").first().boundingBox())
              .width <= 400,
            "Single stream cards stay compact on desktop",
          );
        const fallback = region.locator("[data-stream-fallback]");
        assert.equal(
          await fallback.getAttribute("open"),
          null,
          "Both successful feeds collapse fallback",
        );
        for (const service of ["youtube", "twitch"]) {
          failedService = service;
          await p.reload();
          await region
            .getByText(
              new RegExp(
                (service === "youtube" ? "YouTube" : "Twitch") +
                  "：取得できませんでした",
              ),
            )
            .waitFor();
          assert.equal(
            await fallback.getAttribute("open"),
            "",
            "Partial initial failure keeps fallback open",
          );
          assert.equal(
            await region.locator(".talent-stream-card").count(),
            1,
            "Successful platform still renders",
          );
          assert.doesNotMatch(
            await region.locator("[data-stream-output]").innerText(),
            /配信予定はありません。/,
          );
          empty = true;
          await p.reload();
          await region.getByText(/保存データをご確認ください/).waitFor();
          assert.equal(
            await fallback.getAttribute("open"),
            "",
            "Empty success plus failed feed is not a global empty result",
          );
          empty = false;
          failedService = null;
          await region.getByRole("button", { name: "配信情報を更新" }).click();
          await p.waitForFunction(
            () =>
              !document
                .querySelector("#talent-streams")
                .hasAttribute("aria-busy"),
          );
          assert.equal(
            await fallback.getAttribute("open"),
            null,
            "Manual successful recovery collapses fallback",
          );
          failedService = service;
          revision = " 更新";
          await region.getByRole("button", { name: "配信情報を更新" }).click();
          await region
            .getByText(/前回の情報がある場合は残しています/)
            .waitFor();
          assert.equal(
            await fallback.getAttribute("open"),
            "",
            "Partial retry keeps fallback accessible",
          );
          assert.equal(
            await region.locator(".talent-stream-card").count(),
            2,
            "Previous failed-side data is retained",
          );
          assert.equal(
            await region.locator("h4").filter({ hasText: "更新" }).count(),
            1,
            "Successful side receives fresh data",
          );
          failedService = null;
          revision = "";
          await p.reload();
          await region
            .getByRole("link", { name: /ON AIR.*Twitch|Twitch.*ON AIR/ })
            .waitFor();
        }
        stale = true;
        await region.getByRole("button", { name: "配信情報を更新" }).click();
        await p.waitForFunction(() =>
          document
            .querySelector("[data-stream-meta]")
            .textContent.includes("1時間以上"),
        );
        assert.equal(
          await region.locator("[data-stream-status]").innerText(),
          "更新が古い可能性があります。",
        );
        failed = true;
        await region.getByRole("button", { name: "配信情報を更新" }).click();
        await p.waitForFunction(() =>
          document
            .querySelector("[data-stream-status]")
            .textContent.includes("前回の情報"),
        );
        assert.equal(
          await region
            .getByRole("link", { name: /ON AIR.*Twitch|Twitch.*ON AIR/ })
            .count(),
          1,
        );
        assert.equal(
          await fallback.getAttribute("open"),
          "",
          "Both failed retries retain fallback",
        );
        failed = false;
        badIndex = true;
        await p.reload();
        await region.getByText(/配信情報を取得できません/).waitFor();
        assert.equal(
          await region.locator("[data-stream-fallback]").getAttribute("open"),
          "",
        );
        badIndex = false;
        failed = true;
        await p.reload();
        await region.getByText(/YouTube：取得できませんでした/).waitFor();
        assert.equal(
          await region.locator("[data-stream-fallback]").getAttribute("open"),
          "",
        );
        failed = false;
        empty = true;
        await p.reload();
        await region.getByText(/配信予定はありません。/).waitFor();
        assert.equal(
          await fallback.getAttribute("open"),
          null,
          "Both successful empty arrays are a normal empty result",
        );
        empty = false;
        failed = true;
        await region.getByRole("button", { name: "配信情報を更新" }).click();
        await region.getByText(/保存データをご確認ください/).waitFor();
        assert.equal(
          await fallback.getAttribute("open"),
          "",
          "Failed retries after empty success remain unknown, not empty",
        );
        failed = false;

        await p.goto(base + "/");
        await p.locator(".stream-profile-link").first().waitFor();
        assert.equal(
          await p.locator(".stream-profile-link").first().getAttribute("href"),
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
        if (process.env.STREAM_SCREENSHOTS)
          fs.writeFileSync(
            path.join(process.env.STREAM_SCREENSHOTS, `geometry-${width}.json`),
            JSON.stringify(
              await p
                .locator(".live-block")
                .first()
                .evaluate((e) => ({
                  width: e.getBoundingClientRect().width,
                  height: e.getBoundingClientRect().height,
                })),
            ),
          );
        const icon = p.locator(".stream-profile-link").first(),
          card = icon.locator(
            'xpath=ancestor::*[contains(@class,"live-wrapper")]',
          );
        assert.equal(await p.locator(".stream-talent-link").count(), 0);
        assert.equal(
          await p
            .locator(".live-wrapper")
            .filter({ hasText: "別人" })
            .locator(".stream-profile-link")
            .count(),
          0,
          "Unknown IDs receive no profile link",
        );
        await p.waitForFunction(
          () => !document.querySelector(".stream-profile-link img"),
        );

        assert.equal(await p.locator(".live-block a a").count(), 0);
        assert.equal(
          await card.locator(".stream-destination").getAttribute("target"),
          "_blank",
        );
        await icon.scrollIntoViewIfNeeded();
        await icon.hover();
        assert(
          await icon.evaluate((e) => {
            const r = e.getBoundingClientRect();
            return e.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            );
          }),
          "Icon is above the stream overlay even while hovering",
        );
        const box = await icon.boundingBox();
        assert(
          box.width >= 44 && box.height >= 44,
          "Missing images retain a touch-size icon",
        );
        const poster = card.locator(".thumbnail-wrapper");
        await poster.hover({ force: true });
        const thumbnailBox = await poster.boundingBox();
        assert(
          Math.abs(thumbnailBox.width / thumbnailBox.height - 16 / 9) < 0.01,
          "Schedule thumbnails remain 16:9",
        );
        assert(
          await poster.evaluate((e) => {
            const r = e.getBoundingClientRect();
            return document
              .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
              ?.classList.contains("stream-destination");
          }),
          "Non-icon card region belongs to stream destination",
        );
        const [popup] = await Promise.all([
          p.waitForEvent("popup"),
          card.locator(".stream-destination").press("Enter"),
        ]);
        await popup.close();
        await card.locator(".stream-destination").focus();
        assert.equal(
          await p.evaluate(() => document.activeElement.className),
          "stream-destination",
        );
        await p.keyboard.press("Tab");
        assert.equal(
          await icon.evaluate((e) => e === document.activeElement),
          true,
          "Both links are independent keyboard targets",
        );
        await p.locator(".stream-profile-link").last().focus();
        await p.evaluate(() => {
          window.iconRedraws = 0;
          new MutationObserver(() => window.iconRedraws++).observe(
            document.getElementById("videolist"),
            { childList: true },
          );
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await p.waitForFunction(
          () =>
            window.iconRedraws > 0 &&
            document.activeElement?.matches(".stream-profile-link") &&
            document.activeElement.closest(".live-wrapper").dataset.platform ===
              "twitch",
        );
        if (width <= 600) {
          const client = await context.newCDPSession(p),
            r = await icon.boundingBox(),
            x = r.x + r.width / 2,
            y = r.y + r.height / 2;
          const initial = await p.evaluate(
            () => window._swiperInstance.activeIndex,
          );
          await client.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x, y }],
          });
          for (let i = 1; i <= 6; i++)
            await client.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [{ x: x + ((width - x - 15) * i) / 6, y }],
            });
          await client.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          await p.waitForFunction(
            (index) => window._swiperInstance.activeIndex !== index,
            initial,
          );
          assert.equal(
            new URL(p.url()).pathname,
            "/",
            "Swipe starting on the icon must not navigate",
          );
          await p.evaluate(
            (index) => window._swiperInstance.slideTo(index, 0),
            initial,
          );
          await icon.scrollIntoViewIfNeeded();
          await icon.tap();
          await p.waitForURL("**/talents/" + person.id + "/");
          await p.goto(base + "/");
          await p.locator(".stream-profile-link").first().waitFor();
        }
        await p.locator(".stream-profile-link").first().focus();
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
        fs.writeFileSync(
          path.join(process.env.STREAM_SCREENSHOTS, `geometry-${width}.json`),
          JSON.stringify(
            await p
              .locator(".live-block")
              .first()
              .evaluate((e) => ({
                width: e.getBoundingClientRect().width,
                height: e.getBoundingClientRect().height,
              })),
          ),
        );
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
    assert.match(await p.locator("main").innerText(), /保存された配信・動画/);
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
