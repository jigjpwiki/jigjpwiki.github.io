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
        if (width >= 1200 && people.length) {
          const card = p.locator(".talent-card").first();
          assert.equal(await card.evaluate(e => getComputedStyle(e).flexDirection), "row");
          assert.equal(await card.locator(".talent-avatar").evaluate(e => e.getBoundingClientRect().width), 64);
          const historical = p.locator('.talent-directory .activity-label:is([data-activity="ended"],[data-activity="retired"])');
          for (const label of await historical.all()) {
            const style = await label.evaluate(e => {
              const s = getComputedStyle(e);
              return { background: s.backgroundColor, border: s.borderTopWidth, weight: s.fontWeight, order: s.order, text: e.textContent.trim() };
            });
            assert.equal(style.background, "rgba(0, 0, 0, 0)");
            assert.equal(style.border, "0px");
            assert.equal(style.weight, "400");
            assert.equal(style.order, "2");
            assert.match(style.text, /^(活動終了|引退)$/);
          }
          const primary = p.locator('.directory-primary-affiliation').first();
          if (await primary.count()) assert.equal(await primary.isVisible(), false);
          if (process.env.EVENT_SCREENSHOTS && width === 1440 && javaScriptEnabled) {
            const out = path.join(process.env.EVENT_SCREENSHOTS,"talent-directory");
            fs.mkdirSync(out,{recursive:true});
            await p.screenshot({path:path.join(out,"desktop-1440.png")});
            await p.locator(".agency-section").first().scrollIntoViewIfNeeded();
            await p.screenshot({path:path.join(out,"agency-1440.png")});
            const former = p.locator('[data-directory-section="former"]');
            if (await former.count()) {
              await former.evaluate(e => e.scrollIntoView({block:"start"}));
              await p.screenshot({path:path.join(out,"former-1440.png")});
            }
          }
          if (javaScriptEnabled && await primary.count()) {
            await p.locator("#talent-sort").selectOption("name");
            assert.equal(await primary.isVisible(), true);
          }
        }
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
        if (width === 1440 && javaScriptEnabled && process.env.EVENT_SCREENSHOTS) {
          const out = path.join(process.env.EVENT_SCREENSHOTS, "talent-profile");
          fs.mkdirSync(out,{recursive:true});
          for (const id of ["tal-000002","tal-000070"]) {
            if (!people.some(t=>t.id===id)) continue;
            await p.goto(base + "/talents/" + id + "/");
            await p.waitForFunction(()=>!document.querySelector("#talent-streams").hasAttribute("aria-busy"));
            assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
            await p.screenshot({path:path.join(out,id+"-1440.png")});
            await p.screenshot({path:path.join(out,id+"-full-1440.png"),fullPage:true});
          }
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
    // Check every generated public HTML document, including JS-disabled fallback links.
    const {externalLinkAttrs}=require('../lib/site-pages');
    let checked=0;
    function inspect(dir){
      for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
        const file=path.join(dir,entry.name);
        if(entry.isDirectory())inspect(file);
        else if(file.endsWith('.html')){
          const html=fs.readFileSync(file,'utf8').replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'');
          for(const tag of html.matchAll(/<a\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)){
            const attrs=Object.fromEntries([...tag[0].matchAll(/\s([-\w:]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>[m[1].toLowerCase(),m[2]??m[3]??m[4]]));
            if(!attrs.href)continue;
            const href=attrs.href.replace(/&amp;/g,'&');
            if(externalLinkAttrs(href)){
              assert.equal(attrs.target,'_blank',file+' '+href);
              assert((attrs.rel||'').split(/\s+/).includes('noopener'),file+' '+href);
              assert((attrs.rel||'').split(/\s+/).includes('noreferrer'),file+' '+href);
              checked++;
            } else assert.notEqual(attrs.target,'_blank',file+' internal '+href);
          }
        }
      }
    }
    inspect(root);
    assert(checked>0,'External links must be present in generated pages');
    console.log('Static external link policy checked',checked);

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
