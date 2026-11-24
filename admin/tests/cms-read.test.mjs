import test from "node:test";
import assert from "node:assert/strict";
import { createCmsReader } from "../src/cms-read.mjs";

test("a write rechecks main and reuses immutable files only when the SHA matches", async () => {
  const first = "a".repeat(40);
  const second = "b".repeat(40);
  let main = first;
  let fileReads = 0;
  let refReads = 0;
  const snapshot = createCmsReader(async (url) => {
    if (url.endsWith("/git/ref/heads/main")) {
      refReads++;
      return Response.json({ object: { sha: main } });
    }
    fileReads++;
    return Response.json({ url });
  });

  const base = await snapshot();
  const baselineReads = fileReads;
  assert.ok(baselineReads > 0);
  assert.equal(await snapshot({ revalidate: true }), base);
  assert.equal(fileReads, baselineReads);
  assert.equal(refReads, 2);

  main = second;
  assert.equal((await snapshot()).sha, first);
  const updated = await snapshot({ revalidate: true });
  assert.equal(updated.sha, second);
  assert.equal(refReads, 3);
  assert.equal(fileReads, baselineReads * 2);
  assert.match(updated.models.goods.url, new RegExp(second));
});

test("authenticate ref only, bound raw reads, reuse completed data", async () => {
  const sha = "c".repeat(40);
  let active = 0, max = 0, count = 0, tokens = 0;
  const snapshot = createCmsReader(async (url, options) => {
    if (url.startsWith("https://api.github.com/")) {
      assert.equal(options.headers.Authorization, "Bearer fixture");
      return Response.json({ object: { sha } });
    }
    assert.match(url, new RegExp(sha));
    assert.equal(options.headers.Authorization, undefined);
    active++;
    max = Math.max(max, active);
    count++;
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return Response.json({ url });
  });
  const getReadToken = async () => { tokens++; return "fixture"; };
  const first = await snapshot({ getReadToken });
  assert.equal(count, 14);
  assert.ok(max <= 4);
  assert.equal(await snapshot({ getReadToken }), first);
  assert.equal(tokens, 1);
  assert.equal(await snapshot({ revalidate: true, getReadToken }), first);
  assert.equal(tokens, 2);
  assert.equal(count, 14);
});

test("failed upstream read is not cached and diagnostics contain only the stage and status", async (t) => {
  const sha = "d".repeat(40);
  let failRef = true, failFile = true;
  const warn = t.mock.method(console, "warn", () => {});
  const snapshot = createCmsReader(async (url) => {
    if (url.endsWith("/git/ref/heads/main"))
      return failRef ? new Response("private response", { status: 403 }) : Response.json({ object: { sha } });
    if (failFile && url.endsWith("/goods.json"))
      return new Response("private response", { status: 404 });
    return Response.json({});
  });
  await assert.rejects(snapshot(), /cms_read_unavailable/);
  assert.deepEqual(warn.mock.calls[0].arguments, ["cms_read_unavailable", { stage: "main_ref", reason: "http", status: 403 }]);
  failRef = false;
  await assert.rejects(snapshot(), /cms_read_unavailable/);
  assert.deepEqual(warn.mock.calls[1].arguments, ["cms_read_unavailable", { stage: "goods", reason: "http", status: 404 }]);
  failFile = false;
  assert.equal((await snapshot()).sha, sha);
});

test("a revalidation does not join an in-flight request with an older ref", async () => {
  const old = "e".repeat(40), next = "f".repeat(40);
  let main = old, start, release;
  const started = new Promise((resolve) => { start = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const snapshot = createCmsReader(async (url) => {
    if (url.endsWith("/git/ref/heads/main")) {
      const sha = main;
      if (sha === old) { start(); await gate; }
      return Response.json({ object: { sha } });
    }
    return Response.json({});
  });
  const first = snapshot();
  await started;
  main = next;
  try { assert.equal((await snapshot({ revalidate: true })).sha, next); }
  finally { release(); }
  assert.equal((await first).sha, old);
});

test("read-only App token is repository-scoped and independent of publishing", async () => {
  const { installationReadToken, installationClient } = await import("../src/github-app.mjs");
  const pair = await crypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
  }, true, ["sign", "verify"]);
  const der = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const env = {
    CMS_GITHUB_APP_ID: "1", CMS_GITHUB_INSTALLATION_ID: "2",
    CMS_GITHUB_APP_KEY: "-----BEGIN PRIVATE KEY-----\n" + Buffer.from(der).toString("base64") + "\n-----END PRIVATE KEY-----",
    CMS_PUBLISH_ENABLED: "false",
  };
  let calls = 0;
  const transport = async (url, options) => {
    calls++;
    assert.match(url, /\/app\/installations\/2\/access_tokens$/);
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), { repositories: ["jigjpwiki.github.io"], permissions: { contents: "read" } });
    return Response.json({ token: "read-token" });
  };
  assert.equal(await installationReadToken(env, transport), "read-token");
  await assert.rejects(installationClient(env, transport), /cms_publish_disabled/);
  assert.equal(await installationReadToken({}, transport), undefined);
  assert.equal(calls, 1);
});
