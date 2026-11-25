import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../../tests/fixtures/admin-vnext-baseline.json" with { type: "json" };
import { Admin } from "../src/worker.mjs";
import { random, seal } from "../src/security.mjs";
import { WorkspaceStore } from "../src/workspace.mjs";
import { prepareBulkDrafts, prepareDraft, draftInput, draftGroups } from "../src/cms-draft.mjs";
import { publicationPlan } from "../src/cms-publish.mjs";

const origin = "https://admin.test";
const sha = "a".repeat(40);
const owner = "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026";
const member = { id: owner, revision: "r1", role: "editor", contentPolicy: "all-content-v1", directPublish: true, scope: {} };
const snapshot = { sha, models: fixture };
const ids = fixture.talents.talents.slice(0, 2).map((row) => row.id);
const bulk = { sha, entity: "talent", ids, field: "activity", value: "hiatus", revision: 0 };

async function harness() {
  const rows = new Map();
  let alarms = 0, reads = 0;
  const key = random();
  const store = { get: async (name) => rows.get(name), put: async (name, value) => rows.set(name, value), delete: async (name) => rows.delete(name) };
  const env = { SESSION_KEY: key, ADMIN_ENABLED: "true", ADMIN_USER_IDS: "1", GITHUB_CLIENT_ID: "fixture", GITHUB_CLIENT_SECRET: "fixture",
    GOOGLE_AUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "fixture", GOOGLE_CLIENT_SECRET: "fixture", GOOGLE_ADMIN_ORIGIN: origin,
    CMS_PUBLISH_ENABLED: "true", CMS_GITHUB_APP_ID: "1", CMS_GITHUB_INSTALLATION_ID: "2", CMS_GITHUB_APP_KEY: "fixture",
    __testStore: store, __testFetch: async () => assert.fail("no external requests in regression tests") };
  const admin = new Admin({ storage: { setAlarm: async () => { alarms++; } } }, env);
  admin.cmsSnapshot = async () => { reads++; return snapshot; };
  const login = async (grant) => {
    const sid = random(), csrf = random(), memberKey = "member:" + grant.id;
    await store.put(memberKey, await seal(grant, key));
    await store.put("session:" + sid, { id: grant.id, provider: "google", memberKey, revision: grant.revision, csrf, expires: Date.now() + 60000 });
    const request = (path, method = "GET", input, headers = {}) => admin.fetch(new Request(origin + path, {
      method, headers: { Cookie: "__Host-admin-session=" + sid, Origin: origin, "X-CSRF-Token": csrf, "Content-Type": "application/json", ...headers },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    }));
    return { sid, memberKey, request };
  };
  return { admin, env, key, store, login, workspace: new WorkspaceStore(store, key), alarms: () => alarms, reads: () => reads };
}
async function expect(response, status, error) {
  assert.equal(response.status, status, await response.clone().text());
  const result = await response.json();
  if (error) assert.equal(result.error, error);
  return result;
}

test("Google bulk API rejects unauthorized, stale, duplicate, oversized and cross-origin operations without saving", async () => {
  const h = await harness();
  const editor = await h.login(member);
  const viewer = await h.login({ ...member, id: "viewer", role: "viewer", directPublish: false });
  const scoped = await h.login({ ...member, id: "scoped", contentPolicy: "scoped-v1", scope: { organizations: ["org-000001"], categories: ["talents"] } });
  const route = "/api/cms/draft/bulk";
  for (const account of [viewer, scoped]) await expect(await account.request(route, "PUT", bulk), 403, "cms_scope_denied");
  await expect(await viewer.request("/api/cms/publication", "POST", {}), 403, "cms_scope_denied");
  await expect(await editor.request("/api/members", "POST", {}), 403, "google_route_not_enabled");
  await expect(await editor.request(route, "PUT", bulk, { Origin: "https://other.test" }), 403, "csrf_rejected");
  await expect(await editor.request(route, "PUT", bulk, { "X-CSRF-Token": "wrong" }), 403, "csrf_rejected");
  await expect(await editor.request(route, "PUT", { ...bulk, revision: 1 }), 409, "workspace_revision_conflict");
  await expect(await editor.request(route, "PUT", { ...bulk, sha: "b".repeat(40) }), 409, "main_changed_reload");
  for (const invalid of [{ ids: [] }, { ids: [ids[0], ids[0]] }, { ids: Array.from({ length: 13 }, (_, i) => "tal-" + i) }, { field: "accounts" }, { value: "invalid" }])
    await expect(await editor.request(route, "PUT", { ...bulk, ...invalid }), 400, "cms_invalid_bulk");
  await expect(await editor.request(route, "PUT", { ...bulk, ids: [ids[0], "tal-999999"] }), 403, "cms_scope_denied");
  for (const id of [owner, "viewer", "scoped"]) assert.equal(await h.workspace.get(id), null);
  assert.equal(h.alarms(), 0);
});

test("bulk drafts survive a reload, are isolated by user, and bind publication to the exact review", async () => {
  const h = await harness();
  const editor = await h.login(member);
  const other = await h.login({ ...member, id: "other" });
  const saved = await expect(await editor.request("/api/cms/draft/bulk", "PUT", bulk), 200);
  assert.equal(saved.draftIds.length, 2);
  const list = await expect(await editor.request("/api/cms/draft"), 200);
  assert.equal(list.revision, 1);
  assert.deepEqual(list.drafts.map((row) => row.conflict), [false, false]);
  assert.ok(list.drafts.every((row) => row.input.activity === "hiatus"));
  const empty = await expect(await other.request("/api/cms/draft"), 200);
  assert.deepEqual(empty.drafts, []);
  await expect(await other.request("/api/cms/draft", "DELETE", { revision: 0, draftId: saved.draftIds[0] }), 409, "workspace_revision_conflict");
  await expect(await editor.request("/api/cms/draft/bulk", "PUT", { ...bulk, revision: 1 }), 409, "cms_bulk_existing_draft");
  const original = await h.workspace.get(owner);
  assert.equal(original.revision, 1);
  const preview = await expect(await editor.request("/api/cms/publication/preview", "POST", { revision: 1, draftIds: saved.draftIds }), 200);
  assert.deepEqual(preview.records.map((row) => row.id).sort(), [...ids].sort());
  assert.ok(preview.records.every((row) => row.changes.some((change) => change.field === "activityStatus" && change.after.value === "hiatus")));
  await expect(await editor.request("/api/cms/publication", "POST", { revision: 1, draftIds: saved.draftIds }), 409, "cms_review_required");
  await expect(await editor.request("/api/cms/publication", "POST", { revision: 1, draftIds: saved.draftIds.slice(0, 1), review: preview.review }), 409, "cms_review_stale");
  assert.equal(h.alarms(), 0);
  assert.deepEqual(await h.workspace.get(owner), original);
  h.env.CMS_PUBLISH_ENABLED = "false";
  await expect(await editor.request("/api/cms/publication", "POST", { revision: 1, draftIds: saved.draftIds, review: preview.review }), 403, "cms_publish_disabled");
  h.env.CMS_PUBLISH_ENABLED = "true";
  await expect(await editor.request("/api/cms/publication", "POST", { revision: 1, draftIds: saved.draftIds, review: preview.review }), 202);
  assert.equal(h.alarms(), 1);
  assert.deepEqual(await h.workspace.get(owner), original);
});

for (const action of ["logout", "disable", "role-change"]) {
  test("a request in flight cannot write after " + action, async () => {
    const h = await harness();
    const editor = await h.login(member);
    let enter, release;
    const started = new Promise((resolve) => { enter = resolve; });
    const resume = new Promise((resolve) => { release = resolve; });
    h.admin.cmsSnapshot = async () => { enter(); await resume; return snapshot; };
    const pending = editor.request("/api/cms/draft/bulk", "PUT", bulk);
    await started;
    try {
      if (action === "logout") await expect(await editor.request("/auth/logout", "POST", {}), 200);
      else await h.store.put(editor.memberKey, await seal({ ...member, revision: "r2", ...(action === "disable" ? { disabled: true } : { role: "viewer" }) }, h.key));
    } finally { release(); }
    await expect(await pending, 401, "login_required");
    assert.equal(await h.workspace.get(owner), null);
    assert.equal(h.alarms(), 0);
  });
}

test("bulk edits cannot hide a song archive with public children or a product with public offers", async () => {
  const original = JSON.stringify(fixture);
  const cases = [
    ["karaoke", fixture.karaoke.karaokes[0].id],
    ["product", fixture.goods.products[0].id],
    ["campaign", fixture.goods.campaigns[0].id],
  ];
  for (const [entity, id] of cases)
    await assert.rejects(prepareBulkDrafts(snapshot, member, { sha, entity, ids: [id], field: "visibility", value: "draft" }), /validation/);
  assert.equal(JSON.stringify(fixture), original);
});

test("an empty song archive can be bulk-staged and reconstructed using the normal edit form", async () => {
  const record = fixture.karaoke.karaokes.find((row) => row.setlistStatus === "unreviewed" &&
    !fixture.karaoke.performances.some((performance) => performance.karaokeId === row.id));
  assert.ok(record);
  const batch = await prepareBulkDrafts(snapshot, member, { sha, entity: "karaoke", ids: [record.id], field: "visibility", value: "draft" });
  const group = draftGroups(batch.operations).get(batch.draftIds[0]);
  const input = draftInput({ operations: group });
  assert.deepEqual(input.setlist, []);
  const [rebuilt] = await prepareDraft(snapshot, member, input);
  assert.deepEqual(rebuilt.value, { ...record, visibility: "draft" });
  const { plan } = await publicationPlan(snapshot, { id: "bulk-archive", owner, createdAt: "2026-11-25T00:00:00Z", operations: batch.operations }, member);
  assert.equal(plan.files.karaoke.karaokes.find((row) => row.id === record.id).visibility, "draft");
});
