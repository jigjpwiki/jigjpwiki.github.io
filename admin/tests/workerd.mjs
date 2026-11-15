import { Miniflare, Response as MFResponse } from "miniflare";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { files, readFiles, filePath } from "../src/github.mjs";
import { hash } from "../src/security.mjs";
const root = path.resolve(".."),
  models = Object.fromEntries(
    readFiles.map((n) => [
      n,
      JSON.parse(fs.readFileSync(path.join(root, filePath(n)))),
    ]),
  );
let writes = 0;
const transport = async (request) => {
  if (request.method !== "GET" && request.body) await request.text();
  const u = new URL(request.url),
    p = u.pathname;
  let result;
  if (p === "/login/oauth/access_token") result = { access_token: "fixture" };
  else if (p === "/user") result = { id: 123, login: "fixture" };
  else if (p.endsWith("/git/ref/heads/main"))
    result = { object: { sha: "main-sha" } };
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
const mf = new Miniflare({
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
});
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
  headers["X-CSRF-Token"] = me.csrf;
  headers.Origin = "https://jigwiki-admin.local";
  headers["Content-Type"] = "application/json";
  const value = structuredClone(models.talents.talents[0]);
  value.displayName += "（検証）";
  const input = {
    sha: "main-sha",
    entity: "talent",
    action: "save",
    id: value.id,
    value,
    reason: "ローカルWorkerの検証",
    evidence: {
      status: "verified",
      url: models.talents.sources.find((s) => s.id === "src-mahiru-neru").url,
      checkedAt: new Date().toISOString(),
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
  console.log(
    "Local workerd/SQLite DO: OAuth, statically compiled full-master validation, preview, mocked PR and idempotent retry passed; no real external requests.",
  );
} finally {
  await mf.dispose();
}
