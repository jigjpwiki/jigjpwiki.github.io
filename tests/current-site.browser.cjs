"use strict";
const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict");
(async () => {
  const root = path.resolve("_site"),
    read = (n) =>
      JSON.parse(fs.readFileSync(path.join(root, "data", n + ".json"))),
    people = read("talents").talents.filter(t=>!t.profileHidden);
  const server = http.createServer((req, res) => {
    const name = path.resolve(
      root,
      "." + new URL(req.url, "http://localhost").pathname,
    );
    if (!name.startsWith(root + path.sep)) return res.writeHead(403).end();
    let file = name;
    if (fs.existsSync(file) && fs.statSync(file).isDirectory())
      file = path.join(file, "index.html");
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader(
      "content-type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".json")
            ? "application/json"
            : "text/html",
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
    for (const width of [320, 390, 768, 1024, 1440, 1920])
      for (const javaScriptEnabled of [true, false]) {
        const c = await browser.newContext({
          viewport: { width, height: 1000 },
          javaScriptEnabled,
          colorScheme: width === 1024 ? "dark" : "light",
        });
        await c.route("**/*", (r) =>
          r.request().url().startsWith(base) ? r.continue() : r.abort(),
        );
        const p = await c.newPage(),
          errors = [];
        p.on("pageerror", (e) => errors.push(e.message));
        for (const route of [
          "/talents/",
          "/anniversaries/",
          "/music/",
          "/events/",
          "/goods/",
        ]) {
          assert.equal((await p.goto(base + route)).status(), 200);
          assert.equal(
            await p.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
          );
        }
        await p.goto(base + "/talents/");
        assert.equal(await p.locator("[data-person]").count(), people.length);
        if (people.length) {
          await p.goto(base + "/talents/" + people[0].id + "/");
          assert.equal(
            await p
              .getByRole("heading", {
                name: people[0].displayName,
                exact: true,
              })
              .count(),
            1,
          );
        }
        assert.deepEqual(errors, []);
        await c.close();
        console.log(
          "Current masters public rendering passed",
          width,
          javaScriptEnabled,
          people.length,
        );
      }
    const c = await browser.newContext(),
      p = await c.newPage();
    const routes = JSON.parse(
      fs.readFileSync(path.join(root, "data/events.json")),
    )
      .events.map((r) => "/events/" + r.id + "/")
      .concat(
        people.map((r) => "/talents/" + r.id + "/"),
        read("goods").products.map((r) => "/goods/" + r.id + "/"),
        read("goods").campaigns.map((r) => "/goods/campaigns/" + r.id + "/"),
        read("music").songs.map((r) => "/music/songs/" + r.id + "/"),
        read("karaoke").karaokes.map((r) => "/music/karaoke/" + r.id + "/"),
      );
    for (const route of routes)
      assert.equal((await p.request.get(base + route)).status(), 200, route);
    for (const t of require("../data/talents.json").talents.filter(
      (t) => (t.visibility ?? "public") !== "public",
    )) {
      assert(!people.some((p) => p.id === t.id));
      const exported=read('talents').talents.find(p=>p.id===t.id);
      if(t.historyNamePublic)assert.deepEqual(exported,{id:t.id,displayName:t.displayName,profileHidden:true});
      else assert.equal(exported,undefined);
      assert.equal(
        (await p.request.get(base + "/talents/" + t.id + "/")).status(),
        404,
      );
    }
    await c.close();
    console.log("Current published detail URLs checked", routes.length);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
