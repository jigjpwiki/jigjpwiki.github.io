import { Miniflare, Response as MFResponse } from "miniflare";
import assert from "node:assert/strict";
import path from "node:path";
const mf = new Miniflare({
  modules: true,
  scriptPath: path.resolve("build/worker.mjs"),
  compatibilityDate: "2026-06-18",
  outboundService: async (request) => {
    if (request.body) await request.text();
    return MFResponse.json(
      new URL(request.url).pathname.endsWith("/access_token")
        ? { access_token: "fixture" }
        : new URL(request.url).pathname === "/user"
          ? { id: 123, login: "fixture" }
          : { default_branch: "main", permissions: { push: true } },
    );
  },
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
  assert.equal(
    (await mf.dispatchFetch("https://admin.local/api/me")).status,
    401,
  );
  const login = await mf.dispatchFetch("https://admin.local/auth/login", {
      redirect: "manual",
    }),
    state = new URL(login.headers.get("Location")).searchParams.get("state");
  const callback = await mf.dispatchFetch(
    "https://admin.local/auth/callback?code=fixture&state=" + state,
    { redirect: "manual", headers: { Cookie: "__Host-admin-oauth=" + state } },
  );
  assert.equal(callback.status, 302, await callback.clone().text());
  const id = callback.headers
      .get("Set-Cookie")
      .match(/__Host-admin-session=([\w-]+)/)[1],
    headers = { Cookie: "__Host-admin-session=" + id };
  const me = await (
    await mf.dispatchFetch("https://admin.local/api/me", { headers })
  ).json();
  assert.equal(me.id, "123");
  assert(!JSON.stringify(me).includes("access_token"));
  headers.Origin = "https://admin.local";
  headers["X-CSRF-Token"] = me.csrf;
  assert.equal(
    (
      await mf.dispatchFetch("https://admin.local/auth/logout", {
        method: "POST",
        headers,
      })
    ).status,
    200,
  );
  assert.equal(
    (await mf.dispatchFetch("https://admin.local/api/me", { headers })).status,
    401,
  );
  console.log(
    "A1 local workerd/SQLite DO: mocked OAuth, encrypted session, GitHub authorization and logout passed.",
  );
} finally {
  await mf.dispose();
}
