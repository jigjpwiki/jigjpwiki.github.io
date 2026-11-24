import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../../tests/fixtures/admin-vnext-baseline.json" with { type: "json" };
import { inspectDraftConflicts } from "../src/cms-conflicts.mjs";

function setup() {
  const models = structuredClone(fixture);
  const before = structuredClone(models.events.events[0]);
  const latest = { ...before, title: "最新のイベント名", venue: "最新の会場" };
  models.events.events[0] = latest;
  return {
    snapshot: { sha: "current", models },
    member: { role: "editor", owner: true, scope: { categories: ["events"] } },
    operations: [{ key: "cms-event", entity: "event", id: before.id, before,
      baseCommit: "original", value: { ...before, title: "自分のイベント名", summary: "自分の概要" } }],
  };
}

test("conflict comparison identifies the exact field and merges disjoint main and draft edits", () => {
  const { snapshot, member, operations } = setup();
  const { conflicts } = inspectDraftConflicts(snapshot, member, operations);
  assert.deepEqual(conflicts.map(({ field, ours, theirs }) => ({ field, ours, theirs })), [
    { field: "/title", ours: "自分のイベント名", theirs: "最新のイベント名" },
  ]);
  const { resolved } = inspectDraftConflicts(snapshot, member, operations, ["theirs"]);
  assert.equal(resolved[0].value.title, "最新のイベント名");
  assert.equal(resolved[0].value.venue, "最新の会場");
  assert.equal(resolved[0].value.summary, "自分の概要");
  assert.equal(resolved[0].baseCommit, "current");
  assert.equal(resolved[0].before.title, "最新のイベント名");
  assert.equal(inspectDraftConflicts(snapshot, member, operations, ["ours"]).resolved[0].value.title,
    "自分のイベント名");
});

test("revoked roles and current record visibility prevent disclosure of comparison values", () => {
  const { snapshot, member, operations } = setup();
  assert.throws(() => inspectDraftConflicts(snapshot, { ...member, role: "viewer" }, operations), /cms_scope_denied/);
  assert.throws(() => inspectDraftConflicts(snapshot, member, operations, []), /cms_conflict_choice/);
  snapshot.models.events.events[0].visibility = "draft";
  assert.throws(() => inspectDraftConflicts(snapshot, member, operations), /cms_scope_denied/);
});

test("Worker applies reviewed choices through Workspace compare-and-swap", async () => {
  const { Admin } = await import("../src/worker.mjs");
  const { random, seal } = await import("../src/security.mjs");
  const { WorkspaceStore } = await import("../src/workspace.mjs");
  const { snapshot, operations } = setup();
  const id = "1";
  const sid = random();
  const key = random();
  const expiry = Date.now() + 60000;
  const csrf = "conflict-test";
  const rows = new Map();
  const store = {
    get: async (item) => rows.get(item),
    put: async (item, value) => rows.set(item, value),
    delete: async (item) => rows.delete(item),
  };
  await store.put("session:" + sid, { id, token: await seal("fixture-token", key), expires: expiry, csrf });
  const workspace = new WorkspaceStore(store, key);
  const draftId = "a".repeat(24);
  const [operation] = operations;
  await workspace.save(id, { protocol: 1, revision: 0, operations: [
    { ...operation, key: operation.key + "-" + draftId },
  ] });
  const admin = new Admin({}, {
    ADMIN_USER_IDS: id, SESSION_KEY: key, GITHUB_CLIENT_ID: "fixture", GITHUB_CLIENT_SECRET: "fixture", __testStore: store,
    __testFetch: async (url) => url.endsWith("/user")
      ? Response.json({ id, login: "owner" })
      : Response.json({ default_branch: "main", permissions: { push: true } }),
  });
  admin.cmsSnapshot = async () => snapshot;
  const origin = "https://admin.test";
  const headers = {
    Cookie: "__Host-admin-session=" + sid,
    Origin: origin,
    "Content-Type": "application/json",
    "X-CSRF-Token": csrf,
  };
  const url = origin + "/api/cms/draft/conflicts";
  const preview = await admin.fetch(new Request(url + "?draftId=" + draftId, { headers }));
  assert.equal(preview.status, 200, await preview.clone().text());
  const { revision, sha, conflicts } = await preview.json();
  assert.equal(revision, 1);
  assert.equal(conflicts[0].field, "/title");
  const put = (fields) => admin.fetch(new Request(url, {
    method: "PUT", headers, body: JSON.stringify({ draftId, revision, sha, choices: ["theirs"], ...fields }),
  }));
  assert.equal((await put({ sha: "old" })).status, 409);
  const saved = await put({});
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal((await put({})).status, 409);
  const after = await workspace.get(id);
  assert.equal(after.operations[0].baseCommit, snapshot.sha);
  assert.equal(after.operations[0].before.title, "最新のイベント名");
  assert.equal(after.operations[0].value.title, "最新のイベント名");
  assert.equal(after.operations[0].value.venue, "最新の会場");
  assert.equal(after.operations[0].value.summary, "自分の概要");
});
