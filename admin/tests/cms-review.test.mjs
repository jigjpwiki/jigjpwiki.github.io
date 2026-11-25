import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../../tests/fixtures/admin-vnext-baseline.json" with { type: "json" };
import { prepareDraft, writeDraft } from "../src/cms-draft.mjs";
import { publicationReview, assertPublicationReview } from "../src/cms-review.mjs";
import { random } from "../src/security.mjs";

test("publication review describes the validated changes and binds confirmation to actor, draft and main", async () => {
  const owner = "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026";
  const member = { role: "editor", contentPolicy: "all-content-v1", directPublish: true };
  const snapshot = { sha: "a".repeat(40), models: fixture };
  const batch = writeDraft([], undefined, await prepareDraft(snapshot, member, {
    entity: "event", organization: "org-000003", sha: snapshot.sha, title: "公開前に確認する催し",
    venue: "", summary: "説明", announcementUrl: "https://example.com/event",
  }));
  const workspace = { revision: 3, operations: batch.operations };
  const key = random();
  const result = await publicationReview(snapshot, workspace, member, owner,
    { revision: 3, draftIds: [batch.id] }, key);
  assert.equal(result.sha, snapshot.sha);
  assert.equal(result.records[0].name, "公開前に確認する催し");
  assert.ok(result.records[0].changes.some(({ field, after }) => field === "title" && after === "公開前に確認する催し"));
  await assertPublicationReview(result.review, snapshot, workspace, owner, workspace.operations, key);
  await assert.rejects(assertPublicationReview(result.review, { ...snapshot, sha: "b".repeat(40) },
    workspace, owner, workspace.operations, key), /cms_review_stale/);
  await assert.rejects(assertPublicationReview(result.review, snapshot, { ...workspace, revision: 4 },
    owner, workspace.operations, key), /cms_review_stale/);
  await assert.rejects(assertPublicationReview(result.review, snapshot, workspace, owner,
    [{ ...workspace.operations[0], value: { ...workspace.operations[0].value, title: "差し替え" } }], key), /cms_review_stale/);
  await assert.rejects(assertPublicationReview(result.review, snapshot, workspace, "another", workspace.operations, key), /cms_review_stale/);
  await assert.rejects(publicationReview(snapshot, workspace, { ...member, role: "viewer" }, owner,
    { revision: 3, draftIds: [batch.id] }, key), /cms_scope_denied/);
});

test("common policy jobs refuse missing or obsolete review before queuing publication", async () => {
  const { CmsJobs } = await import("../src/cms-jobs.mjs");
  const { WorkspaceStore } = await import("../src/workspace.mjs");
  const { seal } = await import("../src/security.mjs");
  const owner = "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026";
  const member = { id: owner, revision: "r1", role: "editor", contentPolicy: "all-content-v1", directPublish: true };
  const snapshot = { sha: "a".repeat(40), models: fixture };
  const key = random();
  const rows = new Map();
  const store = { get: async (name) => rows.get(name), put: async (name, value) => rows.set(name, value) };
  await store.put("member:test", await seal(member, key));
  const workspace = new WorkspaceStore(store, key);
  const batch = writeDraft([], undefined, await prepareDraft(snapshot, member, {
    entity: "event", organization: "org-000003", sha: snapshot.sha, title: "確認済みの催し",
    venue: "", summary: "説明", announcementUrl: "https://example.com/event",
  }));
  const saved = await workspace.save(owner, { protocol: 1, revision: 0, operations: batch.operations });
  const checked = await publicationReview(snapshot, saved, member, owner,
    { revision: saved.revision, draftIds: [batch.id] }, key);
  let alarms = 0;
  let main = snapshot;
  const jobs = new CmsJobs({
    store, env: { SESSION_KEY: key, ADMIN_ENABLED: "true", GOOGLE_AUTH_ENABLED: "true",
      GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_ADMIN_ORIGIN: "https://admin.test",
      CMS_PUBLISH_ENABLED: "true", CMS_GITHUB_APP_ID: "1", CMS_GITHUB_INSTALLATION_ID: "2", CMS_GITHUB_APP_KEY: "key" },
    state: { storage: { setAlarm: async () => { alarms++; } } },
    cmsSnapshot: async () => main, atomic: async (fn) => fn(),
  });
  const session = { id: owner, memberKey: "member:test", revision: "r1" };
  const input = { draftIds: [batch.id], revision: saved.revision };
  await assert.rejects(jobs.enqueue(session, input), /cms_review_required/);
  assert.equal(alarms, 0);
  main = { ...snapshot, sha: "b".repeat(40) };
  await assert.rejects(jobs.enqueue(session, { ...input, review: checked.review }), /cms_review_stale/);
  assert.equal(alarms, 0);
  main = snapshot;
  assert.equal((await jobs.enqueue(session, { ...input, review: checked.review })).phase, "queued");
  assert.equal(alarms, 1);
});
