import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../../tests/fixtures/admin-vnext-baseline.json" with { type: "json" };
import { Admin } from "../src/worker.mjs";
import { CmsJobs } from "../src/cms-jobs.mjs";
import { prepareDraft, writeDraft } from "../src/cms-draft.mjs";
import { publicationPlan } from "../src/cms-publish.mjs";
import { random, seal } from "../src/security.mjs";
import { WorkspaceStore } from "../src/workspace.mjs";

for (const overlapping of [false, true]) {
  test(overlapping ? "Worker recovery retains overlapping edits for explicit conflict resolution"
    : "Worker restores fixed IDs while retaining later edits and rejecting stale revisions", async () => {
    const id = "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026";
    const sid = random(), secret = random(), csrf = "reapply-test";
    const origin = "https://admin.test", memberKey = "member:fixture";
    const member = { id, revision: "1", role: "editor", directPublish: true,
      scope: { organizations: ["org-000003"], categories: ["events"] } };
    const rows = new Map();
    const store = {
      get: async (name) => rows.get(name),
      put: async (name, value) => rows.set(name, value),
    };
    await store.put(memberKey, await seal(member, secret));
    await store.put("session:" + sid, { id, csrf, provider: "google", memberKey, revision: member.revision,
      expires: Date.now() + 60_000 });
    const admin = new Admin({}, { ADMIN_USER_IDS: "1", GITHUB_CLIENT_ID: "fixture", GITHUB_CLIENT_SECRET: "fixture", SESSION_KEY: secret, GOOGLE_AUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "fixture",
      GOOGLE_CLIENT_SECRET: "fixture", GOOGLE_ADMIN_ORIGIN: origin, __testStore: store });
    const baseline = { sha: "a".repeat(40), models: fixture };
    const fields = { sha: baseline.sha, entity: "event", organization: "org-000003", title: "試験イベント",
      announcementUrl: "https://example.com/reapply-test", summary: "試験概要", venue: "元の会場" };
    const { id: draftId, operations } = writeDraft([], undefined, await prepareDraft(baseline, member, fields));
    const job = { id: "publication", owner: id, commit: "b".repeat(40), mainConfirmed: true, phase: "published",
      createdAt: "2026-11-24T00:00:00Z", operations };
    const { plan } = await publicationPlan(baseline, job, member);
    job.createdRecords = plan.impact.records.filter((row) => row.action === "create")
      .map(({ key, entity, id: fixedId }) => ({ key, entity, id: fixedId }));
    const published = { sha: job.commit, models: { ...fixture, ...plan.files } };
    const latest = { sha: "c".repeat(40), models: structuredClone(published.models) };
    const fixedId = job.createdRecords[0].id;
    const latestEvent = latest.models.events.events.find((event) => event.id === fixedId);
    latestEvent.venue = "別の編集者による会場変更";
    if (overlapping) latestEvent.title = "後から更新された名前";
    admin.cmsSnapshot = async ({ revision } = {}) => revision === job.commit ? published : latest;
    const jobs = new CmsJobs(admin);
    await jobs.report(job);
    const workspace = new WorkspaceStore(store, secret);
    const changed = operations.map((op) => ({ ...op, value: { ...op.value, title: "公開中に修正した名前" } }));
    const saved = await workspace.save(id, { protocol: 1, revision: 0, operations: changed });
    await jobs.clearAppliedDrafts(job);
    // A later publication must not remove the old draft's recovery route.
    await jobs.report({ id: "later-job", owner: id, phase: "published", mainConfirmed: true,
      commit: "d".repeat(40), operations: [] });
    const draftList = await admin.fetch(new Request(origin + "/api/cms/draft", {
      headers: { Cookie: "__Host-admin-session=" + sid },
    }));
    assert.equal(draftList.status, 200, await draftList.clone().text());
    assert.equal((await draftList.json()).drafts.find((row) => row.draftId === draftId).reapplyJobId, job.id);
    const reapply = (revision) => admin.fetch(new Request(origin + "/api/cms/publication/reapply", {
      method: "POST",
      headers: { Cookie: "__Host-admin-session=" + sid, Origin: origin, "X-CSRF-Token": csrf,
        "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, draftId, revision }),
    }));
    assert.equal((await reapply(0)).status, 409);
    const response = await reapply(saved.revision);
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal((await response.json()).needsResolution, overlapping);
    assert.equal((await reapply(saved.revision)).status, 409);
    const restored = await workspace.get(id);
    const op = restored.operations[0];
    assert.equal(op.id, fixedId);
    assert.equal(op.baseCommit, job.commit);
    assert.equal(op.before.title, fields.title);
    if (overlapping) {
      await assert.rejects(publicationPlan(latest, { ...job, operations: restored.operations }, member), /cms_publish_conflict/);
      const url = origin + "/api/cms/draft/conflicts";
      const headers = { Cookie: "__Host-admin-session=" + sid, Origin: origin, "X-CSRF-Token": csrf, "Content-Type": "application/json" };
      const preview = await admin.fetch(new Request(url + "?draftId=" + draftId, { headers }));
      assert.equal(preview.status, 200);
      const { conflicts, revision, sha } = await preview.json();
      assert.deepEqual(conflicts.map(({ field, theirs }) => [field, theirs]), [["/title", latestEvent.title]]);
      const resolved = await admin.fetch(new Request(url, {
        method: "PUT", headers, body: JSON.stringify({ draftId, revision, sha, choices: ["ours"] }),
      }));
      assert.equal(resolved.status, 200, await resolved.clone().text());
    }
    const followup = await publicationPlan(latest, { ...job, operations: (await workspace.get(id)).operations }, member);
    const final = followup.plan.files.events.events.find((event) => event.id === fixedId);
    assert.equal(final.title, "公開中に修正した名前");
    assert.equal(final.venue, "別の編集者による会場変更");
  });
}
