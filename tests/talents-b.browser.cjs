"use strict";
const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict");
const root = (process.env.TALENT_UX_SITE?path.resolve(process.env.TALENT_UX_SITE):require("./fixtures/browser-site.cjs")()),
  before = !!process.env.TALENT_UX_BEFORE,
  master = JSON.parse(fs.readFileSync(path.join(root, "data/talents.json"))),
  person = master.talents[0],
  channel = person.accounts.find((a) => a.service === "youtube").accountId,
  login = person.accounts.find((a) => a.service === "twitch").accountId;
const now = new Date("2026-11-17T03:00:00Z"),
  make = (id, status, title, thumbnail) => ({
    youtubeid: channel,
    videoId: id,
    status,
    title,
    thumbnail,
    date: now.toISOString(),
    url: "https://www.youtube.com/watch?v=" + id,
  });
const yt = [
  make(
    "UPCOMING001",
    "upcoming",
    "歌とおしゃべりの時間",
    "https://images.example/tall.svg",
  ),
  make(
    "ARCHIVE0001",
    "archive",
    "週末のアーカイブ",
    "https://images.example/square.svg",
  ),
  make("ARCHIVE0002", "archive", "最近の配信", null),
];
(async () => {
  const server = http.createServer((req, res) => {
    let file = path.join(root, new URL(req.url, "http://local").pathname);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory())
      file = path.join(file, "index.html");
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
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
      const context = await browser.newContext({
          viewport: { width, height: 1000 },
        }),
        p = await context.newPage(),
        errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.clock.install({ time: now });
      await context.route("**/*", (r) => {
        const url = new URL(r.request().url());
        if (url.hostname === "images.example") {
          if (url.pathname.includes("missing")) return r.abort();
          return r.fulfill({
            contentType: "image/svg+xml",
            body: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="${url.pathname.includes("tall") ? "480" : "120"}"><rect width="100%" height="100%" fill="#e1e8ef"/><circle cx="60" cy="${url.pathname.includes("tall") ? "240" : "60"}" r="24" fill="#b4c6d9"/></svg>`,
          });
        }
        if (url.origin !== base) return r.abort();
        if (url.pathname === "/data/youtube.json")
          return r.fulfill({ json: yt });
        if (url.pathname === "/data/twitch.json")
          return r.fulfill({
            json: [
              {
                twitchid: login,
                status: "live",
                title: "いま配信中",
                date: now.toISOString(),
                url: "https://www.twitch.tv/" + login,
                thumbnail: "https://images.example/missing.svg",
              },
            ],
          });
        if (url.pathname === "/data/last_updated.json")
          return r.fulfill({
            json: { youtube: now.toISOString(), twitch: now.toISOString() },
          });
        return r.continue();
      });
      await p.goto(base + "/talents/");
      await p.locator(".talent-card").first().waitFor();
      const capture = async (name) => {
        if (process.env.TALENT_UX_SCREENSHOTS) {
          fs.mkdirSync(process.env.TALENT_UX_SCREENSHOTS, { recursive: true });
          await p.screenshot({
            path: path.join(
              process.env.TALENT_UX_SCREENSHOTS,
              `${name}-${width}.png`,
            ),
            fullPage: name === "profile",
          });
        }
      };
      await capture("agency");
      if (!before) {
        const sections = p.locator("[data-directory-section]:visible");
        assert.deepEqual(
          await sections.evaluateAll((ns) =>
            ns
              .filter((n) => n.dataset.directorySection.startsWith("org-"))
              .map((n) => n.dataset.directorySection),
          ),
          master.organizations
            .filter((o) =>
              master.talents.some((t) =>
                t.affiliations.some(
                  (a) => a.status === "current" && a.organizationId === o.id,
                ),
              ),
            )
            .map((o) => o.id),
        );
        assert.equal(
          await p.locator("[data-person]").count(),
          master.talents.length,
        );
        assert.equal(await p.locator("#directory-jumps a").count(),await sections.count());
        const jump=await p.locator("#directory-jumps a").first().getAttribute("href");
        assert.equal(await p.locator(jump).count(),1);
        await p.locator("#talent-activity").selectOption("ended");
        assert.equal(await p.locator(".talent-card:visible").count(),master.talents.filter(t=>t.activityStatus.value==="ended").length);
        assert.equal(new URL(p.url()).searchParams.get("activity"),"ended");
        await p.getByRole("button",{name:"条件を解除"}).click();
        assert(!new URL(p.url()).searchParams.has("activity"));
        assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await p.locator("#talent-sort").selectOption("name");
        await capture("name");
        const expected = [...master.talents].sort((a, b) =>
          new Intl.Collator("ja", {
            numeric: true,
            sensitivity: "base",
          }).compare(a.displayName, b.displayName),
        );
        assert.deepEqual(
          await p
            .locator("[data-person]")
            .evaluateAll((ns) => ns.map((n) => n.id)),
          expected.map((t) => t.id),
        );
        await p.locator("#talent-sort").selectOption("registered");
        assert.deepEqual(
          await p
            .locator("[data-person]")
            .evaluateAll((ns) => ns.map((n) => n.id)),
          master.talents.map((t) => t.id),
        );
        await p.locator("#talent-search").fill("真昼");
        assert.equal(await p.locator(".talent-card:visible").count(), 1);
        assert(new URL(p.url()).searchParams.get("q") === "真昼");
        await p.locator("#talent-sort").selectOption("name");
        await p.goBack();
        assert.equal(
          await p.locator("#talent-sort").inputValue(),
          "registered",
        );
        await p.goForward();
        assert.equal(await p.locator("#talent-sort").inputValue(), "name");
        await p
          .locator("#talent-organization")
          .selectOption(
            person.affiliations.find((a) => a.status === "current")
              .organizationId,
          );
        assert.equal(await p.locator(".talent-card:visible").count(), 1);
        const shared = p.url();
        await p.reload();
        assert.equal(await p.locator("#talent-search").inputValue(), "真昼");
        assert.equal(p.url(), shared);
        await p.locator("#talent-relation").selectOption("former");
        assert.equal(await p.locator(".talent-card:visible").count(), 0);
        assert.equal(
          await p.locator("[data-directory-section]:visible").count(),
          0,
        );
        await p.getByRole("button", { name: "条件を解除" }).click();
        assert(!new URL(p.url()).searchParams.has("q"));
        assert.equal(await p.locator("#talent-sort").inputValue(), "agency");
        await p.locator("#talent-search").evaluate((e) => {
          e.dispatchEvent(
            new CompositionEvent("compositionstart", { bubbles: true }),
          );
          e.value = "真昼";
          e.dispatchEvent(
            new InputEvent("input", { bubbles: true, isComposing: true }),
          );
        });
        assert.equal(
          await p.locator(".talent-card:visible").count(),
          master.talents.length,
        );
        await p.locator("#talent-search").dispatchEvent("compositionend");
        assert.equal(await p.locator(".talent-card:visible").count(), 1);
        await p
          .getByRole("link", { name: person.displayName, exact: true })
          .focus();
        await p.keyboard.press("Enter");
        await p.waitForURL("**/talents/" + person.id + "/");
        await p.goBack();
        assert.equal(await p.locator("#talent-search").inputValue(), "真昼");
      }
      await p.goto(base + "/talents/" + person.id + "/");
      await p.locator(".talent-stream-card").first().waitFor();
      if (!before) {
        await p.waitForFunction(
          () =>
            document.querySelectorAll(".stream-media img").length === 2 &&
            [...document.querySelectorAll(".stream-media img")].every(
              (i) => i.complete && i.naturalWidth > 0,
            ),
        );
        const ratios = await p.locator(".stream-media").evaluateAll((nodes) =>
          nodes.map((e) => {
            const r = e.getBoundingClientRect();
            return {
              width: r.width,
              height: r.height,
              ratio: r.width / r.height,
            };
          }),
        );
        for (const r of ratios) assert(Math.abs(r.ratio - 16 / 9) < 0.01);
        if (process.env.TALENT_UX_SCREENSHOTS)
          fs.writeFileSync(
            path.join(
              process.env.TALENT_UX_SCREENSHOTS,
              `ratios-${width}.json`,
            ),
            JSON.stringify(ratios, null, 2),
          );
        assert.equal(
          await p
            .locator(".talent-stream-card.is-live .stream-state")
            .innerText(),
          "ON AIR",
        );
        assert.equal(
          await p
            .locator(".service-twitch")
            .first()
            .evaluate((e) => getComputedStyle(e).borderLeftColor),
          "rgb(100, 65, 165)",
        );
        assert.equal(
          await p
            .locator(".service-youtube")
            .first()
            .evaluate((e) => getComputedStyle(e).borderLeftColor),
          "rgb(255, 0, 0)",
        );
        assert.doesNotMatch(
          await p.locator("[data-stream-output]").innerText(),
          /収集時点|公開フィード|確認済み/,
        );
        assert.equal(await p.locator(".stream-image-fallback").count(), 2);
        assert.equal(
          (await p
            .locator(".profile-hero .talent-avatar")
            .evaluate((e) => e.getBoundingClientRect().width)) <= 128,
          true,
        );
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        assert.equal(await p.locator(".profile-provenance").count(),0);
        const sectionLinks=await p.locator(".profile-jumps a").evaluateAll(links=>links.map(a=>({href:a.getAttribute("href"),exists:!!document.getElementById(a.hash.slice(1))})));
        assert(sectionLinks.length>=2&&sectionLinks.every(l=>l.exists));
        assert.equal(await p.locator(".profile-biography details").getAttribute("open"),"");
        if(person.activityStatus.value!=="unknown")assert.equal(await p.locator(".profile-activity").getAttribute("data-activity"),person.activityStatus.value);
      }
      if (width >= 1000 && !before) {
        const mainColumn = await p.locator(".profile-primary").boundingBox();
        const side = await p.locator(".profile-secondary").boundingBox();
        assert(side.x >= mainColumn.x + mainColumn.width, "Profile metadata is placed alongside content");
        assert.equal(await p.locator(".profile-link-icon").first().isVisible(), true);
        if (process.env.EVENT_SCREENSHOTS) {
          const out = path.join(process.env.EVENT_SCREENSHOTS, "talent-profile");
          fs.mkdirSync(out, {recursive:true});
          await p.screenshot({path:path.join(out,"fixture-live-1440.png")});
          await p.screenshot({path:path.join(out,"fixture-full-1440.png"),fullPage:true});
        }
      }
      await capture("profile");
      if (!before) {
        const unregistered = master.talents.find(
          (t) =>
            !t.accounts.some(
              (a) => ["youtube", "twitch"].includes(a.service) && a.accountId,
            ),
        );
        if (unregistered) {
          await p.goto(base + "/talents/" + unregistered.id + "/");
          await p
            .getByText("配信情報は未登録です。", { exact: true })
            .waitFor();
          assert.equal(await p.locator(".talent-stream-card").count(), 0);
        }
      }
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        "Talent UX browser passed",
        width,
        before ? "before" : "after",
      );
    }
    if (!before) {
      const context = await browser.newContext({
          javaScriptEnabled: false,
          viewport: { width: 390, height: 900 },
        }),
        p = await context.newPage();
      await p.goto(base + "/talents/");
      assert((await p.locator(".agency-section").count()) > 0);
      assert.equal(
        await p.locator("[data-person]").count(),
        master.talents.length,
      );
      await p.goto(base + "/talents/" + person.id + "/");
      assert.equal(
        await p.locator("[data-stream-fallback]").getAttribute("open"),
        "",
      );
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
