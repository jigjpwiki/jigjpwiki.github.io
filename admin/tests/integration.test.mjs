import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Admin } from "../src/worker.mjs";
import { GitHub, readFiles, filePath } from "../src/github.mjs";
import { random, seal, hash } from "../src/security.mjs";
const root = path.resolve(import.meta.dirname, "../..");
async function setup() {
  const models = Object.fromEntries(
      readFiles.map((n) => [
        n,
        JSON.parse(fs.readFileSync(path.join(root, filePath(n)))),
      ]),
    ),
    map = new Map(),
    sid = random(),
    key = random();
  let main = "main-sha",
    writes = 0;
  const store = {
    get: async (k) => map.get(k),
    put: async (k, v) => map.set(k, v),
    delete: async (k) => map.delete(k),
  };
  map.set("session:" + sid, {
    id: "123",
    login: "fixture",
    csrf: "csrf",
    token: await seal("fixture", key),
    expires: Date.now() + 60000,
  });
  const transport = async (url, opts) => {
    const p = new URL(url).pathname;
    if (opts.method !== "GET") writes++;
    if (p === "/user") return Response.json({ id: 123, login: "fixture" });
    if (p.endsWith("/git/ref/heads/main"))
      return Response.json({ object: { sha: main } });
    if (p.includes("/git/commits/"))
      return Response.json({ tree: { sha: "tree" } });
    if (p.endsWith("/git/trees/tree"))
      return Response.json({
        tree: readFiles.map((n) => ({
          path: filePath(n),
          type: "blob",
          sha: n,
        })),
      });
    if (p.includes("/git/blobs/")) {
      const text = JSON.stringify(models[p.split("/").pop()]);
      return Response.json({
        encoding: "base64",
        size: Buffer.byteLength(text),
        content: Buffer.from(text).toString("base64"),
      });
    }
    return Response.json({
      default_branch: "main",
      permissions: { push: true },
    });
  };
  const worker = new Admin(
    { blockConcurrencyWhile: (f) => f() },
    {
      GITHUB_CLIENT_ID: "fixture",
      GITHUB_CLIENT_SECRET: "fixture",
      SESSION_KEY: key,
      ADMIN_USER_IDS: "123",
      __testFetch: transport,
      __testStore: store,
    },
  );
  const value = structuredClone(models.talents.talents[0]);
  value.displayName += "確認";
  const input = {
    sha: "main-sha",
    entity: "talent",
    action: "save",
    id: value.id,
    value,
    reason: "検証",
    confirmation: {
      status: "confirmed",
      valueHash: await hash(value),
    },
  };
  const call = (route, input, csrf = "csrf") =>
    worker.fetch(
      new Request("https://admin.example" + route, {
        method: "POST",
        headers: {
          Cookie: "__Host-admin-session=" + sid,
          Origin: "https://admin.example",
          "X-CSRF-Token": csrf,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      }),
    );
  return {
    call,
    input,
    map,
    models,
    get: (route) =>
      worker.fetch(
        new Request("https://admin.example" + route, {
          headers: { Cookie: "__Host-admin-session=" + sid },
        }),
      ),
    main: (v) => (main = v),
    writes: () => writes,
  };
}
test("preview is immutable/idempotent and main changes stop writes; no arbitrary paths", async () => {
  const s = await setup();
  assert.equal(
    (await s.call("/api/change-requests/preview", s.input, "wrong")).status,
    403,
  );
  assert.equal(
    (await s.call("/api/change-requests/preview", { ...s.input, sha: "stale" }))
      .status,
    409,
  );
  assert.equal(
    (
      await s.call("/api/change-requests/preview", {
        ...s.input,
        path: "data/release.json",
      })
    ).status,
    400,
  );
  const first = await s.call("/api/change-requests/preview", s.input);
  assert.equal(first.status, 200);
  const plan = await first.json();
  const changedTime = structuredClone(s.input);

  const second = await (
    await s.call("/api/change-requests/preview", changedTime)
  ).json();
  assert.equal(second.id, plan.id);
  assert.deepEqual(second.diff, plan.diff);
  s.main("other-main");
  assert.equal(
    (await s.call("/api/change-requests", { previewId: plan.id })).status,
    409,
  );
  assert.equal(s.writes(), 0);
});
test("403/409/422/429 diagnostics exclude remote response and do not retry", async () => {
  for (const status of [403, 409, 422, 429]) {
    let count = 0;
    const g = new GitHub("fixture", async () => {
      count++;
      return new Response("SECRET REMOTE RESPONSE", { status });
    });
    await assert.rejects(
      g.call("/user"),
      (e) => e.status === status && !e.message.includes("SECRET"),
    );
    assert.equal(count, 1);
  }
});
test("uncertain PR response recovers by deterministic branch without duplicate PR or main writes", async () => {
  let created = false,
    posts = 0;
  const record = {},
    plan = {
      sha: "base",
      tree: "tree",
      files: { talents: {} },
      title: "fixture",
      summary: "test",
    };
  const github = new GitHub("fixture", async (url, opts) => {
    const p = new URL(url).pathname;
    if (p.endsWith("/pulls") && opts.method === "GET")
      return Response.json(
        created
          ? [
              {
                number: 999,
                html_url:
                  "https://github.com/jigjpwiki/jigjpwiki.github.io/pull/999",
              },
            ]
          : [],
      );
    if (p.endsWith("/git/trees")) return Response.json({ sha: "tree2" });
    if (p.endsWith("/git/commits")) return Response.json({ sha: "commit" });
    if (p.includes("/git/ref/")) return new Response("{}", { status: 404 });
    if (p.endsWith("/pulls")) {
      created = true;
      posts++;
      throw new Error("ambiguous network response");
    }
    return Response.json({});
  });
  await assert.rejects(
    github.publish(plan, "fixed-key", record, async () => {}),
  );
  const recovered = await github.publish(
    plan,
    "fixed-key",
    record,
    async () => {},
  );
  assert.equal(recovered.number, 999);
  assert.equal(posts, 1);
  await assert.rejects(
    github.publish(
      { ...plan, files: { youtube_cache: {} } },
      "fixed-key",
      record,
      async () => {},
    ),
    /invalid_write_target/,
  );
});

test("bridge reads legacy masters and previews without sources, but blocks PR writes until data migration", async () => {
  const s = await setup();
  s.models.talents.schemaVersion = 1;
  s.models.talents.sources = [
    {
      id: "src-legacy",
      kind: "official",
      url: "https://example.com/",
      checkedAt: "2026-01-01T00:00:00Z",
    },
  ];
  s.models.talents.talents[0].displayNameSourceRefs = ["src-legacy"];
  const response = await s.get("/api/masters"),
    snapshot = await response.json();
  assert.equal(response.status, 200);
  assert.equal(snapshot.models.talents.schemaVersion, 2);
  assert(snapshot.migrationPending);
  assert(!JSON.stringify(snapshot.models).includes("sourceRefs"));
  const previewResponse = await s.call("/api/change-requests/preview", s.input);
  assert.equal(previewResponse.status, 200);
  const plan = await previewResponse.json();
  const submit = await s.call("/api/change-requests", { previewId: plan.id });
  assert.equal(submit.status, 409);
  assert.equal((await submit.json()).error, "migration_pending_reload");
  assert.equal(s.writes(), 0);
});
test("a pre-migration cached preview cannot write legacy schemas after the bridge deploy", async () => {
  const s = await setup();
  const response = await s.call("/api/change-requests/preview", s.input),
    plan = await response.json();
  const cached = s.map.get("preview:" + plan.id);
  delete cached.sourceFreeProtocol;
  const submit = await s.call("/api/change-requests", { previewId: plan.id });
  assert.equal(submit.status, 409);
  assert.equal(s.writes(), 0);
});

test("partially migrated masters and old clients cannot submit inconsistent PRs", async () => {
  const s = await setup();
  s.models.catalog.schemaVersion = 1;
  s.models.catalog.sources = [];
  const old = await s.call("/api/change-requests/preview", {
    ...s.input,
    evidence: { status: "verified" },
  });
  assert.equal(old.status, 409);
  assert.equal((await old.json()).error, "admin_updated_reload");
  const response = await s.call("/api/change-requests/preview", s.input);
  assert.equal(response.status, 200);
  const plan = await response.json();
  const submit = await s.call("/api/change-requests", { previewId: plan.id });
  assert.equal(submit.status, 409);
  assert.equal(s.writes(), 0);
});
