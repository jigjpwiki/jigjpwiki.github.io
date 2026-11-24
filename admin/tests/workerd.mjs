import { baselineModels, currentModels } from "./baseline.mjs";
import { Miniflare, Response as MFResponse } from "miniflare";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { files, readFiles, filePath } from "../src/github.mjs";
import { campaign, input as contentInput } from "./content-fixtures.mjs";
import { hash } from "../src/security.mjs";
const root = path.resolve(".."),
  models = baselineModels();
const mainSha = "a".repeat(40);
let writes = 0, cmsRawReads = 0;
const transport = async (request) => {
  if (request.method !== "GET" && request.body) await request.text();
  const u = new URL(request.url),
    p = u.pathname;
  let result;
  if (u.hostname === "raw.githubusercontent.com") {
    const name = p.split("/").at(-1).replace(/\.json$/, "");
    assert.ok(p.includes("/" + mainSha + "/data/"));
    assert.equal(request.headers.get("Authorization"), null);
    assert.ok(Object.hasOwn(models, name), "Unexpected CMS file " + name);
    cmsRawReads++;
    result = models[name];
  } else if (p === "/login/oauth/access_token") result = { access_token: "fixture" };
  else if (p === "/user") result = { id: 123, login: "fixture" };
  else if (p.endsWith("/git/ref/heads/main"))
    result = { object: { sha: mainSha } };
  else if (p.includes("/git/ref/heads/admin/"))
    return new MFResponse("{}", { status: 404 });
  else if (p.includes("/git/commits/") || p.endsWith("/git/commits"))
    result =
      request.method === "POST"
        ? { sha: "new-commit" }
        : { tree: { sha: "main-tree" } };
  else if (p.endsWith("/git/trees/main-tree"))
    result = {
      tree: readFiles.map((n) => ({ path: filePath(n), type: "blob", sha: n })),
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
  else if (p.endsWith("/pulls") && request.method === "POST") {
    writes++;
    result = {
      html_url: "https://github.com/jigjpwiki/jigjpwiki.github.io/pull/999",
      number: 999,
    };
  } else if (p.endsWith("/pulls")) result = [];
  else result = { default_branch: "main", permissions: { push: true } };
  return MFResponse.json(result);
};
const mfOptions = {
  modules: true,
  scriptPath: path.resolve("build/worker.mjs"),
  compatibilityDate: "2026-06-18",
  outboundService: transport,
  durableObjects: { ADMIN: { className: "Admin", useSQLite: true } },
  bindings: {
    ADMIN_ENABLED: "true",
    GITHUB_CLIENT_ID: "fixture",
    GITHUB_CLIENT_SECRET: "fixture",
    ADMIN_USER_IDS: "123",
    SESSION_KEY: "a".repeat(43),
  },
};
const mf = new Miniflare(mfOptions);
try {
  const r = await mf.dispatchFetch("https://jigwiki-admin.local/api/me");
  assert.equal(r.status, 401);
  const login = await mf.dispatchFetch(
    "https://jigwiki-admin.local/auth/login",
    { redirect: "manual" },
  );
  assert.equal(login.status, 302);
  const auth = new URL(login.headers.get("Location")),
    state = auth.searchParams.get("state");
  assert(auth.searchParams.has("code_challenge"));
  const callback = await mf.dispatchFetch(
    "https://jigwiki-admin.local/auth/callback?code=fixture&state=" + state,
    { redirect: "manual", headers: { Cookie: "__Host-admin-oauth=" + state } },
  );
  assert.equal(callback.status, 302, await callback.clone().text());
  const sid = callback.headers
      .get("Set-Cookie")
      .match(/__Host-admin-session=([\w-]+)/)[1],
    headers = { Cookie: "__Host-admin-session=" + sid };
  const me = await (
    await mf.dispatchFetch("https://jigwiki-admin.local/api/me", { headers })
  ).json();
  // Exercise actual workerd fetch construction and outbound transport, not just
  // Node mocks: redirect:"error" is invalid in this runtime.
  const catalogResponse = await mf.dispatchFetch(
    "https://jigwiki-admin.local/api/cms/catalog", { headers },
  );
  const catalog = await catalogResponse.json();
  assert.equal(catalogResponse.status, 200, JSON.stringify(catalog));
  assert.equal(catalog.sha, mainSha);
  assert.equal(catalog.owner, true);
  assert.ok(catalog.sections.some((section) => section.items.length > 0));
  assert.equal(cmsRawReads, 14);
  assert.equal(writes, 0);
  console.log("Local workerd: authenticated CMS catalog and all 14 immutable reads passed.");
  headers["X-CSRF-Token"] = me.csrf;
  headers.Origin = "https://jigwiki-admin.local";
  headers["Content-Type"] = "application/json";
  const draft = {
    protocol: 1,
    revision: 0,
    operations: [
      {
        key: "draft-one",
        entity: "campaign",
        baseCommit: mainSha,
        before: null,
        value: { title: "永続下書き", visibility: "draft" },
      },
    ],
  };
  const saveDraft = () =>
    mf.dispatchFetch("https://jigwiki-admin.local/api/workspace", {
      method: "PUT",
      headers,
      body: JSON.stringify(draft),
    });
  const parallel = await Promise.all([saveDraft(), saveDraft()]);
  assert.deepEqual(parallel.map((r) => r.status).sort(), [200, 409]);
  const saved = await (
    await mf.dispatchFetch("https://jigwiki-admin.local/api/workspace", {
      headers,
    })
  ).json();
  assert.equal(saved.workspace.operations[0].value.title, "永続下書き");
  assert.equal(saved.workspace.revision, 1);
  assert.equal(writes, 0);
  const value = structuredClone(models.talents.talents[0]);
  value.displayName += "（検証）";
  const input = {
    sha: mainSha,
    entity: "talent",
    action: "save",
    id: value.id,
    value,
    reason: "ローカルWorkerの検証",
    confirmation: {
      status: "confirmed",
      valueHash: await hash(value),
    },
  };
  const preview = await mf.dispatchFetch(
    "https://jigwiki-admin.local/api/change-requests/preview",
    { method: "POST", headers, body: JSON.stringify(input) },
  );
  const plan = await preview.json();
  assert.equal(preview.status, 200, JSON.stringify(plan));
  assert(plan.files.includes("talents"));
  const submit = await mf.dispatchFetch(
    "https://jigwiki-admin.local/api/change-requests",
    { method: "POST", headers, body: JSON.stringify({ previewId: plan.id }) },
  );
  assert.equal(submit.status, 200, await submit.clone().text());
  const again = await mf.dispatchFetch(
    "https://jigwiki-admin.local/api/change-requests",
    { method: "POST", headers, body: JSON.stringify({ previewId: plan.id }) },
  );
  assert.equal(again.status, 200);
  assert.equal(writes, 1);
  const content = await contentInput({ sha: mainSha }, campaign());
  const cp = await mf.dispatchFetch(
    "https://jigwiki-admin.local/api/change-requests/preview",
    { method: "POST", headers, body: JSON.stringify(content) },
  );
  const contentPlan = await cp.json();
  assert.equal(cp.status, 200, JSON.stringify(contentPlan));
  assert(contentPlan.files.includes("goods"));
  assert(contentPlan.files.includes("catalog-id-registry"));
  assert.equal(contentPlan.impact.records.length, 3);
  const committed = await mf.dispatchFetch(
    "https://jigwiki-admin.local/api/change-requests",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ previewId: contentPlan.id }),
    },
  );
  assert.equal(committed.status, 200, await committed.clone().text());
  const recovered = await mf.dispatchFetch(
    "https://jigwiki-admin.local/api/change-requests",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ previewId: contentPlan.id }),
    },
  );
  assert.equal(recovered.status, 200);
  assert.equal(writes, 2);
  const mixed = Array.from({ length: 20 }, (_, i) => {
    if (i < 5) {
      const before = structuredClone(models.talents.talents[i]);
      return {
        key: "talent-" + i,
        entity: "talent",
        id: before.id,
        baseCommit: mainSha,
        before,
        value: { ...before, displayName: before.displayName + " Worker" },
      };
    }
    if (i < 10) {
      const before = structuredClone(models.anniversaries.events[i - 5]);
      return {
        key: "ann-" + i,
        entity: "anniversary",
        id: before.id,
        baseCommit: mainSha,
        before,
        value: { ...before, title: before.title + " Worker" },
      };
    }
    return {
      key: "campaign-" + i,
      entity: "campaign",
      baseCommit: mainSha,
      before: null,
      value: { title: "Worker " + i, visibility: "draft" },
    };
  });
  const save = await mf.dispatchFetch(
    "https://jigwiki-admin.local/api/workspace",
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ protocol: 1, revision: 1, operations: mixed }),
    },
  );
  assert.equal(save.status, 200, await save.clone().text());
  const sp = await mf.dispatchFetch(
    "https://jigwiki-admin.local/api/submissions/preview",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        protocol: 2,
        revision: 2,
        keys: mixed.map((o) => o.key),
      }),
    },
  );
  const selection = await sp.json();
  assert.equal(sp.status, 200, JSON.stringify(selection));
  assert.equal(selection.records.length, 20);
  const submitInput = {
    protocol: 2,
    previewId: selection.id,
    confirmationHash: selection.confirmationHash,
  };
  const response = await mf.dispatchFetch(
    "https://jigwiki-admin.local/api/submissions",
    { method: "POST", headers, body: JSON.stringify(submitInput) },
  );
  assert.equal(response.status, 200, await response.clone().text());
  const repeated = await mf.dispatchFetch(
    "https://jigwiki-admin.local/api/submissions",
    { method: "POST", headers, body: JSON.stringify(submitInput) },
  );
  assert.equal(repeated.status, 200);
  assert.equal(writes, 3);
  const remaining = await (
    await mf.dispatchFetch("https://jigwiki-admin.local/api/workspace", {
      headers,
    })
  ).json();
  assert.equal(remaining.workspace.operations.length, 0);
  const capacity = Array.from({ length: 120 }, (_, i) => ({
    key: "capacity-" + i,
    entity: "campaign",
    baseCommit: mainSha,
    before: null,
    value: { title: "capacity-" + i + "x".repeat(3000), visibility: "draft" },
  }));
  const savedAt = performance.now(),
    capacityResponse = await mf.dispatchFetch(
      "https://jigwiki-admin.local/api/workspace",
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          protocol: 1,
          revision: remaining.workspace.revision,
          operations: capacity,
        }),
      },
    );
  assert.equal(
    capacityResponse.status,
    200,
    await capacityResponse.clone().text(),
  );
  const stored = (await capacityResponse.json()).workspace;
  assert.equal(stored.operations.length, 120);
  const denied = await mf.dispatchFetch(
    "https://jigwiki-admin.local/api/workspace",
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        protocol: 1,
        revision: stored.revision,
        operations: [...capacity, { ...capacity[0], key: "capacity-over" }],
      }),
    },
  );
  assert.equal(denied.status, 413);
  await mf.setOptions({ ...mfOptions });
  const restored = await (
    await mf.dispatchFetch("https://jigwiki-admin.local/api/workspace", {
      headers,
    })
  ).json();
  assert.equal(restored.workspace.revision, stored.revision);
  assert.equal(restored.workspace.operations.length, 120);
  assert.equal(
    restored.workspace.operations[119].value.title,
    capacity[119].value.title,
  );
  const invalidPreview = await mf.dispatchFetch(
    "https://jigwiki-admin.local/api/submissions/preview",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        protocol: 2,
        revision: stored.revision,
        keys: capacity.map((o) => o.key),
      }),
    },
  );
  assert.equal(invalidPreview.status, 400);
  assert.equal(writes, 3);
  console.log(
    "Local workerd/SQLite Phase4 120 drafts / runtime restart / 121 refusal / invalid preview safe:",
    JSON.stringify({
      bodyBytes: Buffer.byteLength(JSON.stringify(capacity)),
      elapsedMs: Math.round(performance.now() - savedAt),
    }),
  );
  console.log(
    "Local workerd/SQLite Phase 2: 20 mixed drafts, optional reason, one mocked PR, atomic cleanup and journal recovery passed.",
  );
  console.log(
    "Local workerd/SQLite content batch: Campaign/Product/Offer plus ID reservations and idempotent mocked PR passed.",
  );
  console.log(
    "Local workerd/SQLite DO: OAuth, statically compiled full-master validation, preview, mocked PR and idempotent retry passed; no real external requests.",
  );
} finally {
  await mf.dispose();
}
