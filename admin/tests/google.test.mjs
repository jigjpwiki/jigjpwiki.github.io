import test from "node:test";
import assert from "node:assert/strict";
import { b64 } from "../src/security.mjs";
import { verifyGoogle, googleAuth, googleControlsEmail } from "../src/google.mjs";

test("Google claims must be signed, intended for this client and bound to the verified invitation identity", async () => {
  const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) };
  const pair = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
  const keys = [{ ...await crypto.subtle.exportKey("jwk", pair.publicKey), kid: "fixture" }];
  const encoder = new TextEncoder();
  const encode = (value) => b64(encoder.encode(JSON.stringify(value)));
  const now = Date.now();
  const claims = { iss: "https://accounts.google.com", aud: "client", nonce: "nonce", iat: now / 1000, exp: now / 1000 + 60, sub: "1234", email: "editor@example.test", email_verified: true };
  async function sign(fields) {
    const message = encode({ alg: "RS256", kid: "fixture" }) + "." + encode(fields);
    return message + "." + b64(new Uint8Array(await crypto.subtle.sign(algorithm, pair.privateKey, encoder.encode(message))));
  }
  const valid = await sign(claims);
  assert.equal((await verifyGoogle(valid, "client", "nonce", keys, now)).sub, "1234");
  for (const patch of [{ aud: "another" }, { nonce: "wrong" }, { email_verified: false }, { exp: 0 }, { iss: "https://example.test" }])
    await assert.rejects(verifyGoogle(await sign({ ...claims, ...patch }), "client", "nonce", keys, now), /google_identity_invalid/);
  const [head, , signature] = valid.split(".");
  await assert.rejects(verifyGoogle(head + "." + encode({ ...claims, sub: "changed" }) + "." + signature, "client", "nonce", keys, now), /google_identity_invalid/);
});

test("a Google callback without matching browser state cannot contact Google", async () => {
  const origin = "https://admin.example.test";
  await assert.rejects(googleAuth(
    new Request(origin + "/auth/google/callback?state=unknown&code=fixture"),
    { GOOGLE_AUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "fixture", GOOGLE_ADMIN_ORIGIN: origin },
    {}, () => assert.fail("external request"), Date.now(), (callback) => callback(),
  ), /oauth_state_invalid/);
});


test("only Google-managed mailbox addresses can claim invitations", () => {
  assert.equal(googleControlsEmail({ email: "a@gmail.com" }), true);
  assert.equal(googleControlsEmail({ email: "a@example.test", hd: "example.test" }), true);
  assert.equal(googleControlsEmail({ email: "a@example.test", hd: "other.test" }), false);
  assert.equal(googleControlsEmail({ email: "a@example.test" }), false);
});

test("invitation binds a subject and owner changes revoke its session", async () => {
  const { Admin } = await import("../src/worker.mjs");
  const { seal, open, hash } = await import("../src/security.mjs");
  const { emailKey } = await import("../src/google.mjs");
  const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) };
  const pair = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
  const jwk = { ...await crypto.subtle.exportKey("jwk", pair.publicKey), kid: "test" };
  const encoder = new TextEncoder();
  const encode = (value) => b64(encoder.encode(JSON.stringify(value)));
  const rows = new Map();
  const store = {
    get: async (key) => rows.get(key),
    put: async (key, value) => rows.set(key, value),
    delete: async (key) => rows.delete(key),
  };
  const origin = "https://admin.example.test";
  let nonce, challenge, subject = "subject-1";
  const email = "editor@gmail.com";
  const env = {
    GITHUB_CLIENT_ID: "owner", GITHUB_CLIENT_SECRET: "test", ADMIN_USER_IDS: "1",
    GOOGLE_AUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "test",
    GOOGLE_ADMIN_ORIGIN: origin, SESSION_KEY: b64(new Uint8Array(32)), __testStore: store,
    async __testFetch(url, options) {
      if (url.endsWith("/certs")) return Response.json({ keys: [jwk] });
      assert.equal(url, "https://oauth2.googleapis.com/token");
      assert.equal(await hash(options.body.get("code_verifier")), challenge);
      const now = Date.now() / 1000;
      const msg = encode({ alg: "RS256", kid: "test" }) + "." + encode({
        iss: "https://accounts.google.com", aud: "client", nonce, iat: now,
        exp: now + 60, sub: subject, email, email_verified: true,
      });
      const sig = await crypto.subtle.sign(algorithm, pair.privateKey, encoder.encode(msg));
      return Response.json({ id_token: msg + "." + b64(new Uint8Array(sig)) });
    },
  };
  const admin = new Admin({}, env);
  async function login() {
    const start = await admin.fetch(new Request(origin + "/auth/google/login"));
    const params = new URL(start.headers.get("Location")).searchParams;
    nonce = params.get("nonce");
    challenge = params.get("code_challenge");
    const state = params.get("state");
    const callback = () => admin.fetch(new Request(origin + "/auth/google/callback?code=test&state=" + state, {
      headers: { Cookie: "__Host-admin-google=" + state },
    }));
    const result = await callback();
    assert.equal((await callback()).status, 403);
    return result;
  }
  assert.equal((await login()).status, 403);
  const key = await emailKey(email);
  const member = { id: "editor", role: "editor", revision: "1", expires: Date.now() + 60000 };
  await store.put(key, await seal(member, env.SESSION_KEY));
  const loggedIn = await login();
  assert.equal(loggedIn.status, 302);
  assert.equal((await open(await store.get(key), env.SESSION_KEY)).sub, subject);
  const cookies = loggedIn.headers.getSetCookie()[0].split(";")[0];
  const get = (path) => admin.fetch(new Request(origin + path, { headers: { Cookie: cookies } }));
  assert.equal((await (await get("/api/me")).json()).id, "editor");
  assert.equal((await get("/api/masters")).status, 403);
  subject = "different-subject";
  assert.equal((await login()).status, 403);
  env.GOOGLE_AUTH_ENABLED = "false";
  assert.equal((await get("/api/me")).status, 401);
  env.GOOGLE_AUTH_ENABLED = "true";
  await store.put(key, await seal({ ...member, revision: "2" }, env.SESSION_KEY));
  assert.equal((await get("/api/me")).status, 401);
});
