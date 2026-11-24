import test from "node:test";
import assert from "node:assert/strict";
import { CmsJobs } from "../src/cms-jobs.mjs";
import { b64 } from "../src/security.mjs";

function harness() {
  const rows = new Map();
  const faults = { rejectIndex: false };
  const admin = {
    env: { SESSION_KEY: b64(new Uint8Array(32)) },
    store: {
      get: async (key) => rows.get(key),
      put: async (key, value) => {
        if (faults.rejectIndex && key === "cms-publication:editor") throw Error("interrupted index write");
        rows.set(key, value);
      },
    },
    atomic: (callback) => callback(),
    state: { storage: { setAlarm: async () => {} } },
  };
  return { admin, faults };
}

test("a restart repairs a terminal owner index from the authoritative journal", async () => {
  const { admin, faults } = harness();
  const job = { id: "one", owner: "editor", createdAt: "2026-11-24T00:00:00Z" };
  await new CmsJobs(admin).report({ ...job, phase: "checking" });
  faults.rejectIndex = true;
  await assert.rejects(new CmsJobs(admin).report({ ...job, phase: "unconfirmed" }), /interrupted/);
  faults.rejectIndex = false;
  const restarted = new CmsJobs(admin);
  assert.equal((await restarted.status(job.owner)).phase, "unconfirmed");
  await restarted.alarm();
  assert.equal((await restarted.get("cms-publication:editor")).phase, "unconfirmed");
});

test("draft cleanup keeps related operations together when one was edited in flight", async () => {
  const { admin } = harness();
  const jobs = new CmsJobs(admin);
  const operation = (key, entity, value) => ({ key, entity, baseCommit: "main", before: null, value });
  const product = operation("cms-product", "product", { title: "品物" });
  const offer = operation("cms-sale", "offer", { productId: "@cms-product", url: "https://example.com/a" });
  const event = operation("cms-event", "event", { title: "イベント" });
  const saved = await jobs.workspace.save("editor", { protocol: 1, revision: 0, operations: [product, offer, event] });
  await jobs.workspace.save("editor", { protocol: 1, revision: 1, operations: [
    product, { ...offer, value: { ...offer.value, url: "https://example.com/b" } }, event,
  ] });
  await jobs.clearAppliedDrafts({ owner: "editor", operations: saved.operations });
  const restored = await jobs.workspace.get("editor");
  assert.deepEqual(restored.operations.map(({ key }) => key), ["cms-product", "cms-sale"]);
  assert.equal(restored.operations[1].value.url, "https://example.com/b");

  // A later publication can replace the status index, but cannot turn the
  // retained temporary product into a new product again.
  await jobs.report({ id: "unrelated", owner: "editor", phase: "published" });
  const restarted = new CmsJobs(admin);
  await assert.rejects(restarted.enqueue({ id: "editor" }, {
    draftIds: ["legacy-product"], revision: restored.revision, retry: true,
  }), /cms_draft_already_applied/);
  const fixed = (op, id, value) => ({ ...op, id, before: { ...value, id }, value: { ...value, id } });
  const recovered = await restarted.workspace.save("editor", {
    protocol: 1, revision: restored.revision, operations: [
      fixed(product, "product-000001", product.value),
      fixed(offer, "offer-000001", { ...offer.value, productId: "product-000001" }),
    ],
  });
  restarted.requireGrant = async () => ({ role: "editor", directPublish: true });
  assert.equal((await restarted.enqueue({ id: "editor" }, {
    draftIds: ["legacy-product"], revision: recovered.revision,
  })).phase, "queued");
  await restarted.markRecovered("editor", "wrong-workspace", "legacy-product");
  assert.deepEqual((await restarted.get("cms-publication-replay:editor")).draftIds, ["legacy-product"]);
  await restarted.markRecovered("editor", restored.workspaceId, "legacy-product");
  assert.deepEqual((await restarted.get("cms-publication-replay:editor")).draftIds, []);
});

test("manual reconciliation only accepts positive main and Pages evidence for the job owner", async () => {
  const { admin } = harness();
  const sha = "a".repeat(40);
  const head = "b".repeat(40);
  let deployed = "";
  let included = false;
  let reads = 0;
  admin.transport = async (url, options) => {
    reads++;
    assert.equal(options.method || "GET", "GET");
    assert.equal(new Headers(options.headers).has("Authorization"), false);
    if (url.endsWith("/heads/main")) return Response.json({ object: { sha: head } });
    if (url.endsWith("/compare/" + sha + "..." + head)) {
      return Response.json({ status: included ? "ahead" : "diverged", merge_base_commit: { sha } });
    }
    assert.equal(url, "https://www.jigdule.jp/published-commit.txt");
    return new Response(deployed);
  };
  const jobs = new CmsJobs(admin);
  const createdRecords = [{ key: "cms-product", entity: "product", id: "product-000001" }];
  const job = { id: "one", owner: "editor", commit: sha, phase: "unconfirmed", operations: [], createdRecords };
  await assert.rejects(jobs.reconcile({ id: "editor" }), /cms_publication_missing/);
  await jobs.report(job);
  await assert.rejects(jobs.reconcile({ id: "other" }, job.id), /cms_publication_missing/);
  assert.equal(reads, 0);
  const uncertain = await jobs.reconcile({ id: "editor" }, job.id);
  assert.equal(uncertain.mainConfirmed, false);
  assert.equal(uncertain.createdRecords, undefined);
  assert.equal(await jobs.confirmedJob("editor", job.id), null);
  assert.equal(reads, 2);
  await assert.rejects(jobs.reconcile({ id: "editor" }, job.id), /cms_publication_reconcile_wait/);

  const get = admin.store.get;
  admin.store.get = (key) => key.startsWith("cms-publication-reconcile:") ? null : get(key);
  included = true;
  const confirmed = await jobs.reconcile({ id: "editor" }, job.id);
  assert.equal(confirmed.mainConfirmed, true);
  assert.deepEqual(confirmed.createdRecords, createdRecords);
  assert.equal((await jobs.confirmedJob("editor", job.id)).commit, sha);
  assert.equal(await jobs.confirmedJob("other", job.id), null);
  assert.equal(confirmed.phase, "unconfirmed");
  deployed = head;
  assert.equal((await jobs.reconcile({ id: "editor" }, job.id)).phase, "published");
  assert.equal((await jobs.status(job.owner)).phase, "published");
});
