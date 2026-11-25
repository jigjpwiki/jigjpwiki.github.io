import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../../tests/fixtures/admin-vnext-baseline.json" with { type: "json" };
import { prepareDraft, writeDraft } from "../src/cms-draft.mjs";
import { CmsJobs } from "../src/cms-jobs.mjs";
import { seal } from "../src/security.mjs";
import { publicationPlan, promoteCandidate } from "../src/cms-publish.mjs";

const sha = "a".repeat(40), candidate = "b".repeat(40), next = "c".repeat(40);
const owner = "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026";
const member = { id: owner, revision: "r1", role: "editor", directPublish: true,
  scope: { organizations: ["org-000003"], categories: ["events"] } };
const snapshot = { sha, tree: "mock-tree", models: fixture };

async function operations() {
  return writeDraft([], undefined, await prepareDraft(snapshot, member, {
    entity: "event", organization: "org-000003", sha, title: "公開試験",
    venue: "", summary: "説明", announcementUrl: "https://example.com/event",
  })).operations;
}

test("publication plan includes exact base and opaque actor in the same commit", async () => {
  const job = { id: "test", owner, createdAt: "2026-11-24T00:00:00Z", operations: await operations() };
  const { plan, batchId } = await publicationPlan(snapshot, job, member);
  assert.equal(plan.sha, sha);
  assert.equal(plan.files.events.events.at(-1).title, "公開試験");
  assert.match(plan.files["audit:" + batchId].actor, /^900\d{39}$/);
  await assert.rejects(publicationPlan(snapshot, job, { ...member, directPublish: false }), /cms_scope_denied/);
});

test("job checks exact candidate, renews stale base, then waits for actual Pages marker", async () => {
  const rows = new Map();
  const { b64 } = await import("../src/security.mjs");
  const env = { SESSION_KEY: b64(new Uint8Array(32)), ADMIN_ENABLED: "true",
    GOOGLE_AUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret",
    GOOGLE_ADMIN_ORIGIN: "https://example.com", CMS_PUBLISH_ENABLED: "true",
    CMS_GITHUB_APP_ID: "1", CMS_GITHUB_INSTALLATION_ID: "2", CMS_GITHUB_APP_KEY: "mock" };
  const store = { get: async (key) => rows.get(key), put: async (key, value) => rows.set(key, value) };
  await store.put("member:test", await seal(member, env.SESSION_KEY));
  let deployed = "", main = sha, success = false, patches = 0;
  const jobs = new CmsJobs({ env, store, atomic: (fn) => fn(),
    transport: async () => new Response(deployed) });
  const job = { id: "test", memberKey: "member:test", grant: "r1", owner,
    createdAt: "2026-11-24T00:00:00Z", operations: await operations(), phase: "queued" };
  const github = {
    snapshot: async () => ({ ...snapshot, sha: main }),
    async publish(plan, key, state, save, options) {
      assert.equal(options.candidateOnly, true);
      assert.equal(plan.sha, main);
      state.commit = candidate;
      await save(state);
    },
    async call(path, method, body) {
      if (path.includes("/actions/")) return { workflow_runs: [
        { head_sha: "wrong", head_branch: job.branch, event: "push", status: "completed", conclusion: "success" },
        ...(success ? [{ head_sha: candidate, head_branch: job.branch, event: "push", status: "completed", conclusion: "success" }] : []),
      ] };
      if (path.endsWith("/git/ref/heads/main")) return { object: { sha: main } };
      if (path.endsWith("/git/commits/" + candidate)) return { parents: [{ sha: main }] };
      assert.equal(method, "PATCH");
      assert.deepEqual(body, { sha: candidate, force: false });
      patches++;
      main = candidate;
    },
  };
  await jobs.step(job, github);
  assert.equal(job.phase, "checking");
  await jobs.step(job, github);
  assert.equal(patches, 0);
  main = next;
  success = true;
  await jobs.step(job, github);
  assert.equal(job.phase, "queued");
  assert.equal(patches, 0);
  await jobs.step(job, github);
  await jobs.step(job, github);
  assert.equal(job.phase, "pages");
  await jobs.step(job, github);
  assert.equal(job.phase, "pages");
  deployed = candidate;
  await jobs.step(job, github);
  assert.equal(job.phase, "published");
  assert.equal(patches, 1);
});

test("promotion refuses revoked grants before main write", async () => {
  const github = { call: async (path, method) => {
    assert.notEqual(method, "PATCH");
    return path.includes("/commits/") ? { parents: [{ sha }] } : { object: { sha } };
  } };
  await assert.rejects(promoteCandidate(github, { base: sha, commit: candidate, phase: "checking" },
    async () => { throw Error("revoked"); }, () => assert.fail("promotion intent")), /revoked/);
});

test("an interrupted queue handoff does not run the same job twice", async () => {
  const { b64 } = await import("../src/security.mjs");
  const rows = new Map();
  const admin = {
    env: { SESSION_KEY: b64(new Uint8Array(32)) },
    store: { get: async (key) => rows.get(key), put: async (key, value) => rows.set(key, value) },
    atomic: (fn) => fn(),
    state: { storage: { setAlarm: async () => {} } },
  };
  const first = { id: "first", owner: "one", phase: "failed", createdAt: "2001-01-01T00:00:00Z" };
  const second = { ...first, id: "second", owner: "two", phase: "queued" };
  const jobs = new CmsJobs(admin);
  await jobs.report(first);
  await jobs.put("cms-publication-queue", [{ ...first, phase: "queued" }, second]);
  const restarted = new CmsJobs(admin);
  await restarted.alarm();
  assert.equal((await restarted.status("one")).id, first.id);
  assert.equal((await restarted.status("two")).error, "cms_publication_timeout");
  assert.deepEqual(await restarted.get("cms-publication-queue"), []);
});

test("common policy editor publishes across organizations while viewer and missing publish grant fail", async () => {
  const editor = { ...member, contentPolicy: "all-content-v1", scope: {} };
  const draft = await prepareDraft(snapshot, editor, {
    entity: "event", organization: "org-000001", sha, title: "全範囲の編集",
    venue: "", summary: "説明", announcementUrl: "https://example.com/common-policy",
  });
  const job = { id: "common-policy-test", owner, createdAt: "2026-11-25T00:00:00Z",
    operations: writeDraft([], undefined, draft).operations };
  const { plan } = await publicationPlan(snapshot, job, editor);
  assert.equal(plan.files.events.events.at(-1).title, "全範囲の編集");
  assert.equal(editor.owner, undefined);
  await assert.rejects(publicationPlan(snapshot, job, { ...editor, role: "viewer" }), /cms_scope_denied/);
  await assert.rejects(publicationPlan(snapshot, job, { ...editor, directPublish: false }), /cms_scope_denied/);
});
