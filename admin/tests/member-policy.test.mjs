import test from "node:test";
import assert from "node:assert/strict";
import { Admin } from "../src/worker.mjs";
import { random, seal, open } from "../src/security.mjs";
import { emailKey } from "../src/google.mjs";

test("owner confirms legacy policy migration, preserves identity and scope, and revokes old sessions", async () => {
  const key = random(), sid = random(), csrf = random(), origin = "https://admin.test";
  const rows = new Map();
  const store = { get: async (name) => rows.get(name), put: async (name, value) => rows.set(name, value),
    members: async () => [...rows].filter(([name]) => name.startsWith("member:")).map(([, value]) => value) };
  await store.put("session:" + sid, { id: "1", token: await seal("token", key), csrf, expires: Date.now() + 60000 });
  const admin = new Admin({}, { GITHUB_CLIENT_ID: "test", GITHUB_CLIENT_SECRET: "test", SESSION_KEY: key, ADMIN_USER_IDS: "1", GOOGLE_AUTH_ENABLED: "true",
    GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test", GOOGLE_ADMIN_ORIGIN: origin,
    __testStore: store, __testFetch: async (url) => url.endsWith("/user")
      ? Response.json({ id: "1" }) : Response.json({ default_branch: "main", permissions: { push: true } }) });
  const memberKey = await emailKey("legacy@gmail.com");
  const legacy = { id: "stable-member-id", sub: "stable-google-sub", role: "editor", revision: "old",
    scope: { organizations: ["org-000001"], groups: [], categories: ["events"] }, directPublish: false };
  await store.put(memberKey, await seal(legacy, key));
  const editorSid = random();
  await store.put("session:" + editorSid, { id: legacy.id, provider: "google", memberKey, revision: "old",
    expires: Date.now() + 60000, csrf: random() });
  const update = (input) => admin.fetch(new Request(origin + "/api/members", { method: "POST",
    headers: { Cookie: "__Host-admin-session=" + sid, Origin: origin, "X-CSRF-Token": csrf, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "legacy@gmail.com", role: "editor", disabled: false, ...input }) }));
  assert.equal((await update({ contentPolicy: "all-content-v1" })).status, 409);
  assert.equal((await open(await store.get(memberKey), key)).revision, "old");
  assert.equal((await update({ contentPolicy: "all-content-v1", confirmPolicyMigration: true })).status, 200);
  const migrated = await open(await store.get(memberKey), key);
  assert.equal(migrated.id, legacy.id);
  assert.equal(migrated.sub, legacy.sub);
  assert.deepEqual(migrated.scope, legacy.scope);
  assert.equal(migrated.directPublish, true);
  assert.notEqual(migrated.revision, "old");
  const oldSession = await admin.fetch(new Request(origin + "/api/me", {
    headers: { Cookie: "__Host-admin-session=" + editorSid } }));
  assert.equal(oldSession.status, 401);
  const added = await update({ email: "new@gmail.com" });
  assert.equal(added.status, 200);
  const fresh = await open(await store.get(await emailKey("new@gmail.com")), key);
  assert.equal(fresh.contentPolicy, "all-content-v1");
  assert.equal(fresh.directPublish, true);
  assert.equal(fresh.owner, undefined);
});

test("bulk migration requires the current confirmed roster and never activates disabled or expired invitations", async () => {
  const key = random(), sid = random(), csrf = random(), origin = "https://admin.test";
  const rows = new Map();
  let batches = 0;
  const store = { get: async (name) => rows.get(name), put: async (name, value) => rows.set(name, value),
    members: async () => [...rows].filter(([name]) => name.startsWith("member:")).map(([, value]) => value),
    putMemberBatch: async (updates) => { batches++; for (const { key, value } of updates) rows.set(key, value); } };
  await store.put("session:" + sid, { id: "1", token: await seal("token", key), csrf, expires: Date.now() + 60000 });
  const admin = new Admin({}, { GITHUB_CLIENT_ID: "test", GITHUB_CLIENT_SECRET: "test", SESSION_KEY: key, ADMIN_USER_IDS: "1",
    GOOGLE_AUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test", GOOGLE_ADMIN_ORIGIN: origin,
    __testStore: store, __testFetch: async (url) => url.endsWith("/user")
      ? Response.json({ id: "1" }) : Response.json({ default_branch: "main", permissions: { push: true } }) });
  const now = Date.now();
  const seed = async (id, role, extra = {}) => {
    const value = { id, role, email: id + "@gmail.com", sub: "sub-" + id, expires: now - 1,
      disabled: false, revision: "old", directPublish: false, scope: { categories: ["events"] }, ...extra };
    const memberKey = await emailKey(value.email);
    await store.put(memberKey, await seal(value, key));
    return { value, memberKey };
  };
  const editor = await seed("editor", "editor"), viewer = await seed("viewer", "viewer");
  const disabled = await seed("disabled", "editor", { disabled: true });
  const expired = await seed("expired", "editor", { sub: null });
  const already = await seed("already", "editor", { contentPolicy: "all-content-v1" });
  const googleSid = random(), googleCsrf = random();
  await store.put("session:" + googleSid, { id: "editor", provider: "google", memberKey: editor.memberKey,
    revision: "old", csrf: googleCsrf, expires: now + 60000 });
  const request = (input, session = sid, token = csrf) => admin.fetch(new Request(origin + "/api/members/migrate", {
    method: "POST", headers: { Cookie: "__Host-admin-session=" + session, Origin: origin,
      "X-CSRF-Token": token, "Content-Type": "application/json" }, body: JSON.stringify(input),
  }));
  const members = [{ id: "editor", role: "editor" }, { id: "viewer", role: "viewer" }];
  assert.equal((await request({ members })).status, 400);
  assert.equal((await request({ members: members.slice(0, 1), confirmPolicyMigration: true })).status, 409);
  assert.equal((await request({ members, confirmPolicyMigration: true }, googleSid, googleCsrf)).status, 403);
  assert.equal(batches, 0);
  await store.put("cms-publication-active", await seal({ owner: "editor", phase: "checking" }, key));
  assert.equal((await request({ members, confirmPolicyMigration: true })).status, 409);
  rows.delete("cms-publication-active");
  const migrated = await request({ members, confirmPolicyMigration: true });
  assert.equal(migrated.status, 200);
  assert.deepEqual(await migrated.json(), { migrated: 2 });
  assert.equal(batches, 1);
  for (const entry of [editor, viewer]) {
    const result = await open(await store.get(entry.memberKey), key);
    assert.equal(result.contentPolicy, "all-content-v1");
    assert.equal(result.directPublish, result.role === "editor");
    assert.equal(result.sub, entry.value.sub);
    assert.equal(result.expires, entry.value.expires);
    assert.deepEqual(result.scope, entry.value.scope);
    assert.notEqual(result.revision, "old");
  }
  for (const entry of [disabled, expired, already])
    assert.deepEqual(await open(await store.get(entry.memberKey), key), entry.value);
  assert.equal((await admin.fetch(new Request(origin + "/api/me", { headers: { Cookie: "__Host-admin-session=" + googleSid } }))).status, 401);
});
